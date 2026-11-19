/**
 * Tests for District/Region retirement ending DM/RM assignments:
 * 1. Retiring a district ends its active DM assignments
 * 2. Retiring a region ends its active RM assignments
 * 3. Audit log entries are created for ended assignments
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { seedTestUsers, getTestDb } from './testHelpers';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

async function fetchApi(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    headers: {
      'Authorization': 'Bearer test-token-admin',
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });
}

describe('District Retirement - Ends DM Assignments', () => {
  let districtId: string;
  let assignmentId: string;

  before(async () => {
    await seedTestUsers();
    const db = getTestDb();
    const now = new Date().toISOString();
    const todayStr = now.slice(0, 10);

    const regionRef = await db.collection('regions').add({
      code: 'RETTEST1',
      name: 'Retirement Test Region',
      lifecycle: 'active',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });

    const districtRef = await db.collection('districts').add({
      code: 'RETTEST1D',
      name: 'Retirement Test District',
      regionId: regionRef.id,
      lifecycle: 'active',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });
    districtId = districtRef.id;

    const personRef = await db.collection('people').add({
      fullName: 'Test DM Person',
      lifecycle: 'active',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });

    const assignmentRef = await db.collection('assignments').add({
      personId: personRef.id,
      role: 'DM',
      scopeType: 'district',
      scopeId: districtRef.id,
      slot: 'primary',
      startDate: todayStr,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });
    assignmentId = assignmentRef.id;
  });

  it('ends DM assignment when district is retired', async () => {
    const res = await fetchApi(`/api/app/hierarchy/districts/${districtId}/retire`, {
      method: 'POST',
    });

    assert.strictEqual(res.status, 200, 'retire should succeed');
    const body = await res.json();
    assert.strictEqual(body.data.retired, true, 'district should be retired');
    assert.strictEqual(body.data.assignmentsEnded, 1, 'should end 1 assignment');

    const db = getTestDb();
    const assignmentDoc = await db.collection('assignments').doc(assignmentId).get();
    const assignment = assignmentDoc.data()!;
    
    assert.ok(assignment.endDate, 'assignment should have endDate');
    assert.ok(assignment.endedAt, 'assignment should have endedAt');
  });

  it('creates audit log for ended DM assignment', async () => {
    const db = getTestDb();
    const auditSnap = await db.collection('auditLog')
      .where('entityId', '==', assignmentId)
      .where('action', '==', 'unassign')
      .limit(1)
      .get();

    assert.strictEqual(auditSnap.empty, false, 'should have audit entry for unassign');
    const audit = auditSnap.docs[0].data();
    assert.ok(audit.entityName.includes('DM'), 'audit entry should mention DM');
    assert.ok(audit.entityName.includes('district retired'), 'audit entry should mention district retired');
  });
});

describe('Region Retirement - Ends RM Assignments', () => {
  let regionId: string;
  let assignmentId: string;

  before(async () => {
    await seedTestUsers();
    const db = getTestDb();
    const now = new Date().toISOString();
    const todayStr = now.slice(0, 10);

    const regionRef = await db.collection('regions').add({
      code: 'RETTEST2',
      name: 'Retirement Test Region 2',
      lifecycle: 'active',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });
    regionId = regionRef.id;

    const personRef = await db.collection('people').add({
      fullName: 'Test RM Person',
      lifecycle: 'active',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });

    const assignmentRef = await db.collection('assignments').add({
      personId: personRef.id,
      role: 'RM',
      scopeType: 'region',
      scopeId: regionRef.id,
      slot: 'primary',
      startDate: todayStr,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });
    assignmentId = assignmentRef.id;
  });

  it('ends RM assignment when region is retired', async () => {
    const res = await fetchApi(`/api/app/hierarchy/regions/${regionId}/retire`, {
      method: 'POST',
    });

    assert.strictEqual(res.status, 200, 'retire should succeed');
    const body = await res.json();
    assert.strictEqual(body.data.retired, true, 'region should be retired');
    assert.strictEqual(body.data.assignmentsEnded, 1, 'should end 1 assignment');

    const db = getTestDb();
    const assignmentDoc = await db.collection('assignments').doc(assignmentId).get();
    const assignment = assignmentDoc.data()!;
    
    assert.ok(assignment.endDate, 'assignment should have endDate');
    assert.ok(assignment.endedAt, 'assignment should have endedAt');
  });

  it('creates audit log for ended RM assignment', async () => {
    const db = getTestDb();
    const auditSnap = await db.collection('auditLog')
      .where('entityId', '==', assignmentId)
      .where('action', '==', 'unassign')
      .limit(1)
      .get();

    assert.strictEqual(auditSnap.empty, false, 'should have audit entry for unassign');
    const audit = auditSnap.docs[0].data();
    assert.ok(audit.entityName.includes('RM'), 'audit entry should mention RM');
    assert.ok(audit.entityName.includes('region retired'), 'audit entry should mention region retired');
  });
});

console.log('Retire assignments tests loaded');
