export type LocationType = 
  | 'Enclosed Mall'
  | 'Strip Center / Shopping Center'
  | 'Street / Standalone Location'
  | 'Corporate Office'
  | 'Warehouse / Distribution Center'
  | 'Other Company Location';

export type OperationalStatus = 
  | 'Open — Normal Operations'
  | 'Opening Soon'
  | 'Temporarily Closed'
  | 'Modified Hours'
  | 'Under Remodel'
  | 'Maintenance / Repair Issue'
  | 'Relocating'
  | 'Closing'
  | 'Permanently Closed';

export type RecordLifecycleStatus = 'Active' | 'Inactive' | 'Archived';

export type UserRole = 
  | 'Viewer' 
  | 'Store Associate'
  | 'Store Manager'
  | 'District Manager'
  | 'Directory Data Steward' 
  | 'Editor' 
  | 'System Administrator';

export type AccessScope = 'Company-wide' | 'District' | 'Store' | 'Department';

export interface DayHours {
  open: string;  // e.g. "10:00 AM" or "Closed"
  close: string; // e.g. "09:00 PM"
  isClosed?: boolean;
}

export interface WeeklySchedule {
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday: DayHours;
  sunday: DayHours;
}

export interface SpecialHoursOverride {
  id: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  reason: string;
  hours: DayHours;
}

export interface HolidayHoursOverride {
  id: string;
  holidayName: string;
  date: string; // YYYY-MM-DD
  hours: DayHours;
}

export interface LocationNotice {
  status: OperationalStatus;
  shortDescription: string;
  effectiveDate: string; // YYYY-MM-DD
  expectedResolutionDate?: string; // YYYY-MM-DD
  lastUpdatedDate: string;
  updatedBy: string;
}

export interface MallContact {
  managementCompany?: string;
  officePhone?: string;
  securityPhone?: string;
  loadingDockInfo?: string;
  suiteNumber?: string;
}

export type ThemePreference = 'light' | 'dark' | 'system';

export type ContactPrivacyLevel = 'Directory Public' | 'Internal Management Only' | 'Pending Review';

export interface LocationRecord {
  id: string;                      // Immutable stable Location ID (e.g., "loc-shk-007")
  storeNumber: string;             // Display store/location # (e.g., "7", "11", "HQ-01")
  name: string;                    // Location Name (e.g., "Southland Mall", "SF Flagship S-100")
  type: LocationType;
  mallOrCenterName?: string;
  address: string;
  city: string;
  state: string;                   // CA, NV, WA, OR, TX
  zipCode: string;                 // Text string to preserve leading zeros
  phone: string;
  timeZone: 'America/Los_Angeles' | 'America/Chicago' | 'America/Denver' | 'America/New_York';
  region?: string;                 // e.g. "Northern California / PNW", "Southern California"
  district?: string;               // e.g. "District 1 (Rudy Calderon)", "District 2 (David Castro)"
  districtManagerId?: string;      // references PersonRecord id
  districtManagerName?: string;
  storeManagerId?: string;         // references PersonRecord id
  storeManagerName?: string;
  storeManagerPhone?: string;      // Work/Directory contact
  storeManagerPhoneVisibility?: ContactPrivacyLevel;
  isStoreManagerPhoneVerified?: boolean;
  assistantStoreManagerIds?: string[];
  assistantStoreManagerNames?: string[];
  keyHolderIds?: string[];
  keyHolderNames?: string[];
  standardHours: WeeklySchedule;
  specialHours: SpecialHoursOverride[];
  holidayHours: HolidayHoursOverride[];
  operationalStatus: OperationalStatus;
  recordStatus: RecordLifecycleStatus;
  activeNotice?: LocationNotice;
  mallContact?: MallContact;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  lastUpdated: string;
  lastUpdatedBy: string;
  lastVerifiedDate: string;
  verifiedBy: string;
  notes?: string;
  // GCP Data Labeling & Classification (DISPATCH-008)
  type_label?: string;            // e.g. "Retail Store", "Corporate Office", "Distribution Center"
  status_label?: string;          // e.g. "Open", "Temporarily Closed", "Under Remodel"
  // Google Business Profile (GBP) API Integration (Blueprint Sec 14 & 15)
  gbpLocationId?: string;          // e.g. "locations/1083921839281938/115"
  gbpPlaceId?: string;             // Google Maps Place ID (e.g. "ChIJS1p8wD-FhYARb2m_t9u...")
  gbpListingStatus?: 'VERIFIED' | 'SUSPENDED' | 'DUPLICATE' | 'NEEDS_VERIFICATION' | 'UNVERIFIED';
  gbpSyncStatus?: 'Synced' | 'Pending Push' | 'Out of Sync' | 'Unmapped' | 'Error';
  gbpLastSyncedAt?: string;
  gbpStoreCode?: string;
  gbpMapsUrl?: string;
  gbpSyncError?: string;
}

