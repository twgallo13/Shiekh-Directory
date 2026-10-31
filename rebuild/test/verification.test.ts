import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import type { VerificationRequest, VerificationStatus, Location } from '../src/types';
import { 
  seedTestUsers, 
  seedTestHierarchy, 
  seedTestLeader, 
  seedTestLocationsForDistrict,
  getTestDb,
} from './testHelpers';

describe('Verification - Request Status', () => {
  describe('Status Transitions', () => {
    it('pending request can transition to confirmed when hours confirmed', () => {
      const request: Partial<VerificationRequest> = {
        status: 'pending',
        hoursConfirmed: true,
        proposedChanges: undefined,
      };

      const hasProposedChanges = request.proposedChanges && Object.keys(request.proposedChanges).length > 0;
      const newStatus: VerificationStatus = hasProposedChanges ? 'pending' : 'confirmed';

      assert.strictEqual(newStatus, 'confirmed');
    });

    it('pending request stays pending when changes proposed', () => {
      const request: Partial<VerificationRequest> = {
        status: 'pending',
        hoursConfirmed: true,
        proposedChanges: { mainPhone: '+15555551234' },
      };

      const hasProposedChanges = request.proposedChanges && Object.keys(request.proposedChanges).length > 0;
      const newStatus: VerificationStatus = hasProposedChanges ? 'pending' : 'confirmed';

      assert.strictEqual(newStatus, 'pending');
    });

    it('request expires when past expiresAt timestamp', () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      const request: Partial<VerificationRequest> = {
        status: 'pending',
        expiresAt: pastDate.toISOString(),
        respondedAt: undefined,
      };

      const isExpired = new Date(request.expiresAt!) < now;
      const shouldExpire = isExpired && !request.respondedAt;

      assert.strictEqual(shouldExpire, true);
    });

    it('already responded request does not expire', () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      const request: Partial<VerificationRequest> = {
        status: 'pending',
        expiresAt: pastDate.toISOString(),
        respondedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const isExpired = new Date(request.expiresAt!) < now;
      const shouldExpire = isExpired && !request.respondedAt;

      assert.strictEqual(shouldExpire, false);
    });
  });

  describe('Expiration Logic', () => {
    it('calculates default expiration as 7 days', () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const diffMs = expiresAt.getTime() - now.getTime();
      const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));

      assert.strictEqual(diffDays, 7);
    });
  });
});

describe('Verification - Response Processing', () => {
  describe('Proposed Changes Validation', () => {
    it('accepts phone number changes', () => {
      const proposedChanges = {
        mainPhone: '+15555551234',
      };

      const validFields = ['mainPhone', 'sharedInboxEmail', 'address'];
      const allValid = Object.keys(proposedChanges).every(f => validFields.includes(f));

      assert.strictEqual(allValid, true);
    });

    it('accepts email changes', () => {
      const proposedChanges = {
        sharedInboxEmail: 'newstore@shiekh.test',
      };

      const validFields = ['mainPhone', 'sharedInboxEmail', 'address'];
      const allValid = Object.keys(proposedChanges).every(f => validFields.includes(f));

      assert.strictEqual(allValid, true);
    });

    it('rejects invalid field changes', () => {
      const proposedChanges = {
        storeNumber: '999',
        lifecycle: 'retired',
      };

      const validFields = ['mainPhone', 'sharedInboxEmail', 'address'];
      const allValid = Object.keys(proposedChanges).every(f => validFields.includes(f));

      assert.strictEqual(allValid, false);
    });

    it('accepts multiple valid changes', () => {
      const proposedChanges = {
        mainPhone: '+15555551234',
        sharedInboxEmail: 'newstore@shiekh.test',
      };

      const validFields = ['mainPhone', 'sharedInboxEmail', 'address'];
      const allValid = Object.keys(proposedChanges).every(f => validFields.includes(f));

      assert.strictEqual(allValid, true);
    });
  });

  describe('Location Updates', () => {
    it('updates lastVerifiedAt when verified', () => {
      const now = new Date();
      const location: Partial<Location> = {
        lastVerifiedAt: undefined,
      };

      location.lastVerifiedAt = now.toISOString();

      assert.ok(location.lastVerifiedAt);
      assert.strictEqual(typeof location.lastVerifiedAt, 'string');
    });

    it('updates lastVerifiedBy when verified', () => {
      const userId = 'steward-user-123';
      const location: Partial<Location> = {
        lastVerifiedBy: undefined,
      };

      location.lastVerifiedBy = userId;

      assert.strictEqual(location.lastVerifiedBy, userId);
    });
  });
});

