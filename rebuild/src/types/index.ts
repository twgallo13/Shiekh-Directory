// Core types for Shiekh Directory rebuild - Slice 1

// === Base record metadata ===
export interface RecordMetadata {
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  updatedBy: string; // User/system identifier
  version: number;
}

// === Address ===
export interface Address {
  street: string;
  suite?: string;
  city: string;
  state: string;
  zip: string;
  country: string; // Default 'US'
}

// === Hours ===
export interface HoursInterval {
  open: string; // HH:MM 24h in location tz
  close: string; // HH:MM 24h in location tz (can be < open for overnight)
}

export interface DayHours {
  closed: boolean;
  intervals: HoursInterval[];
}

export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export type StandardHours = Record<DayOfWeek, DayHours>;

// === Hours Templates ===
export interface HoursTemplate {
  id: string;
  name: string; // e.g., "Standard Store Hours", "Mall Hours", "Outlet Hours"
  description?: string;
  hours: StandardHours;
  version: number; // Incremented each time template is saved
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  lifecycle: 'active' | 'archived';
}

// Record of template application to a location (versioned copy-on-apply)
export interface AppliedHoursTemplate {
  templateId: string;
  templateName: string;
  templateVersion: number; // Version at time of application
  appliedAt: string;
  appliedBy: string;
}

// === Hours Exceptions (subcollection) ===
export type HoursExceptionType = 'holiday' | 'special';

export interface HoursException {
  id: string;
  type: HoursExceptionType;
  label: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  closed: boolean;
  intervals: HoursInterval[];
  source?: string;
}

// === Closures (subcollection) ===
export type ClosureStatus = 'active' | 'ended';

// Controlled closure reason taxonomy - codes cannot be repurposed
export type ClosureReasonCode = 
  | 'ac_hvac'       // AC/HVAC issues
  | 'power'         // Power/utility failure
  | 'mall_landlord' // Mall or landlord issue
  | 'safety'        // Safety/security concern
  | 'weather'       // Weather-related
  | 'staffing'      // Staffing shortage
  | 'maintenance'   // Maintenance/repair
  | 'remodel'       // Remodel/renovation
  | 'relocation'    // Store relocation
  | 'other';        // Other (requires note)

export type ClosureType = 'same_day' | 'multi_day' | 'unknown_end';

export interface Closure {
  id: string;
  reason: string; // Display reason text (backward compatible)
  type?: ClosureType; // Optional for backward compat; defaults to same_day
  reasonCode?: ClosureReasonCode; // Structured reason code
  reasonNote?: string; // Internal detail for staff
  publicExplanation?: string; // Safe explanation for public display
  startsAt: string; // ISO timestamp UTC
  endsAt?: string; // ISO timestamp UTC - for same_day: local midnight, for multi_day: end date
  expiryUnresolved?: boolean; // True if timezone was invalid when created
  status: ClosureStatus;
  createdBy?: string; // User ID who created closure
  createdByEmail?: string;
  // Multi-day and unknown-end closures
  ownerId?: string; // Person ID responsible for follow-up
  ownerName?: string;
  nextReviewDate?: string; // YYYY-MM-DD for unknown_end closures
  // Renewal tracking for same-day closures
  renewedAt?: string; // ISO timestamp of last renewal
  renewedBy?: string; // User ID
  renewalCount?: number;
  // End tracking
  endedAt?: string; // ISO timestamp when ended (different from endsAt expiry)
  endedBy?: string; // User ID who ended it
  endedReason?: 'expired' | 'manual' | 'resolved'; // How it ended
}

// === Notices (subcollection) ===
export type NoticeAudience = 'internal' | 'public';
export type NoticeStatus = 'active' | 'expired' | 'resolved';

