import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  deleteDoc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
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
        <p class="section-copy">Add each child once. You can archive a profile later without deleting its records.</p>
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
      <section class="children-section"><h2>Household gifts</h2><p class="section-copy">Shared gifts, separate from children's spending totals.</p><button class="secondary-button" id="open-house-gifts" type="button">Open household gifts</button><button class="secondary-button" id="open-recipient-gifts" type="button">Open gifts for other people</button><button class="secondary-button" id="open-inventory" type="button">Open unassigned gift inventory</button><button class="secondary-button" id="open-gift-givers" type="button">Manage wishlist gift-givers</button></section>
      <div class="account-details"><span class="detail-label">Signed in as</span><span id="account-email"></span></div>
    </section>`;
  document.querySelector("#household-title").textContent = household.name;
  document.querySelector("#account-email").textContent = user.email || "";
  document.querySelector("#open-house-gifts").addEventListener("click", () => renderHouseholdGifts(user, household, householdId));
  document.querySelector("#open-recipient-gifts").addEventListener("click", () => renderGiftRecipients(user, household, householdId));
  document.querySelector("#open-inventory").addEventListener("click", () => renderInventory(user, household, householdId));
  document.querySelector("#open-gift-givers").addEventListener("click", () => renderGiftGivers(user, household, householdId));
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
      const giftSnapshot = await getDocs(collection(db, "households", householdId, "gifts"));
      const spentByChild = {};
      giftSnapshot.docs.forEach(row => {
        const gift = row.data();
        if (gift.childId && gift.paidPriceCents != null) spentByChild[gift.childId] = (spentByChild[gift.childId] || 0) + Number(gift.paidPriceCents);
      });
      childList.innerHTML = active.map(child => `
        <article class="child-card"><div class="child-card-main">
          <h3>${escapeHtml(child.name || "Child")}</h3>
          <p>${child.birthday ? "Birthday: " + escapeHtml(formatBirthday(child.birthday)) : "Birthday not added"}</p>
          <p class="child-spent">Spent: ${formatMoney(spentByChild[child.id] || 0)}</p>
        </div><div class="child-card-actions">
          <button class="text-button open-gifts" type="button" data-child-id="${escapeHtml(child.id)}">Gift list</button>
          <button class="text-button open-wishlist" type="button" data-child-id="${escapeHtml(child.id)}">Wishlist</button>
          <button class="text-button edit-child" type="button" data-child-id="${escapeHtml(child.id)}">Edit</button>
          <button class="text-button deactivate-child" type="button" data-child-id="${escapeHtml(child.id)}">Remove</button>
        </div>
        <form class="child-edit-form" data-child-id="${escapeHtml(child.id)}" hidden>
          <div class="field-group"><label>Name</label><input name="name" maxlength="60" value="${escapeHtml(child.name || "")}" required></div>
          <div class="field-group"><label>Birthday (optional)</label><input name="birthday" type="date" value="${escapeHtml(child.birthday || "")}"></div>
          <div class="child-edit-actions"><button class="primary-button" type="submit">Save changes</button><button class="secondary-button cancel-edit" type="button">Cancel</button></div>
        </form></article>`).join("");
      childList.querySelectorAll(".open-gifts").forEach(button => button.addEventListener("click", () => {
        const child = children.find(item => item.id === button.dataset.childId);
        if (child) renderChildGiftList(user, household, householdId, child);
      }));
      childList.querySelectorAll(".open-wishlist").forEach(button => button.addEventListener("click", () => {
        const child = children.find(item => item.id === button.dataset.childId);
        if (child) renderChildWishlist(user, household, householdId, child);
      }));
      childList.querySelectorAll(".edit-child").forEach(button => button.addEventListener("click", () => {
        const form = childList.querySelector(`.child-edit-form[data-child-id="${button.dataset.childId}"]`);
        form.hidden = !form.hidden;
      }));
      childList.querySelectorAll(".child-edit-form").forEach(form => {
        form.querySelector(".cancel-edit").addEventListener("click", () => { form.hidden = true; });
        form.addEventListener("submit", async event => {
          event.preventDefault();
          const child = children.find(item => item.id === form.dataset.childId);
          const name = form.elements.name.value.trim();
          const birthday = form.elements.birthday.value;
          if (!child || !name) return;
          const save = form.querySelector('button[type="submit"]');
          save.disabled = true; save.textContent = "Saving…";
          try {
            await updateDoc(doc(db, "households", householdId, "children", child.id), {
              name, displayName: name, birthday: birthday || null, updatedAt: serverTimestamp()
            });
            await loadChildren();
            showChildMessage("Child profile updated.", "success");
          } catch (error) {
            showChildMessage(friendlyError(error), "error");
            save.disabled = false; save.textContent = "Save changes";
          }
        });
      });
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

async function renderHouseholdGifts(user, household, householdId) {
  const giftsRef = collection(db, "households", householdId, "gifts");
  const categoriesRef = collection(db, "households", householdId, "giftCategories");
  const statusesRef = collection(db, "households", householdId, "giftStatuses");
  const defaults = [
    [categoriesRef,[["undecided","Undecided","#e8e5dc"],["santa","Santa","#dce8df"],["stocking","Stocking","#f5e3d5"],["main","Main","#dce5f2"],["advent","Advent","#eee2f1"]]],
    [statusesRef,[["need-to-buy","Need to buy","#f5e3d5"],["bought","Bought","#dce5f2"],["wrapped","Wrapped","#dce8df"]]]
  ];
  for (const [ref, entries] of defaults) {
    const existing=await getDocs(ref);
    if(existing.empty){const batch=writeBatch(db);entries.forEach((e,i)=>batch.set(doc(ref,e[0]),{label:e[1],color:e[2],sortOrder:(i+1)*100,active:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));await batch.commit();}
  }
  appRoot.innerHTML=`
    <section class="dashboard-panel">
      <button class="text-button" id="back-household" type="button">← Household</button>
      <p class="eyebrow">Our Gifts</p><h1>Household gifts</h1>
      <p class="welcome-copy">Shared gifts are separate from children's gift lists and spending totals.</p>
      <form id="house-gift-form" class="gift-form">
        <div class="field-group"><label>Gift</label><input name="item" maxlength="120" required placeholder="Gift name"></div>
        <div class="field-group"><label>Category</label><select name="category" required></select></div>
        <div class="field-group"><label>Status</label><select name="status" required></select></div>
        <div class="field-group"><label>Paid price ($)</label><input name="paidPrice" type="number" min="0" step="0.01"></div>
        <div class="field-group"><label>Regular price ($)</label><input name="regularPrice" type="number" min="0" step="0.01"></div>
        <div class="field-group"><label>Store</label><input name="store" maxlength="100"></div>
        <div class="field-group"><label>Purchase date</label><input name="purchaseDate" type="date"></div>
        <div class="field-group"><label>Notes</label><textarea name="notes" rows="2"></textarea></div>
        <div class="form-actions"><button class="primary-button" id="save-house-gift" type="submit">Add gift</button><button class="secondary-button" id="cancel-house-gift" type="button" hidden>Cancel edit</button></div>
      </form>
      <p id="house-gift-message" class="auth-message" role="status" aria-live="polite" hidden></p>
      <div id="house-gift-list" class="gift-list"><p class="empty-state">Loading gifts…</p></div>
    </section>`;
  document.querySelector("#back-household").addEventListener("click",()=>renderHouseholdHome(user,household,householdId));
  const form=document.querySelector("#house-gift-form"),list=document.querySelector("#house-gift-list"),message=document.querySelector("#house-gift-message"),save=document.querySelector("#save-house-gift"),cancel=document.querySelector("#cancel-house-gift");
  let editingId=null;
  function notice(t,k="info"){message.textContent=t;message.dataset.kind=k;message.hidden=false;}
  function reset(){editingId=null;form.reset();save.textContent="Add gift";cancel.hidden=true;}
  cancel.addEventListener("click",reset);
  const [catSnap,statusSnap]=await Promise.all([getDocs(query(categoriesRef,orderBy("sortOrder","asc"))),getDocs(query(statusesRef,orderBy("sortOrder","asc")))]);
  const categories=catSnap.docs.map(x=>({id:x.id,...x.data()})).filter(x=>x.active!==false);
  const statuses=statusSnap.docs.map(x=>({id:x.id,...x.data()})).filter(x=>x.active!==false);
  form.elements.category.innerHTML=categories.map(x=>'<option>'+escapeHtml(x.label)+'</option>').join("");
  form.elements.status.innerHTML=statuses.map(x=>'<option>'+escapeHtml(x.label)+'</option>').join("");
  async function load(){
    const snap=await getDocs(giftsRef);
    const gifts=snap.docs.map(x=>({id:x.id,...x.data()})).filter(x=>x.giftType==="household").sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));
    if(!gifts.length){list.innerHTML='<p class="empty-state">No household gifts added yet.</p>';return;}
    list.innerHTML=gifts.map(g=>{
      const savings=g.paidPriceCents!=null&&g.regularPriceCents!=null?Number(g.regularPriceCents)-Number(g.paidPriceCents):null;
      return '<article class="gift-card"><div class="gift-card-top"><h3>'+escapeHtml(g.item)+'</h3><span class="gift-status">'+escapeHtml(g.status||"")+'</span></div><p><span class="gift-category-label">'+escapeHtml(g.category||"")+'</span>'+(g.store?' · '+escapeHtml(g.store):'')+'</p><div class="gift-prices"><span>Paid: '+(g.paidPriceCents==null?'—':formatMoney(g.paidPriceCents))+'</span><span>Regular: '+(g.regularPriceCents==null?'—':formatMoney(g.regularPriceCents))+'</span><span>Savings: '+(savings==null?'—':formatMoney(savings))+'</span></div>'+(g.purchaseDate?'<p class="gift-meta">Purchased: '+escapeHtml(formatBirthday(g.purchaseDate))+'</p>':'')+(g.notes?'<p class="gift-notes-text">'+escapeHtml(g.notes)+'</p>':'')+'<div class="gift-card-actions"><button class="text-button edit-house-gift" data-id="'+escapeHtml(g.id)+'" type="button">Edit</button><button class="text-button delete-house-gift" data-id="'+escapeHtml(g.id)+'" type="button">Delete</button></div></article>';
    }).join("");
    list.querySelectorAll(".edit-house-gift").forEach(b=>b.addEventListener("click",()=>{
      const g=gifts.find(x=>x.id===b.dataset.id);if(!g)return;editingId=g.id;
      for(const field of ["item","category","status","store","purchaseDate","notes"])if(g[field]!=null){if(["category","status"].includes(field)&&![...form.elements[field].options].some(o=>o.value===g[field]))form.elements[field].add(new Option(g[field]+" (archived)",g[field]));form.elements[field].value=g[field];}
      form.elements.paidPrice.value=g.paidPriceCents==null?"":(g.paidPriceCents/100).toFixed(2);
      form.elements.regularPrice.value=g.regularPriceCents==null?"":(g.regularPriceCents/100).toFixed(2);
      save.textContent="Save changes";cancel.hidden=false;form.scrollIntoView({behavior:"smooth",block:"start"});
    }));
    list.querySelectorAll(".delete-house-gift").forEach(b=>b.addEventListener("click",async()=>{
      const g=gifts.find(x=>x.id===b.dataset.id);if(!g||!confirm('Delete "'+g.item+'"? This cannot be undone.'))return;b.disabled=true;
      try{await deleteDoc(doc(giftsRef,g.id));if(editingId===g.id)reset();notice("Gift deleted.","success");await load();}catch(e){notice(friendlyError(e),"error");b.disabled=false;}
    }));
  }
  form.addEventListener("submit",async e=>{
    e.preventDefault();const item=form.elements.item.value.trim();if(!item)return;
    save.disabled=true;save.textContent=editingId?"Saving…":"Adding…";
    const paid=form.elements.paidPrice.value,regular=form.elements.regularPrice.value;
    const data={item,category:form.elements.category.value,status:form.elements.status.value,paidPriceCents:paid===""?null:Math.round(Number(paid)*100),regularPriceCents:regular===""?null:Math.round(Number(regular)*100),store:form.elements.store.value.trim(),purchaseDate:form.elements.purchaseDate.value||null,notes:form.elements.notes.value.trim(),updatedAt:serverTimestamp()};
    try{if(editingId)await updateDoc(doc(giftsRef,editingId),data);else await addDoc(giftsRef,{...data,giftType:"household",childId:null,sortOrder:Date.now(),createdAt:serverTimestamp()});reset();await load();notice("Saved.","success");}
    catch(error){notice(friendlyError(error),"error");}finally{save.disabled=false;if(!editingId)save.textContent="Add gift";}
  });
  try{await load();}catch(error){notice(friendlyError(error),"error");}
}
async function renderGiftRecipients(user, household, householdId) {
  const recipientsRef=collection(db,"households",householdId,"giftRecipients");
  const giftsRef=collection(db,"households",householdId,"gifts");
  appRoot.innerHTML='<section class="dashboard-panel"><button class="text-button" id="back-home" type="button">← Household</button><p class="eyebrow">Our Gifts</p><h1>Gifts for other people</h1><p class="welcome-copy">Track recipients, birthdays, budgets, and gifts bought for them.</p><form id="recipient-form" class="gift-form"><div class="field-group"><label>Name</label><input name="name" maxlength="80" required></div><div class="field-group"><label>Birthday</label><input name="birthday" type="date"></div><div class="field-group"><label>Budget ($)</label><input name="budget" type="number" min="0" step="0.01"></div><div class="field-group"><label>Notes</label><textarea name="notes" rows="2"></textarea></div><div class="gift-form-actions"><button class="primary-button" id="save-recipient" type="submit">Add recipient</button><button class="secondary-button" id="cancel-recipient" type="button" hidden>Cancel edit</button></div></form><p id="recipient-message" class="auth-message" role="status" hidden></p><div id="recipient-list" class="gift-list"></div></section>';
  document.querySelector("#back-home").addEventListener("click",()=>renderHouseholdHome(user,household,householdId));
  const form=document.querySelector("#recipient-form"),list=document.querySelector("#recipient-list"),msg=document.querySelector("#recipient-message"),save=document.querySelector("#save-recipient"),cancel=document.querySelector("#cancel-recipient");let editId=null;
  function notice(t,k="info"){msg.textContent=t;msg.dataset.kind=k;msg.hidden=false;}
  function reset(){editId=null;form.reset();save.textContent="Add recipient";cancel.hidden=true;}
  cancel.addEventListener("click",reset);
  async function load(){
    const [rs,gs]=await Promise.all([getDocs(recipientsRef),getDocs(giftsRef)]);
    const people=rs.docs.map(x=>({id:x.id,...x.data()})).filter(x=>x.active!==false);
    const gifts=gs.docs.map(x=>x.data());
    if(!people.length){list.innerHTML='<p class="empty-state">No recipients added yet.</p>';return;}
    list.innerHTML=people.map(r=>{const rg=gifts.filter(g=>g.recipientId===r.id),spent=rg.reduce((n,g)=>n+(g.paidPriceCents||0),0);return '<article class="child-card"><div class="child-card-main"><h3>'+escapeHtml(r.name)+'</h3><p>'+(r.birthday?'Birthday: '+escapeHtml(formatBirthday(r.birthday)):'Birthday not added')+'</p><p>Budget: '+(r.budgetCents==null?'—':formatMoney(r.budgetCents))+' · Spent: '+formatMoney(spent)+'</p><p>'+rg.length+' gifts</p></div><div class="child-card-actions"><button class="text-button edit-recipient" data-id="'+r.id+'" type="button">Edit</button><button class="text-button archive-recipient" data-id="'+r.id+'" type="button">Archive</button><button class="text-button recipient-gifts" data-id="'+r.id+'" type="button">Gift list</button></div></article>';}).join("");
    list.querySelectorAll(".edit-recipient").forEach(b=>b.addEventListener("click",()=>{const r=people.find(x=>x.id===b.dataset.id);editId=r.id;form.elements.name.value=r.name||"";form.elements.birthday.value=r.birthday||"";form.elements.budget.value=r.budgetCents==null?"":(r.budgetCents/100).toFixed(2);form.elements.notes.value=r.notes||"";save.textContent="Save changes";cancel.hidden=false;form.scrollIntoView({behavior:"smooth"});}));
    list.querySelectorAll(".archive-recipient").forEach(b=>b.addEventListener("click",async()=>{const r=people.find(x=>x.id===b.dataset.id);if(!confirm("Archive "+r.name+"? Gift records will be kept."))return;try{await updateDoc(doc(recipientsRef,r.id),{active:false,updatedAt:serverTimestamp()});await load();}catch(e){notice(friendlyError(e),"error");}}));
    list.querySelectorAll(".recipient-gifts").forEach(b=>b.addEventListener("click",()=>{const r=people.find(x=>x.id===b.dataset.id);renderRecipientGiftList(user,household,householdId,r);}));
  }
  form.addEventListener("submit",async e=>{e.preventDefault();const name=form.elements.name.value.trim(),budget=form.elements.budget.value;if(!name)return;save.disabled=true;const data={name,birthday:form.elements.birthday.value||null,budgetCents:budget===""?null:Math.round(Number(budget)*100),notes:form.elements.notes.value.trim(),active:true,updatedAt:serverTimestamp()};try{if(editId)await updateDoc(doc(recipientsRef,editId),data);else await addDoc(recipientsRef,{...data,createdAt:serverTimestamp()});reset();await load();notice("Recipient saved.","success");}catch(e){notice(friendlyError(e),"error");}finally{save.disabled=false;}});
  try{await load();}catch(e){notice(friendlyError(e),"error");}
}

async function renderRecipientGiftList(user,household,householdId,recipient){
  const giftsRef=collection(db,"households",householdId,"gifts"),categoriesRef=collection(db,"households",householdId,"giftCategories"),statusesRef=collection(db,"households",householdId,"giftStatuses");
  appRoot.innerHTML='<section class="dashboard-panel"><button class="text-button" id="back-recipients" type="button">← Recipients</button><p class="eyebrow">Our Gifts</p><h1 id="recipient-title"></h1><p class="welcome-copy">Gift ideas and purchases for this recipient.</p><form id="recipient-gift-form" class="gift-form"><div class="field-group"><label>Gift idea / item</label><input name="item" maxlength="120" required></div><div class="field-group"><label>Category</label><select name="category" required></select></div><div class="field-group"><label>Status</label><select name="status" required></select></div><div class="field-group"><label>Paid price ($)</label><input name="paidPrice" type="number" min="0" step="0.01"></div><div class="field-group"><label>Regular price ($)</label><input name="regularPrice" type="number" min="0" step="0.01"></div><div class="field-group"><label>Store</label><input name="store"></div><div class="field-group"><label>Purchase date</label><input name="purchaseDate" type="date"></div><div class="field-group"><label>Wishlist URL</label><input name="wishlistUrl" type="url"></div><div class="field-group"><label>Notes</label><textarea name="notes" rows="2"></textarea></div><div class="gift-form-actions"><button class="primary-button" id="save-recipient-gift" type="submit">Add gift</button><button class="secondary-button" id="cancel-recipient-gift" type="button" hidden>Cancel edit</button></div></form><p id="recipient-gift-message" class="auth-message" role="status" hidden></p><div id="recipient-gift-list" class="gift-list"></div></section>';
  document.querySelector("#recipient-title").textContent=recipient.name;document.querySelector("#back-recipients").addEventListener("click",()=>renderGiftRecipients(user,household,householdId));
  const form=document.querySelector("#recipient-gift-form"),list=document.querySelector("#recipient-gift-list"),msg=document.querySelector("#recipient-gift-message"),save=document.querySelector("#save-recipient-gift"),cancel=document.querySelector("#cancel-recipient-gift");let editId=null;
  function notice(t,k="info"){msg.textContent=t;msg.dataset.kind=k;msg.hidden=false;}function reset(){editId=null;form.reset();save.textContent="Add gift";cancel.hidden=true;}cancel.addEventListener("click",reset);
  const defs=[[categoriesRef,[["undecided","Undecided","#e8e5dc"],["santa","Santa","#dce8df"],["stocking","Stocking","#f5e3d5"],["main","Main","#dce5f2"],["advent","Advent","#eee2f1"]]],[statusesRef,[["need-to-buy","Need to buy","#f5e3d5"],["bought","Bought","#dce5f2"],["wrapped","Wrapped","#dce8df"]]]];
  for(const [ref,entries] of defs){const snap=await getDocs(ref);if(snap.empty){const batch=writeBatch(db);entries.forEach((x,i)=>batch.set(doc(ref,x[0]),{label:x[1],color:x[2],sortOrder:(i+1)*100,active:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));await batch.commit();}}
  const [cs,ss]=await Promise.all([getDocs(query(categoriesRef,orderBy("sortOrder","asc"))),getDocs(query(statusesRef,orderBy("sortOrder","asc")))]);
  form.elements.category.innerHTML=cs.docs.map(x=>x.data()).filter(x=>x.active!==false).map(x=>'<option>'+escapeHtml(x.label)+'</option>').join("");form.elements.status.innerHTML=ss.docs.map(x=>x.data()).filter(x=>x.active!==false).map(x=>'<option>'+escapeHtml(x.label)+'</option>').join("");
  async function load(){const snap=await getDocs(giftsRef),gifts=snap.docs.map(x=>({id:x.id,...x.data()})).filter(x=>x.giftType==="recipient"&&x.recipientId===recipient.id).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));if(!gifts.length){list.innerHTML='<p class="empty-state">No gifts added yet.</p>';return;}
    list.innerHTML=gifts.map(g=>{const savings=g.paidPriceCents!=null&&g.regularPriceCents!=null?g.regularPriceCents-g.paidPriceCents:null;return '<article class="gift-card"><div class="gift-card-top"><h3>'+escapeHtml(g.item)+'</h3><span class="gift-status">'+escapeHtml(g.status||"")+'</span></div><p>'+escapeHtml(g.category||"")+(g.store?' · '+escapeHtml(g.store):"")+'</p><div class="gift-prices"><span>Paid: '+(g.paidPriceCents==null?"—":formatMoney(g.paidPriceCents))+'</span><span>Regular: '+(g.regularPriceCents==null?"—":formatMoney(g.regularPriceCents))+'</span><span>Savings: '+(savings==null?"—":formatMoney(savings))+'</span></div>'+(g.purchaseDate?'<p class="gift-meta">Purchased: '+escapeHtml(formatBirthday(g.purchaseDate))+'</p>':"")+(g.wishlistUrl?'<p class="gift-meta"><a href="'+escapeHtml(g.wishlistUrl)+'" target="_blank" rel="noopener noreferrer">Wishlist reference</a></p>':"")+(g.notes?'<p class="gift-notes-text">'+escapeHtml(g.notes)+'</p>':"")+'<div class="gift-card-actions"><button class="text-button edit-recipient-gift" data-id="'+g.id+'" type="button">Edit</button><button class="text-button delete-recipient-gift" data-id="'+g.id+'" type="button">Delete</button></div></article>';}).join("");
    list.querySelectorAll(".edit-recipient-gift").forEach(b=>b.addEventListener("click",()=>{const g=gifts.find(x=>x.id===b.dataset.id);editId=g.id;for(const field of ["item","category","status","store","purchaseDate","wishlistUrl","notes"])if(g[field]!=null){if(["category","status"].includes(field)&&![...form.elements[field].options].some(o=>o.value===g[field]))form.elements[field].add(new Option(g[field]+" (archived)",g[field]));form.elements[field].value=g[field];}form.elements.paidPrice.value=g.paidPriceCents==null?"":(g.paidPriceCents/100).toFixed(2);form.elements.regularPrice.value=g.regularPriceCents==null?"":(g.regularPriceCents/100).toFixed(2);save.textContent="Save changes";cancel.hidden=false;form.scrollIntoView({behavior:"smooth"});}));
    list.querySelectorAll(".delete-recipient-gift").forEach(b=>b.addEventListener("click",async()=>{const g=gifts.find(x=>x.id===b.dataset.id);if(!g||!confirm("Delete "+g.item+"? This cannot be undone."))return;b.disabled=true;try{await deleteDoc(doc(giftsRef,g.id));if(editId===g.id)reset();await load();notice("Gift deleted.","success");}catch(e){notice(friendlyError(e),"error");b.disabled=false;}}));
  }
  form.addEventListener("submit",async e=>{e.preventDefault();const item=form.elements.item.value.trim();if(!item)return;save.disabled=true;const p=form.elements.paidPrice.value,r=form.elements.regularPrice.value;const data={item,category:form.elements.category.value,status:form.elements.status.value,paidPriceCents:p===""?null:Math.round(Number(p)*100),regularPriceCents:r===""?null:Math.round(Number(r)*100),store:form.elements.store.value.trim(),purchaseDate:form.elements.purchaseDate.value||null,wishlistUrl:form.elements.wishlistUrl.value.trim(),notes:form.elements.notes.value.trim(),updatedAt:serverTimestamp()};try{if(editId)await updateDoc(doc(giftsRef,editId),data);else await addDoc(giftsRef,{...data,giftType:"recipient",recipientId:recipient.id,childId:null,sortOrder:Date.now(),createdAt:serverTimestamp()});reset();await load();notice("Gift saved.","success");}catch(e){notice(friendlyError(e),"error");}finally{save.disabled=false;}});
  try{await load();}catch(e){notice(friendlyError(e),"error");}
}

async function renderChildGiftList(user, household, householdId, child) {
  appRoot.innerHTML = `
    <section class="dashboard-panel">
      <button class="text-button" id="back-to-children" type="button">← All children</button>
      <p class="eyebrow">Our Gifts · Christmas</p>
      <h1 id="gift-child-name"></h1>
      <p class="welcome-copy">Track gifts purchased for this child.</p>
      <button class="secondary-button settings-toggle" id="gift-settings-toggle" type="button">Manage categories &amp; statuses</button>
      <section id="gift-settings" class="gift-settings" hidden>
        <h2>Gift categories</h2><p class="section-copy">Rename, recolor, add, or archive categories. Existing gifts keep archived labels.</p>
        <div id="gift-category-settings" class="settings-list"></div>
        <form id="add-gift-category" class="settings-add-form"><input name="label" maxlength="40" placeholder="New category" required><input name="color" type="color" value="#dce8df" aria-label="Category color"><button class="secondary-button" type="submit">Add category</button></form>
        <h2>Gift statuses</h2><p class="section-copy">Statuses are independent of categories.</p>
        <div id="gift-status-settings" class="settings-list"></div>
        <form id="add-gift-status" class="settings-add-form"><input name="label" maxlength="40" placeholder="New status" required><input name="color" type="color" value="#e8e5f2" aria-label="Status color"><button class="secondary-button" type="submit">Add status</button></form>
        <p id="gift-settings-message" class="auth-message" role="status" aria-live="polite" hidden></p>
      </section>
      <form id="gift-form" class="gift-form">
        <div class="field-group"><label for="gift-item">Gift</label><input id="gift-item" name="item" maxlength="120" required placeholder="Gift name"></div>
        <div class="field-group"><label for="gift-category">Category</label><select id="gift-category" name="category" required></select></div>
        <div class="field-group"><label for="gift-status">Status</label><select id="gift-status" name="status" required></select></div>
        <div class="field-group"><label for="gift-paid">Paid price ($)</label><input id="gift-paid" name="paidPrice" type="number" min="0" step="0.01" inputmode="decimal"></div>
        <div class="field-group"><label for="gift-regular">Regular price ($)</label><input id="gift-regular" name="regularPrice" type="number" min="0" step="0.01" inputmode="decimal"></div>
        <div class="field-group"><label for="gift-store">Store</label><input id="gift-store" name="store" maxlength="100"></div>
        <div class="field-group"><label for="gift-purchase-date">Purchase date</label><input id="gift-purchase-date" name="purchaseDate" type="date"></div>
        <div class="field-group gift-notes"><label for="gift-notes">Notes</label><textarea id="gift-notes" name="notes" rows="2" maxlength="1000"></textarea></div>
        <div class="gift-form-actions"><button class="primary-button" id="save-gift" type="submit">Add gift</button><button class="secondary-button" id="cancel-gift-edit" type="button" hidden>Cancel edit</button></div>
      </form>
      <p id="gift-message" class="auth-message" role="status" aria-live="polite" hidden></p>
      <div id="gift-list" class="gift-list"><p class="empty-state">Loading gifts…</p></div>
    </section>`;
  document.querySelector("#gift-child-name").textContent = child.name;
  document.querySelector("#back-to-children").addEventListener("click", () => renderHouseholdHome(user, household, householdId));
  const form = document.querySelector("#gift-form");
  const list = document.querySelector("#gift-list");
  const message = document.querySelector("#gift-message");
  const save = document.querySelector("#save-gift");
  const cancelEdit = document.querySelector("#cancel-gift-edit");
  let editingGiftId = null;
  const categoryCollection = collection(db, "households", householdId, "giftCategories");
  const statusCollection = collection(db, "households", householdId, "giftStatuses");
  const categoryDefaults = [["undecided","Undecided","#e8e5dc"],["santa","Santa","#dce8df"],["stocking","Stocking","#f5e3d5"],["main","Main","#dce5f2"],["advent","Advent","#eee2f1"]];
  const statusDefaults = [["need-to-buy","Need to buy","#f5e3d5"],["bought","Bought","#dce5f2"],["wrapped","Wrapped","#dce8df"]];
  let giftCategories = [];
  let giftStatuses = [];
  const settingsPanel = document.querySelector("#gift-settings");
  const settingsMessage = document.querySelector("#gift-settings-message");
  function settingsNotice(text, kind = "info") { settingsMessage.textContent = text; settingsMessage.dataset.kind = kind; settingsMessage.hidden = false; }
  async function seedSettings(ref, defaults) {
    const current = await getDocs(ref);
    if (!current.empty) return;
    const batch = writeBatch(db);
    defaults.forEach((entry, index) => batch.set(doc(ref, entry[0]), { label: entry[1], color: entry[2], sortOrder: (index + 1) * 100, active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await batch.commit();
  }
  function refreshGiftSelects() {
    const oldCategory = form.elements.category.value;
    const oldStatus = form.elements.status.value;
    const activeCategories = giftCategories.filter(item => item.active !== false);
    const activeStatuses = giftStatuses.filter(item => item.active !== false);
    form.elements.category.innerHTML = activeCategories.map(item => "<option>" + escapeHtml(item.label) + "</option>").join("");
    form.elements.status.innerHTML = activeStatuses.map(item => "<option>" + escapeHtml(item.label) + "</option>").join("");
    if (activeCategories.some(item => item.label === oldCategory)) form.elements.category.value = oldCategory;
    if (activeStatuses.some(item => item.label === oldStatus)) form.elements.status.value = oldStatus;
  }
  function renderSettingRows(target, items, type) {
    target.innerHTML = items.map(item => "<div class=\"settings-row\" data-setting-id=\"" + escapeHtml(item.id) + "\">" +
      "<input class=\"setting-label\" maxlength=\"40\" value=\"" + escapeHtml(item.label) + "\" aria-label=\"" + type + " name\">" +
      "<input class=\"setting-color\" type=\"color\" value=\"" + (/^#[0-9a-f]{6}$/i.test(item.color || "") ? item.color : "#e8e5dc") + "\" aria-label=\"" + type + " color\">" +
      "<button class=\"secondary-button save-setting\" type=\"button\">Save</button>" +
      (item.active === false ? "<span class=\"archived-label\">Archived</span>" : "<button class=\"text-button archive-setting\" type=\"button\">Archive</button>") + "</div>").join("");
    target.querySelectorAll(".save-setting").forEach(button => button.addEventListener("click", async () => {
      const row = button.closest(".settings-row");
      const item = items.find(value => value.id === row.dataset.settingId);
      const label = row.querySelector(".setting-label").value.trim();
      const color = row.querySelector(".setting-color").value;
      if (!label) return settingsNotice("Enter a name first.", "error");
      if (items.some(value => value.id !== item.id && value.active !== false && value.label.toLowerCase() === label.toLowerCase())) return settingsNotice("That name is already in use.", "error");
      button.disabled = true;
      try {
        const gifts = await getDocs(collection(db, "households", householdId, "gifts"));
        const matches = gifts.docs.filter(gift => gift.data()[type] === item.label);
        const batch = writeBatch(db);
        matches.forEach(gift => batch.update(gift.ref, { [type]: label, updatedAt: serverTimestamp() }));
        batch.update(doc(type === "category" ? categoryCollection : statusCollection, item.id), { label, color, updatedAt: serverTimestamp() });
        await batch.commit();
        await loadGiftSettings(); await loadGifts(); settingsNotice("Saved.", "success");
      } catch (error) { settingsNotice(friendlyError(error), "error"); }
      finally { button.disabled = false; }
    }));
    target.querySelectorAll(".archive-setting").forEach(button => button.addEventListener("click", async () => {
      const row = button.closest(".settings-row");
      const item = items.find(value => value.id === row.dataset.settingId);
      if (items.filter(value => value.active !== false).length < 2) return settingsNotice("Keep at least one active " + type + ".", "error");
      if (!confirm("Archive " + item.label + "? Existing gifts will keep this value.")) return;
      try {
        await updateDoc(doc(type === "category" ? categoryCollection : statusCollection, item.id), { active: false, updatedAt: serverTimestamp() });
        await loadGiftSettings(); await loadGifts(); settingsNotice("Archived. Existing gifts were not changed.", "success");
      } catch (error) { settingsNotice(friendlyError(error), "error"); }
    }));
  }
  async function loadGiftSettings() {
    await Promise.all([seedSettings(categoryCollection, categoryDefaults), seedSettings(statusCollection, statusDefaults)]);
    const results = await Promise.all([getDocs(query(categoryCollection, orderBy("sortOrder", "asc"))), getDocs(query(statusCollection, orderBy("sortOrder", "asc")))]);
    giftCategories = results[0].docs.map(row => ({ id: row.id, ...row.data() }));
    giftStatuses = results[1].docs.map(row => ({ id: row.id, ...row.data() }));
    refreshGiftSelects();
    renderSettingRows(document.querySelector("#gift-category-settings"), giftCategories, "category");
    renderSettingRows(document.querySelector("#gift-status-settings"), giftStatuses, "status");
  }
  document.querySelector("#gift-settings-toggle").addEventListener("click", async () => {
    settingsPanel.hidden = !settingsPanel.hidden;
    if (!settingsPanel.hidden) try { await loadGiftSettings(); } catch (error) { settingsNotice(friendlyError(error), "error"); }
  });
  async function addGiftSetting(settingForm, type) {
    const label = settingForm.elements.label.value.trim();
    const items = type === "category" ? giftCategories : giftStatuses;
    if (!label) return;
    if (items.some(item => item.active !== false && item.label.toLowerCase() === label.toLowerCase())) return settingsNotice("That name is already in use.", "error");
    const ref = type === "category" ? categoryCollection : statusCollection;
    try {
      await addDoc(ref, { label, color: settingForm.elements.color.value, sortOrder: (items.length + 1) * 100, active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      settingForm.reset(); await loadGiftSettings(); settingsNotice("Added.", "success");
    } catch (error) { settingsNotice(friendlyError(error), "error"); }
  }
  document.querySelector("#add-gift-category").addEventListener("submit", event => { event.preventDefault(); addGiftSetting(event.currentTarget, "category"); });
  document.querySelector("#add-gift-status").addEventListener("submit", event => { event.preventDefault(); addGiftSetting(event.currentTarget, "status"); });
  function resetGiftForm() {
    editingGiftId = null; form.reset(); save.textContent = "Add gift"; cancelEdit.hidden = true;
  }
  cancelEdit.addEventListener("click", resetGiftForm);
  async function loadGifts() {
    try {
      const snapshot = await getDocs(collection(db, "households", householdId, "gifts"));
      const gifts = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
        .filter(gift => gift.childId === child.id)
        .sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      if (!gifts.length) { list.innerHTML = '<p class="empty-state">No gifts added yet.</p>'; return; }
      list.innerHTML = gifts.map((gift, index) => {
        const savings = gift.paidPriceCents != null && gift.regularPriceCents != null
          ? Number(gift.regularPriceCents) - Number(gift.paidPriceCents) : null;
        return `
        <article class="gift-card" draggable="true" data-gift-id="${escapeHtml(gift.id)}">
          <div class="gift-card-top"><h3>${escapeHtml(gift.item)}</h3><span class="gift-status" style="background:${(giftStatuses.find(value => value.label === gift.status) || {}).color || "#e8efe9"}">${escapeHtml(gift.status)}</span></div>
          <p><span class="gift-category-label" style="background:${(giftCategories.find(value => value.label === gift.category) || {}).color || "#eeeae2"}">${escapeHtml(gift.category)}</span>${gift.store ? " · " + escapeHtml(gift.store) : ""}</p>
          <div class="gift-prices">
            <span>Paid: ${gift.paidPriceCents == null ? "—" : formatMoney(gift.paidPriceCents)}</span>
            <span>Regular: ${gift.regularPriceCents == null ? "—" : formatMoney(gift.regularPriceCents)}</span>
            <span>Savings: ${savings == null ? "—" : formatMoney(savings)}</span>
          </div>
          ${gift.purchaseDate ? '<p class="gift-meta">Purchased: ' + escapeHtml(formatBirthday(gift.purchaseDate)) + '</p>' : ""}
          ${gift.notes ? '<p class="gift-notes-text">' + escapeHtml(gift.notes) + '</p>' : ""}
          <div class="gift-card-actions">
            <label class="status-control">Status
              <select class="gift-status-select" data-gift-id="${escapeHtml(gift.id)}">
                ${giftStatuses.filter(value => value.active !== false || value.label === gift.status).map(value => '<option' + (gift.status === value.label ? ' selected' : '') + '>' + escapeHtml(value.label) + '</option>').join("")}
              </select>
            </label>
            <div class="gift-card-order" aria-label="Reorder gift">
              <button class="order-gift" type="button" data-direction="up" data-gift-id="${escapeHtml(gift.id)}" aria-label="Move ${escapeHtml(gift.item)} up" ${index === 0 ? "disabled" : ""}>↑</button>
              <button class="order-gift" type="button" data-direction="down" data-gift-id="${escapeHtml(gift.id)}" aria-label="Move ${escapeHtml(gift.item)} down" ${index === gifts.length - 1 ? "disabled" : ""}>↓</button>
            </div>
            <button class="text-button edit-gift" type="button" data-gift-id="${escapeHtml(gift.id)}">Edit</button>
            <button class="text-button delete-gift" type="button" data-gift-id="${escapeHtml(gift.id)}">Delete</button>
          </div>
        </article>`;
      }).join("");
      let draggedGiftId = null;
      list.querySelectorAll(".gift-card").forEach(card => {
        card.addEventListener("dragstart", event => {
          draggedGiftId = card.dataset.giftId;
          card.classList.add("is-dragging");
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", draggedGiftId);
        });
        card.addEventListener("dragend", () => {
          draggedGiftId = null;
          list.querySelectorAll(".gift-card").forEach(item => item.classList.remove("is-dragging", "drop-target"));
        });
        card.addEventListener("dragover", event => {
          event.preventDefault();
          if (card.dataset.giftId !== draggedGiftId) card.classList.add("drop-target");
        });
        card.addEventListener("dragleave", () => card.classList.remove("drop-target"));
        card.addEventListener("drop", async event => {
          event.preventDefault();
          card.classList.remove("drop-target");
          const fromId = event.dataTransfer.getData("text/plain") || draggedGiftId;
          const toId = card.dataset.giftId;
          if (!fromId || fromId === toId) return;
          const reordered = [...gifts];
          const fromIndex = reordered.findIndex(item => item.id === fromId);
          const toIndex = reordered.findIndex(item => item.id === toId);
          if (fromIndex < 0 || toIndex < 0) return;
          const [moved] = reordered.splice(fromIndex, 1);
          reordered.splice(toIndex, 0, moved);
          await saveGiftOrder(reordered);
        });
      });
      list.querySelectorAll(".order-gift").forEach(button => button.addEventListener("click", async () => {
        const reordered = [...gifts];
        const index = reordered.findIndex(item => item.id === button.dataset.giftId);
        const next = button.dataset.direction === "up" ? index - 1 : index + 1;
        if (index < 0 || next < 0 || next >= reordered.length) return;
        [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
        await saveGiftOrder(reordered);
      }));
      async function saveGiftOrder(reordered) {
        list.querySelectorAll("button, select").forEach(control => control.disabled = true);
        try {
          const batch = writeBatch(db);
          reordered.forEach((gift, index) => {
            batch.update(doc(db, "households", householdId, "gifts", gift.id), {
              sortOrder: (index + 1) * 100, updatedAt: serverTimestamp()
            });
          });
          await batch.commit();
          await loadGifts();
        } catch (error) {
          message.textContent = friendlyError(error);
          message.dataset.kind = "error";
          message.hidden = false;
          await loadGifts();
        }
      }
      list.querySelectorAll(".gift-status-select").forEach(select => select.addEventListener("change", async () => {
        select.disabled = true;
        try { await updateDoc(doc(db, "households", householdId, "gifts", select.dataset.giftId), { status: select.value, updatedAt: serverTimestamp() }); }
        catch (error) { message.textContent = friendlyError(error); message.dataset.kind = "error"; message.hidden = false; await loadGifts(); }
        finally { select.disabled = false; }
      }));
      list.querySelectorAll(".delete-gift").forEach(button => button.addEventListener("click", async () => {
        const gift = gifts.find(item => item.id === button.dataset.giftId);
        if (!gift || !confirm(`Delete "${gift.item}"? This cannot be undone.`)) return;
        button.disabled = true;
        try {
          await deleteDoc(doc(db, "households", householdId, "gifts", gift.id));
          if (editingGiftId === gift.id) resetGiftForm();
          message.textContent = "Gift deleted.";
          message.dataset.kind = "success";
          message.hidden = false;
          await loadGifts();
        } catch (error) {
          message.textContent = friendlyError(error);
          message.dataset.kind = "error";
          message.hidden = false;
          button.disabled = false;
        }
      }));
      list.querySelectorAll(".edit-gift").forEach(button => button.addEventListener("click", () => {
        const gift = gifts.find(item => item.id === button.dataset.giftId);
        if (!gift) return;
        editingGiftId = gift.id;
        form.elements.item.value = gift.item || "";
        const categoryValue = gift.category || "Undecided";
        const statusValue = gift.status || "Need to buy";
        [[form.elements.category, categoryValue], [form.elements.status, statusValue]].forEach(([select, value]) => {
          if (![...select.options].some(option => option.value === value)) {
            const archived = document.createElement("option");
            archived.value = value;
            archived.textContent = value + " (archived)";
            select.append(archived);
          }
          select.value = value;
        });
        form.elements.paidPrice.value = gift.paidPriceCents == null ? "" : (gift.paidPriceCents / 100).toFixed(2);
        form.elements.regularPrice.value = gift.regularPriceCents == null ? "" : (gift.regularPriceCents / 100).toFixed(2);
        form.elements.store.value = gift.store || "";
        form.elements.purchaseDate.value = gift.purchaseDate || "";
        form.elements.notes.value = gift.notes || "";
        save.textContent = "Save changes"; cancelEdit.hidden = false;
        form.scrollIntoView({ behavior: "smooth", block: "start" });
      }));
    } catch (error) { list.innerHTML = ""; message.textContent = friendlyError(error); message.hidden = false; }
  }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const item = form.elements.item.value.trim();
    if (!item) return;
    save.disabled = true; save.textContent = "Adding…";
    try {
      const paid = form.elements.paidPrice.value;
      const regular = form.elements.regularPrice.value;
      const giftData = {
        item, category: form.elements.category.value, status: form.elements.status.value,
        paidPriceCents: paid === "" ? null : Math.round(Number(paid) * 100),
        regularPriceCents: regular === "" ? null : Math.round(Number(regular) * 100),
        store: form.elements.store.value.trim(), purchaseDate: form.elements.purchaseDate.value || null,
        notes: form.elements.notes.value.trim(), updatedAt: serverTimestamp()
      };
      if (editingGiftId) {
        await updateDoc(doc(db, "households", householdId, "gifts", editingGiftId), giftData);
      } else {
        const existing = await getDocs(collection(db, "households", householdId, "gifts"));
        const count = existing.docs.filter(row => row.data().childId === child.id).length;
        await addDoc(collection(db, "households", householdId, "gifts"), {
          ...giftData, childId: child.id, sortOrder: count * 100, createdAt: serverTimestamp()
        });
      }
      resetGiftForm(); message.hidden = true; await loadGifts();
    } catch (error) { message.textContent = friendlyError(error); message.dataset.kind = "error"; message.hidden = false; }
    finally { save.disabled = false; if (!editingGiftId) save.textContent = "Add gift"; }
  });
  try { await loadGiftSettings(); } catch (error) { message.textContent = friendlyError(error); message.dataset.kind = "error"; message.hidden = false; }
  await loadGifts();
}


async function renderInventory(user, household, householdId) {
  const inventoryRef = collection(db, "households", householdId, "inventory");
  const statusRef = collection(db, "households", householdId, "inventoryStatuses");
  const defaults = [["available","Available","#dce8df"],["reserved","Reserved","#f5e3d5"],["assigned","Assigned","#dce5f2"],["given","Given","#eee2f1"]];
  async function loadStatuses() {
    const existing = await getDocs(statusRef);
    if (existing.empty) {
      const batch = writeBatch(db);
      defaults.forEach((entry,index) => batch.set(doc(statusRef,entry[0]), {label:entry[1],color:entry[2],sortOrder:(index+1)*100,active:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
      await batch.commit();
    }
    const snapshot = await getDocs(query(statusRef,orderBy("sortOrder","asc")));
    return snapshot.docs.map(row => ({id:row.id,...row.data()}));
  }
  let statuses = await loadStatuses();
  appRoot.innerHTML = `
    <section class="dashboard-panel">
      <button class="text-button" id="back-inventory" type="button">← Household</button>
      <p class="eyebrow">Our Gifts</p><h1>Unassigned gift inventory</h1>
      <p class="welcome-copy">Track gifts you've already bought but haven't assigned yet. Assigning one creates the gift-list record with the original purchase details.</p>
      <button class="secondary-button settings-toggle" id="inventory-settings-toggle" type="button">Manage inventory statuses</button>
      <section class="gift-settings" id="inventory-settings" hidden>
        <h2>Inventory statuses</h2><p class="section-copy">These statuses are separate from gift-list statuses.</p>
        <div class="settings-list" id="inventory-status-list"></div>
        <form class="settings-add-form" id="add-inventory-status"><input name="label" maxlength="40" placeholder="New status" required><input name="color" type="color" value="#e8e5dc" aria-label="Status color"><button class="secondary-button" type="submit">Add</button></form>
      </section>
      <form id="inventory-form" class="gift-form">
        <div class="field-group"><label>Item</label><input name="item" maxlength="120" required></div>
        <div class="field-group"><label>Intended use</label><input name="intendedUse" maxlength="100" placeholder="Birthday, Christmas, general…"></div>
        <div class="field-group"><label>Status</label><select name="status" required></select></div>
        <div class="field-group"><label>Paid price ($)</label><input name="paidPrice" type="number" min="0" step="0.01"></div>
        <div class="field-group"><label>Regular price ($)</label><input name="regularPrice" type="number" min="0" step="0.01"></div>
        <div class="field-group"><label>Store</label><input name="store" maxlength="100"></div>
        <div class="field-group"><label>Purchase date</label><input name="purchaseDate" type="date"></div>
        <div class="field-group gift-notes"><label>Notes</label><textarea name="notes" rows="2" maxlength="1000"></textarea></div>
        <div class="gift-form-actions"><button class="primary-button" id="save-inventory" type="submit">Add to inventory</button><button class="secondary-button" id="cancel-inventory-edit" type="button" hidden>Cancel edit</button></div>
      </form>
      <p class="auth-message" id="inventory-message" role="status" aria-live="polite" hidden></p>
      <div class="gift-list" id="inventory-list"><p class="empty-state">Loading inventory…</p></div>
    </section>`;
  document.querySelector("#back-inventory").addEventListener("click",()=>renderHouseholdHome(user,household,householdId));
  const form=document.querySelector("#inventory-form"), list=document.querySelector("#inventory-list");
  const message=document.querySelector("#inventory-message"), save=document.querySelector("#save-inventory");
  const cancel=document.querySelector("#cancel-inventory-edit"), settings=document.querySelector("#inventory-settings");
  let editingId=null;
  function notice(text,kind="info"){message.textContent=text;message.dataset.kind=kind;message.hidden=false;}
  function refreshStatusSelect(selected) {
    form.elements.status.innerHTML=statuses.filter(s=>s.active!==false || s.label===selected).map(s=>"<option>"+escapeHtml(s.label)+"</option>").join("");
    if(selected) form.elements.status.value=selected;
  }
  function resetForm(){editingId=null;form.reset();refreshStatusSelect();save.textContent="Add to inventory";cancel.hidden=true;}
  refreshStatusSelect();
  function renderStatusSettings(){
    const target=document.querySelector("#inventory-status-list");
    target.innerHTML=statuses.map(s=>`<div class="settings-row" data-id="${escapeHtml(s.id)}"><input class="setting-label" maxlength="40" value="${escapeHtml(s.label)}" aria-label="Status name"><input class="setting-color" type="color" value="${/^#[0-9a-f]{6}$/i.test(s.color||"")?s.color:"#e8e5dc"}" aria-label="Status color"><button class="secondary-button save-status" type="button">Save</button>${s.active===false?'<span class="archived-label">Archived</span>':'<button class="text-button archive-status" type="button">Archive</button>'}</div>`).join("");
    target.querySelectorAll(".save-status").forEach(button=>button.addEventListener("click",async()=>{
      const row=button.closest(".settings-row"), item=statuses.find(s=>s.id===row.dataset.id), label=row.querySelector(".setting-label").value.trim(), color=row.querySelector(".setting-color").value;
      if(!label)return notice("Enter a status name.","error");
      if(statuses.some(s=>s.id!==item.id&&s.active!==false&&s.label.toLowerCase()===label.toLowerCase()))return notice("That status already exists.","error");
      button.disabled=true;
      try{
        const batch=writeBatch(db);
        const records=await getDocs(inventoryRef);
        records.docs.filter(r=>r.data().status===item.label).forEach(r=>batch.update(r.ref,{status:label,updatedAt:serverTimestamp()}));
        batch.update(doc(statusRef,item.id),{label,color,updatedAt:serverTimestamp()});
        await batch.commit();statuses=await loadStatuses();refreshStatusSelect();renderStatusSettings();await loadInventory();notice("Status saved.","success");
      }catch(error){notice(friendlyError(error),"error");}finally{button.disabled=false;}
    }));
    target.querySelectorAll(".archive-status").forEach(button=>button.addEventListener("click",async()=>{
      const row=button.closest(".settings-row"), item=statuses.find(s=>s.id===row.dataset.id);
      if(statuses.filter(s=>s.active!==false).length<2)return notice("Keep at least one active status.","error");
      if(!confirm("Archive "+item.label+"? Existing inventory records will keep this status."))return;
      try{await updateDoc(doc(statusRef,item.id),{active:false,updatedAt:serverTimestamp()});statuses=await loadStatuses();refreshStatusSelect();renderStatusSettings();await loadInventory();notice("Status archived.","success");}
      catch(error){notice(friendlyError(error),"error");}
    }));
  }
  document.querySelector("#inventory-settings-toggle").addEventListener("click",()=>{settings.hidden=!settings.hidden;if(!settings.hidden)renderStatusSettings();});
  document.querySelector("#add-inventory-status").addEventListener("submit",async event=>{
    event.preventDefault();const f=event.currentTarget,label=f.elements.label.value.trim();
    if(!label)return;
    if(statuses.some(s=>s.active!==false&&s.label.toLowerCase()===label.toLowerCase()))return notice("That status already exists.","error");
    try{await addDoc(statusRef,{label,color:f.elements.color.value,sortOrder:(statuses.length+1)*100,active:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});f.reset();statuses=await loadStatuses();refreshStatusSelect();renderStatusSettings();notice("Status added.","success");}
    catch(error){notice(friendlyError(error),"error");}
  });
  cancel.addEventListener("click",resetForm);
  async function loadInventory(){
    try{
      const snapshot=await getDocs(inventoryRef);
      const items=snapshot.docs.map(row=>({id:row.id,...row.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
      if(!items.length){list.innerHTML='<p class="empty-state">No inventory yet.</p>';return;}
      list.innerHTML=items.map(item=>{
        const savings=item.paidPriceCents!=null&&item.regularPriceCents!=null?Number(item.regularPriceCents)-Number(item.paidPriceCents):null;
        const linked=item.assignedGiftId?'<p class="gift-meta">Assigned to a gift list; purchase details were carried over.</p>':"";
        const canAssign=!item.assignedGiftId&&item.status!=="Given"&&item.status!=="Assigned";
        return `<article class="gift-card" draggable="true" data-id="${escapeHtml(item.id)}"><div class="gift-card-top"><h3>${escapeHtml(item.item)}</h3><span class="gift-status" style="background:${(statuses.find(s=>s.label===item.status)||{}).color||"#e8efe9"}">${escapeHtml(item.status||"")}</span></div>
          <p>${item.intendedUse?"Intended use: "+escapeHtml(item.intendedUse):"No intended use added"}${item.store?" · "+escapeHtml(item.store):""}</p>
          <div class="gift-prices"><span>Paid: ${item.paidPriceCents==null?"—":formatMoney(item.paidPriceCents)}</span><span>Regular: ${item.regularPriceCents==null?"—":formatMoney(item.regularPriceCents)}</span><span>Savings: ${savings==null?"—":formatMoney(savings)}</span></div>
          ${item.purchaseDate?'<p class="gift-meta">Purchased: '+escapeHtml(formatBirthday(item.purchaseDate))+'</p>':""}${item.notes?'<p class="gift-notes-text">'+escapeHtml(item.notes)+'</p>':""}${linked}
          <div class="gift-card-actions">${!item.assignedGiftId?'<button class="text-button edit-inventory" type="button" data-id="'+escapeHtml(item.id)+'">Edit</button><button class="text-button delete-inventory" type="button" data-id="'+escapeHtml(item.id)+'">Delete</button>':""}${canAssign?'<button class="text-button assign-inventory" type="button" data-id="'+escapeHtml(item.id)+'">Assign to gift list</button>':""}</div></article>`;
      }).join("");
      list.querySelectorAll(".edit-inventory").forEach(button=>button.addEventListener("click",()=>{
        const item=items.find(i=>i.id===button.dataset.id);if(!item)return;editingId=item.id;
        form.elements.item.value=item.item||"";form.elements.intendedUse.value=item.intendedUse||"";
        refreshStatusSelect(item.status);form.elements.paidPrice.value=item.paidPriceCents==null?"":(item.paidPriceCents/100).toFixed(2);
        form.elements.regularPrice.value=item.regularPriceCents==null?"":(item.regularPriceCents/100).toFixed(2);
        form.elements.store.value=item.store||"";form.elements.purchaseDate.value=item.purchaseDate||"";form.elements.notes.value=item.notes||"";
        save.textContent="Save changes";cancel.hidden=false;form.scrollIntoView({behavior:"smooth",block:"start"});
      }));
      list.querySelectorAll(".delete-inventory").forEach(button=>button.addEventListener("click",async()=>{
        const item=items.find(i=>i.id===button.dataset.id);if(!item||!confirm('Delete "'+item.item+'"? This cannot be undone.'))return;
        try{await deleteDoc(doc(inventoryRef,item.id));if(editingId===item.id)resetForm();await loadInventory();notice("Inventory item deleted.","success");}
        catch(error){notice(friendlyError(error),"error");}
      }));
      list.querySelectorAll(".assign-inventory").forEach(button=>button.addEventListener("click",()=>{
        const item=items.find(i=>i.id===button.dataset.id);if(!item)return;
        openAssignment(item);
      }));
    }catch(error){list.innerHTML="";notice(friendlyError(error),"error");}
  }
  async function openAssignment(item){
    const old=document.querySelector("#inventory-assignment");if(old)old.remove();
    const modal=document.createElement("section");modal.id="inventory-assignment";modal.className="gift-settings";
    modal.innerHTML=`<h2>Assign ${escapeHtml(item.item)}</h2><p class="section-copy">The purchase details will be copied to the selected gift list. The inventory record stays linked for reference and won't be counted separately in spending totals.</p>
      <form id="inventory-assign-form" class="gift-form">
        <div class="field-group"><label>Assign to</label><select name="targetType"><option value="child">Child</option><option value="recipient">Gift recipient</option><option value="household">Household gifts</option></select></div>
        <div class="field-group" id="assignment-target-wrap"><label>Person</label><select name="targetId" required></select></div>
        <div class="field-group"><label>Gift category</label><select name="category"></select></div>
        <div class="field-group"><label>Gift status</label><select name="giftStatus"></select></div>
        <div class="gift-form-actions"><button class="primary-button" type="submit">Assign gift</button><button class="secondary-button" id="cancel-assignment" type="button">Cancel</button></div>
      </form><p class="auth-message" id="assignment-message" hidden></p>`;
    list.before(modal);
    const assignForm=modal.querySelector("form"), typeSelect=assignForm.elements.targetType, targetSelect=assignForm.elements.targetId;
    const categoryRef=collection(db,"households",householdId,"giftCategories");
    const giftStatusRef=collection(db,"households",householdId,"giftStatuses");
    const categoryDefaults=[["undecided","Undecided","#e8e5dc"],["santa","Santa","#dce8df"],["stocking","Stocking","#f5e3d5"],["main","Main","#dce5f2"],["advent","Advent","#eee2f1"]];
    const giftStatusDefaults=[["need-to-buy","Need to buy","#f5e3d5"],["bought","Bought","#dce5f2"],["wrapped","Wrapped","#dce8df"]];
    for(const [ref,entries] of [[categoryRef,categoryDefaults],[giftStatusRef,giftStatusDefaults]]){
      const existing=await getDocs(ref);
      if(existing.empty){const seed=writeBatch(db);entries.forEach((entry,index)=>seed.set(doc(ref,entry[0]),{label:entry[1],color:entry[2],sortOrder:(index+1)*100,active:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));await seed.commit();}
    }
    const [childrenSnap,recipientsSnap,catsSnap,statusSnap]=await Promise.all([getDocs(collection(db,"households",householdId,"children")),getDocs(collection(db,"households",householdId,"giftRecipients")),getDocs(categoryRef),getDocs(giftStatusRef)]);
    const children=childrenSnap.docs.map(r=>({id:r.id,...r.data()})).filter(x=>x.active!==false);
    const recipients=recipientsSnap.docs.map(r=>({id:r.id,...r.data()})).filter(x=>x.active!==false);
    const categories=catsSnap.docs.map(r=>r.data()).filter(x=>x.active!==false);
    const giftStatuses=statusSnap.docs.map(r=>r.data()).filter(x=>x.active!==false);
    assignForm.elements.category.innerHTML=categories.map(x=>'<option>'+escapeHtml(x.label)+'</option>').join("");
    assignForm.elements.giftStatus.innerHTML=giftStatuses.map(x=>'<option>'+escapeHtml(x.label)+'</option>').join("");
    function refreshTargets(){
      const type=typeSelect.value, options=type==="child"?children:type==="recipient"?recipients:[];
      document.querySelector("#assignment-target-wrap").hidden=type==="household";
      targetSelect.required=type!=="household";
      targetSelect.innerHTML=options.map(x=>'<option value="'+escapeHtml(x.id)+'">'+escapeHtml(x.name)+'</option>').join("");
    }
    typeSelect.addEventListener("change",refreshTargets);refreshTargets();
    modal.querySelector("#cancel-assignment").addEventListener("click",()=>modal.remove());
    assignForm.addEventListener("submit",async event=>{
      event.preventDefault();const submit=assignForm.querySelector('[type=submit]');submit.disabled=true;
      try{
        const type=typeSelect.value,targetId=targetSelect.value;
        if(type!=="household"&&!targetId)throw new Error("Add an active child or recipient before assigning this gift.");
        const giftRef=doc(collection(db,"households",householdId,"gifts"));
        const giftData={item:item.item,category:assignForm.elements.category.value,status:assignForm.elements.giftStatus.value,
          paidPriceCents:item.paidPriceCents??null,regularPriceCents:item.regularPriceCents??null,store:item.store||"",
          purchaseDate:item.purchaseDate||null,notes:item.notes||"",inventoryItemId:item.id,updatedAt:serverTimestamp(),createdAt:serverTimestamp()};
        if(type==="child")giftData.childId=targetId;
        else if(type==="recipient"){giftData.giftType="recipient";giftData.recipientId=targetId;giftData.childId=null;}
        else {giftData.giftType="household";giftData.childId=null;}
        const batch=writeBatch(db);batch.set(giftRef,giftData);
        batch.update(doc(inventoryRef,item.id),{status:(statuses.find(s=>s.id==="assigned")||{}).label||"Assigned",assignedGiftId:giftRef.id,assignedToType:type,assignedToId:targetId||null,updatedAt:serverTimestamp()});
        await batch.commit();modal.remove();resetForm();await loadInventory();notice("Gift assigned. Its purchase details were carried over.","success");
      }catch(error){const el=modal.querySelector("#assignment-message");el.textContent=friendlyError(error);el.dataset.kind="error";el.hidden=false;submit.disabled=false;}
    });
  }
  form.addEventListener("submit",async event=>{
    event.preventDefault();const item=form.elements.item.value.trim();if(!item)return;
    save.disabled=true;save.textContent=editingId?"Saving…":"Adding…";
    try{
      const paid=form.elements.paidPrice.value,regular=form.elements.regularPrice.value;
      const data={item,intendedUse:form.elements.intendedUse.value.trim(),status:form.elements.status.value,
        paidPriceCents:paid===""?null:Math.round(Number(paid)*100),regularPriceCents:regular===""?null:Math.round(Number(regular)*100),
        store:form.elements.store.value.trim(),purchaseDate:form.elements.purchaseDate.value||null,notes:form.elements.notes.value.trim(),updatedAt:serverTimestamp()};
      if(editingId)await updateDoc(doc(inventoryRef,editingId),data);
      else await addDoc(inventoryRef,{...data,assignedGiftId:null,createdAt:serverTimestamp()});
      resetForm();await loadInventory();notice(editingId?"Inventory item updated.":"Added to inventory.","success");
    }catch(error){notice(friendlyError(error),"error");}
    finally{save.disabled=false;if(!editingId)save.textContent="Add to inventory";}
  });
  renderStatusSettings();await loadInventory();
}


async function renderGiftGivers(user, household, householdId) {
  const ref=collection(db,"households",householdId,"giftGivers");
  appRoot.innerHTML=`
    <section class="dashboard-panel">
      <button class="text-button" id="back-gift-givers" type="button">← Household</button>
      <p class="eyebrow">Wishlists</p><h1>Gift-givers</h1>
      <p class="welcome-copy">Manage the people who may shop from your children's wishlists. Each person can eventually have a separate selection for each child.</p>
      <form id="gift-giver-form" class="gift-form">
        <div class="field-group"><label>Name</label><input name="name" maxlength="80" required></div>
        <div class="field-group"><label>Notes (optional)</label><textarea name="notes" rows="2" maxlength="1000"></textarea></div>
        <div class="gift-form-actions"><button class="primary-button" id="save-gift-giver" type="submit">Add gift-giver</button><button class="secondary-button" id="cancel-gift-giver" type="button" hidden>Cancel</button></div>
      </form>
      <p class="auth-message" id="gift-giver-message" role="status" aria-live="polite" hidden></p>
      <div id="gift-giver-list" class="gift-list"><p class="empty-state">Loading gift-givers…</p></div>
    </section>`;
  document.querySelector("#back-gift-givers").addEventListener("click",()=>renderHouseholdHome(user,household,householdId));
  const form=document.querySelector("#gift-giver-form"),list=document.querySelector("#gift-giver-list"),message=document.querySelector("#gift-giver-message");
  const save=document.querySelector("#save-gift-giver"),cancel=document.querySelector("#cancel-gift-giver");
  let entries=[],editingId=null;
  function notice(text,kind="info"){message.textContent=text;message.dataset.kind=kind;message.hidden=false;}
  function reset(){editingId=null;form.reset();save.textContent="Add gift-giver";cancel.hidden=true;}
  cancel.addEventListener("click",reset);
  async function load(){
    try{
      const snap=await getDocs(query(ref,orderBy("name","asc")));
      entries=snap.docs.map(row=>({id:row.id,...row.data()}));
      const active=entries.filter(entry=>entry.active!==false);
      if(!active.length){list.innerHTML='<p class="empty-state">No gift-givers added yet.</p>';return;}
      list.innerHTML=active.map(entry=>`<article class="gift-card"><div class="gift-card-top"><h3>${escapeHtml(entry.name)}</h3></div>
        ${entry.notes?'<p>'+escapeHtml(entry.notes)+'</p>':""}
        <div class="gift-card-actions"><button class="text-button manage-gift-giver" data-id="${escapeHtml(entry.id)}" type="button">Wishlist selections</button><button class="text-button edit-gift-giver" data-id="${escapeHtml(entry.id)}" type="button">Edit</button><button class="text-button archive-gift-giver" data-id="${escapeHtml(entry.id)}" type="button">Archive</button></div></article>`).join("");
      list.querySelectorAll(".manage-gift-giver").forEach(button=>button.addEventListener("click",()=>{
        const entry=entries.find(x=>x.id===button.dataset.id);if(entry)renderGiftGiverSelections(user,household,householdId,entry);
      }));
      list.querySelectorAll(".edit-gift-giver").forEach(button=>button.addEventListener("click",()=>{
        const entry=entries.find(x=>x.id===button.dataset.id);if(!entry)return;
        editingId=entry.id;form.elements.name.value=entry.name||"";form.elements.notes.value=entry.notes||"";
        save.textContent="Save changes";cancel.hidden=false;form.scrollIntoView({behavior:"smooth",block:"start"});
      }));
      list.querySelectorAll(".archive-gift-giver").forEach(button=>button.addEventListener("click",async()=>{
        const entry=entries.find(x=>x.id===button.dataset.id);if(!entry||!confirm("Archive "+entry.name+"? Existing wishlist links and history will be retained."))return;
        button.disabled=true;
        try{await updateDoc(doc(ref,entry.id),{active:false,updatedAt:serverTimestamp()});await load();notice("Gift-giver archived.","success");}
        catch(error){notice(friendlyError(error),"error");button.disabled=false;}
      }));
    }catch(error){notice(friendlyError(error),"error");}
  }
  form.addEventListener("submit",async event=>{
    event.preventDefault();const name=form.elements.name.value.trim();if(!name)return;
    save.disabled=true;
    try{
      const data={name,notes:form.elements.notes.value.trim(),active:true,updatedAt:serverTimestamp()};
      if(editingId)await updateDoc(doc(ref,editingId),data);
      else await addDoc(ref,{...data,createdAt:serverTimestamp()});
      reset();await load();notice("Gift-giver saved.","success");
    }catch(error){notice(friendlyError(error),"error");}
    finally{save.disabled=false;}
  });
  await load();
}

async function sha256Hex(value) {
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}
function newShareToken() {
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"");
}
function shareUrl(token) {
  const url=new URL(window.location.href);
  url.searchParams.set("share",token);
  return url.toString();
}

async function renderGiftGiverSelections(user, household, householdId, giver) {
  const childrenRef=collection(db,"households",householdId,"children");
  const children=(await getDocs(query(childrenRef,orderBy("sortOrder","asc")))).docs.map(row=>({id:row.id,...row.data()})).filter(child=>child.active!==false);
  appRoot.innerHTML=`
    <section class="dashboard-panel">
      <button class="text-button" id="back-givers" type="button">← Gift-givers</button>
      <p class="eyebrow">Wishlist sharing</p><h1>${escapeHtml(giver.name)}</h1>
      <p class="welcome-copy">Choose which items this person should see for each child. Selections refer to the master wishlist, so an item is never duplicated.</p>
      <div id="giver-child-list" class="gift-list"></div>
      <p id="giver-selection-message" class="auth-message" role="status" aria-live="polite" hidden></p>
    </section>`;
  document.querySelector("#back-givers").addEventListener("click",()=>renderGiftGivers(user,household,householdId));
  const target=document.querySelector("#giver-child-list"),message=document.querySelector("#giver-selection-message");
  function notice(text,kind="info"){message.textContent=text;message.dataset.kind=kind;message.hidden=false;}
  if(!children.length){target.innerHTML='<p class="empty-state">Add a child before creating wishlist selections.</p>';return;}
  target.innerHTML=children.map(child=>`<article class="gift-card"><div class="gift-card-top"><h3>${escapeHtml(child.name)}</h3></div><p class="gift-meta" id="selection-count-${escapeHtml(child.id)}">Loading selection…</p><div class="gift-card-actions"><button class="secondary-button edit-selection" data-child-id="${escapeHtml(child.id)}" type="button">Choose items</button></div></article>`).join("");
  target.querySelectorAll(".edit-selection").forEach(button=>button.addEventListener("click",async()=>{
    const child=children.find(x=>x.id===button.dataset.childId);if(!child)return;
    const childItemsRef=collection(db,"households",householdId,"wishlistItems");
    const snapshot=await getDocs(query(childItemsRef,orderBy("sortOrder","asc")));
    const items=snapshot.docs.map(row=>({id:row.id,...row.data()})).filter(item=>item.childId===child.id&&item.availability!=="unavailable");
    const linkId=giver.id+"_"+child.id;
    const linkRef=doc(db,"households",householdId,"shareLinks",linkId);
    const linkSnap=await getDoc(linkRef);
    const selected=new Set(linkSnap.exists()?(linkSnap.data().selectedItemIds||[]):[]);
    const current=target.querySelector("#selection-editor");if(current)current.remove();
    const editor=document.createElement("section");editor.id="selection-editor";editor.className="children-section";
    editor.innerHTML=`<h2>${escapeHtml(child.name)} — selected items</h2><p class="section-copy">Check the items ${escapeHtml(giver.name)} may view. Claimed items remain in the selection so their shared status stays visible.</p><div class="settings-list" id="selection-items"></div><div class="gift-form-actions"><button class="primary-button" id="save-selection" type="button">Save selection</button><button class="secondary-button" id="cancel-selection" type="button">Cancel</button></div>`;
    target.appendChild(editor);
    const itemList=editor.querySelector("#selection-items");
    if(!items.length)itemList.innerHTML='<p class="empty-state">This child's wishlist has no shareable items yet.</p>';
    else itemList.innerHTML=items.map(item=>`<label class="settings-row"><input type="checkbox" value="${escapeHtml(item.id)}" ${selected.has(item.id)?"checked":""}><span>${escapeHtml(item.item)}</span><span class="gift-meta">${escapeHtml(item.availability==="claimed"?"Claimed":item.categoryLabel||"")}</span></label>`).join("");
    editor.querySelector("#cancel-selection").addEventListener("click",()=>editor.remove());
    editor.querySelector("#save-selection").addEventListener("click",async()=>{
      const button=editor.querySelector("#save-selection");button.disabled=true;
      try{
        const selectedItemIds=[...itemList.querySelectorAll("input:checked")].map(input=>input.value);
        const existingLink=await getDoc(linkRef);
        const data={childId:child.id,giftGiverId:giver.id,active:true,selectedItemIds,updatedAt:serverTimestamp()};
        let token=existingLink.exists()?existingLink.data().rawToken:null;
        let tokenHash=existingLink.exists()?existingLink.data().tokenHash:null;
        if(!tokenHash){token=newShareToken();tokenHash=await sha256Hex(token);}
        const shareRef=doc(db,"publicShares",tokenHash);
        const batch=writeBatch(db);
        batch.set(linkRef,{...data,tokenHash,updatedAt:serverTimestamp(),...(existingLink.exists()?{}:{createdAt:serverTimestamp()})},{merge:true});
        batch.set(shareRef,{householdId,childId:child.id,giftGiverId:giver.id,shareLinkId:linkId,selectedItemIds,active:true,updatedAt:serverTimestamp(),...(existingLink.exists()?{}:{createdAt:serverTimestamp()})},{merge:true});
        await batch.commit();
        editor.remove();
        target.querySelector("#selection-count-"+CSS.escape(child.id)).textContent=selectedItemIds.length+" items selected";
        const prior=target.querySelector("#share-url-"+CSS.escape(child.id));
        if(prior)prior.remove();
        if(token){
          const link=document.createElement("div");link.className="auth-message";link.id="share-url-"+child.id;
          link.innerHTML='<strong>Share link</strong><p><input readonly value="'+escapeHtml(shareUrl(token))+'" aria-label="Share link URL"></p><button class="secondary-button copy-share-link" type="button">Copy link</button>';
          target.querySelector('[data-child-id="'+CSS.escape(child.id)+'"]').closest(".gift-card").appendChild(link);
          link.querySelector(".copy-share-link").addEventListener("click",async()=>{await navigator.clipboard.writeText(shareUrl(token));notice("Link copied.","success");});
        } else {
          notice("Selection saved. The existing link token is retained; copy its URL from the saved link section if already available.","success");
        }
        notice("Wishlist selection saved.","success");
      }catch(error){notice(friendlyError(error),"error");button.disabled=false;}
    });
  }));
  for(const child of children){
    const snap=await getDoc(doc(db,"households",householdId,"shareLinks",giver.id+"_"+child.id));
    const count=snap.exists()?(snap.data().selectedItemIds||[]).length:0;
    const el=target.querySelector("#selection-count-"+CSS.escape(child.id));if(el)el.textContent=count+" items selected";
  }
}

async function renderChildWishlist(user, household, householdId, child) {
  const itemsRef=collection(db,"households",householdId,"wishlistItems");
  const categoriesRef=collection(db,"households",householdId,"wishlistCategories");
  const defaults=[["books","Books"],["toys","Toys"],["clothing","Clothing"],["arts-crafts","Arts & Crafts"],["tech","Tech"],["games","Games"],["experiences","Experiences"],["miscellaneous","Miscellaneous"]];
  const existing=await getDocs(categoriesRef);
  if(existing.empty){
    const batch=writeBatch(db);
    defaults.forEach((entry,index)=>batch.set(doc(categoriesRef,entry[0]),{label:entry[1],sortOrder:(index+1)*100,active:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
    await batch.commit();
  }
  let categories=(await getDocs(query(categoriesRef,orderBy("sortOrder","asc")))).docs.map(row=>({id:row.id,...row.data()}));
  appRoot.innerHTML=`
    <section class="dashboard-panel">
      <button class="text-button" id="back-wishlist" type="button">← Household</button>
      <p class="eyebrow">Wishlists</p><h1>${escapeHtml(child.name)}'s wishlist</h1>
      <p class="welcome-copy">One master list for this child. Gift-giver links will use selections from this list, so an item only exists once.</p>
      <section class="children-section">
        <h2>Wishlist categories</h2>
        <div id="wishlist-category-list" class="settings-list"></div>
        <form id="wishlist-category-form" class="settings-add-form"><input name="label" maxlength="40" placeholder="Add a category" required><button class="secondary-button" type="submit">Add category</button></form>
      </section>
      <form id="wishlist-item-form" class="gift-form">
        <div class="field-group"><label>Item</label><input name="item" maxlength="120" required></div>
        <div class="field-group"><label>Description</label><textarea name="description" rows="2" maxlength="1000"></textarea></div>
        <div class="field-group"><label>Product or retailer URL</label><input name="url" type="url" maxlength="1500" placeholder="https://…"></div>
        <div class="field-group"><label>Price ($)</label><input name="price" type="number" min="0" step="0.01"></div>
        <div class="field-group"><label>Category</label><select name="categoryId" required></select></div>
        <div class="field-group"><label>Availability</label><select name="availability"><option value="available">Available</option><option value="unavailable">No longer wanted</option></select></div>
        <div class="gift-form-actions"><button class="primary-button" id="save-wishlist-item" type="submit">Add item</button><button class="secondary-button" id="cancel-wishlist-edit" type="button" hidden>Cancel edit</button></div>
      </form>
      <p class="auth-message" id="wishlist-message" role="status" aria-live="polite" hidden></p>
      <div class="gift-list" id="wishlist-items"><p class="empty-state">Loading wishlist…</p></div>
    </section>`;
  document.querySelector("#back-wishlist").addEventListener("click",()=>renderHouseholdHome(user,household,householdId));
  const form=document.querySelector("#wishlist-item-form"), list=document.querySelector("#wishlist-items");
  const message=document.querySelector("#wishlist-message"), save=document.querySelector("#save-wishlist-item"), cancel=document.querySelector("#cancel-wishlist-edit");
  let editingId=null;
  function notice(text,kind="info"){message.textContent=text;message.dataset.kind=kind;message.hidden=false;}
  function refreshCategorySelect(selected){
    form.elements.categoryId.innerHTML=categories.filter(x=>x.active!==false).map(x=>'<option value="'+escapeHtml(x.id)+'">'+escapeHtml(x.label)+'</option>').join("");
    if(selected)form.elements.categoryId.value=selected;
  }
  function renderCategories(){
    const target=document.querySelector("#wishlist-category-list");
    target.innerHTML=categories.map(category=>`<div class="settings-row" data-id="${escapeHtml(category.id)}"><input class="category-label" maxlength="40" value="${escapeHtml(category.label)}" aria-label="Category name"><button class="secondary-button save-category" type="button">Save</button>${category.active===false?'<span class="archived-label">Archived</span>':'<button class="text-button archive-category" type="button">Archive</button>'}</div>`).join("");
    target.querySelectorAll(".save-category").forEach(button=>button.addEventListener("click",async()=>{
      const row=button.closest(".settings-row"),category=categories.find(x=>x.id===row.dataset.id),label=row.querySelector(".category-label").value.trim();
      if(!label)return notice("Enter a category name.","error");
      if(categories.some(x=>x.id!==category.id&&x.active!==false&&x.label.toLowerCase()===label.toLowerCase()))return notice("That category already exists.","error");
      try{
        const batch=writeBatch(db);
        const records=await getDocs(query(itemsRef,orderBy("sortOrder","asc")));
        records.docs.filter(r=>r.data().childId===child.id&&r.data().categoryId===category.id).forEach(r=>batch.update(r.ref,{categoryLabel:label,updatedAt:serverTimestamp()}));
        batch.update(doc(categoriesRef,category.id),{label,updatedAt:serverTimestamp()});
        await batch.commit();categories=(await getDocs(query(categoriesRef,orderBy("sortOrder","asc")))).docs.map(r=>({id:r.id,...r.data()}));
        refreshCategorySelect();renderCategories();await loadItems();notice("Category saved.","success");
      }catch(error){notice(friendlyError(error),"error");}
    }));
    target.querySelectorAll(".archive-category").forEach(button=>button.addEventListener("click",async()=>{
      const row=button.closest(".settings-row"),category=categories.find(x=>x.id===row.dataset.id);
      if(categories.filter(x=>x.active!==false).length<2)return notice("Keep at least one active category.","error");
      if(!confirm("Archive "+category.label+"? Existing items will keep their category."))return;
      try{await updateDoc(doc(categoriesRef,category.id),{active:false,updatedAt:serverTimestamp()});categories=(await getDocs(query(categoriesRef,orderBy("sortOrder","asc")))).docs.map(r=>({id:r.id,...r.data()}));refreshCategorySelect();renderCategories();await loadItems();}
      catch(error){notice(friendlyError(error),"error");}
    }));
  }
  document.querySelector("#wishlist-category-form").addEventListener("submit",async event=>{
    event.preventDefault();const f=event.currentTarget,label=f.elements.label.value.trim();
    if(!label)return;
    if(categories.some(x=>x.active!==false&&x.label.toLowerCase()===label.toLowerCase()))return notice("That category already exists.","error");
    try{await addDoc(categoriesRef,{label,sortOrder:(categories.length+1)*100,active:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});f.reset();categories=(await getDocs(query(categoriesRef,orderBy("sortOrder","asc")))).docs.map(r=>({id:r.id,...r.data()}));refreshCategorySelect();renderCategories();notice("Category added.","success");}
    catch(error){notice(friendlyError(error),"error");}
  });
  function resetForm(){editingId=null;form.reset();form.elements.availability.querySelector("option[value='claimed']")?.remove();refreshCategorySelect();save.textContent="Add item";cancel.hidden=true;}
  cancel.addEventListener("click",resetForm);
  async function loadItems(){
    try{
      const snapshot=await getDocs(query(itemsRef,orderBy("sortOrder","asc")));
      const items=snapshot.docs.map(row=>({id:row.id,...row.data()})).filter(item=>item.childId===child.id);
      if(!items.length){list.innerHTML='<p class="empty-state">No wishlist items yet.</p>';return;}
      list.innerHTML=items.map(item=>{
        const category=categories.find(x=>x.id===item.categoryId);
        return `<article class="gift-card" draggable="true" data-id="${escapeHtml(item.id)}"><div class="gift-card-top"><h3>${escapeHtml(item.item)}</h3><span class="gift-status">${escapeHtml(category?.label||item.categoryLabel||"Uncategorized")}</span></div>
          ${item.description?'<p>'+escapeHtml(item.description)+'</p>':""}
          <div class="gift-prices"><span>Price: ${item.priceCents==null?"—":formatMoney(item.priceCents)}</span><span>${item.availability==="claimed"?"Claimed":item.availability==="unavailable"?"No longer wanted":"Available"}</span></div>
          ${item.url?'<p><a href="'+escapeHtml(item.url)+'" target="_blank" rel="noopener noreferrer">View item</a></p>':""}
          ${item.claimedByName?'<p class="gift-meta">Claimed by '+escapeHtml(item.claimedByName)+'</p>':""}
          <div class="gift-card-actions"><button class="text-button move-wishlist-up" data-id="${escapeHtml(item.id)}" type="button" aria-label="Move item up">↑</button><button class="text-button move-wishlist-down" data-id="${escapeHtml(item.id)}" type="button" aria-label="Move item down">↓</button><button class="text-button edit-wishlist-item" data-id="${escapeHtml(item.id)}" type="button">Edit</button><button class="text-button delete-wishlist-item" data-id="${escapeHtml(item.id)}" type="button">Delete</button></div></article>`;
      }).join("");
      list.querySelectorAll(".edit-wishlist-item").forEach(button=>button.addEventListener("click",()=>{
        const item=items.find(x=>x.id===button.dataset.id);if(!item)return;editingId=item.id;
        form.elements.item.value=item.item||"";form.elements.description.value=item.description||"";form.elements.url.value=item.url||"";
        form.elements.price.value=item.priceCents==null?"":(item.priceCents/100).toFixed(2);
        refreshCategorySelect(item.categoryId);
        const availability=form.elements.availability;
        availability.querySelector("option[value='claimed']")?.remove();
        if(item.availability==="claimed")availability.add(new Option("Claimed","claimed"));
        availability.value=["available","unavailable","claimed"].includes(item.availability)?item.availability:"available";
        save.textContent="Save changes";cancel.hidden=false;form.scrollIntoView({behavior:"smooth",block:"start"});
      }));
      let draggedId=null;
      list.querySelectorAll(".gift-card[draggable='true']").forEach(card=>{
        card.addEventListener("dragstart",event=>{draggedId=card.dataset.id;event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("text/plain",draggedId);});
        card.addEventListener("dragover",event=>{event.preventDefault();event.dataTransfer.dropEffect="move";});
        card.addEventListener("drop",async event=>{
          event.preventDefault();const sourceId=draggedId||event.dataTransfer.getData("text/plain");draggedId=null;
          if(!sourceId||sourceId===card.dataset.id)return;
          const from=items.findIndex(x=>x.id===sourceId),to=items.findIndex(x=>x.id===card.dataset.id);if(from<0||to<0)return;
          const reordered=[...items];const moved=reordered.splice(from,1)[0];reordered.splice(to,0,moved);
          const batch=writeBatch(db);reordered.forEach((entry,i)=>batch.update(doc(itemsRef,entry.id),{sortOrder:(i+1)*100,updatedAt:serverTimestamp()}));
          try{await batch.commit();await loadItems();}catch(error){notice(friendlyError(error),"error");}
        });
      });
      list.querySelectorAll(".move-wishlist-up, .move-wishlist-down").forEach(button=>button.addEventListener("click",async()=>{
        const index=items.findIndex(x=>x.id===button.dataset.id),delta=button.classList.contains("move-wishlist-up")?-1:1,target=index+delta;
        if(index<0||target<0||target>=items.length)return;
        const reordered=[...items];[reordered[index],reordered[target]]=[reordered[target],reordered[index]];
        const batch=writeBatch(db);reordered.forEach((entry,i)=>batch.update(doc(itemsRef,entry.id),{sortOrder:(i+1)*100,updatedAt:serverTimestamp()}));
        button.disabled=true;
        try{await batch.commit();await loadItems();}catch(error){notice(friendlyError(error),"error");button.disabled=false;}
      }));
      list.querySelectorAll(".delete-wishlist-item").forEach(button=>button.addEventListener("click",async()=>{
        const item=items.find(x=>x.id===button.dataset.id);if(!item||!confirm('Delete "'+item.item+'"?'))return;
        try{await deleteDoc(doc(itemsRef,item.id));if(editingId===item.id)resetForm();await loadItems();notice("Wishlist item deleted.","success");}
        catch(error){notice(friendlyError(error),"error");}
      }));
    }catch(error){notice(friendlyError(error),"error");}
  }
  form.addEventListener("submit",async event=>{
    event.preventDefault();const item=form.elements.item.value.trim();if(!item)return;
    save.disabled=true;
    try{
      const price=form.elements.price.value;
      const categoryId=form.elements.categoryId.value;
      const category=categories.find(x=>x.id===categoryId);
      const data={childId:child.id,item,description:form.elements.description.value.trim(),url:form.elements.url.value.trim(),
        priceCents:price===""?null:Math.round(Number(price)*100),categoryId,categoryLabel:category?.label||"",
        availability:form.elements.availability.value,updatedAt:serverTimestamp()};
      if(editingId)await updateDoc(doc(itemsRef,editingId),data);
      else await addDoc(itemsRef,{...data,sortOrder:(await getDocs(itemsRef)).size*100,claimedByName:null,claimedAt:null,createdAt:serverTimestamp()});
      resetForm();await loadItems();notice("Wishlist item saved.","success");
    }catch(error){notice(friendlyError(error),"error");}
    finally{save.disabled=false;}
  });
  refreshCategorySelect();renderCategories();await loadItems();
}

function formatMoney(cents) {
  return "$" + (Number(cents || 0) / 100).toFixed(2);
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