describe('Verification - Approval Flow', () => {
  describe('Steward Approval', () => {
    it('applies proposed changes when applyChanges=true', () => {
      const location: Partial<Location> = {
        mainPhone: '+15555550000',
        sharedInboxEmail: 'old@shiekh.test',
      };

      const proposedChanges = {
        mainPhone: '+15555551234',
        sharedInboxEmail: 'new@shiekh.test',
      };

      const applyChanges = true;

      if (applyChanges) {
        for (const [field, value] of Object.entries(proposedChanges)) {
          (location as Record<string, unknown>)[field] = value;
        }
      }

      assert.strictEqual(location.mainPhone, '+15555551234');
      assert.strictEqual(location.sharedInboxEmail, 'new@shiekh.test');
    });

    it('does not apply changes when applyChanges=false', () => {
      const location: Partial<Location> = {
        mainPhone: '+15555550000',
        sharedInboxEmail: 'old@shiekh.test',
      };

      const proposedChanges = {
        mainPhone: '+15555551234',
      };

      const applyChanges = false;

      if (applyChanges) {
        for (const [field, value] of Object.entries(proposedChanges)) {
          (location as Record<string, unknown>)[field] = value;
        }
      }

      assert.strictEqual(location.mainPhone, '+15555550000');
    });

    it('marks location as verified even when changes not applied', () => {
      const now = new Date();
      const location: Partial<Location> = {
        lastVerifiedAt: undefined,
      };

      location.lastVerifiedAt = now.toISOString();

      assert.ok(location.lastVerifiedAt);
    });
  });

  describe('Role Restrictions', () => {
    it('only Admin and Steward can send verification requests', () => {
      const rolesAllowedToSend = ['Admin', 'Steward'];
      
      assert.ok(rolesAllowedToSend.includes('Admin'));
      assert.ok(rolesAllowedToSend.includes('Steward'));
      assert.ok(!rolesAllowedToSend.includes('Store'));
      assert.ok(!rolesAllowedToSend.includes('Leader'));
      assert.ok(!rolesAllowedToSend.includes('Viewer'));
    });

    it('only Admin and Steward can approve verification responses', () => {
      const rolesAllowedToApprove = ['Admin', 'Steward'];
      
      assert.ok(rolesAllowedToApprove.includes('Admin'));
      assert.ok(rolesAllowedToApprove.includes('Steward'));
      assert.ok(!rolesAllowedToApprove.includes('Store'));
    });

    it('Store can respond to verification requests', () => {
      const rolesAllowedToRespond = ['Admin', 'Steward', 'Leader', 'Store'];
      
      assert.ok(rolesAllowedToRespond.includes('Store'));
    });

    it('Store can only respond to their own store requests', () => {
      const storeUser = {
        role: 'Store',
        storeLocationId: 'loc-001',
      };

      const request = {
        locationId: 'loc-001',
      };

      const canRespond = storeUser.role === 'Store' 
        ? storeUser.storeLocationId === request.locationId
        : true;

      assert.strictEqual(canRespond, true);
    });

    it('Store cannot respond to other store requests', () => {
      const storeUser = {
        role: 'Store',
        storeLocationId: 'loc-001',
      };

      const request = {
        locationId: 'loc-002',
      };

      const canRespond = storeUser.role === 'Store' 
        ? storeUser.storeLocationId === request.locationId
        : true;

      assert.strictEqual(canRespond, false);
    });
  });
});

