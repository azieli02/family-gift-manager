# Firestore collection schema — implementation draft

This document turns the product requirements into concrete document shapes. It is a starting schema, not a command to create all collections now. Firestore creates collections/documents when the app first writes them.

## Conventions

- All records live under a household unless explicitly noted.
- Document IDs are generated IDs unless a stable ID is stated.
- Money is stored as integer cents (for example, $12.99 = 1299).
- Timestamps use Firestore Timestamp.
- Date-only values use `YYYY-MM-DD`.
- Sort order is a numeric `sortOrder`; lower numbers appear first.
- Soft-deactivate configurable records with `active: false` when historical records may reference them.

## Household root

`households/{householdId}`

```js
{
  name: "Garrett Household",
  timezone: "America/Detroit",
  ownerUid: "firebase-auth-uid",
  active: true,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

`households/{householdId}/members/{uid}`

```js
{
  role: "owner" | "parent",
  active: true,
  joinedAt: Timestamp
}
```

The member document ID is the Firebase Authentication UID.

## Children and people

`households/{householdId}/children/{childId}`
- `name` (required), `displayName` (same initial value as name), `birthday` (optional `YYYY-MM-DD` date string or null), `active` (boolean), `sortOrder` (number), `createdAt`, `updatedAt`.
- Parents create child records from the household dashboard. Removing a child from the active list sets `active: false`; it does not delete the record or its gift/wishlist history.

`giftRecipients/{recipientId}`
- `name`, `birthday` (optional date string), `budgetCents` (optional), `notes`, `active`, timestamps.
- This is the directory for people the household buys gifts for.

`giftGivers/{giftGiverId}`
- `name`, `notes`, `active`, timestamps.
- This is a separate directory for people who may buy gifts from a child's wishlist.

`giftGiverBudgets/{budgetId}`
- `giftGiverId`, `childId`, `budgetCents`, `notes`, timestamps.
- One logical record per gift-giver/child pair.

## Our Gifts

`gifts/{giftId}`
- `scope`: `child`, `household`, or `recipient`.
- `childId`, `recipientId` as applicable; null when not applicable.
- `item`, `categoryId`, `paidPriceCents`, `regularPriceCents`, `store`, `statusId`, `notes`, `purchaseDate`, `sortOrder`, timestamps.
- Savings is calculated as regular price minus paid price; do not store a second editable savings value.

`inventory/{inventoryItemId}`
- `item`, `store`, `paidPriceCents`, `regularPriceCents`, `purchaseDate`, `notes`, `intendedUse`, `status`, `assignedGiftId` (optional), timestamps.
- Assignment should preserve the original purchase data. Implementation will decide whether the gift record references the inventory record or the inventory record is converted in place.

## Configurable labels

`giftCategories/{categoryId}`
- `label`, `color`, `sortOrder`, `active`.

`giftStatuses/{statusId}`
- `label`, `color`, `sortOrder`, `active`.

`wishlistCategories/{categoryId}`
- `label`, `sortOrder`, `active`.

## Master wishlists

`wishlistItems/{itemId}`

```js
{
  childId: "child-document-id",
  item: "LEGO set",
  description: "Optional details",
  url: "https://example.com/product",
  priceCents: 4999,
  categoryId: "toys-category-id",
  availability: "available", // available | claimed | unavailable
  claimedByName: null,       // self-reported guest-entered name
  claimedAt: null,           // Firestore Timestamp
  sortOrder: 100,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Each item exists once. Curated gift-giver links select IDs from this collection; they do not create duplicate wishlist items.

## Share links

`shareLinks/{shareLinkId}` (private parent-side record)
- `childId`, `giftGiverId`, `active`, `selectedItemIds` (array of wishlist item IDs), `tokenHash`, timestamps.
- One persistent link per gift-giver/child pair.
- The raw token is only present in the URL and must not be stored in ordinary household-readable data.

The guest-facing token lookup and filtered read model are deliberately not finalized here. Firestore rules do not receive the browser's URL/referrer as authorization context. We must prove how a guest's token authorizes reads and claims without allowing a token to be swapped in a client write or bypassing the selected-item filter.

## Claim history

`claims/{claimId}` (parent-only)
- `itemId`
- `childId`
- `enteredName` (self-reported)
- `eventType`: `claimed` or `undone`
- `createdAt`: Firestore Timestamp
- `shareLinkId` (optional internal reference when reliably known)

The item document holds the current claim state. The history collection holds the sequence of claim/undo events. Guest clients never read this collection.

## Guest claim behavior

- Guest sees only items selected for the share link.
- Guest taps the claim button, enters a name, and explicitly confirms.
- The current item changes to `availability: "claimed"`, `claimedByName`, and `claimedAt`.
- The item remains visible and marked Claimed in every filtered link containing it.
- Parents can undo a claim; the item returns to available and a history event is recorded.
- Guests cannot edit any non-claim wishlist fields.
- A claim is rejected if the item is not currently available.

The exact public document paths and Security Rules for guest reads/writes remain unimplemented until the Firebase Emulator Suite tests demonstrate that token-scoped filtered reads, one shared claim state, and claim history can all be enforced safely without Cloud Functions. Current rules deny all guest access by default.
