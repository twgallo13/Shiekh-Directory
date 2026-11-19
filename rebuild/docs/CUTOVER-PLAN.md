# Directory v2 Cut-over Plan

This document outlines the steps for transitioning from the legacy Shiekh Directory to the new v2 system.

## Pre-Cut-over Checklist

### Infrastructure
- [ ] Production Firebase project `shiekh-directory-v2` configured
- [ ] Firebase Hosting rules verified
- [ ] Cloud Functions deployed and tested
- [ ] Firestore indexes created
- [ ] Security rules in place

### Data Migration
- [ ] Full Firestore backup of legacy data taken
- [ ] Roster import rehearsal completed (see below)
- [ ] Store data validated against legacy
- [ ] Hours and closures verified

### External Integrations
- [ ] Dynamic QR consumer notified and ready
- [ ] LP-Intel consumer notified and ready
- [ ] ROPI consumer notified and ready
- [ ] API clients created with appropriate scopes

### Communications
- [ ] Internal stakeholders notified of cut-over window
- [ ] Store managers aware of new sign-in flow
- [ ] Support contacts identified for issues

---

## Roster Import Rehearsal

### Purpose
Validate the roster import process before production cut-over to catch data issues.

### Steps

1. **Export Roster from Legacy**
   ```bash
   # Export current roster data from legacy system
   # Format: CSV with columns matching import schema
   ```

2. **Import into Staging**
   ```bash
   # Run import in staging environment
   npm run import:roster -- --env staging --file roster-export.csv --dry-run
   ```

3. **Validate Import Results**
   - Check count of created/updated/skipped records
   - Verify store assignments match expectations
   - Spot-check 10% of records manually

4. **Rehearsal Checklist**
   - [ ] All store locations imported
   - [ ] Store numbers preserved correctly (including leading zeros)
   - [ ] District/region assignments correct
   - [ ] Store manager assignments linked
   - [ ] Standard hours imported
   - [ ] Holiday exceptions imported

5. **Document Issues**
   - Record any data issues found
   - Note records requiring manual correction
   - Estimate time for manual fixes

---

## Consumer Re-sync: Dynamic QR

### Overview
The Dynamic QR system reads store location and hours data for QR code generation.

### API Changes
- **Base URL**: Changes from `legacy-api.shiekh.com` to `directory.shiekh.com`
- **Authentication**: Bearer token (API client token from v2)
- **Endpoints**: Same structure as v1 API

### Re-sync Process

1. **Pre-Cut-over**
   - Create API client in v2 admin with `locations:read` scope
   - Share token with Dynamic QR team
   - Test connectivity to staging

2. **Cut-over**
   - Update Dynamic QR config with new base URL
   - Trigger full location sync
   - Verify QR codes display correct hours

3. **Validation**
   ```bash
   # Test API endpoint
   curl -H "Authorization: Bearer $TOKEN" \
     https://directory.shiekh.com/api/v1/locations?limit=10
   ```

4. **Rollback**
   - If issues, revert Dynamic QR config to legacy URL
   - Legacy API remains available during transition period

---

## Consumer Re-sync: LP-Intel

### Overview
LP-Intel (Loss Prevention Intelligence) uses store staffing and assignment data.

### API Changes
- **Base URL**: Changes to `directory.shiekh.com`
- **Authentication**: Bearer token with `staffing:read` scope
- **Contract**: `personnel-staffing-v2.1`

### Re-sync Process

1. **Pre-Cut-over**
   - Create API client with `personnel:read` and `staffing:read` scopes
   - Share credentials with LP-Intel team
   - Test snapshot creation and pagination

2. **Cut-over**
   ```bash
   # Create snapshot
   curl -H "Authorization: Bearer $TOKEN" \
     https://directory.shiekh.com/api/v2/snapshot
   
   # Use snapshot to fetch location staffing
   curl -H "Authorization: Bearer $TOKEN" \
     "https://directory.shiekh.com/api/v2/location-staffing?snapshot=$SNAPSHOT"
   ```

3. **Validation**
   - Verify SM/DM assignments appear correctly
   - Check position holder data matches expectations
   - Confirm pagination works for full dataset

4. **Rollback**
   - Revert to legacy staffing data source
   - Keep v2 API available for testing

---

## Consumer Re-sync: ROPI

### Overview
ROPI (Regional Operations Performance Intelligence) uses district leadership data.

