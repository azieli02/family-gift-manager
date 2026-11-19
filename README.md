# Family Gift Manager

A mobile-first family gift planning app with private parent accounts and unlisted guest wishlist links.

## Current implementation

- Frontend: plain HTML, CSS, and JavaScript (no React).
- Hosting target: GitHub Pages (not yet enabled).
- Backend: Cloud Firestore.
- Parent access: Firebase Authentication with email/password.
- Guest access: Firebase Anonymous Authentication for token-scoped wishlist links.
- Multi-family data isolation: enforced by Firestore Security Rules.
- Firebase project: `family-gift-manager-aa805`.
- Cost target: remain on Firebase Spark; do not enable billing without an explicit decision.

The Firebase web configuration in `assets/js/firebase-config.js` is intentionally client-visible. Firebase web config is not a server credential. Security depends on deployed Firestore Security Rules and correctly configured Firebase Authentication.

## Project documents

- [Project requirements and roadmap](docs/PROJECT_PLAN.md)
- [Firestore data model](docs/FIRESTORE_DESIGN.md)
- [Firestore schema](docs/FIRESTORE_SCHEMA.md)
- [Security test plan](docs/SECURITY_TEST_PLAN.md)
- [Rules testing notes](docs/RULES_TESTING.md)
- [Household onboarding](docs/HOUSEHOLD_ONBOARDING.md)

## Development and release status

- Parent gift tracking and wishlist workflows are implemented in the current prototype.
- Firestore security rules have passed the automated Local Emulator Suite tests in GitHub Actions.
- The app has not yet completed end-to-end browser testing.
- Firestore rules have not yet been deployed to the Firebase project.
- Before using real family data or enabling the hosted app, deploy the tested rules and verify the guest flow in a browser.
- Guest wishlist links require **Authentication → Sign-in method → Anonymous** to be enabled in Firebase.

## Security principles

- Never rely on frontend filtering to isolate households.
- Never deploy permissive Firestore rules.
- Share URLs are bearer links: anyone who receives a link can open it.
- Do not commit service-account keys, private keys, passwords, or local environment files.
