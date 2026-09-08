# Shiekh Retail Location & Company Directory — Product Blueprint

<aside>
🎯

**Purpose:** Create a fast, reliable internal Retail Location & Company Directory that becomes the authoritative source for store information, leadership assignments, operating hours, location status, and reusable store data for other Shiekh applications.

</aside>

## Project Status

**Stage:** Approved product blueprint / build specification  

**Approval:** Approved for build planning on September 3, 2026  

**Primary users:** Retail stores, corporate employees, field leadership, and authorized administrators  

**Primary principle:** One approved source of truth for location data, used by the website, PDF directory, CSV exports, and internal applications. After initial migration, reconciliation, and validation, this application becomes the authoritative **System of Record (SoR)** for Shiekh location-directory data.

## Core User Experience

**Search → Find Location or Person → View Accurate Details → Contact the Right Person → Request a Correction if Needed**

## Core Administrative Workflow

**Authorized Sign-In → Review Requested Change → Approve or Reject → Update Authoritative Record → Preserve Change History**

---

## 1. Product Scope

This application is primarily a:

- **Retail Location Directory**
- **Company People Directory**
- **Store Leadership Assignment Directory**
- **Central Store Data Source for other internal applications**

It should **not** expand into a full HRIS, facilities-management platform, maintenance ticketing system, or task-management application.

## 2. Location Types

Support the following standard classifications:

- Enclosed Mall
- Strip Center / Shopping Center
- Street / Standalone Location
- Corporate Office
- Warehouse / Distribution Center
- Other Company Location

For mall and shopping-center locations, support optional fields for mall/center name, management contact details, and location notes.

## 3. Retail Organizational Structure

Support the standard retail hierarchy:

**Company → Region → District → Location**

For **retail stores**, Region and District should be assigned when those structures apply. **Corporate offices, warehouses/distribution centers, and other non-retail company locations must not be forced into a retail District**; Region and District may be optional / Not Applicable for those location types.

Each retail store should clearly identify:

- Store Manager
- Assistant Store Manager(s)
- Key Holder / additional store leadership when applicable
- District Manager
- Regional Manager when applicable

A manager may oversee multiple locations. Leadership assignments should be relationships between people and locations rather than duplicate employee records.

## 4. Location Profile

Each location should have one canonical record containing:

- Unique Location ID
- Store / Location Number
- Location Name
- Location Type
- Mall / Shopping Center Name when applicable
- Street Address
- City
- State
- ZIP Code
- Main Store Phone
- Location Time Zone
- Region when applicable
- District when applicable
- Location Manager / Store Manager when applicable
- Assistant Store Manager(s) when applicable
- Key Holder / other leadership assignments
- District Manager
- Regional Manager when applicable
- Standard Operating Hours
- Special Hours
- Holiday Hours
- Current Operational Status
- Record Lifecycle Status (Active / Inactive / Archived)
- Active Location Notice
- Last Updated Date
- Last Verified Date / Verified By

Use a **stable internal Location ID** so other systems can reference a store even if its manager, name, phone number, or other details change.

## 5. People Directory

Maintain canonical people records for important operational and corporate contacts, including:

- Store Managers
- Assistant Store Managers
- District Managers
- Regional Managers
- Retail Operations
- Human Resources
- Sales
- Marketing
- E-commerce
- Corporate Management
- Warehouse / Distribution
- Other operational departments

### Employee / Contact Record

Support:

- Unique Person ID
- Name
- Job Title
- Department
- Work Phone
- Work Email
- Assigned Location
- Locations Overseen
- Region / District when applicable
- Manager / Reporting Relationship when useful
- Active / Inactive Status

This is an operational directory. Do not store unnecessary confidential HR information.

## 6. Search & Quick Lookup

Universal search should be one of the most prominent features.

Allow search by:

- Store Number
- Location Name
- Mall / Shopping Center Name
- City
- State
- Employee Name
- Manager Name
- Department
- Job Title
- Region
- District

Clearly distinguish **Locations** and **People** in results.

The interface should prioritize fast scanning and immediate access to:

- Store Phone
- Address
- Today's Hours
- Store Manager
- Assistant Manager(s)
- District Manager
- Current Operational Status

On mobile, phone numbers and email addresses should support tap-to-call and tap-to-email.

## 7. Store Hours Management

Use structured schedules rather than one free-text hours field.

### Standard Hours

Normal recurring weekly operating schedule.

### Special Hours

Temporary changes that apply only to defined dates.

### Holiday Hours

Holiday-specific operating times.

### Temporary Closure

A defined period when a location is not operating.

Special or holiday hours should override normal hours only for the applicable dates and should not replace the normal recurring schedule.

All calculations for **Today’s Hours**, special hours, holiday hours, and effective dates must use the location’s configured **local time zone**. A store in another state must not inherit the administrator’s browser time zone.

### Global Hours Templates

The system must support a **Hours Template Engine** so common schedules are defined once and reused across many locations.

- System Administrators must be able to **create, read, update, and delete** reusable schedule templates (for example, *"Template 1: Standard Mall M–Th 11–8"*).
- Each template defines a full recurring weekly schedule, including closed days.
- Templates must be named clearly and be selectable when editing an individual location or when running a bulk update.
- Editing a template should make clear which locations currently use it, and whether the change propagates to assigned locations or applies only to future assignments.
- Deleting or retiring a template must not silently clear hours from locations already using it.

