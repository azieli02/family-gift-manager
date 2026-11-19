# Firestore security test plan

Run these tests in the Firebase Local Emulator Suite before deploying rules or entering real family data.

## Current baseline

`firestore.rules` currently permits authenticated active household members to access their household data. Guest access is limited to token-scoped public share metadata and selected wishlist item documents. Guests cannot list wishlist items or read household-private data. Membership documents cannot be changed from the client in this baseline.

Before testing guest links, enable **Authentication → Sign-in method → Anonymous** in the Firebase console. Guest wishlist access uses Firebase Anonymous Authentication. A guest session is bound to one unguessable token hash. The public share document exposes only its selected item IDs and household/child references; guests fetch selected wishlist documents individually, not by listing a household collection. Guest claim writes must atomically update the shared wishlist item and create a claim-history event. Do not deploy until the complete emulator suite passes and the client flow is implemented and tested.

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

## Guest access tests

| Test | Expected |
|---|---|
| Guest opens a valid share link | Anonymous sign-in, token-bound session, and only that curated list is readable |
| Guest reads household-private data | Denied |
| Guest enumerates or lists other share links | Denied |
| Guest claims an item selected for that link | Allowed after name + confirmation |
| Guest claims an item not selected for that link | Denied |
| Guest changes item name, URL, price, category, description, or sort order | Denied |
| Guest claims an already-claimed or unavailable item | Denied |
| Two guests claim the same item concurrently | At most one succeeds |
| Claim appears in every filtered view containing the item | Yes |
| Guest reads parent-only claim history | Denied; parent can read the event |
| Parent undoes claim | Allowed; item becomes available in every view |

## Release gate

- Run the parent tests against the exact checked-in rules.
- Implement guest token reads and claims only after selecting a data path that can enforce both the per-link item filter and the single shared claim state.
- Run all guest tests, including concurrent-claim behavior, against the Emulator Suite.
- Do not deploy rules or connect production data while any required test fails.

## Token-scoped implementation notes

- Public share records live at `publicShares/{tokenHash}`; they contain no item descriptions, names, prices, or other wishlist details.
- The raw random token belongs in the URL only. The client hashes it with SHA-256 and uses the hash as the public share document ID.
- `guestSessions/{uid}` binds an anonymous Firebase Auth UID to one active token hash.
- Guest clients read each selected item by document ID. Collection listing is denied to guests.
- A guest claim is one Firestore batch: update only the canonical wishlist item's claim fields and create `claims/{itemId}`. Rules use `getAfter()` to require both writes to agree; the deterministic history ID also prevents a second claim event from being created for the same active claim.
- A guest cannot undo a claim. Only an active household member can reset the item and write an undo history event.
- Enable Firebase Anonymous Authentication in the Firebase console before enabling the guest UI. It is free under the Firebase Spark plan.


## Current implementation checkpoint

The parent selection screen now publishes a minimal `publicShares/{tokenHash}` record alongside the private `shareLinks` record. The 256-bit random token is placed in the URL and cached locally in that browser; only its SHA-256 hash is stored in Firestore. If the browser cache is lost, saving the selection rotates the token and disables the previous public share record.

The guest route uses the `?share=` URL parameter, signs in anonymously, binds that anonymous UID to the token hash, reads selected item documents individually, and submits claims as a batch. This is an implementation checkpoint, not a release approval: emulator results and browser testing are still required.