export interface Notice {
  id: string;
  text: string; // Short notice text, max 500 chars
  audience: NoticeAudience;
  status: NoticeStatus;
  effectiveFrom: string; // ISO timestamp
  effectiveUntil?: string; // ISO timestamp, if undefined = unknown
  expectedResolution?: string; // Brief description of when resolved
  createdBy: string;
  createdByEmail: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

// === Location ===
export type LocationKind = 'store' | 'warehouse' | 'office' | 'facility';
export type LocationLifecycle = 'planned' | 'active' | 'retired';

export interface Location extends RecordMetadata {
  id: string;
  kind: LocationKind;
  storeNumber: string; // Unique among non-retired, keeps leading zeros "007"
  name: string;
  lifecycle: LocationLifecycle;
  address: Address;
  timeZone: string; // IANA timezone
  mainPhone: string; // E.164 format stored, display formatted
  phonePublic: boolean;
  sharedInboxEmail?: string; // Mailbox, never a login
  regionId: string; // Required when active
  districtId: string; // Required when active
  storeType?: string;
  mallOrCenterName?: string;
  wayfindingDirections?: string; // <= 1000 chars
  standardHours?: StandardHours;
  appliedTemplate?: AppliedHoursTemplate; // Template this location's hours were copied from
  lastVerifiedAt?: string; // ISO timestamp
  lastVerifiedBy?: string; // User ID
}

// === Region ===
export interface Region extends RecordMetadata {
  id: string;
  code: string; // Unique string
  name: string;
  lifecycle: LocationLifecycle;
}

// === District ===
export interface District extends RecordMetadata {
  id: string;
  code: string; // Unique string
  name: string;
  regionId: string;
  lifecycle: LocationLifecycle;
}

// === Person ===
export type PersonLifecycle = 'active' | 'inactive';

export interface Person extends RecordMetadata {
  id: string;
  fullName: string;
  lifecycle: PersonLifecycle;
  workEmail?: string;
  workPhone?: string;
  mobilePhone?: string; // Visible only to Leader/Steward/Admin (slice 2)
  homeLocationId?: string;
}

// === Assignment ===
export type AssignmentRole = 'SM' | 'ASM' | 'KH' | 'DM' | 'RM' | 'OTHER';
export type AssignmentScopeType = 'location' | 'district' | 'region';
export type AssignmentSlot = 'primary' | 'additional';
export type AssignmentCapacity = 'primary' | 'training' | 'acting';

export interface Assignment extends RecordMetadata {
  id: string;
  personId: string;
  role: AssignmentRole;
  scopeType: AssignmentScopeType;
  scopeId: string; // Location/District/Region ID
  slot: AssignmentSlot;
  capacity?: AssignmentCapacity; // 'primary' (default), 'training', or 'acting'
  label?: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  endedAt?: string; // ISO timestamp - set when End action is used
}

// Position status for API responses
export type PositionStatus = 'filled' | 'vacant';

export interface PositionHolder {
  personId: string;
  fullName: string;
  capacity: AssignmentCapacity;
  slot: AssignmentSlot;
  startDate: string;
  endDate?: string;
}

// === Operating State ===
export type OperatingState = 'Open' | 'Closed' | 'Unknown';
export type ScheduleSource = 'standard' | 'exception' | 'closure' | 'unknown';

export interface OperatingStatus {
  state: OperatingState;
  reason: string;
  source: ScheduleSource;
  hours: DayHours | null;
  localDate: string; // YYYY-MM-DD
  localTime: string; // HH:MM
  timeZone: string;
  evaluatedAt: string; // ISO timestamp
  nextTransitionAt: string | null; // ISO timestamp
}

// === API Types ===
export interface SearchResult {
  type: 'location' | 'person';
  id: string;
  title: string;
  subtitle: string;
  phone?: string;
  statusNow?: OperatingStatus;
}

export interface LocationListItem {
  id: string;
  kind: LocationKind;
  storeNumber: string;
  name: string;
  city: string;
  state: string;
  statusNow: OperatingStatus;
  phone: string;
  phoneFormatted: string;
  smName?: string;
  sharedInboxEmail?: string;
}

export interface LeadershipHolder {
  id: string;
  name: string;
  slot: AssignmentSlot;
  capacity: AssignmentCapacity;
  label?: string;
}

export interface PositionInfo {
  status: PositionStatus;
  holders: LeadershipHolder[];
  primary?: LeadershipHolder; // The primary holder (if any) for backward compatibility
}

export interface LocationLeadership {
  sm?: { id: string; name: string; slot: AssignmentSlot; capacity?: AssignmentCapacity };
  smCoverage: { id: string; name: string; slot: AssignmentSlot; capacity?: AssignmentCapacity; label?: string }[];
  hasPrimarySm: boolean;
  smStatus: PositionStatus;
  asm: { id: string; name: string; slot: AssignmentSlot; capacity?: AssignmentCapacity }[];
  asmStatus: PositionStatus;
  kh: { id: string; name: string; slot: AssignmentSlot; capacity?: AssignmentCapacity }[];
  khStatus: PositionStatus;
  dm?: { id: string; name: string; capacity?: AssignmentCapacity };
  dmOthers?: { id: string; name: string; capacity: AssignmentCapacity }[];
  dmStatus: PositionStatus;
  rm?: { id: string; name: string; capacity?: AssignmentCapacity };
  rmOthers?: { id: string; name: string; capacity: AssignmentCapacity }[];
  rmStatus: PositionStatus;
}

export interface DaySchedule {
  date: string; // YYYY-MM-DD
  dayName: string;
  hours: DayHours;
  source: ScheduleSource;
  label?: string; // For holidays/exceptions
}

export interface LocationDetail extends Location {
  statusNow: OperatingStatus;
  todaySchedule: DaySchedule;
  weekSchedule: DaySchedule[]; // Today + next 7 days
  hoursExceptions: HoursException[];
  activeClosure: Closure | null;
  activeNotices: Notice[]; // Current active notices
  leadership: LocationLeadership;
  regionName: string;
  districtName: string;
  addressFormatted: string;
  phoneFormatted: string;
  mapsUrl: string;
}

// === Person Detail (Slice 4) ===
export interface PersonAssignment {
  id: string;
  role: AssignmentRole;
  scopeType: AssignmentScopeType;
  scopeId: string;
  scopeName: string;
  slot: AssignmentSlot;
  label?: string;
  startDate: string;
  endDate?: string;
  isActive: boolean;
}

export interface PersonDetail extends Person {
  assignments: PersonAssignment[];
  activeAssignments: PersonAssignment[];
}

export interface PersonListItem {
  id: string;
  fullName: string;
  workEmail?: string;
  lifecycle: PersonLifecycle;
  primaryRole?: string;
  primaryScopeName?: string;
}

// === Import Types ===
export interface ImportPreview {
  valid: boolean;
  errors: ImportError[];
  warnings: ImportWarning[];
  locationsToCreate: number;
  locationsToUpdate: number;
  peopleToCreate: number;
  peopleToUpdate: number;
  assignmentsToCreate: number;
  assignmentsToRemove: number;
}

export interface ImportError {
  row: number;
  column?: string;
  message: string;
}

export interface ImportWarning {
  row: number;
  column?: string;
  message: string;
}

export interface ImportResult {
  success: boolean;
  locationsCreated: number;
  locationsUpdated: number;
  peopleCreated: number;
  peopleUpdated: number;
  assignmentsCreated: number;
  assignmentsRemoved: number;
  errors: ImportError[];
}

// === API Error ===
export interface ApiError {
  error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string>;
    requestId: string;
  };
}