### Bulk Update Engine

Provide a **mass-assignment utility** so Directory Data Stewards can maintain hours at scale without editing stores one at a time.

- Filter/select stores by **District**, **Region**, location type, state, or explicit multi-select.
- Apply an **Hours Template** or a **Holiday / Special Hours Exception** to **50+ stores simultaneously**.
- Follow the same import/bulk-update safety pattern: **Select → Preview Changes → Confirm → Apply → Audit**.
- Show a preview of affected locations and the resulting before/after hours before commit.
- Record bulk changes in the audit history, including who applied them, the template or exception used, and the affected locations.
- Support excluding individual locations from a bulk action and preserving intentional per-store overrides.

### UX vs. Data Schema Separation

The hours interface and the stored data format are intentionally separate concerns.

- The frontend must present a **simple 12-hour AM/PM visual schedule builder** that is fast and familiar for store and corporate users.
- The backend must silently translate that input into the **rigid 24-hour structured JSON schema** required by Google's API and other downstream consumers.
- Users must never be asked to enter 24-hour times, ISO strings, or raw JSON.
- Validation (overlapping ranges, close-before-open, missing days, overnight hours) should be handled in the builder with plain-language messages.
- Round-tripping must be lossless: data stored from the builder and re-loaded into it must display identically.

## 8. Operational Status & Location Notices

Support operational statuses such as:

- Open — Normal Operations
- Opening Soon
- Temporarily Closed
- Modified Hours
- Under Remodel
- Maintenance / Repair Issue
- Relocating
- Closing
- Permanently Closed

An optional Location Notice should include:

- Status
- Short Description
- Effective Date
- Expected End / Resolution Date when known
- Last Updated Date
- Updated By

### Required Capture for Non-Standard Statuses

When a location is placed in any non-standard status — for example **Temporarily Closed**, **Under Remodel**, **Maintenance / Repair Issue**, **Relocating**, **Modified Hours**, **Opening Soon**, or **Closing** — the interface must capture:

- **Expected Resolution Date** (expected reopen / resolution / effective end date)
- **Short Description** (a brief, plain-language explanation suitable for internal display)

These two fields drive the **active alerts banner** on the dashboard, so the status change should not be savable without them unless an authorized role explicitly marks the resolution date as unknown. When a date is genuinely unknown, require an explicit "Date unknown" selection rather than allowing a silently blank field, and surface those records to the Directory Data Steward for follow-up.

Expired or past-dated notices should be flagged for review rather than displayed indefinitely as current.

Operational notices communicate location condition only. Do not turn them into a facilities work-order system.

## 8A. Application Shell, Navigation, Theme & Design System

The application should use a professional **enterprise productivity application** design system with a clean Microsoft 365 / Fluent-style look and feel: structured, familiar, restrained, highly readable, and appropriate for daily corporate and retail operations use.

Do not imitate Microsoft branding or logos. Use the design principles: clear hierarchy, compact information density, simple iconography, consistent controls, accessible contrast, and predictable navigation.

### Theme / Appearance

Support user-selectable appearance modes:

- **Light Mode**
- **Dark Mode**
- **Use System Setting**

A user's theme preference should persist to their account where supported. Administrators may configure a default theme, but users should be able to override it for their own session/account.

Both themes must maintain accessible contrast and preserve status colors, district color coding, tables, forms, and PDF preview readability.

### Global Application Shell

Use a consistent application shell across the authenticated experience.

**Desktop / Tablet:**

- Persistent or collapsible left navigation
- Top application bar
- Global search
- Current page title / breadcrumb context
- Notifications indicator when applicable
- User profile / account menu
- Theme control or appearance setting
- Help / support entry point when configured

**Mobile:**

- Compact top bar
- Collapsible navigation drawer / menu
- Search remains easy to reach
- Large enough tap targets without oversized cards
- Preserve clear Back navigation and page context

Users should not encounter dead-end screens. Every detail, edit, approval, settings, and administrative screen should provide an obvious path back to the relevant list, dashboard, or previous context.

### Primary User Navigation

The main navigation should include, based on the user's permissions:

- **Dashboard / Home**
- **Locations**
- **People Directory**
- **Updates / Alerts**
- **Requests / Corrections**
- **Store Directory PDF / Exports**
- **My Profile**
- **Admin / Settings** — authorized roles only

Global search should remain accessible throughout the app.

### Role-Aware Dashboard / Home

The dashboard should be operational, not analytics-heavy.

For Viewers, emphasize:

- Global search
- Quick store lookup
- Quick people lookup
- Current location alerts
- Today's important store notices
- Request a correction
- Download the current directory when permitted

For Directory Data Stewards, additionally show:

- New / pending update requests
- Records requiring verification
- Locations with missing manager assignments or incomplete required information
- Recent approved changes
- Failed or pending notification/email items when relevant

For System Administrators, additionally surface system-level items requiring attention, such as authentication, SMTP, integration, or data-import failures. Avoid unnecessary KPI dashboards.

### User Profile / Account

Each authenticated user should have a **My Profile / Account** area where appropriate to their authentication method.

