import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('DM Tasks Route', () => {
  it('should support locationId query parameter', () => {
    const filePath = join(__dirname, '..', 'server', 'routes', 'dmTasks.ts');
    const content = readFileSync(filePath, 'utf-8');
    
    assert.ok(content.includes('locationId'), 'dmTasks route should accept locationId parameter');
    assert.ok(
      content.includes("locationId } = req.query") || content.includes("req.query"),
      'dmTasks route should read locationId from query'
    );
  });

  it('should have complete and cancel actions', () => {
    const filePath = join(__dirname, '..', 'server', 'routes', 'dmTasks.ts');
    const content = readFileSync(filePath, 'utf-8');
    
    assert.ok(content.includes("'completed'"), 'dmTasks route should support completed status');
    assert.ok(content.includes("'cancelled'"), 'dmTasks route should support cancelled status');
  });

  it('should deny access to Viewer role', () => {
    const filePath = join(__dirname, '..', 'server', 'routes', 'dmTasks.ts');
    const content = readFileSync(filePath, 'utf-8');
    
    assert.ok(
      content.includes("!isAdminOrSteward && !isLeader"),
      'dmTasks route should check for Admin, Steward, or Leader role'
    );
    assert.ok(
      content.includes("status(403)"),
      'dmTasks route should return 403 for unauthorized roles'
    );
  });

  it('should support locationId with status filter', () => {
    const filePath = join(__dirname, '..', 'server', 'routes', 'dmTasks.ts');
    const content = readFileSync(filePath, 'utf-8');
    
    assert.ok(
      content.includes("where('locationId'") && content.includes("where('status'"),
      'dmTasks route should support filtering by both locationId and status'
    );
  });

  it('should support locationId without status filter (All tab)', () => {
    const filePath = join(__dirname, '..', 'server', 'routes', 'dmTasks.ts');
    const content = readFileSync(filePath, 'utf-8');
    
    const hasLocationIdOnlyQuery = content.includes("if (locationId)") && 
      content.includes(".where('locationId', '==', locationId)");
    assert.ok(hasLocationIdOnlyQuery, 'dmTasks route should support locationId filter without status');
  });
});

describe('Corrections Route', () => {
  it('should filter locationId in query not in memory', () => {
    const filePath = join(__dirname, '..', 'server', 'routes', 'corrections.ts');
    const content = readFileSync(filePath, 'utf-8');
    
    assert.ok(
      content.includes(".where('locationId', '==', locationId)"),
      'corrections route should filter locationId in Firestore query'
    );
    
    const memoryFilterPattern = /corrections\s*=\s*corrections\.filter\([^)]*locationId/;
    assert.ok(
      !memoryFilterPattern.test(content),
      'corrections should NOT filter locationId in memory'
    );
  });
});

describe('DMTasksView Component', () => {
  it('should exist and have required functionality', () => {
    const filePath = join(__dirname, '..', 'src', 'components', 'DMTasksView.tsx');
    const content = readFileSync(filePath, 'utf-8');
    
    assert.ok(content.includes('useSearchParams'), 'Should use URL search params');
    assert.ok(content.includes('locationId'), 'Should support locationId filtering');
    assert.ok(content.includes('complete') || content.includes('Complete'), 'Should have complete action');
    assert.ok(content.includes('cancel') || content.includes('Cancel') || content.includes('close') || content.includes('Close'), 'Should have close/cancel action');
  });
});

describe('StoreHoursChangeView Component', () => {
  it('should exist and have required functionality', () => {
    const filePath = join(__dirname, '..', 'src', 'components', 'StoreHoursChangeView.tsx');
    const content = readFileSync(filePath, 'utf-8');
    
    assert.ok(content, 'StoreHoursChangeView.tsx should exist');
    
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (const day of days) {
      assert.ok(content.toLowerCase().includes(day), `Should include ${day} in hours editor`);
    }
    
    assert.ok(content.includes('correction') || content.includes('Correction'), 'Should create a correction request');
  });
});

describe('StaleStoresView Links', () => {
  it('should have per-store links to verification, corrections, and DM tasks', () => {
    const filePath = join(__dirname, '..', 'src', 'components', 'StaleStoresView.tsx');
    const content = readFileSync(filePath, 'utf-8');
    
    assert.ok(content.includes('/verification?locationId='), 'Should have link to verification with locationId');
    assert.ok(content.includes('/corrections?locationId='), 'Should have link to corrections with locationId');
    assert.ok(content.includes('/dm-tasks?locationId='), 'Should have link to DM tasks with locationId');
  });
});

describe('CorrectionsQueue Component', () => {
  it('should have note about older corrections without expiry', () => {
    const filePath = join(__dirname, '..', 'src', 'components', 'CorrectionsQueue.tsx');
    const content = readFileSync(filePath, 'utf-8');
    
    assert.ok(
      content.includes('expiry') && (content.includes('older') || content.includes('before')),
      'Should note that older corrections have no expiry'
    );
  });

  it('should support locationId filtering', () => {
    const filePath = join(__dirname, '..', 'src', 'components', 'CorrectionsQueue.tsx');
    const content = readFileSync(filePath, 'utf-8');
    
    assert.ok(content.includes('useSearchParams'), 'Should use URL search params for locationId');
    assert.ok(content.includes('locationId'), 'Should filter by locationId');
  });
});

describe('AdminView Group Labels', () => {
  it('should show group labels on mobile (not hidden sm:flex)', () => {
    const filePath = join(__dirname, '..', 'src', 'components', 'AdminView.tsx');
    const content = readFileSync(filePath, 'utf-8');
    
    const groupLabels = ['Stores', 'Workflows', 'Email', 'Access', 'System'];
    
    for (const label of groupLabels) {
      const labelPattern = new RegExp(`>${label}</span>`);
      assert.ok(labelPattern.test(content), `Should have ${label} group label`);
    }
  });
});

describe('WorkflowRulesView Email Templates', () => {
  it('should have email template editing functionality', () => {
    const filePath = join(__dirname, '..', 'src', 'components', 'WorkflowRulesView.tsx');
    const content = readFileSync(filePath, 'utf-8');
    
    assert.ok(content.includes('Email Templates') || content.includes('email template'), 'Should have Email Templates section');
    assert.ok(content.includes('toggleTypeEnabled'), 'Should have toggle for enabling/disabling email types');
    assert.ok(content.includes('openTemplateEditor'), 'Should have template editor opener');
    assert.ok(content.includes('saveTemplate'), 'Should have save template functionality');
  });
});

describe('EmailSettingsView Cleanup', () => {
  it('should not have duplicate email type toggles', () => {
    const filePath = join(__dirname, '..', 'src', 'components', 'EmailSettingsView.tsx');
    const content = readFileSync(filePath, 'utf-8');
    
    const toggleCount = (content.match(/toggleTypeEnabled/g) || []).length;
    assert.ok(toggleCount === 0, 'EmailSettingsView should not have toggleTypeEnabled (moved to WorkflowRulesView)');
  });

  it('should not have template editor', () => {
    const filePath = join(__dirname, '..', 'src', 'components', 'EmailSettingsView.tsx');
    const content = readFileSync(filePath, 'utf-8');
    
    const templateEditorCount = (content.match(/openTemplateEditor/g) || []).length;
    assert.ok(templateEditorCount === 0, 'EmailSettingsView should not have openTemplateEditor (moved to WorkflowRulesView)');
  });
});
