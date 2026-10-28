import type { LocationInboxAcknowledgment } from './locationInboxEmail';
import type { OrganizationCapabilities } from './organizationLeadershipContract';
/** Private Company-wide Location writer protocol, independent of public consumer API grants. */
export interface LocationCreationCommand {
  write: { collection: 'locations'; id: string; operation: 'set'; expectedVersion: null; data: Record<string, unknown>;
    expectedCustomMetadata?: Record<string, unknown>; locationInboxAcknowledgment?: LocationInboxAcknowledgment };
}
export interface LocationCreationCapabilities extends OrganizationCapabilities { legacyCreationEnabled: boolean }
export type LocationCreationOutcome =
  | { schemaVersion: 1; locationId: string; state: 'missing' }
  | { schemaVersion: 1; locationId: string; state: 'prepared'; updatedAt: string; expiresAt: string }
  | { schemaVersion: 1; locationId: string; state: 'cancelled'; updatedAt: string }
  | { schemaVersion: 1; locationId: string; state: 'committed'; updatedAt: string; auditId: string; createdVersion: 1 };
export interface LocationCreationList { schemaVersion: 1; complete: true; operations: Extract<LocationCreationOutcome, { state: 'prepared' }>[] }
