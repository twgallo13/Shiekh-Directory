import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  hasPermission,
  canEditLocation,
  canViewMobilePhones,
  canApproveCorrections,
  canAccessAdmin,
  getPermissions,
} from '../src/lib/permissions';
import type { AuthUser, UserRole } from '../src/types';

function createTestUser(role: UserRole, overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    uid: 'test-uid',
    email: 'test@example.com',
    displayName: 'Test User',
    role,
    ...overrides,
  };
}

describe('Permission Matrix', () => {
  describe('Viewer Role', () => {
    const viewer = createTestUser('Viewer');
    
    it('can view locations', () => {
      const result = hasPermission(viewer, 'view:locations');
      assert.strictEqual(result.allowed, true);
      assert.strictEqual(result.scope, 'all');
    });
    
    it('can view people', () => {
      const result = hasPermission(viewer, 'view:people');
      assert.strictEqual(result.allowed, true);
    });
    
    it('cannot view mobile phones', () => {
      const result = hasPermission(viewer, 'view:mobilePhones');
      assert.strictEqual(result.allowed, false);
    });
    
    it('cannot edit anything', () => {
      const editPerms = canEditLocation(viewer, 'any-location');
      assert.strictEqual(editPerms.closure, false);
      assert.strictEqual(editPerms.hours, false);
      assert.strictEqual(editPerms.contactInfo, false);
      assert.strictEqual(editPerms.assignments, false);
    });
    
    it('cannot approve corrections', () => {
      assert.strictEqual(canApproveCorrections(viewer), false);
    });
    
    it('cannot access admin', () => {
      assert.strictEqual(canAccessAdmin(viewer), false);
    });
  });
  
  describe('Store Role', () => {
    const storeUser = createTestUser('Store', {
      storeLocationId: 'store-007',
    });
    
    it('can view locations', () => {
      const result = hasPermission(storeUser, 'view:locations');
      assert.strictEqual(result.allowed, true);
    });
    
    it('cannot view mobile phones', () => {
      assert.strictEqual(canViewMobilePhones(storeUser), false);
    });
    
    it('can edit closure for own store', () => {
      const editPerms = canEditLocation(storeUser, 'store-007');
      assert.strictEqual(editPerms.closure, true);
    });
    
    it('cannot edit closure for other stores', () => {
      const editPerms = canEditLocation(storeUser, 'other-store');
      assert.strictEqual(editPerms.closure, false);
    });
    
    it('can only propose contact info changes', () => {
      const editPerms = canEditLocation(storeUser, 'store-007');
      assert.strictEqual(editPerms.contactInfo, 'propose-only');
    });
    
    it('cannot directly edit hours', () => {
      const editPerms = canEditLocation(storeUser, 'store-007');
      assert.strictEqual(editPerms.hours, false);
    });
    
    it('cannot approve corrections', () => {
      assert.strictEqual(canApproveCorrections(storeUser), false);
    });
  });
  
  describe('Leader Role (DM/RM)', () => {
    const leader = createTestUser('Leader', {
      leaderScope: {
        districtIds: ['dist-la-central'],
        regionIds: [],
        locationIds: ['store-001', 'store-002', 'store-007'],
      },
    });
    
    it('can view locations', () => {
      const result = hasPermission(leader, 'view:locations');
      assert.strictEqual(result.allowed, true);
    });
    
    it('can view mobile phones', () => {
      assert.strictEqual(canViewMobilePhones(leader), true);
    });
    
    it('can edit closure for own scope stores', () => {
      const editPerms = canEditLocation(leader, 'store-007');
      assert.strictEqual(editPerms.closure, true);
    });
    
    it('cannot edit closure for out-of-scope stores', () => {
      const editPerms = canEditLocation(leader, 'store-999');
      assert.strictEqual(editPerms.closure, false);
    });
    
    it('can edit hours for own scope stores', () => {
      const editPerms = canEditLocation(leader, 'store-001');
      assert.strictEqual(editPerms.hours, true);
    });
    
    it('can only propose contact info changes', () => {
      const editPerms = canEditLocation(leader, 'store-007');
      assert.strictEqual(editPerms.contactInfo, 'propose-only');
    });
    
    it('can assign store leads in scope', () => {
      const editPerms = canEditLocation(leader, 'store-002');
      assert.strictEqual(editPerms.assignments, true);
    });
    
    it('cannot assign store leads out of scope', () => {
      const editPerms = canEditLocation(leader, 'store-out-of-scope');
      assert.strictEqual(editPerms.assignments, false);
    });
    
    it('cannot approve corrections', () => {
      assert.strictEqual(canApproveCorrections(leader), false);
    });
  });
  
  describe('Steward Role', () => {
    const steward = createTestUser('Steward');
    
    it('can view locations', () => {
      const result = hasPermission(steward, 'view:locations');
      assert.strictEqual(result.allowed, true);
    });
    
    it('can view mobile phones', () => {
      assert.strictEqual(canViewMobilePhones(steward), true);
    });
    
    it('can edit closure for any store', () => {
      const editPerms = canEditLocation(steward, 'any-store');
      assert.strictEqual(editPerms.closure, true);
    });
    
    it('can edit hours for any store', () => {
      const editPerms = canEditLocation(steward, 'any-store');
      assert.strictEqual(editPerms.hours, true);
    });
    
    it('can directly edit contact info for any store', () => {
      const editPerms = canEditLocation(steward, 'any-store');
      assert.strictEqual(editPerms.contactInfo, true);
    });
    
    it('can assign store leads for any store', () => {
      const editPerms = canEditLocation(steward, 'any-store');
      assert.strictEqual(editPerms.assignments, true);
    });
    
    it('can approve corrections', () => {
      assert.strictEqual(canApproveCorrections(steward), true);
    });
    
    it('cannot access admin', () => {
      assert.strictEqual(canAccessAdmin(steward), false);
    });
  });
  
  describe('Admin Role', () => {
    const admin = createTestUser('Admin');
    
    it('can view locations', () => {
      const result = hasPermission(admin, 'view:locations');
      assert.strictEqual(result.allowed, true);
    });
    
    it('can view mobile phones', () => {
      assert.strictEqual(canViewMobilePhones(admin), true);
    });
    
    it('can edit everything for any store', () => {
      const editPerms = canEditLocation(admin, 'any-store');
      assert.strictEqual(editPerms.closure, true);
      assert.strictEqual(editPerms.hours, true);
      assert.strictEqual(editPerms.contactInfo, true);
      assert.strictEqual(editPerms.assignments, true);
    });
    
    it('can approve corrections', () => {
      assert.strictEqual(canApproveCorrections(admin), true);
    });
    
    it('can access admin', () => {
      assert.strictEqual(canAccessAdmin(admin), true);
    });
    
    it('has admin permissions', () => {
      const result = hasPermission(admin, 'admin:users');
      assert.strictEqual(result.allowed, true);
      assert.strictEqual(result.scope, 'all');
    });
    
    it('has system admin permission', () => {
      const result = hasPermission(admin, 'admin:system');
      assert.strictEqual(result.allowed, true);
    });
  });
  
  describe('getPermissions', () => {
    it('returns correct permissions for each role', () => {
      const viewerPerms = getPermissions('Viewer');
      assert.strictEqual(viewerPerms.length, 2);
      
      const storePerms = getPermissions('Store');
      assert.strictEqual(storePerms.length, 5);
      
      const leaderPerms = getPermissions('Leader');
      assert.strictEqual(leaderPerms.length, 8);
      
      const stewardPerms = getPermissions('Steward');
      assert.strictEqual(stewardPerms.length, 11);
      
      const adminPerms = getPermissions('Admin');
      assert.strictEqual(adminPerms.length, 13);
    });
  });
  
  describe('Edge Cases', () => {
    it('handles missing leaderScope gracefully', () => {
      const leaderNoScope = createTestUser('Leader');
      const editPerms = canEditLocation(leaderNoScope, 'any-store');
      assert.strictEqual(editPerms.closure, false);
      assert.strictEqual(editPerms.hours, false);
    });
    
    it('handles Store role without storeLocationId', () => {
      const storeNoLocation = createTestUser('Store');
      const editPerms = canEditLocation(storeNoLocation, 'store-007');
      assert.strictEqual(editPerms.closure, false);
    });
    
    it('returns allowed: false for unknown permission', () => {
      const viewer = createTestUser('Viewer');
      const result = hasPermission(viewer, 'edit:closure');
      assert.strictEqual(result.allowed, false);
    });
  });
});