Support:

- Display name
- Login email / identity
- Linked People Directory record when applicable
- Assigned access role
- Assigned location / scope when applicable
- Theme preference
- Password reset/change path for email/password users
- Sign out

Users must not be able to self-promote their role, change their authorization scope, or alter protected directory fields unless their role explicitly permits it.

### Administrative Console / Application Settings

Create one organized **Admin Console** rather than scattering administrative functions across unrelated screens.

Show sections based on role permissions. The Admin Console should provide clear management areas for:

**Directory Data**

- Locations / Stores
- People / Contacts
- Leadership Assignments
- Regions / Districts
- Store Types / Location Types where configurable
- Operating Hours
- Holiday / Special Hours
- Operational Status / Notices

**Users & Access**

- User Accounts
- Invitations / Account Activation
- Roles & Permissions
- Location / District / Company access scope
- Onboarding
- Offboarding / Deactivation
- Password reset actions

**Requests & Governance**

- Update Requests
- Approval Queue
- Data Conflicts / Re-review
- Verification / Stale Records
- Audit History

**Communications**

- Notification Recipients
- Directory Data Steward / Notification Owner
- SMTP / Email Settings
- Notification Rules
- Email Delivery Log

**Outputs & Integrations**

- PDF Directory / Print Settings
- CSV Export Settings
- API / Application Access
- API Clients / Service Accounts
- API Permissions / Scopes
- Credential Creation / Rotation / Revocation
- Import / Migration Tools

**System**

- Authentication Configuration
- Security Settings
- Application Defaults
- Theme Default
- Backup & Recovery Strategy
- Administrative Backup / Restore Controls when supported by the selected platform
- Integration Status / Health

Do not expose settings to users who do not have permission to manage them.

### Configuration Principle

Important operational settings must be configurable through the application whenever practical rather than requiring a developer to change code for routine administration.

Examples include:

- Directory Data Steward assignment
- User roles
- User access scope
- Region / District assignments
- Store status options where safely configurable
- Notification recipients
- Notification rules
- PDF print profile
- SMTP configuration
- API clients / service accounts, permissions/scopes, credentials, rotation, and revocation

Sensitive system secrets must still use secure backend secret storage and should not be exposed after entry.

## 9. Authentication, User Accounts & Role-Based Access

The directory is an **internal authenticated application**. Directory information should not be publicly accessible without sign-in.

Support **two authentication methods** because store users and corporate users do not all use the same account system.

### Supported Sign-In Methods

**Google Sign-In**

- Available for authorized corporate, administrative, and other users who have an appropriate Google account.
- Prefer company Google Workspace authentication when available.

**Email + Password**

- Required for Store Managers and other authorized viewers who do not have Google accounts.
- Users should sign in with an approved email address and password.
- Support secure password reset / forgot-password functionality.
- Password authentication must use the platform's secure authentication service. Never store readable/plain-text passwords in the application database.

Both sign-in methods should lead into the **same user account and permission system**. A user's authorization must not depend on whether they signed in with Google or email/password.

Authentication answers **who the user is**. Application permissions determine **what that user may see or change**.

### User Account Management & User Lifecycle

Use standard **CRUD and lifecycle management** principles for users and directory records. In plain terms, authorized administrators must be able to create, view, update, deactivate/archive, and when appropriate restore records without developer assistance.

For records with historical activity, prefer **deactivate / archive** over permanent deletion so audit history remains intact.

Authorized administrators should be able to:

- Create or invite user accounts
- View/search user accounts and current access
- Edit account metadata that is safe to administer
- Assign or change the appropriate access role
- Assign Store, District, Region, Department, or Company access scope when applicable
- Associate a user with a store/location when applicable
- Associate a user account with the corresponding People Directory record when appropriate
- Activate or deactivate access
- Resend invitations / activation instructions
- Reset or trigger password-reset workflows for email/password users
- Change user permissions without recreating the person or location record
- Review account status and last sign-in information when the authentication platform provides it
- Preserve audit history for access changes

### User Onboarding Workflow

Provide a clear administrative onboarding workflow:

**Create / Select Person → Create or Invite Login Account → Choose Authentication Method → Assign Role → Assign Access Scope / Location → Review → Activate / Send Invite**

The system should validate before activation that required access information is complete and should avoid creating duplicate login accounts for the same person/email.

Where appropriate, onboarding should support:

- Google-authenticated corporate users
- Email/password store or other users
- Linking the account to an existing People Directory record
- Assigning Store / District / Company scope
- Sending account activation or password-setup instructions
- Recording who created/approved the access and when

### User Offboarding Workflow

Provide a controlled offboarding process:

**Select User → Review Current Role / Scope / Assignments → Deactivate Login → End or Reassign Operational Assignments as Needed → Preserve Historical Records → Confirm Completion**

Offboarding must:

- Remove application access promptly
- Revoke active sessions/tokens when the authentication platform supports it
- Preserve audit history
- Preserve the People Directory record when historical reference is required, marking it inactive rather than deleting it
- Flag active Store Manager / leadership assignments that require reassignment
- Never silently delete historical requests, approvals, emails, or changes created by that user

Deactivation is a **soft-delete**, never a hard delete. Deactivating a user must automatically:

- Run a **leadership assignment check** that detects any active Store Manager, Assistant Store Manager, Key Holder, District Manager, or Regional Manager assignments held by that person.
- **Flag those locations for reassignment** and present them to the administrator during offboarding, with the option to reassign immediately or leave them flagged in the Data Steward queue.
- Prevent stores from being left silently without a responsible manager of record.
- **Permanently preserve historical audit logs**, requests, approvals, and email records associated with the user, with the account marked inactive rather than removed.

Do not automatically give application access to every person listed in the People Directory. **Directory records and login accounts are separate concepts.**

Examples:

- A Store Manager may have both a People Directory record and a Viewer login account.
- An HR contact may appear in the People Directory but may or may not need an application login.
- An Administrator may have a login account with elevated permissions and also appear in the People Directory.

Where useful, link the User Account to the corresponding Person record rather than duplicating employee information.

### Suggested Access Roles

**Viewer — default store/corporate user**

- Sign in using Google or email/password
- Search locations and people
- View store details, managers, hours, notices, and directory information
- Download the approved Store Directory PDF when permitted
- Submit update/correction requests
- Cannot directly change authoritative directory data

**Directory Data Steward (Directory Manager) — operational owner of directory data**

- All Viewer permissions
- Add and edit approved location and People Directory information
- Assign store leadership
- Manage Region / District assignments
- Manage hours and operational status
- Review, approve, reject, and complete update requests
- Generate and email the approved Store Directory PDF
- Generate approved CSV exports
- Review directory audit history
- Cannot manage system-level authentication, SMTP secrets, or API credentials unless also granted System Administrator access

**Editor — optional scoped role**

- All Viewer permissions
- May draft or submit changes only within specifically assigned scope
- Drafted changes require Directory Data Steward or System Administrator approval before becoming authoritative unless an explicit direct-edit permission is granted
- Must not be able to approve their own proposed change by default

**System Administrator**

- All Directory Data Steward permissions
- Manage user accounts and access roles
- Configure authentication and security settings
- Configure SMTP / email infrastructure
- Manage approved API clients / service accounts, permissions/scopes, credentials, rotation, and revocation
- Manage system-level configuration, backup/recovery, and integrations

### Access Control Principles

- **No anonymous access** to the internal directory unless explicitly approved later.
- New accounts should receive the lowest appropriate role by default.
- Deactivated users must immediately lose access without deleting their historical activity.
- Changing a Store Manager assignment should not automatically grant or remove application access unless the corresponding user-account action is intentionally performed.
- Administrative and data-changing actions must be authorized by role on the server/backend, not only hidden in the user interface.
- Directory Data Steward and System Administrator accounts should support stronger account protection such as MFA when the selected authentication platform supports it.

### Directory Contact Privacy

The directory should display only contact information intentionally approved for internal directory use.

- Store main phone numbers and company location information are visible to authenticated viewers.
- Manager and employee phone/email fields should be treated as **work/directory contact information**.
- Do not expose a personal phone number, personal email address, or other private employee information unless it has explicitly been designated for internal directory use.
- If the imported spreadsheet contains a manager phone number, preserve it during migration but classify it for administrative review as a directory/work contact before broad publication when its status is unclear.

### User Audit Trail

For important account and permission changes, record:

- User affected
- Action performed
- Previous role/status
- New role/status
- Administrator who made the change
- Timestamp

Administrative directory changes should continue to capture user, timestamp, previous value, and new value.

## 10. Request an Update / Correction

Ordinary users should be able to report inaccurate information without directly overwriting authoritative records.

Common requests:

- Store Manager change
- Assistant Manager change
- Phone number correction
- Address correction
- Store hours change
- Holiday hours update
- Region / District assignment correction
- Operational status change
- Employee information correction
- New location
- Store relocation
- Store closure

### Request Fields

- Location or Person Affected
- Change Type
- Current Information when applicable
- Requested New Information
- Notes
- Submitted By
- Submitted Date
- Assigned Reviewer / Directory Data Steward
- Request Status
- Decision Notes when approved, rejected, or changed
- Status timestamps

### Workflow

**Submitted → Under Review → Approved → Completed**

Also support:

**Rejected / No Change Required**

### Approval Integrity

Before an approved request is applied, verify that the underlying authoritative record has not changed since the request was submitted. If it has changed, flag the request as a **data conflict / re-review required** rather than overwriting newer information.

The approval screen should clearly show **Current Value → Requested Value** before the reviewer confirms the change. Approval and application should be recorded in the audit history.

## 10A. Email Notifications & SMTP Support

Provide configurable **SMTP email support** so the application can send operational notifications and distribute the current Store Directory PDF without requiring users to leave the application.

### SMTP Configuration

Authorized administrators should be able to configure the application's outbound email service using standard SMTP settings or a compatible transactional email provider.

Support configuration such as:

- SMTP host
- SMTP port
- Secure connection / TLS
- SMTP username
- SMTP credential / app password
- From name
- From email address
- Reply-to address when applicable

SMTP credentials must be stored securely using the platform's secret / environment-variable system and must never be exposed in the browser, normal application database records, logs, or user-facing admin screens after initial entry.

