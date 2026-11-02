import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const testRunId = `dm-tasks-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('DM Tasks Route', () => {
  it('should support locationId query parameter', () => {
    const filePath = join(__dirname, '..', 'server', 'routes', 'dmTasks.ts');
    const content = readFileSync(filePath, 'utf-8');
    
    assert.ok(
      content.includes('locationId'),
      'dmTasks route should accept locationId parameter'
    );
    assert.ok(
      content.includes("locationId } = req.query") || content.includes("req.query"),
      'dmTasks route should read locationId from query'
    );
  });

  it('should have complete and cancel actions', () => {
    const filePath = join(__dirname, '..', 'server', 'routes', 'dmTasks.ts');
    const content = readFileSync(filePath, 'utf-8');
    
    assert.ok(
      content.includes('patch') || content.includes('PATCH'),
      'dmTasks route should support PATCH for status updates'
    );
    assert.ok(
      content.includes("'completed'") || content.includes('"completed"'),
      'dmTasks route should support completed status'
    );
    assert.ok(
      content.includes("'cancelled'") || content.includes('"cancelled"'),
      'dmTasks route should support cancelled status'
    );
  });
});

describe('Corrections Route', () => {
  it('should support locationId query parameter', () => {
    const filePath = join(__dirname, '..', 'server', 'routes', 'corrections.ts');
    const content = readFileSync(filePath, 'utf-8');
    
    assert.ok(
      content.includes('locationId'),
      'corrections route should accept locationId parameter'
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
    assert.ok(content.includes('close') || content.includes('Close'), 'Should have close action');
  });
});

describe('StoreHoursChangeView Component', () => {
  it('should exist and have required functionality', () => {
    const filePath = join(__dirname, '..', 'src', 'components', 'StoreHoursChangeView.tsx');
    const content = readFileSync(filePath, 'utf-8');
    
    assert.ok(content, 'StoreHoursChangeView.tsx should exist');
    
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (const day of days) {
      assert.ok(
        content.toLowerCase().includes(day),
        `Should include ${day} in hours editor`
      );
    }
    
    assert.ok(
      content.includes('correction') || content.includes('Correction'),
      'Should create a correction request'
    );
  });
});

describe('StaleStoresView Links', () => {
  it('should have per-store links to verification, corrections, and DM tasks', () => {
    const filePath = join(__dirname, '..', 'src', 'components', 'StaleStoresView.tsx');
    const content = readFileSync(filePath, 'utf-8');
    
    assert.ok(
      content.includes('/verification?locationId='),
      'Should have link to verification with locationId'
    );
    assert.ok(
      content.includes('/corrections?locationId='),
      'Should have link to corrections with locationId'
    );
    assert.ok(
      content.includes('/dm-tasks?locationId='),
      'Should have link to DM tasks with locationId'
    );
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
    
    assert.ok(
      content.includes('useSearchParams'),
      'Should use URL search params for locationId'
    );
    assert.ok(
      content.includes('locationId'),
      'Should filter by locationId'
    );
  });
});

describe('AdminView Group Labels', () => {
  it('should show group labels on mobile (not hidden sm:flex)', () => {
    const filePath = join(__dirname, '..', 'src', 'components', 'AdminView.tsx');
    const content = readFileSync(filePath, 'utf-8');
    
    const groupLabels = ['Stores', 'Workflows', 'Email', 'Access', 'System'];
    
    for (const label of groupLabels) {
      const labelPattern = new RegExp(`>${label}</span>`);
      assert.ok(
        labelPattern.test(content),
        `Should have ${label} group label`
      );
    }
    
    const hiddenSmFlexCount = (content.match(/hidden\s+sm:flex/g) || []).length;
    assert.ok(
      hiddenSmFlexCount === 0 || !content.includes('uppercase tracking-wider'),
      'Group labels should not use hidden sm:flex pattern'
    );
  });
});

describe('WorkflowRulesView Email Templates', () => {
  it('should have email template editing functionality', () => {
    const filePath = join(__dirname, '..', 'src', 'components', 'WorkflowRulesView.tsx');
    const content = readFileSync(filePath, 'utf-8');
    
    assert.ok(
      content.includes('Email Templates') || content.includes('email template'),
      'Should have Email Templates section'
    );
    assert.ok(
      content.includes('toggleTypeEnabled'),
      'Should have toggle for enabling/disabling email types'
    );
    assert.ok(
      content.includes('openTemplateEditor'),
      'Should have template editor opener'
    );
    assert.ok(
      content.includes('saveTemplate'),
      'Should have save template functionality'
    );
    assert.ok(
      content.includes('resetTemplate') || content.includes('reset'),
      'Should have reset template functionality'
    );
  });
});

describe('EmailSettingsView Cleanup', () => {
  it('should not have duplicate email type toggles', () => {
    const filePath = join(__dirname, '..', 'src', 'components', 'EmailSettingsView.tsx');
    const content = readFileSync(filePath, 'utf-8');
    
    const toggleCount = (content.match(/toggleTypeEnabled/g) || []).length;
    assert.ok(
      toggleCount === 0,
      'EmailSettingsView should not have toggleTypeEnabled (moved to WorkflowRulesView)'
    );
  });

  it('should not have template editor', () => {
    const filePath = join(__dirname, '..', 'src', 'components', 'EmailSettingsView.tsx');
    const content = readFileSync(filePath, 'utf-8');
    
    const templateEditorCount = (content.match(/openTemplateEditor/g) || []).length;
    assert.ok(
      templateEditorCount === 0,
      'EmailSettingsView should not have openTemplateEditor (moved to WorkflowRulesView)'
    );
  });
});
