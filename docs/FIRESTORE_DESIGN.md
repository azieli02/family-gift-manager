# Firestore data model — working proposal

This model reflects the intended behavior: each child's wishlist is the master list; each gift-giver link is a filtered view of that list. An item exists once and has one shared claim state, even when several gift-givers see it.

This is a logical design, not a set of collections to create manually. The guest claim authorization pattern must pass Firebase Emulator security-rule tests before production use.

## Design principles

- Every private record belongs to exactly one household.
- Parent access is determined by active household membership.
- Store money as integer cents.
- Store timestamps as Firestore timestamps; store date-only values (such as birthdays) as YYYY-MM-DD strings.
- Keep private parent metadata separate from guest-readable fields.
- Use long, random, unlisted share tokens. Anyone who receives a link can open it.
- Security Rules—not frontend filtering—must enforce household and guest access.
- Stay compatible with Firebase Spark; do not assume Cloud Functions.

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
- giftGiverBudgets/{budgetId} — budget per gift-giver and child
- gifts/{giftId} — child, household, or recipient gift records, distinguished by scope/type
- inventory/{inventoryItemId} — unassigned gifts; assignment preserves original purchase data
- giftCategories/{categoryId}
- giftStatuses/{statusId}
- wishlistCategories/{categoryId}
- wishlistItems/{itemId} — one master record per child's wishlist item
- shareLinks/{shareLinkId} — private link configuration, gift-giver association, and selected item IDs
- claims/{claimId} — private claim history and attribution

A master wishlist item contains the guest-display fields (name, description, URL, price, category, availability and sort order) plus parent-only fields as needed. The guest must never receive parent-only fields.

## 2. Filtered gift-giver views

A share link is a filtered report of the child's master wishlist, not a second wishlist.

### households/{householdId}/shareLinks/{shareLinkId}
Private parent-side configuration:
- childId
- giftGiverId
- active
- selectedItemIds (or a normalized selection subcollection)
- tokenHash / secure token lookup metadata
- createdAt

Each gift-giver gets one persistent link per child. Changing the selected items changes the report, not the URL. The same master item can be selected for multiple gift-givers.

The raw bearer token should not be stored in a broadly readable household document. Resolve it through a narrowly scoped public token document or equivalent secure lookup.

## 3. Guest-readable projection

Guests must not be granted read access to household collections. Use a public-facing projection that exposes only:
- child's display name or chosen nickname
- selected item name, description, product URL, price, category and sort order
- shared claim state

The projection is a read facade for the master records, not an independently editable wishlist. Parent changes to the master item or link selection must update what the guest sees.

A likely structure is a token-addressed public link document with selected item references, plus a single canonical guest-safe state/projection per master item. The exact paths and rules are not finalized until the access tests pass. This avoids exposing household IDs, parent UIDs, budgets, private notes, gift-giver directories, purchase records, or claim attribution.

## 4. Shared claim state

Each master wishlist item has exactly one claim state, shared by every filtered view that includes it:
- available
- claimed
- unavailable (for example, no longer wanted)

A claim changes the state of the underlying master item. Every gift-giver's filtered view reflects that state because they all reference the same item/state.

The public-facing state must not contain a person's name, email, or other claimant identity.

### Claim attribution

The parent needs to know which gift-giver link was used. Keep that attribution in a separate parent-only claim record, mapping an opaque share-link identifier to the claim event. Never expose that mapping to guests.

### Race safety

The claim operation must be atomic:
1. Confirm the item is currently available.
2. Confirm the requesting share link is entitled to show that item.
3. Change the one shared claim state to claimed.
4. Record private attribution to the share link.

Two simultaneous guests must not both succeed. A Firestore transaction or atomic batch plus restrictive Security Rules may be viable on Spark, but rules must prove both link authorization and the private attribution write. Firestore rules cannot run arbitrary server logic or safely infer a caller's link merely because the frontend says so.

**Important unresolved implementation detail:** Security Rules need a verifiable way to connect a guest's token-scoped claim request to the canonical item update and private attribution record in one atomic operation, without putting the secret token or claimant identity into public data. We must validate this in the Emulator Suite before choosing the exact document paths. If the no-Cloud-Functions approach cannot meet that bar, we should discuss the tradeoff rather than weaken the rules.

## 5. Required security tests

Before using real family data, test:

1. Parent in Household A cannot read or write Household B.
2. Guest with Link A can read only Link A's selected items.
3. Guest cannot list/enumerate other links or read household-private data.
4. Guest cannot edit item names, descriptions, URLs, prices, categories, or sort order.
5. Guest cannot claim an item not selected for their link.
6. Guest cannot claim an already-claimed or unavailable item.
7. Two simultaneous claims cannot both succeed.
8. A claim is reflected in every filtered view containing that master item.
9. Guest reads never reveal gift-giver identity or private claim history.
10. Parent can undo a claim and all filtered views reflect the change.

Use Firebase Local Emulator Suite and automated rules tests. Start with deny-all rules; never deploy open read/write rules.

## 6. Other data decisions

- Gift recipients and gift-givers are separate directories, even if the same person appears in both.
- Gift categories and purchase statuses are separate configurable records.
- Wishlist categories and availability status are separate fields.
- Drag-and-drop sort order is explicit; no priority field.
- Inventory assignment preserves purchase data and avoids duplicate gift entry. Decide linked-record versus record-transfer behavior when implementing that workflow.

## 7. Still to define

- Exact fields for gift, inventory, child, recipient, gift-giver, and wishlist documents.
- The secure guest token lookup and token-scoped read pattern.
- The Spark-compatible atomic claim plus private attribution pattern.
- Household invitation, membership, and deactivation workflow.
- Whether owner and parent roles need different permissions in the first release.

Do not create production collections or deploy rules from this proposal until the guest access and claim tests pass.
