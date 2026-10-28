import type { OrganizationCapabilities, OrganizationCatalog, OrganizationOperationList, OrganizationOperationOutcome } from './organizationLeadershipContract';

/** Private administrator move workflow. This does not change any public consumer API contract. */
export interface OrganizationMoveIntent { schemaVersion: 1; operationId: string; kind: 'store' | 'district'; id: string; expectedVersion: number; targetId: string; expectedTargetVersion: number; reason: string }
export interface OrganizationMoveHierarchy {
  districtId: string; districtName: string; regionId: string; regionName: string;
  districtManager: { id: string | null; name: string }; regionalManager: { id: string | null; name: string };
}
export interface OrganizationMoveReview {
  kind: 'store' | 'district'; id: string; name: string; reason: string;
  before: OrganizationMoveHierarchy; after: OrganizationMoveHierarchy;
  stores: { id: string; storeNumber: string; name: string; recordStatus: string }[];
  excludedNonRetail: number; businessDocuments: number;
}
export type OrganizationMoveCapabilities = OrganizationCapabilities;
export type OrganizationMoveCatalog = OrganizationCatalog;
export type OrganizationMoveOutcome = OrganizationOperationOutcome;
export type OrganizationMoveOperationList = OrganizationOperationList;
export type OrganizationMovePreparation = OrganizationMoveOutcome & { reviewHash?: string; expiresAt?: string; review?: OrganizationMoveReview };