Provide an administrative **Send Test Email** function so the email configuration can be verified before notifications are enabled.

### Directory Notification Owner

Allow one or more authorized users to be designated as the **Directory Data Steward / Directory Notification Owner** responsible for maintaining store information.

This assignment should be configurable rather than hard-coded to a specific employee so responsibility can be transferred later without development work.

### Update Request Notifications

Automatically email the designated Directory Data Steward / notification recipients when:

- A new directory correction or update request is submitted
- A request is assigned for review
- Additional information is added to a request, when supported
- A request remains unresolved and an optional reminder threshold has been reached

The notification should contain enough information to act without exposing unnecessary sensitive data, including:

- Request type
- Store / location or person affected
- Requested change summary
- Submitted by
- Submitted date/time
- Direct link back to the request in the application

### Requester Notifications

Where the submitter has a valid email address, support notifications when their request is:

- Received
- Approved
- Rejected / No Change Required
- Completed

Allow administrators to control which requester notifications are enabled so the system does not generate unnecessary email.

### Important Directory Change Notifications

Support optional notifications for significant approved changes such as:

- Store Manager change
- District Manager change
- Store opening
- Store closing
- Store relocation
- Temporary closure
- Major operating-hours change

These notifications should be configurable. Do not email users for every minor edit by default.

### Email the Store Directory PDF

Authorized users, especially the Directory Data Steward and System Administrators, should be able to generate the current approved one-sheet Store Directory PDF and **send it by email directly from the application**.

The email workflow should allow the sender to:

- Generate the latest PDF from the authoritative directory data
- Preview / confirm that the current directory version is being sent
- Enter or select recipients
- Use To / CC when appropriate
- Enter a subject
- Enter or edit a short message
- Attach the generated PDF automatically
- Confirm before sending

The attached PDF must be generated at send time from the same approved master directory records. Do not send an old manually uploaded copy when newer approved directory data exists.

Support reusable recipient lists or groups if practical, such as:

- Store Managers
- District Managers
- Corporate recipients
- Selected users / custom email addresses

Do not turn this feature into a full email-marketing or campaign system. Its purpose is operational notification and controlled directory distribution.

### Email Delivery Audit

Maintain a lightweight delivery log for important system-generated and manually sent directory emails, including:

- Email type
- Recipient(s)
- Subject
- Related request / directory version when applicable
- Sent by, for manual sends
- Sent date/time
- Delivery status when available
- Failure/error status when applicable

Do not store SMTP passwords, full authentication secrets, or unnecessary email-body history in the audit log.

### Notification Principle

**Directory event → Appropriate notification → Recipient returns to the application for review/action**

Email should alert and route users back to the authoritative application. It should not become a second place where directory changes are maintained.

## 11. Change History / Audit Trail

Maintain a lightweight audit history for important directory changes, especially:

- Store Manager assignments
- Leadership assignments
- Address
- Store Phone
- Region / District
- Operating Hours
- Operational Status
- Store Opening / Relocation / Closure

Track:

- Record
- Field Changed
- Previous Value
- New Value
- Changed By
- Timestamp
- Related Update Request when applicable

## 12. Printable One-Sheet Store Directory PDF

Users should be able to download a clean, printable **Store Directory PDF** designed specifically to be printed and posted in stores and corporate offices for fast reference.

The attached **Shiek Shoes Store Directory 10.09.25.xlsx** is the visual and operational reference for this output. The current directory is intentionally compact and color-coordinated so employees can scan it quickly. Preserve that practical function in the generated PDF rather than creating a generic report-style export.

### Required Print Format

- Generate a **single-sheet directory** for the active retail store list.
- Use **landscape orientation**.
- Use a compact table layout that remains clear and readable when printed.
- Optimize column widths, typography, spacing, and margins for one-sheet use.
- Allow an administrator to set the standard office paper size / print profile (for example Letter, Legal, or Tabloid) so “one sheet” does not force unreadably small text. Preserve a minimum readable font size and use the configured office print profile for future generations.
- Avoid oversized headers, decorative graphics, excessive whitespace, cards, or dashboard-style elements.
- Prioritize office-wall / back-office reference readability over presentation styling.

### Directory Information

Include the operational information employees need for quick reference, based on the current directory format:

- District Manager
- Store Number
- Store Phone
- Store / Location Name
- Street Address
- City
- State
- ZIP Code
- Store Manager
- Store Manager Phone
- Assistant Store Manager
- Additional Assistant Manager / Key Holder when applicable

If future requirements add optional fields such as Location Type or District, include them only if the one-sheet layout remains readable.

### Color-Coding Requirement

Use purposeful, light background colors to make groups of stores easy to identify at a glance.

The current reference sheet uses a consistent row color by **District Manager assignment**. Preserve this concept dynamically in the generated PDF:

- All stores assigned to the same District Manager should share the same light background color.
- Different District Managers should have clearly distinguishable colors.
- Use soft, print-friendly colors with strong text contrast.
- Include a small legend when useful.
- Color assignments should update automatically when leadership assignments change; they should not require manually recoloring individual rows.

The current reference demonstrates this pattern with light green, light blue, and light pink groupings. Exact colors may be refined for print readability, but the grouping behavior should remain.

### PDF Header

Include:

