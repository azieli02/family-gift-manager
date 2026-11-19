import { readFile } from "node:fs/promises";
import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
  serverTimestamp
} from "firebase/firestore";

const projectId = "family-gift-manager-rules-test";
let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8")
    }
  });
});

beforeEach(async () => testEnv.clearFirestore());
after(async () => testEnv.cleanup());

async function createHouseholdAs(uid, householdId, name = "Test Household") {
  const db = testEnv.authenticatedContext(uid).firestore();
  const batch = writeBatch(db);
  batch.set(doc(db, "households", householdId), {
    name,
    timezone: "America/Detroit",
    ownerUid: uid,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  batch.set(doc(db, "households", householdId, "members", uid), {
    role: "owner",
    active: true,
    joinedAt: serverTimestamp()
  });
  batch.set(doc(db, "users", uid), {
    householdIds: [householdId],
    createdAt: serverTimestamp()
  });
  await batch.commit();
  return db;
}

test("a parent can create their first household and owner membership atomically", async () => {
  const db = await createHouseholdAs("parent-a", "household-a");
  const household = await assertSucceeds(getDoc(doc(db, "households", "household-a")));
  assert.equal(household.data().ownerUid, "parent-a");
  const member = await assertSucceeds(getDoc(doc(db, "households", "household-a", "members", "parent-a")));
  assert.equal(member.data().role, "owner");
});

test("a different parent cannot read another household", async () => {
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, "households", "household-a"), {
      name: "A", timezone: "America/Detroit", ownerUid: "parent-a", active: true
    });
    await setDoc(doc(db, "households", "household-a", "members", "parent-a"), {
      role: "owner", active: true
    });
  });
  const otherDb = testEnv.authenticatedContext("parent-b").firestore();
  await assertFails(getDoc(doc(otherDb, "households", "household-a")));
});

test("a parent cannot write another household's data", async () => {
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, "households", "household-a"), {
      name: "A", timezone: "America/Detroit", ownerUid: "parent-a", active: true
    });
    await setDoc(doc(db, "households", "household-a", "members", "parent-a"), {
      role: "owner", active: true
    });
  });
  const otherDb = testEnv.authenticatedContext("parent-b").firestore();
  await assertFails(setDoc(doc(otherDb, "households", "household-a", "children", "child-1"), {
    name: "Not allowed"
  }));
});

test("a parent cannot modify membership records", async () => {
  const db = await createHouseholdAs("parent-a", "household-a");
  await assertFails(setDoc(doc(db, "households", "household-a", "members", "parent-a"), {
    role: "owner", active: false
  }));
});

test("clients cannot access public guest shares yet", async () => {
  const db = testEnv.authenticatedContext("parent-a").firestore();
  await assertFails(getDoc(doc(db, "publicShares", "some-token")));
});

test("a parent can create a valid child profile in their household", async () => {
  const db = await createHouseholdAs("parent-a", "household-a");
  await assertSucceeds(setDoc(doc(db, "households", "household-a", "children", "child-1"), {
    name: "Casey",
    displayName: "Casey",
    birthday: "2018-04-12",
    active: true,
    sortOrder: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }));
});

test("child profiles reject unexpected fields", async () => {
  const db = await createHouseholdAs("parent-a", "household-a");
  await assertFails(setDoc(doc(db, "households", "household-a", "children", "child-1"), {
    name: "Casey",
    displayName: "Casey",
    birthday: null,
    active: true,
    sortOrder: 0,
    privateAdminFlag: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }));
});

test("a parent can manage inventory items and their configurable statuses", async () => {
  const db = await createHouseholdAs("parent-a", "household-a");
  await assertSucceeds(setDoc(doc(db, "households", "household-a", "inventory", "inventory-1"), {
    item: "Board game", status: "Available", paidPriceCents: 2500
  }));
  await assertSucceeds(setDoc(doc(db, "households", "household-a", "inventoryStatuses", "available"), {
    label: "Available", color: "#dce8df", sortOrder: 100, active: true
  }));
});

test("a parent can manage gift-givers and master wishlist records in their household", async () => {
  const db = await createHouseholdAs("parent-a", "household-a");
  await assertSucceeds(setDoc(doc(db, "households", "household-a", "giftGivers", "giver-1"), {
    name: "Aunt Casey", notes: "", active: true
  }));
  await assertSucceeds(setDoc(doc(db, "households", "household-a", "wishlistItems", "item-1"), {
    childId: "child-1", item: "Book", availability: "available", sortOrder: 100
  }));
  await assertSucceeds(setDoc(doc(db, "households", "household-a", "wishlistCategories", "books"), {
    label: "Books", sortOrder: 100, active: true
  }));
});

test("a parent cannot access another household's gift-giver or wishlist records", async () => {
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, "households", "household-a"), {
      name: "A", timezone: "America/Detroit", ownerUid: "parent-a", active: true
    });
    await setDoc(doc(db, "households", "household-a", "members", "parent-a"), {
      role: "owner", active: true
    });
  });
  const otherDb = testEnv.authenticatedContext("parent-b").firestore();
  await assertFails(getDoc(doc(otherDb, "households", "household-a", "giftGivers", "giver-1")));
  await assertFails(setDoc(doc(otherDb, "households", "household-a", "wishlistItems", "item-1"), {
    item: "Unauthorized"
  }));
});