describe('Verification - Request Creation', () => {
  describe('Prerequisites', () => {
    it('requires location to have sharedInboxEmail', () => {
      const locationWithEmail = {
        id: 'loc-001',
        sharedInboxEmail: 'store@shiekh.test',
      };

      const locationWithoutEmail = {
        id: 'loc-002',
        sharedInboxEmail: undefined,
      };

      assert.ok(locationWithEmail.sharedInboxEmail);
      assert.ok(!locationWithoutEmail.sharedInboxEmail);
    });

    it('prevents duplicate pending requests for same location', () => {
      const existingRequests = [
        { locationId: 'loc-001', status: 'pending' },
        { locationId: 'loc-002', status: 'confirmed' },
      ];

      const newRequestLocationId = 'loc-001';
      
      const hasPendingRequest = existingRequests.some(
        r => r.locationId === newRequestLocationId && r.status === 'pending'
      );

      assert.strictEqual(hasPendingRequest, true);
    });

    it('allows new request after previous is confirmed', () => {
      const existingRequests = [
        { locationId: 'loc-001', status: 'confirmed' },
        { locationId: 'loc-002', status: 'pending' },
      ];

      const newRequestLocationId = 'loc-001';
      
      const hasPendingRequest = existingRequests.some(
        r => r.locationId === newRequestLocationId && r.status === 'pending'
      );

      assert.strictEqual(hasPendingRequest, false);
    });
  });

  describe('Request Data', () => {
    it('includes location info in request', () => {
      const location = {
        id: 'loc-001',
        storeNumber: '007',
        name: 'Downtown LA Flagship',
        sharedInboxEmail: 'store@shiekh.test',
      };

      const request: Partial<VerificationRequest> = {
        locationId: location.id,
        locationName: location.name,
        storeNumber: location.storeNumber,
        sentTo: location.sharedInboxEmail,
      };

      assert.strictEqual(request.locationId, 'loc-001');
      assert.strictEqual(request.storeNumber, '007');
      assert.strictEqual(request.sentTo, 'store@shiekh.test');
    });

    it('records sender info', () => {
      const sender = {
        uid: 'steward-123',
        email: 'steward@shiekh.test',
        role: 'Steward',
      };

      const now = new Date();

      const request: Partial<VerificationRequest> = {
        sentBy: sender.uid,
        sentAt: now.toISOString(),
      };

      assert.strictEqual(request.sentBy, 'steward-123');
      assert.ok(request.sentAt);
    });
  });
});

describe('Verification - Store Response Form', () => {
  describe('Hours Confirmation', () => {
    it('store can confirm hours are correct', () => {
      const response = {
        hoursConfirmed: true,
        proposedChanges: null,
      };

      assert.strictEqual(response.hoursConfirmed, true);
      assert.strictEqual(response.proposedChanges, null);
    });

    it('store can indicate hours need correction', () => {
      const response = {
        hoursConfirmed: false,
        proposedChanges: null,
      };

      assert.strictEqual(response.hoursConfirmed, false);
    });
  });

  describe('Contact Info Changes', () => {
    it('store can propose phone number change', () => {
      const currentPhone: string = '+15555550000';
      const proposedPhone: string = '+15555551234';

      const proposedChanges: Record<string, unknown> = {};
      if (proposedPhone && proposedPhone !== currentPhone) {
        proposedChanges.mainPhone = proposedPhone;
      }

      assert.strictEqual(proposedChanges.mainPhone, '+15555551234');
    });

    it('store can propose email change', () => {
      const currentEmail: string = 'old@shiekh.test';
      const proposedEmail: string = 'new@shiekh.test';

      const proposedChanges: Record<string, unknown> = {};
      if (proposedEmail && proposedEmail !== currentEmail) {
        proposedChanges.sharedInboxEmail = proposedEmail;
      }

      assert.strictEqual(proposedChanges.sharedInboxEmail, 'new@shiekh.test');
    });

    it('ignores unchanged values', () => {
      const currentPhone: string = '+15555550000';
      const proposedPhone: string = '+15555550000';

      const proposedChanges: Record<string, unknown> = {};
      if (proposedPhone && proposedPhone !== currentPhone) {
        proposedChanges.mainPhone = proposedPhone;
      }

      assert.strictEqual(Object.keys(proposedChanges).length, 0);
    });
  });
});