- **Shiekh Shoes Store Directory**
- Generated / Updated Date
- Optional small District Manager color legend

The PDF must always be generated directly from the same approved master location and leadership records used by the application.

**Source-of-truth rule:** A user should never have to manually rebuild or recolor the posted store directory after a store or manager change. Updating the authoritative directory should automatically update the next generated PDF.

## 13. CSV Store Directory Export

Provide a structured CSV export for authorized users and system integration.

Recommended stable columns include:

- `location_id`
- `store_number`
- `location_name`
- `location_type`
- `mall_or_center_name`
- `address_1`
- `city`
- `state`
- `postal_code`
- `phone`
- `region`
- `district`
- `store_manager`
- `store_manager_email`
- `district_manager`
- `operational_status`
- `latitude`
- `longitude`
- `last_updated`

Keep export field names stable wherever practical so downstream applications do not require repeated remapping.

## 14. Internal Store Directory API

Design the application so other Shiekh applications can retrieve the latest approved store information through a secure **read-only API or equivalent structured integration layer**.

Each consuming application should use its own **API Client / Service Account** or equivalent machine identity rather than sharing one common credential. Access should be granted using least-privilege permissions/scopes, and credentials must support secure creation, rotation, and revocation without disrupting unrelated integrations.

Primary use cases:

- Populate a current store dropdown
- Retrieve all active stores
- Retrieve a store by Store Number or Location ID
- Retrieve current address / phone
- Retrieve current Store Manager or District Manager
- Retrieve Region / District
- Retrieve operating hours
- Retrieve operational status

### Conceptual Read Endpoints

- `GET /api/locations`
- `GET /api/locations/{location_id}`
- `GET /api/locations/store/{store_number}`
- Filter by Region, District, State, Location Type, Active Status, or Operational Status

Use the implementation appropriate for the selected platform; these endpoints describe the required capability rather than prescribing a specific backend.

### API Security & Stability Principle

External/internal applications should initially receive **read-only access**.

Do not expose unauthenticated administrative write access. If service credentials or tokens are required, provide a secure process to issue, identify, rotate, and revoke them.

Because other Shiekh applications may depend on this data source:

- Use a versioned API contract such as `/api/v1/...` or equivalent versioning.
- Keep Location IDs and published field names stable.
- Do not silently rename or remove fields used by downstream applications; breaking changes require a new API version or migration path.
- Support an `updated_since` or equivalent filter when practical so applications can efficiently retrieve records changed after a timestamp.
- Default store-list integrations to active records while allowing explicitly authorized consumers to request inactive/closed records when needed.
- Include `last_updated` in responses so consuming applications can determine data freshness.
- Use least-privilege API data access: a consuming application should receive only the fields it needs. Basic location integrations should not automatically receive employee phone/email data. Where contact information is required, use explicit API scopes/permissions for approved directory contact fields.

### Initial Launch Scope (Required)

For the initial launch, the required deliverable is the **integration-ready foundation**, not active live connections to other platforms:

- Secure **read-only API infrastructure** as described above
- **API Client / Service Account and Service Token provisioning**, including issuance, identification, scoping, rotation, and revocation
- Stable, versioned field contract and `last_updated` freshness data
- Documentation sufficient for another team to connect a consuming system

This allows the POS (Epicor), **Shiekh.com** e-commerce, and other internal applications to consume approved store data **when they are ready**, without requiring those integrations to be built or activated before launch.

### Future Phase Integrations (Optional / Not Required for Launch)

The following integrations are explicitly **deferred to a future phase** and are not required for the initial launch:

- **POS (Epicor) live data integration and webhooks** — active, event-driven synchronization of location data with the POS platform.
- **Shiekh.com e-commerce live data integration and webhooks** — active, event-driven synchronization of store/location data with the e-commerce platform.

When these phases are undertaken:

- Reuse the same authoritative records and API contract rather than creating separate store tables or export paths.
- Use per-integration service accounts with least-privilege scopes.
- Treat outbound writes to external systems as one-directional publishing from the authoritative directory; external systems must not become an alternate source of truth.
- Log sync attempts, successes, and failures so administrators can identify listings that are out of date.

### Google Business Profile (GBP) Synchronization — Active Launch Requirement

**Google Maps / Google Business Profile synchronization is in active scope for launch** (previously deferred). The authoritative directory publishes approved location data to the corresponding Google Business Profile listings so public Google Maps information stays consistent with the internal system of record.

Required capabilities:

**One-Way Translation Engine**

- Sync is strictly **one-directional: Directory → GBP**. Google is never treated as a source of truth, and inbound Google edits must not overwrite authoritative records.
- Translate internal records into the exact structures GBP expects, including the rigid **24-hour structured hours schema** produced from the 12-hour visual builder described in Section 7.
- Publish approved fields such as location name, address, phone, standard hours, special/holiday hours, temporary closures, and operational status.
- Map internal operational statuses to the closest supported Google state (for example, temporary closure and permanent closure), and skip or flag statuses that have no valid Google equivalent instead of guessing.

**Interactive Place ID Mapping Interface**