// ============================================
// Slice 2: Roles, Permissions, Editing, Audit
// ============================================

// === User Roles ===
export type UserRole = 'Viewer' | 'Store' | 'Leader' | 'Steward' | 'Admin';

export interface User extends RecordMetadata {
  id: string;
  email: string; // Sign-in email
  displayName: string;
  role: UserRole;
  status: 'active' | 'suspended' | 'inactive';
  // For Store role: the locationId they can access
  storeLocationId?: string;
  // For Leader role: links to a person record with DM/RM assignments
  personId?: string;
}

// === Permissions ===
export type Permission =
  | 'view:locations'
  | 'view:people'
  | 'view:mobilePhones'
  | 'edit:closure'
  | 'edit:hours'
  | 'edit:contactInfo' // phone, address, inbox - requires approval for Store/Leader
  | 'assign:storeLead' // SM/ASM/KH
  | 'assign:districtLead' // DM/RM
  | 'edit:districts'
  | 'approve:corrections'
  | 'export:data'
  | 'admin:users'
  | 'admin:system';

export type PermissionScope = 'all' | 'own-store' | 'own-scope' | 'propose-only';

export interface PermissionGrant {
  permission: Permission;
  scope: PermissionScope;
}

// === Audit Log ===
export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'approve'
  | 'reject'
  | 'assign'
  | 'unassign'
  | 'closure:start'
  | 'closure:end'
  | 'send'
  | 'respond'
  | 'cancel';

