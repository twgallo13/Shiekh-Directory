# Reference Data

This directory contains source material for migration and reconciliation. It is not application runtime data and is not bundled from `src`.

## Store Directory Snapshot

`store-directory-2025-09-26.csv` is the store-directory snapshot supplied for comparison with the current browser seed and the named Firestore database.

The file contains internal directory contact information. Keep access restricted to authorized project participants and do not publish it as a public asset.

Use `npm run migrate:firestore` to preview the deterministic migration plan. After reviewing the counts and target database, use `npm run migrate:firestore -- --apply` to replace duplicate location and people generations, seed the current supporting collections, and deduplicate access records. The apply operation is intentionally explicit and targets only the named Firestore database.
