import type { LocationImportIssue } from './locationImportPreview';

export interface LocationEditingExportDiagnostic {
  locationId: string;
  storeNumber: string;
  severity: 'warning' | 'error';
  code: 'round_trip_issue' | 'round_trip_change' | 'unrepresentable_fields';
  fields: string[];
  message: string;
  guidance: string;
  issues?: LocationImportIssue[];
}

export interface LocationEditingExportPart {
  partNumber: number;
  filename: string;
  recordCount: number;
  byteCount: number;
  csv?: string;
}

export interface LocationEditingExportManifest {
  schemaVersion: 'locations-v1';
  snapshotReadAt: string;
  totalRecords: number;
  lifecycleCounts: {
    Active: number;
    Draft: number;
    Retired: number;
    unrecognized: number;
  };
  roundTrip: {
    unchanged: number;
    updates: number;
    additions: number;
    blocked: number;
    warnings: number;
  };
  parts: LocationEditingExportPart[];
  diagnostics: LocationEditingExportDiagnostic[];
}

export interface PreparedLocationEditingExport extends Omit<LocationEditingExportManifest, 'parts'> {
  parts: Array<LocationEditingExportPart & { csv: string }>;
}