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
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch
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
  await renderHouseholdHome(user, householdSnap.data(), householdId);
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

async function renderHouseholdHome(user, household, householdId) {
  appRoot.innerHTML = `
    <section class="dashboard-panel">
      <div class="dashboard-heading">
        <div><p class="eyebrow">Your household</p><h1 id="household-title"></h1>
          <p class="welcome-copy">Manage the children in your household. Gift lists will be connected to each child profile.</p></div>
        <button class="secondary-button sign-out-button" id="sign-out" type="button">Sign out</button>
      </div>
      <section class="children-section" aria-labelledby="children-heading">
        <h2 id="children-heading">Children</h2>
        <p class="section-copy">Add each child once. You can update their details later.</p>
        <form id="child-form" class="child-form">
          <div class="field-group"><label for="child-name">Child's name</label>
            <input id="child-name" name="name" maxlength="60" autocomplete="off" placeholder="Name" required></div>
          <div class="field-group"><label for="child-birthday">Birthday <span class="optional-label">(optional)</span></label>
            <input id="child-birthday" name="birthday" type="date"></div>
          <button class="primary-button" id="add-child" type="submit">Add child</button>
        </form>
        <p id="children-message" class="auth-message" role="status" aria-live="polite" hidden></p>
        <div id="children-list" class="children-list" aria-live="polite"><p class="empty-state">Loading children…</p></div>
      </section>
      <div class="account-details"><span class="detail-label">Signed in as</span><span id="account-email"></span></div>
    </section>`;
  document.querySelector("#household-title").textContent = household.name;
  document.querySelector("#account-email").textContent = user.email || "";
  document.querySelector("#sign-out").addEventListener("click", () => signOut(auth));
  const childForm = document.querySelector("#child-form");
  const addButton = document.querySelector("#add-child");
  const childList = document.querySelector("#children-list");
  const childMessage = document.querySelector("#children-message");
  function showChildMessage(message, kind = "info") {
    childMessage.textContent = message; childMessage.dataset.kind = kind; childMessage.hidden = false;
  }
  async function loadChildren() {
    childList.innerHTML = '<p class="empty-state">Loading children…</p>';
    try {
      const snapshot = await getDocs(query(collection(db, "households", householdId, "children"), orderBy("sortOrder", "asc")));
      const children = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      const active = children.filter(child => child.active !== false);
      if (!active.length) { childList.innerHTML = '<p class="empty-state">No children added yet.</p>'; return; }
      childList.innerHTML = active.map(child => `
        <article class="child-card"><div class="child-card-main">
          <h3>${escapeHtml(child.name || "Child")}</h3>
          <p>${child.birthday ? "Birthday: " + escapeHtml(formatBirthday(child.birthday)) : "Birthday not added"}</p>
        </div><button class="text-button deactivate-child" type="button" data-child-id="${escapeHtml(child.id)}">Remove</button></article>`).join("");
      childList.querySelectorAll(".deactivate-child").forEach(button => button.addEventListener("click", async () => {
        const child = children.find(item => item.id === button.dataset.childId);
        if (!child || !confirm(`Remove ${child.name} from the active children list? Their records will be kept.`)) return;
        button.disabled = true;
        try {
          await updateDoc(doc(db, "households", householdId, "children", child.id), { active: false, updatedAt: serverTimestamp() });
          await loadChildren();
        } catch (error) { showChildMessage(friendlyError(error), "error"); button.disabled = false; }
      }));
    } catch (error) { childList.innerHTML = ""; showChildMessage(friendlyError(error), "error"); }
  }
  childForm.addEventListener("submit", async event => {
    event.preventDefault();
    const name = childForm.elements.name.value.trim();
    const birthday = childForm.elements.birthday.value;
    if (!name) return;
    addButton.disabled = true; addButton.textContent = "Adding…";
    try {
      const current = await getDocs(collection(db, "households", householdId, "children"));
      await addDoc(collection(db, "households", householdId, "children"), {
        name, displayName: name, birthday: birthday || null, active: true,
        sortOrder: current.size * 100, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
      childForm.reset(); childMessage.hidden = true; await loadChildren();
    } catch (error) { showChildMessage(friendlyError(error), "error"); }
    finally { addButton.disabled = false; addButton.textContent = "Add child"; }
  });
  await loadChildren(); setStatus("Signed in");
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
function formatBirthday(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

onAuthStateChanged(auth, user => {
  if (user) renderSignedIn(user);
  else renderSignedOut();
});
