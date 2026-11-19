# Firestore collection schema — implementation draft

This document turns the product requirements into concrete document shapes. It is a starting schema, not a command to create all collections now. Firestore creates collections/documents when the app first writes them.

## Conventions

- All records live under a household unless explicitly noted.
- Document IDs are generated IDs unless a stable ID is stated.
- Money is stored as integer cents (for example, $12.99 = 1299).
- Timestamps use Firestore Timestamp.
- Date-only values use `YYYY-MM-DD`.
- Sort order is a numeric `sortOrder`; lower numbers appear first. Gift lists support drag-and-drop ordering and up/down controls that persist this value.
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
- Implemented under `households/{householdId}/giftRecipients/{recipientId}`. Parents can add, edit, and archive recipients; archive preserves their gift history.
- Recipient gift records are stored in the household `gifts` collection with `giftType: "recipient"`, `recipientId`, and `childId: null`. The recipient view calculates spent from paid prices and compares it with the optional budget.

`giftGivers/{giftGiverId}`
- `name`, `notes`, `active`, timestamps.
- This is a separate directory for people who may buy gifts from a child's wishlist.

`giftGiverBudgets/{budgetId}`
- `giftGiverId`, `childId`, `budgetCents`, `notes`, timestamps.
- One logical record per gift-giver/child pair.

## Our Gifts

`households/{householdId}/gifts/{giftId}`
- Current child Christmas-list prototype fields: `childId`, `item`, `category` (initially Undecided, Santa, Stocking, Main, Advent), `status` (initially Need to buy, Bought, Wrapped), `paidPriceCents`, `regularPriceCents`, `store`, `purchaseDate` (optional `YYYY-MM-DD` date string or null), `notes`, `sortOrder`, `createdAt`, `updatedAt`.
- Parents can edit gift details and change status. Savings is displayed as regular price minus paid price when both values exist. The child dashboard sums paid prices for each child; gifts without a paid price are excluded.
- Prices are stored as integer cents. Savings is calculated as regular price minus paid price; do not store an editable savings value.
- Household-scope gifts use `giftType: "household"` and `childId: null`; they are excluded from child spending totals. Recipient-scope gifts use `giftType: "recipient"`, `recipientId`, and `childId: null`. Child Christmas gifts retain `childId` and no `giftType` marker.

`inventory/{inventoryItemId}`
- `item`, `store`, `paidPriceCents`, `regularPriceCents`, `purchaseDate`, `notes`, `intendedUse`, `status`, `assignedGiftId` (optional), `assignedToType`, `assignedToId`, timestamps.
- Inventory statuses are configured separately in `inventoryStatuses/{statusId}` with `label`, `color`, `sortOrder`, `active`, and timestamps. Defaults: Available, Reserved, Assigned, Given.
- Assigning an item creates a gift record in `gifts` with `inventoryItemId` and copies the purchase details, then updates the inventory record with `assignedGiftId` and assignment target. The inventory record remains as a linked reference; spending totals count the gift record, not the inventory collection, so the purchase is counted once.

## Configurable labels

`giftCategories/{categoryId}`
- `label`, `color` (hex), `sortOrder`, `active`, `createdAt`, `updatedAt`.
- Each household seeds its own defaults on first use: Undecided, Santa, Stocking, Main, Advent.
- Parents can add, rename, recolor, and archive categories. Archiving is soft; existing gifts retain their saved category. Renaming updates matching gift records.

`giftStatuses/{statusId}`
- `label`, `color` (hex), `sortOrder`, `active`, `createdAt`, `updatedAt`.
- Each household seeds its own defaults on first use: Need to buy, Bought, Wrapped.
- Parents can add, rename, recolor, and archive statuses independently of categories. Archiving is soft; existing gifts retain their saved status. Renaming updates matching gift records.

`wishlistCategories/{categoryId}`
- `label`, `sortOrder`, `active`, `createdAt`, `updatedAt`. Defaults: Books, Toys, Clothing, Arts & Crafts, Tech, Games, Experiences, Miscellaneous. Parents can add, rename, and archive categories.

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
  categoryLabel: "Toys",
  availability: "available", // available | claimed | unavailable
  claimedByName: null,       // self-reported guest-entered name
  claimedAt: null,           // Firestore Timestamp
  claimEventId: null,        // current claim history event ID
  sortOrder: 100,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Each item exists once. Curated gift-giver links select IDs from this collection; they do not create duplicate wishlist items. Parents can reorder items by dragging or with up/down controls; the order is persisted in `sortOrder`. Editing an already-claimed item preserves its claimed state unless the parent explicitly changes availability.

## Share links

`shareLinks/{shareLinkId}` (private parent-side record)
- `childId`, `giftGiverId`, `active`, `selectedItemIds` (array of wishlist item IDs), `tokenHash`, timestamps.
- One persistent link per gift-giver/child pair.
- Generate a cryptographically random URL token in the browser. Store only its SHA-256 hash in this private record and as the ID of `publicShares/{tokenHash}`. The raw token is never stored in Firestore.

`publicShares/{tokenHash}` (minimal public-link metadata; direct reads require a matching guest session)
- `householdId`, `childId`, `giftGiverId`, `shareLinkId`, `selectedItemIds`, `active`, timestamps.
- Contains no wishlist item details or gift-giver personal notes. Guests cannot list this collection.
- Parent writes must keep this record synchronized with the private `shareLinks` record in one batch.

`guestSessions/{uid}`
- `tokenHash`, `createdAt`, optional `lastSeenAt`.
- One anonymous Firebase Auth UID is bound to one active share token. Guest access to a wishlist item is granted only when that item's ID is in the token's selected item IDs.

Guest clients read selected wishlist items individually by document ID; they cannot list the household's wishlist collection. Claims update the one canonical `wishlistItems/{itemId}` document and create a matching `claims/{claimId}` history event in the same Firestore batch. Security Rules validate both writes with `getAfter()`, preserving one shared claim state across all links.

## Claim history

`claims/{claimId}` (parent-only; unique document ID per event)
- `itemId`
- `childId`
- `enteredName` (self-reported)
- `eventType`: `claimed` or `undone`
- Guest claim event ID is copied to `wishlistItems/{itemId}.claimEventId`; each claim uses a new random document ID
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