export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO timestamp
  userId: string;
  userEmail: string;
  userRole: UserRole;
  action: AuditAction;
  entityType: 'location' | 'person' | 'assignment' | 'closure' | 'correction' | 'user' | 'verification';
  entityId: string;
  entityName: string;
  locationId?: string | null; // For assignment entries - links to the store
  changes: AuditChange[];
  previousVersion?: number;
  newVersion?: number;
}

export interface AuditChange {
  field: string;
  oldValue?: string | number | boolean | null;
  newValue?: string | number | boolean | null;
}

// === Verification ===
export type VerificationStatus = 'pending' | 'confirmed' | 'expired' | 'cancelled';

export interface VerificationRequest extends RecordMetadata {
  id: string;
  locationId: string;
  locationName: string;
  storeNumber: string;
  status: VerificationStatus;
  sentAt: string; // ISO timestamp
  sentTo: string; // Email address
  sentBy: string; // User ID
  expiresAt: string; // ISO timestamp
  respondedAt?: string; // ISO timestamp
  respondedBy?: string; // User ID (store account)
  hoursConfirmed?: boolean;
  proposedChanges?: Record<string, unknown>;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNotes?: string;
  cancelledAt?: string; // ISO timestamp
  cancelledBy?: string; // User ID (Admin/Steward who cancelled)
  // Email tracking
  emailSent?: boolean;
  emailMessageId?: string;
  emailError?: string;
  lastReminderAt?: string;
  reminderCount?: number;
}

// === Corrections (requires Steward approval) ===
export type CorrectionStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type CorrectionType = 'phone' | 'address' | 'inbox' | 'hours';

// User-facing categories for issue reporting
export type CorrectionCategory = 
  | 'address'     // Address is wrong
  | 'suite'       // Suite/unit number is wrong
  | 'directions'  // Wayfinding directions need update
  | 'phone'       // Phone number is wrong
  | 'hours'       // Hours are incorrect
  | 'manager'     // Manager info is wrong
  | 'other';      // Other issue

export interface Correction extends RecordMetadata {
  id: string;
  status: CorrectionStatus;
  type: CorrectionType;
  category: CorrectionCategory; // User-selected category
  locationId: string;
  locationName: string;
  storeNumber: string;
  submittedBy: string; // User ID
  submittedByEmail: string;
  submittedByRole: UserRole;
  submittedAt: string;
  // The proposed changes
  proposedChanges: Record<string, unknown>;
  proposedNote?: string; // User's description of the issue
  // Current values at time of submission
  currentValues: Record<string, unknown>;
  // Review info (filled when approved/rejected)
  reviewedBy?: string;
  reviewedByEmail?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  // Cancellation info
  cancelledAt?: string;
  cancelledBy?: string;
  // Version of location when submitted (for conflict detection)
  locationVersion: number;
}

// === Extended Location Detail with permissions ===
export interface LocationDetailWithPermissions extends LocationDetail {
  canEdit: {
    closure: boolean;
    hours: boolean;
    contactInfo: boolean; // true = direct edit, false = propose only
    assignments: boolean;
  };
  pendingCorrections: Correction[];
}

// === User context returned by auth ===
export interface AuthUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  storeLocationId?: string; // For Store role
  leaderScope?: {
    districtIds: string[];
    regionIds: string[];
    locationIds: string[]; // All locations in their districts
  };
}
