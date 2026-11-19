import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getFirestore,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);

const status = document.querySelector("#connection-status");
const appRoot = document.querySelector("#app");

function setStatus(message) {
  if (status) status.textContent = message;
}
function showMessage(message, kind = "info") {
  const el = document.querySelector("#auth-message, #setup-message");
  if (!el) return;
  el.textContent = message;
  el.dataset.kind = kind;
  el.hidden = false;
}
function friendlyError(error) {
  const messages = {
    "auth/email-already-in-use": "That email already has an account. Sign in instead.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Choose a password with at least 6 characters.",
    "auth/invalid-credential": "Email or password wasn't recognized.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/too-many-requests": "Too many attempts. Wait a little and try again.",
    "auth/network-request-failed": "Network error. Check your connection and try again.",
    "permission-denied": "Firebase blocked that action. The security rules may need to be deployed or updated."
  };
  return messages[error.code] || error.message || "Something went wrong. Please try again.";
}

function renderSignedOut() {
  appRoot.innerHTML = `
    <section class="auth-panel">
      <p class="eyebrow">Welcome</p>
      <h1>Family Gift Manager</h1>
      <p class="welcome-copy">Sign in to manage your family's gifts and wishlists.</p>
      <div class="auth-tabs" role="tablist" aria-label="Account options">
        <button class="tab-button active" type="button" data-mode="signin" role="tab" aria-selected="true">Sign in</button>
        <button class="tab-button" type="button" data-mode="signup" role="tab" aria-selected="false">Create account</button>
      </div>
      <form id="auth-form" class="auth-form">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="email" required>
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" minlength="6" required>
        <button class="primary-button" id="submit-auth" type="submit">Sign in</button>
      </form>
      <button class="text-button" id="reset-password" type="button">Forgot password?</button>
      <p id="auth-message" class="auth-message" role="status" aria-live="polite" hidden></p>
    </section>`;

  let mode = "signin";
  const form = document.querySelector("#auth-form");
  const password = document.querySelector("#password");
  const submit = document.querySelector("#submit-auth");
  const reset = document.querySelector("#reset-password");
  document.querySelectorAll("[data-mode]").forEach(button => {
    button.addEventListener("click", () => {
      mode = button.dataset.mode;
      document.querySelectorAll("[data-mode]").forEach(tab => {
        const selected = tab.dataset.mode === mode;
        tab.classList.toggle("active", selected);
        tab.setAttribute("aria-selected", String(selected));
      });
      submit.textContent = mode === "signin" ? "Sign in" : "Create account";
      password.autocomplete = mode === "signin" ? "current-password" : "new-password";
      reset.hidden = mode !== "signin";
      document.querySelector("#auth-message").hidden = true;
    });
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    submit.disabled = true;
    submit.textContent = mode === "signin" ? "Signing in…" : "Creating account…";
    try {
      const email = form.email.value.trim();
      const pass = form.password.value;
      if (mode === "signin") await signInWithEmailAndPassword(auth, email, pass);
      else await createUserWithEmailAndPassword(auth, email, pass);
    } catch (error) {
      showMessage(friendlyError(error), "error");
      submit.disabled = false;
      submit.textContent = mode === "signin" ? "Sign in" : "Create account";
    }
  });
  reset.addEventListener("click", async () => {
    const email = form.email.value.trim();
    if (!email) return showMessage("Enter your email address first.", "error");
    try {
      await sendPasswordResetEmail(auth, email);
      showMessage("Password reset email sent. Check your inbox.", "success");
    } catch (error) {
      showMessage(friendlyError(error), "error");
    }
  });
  setStatus("Signed out");
}

