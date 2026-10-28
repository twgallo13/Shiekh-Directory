/** Private Directory administrator workflow, separate from public consumer APIs. */
export type OrganizationUnitType = 'district' | 'region';
export interface OrganizationLeadershipIntent {
  operationId: string;
  units: {
    unitType: OrganizationUnitType; unitId: string; expectedVersion: number; expectedLeadershipVersion: number;
    activateLegacy: boolean; memberPersonIds: string[]; primaryPersonId: string | null; reason: string;
  }[];
}
export interface OrganizationManagerSummary {
  personId: string; fullName: string; isPrimary: boolean; eligible: boolean; issues: string[];
}
export interface OrganizationUnitSummary {
  unitType: OrganizationUnitType; id: string; name: string; status: string; regionId: string | null;
  version: number | null; leadershipVersion: number | null;
  ownership: 'legacy' | 'managed' | 'unsupported';
  assignmentState: 'unmanaged' | 'vacant' | 'assigned' | 'invalid';
  primaryPersonId: string | null; members: OrganizationManagerSummary[]; storeCount: number; issues: string[];
}
export interface OrganizationCatalog {
  schemaVersion: 1; evaluatedAt: string; complete: true;
  issues: string[];
  units: OrganizationUnitSummary[];
  people: { id: string; fullName: string; eligibleUnitTypes: OrganizationUnitType[] }[];
}
export interface OrganizationCapabilities { schemaVersion: 1; catalogEnabled: boolean; newCommandsEnabled: boolean; recoveryEnabled: boolean }
export interface OrganizationReviewUnit {
  unitType: OrganizationUnitType; unitId: string; name: string; reason: string; activating: boolean;
  beforePrimaryPersonId: string | null; primaryPersonId: string | null; added: string[]; ended: string[];
  members: { personId: string; fullName: string; isPrimary: boolean; eligibilityIssue?: string }[]; compatibilityStores: number;
}
export type OrganizationOperationOutcome =
  | { schemaVersion: 1; operationId: string; state: 'missing' }
  | { schemaVersion: 1; operationId: string; state: 'prepared' | 'cancelled'; updatedAt: string }
  | { schemaVersion: 1; operationId: string; state: 'committed'; updatedAt: string; auditId: string; changedRecords: number };
export type OrganizationPreparation = OrganizationOperationOutcome & { reviewHash?: string; expiresAt?: string; review?: OrganizationReviewUnit[] };
export interface OrganizationOperationList {
  schemaVersion: 1; complete: true;
  operations: { operationId: string; state: 'prepared'; updatedAt: string; expiresAt: string }[];
}