export interface PersonRecord {
  id: string;                      // Unique Person ID (e.g., "per-rudy-calderon")
  name: string;
  jobTitle: string;                // "District Manager", "Store Manager", "Assistant Store Manager", "Director of HR", etc.
  department: string;              // "Retail Field Leadership", "Store Operations", "Human Resources", "Retail Operations", "Marketing", "E-commerce", "Executive Management", "Warehouse & Logistics", "IT & Systems"
  workPhone: string;
  workEmail: string;
  phoneVisibility?: ContactPrivacyLevel;
  emailVisibility?: ContactPrivacyLevel;
  isPhoneVerified?: boolean;
  assignedLocationId?: string;     // Primary store or office Location ID
  assignedLocationName?: string;
  locationsOverseen?: string[];    // Array of Location IDs (for DMs, RMs)
  region?: string;
  district?: string;
  reportingToId?: string;
  reportingToName?: string;
  activeStatus: boolean;
  isTemporary?: boolean;           // e.g. "Amir Green (Temp.)"
  notes?: string;
  avatarUrl?: string;
  // GCP Data Labeling & Classification (DISPATCH-008)
  type_label?: string;            // e.g. "Employee / Store Operations", "District Leadership"
  status_label?: string;          // e.g. "Active Employee", "Inactive"
}

export type RequestChangeType = 
  | 'Store Manager Change'
  | 'Assistant Manager Change'
  | 'Key Holder Change'
  | 'Phone Number Correction'
  | 'Address Correction'
  | 'Store Hours Update'
  | 'Holiday / Special Hours'
  | 'Region / District Assignment'
  | 'Operational Status Change'
  | 'Employee Information Correction'
  | 'New Location Proposal'
  | 'Store Relocation'
  | 'Store Closure Notice';

export type RequestStatus = 
  | 'Submitted'
  | 'Under Review'
  | 'Approved'
  | 'Completed'
  | 'Rejected'
  | 'Data Conflict';

export interface UpdateRequest {
  id: string;
  targetType: 'Location' | 'Person';
  targetId: string;
  targetName: string;
  targetStoreNumber?: string;
  changeType: RequestChangeType;
  currentSnapshot: Record<string, any>;
  requestedChanges: Record<string, any>;
  notes: string;
  submittedBy: {
    name: string;
    email: string;
    role: UserRole;
  };
  submittedAt: string;
  assignedReviewer?: string;
  status: RequestStatus;
  decisionNotes?: string;
  decisionBy?: string;
  decisionAt?: string;
}

export interface AuditEntry {
  id: string;
  entityType: 'Location' | 'Person' | 'User' | 'Setting' | 'Request';
  entityId: string;
  entityName: string;
  fieldChanged: string;
  previousValue: string;
  newValue: string;
  changedBy: string;
  timestamp: string;
  relatedRequestId?: string;
  isRollback?: boolean;
}

export interface UserAccount {
  id: string;
  email: string;
  displayName: string;
  authMethod: 'google' | 'email_password';
  role: UserRole;
  accessScope: AccessScope;
  assignedStoreId?: string;
  assignedDistrict?: string;
  personId?: string; // Linked PersonRecord id
  status: 'Active' | 'Invited' | 'Deactivated';
  invitationToken?: string;
  invitedBy?: string;
  lastLogin?: string;
  createdAt: string;
}

export interface StagedLocationImport {
  rowNumber: number;
  storeNumber: string;
  name: string;
  type: LocationType;
  mallOrCenterName?: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  timeZone: 'America/Los_Angeles' | 'America/Chicago' | 'America/Denver' | 'America/New_York';
  district?: string;
  districtManagerName?: string;
  storeManagerName?: string;
  storeManagerPhone?: string;
  hoursSummary?: string;
  latitude?: number;
  longitude?: number;
  status: 'Valid' | 'Warning' | 'Error' | 'Duplicate';
  validationMessages: string[];
  resolved: boolean;
}