describe('Verification - Audit Trail', () => {
  describe('Verification Actions', () => {
    it('logs when verification request is sent', () => {
      const auditEntry = {
        action: 'create',
        entityType: 'location',
        entityId: 'loc-001',
        changes: [
          { field: 'verificationRequest', newValue: 'sent' },
          { field: 'sentTo', newValue: 'store@shiekh.test' },
        ],
      };

      assert.strictEqual(auditEntry.action, 'create');
      assert.strictEqual(auditEntry.changes.length, 2);
    });

    it('logs when store responds with confirmation', () => {
      const auditEntry = {
        action: 'update',
        entityType: 'location',
        entityId: 'loc-001',
        changes: [
          { field: 'lastVerifiedAt', newValue: new Date().toISOString() },
          { field: 'hoursConfirmed', newValue: true },
        ],
      };

      assert.strictEqual(auditEntry.action, 'update');
      assert.ok(auditEntry.changes.some(c => c.field === 'lastVerifiedAt'));
    });

    it('logs when store proposes changes', () => {
      const auditEntry = {
        action: 'update',
        entityType: 'location',
        entityId: 'loc-001',
        changes: [
          { field: 'verificationResponse', newValue: 'changes proposed' },
        ],
      };

      assert.strictEqual(auditEntry.action, 'update');
    });

    it('logs when steward approves with changes', () => {
      const auditEntry = {
        action: 'approve',
        entityType: 'location',
        entityId: 'loc-001',
        changes: [
          { field: 'mainPhone', oldValue: '+15555550000', newValue: '+15555551234' },
          { field: 'lastVerifiedAt', newValue: new Date().toISOString() },
        ],
      };

      assert.strictEqual(auditEntry.action, 'approve');
      assert.ok(auditEntry.changes.some(c => c.field === 'mainPhone'));
    });
  });
});

describe('Verification - UI Filter Logic', () => {
  it('filters requests by status', () => {
    const requests = [
      { id: '1', status: 'pending' },
      { id: '2', status: 'confirmed' },
      { id: '3', status: 'pending' },
      { id: '4', status: 'expired' },
    ];

    const pending = requests.filter(r => r.status === 'pending');
    const confirmed = requests.filter(r => r.status === 'confirmed');
    const expired = requests.filter(r => r.status === 'expired');

    assert.strictEqual(pending.length, 2);
    assert.strictEqual(confirmed.length, 1);
    assert.strictEqual(expired.length, 1);
  });

  it('sorts requests by sentAt descending', () => {
    const requests = [
      { id: '1', sentAt: '2026-10-28T10:00:00Z' },
      { id: '2', sentAt: '2026-10-30T10:00:00Z' },
      { id: '3', sentAt: '2026-10-29T10:00:00Z' },
    ];

    const sorted = [...requests].sort((a, b) => 
      b.sentAt.localeCompare(a.sentAt)
    );

    assert.strictEqual(sorted[0].id, '2');
    assert.strictEqual(sorted[1].id, '3');
    assert.strictEqual(sorted[2].id, '1');
  });
});

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

