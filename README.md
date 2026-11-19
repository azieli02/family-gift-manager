# Family Gift Manager

A mobile-first gift planning app for families, with private parent accounts and guest wishlist links.

## Current direction

- Frontend: plain HTML, CSS, and JavaScript (no React).
- Hosting: GitHub Pages.
- Backend: Firebase Firestore.
- Parent access: Firebase Authentication with email/password.
- Guest access: individual, unlisted wishlist links; guests do not need accounts.
- Multi-family: one Firebase project, with strict household-level data isolation.
- Initial target: our household plus approximately five test families.
- Cost target: remain on Firebase's free Spark plan; do not enable billing without an explicit decision.

## Project documents

- [Project requirements and roadmap](docs/PROJECT_PLAN.md)
- [Firestore data model](docs/FIRESTORE_DESIGN.md)

## Development status

This repository is being scaffolded. No live Firebase configuration, database collections, or security rules have been added yet.

## Important security rule

Never rely on the frontend to isolate families. Firestore Security Rules must enforce household membership and narrowly scoped guest-link access before real family data is used.
