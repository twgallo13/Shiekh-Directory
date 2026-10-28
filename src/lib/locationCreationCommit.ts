import type { DirectoryCommitResult, DirectoryWrite } from './directoryClient';
import { validPersonCommit } from './personCommit';
/** Reuse atomic identity/version confirmation, then check the created Location projection before
 * applying it to the Directory or closing either create form. Not an unknown-outcome recovery API. */
export function validLocationCreationCommit(result: DirectoryCommitResult, write: DirectoryWrite) {
  if (write.collection !== 'locations' || write.operation !== 'set' || write.expectedVersion !== null || !write.data || !validPersonCommit(result, [write])) return false;
  const saved = result.records[0].data!, proposed = write.data;
  return typeof saved.name === 'string' && !!saved.name.trim() && typeof saved.storeNumber === 'string' && saved.storeNumber === String(proposed.storeNumber).trim()
    && saved.type === proposed.type && ['Active','Retired','Draft'].includes(saved.recordStatus as string)
    && ['regionId','districtId','districtManagerId','regionalManagerId'].every(field => (saved[field] || null) === (proposed[field] || null));
}
