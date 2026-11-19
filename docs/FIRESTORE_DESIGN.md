# Firestore data model — draft

This is a proposed logical model, not a set of collections to create manually yet. It must be reviewed alongside Firestore Security Rules before implementation.

## Design principles

- Every private record belongs to exactly one household.
- Use document IDs and references rather than duplicating entire records.
- Store money as integer cents, not floating-point currency.
- Store timestamps as Firestore timestamps; store date-only values (such as birthdays) as normalized strings like YYYY-MM-DD to avoid timezone shifts.
- Keep public guest-view data separate from private parent-only metadata.
- Do not put a share token in a broadly readable household document.
- Enforce authorization in Firestore Security Rules. Frontend checks are not security.

## Proposed collections

### households/{householdId}
Household profile and settings:
- name
- timezone (default America/Detroit)
- ownerUid
- createdAt
- active

### households/{householdId}/members/{uid}
Membership record:
- role (initially owner or parent)
- active
- joinedAt

### Household subcollections

- children/{childId}
- giftRecipients/{recipientId} — people this household buys gifts for
- giftGivers/{giftGiverId} — people who may buy wishlist gifts
- giftGiverBudgets/{budgetId}
- gifts/{giftId} — household gift records with a type/scope distinguishing child, household, and recipient gifts
- inventory/{inventoryItemId} — unassigned gift inventory; assignment links to the resulting recipient/child/household context without losing purchase data
- giftCategories/{categoryId}
- giftStatuses/{statusId}
- wishlistCategories/{categoryId}
- wishlistItems/{itemId}
- shareLinks/{shareLinkId} — private parent-side link configuration and recipient association
- claims/{claimId} — private claim attribution and history

### Guest-facing share data

A guest link needs a random, high-entropy token. Do not expose the private shareLinks document or private claims collection to guests.

A separate minimal public projection is needed for guest display and claim actions. Its exact shape and path are deliberately unresolved until security-rule design. It must contain only the selected child's display name (or chosen nickname), curated item display fields, and the minimum state needed to show whether an item is claimed.

## Claim behavior

- Claiming must be an atomic, race-safe operation.
- Two guests must not both successfully claim the same currently available item.
- Guest-readable data must not contain claimant identity.
- Parent-only claim metadata records the share link used.
- Parent can reverse a claim; the public projection must then reflect the new state.
- Because this project is intended to stay on Firebase Spark, evaluate a client Firestore transaction with restrictive Security Rules. Do not assume Cloud Functions are available.

## Questions to settle before implementation

1. Whether wishlist items and public share projections are updated through duplicated public documents or a different safe design.
2. How to validate token access without allowing enumeration or access to household collections.
3. How to ensure a guest claim updates every curated view without permitting arbitrary writes.
4. Whether inventory assignment should be represented by a linked gift record or by changing the inventory record's ownership/context.
5. The exact fields and allowed transitions for configurable gift statuses.

No collections or security rules should be created from this draft until these questions are resolved and tested.