async function renderSignedIn(user) {
  setStatus("Signed in");
  const profileRef = doc(db, "users", user.uid);
  let profile;
  try {
    const profileSnap = await getDoc(profileRef);
    profile = profileSnap.exists() ? profileSnap.data() : null;
  } catch (error) {
    appRoot.innerHTML = `<section class="auth-panel"><h1>Couldn't load your account</h1><p class="welcome-copy" id="load-error"></p><button class="secondary-button" id="sign-out">Sign out</button></section>`;
    document.querySelector("#load-error").textContent = friendlyError(error);
    document.querySelector("#sign-out").addEventListener("click", () => signOut(auth));
    return;
  }

  if (!profile || !Array.isArray(profile.householdIds) || profile.householdIds.length === 0) {
    renderHouseholdSetup(user);
    return;
  }

  const householdId = profile.householdIds[0];
  let householdSnap;
  try {
    householdSnap = await getDoc(doc(db, "households", householdId));
  } catch (error) {
    appRoot.innerHTML = `<section class="auth-panel"><h1>Household unavailable</h1><p class="welcome-copy" id="load-error"></p><button class="secondary-button" id="sign-out">Sign out</button></section>`;
    document.querySelector("#load-error").textContent = friendlyError(error);
    document.querySelector("#sign-out").addEventListener("click", () => signOut(auth));
    return;
  }
  if (!householdSnap.exists()) {
    renderHouseholdSetup(user);
    return;
  }
  renderHouseholdHome(user, householdSnap.data(), householdId);
}

function renderHouseholdSetup(user) {
  appRoot.innerHTML = `
    <section class="auth-panel">
      <p class="eyebrow">First-time setup</p>
      <h1>Create your household</h1>
      <p class="welcome-copy">Give your private family space a name. You can add children and other parents next.</p>
      <form id="household-form" class="auth-form">
        <label for="household-name">Household name</label>
        <input id="household-name" name="householdName" maxlength="60" placeholder="e.g. Garrett Family" required>
        <button class="primary-button" id="create-household" type="submit">Create household</button>
      </form>
      <p id="setup-message" class="auth-message" role="status" aria-live="polite" hidden></p>
      <button class="text-button" id="setup-sign-out" type="button">Sign out</button>
    </section>`;
  document.querySelector("#setup-sign-out").addEventListener("click", () => signOut(auth));
  document.querySelector("#household-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = document.querySelector("#create-household");
    const name = document.querySelector("#household-name").value.trim();
    if (!name) return;
    button.disabled = true;
    button.textContent = "Creating…";
    const householdRef = doc(collection(db, "households"));
    const memberRef = doc(db, "households", householdRef.id, "members", user.uid);
    const userRef = doc(db, "users", user.uid);
    const batch = writeBatch(db);
    batch.set(householdRef, {
      name,
      timezone: "America/Detroit",
      ownerUid: user.uid,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    batch.set(memberRef, { role: "owner", active: true, joinedAt: serverTimestamp() });
    batch.set(userRef, { householdIds: [householdRef.id], createdAt: serverTimestamp() });
    try {
      await batch.commit();
    } catch (error) {
      showMessage(friendlyError(error), "error");
      button.disabled = false;
      button.textContent = "Create household";
    }
  });
  setStatus("Setup needed");
}

function renderHouseholdHome(user, household, householdId) {
  appRoot.innerHTML = `
    <section class="auth-panel">
      <p class="eyebrow">Your household</p>
      <h1 id="household-title"></h1>
      <p class="welcome-copy">Your private household space is set up.</p>
      <div class="setup-note">
        <strong>You're signed in as the owner.</strong>
        <p>Next we'll add your children and build the gift lists. Other families will have separate household spaces.</p>
      </div>
      <div class="account-details">
        <span class="detail-label">Signed in as</span><span id="account-email"></span>
        <span class="detail-label">Household ID</span><code id="household-id"></code>
      </div>
      <button class="secondary-button" id="sign-out" type="button">Sign out</button>
    </section>`;
  document.querySelector("#household-title").textContent = household.name;
  document.querySelector("#account-email").textContent = user.email || "";
  document.querySelector("#household-id").textContent = householdId;
  document.querySelector("#sign-out").addEventListener("click", () => signOut(auth));
}

onAuthStateChanged(auth, user => {
  if (user) renderSignedIn(user);
  else renderSignedOut();
});
