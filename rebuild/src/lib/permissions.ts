/**
 * Permission checking logic for Shiekh Directory
 * 
 * Roles (in ascending privilege order):
 * - Viewer: Read-only access to public info
 * - Store: Limited to own store, can propose corrections
 * - Leader: DM/RM - can edit their own stores' hours/closures/SM assignments
 * - Steward: Can edit everything, approve corrections
 * - Admin: Full access including user management
 */

import type {
  UserRole,
  Permission,
  PermissionScope,
  PermissionGrant,
  AuthUser,
} from '../types';

// Permission matrix based on Notion blueprint
const PERMISSION_MATRIX: Record<UserRole, PermissionGrant[]> = {
  Viewer: [
    { permission: 'view:locations', scope: 'all' },
    { permission: 'view:people', scope: 'all' },
  ],
  Store: [
    { permission: 'view:locations', scope: 'all' },
    { permission: 'view:people', scope: 'all' },
    { permission: 'edit:closure', scope: 'own-store' },
    { permission: 'edit:hours', scope: 'propose-only' },
    { permission: 'edit:contactInfo', scope: 'propose-only' },
  ],
  Leader: [
    { permission: 'view:locations', scope: 'all' },
    { permission: 'view:people', scope: 'all' },
    { permission: 'view:mobilePhones', scope: 'all' },
    { permission: 'edit:closure', scope: 'own-scope' },
    { permission: 'edit:hours', scope: 'own-scope' },
    { permission: 'edit:contactInfo', scope: 'propose-only' },
    { permission: 'assign:storeLead', scope: 'own-scope' },
    { permission: 'export:data', scope: 'all' },
  ],
  Steward: [
    { permission: 'view:locations', scope: 'all' },
    { permission: 'view:people', scope: 'all' },
    { permission: 'view:mobilePhones', scope: 'all' },
    { permission: 'edit:closure', scope: 'all' },
    { permission: 'edit:hours', scope: 'all' },
    { permission: 'edit:contactInfo', scope: 'all' },
    { permission: 'assign:storeLead', scope: 'all' },
    { permission: 'assign:districtLead', scope: 'all' },
    { permission: 'edit:districts', scope: 'all' },
    { permission: 'approve:corrections', scope: 'all' },
    { permission: 'export:data', scope: 'all' },
  ],
  Admin: [
    { permission: 'view:locations', scope: 'all' },
    { permission: 'view:people', scope: 'all' },
    { permission: 'view:mobilePhones', scope: 'all' },
    { permission: 'edit:closure', scope: 'all' },
    { permission: 'edit:hours', scope: 'all' },
    { permission: 'edit:contactInfo', scope: 'all' },
    { permission: 'assign:storeLead', scope: 'all' },
    { permission: 'assign:districtLead', scope: 'all' },
    { permission: 'edit:districts', scope: 'all' },
    { permission: 'approve:corrections', scope: 'all' },
    { permission: 'export:data', scope: 'all' },
    { permission: 'admin:users', scope: 'all' },
    { permission: 'admin:system', scope: 'all' },
  ],
};

export function getPermissions(role: UserRole): PermissionGrant[] {
  return PERMISSION_MATRIX[role] || [];
}

export function hasPermission(
  user: AuthUser,
  permission: Permission,
  locationId?: string
): { allowed: boolean; scope: PermissionScope } {
  const grants = PERMISSION_MATRIX[user.role] || [];
  const grant = grants.find(g => g.permission === permission);
  
  if (!grant) {
    return { allowed: false, scope: 'all' };
  }
  
  if (grant.scope === 'all' || grant.scope === 'propose-only') {
    return { allowed: true, scope: grant.scope };
  }
  
  if (grant.scope === 'own-store' && locationId) {
    const allowed = user.storeLocationId === locationId;
    return { allowed, scope: grant.scope };
  }
  
  if (grant.scope === 'own-scope' && locationId && user.leaderScope) {
    const allowed = user.leaderScope.locationIds.includes(locationId);
    return { allowed, scope: grant.scope };
  }
  
  return { allowed: false, scope: grant.scope };
}

export function canEditLocation(
  user: AuthUser,
  locationId: string
): {
  closure: boolean;
  hours: boolean;
  contactInfo: boolean | 'propose-only';
  directions: boolean | 'propose-only';
  assignments: boolean;
} {
  const closureCheck = hasPermission(user, 'edit:closure', locationId);
  const hoursCheck = hasPermission(user, 'edit:hours', locationId);
  const contactCheck = hasPermission(user, 'edit:contactInfo', locationId);
  const assignCheck = hasPermission(user, 'assign:storeLead', locationId);
  
  const canEditDirections = user.role === 'Admin' || user.role === 'Steward' ||
    (user.role === 'Store' && user.storeLocationId === locationId);
  
  return {
    closure: closureCheck.allowed && closureCheck.scope !== 'propose-only',
    hours: hoursCheck.allowed && hoursCheck.scope !== 'propose-only',
    contactInfo: contactCheck.allowed
      ? (contactCheck.scope === 'propose-only' ? 'propose-only' : true)
      : false,
    directions: canEditDirections 
      ? (user.role === 'Store' ? 'propose-only' : true)
      : false,
    assignments: assignCheck.allowed && assignCheck.scope !== 'propose-only',
  };
}

export function canViewMobilePhones(user: AuthUser): boolean {
  const check = hasPermission(user, 'view:mobilePhones');
  return check.allowed;
}

export function canApproveCorrections(user: AuthUser): boolean {
  const check = hasPermission(user, 'approve:corrections');
  return check.allowed;
}

export function canAccessAdmin(user: AuthUser): boolean {
  return user.role === 'Admin';
}

export function canExport(user: AuthUser): boolean {
  const check = hasPermission(user, 'export:data');
  return check.allowed;
}

export function getRoleDisplayName(role: UserRole): string {
  switch (role) {
    case 'Viewer': return 'Viewer';
    case 'Store': return 'Store Account';
    case 'Leader': return 'District/Region Leader';
    case 'Steward': return 'Directory Steward';
    case 'Admin': return 'Administrator';
    default: return role;
  }
}
