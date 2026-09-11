export type LocationType = 
  | 'Enclosed Mall' 
  | 'Strip Center / Shopping Center' 
  | 'Street / Standalone Location' 
  | 'Corporate Office' 
  | 'Warehouse / Distribution Center' 
  | 'Other Company Location';

export type OperationalStatus = 
  | 'Open — Normal Operations' 
  | 'Temporarily Modified Hours' 
  | 'Under Remodel / Renovation' 
  | 'Temporarily Closed — Emergency' 
  | 'Opening Soon — New Store' 
  | 'Permanently Closed';

export type RecordStatus = 'Active' | 'Retired' | 'Draft';

export type ContactPrivacyLevel = 'Public' | 'Internal' | 'Restricted';

export interface RegionRecord {
  id: string;
  version?: number;
  name: string;
  status: 'Active' | 'Retired';
}

export interface DistrictRecord {
  id: string;
  version?: number;
  name: string;
  regionId: string;
  status: 'Active' | 'Retired';
}

export type UserRole = 
  | 'Viewer'
  | 'Editor'
  | 'Directory Data Steward' 
  | 'Store Operations Leadership' 
  | 'Store Manager' 
  | 'Customer Support Lead' 
  | 'System Administrator';

export interface UserProfile {
  id: string;
  version?: number;
  name: string;
  email: string;
  role: UserRole;
  storeNumber?: string;
  accessScope?: string;
  personId?: string;
  status?: 'Active' | 'Revoked' | 'Suspended';
  identityLinked?: boolean;
  firebaseIdentityProvisioned?: boolean;
  invitationStatus?: 'Pending' | 'Accepted';
  invitedAt?: string;
  lastLogin?: string;
  invitationDelivery?: 'Firebase email' | 'SMTP email' | 'Copied link';
  invitationDeliveryStatus?: 'Submitted' | 'Accepted';
}

export type UserOnboardingChoice = 'send' | 'copy' | 'access-only';

export interface DayHours {
  open: string;
  close: string;
  isClosed: boolean;
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

export interface HolidayHoursOverride {
  id: string;
  holidayName: string;
  date: string; // YYYY-MM-DD
  hours: DayHours;
}

export interface SpecialHoursOverride {
  id: string;
  description: string;
  startDate: string;
  endDate: string;
  hours: DayHours;
}

export interface TemporaryNotice {
  shortDescription: string;
  effectiveDate: string;
  expectedResolutionDate?: string;
  displayUntilDate?: string;
}

export interface LocationRecord {
  id: string;
  version?: number;
  storeNumber: string;
  name: string;
  type: LocationType;
  mallOrCenterName?: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  phoneExtension?: string;
  phonePrivacy?: ContactPrivacyLevel;
  timeZone: 'America/Los_Angeles' | 'America/Chicago' | 'America/New_York' | 'America/Denver' | string;
  hierarchyApplicability?: 'Applicable' | 'Not Applicable' | 'Unknown';
  regionId?: string;
  districtId?: string;
  district?: string;
  districtManagerId?: string;
  districtManagerName?: string;
  regionalManagerId?: string;
  regionalManagerName?: string;
  storeManagerId?: string;
  storeManagerName?: string;
  storeManagerPhone?: string;
  storeManagerPhonePrivacy?: ContactPrivacyLevel;
  assistantStoreManagerIds?: string[];
  assistantStoreManagerNames?: string[];
  keyHolderIds?: string[];
  keyHolderNames?: string[];
  operationalStatus: OperationalStatus;
  activeNotice?: TemporaryNotice;
  standardHours: WeeklySchedule;
  hoursTemplateId?: string;
  hoursMode?: 'template' | 'custom';
  holidayHours?: HolidayHoursOverride[];
  specialHours?: SpecialHoursOverride[];
  recordStatus: RecordStatus;
  lastVerifiedAt?: string;
  lastVerifiedBy?: string;
  createdAt?: string;
  updatedAt?: string;
  qrCodeUrl?: string;
  slug?: string;
  googleReviewUrl?: string;
  storePageUrl?: string;
  customMetadata?: Record<string, import('./lib/customFields').CustomFieldValue>;
}

export interface Person {
  id: string;
  version?: number;
  firstName?: string;
  lastName?: string;
  fullName: string;
  phone?: string;
  phoneExtension?: string;
  email?: string;
  role?: string;
  status?: 'Active' | 'Inactive' | string;
  name?: string;
  jobTitle?: string;
  department?: string;
  workPhone?: string;
  workPhoneExtension?: string;
  workEmail?: string;
  activeStatus?: boolean;
  assignedLocations?: string[];
  district?: string;
  phonePrivacy?: ContactPrivacyLevel;
}

export type PersonRecord = Person;

export type RequestChangeType = 
  | 'Phone Number Correction'
  | 'Store Manager Change'
  | 'Operational Status Change'
  | 'Standard Hours Adjustment'
  | 'Holiday Hours Exception'
  | 'Address Update'
  | 'Other Store Info Update';

export type RequestStatus = 'Pending' | 'Approved' | 'Rejected';

export interface UpdateRequest {
  id: string;
  version?: number;
  targetId: string;
  targetType: 'Location' | 'Person';
  targetStoreNumber?: string;
  targetName: string;
  changeType: RequestChangeType;
  requestedBy: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  requestedAt: string;
  status: RequestStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewerNotes?: string;
  requestedChanges: Partial<LocationRecord> & { hoursSource?: string };
  currentSnapshot: Partial<LocationRecord>;
  reason?: string;
}

export interface HoursTemplate {
  id: string;
  name: string;
  description: string;
  schedule: WeeklySchedule;
  defaultForTypes?: LocationType[];
  isDefault?: boolean;
}

export interface CorporateHoliday {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  status: 'Closed (All Stores)' | 'Extended Hours' | 'Early Close' | 'Modified Hours';
  hours?: DayHours;
  notes?: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  triggerEvent: string;
  variables: string[];
  updatedAt: string;
}

export interface NotificationRule {
  id: string;
  eventName: string;
  recipientRole: string;
  enabled: boolean;
  deliveryChannel: 'Email' | 'Webhook' | 'In-App' | string;
}

export interface OutboxLogEntry {
  id: string;
  timestamp: string;
  recipient: string;
  subject: string;
  status: 'Delivered' | 'Queued' | 'Failed' | string;
  templateId?: string;
  errorMessage?: string;
}

export interface SopRunbook {
  id: string;
  title: string;
  category: string;
  lastUpdated: string;
  author: string;
  content: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  entityType: 'Location' | 'Person' | 'User' | 'Setting' | 'Request' | 'Communication';
  entityId: string;
  entityName: string;
  details: string;
  previousState?: any;
  newState?: any;
}