async function seedPublicShare() {
  await testEnv.withSecurityRulesDisabled(async context => {
    const db=context.firestore();
    await setDoc(doc(db,"households","household-a"),{name:"A",timezone:"America/Detroit",ownerUid:"parent-a",active:true});
    await setDoc(doc(db,"households","household-a","members","parent-a"),{role:"owner",active:true});
    await setDoc(doc(db,"households","household-a","wishlistItems","item-selected"),{
      childId:"child-1",item:"Book",availability:"available",sortOrder:100
    });
    await setDoc(doc(db,"households","household-a","wishlistItems","item-private"),{
      childId:"child-1",item:"Private item",availability:"available",sortOrder:200
    });
  });
  const parent=testEnv.authenticatedContext("parent-a").firestore();
  const batch=writeBatch(parent);
  batch.set(doc(parent,"households","household-a","shareLinks","giver_child"),{
    childId:"child-1",giftGiverId:"giver-1",selectedItemIds:["item-selected"],active:true
  });
  batch.set(doc(parent,"publicShares","token-hash-123"),{
    householdId:"household-a",childId:"child-1",giftGiverId:"giver-1",
    shareLinkId:"giver_child",selectedItemIds:["item-selected"],active:true
  });
  await assertSucceeds(batch.commit());
}

test("a guest session can read only its own active share and selected wishlist items", async () => {
  await seedPublicShare();
  const guest=testEnv.authenticatedContext("guest-1").firestore();
  await assertSucceeds(setDoc(doc(guest,"guestSessions","guest-1"),{
    tokenHash:"token-hash-123",createdAt:serverTimestamp()
  }));
  await assertSucceeds(getDoc(doc(guest,"publicShares","token-hash-123")));
  await assertSucceeds(getDoc(doc(guest,"households","household-a","wishlistItems","item-selected")));
  await assertFails(getDoc(doc(guest,"households","household-a","wishlistItems","item-private")));
  await assertFails(getDoc(doc(guest,"households","household-a","children","child-1")));
  await assertFails(getDoc(doc(guest,"households","household-a","shareLinks","giver_child")));
  await assertFails(getDoc(doc(guest,"publicShares","another-token")));
});

test("a guest can atomically claim a selected available item and create parent-only history", async () => {
  await seedPublicShare();
  const guest=testEnv.authenticatedContext("guest-1").firestore();
  await assertSucceeds(setDoc(doc(guest,"guestSessions","guest-1"),{
    tokenHash:"token-hash-123",createdAt:serverTimestamp()
  }));
  const batch=writeBatch(guest);
  batch.update(doc(guest,"households","household-a","wishlistItems","item-selected"),{
    availability:"claimed",claimedByName:"Aunt Casey",claimedAt:serverTimestamp(),updatedAt:serverTimestamp()
  });
  batch.set(doc(guest,"households","household-a","claims","item-selected"),{
    itemId:"item-selected",childId:"child-1",enteredName:"Aunt Casey",
    eventType:"claimed",createdAt:serverTimestamp(),shareTokenHash:"token-hash-123"
  });
  await assertSucceeds(batch.commit());
  await assertFails(getDoc(doc(guest,"households","household-a","claims","item-selected")));
  const parent=testEnv.authenticatedContext("parent-a").firestore();
  const claim=await assertSucceeds(getDoc(doc(parent,"households","household-a","claims","item-selected")));
  assert.equal(claim.data().enteredName,"Aunt Casey");
});

test("guests cannot claim unselected items, overwrite claims, or edit wishlist details", async () => {
  await seedPublicShare();
  const guest=testEnv.authenticatedContext("guest-1").firestore();
  await assertSucceeds(setDoc(doc(guest,"guestSessions","guest-1"),{
    tokenHash:"token-hash-123",createdAt:serverTimestamp()
  }));
  await assertFails(updateDoc(doc(guest,"households","household-a","wishlistItems","item-private"),{
    availability:"claimed",claimedByName:"Guest",claimedAt:serverTimestamp()
  }));
  await assertFails(updateDoc(doc(guest,"households","household-a","wishlistItems","item-selected"),{
    item:"Changed item",availability:"claimed",claimedByName:"Guest",claimedAt:serverTimestamp()
  }));
  const batch=writeBatch(guest);
  batch.update(doc(guest,"households","household-a","wishlistItems","item-selected"),{
    availability:"claimed",claimedByName:"Guest",claimedAt:serverTimestamp()
  });
  batch.set(doc(guest,"households","household-a","claims","claim-2"),{
    itemId:"item-selected",childId:"child-1",enteredName:"Guest",
    eventType:"claimed",createdAt:serverTimestamp(),shareTokenHash:"token-hash-123"
  });
  await assertFails(batch.commit());
  await assertFails(updateDoc(doc(guest,"households","household-a","wishlistItems","item-selected"),{
    availability:"claimed",claimedByName:"Another guest",claimedAt:serverTimestamp()
  }));
});
