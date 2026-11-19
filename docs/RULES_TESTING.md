# Local Firestore rules tests

These tests run against the Firebase Local Emulator Suite. They do not connect to or modify the live Firebase project.

## Requirements

- Node.js 20 or newer
- Java 11 or newer (required by the Firestore emulator)

## Run

```bash
npm install
npm run test:rules
```

The tests verify first-household creation, household isolation, membership protection, and the current deny-all guest-share behavior.

Do not deploy Firestore rules to the live project based only on these tests; expand the test suite as new permissions are implemented.