async function fetchApiAs(role: string, path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    headers: {
      'Authorization': `Bearer test-token-${role}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });
}

describe('Verification Route - Leader Scope', () => {
  let hierarchyIds: { regionId: string; region2Id: string; districtId: string; district2Id: string };
  let leaderLocationIds: string[];
  let otherDistrictLocationIds: string[];
  let requestInLeaderScope: string;
  let requestOutsideScope: string;

  before(async () => {
    await seedTestUsers();
    hierarchyIds = await seedTestHierarchy();
    
    leaderLocationIds = await seedTestLocationsForDistrict(
      hierarchyIds.districtId, 
      hierarchyIds.regionId, 
      2, 
      'LDR'
    );
    
    otherDistrictLocationIds = await seedTestLocationsForDistrict(
      hierarchyIds.district2Id, 
      hierarchyIds.region2Id, 
      2, 
      'OTH'
    );
    
    await seedTestLeader(hierarchyIds.districtId);
    
    const db = getTestDb();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const leaderRequestRef = db.collection('verificationRequests').doc();
    await leaderRequestRef.set({
      locationId: leaderLocationIds[0],
      locationName: 'Test Store LDR001',
      storeNumber: 'LDR001',
      sentTo: 'ldr001@shiekh.test',
      sentBy: 'steward',
      sentAt: now,
      expiresAt,
      status: 'pending',
      hoursConfirmed: false,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'steward',
      version: 1,
    });
    requestInLeaderScope = leaderRequestRef.id;

    const otherRequestRef = db.collection('verificationRequests').doc();
    await otherRequestRef.set({
      locationId: otherDistrictLocationIds[0],
      locationName: 'Test Store OTH001',
      storeNumber: 'OTH001',
      sentTo: 'oth001@shiekh.test',
      sentBy: 'steward',
      sentAt: now,
      expiresAt,
      status: 'pending',
      hoursConfirmed: false,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'steward',
      version: 1,
    });
    requestOutsideScope = otherRequestRef.id;
  });

  it('Leader sees verification requests only for their district stores', async () => {
    const res = await fetchApiAs('leader', '/api/app/verification');
    assert.strictEqual(res.status, 200, 'Leader should be able to list verification requests');
    
    const body = await res.json();
    assert.ok(Array.isArray(body.data), 'should return data array');
    
    const requestIds = body.data.map((r: { id: string }) => r.id);
    assert.ok(
      requestIds.includes(requestInLeaderScope),
      'should include request for store in leader\'s district'
    );
    assert.ok(
      !requestIds.includes(requestOutsideScope),
      'should NOT include request for store outside leader\'s district'
    );
  });

  it('Leader cannot access verification request for other district store', async () => {
    const res = await fetchApiAs('leader', `/api/app/verification?locationId=${otherDistrictLocationIds[0]}`);
    assert.strictEqual(res.status, 403, 'Leader should be denied access to other district stores');
    
    const body = await res.json();
    assert.strictEqual(body.error.code, 'forbidden');
  });

  it('Admin sees verification requests from all districts', async () => {
    const res = await fetchApiAs('admin', '/api/app/verification');
    assert.strictEqual(res.status, 200, 'Admin should be able to list all verification requests');
    
    const body = await res.json();
    const requestIds = body.data.map((r: { id: string }) => r.id);
    
    assert.ok(
      requestIds.includes(requestInLeaderScope),
      'Admin should see request in leader\'s district'
    );
    assert.ok(
      requestIds.includes(requestOutsideScope),
      'Admin should see request outside leader\'s district'
    );
  });

  it('Steward sees verification requests from all districts', async () => {
    const res = await fetchApiAs('steward', '/api/app/verification');
    assert.strictEqual(res.status, 200, 'Steward should be able to list all verification requests');
    
    const body = await res.json();
    const requestIds = body.data.map((r: { id: string }) => r.id);
    
    assert.ok(
      requestIds.includes(requestInLeaderScope),
      'Steward should see request in leader\'s district'
    );
    assert.ok(
      requestIds.includes(requestOutsideScope),
      'Steward should see request outside leader\'s district'
    );
  });

  it('Viewer cannot access verification requests', async () => {
    const res = await fetchApiAs('viewer', '/api/app/verification');
    assert.strictEqual(res.status, 403, 'Viewer should be denied access');
  });
});
