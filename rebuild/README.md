# Shiekh Directory Rebuild - Slice 1

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
npm run seed

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
│   ├── components/    # UI components
│   ├── context/       # React context (auth)
│   ├── lib/           # Business logic (operating state)
│   └── types/         # TypeScript type definitions
├── server/            # Node.js API server
│   ├── routes/        # API endpoints
│   ├── middleware/    # Auth middleware
│   └── utils/         # Utilities (phone, address)
├── data/              # Sample CSV data
├── test/              # Test files
├── firebase.json      # Firebase emulator config
└── firestore.rules    # Security rules
```

### Commands

```bash
npm run dev           # Start both server and frontend
npm run dev:emulators # Start Firebase Emulators only
npm run seed          # Load sample data into emulators
npm run test          # Run all tests
npm run lint          # TypeScript type checking
npm run build         # Production build
```

### API Endpoints

All API endpoints require authentication (Bearer token).

- `GET /api/app/search?q=...` - Search stores and people
- `GET /api/app/locations` - List all stores (with optional filters)
- `GET /api/app/locations/:id` - Get store details
- `POST /api/app/import` - Import data from CSV (with `?dryRun=true` for preview)
- `GET /api/app/regions` - List regions
- `GET /api/app/districts` - List districts

### Connecting to a Real Firebase Project

When you're ready to connect to a real Firebase project:

1. Create a new Firebase project at https://console.firebase.google.com
2. Enable Firestore and Authentication
3. Create a `.env` file with your Firebase config:

```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

4. For the server, set `GOOGLE_APPLICATION_CREDENTIALS` to your service account key path
5. Deploy the Firestore security rules: `firebase deploy --only firestore:rules`

## Acceptance Checklist (Slice 1)

✅ Type "007" or a city name and the store appears instantly  
✅ Tap phone to dial (uses tel: link)  
✅ Store detail shows today's hours and correct Open/Closed status  
✅ SM/DM/RM names shown on store detail  
✅ Re-importing CSV replaces data cleanly  
✅ Works on phone and laptop (responsive design)  
✅ All data writes go through server API (security rules block client writes)  
✅ Basic sign-in required to view data

## What's Not Included (Out of Scope for Slice 1)

- Editing stores/people/assignments in the UI
- User roles and permissions
- Legacy API compatibility (v1/v2/v3)
- Offices and warehouses (only stores)
- Verification/audit features
- PDF exports