export interface ImportValidationResult {
  totalRows: number;
  validCount: number;
  warningCount: number;
  errorCount: number;
  duplicateCount: number;
  stagedRows: StagedLocationImport[];
}

export interface EmailRecipientGroup {
  id: string;
  name: string;
  description: string;
  emails: string[];
}

export type AppEnvironment = 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';

export type ApiScope = 
  | 'locations:read' 
  | 'locations:write' 
  | 'personnel:read'
  | 'contacts:directory' 
  | 'notices:read' 
  | 'exports:csv';

export interface ApiClient {
  id: string;
  name: string;
  description: string;
  apiKey: string;
  scopes: ApiScope[];
  createdAt: string;
  lastUsedAt?: string;
  status: 'Active' | 'Revoked';
  rateLimitPerMinute: number;
}

export interface DatabaseBackupSnapshot {
  id: string;
  timestamp: string;
  name: string;
  type: 'manual' | 'automated';
  sizeBytes: number;
  recordCounts: {
    locations: number;
    people: number;
    requests: number;
    auditLogs: number;
    users: number;
  };
  createdBy: string;
  status: 'Completed' | 'In Progress';
}


export interface SmtpConfig {
  host: string;
  port: number;
  secureTls: boolean;
  username: string;
  password?: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  replyToEmail?: string;
  directoryStewardEmail: string;
  // Notification Rules Engine (Blueprint Sec 10A)
  notifyOnNewRequest: boolean;
  notifyRequesterOnDecision: boolean;
  notifyOnMajorChange: boolean;
  notifyOnStoreManagerChange?: boolean;
  notifyOnOperationalStatusChange?: boolean;
  notifyOnLocationCreation?: boolean;
  notifyOnUserOffboarded?: boolean;
  dailyDigestDistrictManagers?: boolean;
  weeklyStewardSummary?: boolean;
}

export interface EmailLogEntry {
  id: string;
  emailType: 'Directory Update Request' | 'Request Status Update' | 'Store Directory PDF' | 'Major Leadership Change' | 'User Offboarding Notice' | 'Operational Status Notice' | 'Test Email';
  recipients: string[];
  subject: string;
  sentBy: string;
  sentAt: string;
  status: 'Sent' | 'Failed' | 'Queued';
  details?: string;
  attachmentName?: string;
}

export type PaperSize = 'Letter' | 'Legal' | 'Tabloid';

export interface GbpConfig {
  authMethod: 'service_account' | 'oauth_client';
  clientEmail: string;
  privateKeyId: string;
  privateKey: string;
  accountId: string;          // e.g. "accounts/1083921839281938"
  accountName: string;        // e.g. "Shiekh Shoes Master Retail Portfolio"
  clientId: string;
  clientSecret: string;
  scope: string;              // "https://www.googleapis.com/auth/business.manage"
  isConnected: boolean;
  lastHandshake: string;
  autoSyncOnUpdate: boolean;  // Trigger one-way push when location record is edited in SoR
  environment: 'PRODUCTION' | 'SANDBOX';
  rateLimitQuota: number;
}

export interface GbpLocationListing {
  locationName: string;       // e.g. "locations/1083921839281938/115829104829102"
  title: string;              // "Shiekh"
  storeCode: string;          // "115", "7", "11", etc.
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  placeId: string;
  mapsUrl: string;
  verificationStatus: 'VERIFIED' | 'SUSPENDED' | 'DUPLICATE' | 'NEEDS_VERIFICATION' | 'UNVERIFIED';
  openedStatus: 'OPEN' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY';
  linkedLocationId?: string;  // Internal SoR Location ID
}

export interface GbpSyncLogEntry {
  id: string;
  timestamp: string;
  locationId: string;
  storeNumber: string;
  locationName: string;
  gbpLocationId: string;
  action: 'Push Full Location' | 'Update Operating Hours' | 'Update Operational Status' | 'Link GBP Listing' | 'Bulk Synchronization' | 'Handshake Ping';
  payloadSummary: string;
  httpStatus: number;
  status: 'SUCCESS' | 'ERROR' | 'WARNING';
  errorMessage?: string;
  diffSummary?: string;
  syncedBy: string;
}

export type CloudSyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

export interface FirebaseConfigState {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket: string;
  messagingSenderId: string;
  oAuthClientId: string;
  isLiveConnected: boolean;
  firestoreSyncStatus: CloudSyncStatus;
  lastCloudSyncAt: string | null;
  activeCloudUser: {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
  } | null;
}