### API Changes
- **Base URL**: Changes to `directory.shiekh.com`
- **Authentication**: Bearer token with `district-leadership:read` scope
- **Contract**: `district-leadership-v3.1`
- **New**: Optional `district-leadership:contacts:read` scope for DM email access

### Re-sync Process

1. **Pre-Cut-over**
   - Create API client with appropriate scopes
   - Test v3 API endpoints in staging
   - Verify DM contact info access if needed

2. **Cut-over**
   ```bash
   # Create leadership snapshot
   curl -H "Authorization: Bearer $TOKEN" \
     https://directory.shiekh.com/api/v3/snapshot
   
   # Fetch district leadership
   curl -H "Authorization: Bearer $TOKEN" \
     "https://directory.shiekh.com/api/v3/district-leadership?snapshot=$SNAPSHOT"
   ```

3. **Validation**
   - Verify district-to-DM assignments
   - Check `assignmentState` values (assigned/vacant)
   - Confirm work email visibility matches scope

4. **Rollback**
   - Revert ROPI config to legacy data source

---

## Cut-over Sequence

### T-24 Hours
1. Take full Firestore backup of legacy
2. Run final roster import rehearsal
3. Notify all stakeholders of cut-over window
4. Verify all API clients created

### T-2 Hours
1. Enable maintenance mode on legacy (read-only)
2. Export final delta from legacy
3. Import delta into v2 production
4. Verify record counts match

### T-0 (Cut-over)
1. Update DNS/routing to point to v2
2. Trigger consumer re-syncs:
   - Dynamic QR: Full location sync
   - LP-Intel: Create new snapshot, full pull
   - ROPI: Create new snapshot, full pull
3. Enable email sending (`MAIL_CUTOVER_ENABLED=true`)
4. Monitor for errors

### T+1 Hour
1. Spot-check live data accuracy
2. Verify store sign-in works
3. Check verification email delivery
4. Confirm API clients functioning

### T+24 Hours
1. Review audit logs for issues
2. Check consumer sync completion
3. Close out cut-over ticket

---

## Rollback Steps

### When to Rollback
- Critical data loss or corruption
- Authentication system failure
- API breaking consumers
- Store verification emails failing at scale

### Rollback Procedure

1. **Immediate (< 5 minutes)**
   - Update DNS/routing to point back to legacy
   - Consumers automatically fall back (if they cached legacy URL)

2. **Short-term (< 1 hour)**
   - Disable v2 sign-in flow
   - Re-enable legacy authentication
   - Notify stakeholders of rollback

3. **Data Recovery (if needed)**
   - Restore Firestore from pre-cut-over backup
   - Re-import delta changes if any were made in v2
   - Validate data integrity

4. **Consumer Notification**
   - Notify Dynamic QR to revert config
   - Notify LP-Intel to revert config
   - Notify ROPI to revert config

### Post-Rollback
1. Document what went wrong
2. Create fix plan
3. Schedule new cut-over window
4. Re-test all failure scenarios

---

## Support Contacts

| Role | Name | Email | Phone |
|------|------|-------|-------|
| Project Lead | | | |
| Database Admin | | | |
| API Support | | | |
| Store Ops | | | |

---

## API Client Token Checklist

| Consumer | Scopes | Token Created | Contact |
|----------|--------|---------------|---------|
| Dynamic QR | `locations:read` | [ ] | |
| LP-Intel | `personnel:read`, `staffing:read` | [ ] | |
| ROPI | `district-leadership:read`, `district-leadership:contacts:read` | [ ] | |

---

## Appendix: Environment Variables

### Production Configuration
```env
# Firebase
FIREBASE_PROJECT_ID=shiekh-directory-v2
FIRESTORE_EMULATOR_HOST=  # Leave empty for production

# Auth
ALLOWED_DOMAINS=shiekhshoes.org
ADMIN_EMAILS=theo@shiekhshoes.org

# API Security
API_TOKEN_PEPPER=<production-pepper>
STORE_AUTH_TOKEN_SECRET=<production-secret>
STORE_SESSION_SECRET=<production-secret>

# Mail
MAIL_CUTOVER_ENABLED=true  # Enable after cut-over
SENDGRID_API_KEY=<production-key>
MAIL_FROM=directory@shiekh.com

# App
APP_URL=https://directory.shiekh.com
```

### Staging/Test
```env
MAIL_CUTOVER_ENABLED=  # Leave unset for log-only mode
```