- Provide an administrative screen for associating each internal **Store Number / Location ID** with its **Google Place ID**.
- Support search/lookup and confirmation of candidate Google listings, with address and name shown for verification before linking.
- Clearly display unmapped locations, ambiguous matches, duplicate listings, and locations intentionally excluded from GBP sync.
- Store the Place ID association on the canonical location record so re-mapping is not required after ordinary edits.

**Outbound Sync Audit Log**

- Record every outbound sync attempt with location, fields sent, previous and new values, initiating user or automated job, timestamp, and result.
- Capture API errors, rejected updates, pending Google review states, and retry attempts.
- Provide filtering so administrators can identify locations that failed to sync or are out of date, and support manual re-sync of a single location or a filtered set.
- Do not store Google API credentials or secrets in the audit log; credentials use secure secret storage and support rotation and revocation like other integration credentials.

## 15. Source-of-Truth Architecture

Use one canonical record for each location and each person.

**Admin Updates → Master Directory Data → Website + PDF + CSV + API**

Do not maintain independent manually edited versions of store data for each output.

Preferred principle:

**One authoritative store record → Multiple applications consuming that record**

This application should eventually replace duplicated store tables in other Shiekh apps whenever practical.

### Launch vs. Future Phase Consumption

At initial launch, the authoritative directory serves the **website/application, PDF directory, and CSV export** directly, and exposes the **read-only API with service-token access** for other systems.

Live, active integrations with the POS (Epicor) and **Shiekh.com** e-commerce platforms — including webhooks and event-driven push — are **not required for the initial launch** and are classified as **Future Phase / Optional**. **Google Business Profile / Google Maps synchronization is in active launch scope** as an outbound publishing target (see Section 14).

Those systems are expected to **pull** from the read-only API using their own provisioned service credentials when they are ready. Deferring these integrations must not weaken the source-of-truth model: even in the future phase, the directory remains the single authoritative record, and downstream systems consume it rather than maintaining their own store masters.

### Live Database & Semantic IDs

The production backend is powered by **Cloud Firestore**.

- The architecture relies on **Semantic Document IDs** (for example `store_007`, `user_t.gallo`) rather than random auto-generated hashes, so records are human-readable, predictable, stable across systems, and safe to reference from other Shiekh applications.
- Semantic IDs act as the immutable internal Location ID / Person ID and must remain stable even when names, managers, phone numbers, or addresses change.
- Semantic ID formats must be validated and uniqueness enforced at write time to prevent collisions or malformed keys.
- The system enforces strict **server-side Role-Based Access Control (RBAC) security rules** in Firestore. Authorization is evaluated on the backend, not merely hidden in the interface.
- Security rules also enforce **schema integrity**: required fields, expected data types, permitted status values, and protected fields are validated server-side, so a client cannot write malformed or unauthorized data even with direct database access.
- Role and access-scope checks (Viewer, Editor, Directory Data Steward, System Administrator) are expressed in these rules so directory data cannot be modified outside the approved permission model.

## 16. Current Store Data / Migration Reference

Initial current store reference provided for this project:

**Shiek Shoes Store Directory 10.09.25.xlsx**

The workbook includes fields such as:

- District Manager
- Store Number
- Store Phone
- Location Name
- Address
- City
- State
- ZIP Code
- Store Manager
- Manager Phone
- Assistant Manager
- Additional Assistant Manager / 2nd / 3rd Key

### Import Rule

Do **not** assume every populated spreadsheet row represents a store. Supporting District Manager/contact rows may also exist.

A valid retail location should primarily be identified by a valid Store / Location Number and its associated location data.

### Migration Principle

Do not simply recreate the spreadsheet as a database table. Normalize it into:

1. **Location Records**
2. **People Records**
3. **Leadership Assignments**

Do not duplicate a District Manager as a new person for every store they oversee.

Do not invent missing fields such as Store Type, hours, Region, email, latitude/longitude, or operational status. Flag missing information for administrative review.

### Import Review

After import, provide an admin review for:

- Successfully imported locations
- Missing required information
- Possible duplicate people
- Missing manager contact information
- Locations without assigned managers
- Unrecognized / informational rows
- Records requiring location classification
- Other import warnings

Do not silently discard questionable records.

## 17. Existing Notion Directory Reference

An existing Notion database is already present and may contain useful historical/reference information:

[Shiekh Store Directory](https://app.notion.com/p/f08f81dfd44c40a991a9e9c862875b45?pvs=21)

It currently contains store directory fields plus additional marketing / display-related fields. Treat it as a **reference to reconcile**, not automatically as the authoritative source for this new application until it is compared against the current spreadsheet and approved directory requirements.

Do not create duplicate or conflicting store masters during the build.

## 18. Homepage & Navigation

### Homepage

Prioritize immediate lookup:

- Universal Search
- Find a Store
- Find a Person
- Browse Locations
- Browse Company Directory
- Request an Update
- Download Store Directory
- Active Location Alerts

Avoid unnecessary executive dashboards, KPIs, and decorative analytics.

### Primary Navigation

- Home
- Locations
- People
- Updates / Alerts
- Request an Update
- Store Directory
- Admin — authorized users only

Keep search readily accessible throughout the application.

## 19. Mobile UX Requirements

Mobile usability is a priority for stores and field leadership.

Optimize for:

- Fast search
- Compact directory results
- Tap-to-call
- Tap-to-email
- Today's hours
- Manager lookup
- Address lookup
- Operational status
- Simple filters

Avoid oversized cards, excessive whitespace, and unnecessary scrolling.

## 20. Design Direction

The application should be:

- Professional
- Clean
- Modern
- Mobile-first
- Fast
- Compact
- Easy to scan
- Designed for frequent operational use

Prioritize **speed of finding accurate information over decorative design**.

## 21. Key Questions the Application Must Answer

- What is Store 42's phone number?
- Where is the store located?
- What mall or shopping center is it in?
- What time does it close today?
- Who is the Store Manager?
- Who is the Assistant Manager?
- Who is the District Manager?
- What stores does this manager oversee?
- Is the location currently operating normally?
- Is it temporarily closed, remodeling, moving, opening, or closing?
- Who works in HR, Marketing, Sales, E-commerce, or another corporate department?
- How can an employee report inaccurate information?
- How can another internal application retrieve the current approved store list?

---

## 22. Data Governance, Integrity & Recovery Requirements

These controls are required because this application is intended to become the company’s authoritative store-information source.

### Record Integrity

- Store / Location Number must be unique among active locations unless an approved business rule explicitly allows otherwise.
- Every location must have one immutable internal Location ID.
- Every person must have one canonical Person ID; duplicate-person detection should be used during imports and manual creation.
- Relationships such as Store Manager and District Manager should reference canonical people records rather than copied names whenever practical.
- Required fields and field formats should be validated before authoritative records are saved.
- ZIP/postal codes must be stored as text, not numeric values, so leading zeros are never lost.

### Record Lifecycle

Operational status and record lifecycle are separate concepts.

- A temporarily closed or remodeling store remains an **Active** directory record.
- A permanently closed location should normally become **Inactive / Archived**, not be hard-deleted.
- Former employees and closed locations should remain available to authorized administrators for history and audit purposes.
- Normal administrative screens should use soft-delete / archive behavior rather than irreversible deletion.

### Verification & Data Freshness

For important location records, maintain:

- Last Updated Date
- Last Updated By
- Last Verified Date
- Verified By

Allow the Directory Data Steward to identify records that have not been verified within a configurable review period. This should support periodic data-quality review without automatically changing records.

### Backup, Recovery, Restore & Rollback

A **Backup & Recovery Strategy is required** because this application is intended to become the System of Record for Shiekh location-directory data. The exact implementation may depend on the selected database/hosting platform, but the ability to recover authoritative data is not optional.

- Maintain regular backups using the capabilities of the selected database/platform.
- Define and document how directory data, configuration, and other required application state can be recovered after accidental deletion, corruption, or system failure.
- Provide a documented restore process for the directory data.
- Where the selected platform supports it, provide appropriate administrative backup/restore controls without exposing unsafe operations to ordinary users.
- Preserve audit history across normal record edits.
- Where practical, allow an authorized administrator to restore a prior value from change history or perform a controlled rollback.
- A rollback must itself create a new audit entry; audit history must not be rewritten.

### Audit Visibility

Provide an administrator-facing audit view with filtering by:

- Date range
- User
- Location / person
- Change type
- Update request

Audit history should be exportable when needed for review or troubleshooting.

### Authentication Lifecycle

- Email/password accounts should use an invitation or secure password-setup/reset flow rather than administrators sharing permanent passwords.
- Email verification should be supported where practical.
- Disabled accounts must immediately lose access while historical audit entries remain intact.
- Authentication secrets, SMTP credentials, and API credentials must never be stored as ordinary readable directory fields.

### Import / Bulk Update Safety

For the initial spreadsheet migration and any future bulk import capability:

**Upload → Validate → Preview Changes → Resolve Errors/Duplicates → Confirm → Apply → Audit**

Never allow a bulk import to silently overwrite authoritative records. Show adds, updates, conflicts, invalid rows, and skipped rows before commit.

### Accessibility & Color Use

- Use accessible contrast for application status indicators and the printed directory.
- Never rely on color alone to communicate a District Manager, status, warning, or other meaning; always include a text label as well.
- The interactive application should target standard WCAG AA accessibility practices where supported by the platform.

### Environment Separation

Use separate application environments for **Development**, **Test/Staging**, and **Production** when supported by the selected platform and deployment architecture.

- Production directory data, user accounts, authentication configuration, SMTP credentials, API credentials, and other production secrets must not be casually reused in Development or Test/Staging.
- Each environment should have clearly separated configuration and secrets.
- Development and testing should use non-production or appropriately sanitized data whenever practical.
- Changes should be validated in Test/Staging before being promoted to Production when the platform supports a staged deployment workflow.
- The application should make the current environment clear to administrators so test and production actions are not easily confused.

### Build-Readiness Rule

The system should not be considered production-ready until authentication, permissions, request approval, audit logging, PDF generation, CSV export, SMTP delivery, API access control, backup/recovery, environment separation, and initial data migration have each been tested with representative Viewer, Directory Data Steward, and System Administrator accounts.

---

## Build Principle

**Fast lookup + accurate information + controlled administration + reusable company store data**

The long-term target is a reliable master directory that can serve employees directly and also supply current store information to other Shiekh applications without maintaining separate, outdated store lists.