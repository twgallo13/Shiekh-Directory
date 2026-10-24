import type { Firestore, Transaction } from '@google-cloud/firestore';
import type { Account } from './authAuthority';
import { DirectoryWriteDenied } from './firestoreDirectory';

const allowed = (actor: Pick<Account, 'role' | 'status' | 'accessScope'>) => actor.role === 'System Administrator' && actor.status === 'Active' && actor.accessScope === 'Company-wide';
export function assertPersonTransitionActor(actor: Account) {
  if (!allowed(actor) || typeof actor.uid !== 'string' || !actor.uid.length || actor.uid.length > 128 || /[\u0000-\u001f]/.test(actor.uid)) throw new DirectoryWriteDenied('Current Company-wide Active administrator is required.');
}
/** Trusted server callers must authenticate Firebase first; recheck live Directory authority in their transaction. */
export async function readPersonTransitionAuthority(firestore: Firestore, transaction: Transaction, actor: Account) {
  assertPersonTransitionActor(actor);
  const accounts = await transaction.get(firestore.collection('users').where('firebaseUid', '==', actor.uid).select('role', 'status', 'accessScope').limit(2));
  if (accounts.size !== 1 || !allowed(accounts.docs[0].data() as Pick<Account, 'role' | 'status' | 'accessScope'>)) throw new DirectoryWriteDenied('Current administrator authority is required.');
}
