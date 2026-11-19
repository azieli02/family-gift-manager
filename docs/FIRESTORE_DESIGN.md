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

## 4. Guest claim flow

Each master wishlist item has exactly one shared availability state. A claim updates the master item, so every filtered link containing it immediately reflects the same state.

### Guest experience

1. Guest taps **I'll get this!** (or **Got it!**).
2. A small confirmation prompt asks them to enter their name.
3. They confirm the claim.
4. The item remains visible but is marked **Claimed** and grayed out. The guest view may show the entered name.
5. Parents can see the claimant name and timestamp and can undo the claim.

The name is self-reported, not identity-verified. This is intentional: the goal is to make family use clear and reduce accidental taps, not to authenticate gift-givers.

### Master wishlist item claim fields

- availability (Available, Claimed, No longer wanted)
- claimedByName (entered by the guest; only shown in guest view if desired)
- claimedAt (Firestore timestamp)

The claim prompt requires an explicit confirmation after name entry. Parent edits can clear the claim fields and return the item to Available.

### Parent claim history

Keep a parent-only claim history record for each claim event:
- itemId
- enteredName
- claimedAt
- eventType (claimed or undone)
- optional shareLinkId for internal troubleshooting, if readily available

This provides a useful timeline, including when a parent reverses a claim. The entered name is the primary attribution shown to parents; it is not proof of identity.

### Guest write permissions

Firestore Security Rules should allow a guest to change only the claim-related fields on an item they are authorized to see through that link. They must not be able to edit item name, description, URL, price, category, or sort order. A guest should only be able to claim an item included in that link's selected items, and only while it is Available.

A claim should be a single atomic operation that changes the master item's claim fields and adds the corresponding history event. The rules should reject a claim if the item is no longer Available, so two guests cannot both successfully claim it. The exact transaction/batch rule pattern must be tested in the Firebase Emulator Suite.

This is intentionally a lightweight family workflow. Do not build a complex identity-verification or anti-fraud system for the entered name.

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
9. Guest reads never reveal parent-only claim history or household-private data.
10. Parent can undo a claim, clear the claim fields, and all filtered views reflect the change.

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
- The exact atomic claim-plus-history write pattern and guest-visible treatment of the entered name.
- Household invitation, membership, and deactivation workflow.
- Whether owner and parent roles need different permissions in the first release.

Do not create production collections or deploy rules from this proposal until the guest access and claim tests pass.
