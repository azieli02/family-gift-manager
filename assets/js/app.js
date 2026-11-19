import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const firebaseApp = initializeApp(firebaseConfig);
export const auth = (await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js")).getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);

const status = document.querySelector("#connection-status");
const appRoot = document.querySelector("#app");

function setStatus(message) {
  if (status) status.textContent = message;
}

function showMessage(message, kind = "info") {
  const el = document.querySelector("#auth-message");
  if (!el) return;
  el.textContent = message;
  el.dataset.kind = kind;
  el.hidden = false;
}

function friendlyAuthError(error) {
  const messages = {
    "auth/email-already-in-use": "That email already has an account. Try signing in instead.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Choose a password with at least 6 characters.",
    "auth/invalid-credential": "Email or password wasn't recognized.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/too-many-requests": "Too many attempts. Wait a little and try again.",
    "auth/network-request-failed": "Network error. Check your connection and try again."
  };
  return messages[error.code] || "Something went wrong. Please try again.";
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
    </section>
  `;

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
    const email = form.email.value.trim();
    const pass = form.password.value;
    submit.disabled = true;
    submit.textContent = mode === "signin" ? "Signing in…" : "Creating account…";
    try {
      if (mode === "signin") {
        await signInWithEmailAndPassword(auth, email, pass);
      } else {
        await createUserWithEmailAndPassword(auth, email, pass);
      }
    } catch (error) {
      showMessage(friendlyAuthError(error), "error");
      submit.disabled = false;
      submit.textContent = mode === "signin" ? "Sign in" : "Create account";
    }
  });

  reset.addEventListener("click", async () => {
    const email = form.email.value.trim();
    if (!email) {
      showMessage("Enter your email address first, then choose Forgot password.", "error");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      showMessage("Password reset email sent. Check your inbox.", "success");
    } catch (error) {
      showMessage(friendlyAuthError(error), "error");
    }
  });

  setStatus("Signed out");
}

function renderSignedIn(user) {
  const safeEmail = user.email || "No email address";
  appRoot.innerHTML = `
    <section class="auth-panel">
      <p class="eyebrow">Signed in</p>
      <h1>You're in.</h1>
      <p class="welcome-copy">Signed in as <strong id="account-email"></strong>.</p>
      <div class="setup-note">
        <strong>Household setup is the next step</strong>
        <p>Your account is ready. Household data access will be enabled only after an owner adds your account as an active household member.</p>
      </div>
      <div class="account-details">
        <span class="detail-label">Account ID</span>
        <code id="account-uid"></code>
        <button class="text-button" id="copy-uid" type="button">Copy account ID</button>
      </div>
      <button class="secondary-button" id="sign-out" type="button">Sign out</button>
    </section>
  `;
  document.querySelector("#account-email").textContent = safeEmail;
  document.querySelector("#account-uid").textContent = user.uid;
  document.querySelector("#copy-uid").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(user.uid);
      document.querySelector("#copy-uid").textContent = "Copied";
    } catch {
      document.querySelector("#copy-uid").textContent = "Select the ID above to copy";
    }
  });
  document.querySelector("#sign-out").addEventListener("click", () => signOut(auth));
  setStatus("Signed in");
}

onAuthStateChanged(auth, user => {
  if (user) renderSignedIn(user);
  else renderSignedOut();
});
