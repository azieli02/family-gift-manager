# Household onboarding and access

## First household setup

A parent creates an account with Firebase Authentication, then creates their first household from the signed-in app. The app writes three documents in one Firestore batch:

- `households/{householdId}` — household name, timezone, owner UID and timestamps.
- `households/{householdId}/members/{uid}` — the creator's active owner membership.
- `users/{uid}` — the authenticated user's household ID list.

The Firestore rules use `getAfter()` so the household, owner membership, and user profile must be created together. A client cannot create a household while omitting the matching owner membership.

## Current limits

- The first signed-in account can create its own first household.
- A profile currently stores one household ID.
- Additional parent invitations, adding a second household to a user, account deactivation, and household deletion are not implemented.
- Do not manually create these documents in the Firebase console; use the app flow once the rules are deployed.
- The rules file is in GitHub but is not automatically deployed.

## Before using this with family data

Deploy the rules only after reviewing and testing them with the Firebase Emulator Suite. The current rules intentionally deny guest wishlist access. Guest token reads and claims are not implemented.
