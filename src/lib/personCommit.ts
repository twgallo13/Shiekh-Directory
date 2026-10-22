import type { DirectoryCommitResult, DirectoryWrite } from './directoryClient';

/** Confirm the whole atomic profile/copy response, never an empty or partial success envelope. */
export function validPersonCommit(result: DirectoryCommitResult, writes: DirectoryWrite[]) {
  return Array.isArray(result?.records) && result.records.length === writes.length && writes.every(write => {
    const matches = result.records.filter(record => record.collection === write.collection && record.id === write.id && record.operation === write.operation);
    if (matches.length !== 1) return false;
    const record = matches[0];
    if (write.operation === 'delete') return record.data === null;
    return record.data && typeof record.data === 'object' && !Array.isArray(record.data) && record.data.id === write.id
      && Number.isInteger(record.data.version) && record.data.version === (write.expectedVersion ?? 0) + 1;
  });
}
