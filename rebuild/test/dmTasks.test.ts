/**
 * Tests for DM Tasks (fix 12)
 * - API routes
 * - Backup collection list includes dmTasks
 * - Audit entityType 'dm-task'
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('DM Tasks', () => {
  describe('API Routes', () => {
    it('dmTasks router exists and is registered', () => {
      const dmTasksRouter = readFileSync(
        join(__dirname, '../server/routes/dmTasks.ts'),
        'utf-8'
      );
      
      assert.ok(
        dmTasksRouter.includes('router.get(\'/\''),
        'dmTasks router should have GET / endpoint'
      );
      assert.ok(
        dmTasksRouter.includes('router.get(\'/:id\''),
        'dmTasks router should have GET /:id endpoint'
      );
      assert.ok(
        dmTasksRouter.includes('router.patch(\'/:id/status\''),
        'dmTasks router should have PATCH /:id/status endpoint'
      );
      
      const serverIndex = readFileSync(
        join(__dirname, '../server/index.ts'),
        'utf-8'
      );
      
      assert.ok(
        serverIndex.includes('createDMTasksRouter'),
        'server index should import createDMTasksRouter'
      );
      assert.ok(
        serverIndex.includes('/api/app/dm-tasks'),
        'server index should register dm-tasks route'
      );
    });
  });

  describe('Backup Collections', () => {
    it('backup routes include dmTasks collection', () => {
      const backupRoute = readFileSync(
        join(__dirname, '../server/routes/backup.ts'),
        'utf-8'
      );
      
      assert.ok(
        backupRoute.includes("'dmTasks'"),
        'backup route defaultCollections should include dmTasks'
      );
    });

    it('scheduled backup includes dmTasks collection', () => {
      const scheduledBackup = readFileSync(
        join(__dirname, '../server/scheduledBackup.ts'),
        'utf-8'
      );
      
      assert.ok(
        scheduledBackup.includes("'dmTasks'"),
        'DIRECTORY_COLLECTIONS should include dmTasks'
      );
    });
  });

  describe('Audit Logging', () => {
    it('dmTasks router uses entityType dm-task', () => {
      const dmTasksRouter = readFileSync(
        join(__dirname, '../server/routes/dmTasks.ts'),
        'utf-8'
      );
      
      assert.ok(
        dmTasksRouter.includes("entityType: 'dm-task'"),
        'dmTasks router should log audits with entityType dm-task'
      );
    });
  });

  describe('Firestore Indexes', () => {
    it('dmTasks has necessary composite indexes', () => {
      const indexes = JSON.parse(readFileSync(
        join(__dirname, '../firestore.indexes.json'),
        'utf-8'
      ));
      
      const dmTasksIndexes = indexes.indexes.filter(
        (idx: { collectionGroup: string }) => idx.collectionGroup === 'dmTasks'
      );
      
      assert.ok(
        dmTasksIndexes.length >= 2,
        'dmTasks should have at least 2 composite indexes'
      );
      
      const hasStatusCreatedAtIndex = dmTasksIndexes.some(
        (idx: { fields: Array<{ fieldPath: string }> }) =>
          idx.fields.some(f => f.fieldPath === 'status') &&
          idx.fields.some(f => f.fieldPath === 'createdAt')
      );
      assert.ok(
        hasStatusCreatedAtIndex,
        'dmTasks should have index on status + createdAt'
      );
      
      const hasDistrictIdCreatedAtIndex = dmTasksIndexes.some(
        (idx: { fields: Array<{ fieldPath: string }> }) =>
          idx.fields.some(f => f.fieldPath === 'districtId') &&
          idx.fields.some(f => f.fieldPath === 'createdAt')
      );
      assert.ok(
        hasDistrictIdCreatedAtIndex,
        'dmTasks should have index on districtId + createdAt'
      );
    });
  });

  describe('Types', () => {
    it('DMTask type exists in types', () => {
      const types = readFileSync(
        join(__dirname, '../src/types/index.ts'),
        'utf-8'
      );
      
      assert.ok(
        types.includes('interface DMTask'),
        'DMTask interface should be defined in types'
      );
      assert.ok(
        types.includes("export type DMTaskType"),
        'DMTaskType should be exported'
      );
      assert.ok(
        types.includes("export type DMTaskStatus"),
        'DMTaskStatus should be exported'
      );
    });
  });
});
