# Restore Drill Runbook

## Purpose

The restore drill validates backup integrity without affecting production data. It tests the ability to restore a Firestore snapshot by:

1. Reading a snapshot from the `snapshots/` collection
2. Restoring documents to isolated drill collections (prefixed with `drill_<id>_`)
3. Comparing document counts and checksums against the original snapshot
4. Writing a drill report to `drillReports/`
5. Cleaning up drill collections

**The drill never touches live data.** All restored documents go to temporary collections that are deleted after validation.

## Prerequisites

- Node.js 18+
- Firebase Admin SDK credentials (for production)
- Access to the `snapshots/` collection

## Running a Drill

### Against Production (with Service Account)

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
npx ts-node scripts/restore-drill.ts --project shiekh-directory-v2 --snapshot <snapshot-id>
```

### Against Emulator

```bash
export FIRESTORE_EMULATOR_HOST=localhost:8080
npx ts-node scripts/restore-drill.ts --project demo-project --snapshot <snapshot-id>
```

### Dry Run (No Writes)

```bash
npx ts-node scripts/restore-drill.ts --project shiekh-directory-v2 --snapshot <snapshot-id> --dry-run
```

### Manual Cleanup

If a drill fails mid-execution, you can clean up orphaned drill collections:

```bash
npx ts-node scripts/restore-drill.ts --project shiekh-directory-v2 --cleanup drill_20261031_143000
```

## Finding Available Snapshots

Snapshots are stored in the `snapshots/` collection. You can list them via the Firebase Console or use:

```bash
# Using gcloud
gcloud firestore documents list snapshots --project=shiekh-directory-v2 --limit=10
```

Snapshot IDs typically follow the pattern: `pre-import-YYYY-MM-DDTHH-MM-SS-mmmZ`

## Understanding the Output

The drill reports success when:
- **Count Match**: All collections have the same document count as the snapshot
- **Checksum Match**: All collections have matching SHA-256 checksums

Example successful output:

```
===========================================
  DRILL RESULTS
===========================================
Status:           SUCCESS
Total Expected:   1234
Total Restored:   1234
Count Match:      YES ✓
Checksum Match:   YES ✓
Cleaned Up:       YES ✓

✅ Restore drill passed.
```

## Drill Reports

Each drill creates a report document in `drillReports/<drill-id>` containing:

| Field | Description |
|-------|-------------|
| `drillId` | Unique identifier (e.g., `drill_20261031_143000`) |
| `snapshotId` | Source snapshot that was tested |
| `startedAt` | ISO timestamp when drill started |
| `completedAt` | ISO timestamp when drill finished |
| `status` | `success`, `partial`, or `failure` |
| `validation` | Per-collection validation results |
| `overallCountMatch` | Whether all counts matched |
| `overallChecksumMatch` | Whether all checksums matched |
| `totalExpected` | Total documents in snapshot |
| `totalRestored` | Total documents restored |
| `cleanedUp` | Whether drill collections were removed |
| `errors` | List of validation errors |

## Viewing Last Drill Date in Admin

The Admin UI displays the most recent drill date on the System Status card. This reads from the `drillReports` collection, ordered by `completedAt` descending.

## Recommended Schedule

Run a restore drill:
- After any significant backup infrastructure change
- Monthly as part of disaster recovery validation
- Before major deployments that touch backup/restore code

## Troubleshooting

### "Snapshot not found"

The snapshot ID doesn't exist in `snapshots/`. Verify the ID in Firebase Console.

### "Missing chunk X"

The snapshot is corrupted or incomplete. Check if the backup job completed successfully.

### Partial Failure

Some collections passed validation but others failed. Check the `errors` array in the drill report for specifics.

### Out of Memory

Large snapshots may exceed memory limits. Contact infrastructure team for guidance on handling very large datasets.

## Security Considerations

- Drill collections use a unique prefix to prevent collision with live data
- Drill documents are deleted immediately after validation
- The drill script requires Admin-level Firestore access
- Credentials are never logged or included in drill reports

## Related Documentation

- [ROLLBACK.md](./ROLLBACK.md) - Manual rollback procedures
- [restore-backup.ts](../scripts/restore-backup.ts) - Full restore script (not a drill)
