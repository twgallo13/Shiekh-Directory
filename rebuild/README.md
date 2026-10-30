# Shiekh Directory Rebuild - Slices 1, 2 & 3

This is a ground-up rebuild of the Shiekh Store Directory. This folder contains a completely new app that runs independently from the existing legacy app. **The legacy app is untouched and remains live.**

## What Slice 1 Does

Slice 1 provides the core store directory functionality:

### Store Lookup & Search
- **Search by store number** - Type "007" to find store 007 instantly
- **Search by city** - Type "Los Angeles" to find all LA stores  
- **Search by name** - Type "Flagship" to find stores with that name
- **Search by phone** - Type a phone number to find matching stores

### Store Information
- **Store list** showing all active stores with Open/Closed status
- **Filter by Region or District** to narrow down the list
- **Store details** including:
  - Today's hours and Open/Closed status
  - Next 7 days of hours with holidays marked
  - Address with "Open in Maps" link
  - Phone number with tap-to-call and copy buttons
  - Store email inbox (if available)
  - Store Manager, District Manager, and Regional Manager names
  - Assistant Managers and Key Holders

### Open/Closed Status Logic
The app correctly determines if a store is Open or Closed right now by checking (in order):
1. **Temporary closures** (water damage, emergency, etc.) - highest priority
2. **Holiday/special hours** for today's date
3. **Standard weekly hours** as a fallback

It also handles overnight hours (stores open past midnight) and different time zones correctly.

### Data Import
Staff can import store, people, and assignment data from CSV files. The import:
- Validates all data before saving
- Shows a preview of what will change
- Replaces existing data cleanly on confirm

## How to Try It (For Testing)

