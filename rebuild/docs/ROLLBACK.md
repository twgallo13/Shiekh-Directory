# Rollback Runbook

This document describes how to roll back from the rebuild directory system to the legacy system if issues are discovered after cut-over.

## Overview

During cut-over, the legacy system remains live in read-only mode. If critical issues are discovered with the rebuild, traffic can be switched back to legacy with minimal disruption.

## Pre-Rollback Checklist

Before rolling back, verify:

1. [ ] Issue is confirmed as rebuild-specific (not data or infrastructure)
2. [ ] Legacy system is still operational and accessible
3. [ ] DNS/routing changes are prepared
4. [ ] Communication plan for users is ready
5. [ ] Export any rebuild-only data that needs preservation

## Rollback Procedure

### Phase 1: Stop Rebuild Traffic (5 minutes)

1. **Update Load Balancer / DNS**
   ```bash
   # If using Cloud Run with custom domain
   gcloud run services update shiekh-directory-rebuild \
     --project=shiekh-directory-prod \
     --region=us-central1 \
     --no-allow-unauthenticated
   
   # Or update DNS to point back to legacy
   # Depends on your DNS provider
   ```

2. **Disable rebuild API access**
   ```bash
   # Revoke all API client tokens if needed
   # This prevents automated consumers from hitting rebuild
   ```

3. **Notify users**
   - Post maintenance notice
   - Send Slack/email to operations team

### Phase 2: Re-enable Legacy System (10 minutes)

1. **Verify legacy is accessible**
   ```bash
   curl -s https://legacy.shiekh.directory/api/health
   ```

2. **Re-enable legacy write operations**
   - If legacy was set to read-only, restore write access
   - Update Cloud Run service or server configuration

3. **Update client applications**
   - Point mobile apps back to legacy endpoints
   - Update any internal tools

### Phase 3: Sync Data if Needed

If the rebuild was accepting writes before rollback, export changes:

1. **Export rebuild changes since cut-over**
   ```bash
   # From Admin UI: Admin > Export > Download CSV
   # Or via API
   curl -H "Authorization: Bearer $TOKEN" \
     https://rebuild.shiekh.directory/api/app/exports/locations/prepare \
     -X POST
   ```

2. **Import into legacy (if supported)**
   - Review changes manually
   - Apply critical updates to legacy

### Phase 4: Post-Rollback Verification

1. **Verify legacy API consumers**
   ```bash
   # Test v1 endpoint
   curl -H "Authorization: Bearer $API_TOKEN" \
     https://legacy.shiekh.directory/api/v1/locations
   
   # Test v2 endpoint  
   curl -H "Authorization: Bearer $API_TOKEN" \
     https://legacy.shiekh.directory/api/v2/snapshot
   ```

2. **Check user access**
   - Verify login works
   - Verify store managers can view their stores
   - Verify admins can make changes

3. **Monitor for errors**
   - Check error rates in monitoring
   - Review server logs

## API Consumer Rollback

External API consumers should be configured to handle endpoint changes:

### Option A: DNS-Based Routing

If API consumers use `api.shiekh.directory`:
- Update DNS to point to legacy servers
- TTL should be low (60-300 seconds) during cut-over period

### Option B: Direct Configuration

If API consumers have hardcoded endpoints:
1. Provide legacy endpoint URLs:
   - v1: `https://legacy.shiekh.directory/api/v1`
   - v2: `https://legacy.shiekh.directory/api/v2`
   - v3: `https://legacy.shiekh.directory/api/v3`

2. API clients may need to regenerate tokens if auth systems differ

### Option C: Proxy/Gateway

If using API Gateway (Apigee, Kong, etc.):
1. Update route target to legacy backend
2. Invalidate caches
3. Verify routing rules

## Rollback Timeline Targets

| Phase | Target Duration | Maximum |
|-------|----------------|---------|
| Phase 1: Stop rebuild traffic | 5 minutes | 15 minutes |
| Phase 2: Re-enable legacy | 10 minutes | 30 minutes |
| Phase 3: Data sync (if needed) | Variable | 2 hours |
| Phase 4: Verification | 15 minutes | 30 minutes |

**Total planned rollback time: ~30 minutes**

## Contacts

| Role | Contact | Responsibility |
|------|---------|----------------|
| Incident Commander | [TBD] | Decision authority |
| DevOps Lead | [TBD] | Infrastructure changes |
| Directory Admin | [TBD] | Data verification |
| API Support | [TBD] | External consumer communication |

## Post-Rollback Actions

1. **Create incident report**
   - Document what failed in rebuild
   - Root cause analysis
   - Remediation plan

2. **Preserve rebuild state**
   - Take Firestore export of rebuild data
   - Archive logs and metrics
   - Keep rebuild environment for debugging

3. **Update cut-over plan**
   - Address issues discovered
   - Update acceptance criteria
   - Schedule next cut-over attempt

## Restore from Backup (If Data Corruption)

If rollback is needed due to data corruption in rebuild:

```bash
# List available backups
gcloud firestore operations list \
  --project=shiekh-directory-prod \
  --database='(default)' \
  --filter="metadata.operationType:EXPORT_DOCUMENTS"

# Restore from backup
npx tsx scripts/restore-backup.ts \
  --project=shiekh-directory-prod \
  --backup=gs://shiekh-directory-prod-backups/firestore-exports/[BACKUP_ID]

# Monitor restore progress
gcloud firestore operations list \
  --project=shiekh-directory-prod \
  --database='(default)' \
  --filter="metadata.operationType:IMPORT_DOCUMENTS"
```

## Frequently Asked Questions

**Q: How long should we keep legacy running after cut-over?**
A: Minimum 2 weeks in read-only mode, 4 weeks recommended.

**Q: Can we do a partial rollback (some features)?**
A: No, the systems are separate. It's all-or-nothing.

**Q: What happens to data entered in rebuild during rollback?**
A: Export it first. It won't automatically sync to legacy.

**Q: Do API tokens work across both systems?**
A: No, they are generated separately. API consumers need tokens for whichever system they're connecting to.

**Q: Can we test rollback before cut-over?**
A: Yes, and we should. Test the rollback procedure in staging environment.
