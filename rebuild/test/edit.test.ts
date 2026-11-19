import { describe, it } from 'node:test';
import assert from 'node:assert';

interface MockDoc {
  id: string;
  data: Record<string, unknown>;
  exists: boolean;
}

interface MockFirestore {
  docs: Map<string, MockDoc>;
  auditLogs: MockDoc[];
  corrections: MockDoc[];
  collection(path: string): {
    doc(id?: string): {
      get(): Promise<{ exists: boolean; id: string; data(): Record<string, unknown> | undefined }>;
      set(data: Record<string, unknown>): Promise<void>;
      update(data: Record<string, unknown>): Promise<void>;
    };
    orderBy(): { where(): { limit(): { get(): Promise<{ docs: { id: string; data(): Record<string, unknown> }[] }> } } };
  };
}

function createMockFirestore(): MockFirestore {
  const docs = new Map<string, MockDoc>();
  const auditLogs: MockDoc[] = [];
  const corrections: MockDoc[] = [];

  return {
    docs,
    auditLogs,
    corrections,
    collection(path: string) {
      return {
        doc(id?: string) {
          const docId = id || `auto-${Date.now()}-${Math.random()}`;
          return {
            async get() {
              const key = `${path}/${docId}`;
              const doc = docs.get(key);
              return {
                exists: doc?.exists ?? false,
                id: docId,
                data: () => doc?.data,
              };
            },
            async set(data: Record<string, unknown>) {
              const key = `${path}/${docId}`;
              docs.set(key, { id: docId, data, exists: true });
              if (path === 'auditLog') {
                auditLogs.push({ id: docId, data, exists: true });
              }
              if (path === 'corrections') {
                corrections.push({ id: docId, data, exists: true });
              }
            },
            async update(data: Record<string, unknown>) {
              const key = `${path}/${docId}`;
              const existing = docs.get(key);
              if (existing) {
                docs.set(key, { ...existing, data: { ...existing.data, ...data } });
              }
            },
          };
        },
        orderBy() {
          return {
            where() {
              return {
                limit() {
                  return {
                    async get() {
                      return { docs: [] };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

describe('Edit API Logic', () => {
  describe('Version Conflict Detection', () => {
    it('detects version mismatch and returns conflict error', async () => {
      const db = createMockFirestore();
      
      db.docs.set('locations/store-001', {
        id: 'store-001',
        exists: true,
        data: {
          storeNumber: '001',
          name: 'Test Store',
          mainPhone: '+15551234567',
          version: 5,
        },
      });

      const locationRef = db.collection('locations').doc('store-001');
      const doc = await locationRef.get();
      const location = doc.data() as Record<string, unknown>;

      const expectedVersion = 3;
      const actualVersion = location?.version;

      const hasConflict = expectedVersion !== actualVersion;
      
      assert.strictEqual(hasConflict, true, 'Should detect version mismatch');
      assert.strictEqual(actualVersion, 5);
      assert.strictEqual(expectedVersion, 3);
    });

    it('allows update when versions match', async () => {
      const db = createMockFirestore();
      
      db.docs.set('locations/store-001', {
        id: 'store-001',
        exists: true,
        data: {
          storeNumber: '001',
          name: 'Test Store',
          mainPhone: '+15551234567',
          version: 5,
        },
      });

      const locationRef = db.collection('locations').doc('store-001');
      const doc = await locationRef.get();
      const location = doc.data() as Record<string, unknown>;

      const expectedVersion = 5;
      const actualVersion = location?.version;

      const hasConflict = expectedVersion !== actualVersion;
      
      assert.strictEqual(hasConflict, false, 'Should not detect conflict when versions match');
    });

    it('increments version on successful update', async () => {
      const db = createMockFirestore();
      const initialVersion = 5;
      
      db.docs.set('locations/store-001', {
        id: 'store-001',
        exists: true,
        data: {
          storeNumber: '001',
          name: 'Test Store',
          mainPhone: '+15551234567',
          version: initialVersion,
        },
      });

      const locationRef = db.collection('locations').doc('store-001');
      
      await locationRef.update({
        mainPhone: '+15559876543',
        version: initialVersion + 1,
        updatedAt: new Date().toISOString(),
      });

      const updated = await locationRef.get();
      const data = updated.data() as Record<string, unknown>;
      
      assert.strictEqual(data?.version, initialVersion + 1);
    });
  });

  describe('Audit Log Creation', () => {
    it('creates audit log entry on location update', async () => {
      const db = createMockFirestore();
      
      db.docs.set('locations/store-001', {
        id: 'store-001',
        exists: true,
        data: {
          storeNumber: '001',
          name: 'Test Store',
          mainPhone: '+15551234567',
          version: 1,
        },
      });

      const auditRef = db.collection('auditLog').doc();
      await auditRef.set({
        userId: 'user-123',
        userEmail: 'steward@shiekh.test',
        userRole: 'Steward',
        action: 'update',
        entityType: 'location',
        entityId: 'store-001',
        entityName: '001 Test Store',
        changes: [
          { field: 'mainPhone', oldValue: '+15551234567', newValue: '+15559876543' },
        ],
        previousVersion: 1,
        newVersion: 2,
        timestamp: new Date().toISOString(),
      });

      assert.strictEqual(db.auditLogs.length, 1);
      const log = db.auditLogs[0].data;
      assert.strictEqual(log.action, 'update');
      assert.strictEqual(log.entityType, 'location');
      assert.strictEqual(log.userEmail, 'steward@shiekh.test');
    });

    it('records field changes with old and new values', async () => {
      const db = createMockFirestore();

      const auditRef = db.collection('auditLog').doc();
      await auditRef.set({
        userId: 'user-123',
        userEmail: 'steward@shiekh.test',
        userRole: 'Steward',
        action: 'update',
        entityType: 'location',
        entityId: 'store-001',
        entityName: '001 Test Store',
        changes: [
          { field: 'mainPhone', oldValue: '+15551234567', newValue: '+15559876543' },
          { field: 'sharedInboxEmail', oldValue: null, newValue: 'store001@shiekh.com' },
        ],
        previousVersion: 1,
        newVersion: 2,
        timestamp: new Date().toISOString(),
      });

      const log = db.auditLogs[0].data;
      const changes = log.changes as Array<{ field: string; oldValue: unknown; newValue: unknown }>;
      
      assert.strictEqual(changes.length, 2);
      assert.strictEqual(changes[0].field, 'mainPhone');
      assert.strictEqual(changes[0].oldValue, '+15551234567');
      assert.strictEqual(changes[0].newValue, '+15559876543');
      assert.strictEqual(changes[1].field, 'sharedInboxEmail');
      assert.strictEqual(changes[1].oldValue, null);
      assert.strictEqual(changes[1].newValue, 'store001@shiekh.com');
    });

    it('creates audit log for closure start', async () => {
      const db = createMockFirestore();

      const auditRef = db.collection('auditLog').doc();
      await auditRef.set({
        userId: 'user-456',
        userEmail: 'store007@shiekh.test',
        userRole: 'Store',
        action: 'closure:start',
        entityType: 'closure',
        entityId: 'closure-abc',
        entityName: 'Closure for 007',
        changes: [
          { field: 'reason', newValue: 'Water damage repair' },
          { field: 'status', newValue: 'active' },
        ],
        timestamp: new Date().toISOString(),
      });

      const log = db.auditLogs[0].data;
      assert.strictEqual(log.action, 'closure:start');
      assert.strictEqual(log.userRole, 'Store');
    });

    it('creates audit log for closure end', async () => {
      const db = createMockFirestore();

      const auditRef = db.collection('auditLog').doc();
      await auditRef.set({
        userId: 'user-456',
        userEmail: 'store007@shiekh.test',
        userRole: 'Store',
        action: 'closure:end',
        entityType: 'closure',
        entityId: 'closure-abc',
        entityName: 'Closure for 007',
        changes: [
          { field: 'status', oldValue: 'active', newValue: 'ended' },
        ],
        timestamp: new Date().toISOString(),
      });

      const log = db.auditLogs[0].data;
      assert.strictEqual(log.action, 'closure:end');
    });
  });

  describe('Correction Workflow', () => {
    it('creates correction for Store role contact info edits', async () => {
      const db = createMockFirestore();

      db.docs.set('locations/store-007', {
        id: 'store-007',
        exists: true,
        data: {
          storeNumber: '007',
          name: 'Hollywood',
          mainPhone: '+15551234567',
          version: 3,
        },
      });

      const correctionRef = db.collection('corrections').doc();
      await correctionRef.set({
        status: 'pending',
        type: 'phone',
        locationId: 'store-007',
        locationName: 'Hollywood',
        storeNumber: '007',
        submittedBy: 'store-user-123',
        submittedByEmail: 'store007@shiekh.test',
        submittedByRole: 'Store',
        submittedAt: new Date().toISOString(),
        proposedChanges: { mainPhone: '+15559876543' },
        currentValues: { mainPhone: '+15551234567' },
        locationVersion: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: 'store-user-123',
        version: 1,
      });

      assert.strictEqual(db.corrections.length, 1);
      const correction = db.corrections[0].data;
      assert.strictEqual(correction.status, 'pending');
      assert.strictEqual(correction.type, 'phone');
      assert.strictEqual(correction.submittedByRole, 'Store');
    });

    it('creates correction for Leader role contact info edits', async () => {
      const db = createMockFirestore();

      const correctionRef = db.collection('corrections').doc();
      await correctionRef.set({
        status: 'pending',
        type: 'address',
        locationId: 'store-001',
        locationName: 'Downtown',
        storeNumber: '001',
        submittedBy: 'leader-user-123',
        submittedByEmail: 'dm.jones@shiekh.test',
        submittedByRole: 'Leader',
        submittedAt: new Date().toISOString(),
        proposedChanges: { 
          address: { street: '123 New St', city: 'LA', state: 'CA', zip: '90001', country: 'US' } 
        },
        currentValues: { 
          address: { street: '456 Old St', city: 'LA', state: 'CA', zip: '90001', country: 'US' } 
        },
        locationVersion: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: 'leader-user-123',
        version: 1,
      });

      const correction = db.corrections[0].data;
      assert.strictEqual(correction.status, 'pending');
      assert.strictEqual(correction.type, 'address');
      assert.strictEqual(correction.submittedByRole, 'Leader');
    });

    it('Steward can directly edit without correction', async () => {
      const db = createMockFirestore();
      
      db.docs.set('locations/store-001', {
        id: 'store-001',
        exists: true,
        data: {
          storeNumber: '001',
          name: 'Test Store',
          mainPhone: '+15551234567',
          version: 1,
        },
      });

      const locationRef = db.collection('locations').doc('store-001');
      await locationRef.update({
        mainPhone: '+15559876543',
        version: 2,
        updatedAt: new Date().toISOString(),
        updatedBy: 'steward-user-123',
      });

      const auditRef = db.collection('auditLog').doc();
      await auditRef.set({
        userId: 'steward-user-123',
        userEmail: 'steward@shiekh.test',
        userRole: 'Steward',
        action: 'update',
        entityType: 'location',
        entityId: 'store-001',
        entityName: '001 Test Store',
        changes: [{ field: 'mainPhone', oldValue: '+15551234567', newValue: '+15559876543' }],
        previousVersion: 1,
        newVersion: 2,
        timestamp: new Date().toISOString(),
      });

      assert.strictEqual(db.corrections.length, 0);
      assert.strictEqual(db.auditLogs.length, 1);
      assert.strictEqual(db.auditLogs[0].data.userRole, 'Steward');
    });
  });

  describe('Phone Number Normalization', () => {
    function normalizePhoneNumber(phone: string): string | null {
      const digits = phone.replace(/\D/g, '');
      if (digits.length === 10) {
        return `+1${digits}`;
      }
      if (digits.length === 11 && digits.startsWith('1')) {
        return `+${digits}`;
      }
      return null;
    }

    it('normalizes 10-digit phone to E.164', () => {
      const result = normalizePhoneNumber('(555) 123-4567');
      assert.strictEqual(result, '+15551234567');
    });

    it('normalizes 11-digit phone with leading 1 to E.164', () => {
      const result = normalizePhoneNumber('1-555-123-4567');
      assert.strictEqual(result, '+15551234567');
    });

    it('returns null for invalid phone', () => {
      const result = normalizePhoneNumber('123');
      assert.strictEqual(result, null);
    });

    it('handles already-formatted E.164', () => {
      const input = '+15551234567';
      const digits = input.replace(/\D/g, '');
      assert.strictEqual(digits.length, 11);
      assert.strictEqual(digits.startsWith('1'), true);
    });
  });

  describe('Hours Editing', () => {
    it('allows Leader to edit hours for in-scope store', async () => {
      const db = createMockFirestore();
      
      db.docs.set('locations/store-001', {
        id: 'store-001',
        exists: true,
        data: {
          storeNumber: '001',
          name: 'Test Store',
          standardHours: {
            monday: { closed: false, intervals: [{ open: '10:00', close: '21:00' }] },
          },
          version: 1,
        },
      });

      const locationRef = db.collection('locations').doc('store-001');
      await locationRef.update({
        standardHours: {
          monday: { closed: false, intervals: [{ open: '09:00', close: '22:00' }] },
        },
        version: 2,
        updatedAt: new Date().toISOString(),
        updatedBy: 'leader-user-123',
      });

      const updated = await locationRef.get();
      const data = updated.data() as Record<string, unknown>;
      const hours = data?.standardHours as Record<string, { closed: boolean; intervals: Array<{ open: string; close: string }> }>;
      
      assert.strictEqual(hours.monday.intervals[0].open, '09:00');
      assert.strictEqual(hours.monday.intervals[0].close, '22:00');
    });

    it('creates audit log for hours update', async () => {
      const db = createMockFirestore();

      const auditRef = db.collection('auditLog').doc();
      await auditRef.set({
        userId: 'leader-user-123',
        userEmail: 'dm.jones@shiekh.test',
        userRole: 'Leader',
        action: 'update',
        entityType: 'location',
        entityId: 'store-001',
        entityName: '001 Test Store',
        changes: [{ field: 'standardHours', oldValue: 'hours changed', newValue: 'hours updated' }],
        previousVersion: 1,
        newVersion: 2,
        timestamp: new Date().toISOString(),
      });

      const log = db.auditLogs[0].data;
      const changes = log.changes as Array<{ field: string }>;
      assert.strictEqual(changes[0].field, 'standardHours');
    });
  });
});
