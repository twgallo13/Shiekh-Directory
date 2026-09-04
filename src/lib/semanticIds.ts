import { LocationRecord, PersonRecord, LocationType, OperationalStatus } from '../types';

/**
 * Returns a clean, semantic Firestore Document ID for a Location record.
 * Examples:
 *  - Store #7 -> "store_007"
 *  - Store #42 -> "store_042"
 *  - Store #115 -> "store_115"
 *  - Corporate HQ ("HQ-01") -> "corp_hq"
 *  - Distribution Center ("DC-01") -> "dist_dc01"
 */
export function getSemanticLocationDocId(loc: { storeNumber: string; id?: string }): string {
  const sn = (loc.storeNumber || '').trim().toUpperCase();
  if (sn === 'HQ-01' || sn === 'HQ' || sn.includes('HQ')) {
    return 'corp_hq';
  }
  if (sn === 'DC-01' || sn === 'DC' || sn.includes('DC')) {
    return 'dist_dc01';
  }
  // Strip non-digits if mostly numeric
  const numericMatch = sn.match(/\d+/);
  if (numericMatch) {
    const num = parseInt(numericMatch[0], 10);
    return `store_${num.toString().padStart(3, '0')}`;
  }
  // Fallback sanitized store identifier
  const sanitized = sn.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `store_${sanitized || 'unknown'}`;
}

/**
 * Returns a standardized Firestore Document ID for a User account based on email.
 * Example: "theo@shiekhshoes.org" -> "user_theo"
 *          "m.vargas@shiekhshoes.com" -> "user_m.vargas"
 */
export function getSemanticUserDocId(user: { email: string; id?: string }): string {
  if (user.email && user.email.includes('@')) {
    const prefix = user.email.toLowerCase().split('@')[0].replace(/[^a-z0-9_.-]/g, '_');
    return `user_${prefix}`;
  }
  return user.id ? `user_${user.id.replace('usr-', '')}` : `user_${Date.now().toString(36)}`;
}

/**
 * Returns a standardized Firestore Document ID for a Person directory record.
 * Example: "r.calderon@shiekhshoes.com" -> "person_r.calderon"
 *          "Deep Singh" -> "person_deep_singh"
 */
export function getSemanticPersonDocId(person: { workEmail?: string; name: string; id?: string }): string {
  if (person.workEmail && person.workEmail.includes('@')) {
    const prefix = person.workEmail.toLowerCase().split('@')[0].replace(/[^a-z0-9_.-]/g, '_');
    return `person_${prefix}`;
  }
  const namePrefix = person.name.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  return `person_${namePrefix || 'unknown'}`;
}

/**
 * Returns a semantic Firestore Document ID for an Update Request.
 * Example: Request for Store 007 -> "req_store_007_k8j3"
 */
export function getSemanticRequestDocId(req: { id: string; targetStoreNumber?: string; targetType?: string }): string {
  const storePrefix = req.targetStoreNumber 
    ? getSemanticLocationDocId({ storeNumber: req.targetStoreNumber })
    : req.targetType?.toLowerCase() || 'req';
  const cleanId = req.id.replace(/^req-/, '');
  return `${storePrefix}_${cleanId}`;
}

/**
 * Human-readable type label for Location classification in GCP console & dashboards
 */
export function getLocationTypeLabel(type: LocationType): string {
  switch (type) {
    case 'Enclosed Mall':
      return 'Retail Store (Enclosed Mall)';
    case 'Strip Center / Shopping Center':
      return 'Retail Store (Strip Center)';
    case 'Street / Standalone Location':
      return 'Retail Store (Street / Standalone)';
    case 'Corporate Office':
      return 'Corporate Headquarters';
    case 'Warehouse / Distribution Center':
      return 'Distribution Logistics Center';
    default:
      return 'Retail Store / Company Location';
  }
}

/**
 * Human-readable status label for Location operational state
 */
export function getLocationStatusLabel(status: OperationalStatus): string {
  if (status.includes(' — ')) {
    return status.split(' — ')[0];
  }
  return status;
}

/**
 * Enriches a LocationRecord with explicit type_label and status_label for GCP Console readability
 */
export function enrichLocationWithLabels(loc: LocationRecord): LocationRecord {
  return {
    ...loc,
    type_label: loc.type_label || getLocationTypeLabel(loc.type),
    status_label: loc.status_label || getLocationStatusLabel(loc.operationalStatus)
  };
}

/**
 * Enriches a PersonRecord with explicit type_label and status_label for GCP Console readability
 */
export function enrichPersonWithLabels(person: PersonRecord): PersonRecord {
  return {
    ...person,
    type_label: person.type_label || `${person.jobTitle} (${person.department})`,
    status_label: person.status_label || (person.activeStatus ? 'Active Employee' : 'Inactive / Departed')
  };
}

/**
 * Structured GCP metric latency logger for Cloud Run Observability
 */
export function logGcpCloudMetric(operation: string, latencyMs: number, metadata?: Record<string, any>) {
  const payload = {
    timestamp: new Date().toISOString(),
    service: 'shiekh-location-directory',
    metric_type: 'custom.googleapis.com/firestore/latency',
    operation,
    latency_ms: latencyMs,
    status: latencyMs < 500 ? 'OPTIMAL' : latencyMs < 1500 ? 'NORMAL' : 'DEGRADED',
    ...metadata
  };
  // Structured logging compatible with Google Cloud Logging / Cloud Run stdout ingestion
  console.info(`[GCP Cloud Run Metric] ${JSON.stringify(payload)}`);
}
