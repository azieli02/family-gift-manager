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
