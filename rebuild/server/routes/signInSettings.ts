import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type { AuthUser, AuditLogEntry } from '../../src/types';
import { getSignInRestriction, type AllowListEntry } from '../config/auth';

async function logAudit(
  db: Firestore,
  entry: Omit<AuditLogEntry, 'id' | 'timestamp'>
): Promise<void> {
  const auditRef = db.collection('auditLog').doc();
  await auditRef.set({
    ...entry,
    id: auditRef.id,
    timestamp: new Date().toISOString(),
  });
}

export function createSignInSettingsRouter(db: Firestore): Router {
  const router = Router();

  const requireAdmin = (_req: Request, res: Response, next: () => void) => {
    const authUser = res.locals.authUser as AuthUser | undefined;
    if (!authUser || authUser.role !== 'Admin') {
      return res.status(403).json({
        error: { code: 'access_denied', message: 'Admin access required', requestId: res.locals.requestId },
      });
    }
    next();
  };

  router.get('/restriction', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const restriction = await getSignInRestriction(db);
      res.json({ data: restriction });
    } catch (error) {
      console.error('Get sign-in restriction error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to get sign-in restriction', requestId: res.locals.requestId },
      });
    }
  });

  router.patch('/restriction', requireAdmin, async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { restrictedUntil, enabled } = req.body;
      
      const now = new Date().toISOString();
      const updates: Record<string, unknown> = {
        updatedAt: now,
        updatedBy: authUser.uid,
      };
      
      if (restrictedUntil !== undefined) {
        updates.restrictedUntil = restrictedUntil;
      }
      if (enabled !== undefined) {
        updates.enabled = enabled;
      }
      
      await db.collection('settings').doc('signIn').set(updates, { merge: true });
      
      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'update',
        entityType: 'settings',
        entityId: 'signIn',
        entityName: 'Sign-in restriction settings',
        changes: [
          ...(restrictedUntil !== undefined ? [{ field: 'restrictedUntil', newValue: restrictedUntil || 'cleared' }] : []),
          ...(enabled !== undefined ? [{ field: 'enabled', newValue: String(enabled) }] : []),
        ],
      });
      
      const updated = await getSignInRestriction(db);
      res.json({ success: true, data: updated });
    } catch (error) {
      console.error('Update sign-in restriction error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to update sign-in restriction', requestId: res.locals.requestId },
      });
    }
  });

  router.get('/allow-list', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const snap = await db.collection('signInAllowList').orderBy('addedAt', 'desc').get();
      const entries = snap.docs.map(doc => ({
        email: doc.id,
        ...doc.data(),
      })) as AllowListEntry[];
      
      res.json({ data: entries });
    } catch (error) {
      console.error('Get allow-list error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to get allow-list', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/allow-list', requireAdmin, async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { email, notes } = req.body;
      
      if (!email || typeof email !== 'string') {
        return res.status(400).json({
          error: { code: 'invalid_input', message: 'Email is required', requestId: res.locals.requestId },
        });
      }
      
      const normalizedEmail = email.toLowerCase().trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return res.status(400).json({
          error: { code: 'invalid_email', message: 'Invalid email format', requestId: res.locals.requestId },
        });
      }
      
      const existing = await db.collection('signInAllowList').doc(normalizedEmail).get();
      if (existing.exists) {
        return res.status(409).json({
          error: { code: 'already_exists', message: 'Email is already on the allow-list', requestId: res.locals.requestId },
        });
      }
      
      const entry: AllowListEntry = {
        email: normalizedEmail,
        addedBy: authUser.uid,
        addedByEmail: authUser.email,
        addedAt: new Date().toISOString(),
        ...(notes ? { notes } : {}),
      };
      
      await db.collection('signInAllowList').doc(normalizedEmail).set(entry);
      
      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'create',
        entityType: 'settings',
        entityId: `allow-list:${normalizedEmail}`,
        entityName: `Sign-in allow-list entry: ${normalizedEmail}`,
        changes: [
          { field: 'email', newValue: normalizedEmail },
          ...(notes ? [{ field: 'notes', newValue: notes }] : []),
        ],
      });
      
      res.status(201).json({ success: true, data: entry });
    } catch (error) {
      console.error('Add to allow-list error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to add to allow-list', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/allow-list/bulk', requireAdmin, async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { emails } = req.body;
      
      if (!Array.isArray(emails) || emails.length === 0) {
        return res.status(400).json({
          error: { code: 'invalid_input', message: 'emails array is required', requestId: res.locals.requestId },
        });
      }
      
      if (emails.length > 100) {
        return res.status(400).json({
          error: { code: 'too_many', message: 'Maximum 100 emails per batch', requestId: res.locals.requestId },
        });
      }
      
      const now = new Date().toISOString();
      const added: string[] = [];
      const skipped: string[] = [];
      const invalid: string[] = [];
      
      const batch = db.batch();
      
      for (const email of emails) {
        if (typeof email !== 'string') {
          invalid.push(String(email));
          continue;
        }
        
        const normalizedEmail = email.toLowerCase().trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
          invalid.push(email);
          continue;
        }
        
        const existing = await db.collection('signInAllowList').doc(normalizedEmail).get();
        if (existing.exists) {
          skipped.push(normalizedEmail);
          continue;
        }
        
        const entry: AllowListEntry = {
          email: normalizedEmail,
          addedBy: authUser.uid,
          addedByEmail: authUser.email,
          addedAt: now,
        };
        
        batch.set(db.collection('signInAllowList').doc(normalizedEmail), entry);
        added.push(normalizedEmail);
      }
      
      if (added.length > 0) {
        await batch.commit();
        
        await logAudit(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'create',
          entityType: 'settings',
          entityId: `allow-list:bulk-${now}`,
          entityName: `Bulk add to sign-in allow-list (${added.length} entries)`,
          changes: [
            { field: 'added', newValue: added.join(', ') },
          ],
        });
      }
      
      res.json({
        success: true,
        added: added.length,
        skipped: skipped.length,
        invalid: invalid.length,
        details: { added, skipped, invalid },
      });
    } catch (error) {
      console.error('Bulk add to allow-list error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to bulk add to allow-list', requestId: res.locals.requestId },
      });
    }
  });

  router.delete('/allow-list/:email', requireAdmin, async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const email = decodeURIComponent(req.params.email).toLowerCase();
      
      const existing = await db.collection('signInAllowList').doc(email).get();
      if (!existing.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Email not found on allow-list', requestId: res.locals.requestId },
        });
      }
      
      await db.collection('signInAllowList').doc(email).delete();
      
      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'delete',
        entityType: 'settings',
        entityId: `allow-list:${email}`,
        entityName: `Sign-in allow-list entry: ${email}`,
        changes: [
          { field: 'email', newValue: `removed: ${email}` },
        ],
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error('Remove from allow-list error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to remove from allow-list', requestId: res.locals.requestId },
      });
    }
  });

  return router;
}
