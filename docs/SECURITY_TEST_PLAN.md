# Firestore security test plan

Run these tests in the Firebase Local Emulator Suite before deploying rules or entering real family data.

## Current baseline

`firestore.rules` currently permits authenticated active household members to access their household data. It denies all guest access and denies all access to paths not explicitly allowed. Membership documents cannot be changed from the client in this baseline.

This is intentionally a safe starting point, not the completed guest wishlist ruleset. Do not deploy the app expecting guest links to work yet.

## Parent access tests

| Test | Expected |
|---|---|
| Unauthenticated user reads a household | Denied |
| Authenticated user with no membership reads a household | Denied |
| Active member reads own household | Allowed |
| Active member reads own household subcollection | Allowed |
| Active member writes own household subcollection | Allowed |
| Inactive member reads household | Denied |
| Member from Household A reads Household B | Denied |
| Member attempts to edit membership records | Denied |
| Any user reads an unrecognized top-level path | Denied |

## Guest access tests (to add with guest rules)

| Test | Expected |
|---|---|
| Guest opens a valid share link | Only that curated list is readable |
| Guest reads household-private data | Denied |
| Guest enumerates or lists other share links | Denied |
| Guest claims an item selected for that link | Allowed after name + confirmation |
| Guest claims an item not selected for that link | Denied |
| Guest changes item name, URL, price, category, description, or sort order | Denied |
| Guest claims an already-claimed or unavailable item | Denied |
| Two guests claim the same item concurrently | At most one succeeds |
| Claim appears in every filtered view containing the item | Yes |
| Guest reads parent-only claim history | Denied |
| Parent undoes claim | Allowed; item becomes available in every view |

## Release gate

- Run the parent tests against the exact checked-in rules.
- Implement guest token reads and claims only after selecting a data path that can enforce both the per-link item filter and the single shared claim state.
- Run all guest tests, including concurrent-claim behavior, against the Emulator Suite.
- Do not deploy rules or connect production data while any required test fails.
