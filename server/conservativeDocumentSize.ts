/** Same recursive upper-bound algorithm as the existing District audit guard.
 * Kept SDK-free for the unused planner; parity tests pin that established policy.
 * It is an application estimate, not an SDK/platform size guarantee.
 */
export function conservativeDocumentBytes(value: unknown): number {
  if (typeof value === 'string') return Buffer.byteLength(value, 'utf8') + 32;
  if (!value || typeof value !== 'object') return 32;
  if (Array.isArray(value)) return 32 + value.reduce((size, item) => size + 32 + conservativeDocumentBytes(item), 0);
  return 32 + Object.entries(value).reduce((size, [key, item]) => size + Buffer.byteLength(key, 'utf8') + 32 + conservativeDocumentBytes(item), 0);
}
