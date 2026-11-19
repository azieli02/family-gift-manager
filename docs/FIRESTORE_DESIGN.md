# Firestore data model — proposed architecture

This is the working logical model. It is not a set of collections to create manually yet. Security Rules and guest claim behavior must be tested in the Firebase Emulator Suite before production use.

## Design principles

- Every private record belongs to exactly one household.
- Parent access is determined by household membership, not by which screen the frontend displays.
- Store money as integer cents, not floating-point currency.
- Store timestamps as Firestore timestamps; store date-only values (such as birthdays) as normalized YYYY-MM-DD strings.
- Keep guest-readable projections separate from private parent records.
- Use high-entropy random share tokens. Treat links as bearer credentials: anyone who receives one can open it.
- Firestore Security Rules are the security boundary. Frontend filtering is not security.
- Keep the design compatible with the Firebase Spark plan; do not assume Cloud Functions.

## 1. Household-private data

### households/{householdId}
- name
- timezone (default America/Detroit)
- ownerUid
- createdAt
- active

### households/{householdId}/members/{uid}
- role (owner or parent)
- active
- joinedAt

### Household subcollections

- children/{childId}
- giftRecipients/{recipientId} — people this household buys gifts for
- giftGivers/{giftGiverId} — people who may buy wishlist gifts
- giftGiverBudgets/{budgetId} — keyed by gift-giver and child
- gifts/{giftId} — child, household, or recipient gift records, with a scope/type field
- inventory/{inventoryItemId} — unassigned gift inventory; assignment preserves original purchase data
- giftCategories/{categoryId}
- giftStatuses/{statusId}
- wishlistCategories/{categoryId}
- wishlistItems/{itemId}
- shareLinks/{shareLinkId} — private parent-side configuration, recipient association, and token metadata
- claims/{claimId} — parent-only claim history and attribution

All documents in these paths are readable/writable only by active members of the owning household, with role restrictions where appropriate.

## 2. Guest wishlist access

Use a separate public projection rather than granting guests access to household collections.

### publicWishlists/{shareToken}
Minimal guest-facing header:
- childDisplayName (or parent-selected nickname)
- active
- presentation settings that are safe to expose

### publicWishlists/{shareToken}/items/{shareItemId}
Only fields needed to render that curated link:
- itemDisplayName
- description (optional)
- productUrl (optional)
- price (optional)
- categoryLabel
- sortOrder
- claimKey — opaque random key for the underlying master wishlist item

Do not include household IDs, parent UIDs, budgets, gift-giver names, private notes, purchase history, or claim attribution.

The token is a long random URL-safe value, not a sequential ID. Firestore rules must allow exact document reads for a valid link but deny collection listing and all access to household-private paths. Do not treat an unlisted URL as a substitute for restrictive rules.

## 3. One shared claim state per master wishlist item

### publicClaimStates/{claimKey}
Minimal shared state:
- state: available | claimed | unavailable
- claimSourceId: opaque ID for the share link used to claim (only if claimed)
- claimedAt
- updatedAt

Every curated guest projection for the same master wishlist item carries the same claimKey. All guest views read the same publicClaimStates document. Therefore a claim made from one link appears as claimed on every other link that contains that item.

The claim state must not contain a person's name, email, or other claimant identity. claimSourceId is an opaque internal ID; only parents can resolve it to a gift-giver/share link in their household-private data.

### Claim operation

- A guest uses the share token to load only that share's public projection.
- The client submits a Firestore transaction that reads the claim state and changes available to claimed.
- The transaction also supplies the opaque claimSourceId associated with the current share.
- Security Rules validate that the claimSourceId is authorized for that claimKey, that the current state is available, and that only the allowed state fields change.
- Firestore transactions are atomic and retry when concurrent writes conflict. If another guest claims first, the second claim must fail rather than overwrite it.
- Parent claim history is maintained separately and remains private. The precise transaction/rules mechanism for recording that history must be validated in the emulator before implementation; do not expose claimant identity in the public state.

A parent can reverse a claim through an authenticated, household-authorized operation. The public claim state then returns to available (or to the appropriate parent-selected state), updating every guest view.

## 4. Parent-only claim attribution

Private household claim records map claimSourceId to the relevant share link/gift-giver and record the claim event. Guests must not be able to read these records.

The public state may reveal only an opaque claimSourceId, never its human-readable mapping. If emulator testing shows that this still exposes more metadata than desired, use a stricter receipt design before launch.

## 5. Security and testing requirements

Before connecting real app screens or creating production data, write and test rules for:

1. A parent in Household A cannot read or write any document belonging to Household B.
2. A guest with Share Link A can read only the public projection for Link A and its referenced claim states.
3. A guest cannot list all share links, enumerate tokens, or read household-private data.
4. A guest cannot edit wishlist text, prices, categories, order, or another household record.
5. A guest cannot claim an item that is already claimed or unavailable.
6. Two simultaneous claim attempts cannot both succeed.
7. A claim updates the shared state seen by every curated link containing that item.
8. Guest reads never reveal gift-giver identity or parent-only claim history.
9. A parent can undo a claim and the change appears across all guest views.

Use the Firebase Local Emulator Suite and automated rules tests before deploying rules. Start from deny-all rules; never use open read/write rules in a deployed app.

## 6. Other data decisions

- Gift recipients and gift-givers remain separate directories, even if the same person appears in both.
- Gift categories and purchase statuses are separate configurable records.
- Wishlist category and availability status are separate fields.
- Drag-and-drop sort order is stored explicitly; no priority field.
- Inventory assignment must preserve the original purchase data and avoid duplicate entry. The exact representation (linked gift record versus transfer of the inventory record) can be decided when that workflow is implemented.

## 7. Still to decide

1. Exact document fields for each gift and wishlist record.
2. Whether parent claim history is recorded by an additional client-side write in the same transaction or a receipt document validated by Security Rules.
3. Exact owner invitation/deactivation workflow.
4. Whether multiple parent accounts per household need distinct roles beyond owner and parent.

No collections or security rules should be created from this draft until the guest claim and attribution tests pass.