### Prerequisites
1. Install [Node.js](https://nodejs.org/) version 18 or newer
2. Install the [Firebase CLI](https://firebase.google.com/docs/cli): `npm install -g firebase-tools`

### Quick Start

```bash
# From this folder (rebuild/)
npm install

# Start Firebase Emulators (runs the database locally)
npm run dev:emulators

# In a new terminal, seed the sample data
npm run seed -- --emulator
npm run seed:users -- --emulator

# In another terminal, start the app
npm run dev
```

Then open http://localhost:5173 in your browser.

**Test login credentials:**
- Email: `test@shiekh.test`
- Password: `testpassword123`

### What You'll See

1. **Sign in page** - Use the test credentials above
2. **Directory list** - All 10 sample stores with their Open/Closed status
3. **Search** - Try searching for "007" or "Los Angeles"
4. **Store detail** - Tap any store to see full details, hours, and leadership

### Sample Data Included

The sample data includes:
- **10 stores** across 4 regions (West, Southwest, Central, East)
- **9 districts** within those regions
- **15 people** with various roles
- **Leadership assignments** including:
  - Maria Santos as both SM at store 007 AND DM of LA-Central (concurrent roles)
  - Store Managers at all 10 stores
  - Regional Manager (Amanda Garcia) for West region
- **Holiday hours** for Thanksgiving, Black Friday, Christmas, New Year's
- **A temporary closure** at store 031 (Santa Monica) for water damage repair

## For Developers

### Project Structure

```
rebuild/
├── src/               # React frontend
│   ├── components/    # UI components (DirectoryView, LocationDetailView, EditLocationPanel, CorrectionsQueue, AuditHistory, etc.)
│   ├── context/       # React context (auth with role loading)
│   ├── lib/           # Business logic (operatingState, permissions)
│   └── types/         # TypeScript type definitions
├── server/            # Node.js API server
│   ├── routes/        # API endpoints (search, locations, import, edit, corrections, audit, users)
│   ├── middleware/    # Auth middleware (token + user role loading)
│   └── utils/         # Utilities (phone, address)
├── data/              # Sample CSV data
├── test/              # Test files (operatingState, import, search, permissions, edit)
├── firebase.json      # Firebase emulator config
└── firestore.rules    # Security rules
```

### Commands

```bash
npm run dev              # Start both server and frontend
npm run dev:emulators    # Start Firebase Emulators only
npm run seed -- --emulator       # Load sample data into emulators
npm run seed:users -- --emulator # Create test user accounts for each role
npm run test             # Run all tests
npm run lint             # TypeScript type checking
npm run build            # Production build (frontend + functions)
npm run deploy           # Deploy to Firebase (shiekh-directory-v2)
```

### API Endpoints

All API endpoints require authentication (Bearer token).

**Core (Slice 1):**
- `GET /api/app/search?q=...` - Search stores and people
- `GET /api/app/locations` - List all stores (with optional filters)
- `GET /api/app/locations/:id` - Get store details
- `POST /api/app/import` - Import data from CSV (with `?dryRun=true` for preview)
- `GET /api/app/regions` - List regions
- `GET /api/app/districts` - List districts

**Editing (Slice 2):**
- `GET /api/app/users/me` - Get current user's profile and role
- `PATCH /api/app/edit/locations/:id` - Edit a store (with version check)
- `POST /api/app/edit/locations/:id/closures` - Add a temporary closure
- `POST /api/app/edit/locations/:id/closures/:closureId/end` - End a closure
- `GET /api/app/corrections` - List corrections (filtered by status)
- `POST /api/app/corrections/:id/approve` - Approve a correction (Steward only)
- `POST /api/app/corrections/:id/reject` - Reject a correction (Steward only)
- `GET /api/app/audit` - View audit log entries

### Deploying to Firebase

The app is configured to deploy to Firebase project `shiekh-directory-v2`:
- **Hosting**: Static frontend at https://shiekh-directory-v2.web.app
- **Functions**: Express API as Cloud Function `api` (us-central1, Node 22)

#### Prerequisites

1. Copy `env.production.example` to `.env.production` and fill in your Firebase web config
2. Set up Firebase CLI authentication: `firebase login`
3. (Optional) Set `GOOGLE_APPLICATION_CREDENTIALS` for service account access

#### Deploy Commands

```bash
# Deploy everything (hosting + functions + rules)
firebase deploy --project shiekh-directory-v2

# Or deploy specific parts
firebase deploy --only hosting --project shiekh-directory-v2
firebase deploy --only functions --project shiekh-directory-v2
firebase deploy --only firestore:rules --project shiekh-directory-v2
```

#### Environment Config

For production, create `.env.production`:

```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=shiekh-directory-v2.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=shiekh-directory-v2
VITE_FIREBASE_STORAGE_BUCKET=shiekh-directory-v2.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_USE_EMULATOR=false
```

### Seeding Data

The seed scripts require explicit targeting to prevent accidental production writes:

```bash
# Seed local emulator (safe, recommended for development)
npm run seed -- --emulator
npm run seed:users -- --emulator

# Seed a real Firebase project (requires confirmation)
npm run seed -- --project=shiekh-directory-v2
npm run seed:users -- --project=shiekh-directory-v2
```

⚠️ **Warning**: Seeding a real project will CLEAR and REPLACE existing data. You must type the project ID to confirm.

## Acceptance Checklist (Slice 1)

✅ Type "007" or a city name and the store appears instantly  
✅ Tap phone to dial (uses tel: link)  
✅ Store detail shows today's hours and correct Open/Closed status  
✅ SM/DM/RM names shown on store detail  
✅ Re-importing CSV replaces data cleanly  
✅ Works on phone and laptop (responsive design)  
✅ All data writes go through server API (security rules block client writes)  
✅ Basic sign-in required to view data

---

## What Slice 2 Does

Slice 2 adds **roles & permissions** and **in-context editing** to the directory:

### User Roles

There are five roles, each with different capabilities:

| Role | What They Can Do |
|------|------------------|
| **Viewer** | Read-only access to all stores and people |
| **Store** | Edit own store's closures; propose corrections to phone/address (needs approval) |
| **Leader** | DMs/RMs can edit hours, closures, and SM assignments for stores in their scope |
| **Steward** | Full edit access; can approve corrections submitted by others |
| **Admin** | Everything a Steward can do, plus user management |

### In-Context Editing

- **Edit buttons** appear on store details based on your role
- **Pencil icons** next to Hours and Contact Info sections (for users with permission)
- **"+ Add Temporary Closure" button** for users who can add closures
- **Version conflict detection** - if someone else edits the same record, you get a warning

### Correction Workflow

When a Store or Leader user edits contact info (phone, address, inbox):
1. Their changes are saved as a **pending correction**
2. A Steward sees it in the **Approval Queue** (menu → "Approval Queue")
3. Steward can **Approve** or **Reject** with optional notes
4. If approved, the changes go live immediately

### Audit Logging

All edits are tracked in an audit log:
- Who made the change
- What was changed (before/after values)
- When it happened
- Version number for tracking

### Mobile Phone Visibility

Mobile phone numbers for people are only visible to **Leader**, **Steward**, and **Admin** roles. Viewers and Store accounts don't see mobile numbers.

## Test Accounts for Slice 2

In addition to the basic test account, there are accounts for each role:

| Email | Password | Role | Notes |
|-------|----------|------|-------|
| `viewer@shiekh.test` | `test123` | Viewer | Read-only, no edit buttons |
| `store007@shiekh.test` | `test123` | Store | Can edit closures for store 007 only |
| `dm.jones@shiekh.test` | `test123` | Leader | DM for LA-Central district |
| `steward@shiekh.test` | `test123` | Steward | Full access, sees Approval Queue |
| `admin@shiekh.test` | `test123` | Admin | Full access, plus user management |

To seed these users, run:
```bash
npm run seed:users -- --emulator
```

### Google Sign-In

The app supports **Sign in with Google** for company accounts:

- Only emails from allowed domains can sign in (default: `@shiekhshoes.org`)
- New Google users are auto-provisioned as **Viewer** by default
- Specific emails can be bootstrapped as **Admin** via env var or seed script

#### Firebase Console Setup (One-Time)

1. Go to [Firebase Console](https://console.firebase.google.com) → **Authentication** → **Sign-in method**
2. Enable **Google** provider
3. Set your support email
4. Go to **Settings** → **Authorized domains**
5. Add your hosting domain: `shiekh-directory-v2.web.app`

#### Server Configuration

Set these environment variables (or in Cloud Functions config):

```bash
# Allowed domains for Google sign-in (comma-separated)
ALLOWED_DOMAINS=shiekhshoes.org

# Admin emails for auto-provisioning (comma-separated)
ADMIN_EMAILS=theo@shiekhshoes.org
```

See `env.server.example` for a template.

#### Bootstrapping Admins

Option 1: Environment variable (auto-provisions on first sign-in)
```bash
ADMIN_EMAILS=theo@shiekhshoes.org,admin@shiekhshoes.org
```

Option 2: Seed script
```bash
npm run seed:users -- --project=shiekh-directory-v2 --admin=theo@shiekhshoes.org --admin-only
```

## Acceptance Checklist (Slice 2)

✅ A Viewer cannot see any edit pencil  
✅ A Steward can see edit pencils on any store  
✅ A Store account only sees its own store as editable  
✅ DM/RM (Leader) can edit hours and closures for their own stores without approval  
✅ Store corrections to phone/address need Steward approval before going live  
✅ All writes go through server API with version checks  
✅ Audit log tracks all changes  
✅ Mobile numbers visible only to Leader/Steward/Admin  

---

## What Slice 3 Does

Slice 3 adds **in-place editing of location info and standard hours** with change tracking:

### In-Place Editing

Users with edit permissions can modify store information directly from the store detail page:

- **Contact Information** - Edit phone, email, and address without leaving the page
- **Store Hours** - Update standard hours for each day of the week
- **Temporary Closures** - Add and end temporary store closures

### Version Conflict Detection

If two people try to edit the same store at the same time:

1. The first person saves their changes successfully
2. The second person sees a **version conflict warning**: "This record was modified by someone else. Please reload and try again."
3. This prevents one person's changes from silently overwriting another's

This uses optimistic concurrency control—each save includes the expected version number, and the server rejects the save if the version doesn't match.

### Change History (Audit Log)

The **Change History** section on each store detail page shows who changed what:

- **Who** made the change (email and role)
- **When** it happened (relative time like "2m ago")
- **What** changed (field names with old → new values)
- **Version** tracking (1 → 2)

This is visible to **Leader**, **Steward**, and **Admin** roles. Click any entry to expand and see the details of what changed.

### Screenshots

<details>
<summary>Edit Contact Info (Phone)</summary>

<img src="/opt/cursor/artifacts/screenshots/edit-contact-phone.png" alt="Edit Contact Info panel showing phone input" width="375" />

Edit panel for contact information, showing phone, email, and address fields.
</details>

<details>
<summary>Edit Hours</summary>

<img src="/opt/cursor/artifacts/screenshots/edit-hours.png" alt="Edit Hours panel showing daily schedule" width="375" />

Edit panel for standard hours, with day-by-day controls for open/close times.
</details>

<details>
<summary>Change History (Audit Log)</summary>

<img src="/opt/cursor/artifacts/screenshots/audit-history-with-entry.png" alt="Change History showing recent edit" width="375" />

Expanded change history showing a phone number update from +12135550007 to +12135550999.
</details>

## Acceptance Checklist (Slice 3)

✅ Change a store's phone from the detail page without leaving it  
✅ Reload → change is kept (persists to database)  
✅ Two people editing at once → second sees a warning, not a silent overwrite  
✅ Audit log shows who changed what (Change History section)  

---

## What's Not Included (Future Slices)

- Legacy API compatibility (v1/v2/v3)
- Offices and warehouses (only stores in slice 2)
- Verification/audit UI
- PDF exports
- User management UI
