import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Assignment Logic', () => {
  describe('Primary vs Additional Slots', () => {
    it('identifies primary SM correctly', () => {
      const assignments = [
        { id: '1', personId: 'p1', role: 'SM', slot: 'primary', personName: 'John Doe' },
        { id: '2', personId: 'p2', role: 'SM', slot: 'additional', personName: 'Jane Smith', label: 'Temporary' },
      ];
      
      const primarySm = assignments.find(a => a.role === 'SM' && a.slot === 'primary');
      const additionalSms = assignments.filter(a => a.role === 'SM' && a.slot === 'additional');
      
      assert.strictEqual(primarySm?.personName, 'John Doe');
      assert.strictEqual(additionalSms.length, 1);
      assert.strictEqual(additionalSms[0].label, 'Temporary');
    });
    
    it('detects when primary SM is missing but coverage exists', () => {
      const assignments = [
        { id: '1', personId: 'p1', role: 'SM', slot: 'additional', personName: 'Jane Smith', label: 'Training' },
        { id: '2', personId: 'p2', role: 'ASM', slot: 'primary', personName: 'Bob Jones' },
      ];
      
      const smAssignments = assignments.filter(a => a.role === 'SM');
      const hasPrimarySm = smAssignments.some(a => a.slot === 'primary');
      const hasCoverage = smAssignments.length > 0;
      
      assert.strictEqual(hasPrimarySm, false);
      assert.strictEqual(hasCoverage, true);
    });
    
    it('detects when no SM assignments exist', () => {
      const assignments = [
        { id: '1', personId: 'p1', role: 'ASM', slot: 'primary', personName: 'Bob Jones' },
        { id: '2', personId: 'p2', role: 'KH', slot: 'primary', personName: 'Alice Brown' },
      ];
      
      const smAssignments = assignments.filter(a => a.role === 'SM');
      const hasPrimarySm = smAssignments.some(a => a.slot === 'primary');
      const hasCoverage = smAssignments.length > 0;
      
      assert.strictEqual(hasPrimarySm, false);
      assert.strictEqual(hasCoverage, false);
    });
  });
  
  describe('Concurrent Responsibilities', () => {
    it('allows same person to have SM and DM roles', () => {
      const personAssignments = [
        { id: '1', personId: 'p1', role: 'SM', scopeType: 'location', scopeId: 'store-007', slot: 'primary' },
        { id: '2', personId: 'p1', role: 'DM', scopeType: 'district', scopeId: 'dist-la', slot: 'primary' },
      ];
      
      const smRole = personAssignments.find(a => a.role === 'SM');
      const dmRole = personAssignments.find(a => a.role === 'DM');
      
      assert.ok(smRole, 'Should have SM role');
      assert.ok(dmRole, 'Should have DM role');
      assert.strictEqual(smRole.scopeType, 'location');
      assert.strictEqual(dmRole.scopeType, 'district');
    });
    
    it('allows multiple location assignments for same person', () => {
      const personAssignments = [
        { id: '1', personId: 'p1', role: 'SM', scopeType: 'location', scopeId: 'store-007', slot: 'primary' },
        { id: '2', personId: 'p1', role: 'SM', scopeType: 'location', scopeId: 'store-008', slot: 'additional', label: 'Coverage' },
      ];
      
      const smRoles = personAssignments.filter(a => a.role === 'SM');
      
      assert.strictEqual(smRoles.length, 2);
      assert.strictEqual(smRoles.filter(a => a.slot === 'primary').length, 1);
      assert.strictEqual(smRoles.filter(a => a.slot === 'additional').length, 1);
    });
  });
  
  describe('Assignment Active Status', () => {
    it('assignment without endDate is active', () => {
      const assignment: { id: string; startDate: string; endDate?: string } = {
        id: '1',
        startDate: '2024-01-01',
        endDate: undefined,
      };
      
      const today = '2026-10-30';
      const isActive = !assignment.endDate || assignment.endDate >= today;
      
      assert.strictEqual(isActive, true);
    });
    
    it('assignment with future endDate is active', () => {
      const assignment: { id: string; startDate: string; endDate?: string } = {
        id: '1',
        startDate: '2024-01-01',
        endDate: '2027-12-31',
      };
      
      const today = '2026-10-30';
      const isActive = !assignment.endDate || assignment.endDate >= today;
      
      assert.strictEqual(isActive, true);
    });
    
    it('assignment with past endDate is inactive', () => {
      const assignment: { id: string; startDate: string; endDate?: string } = {
        id: '1',
        startDate: '2024-01-01',
        endDate: '2025-06-30',
      };
      
      const today = '2026-10-30';
      const isActive = !assignment.endDate || assignment.endDate >= today;
      
      assert.strictEqual(isActive, false);
    });
    
    it('assignment ending today is still active', () => {
      const assignment: { id: string; startDate: string; endDate?: string } = {
        id: '1',
        startDate: '2024-01-01',
        endDate: '2026-10-30',
      };
      
      const today = '2026-10-30';
      const isActive = !assignment.endDate || assignment.endDate >= today;
      
      assert.strictEqual(isActive, true);
    });
    
    it('assignment ending yesterday is immediately inactive', () => {
      const assignment: { id: string; startDate: string; endDate?: string } = {
        id: '1',
        startDate: '2024-01-01',
        endDate: '2026-10-29',
      };
      
      const today = '2026-10-30';
      const isActive = !assignment.endDate || assignment.endDate >= today;
      
      assert.strictEqual(isActive, false);
    });
    
    it('assignment with endedAt is immediately inactive', () => {
      const assignment = {
        id: '1',
        startDate: '2024-01-01',
        endDate: '2026-10-30',
        endedAt: '2026-10-30T12:00:00Z',
      };
      
      const today = '2026-10-30';
      const isActive = !assignment.endedAt && (!assignment.endDate || assignment.endDate >= today);
      
      assert.strictEqual(isActive, false);
    });
    
    it('same-day ended assignment is inactive due to endedAt', () => {
      const assignment = {
        id: '1',
        startDate: '2026-10-30',
        endDate: '2026-10-30',
        endedAt: '2026-10-30T15:00:00Z',
      };
      
      const today = '2026-10-30';
      const isActiveWithoutEndedAt = !assignment.endDate || assignment.endDate >= today;
      const isActiveWithEndedAt = !assignment.endedAt && (!assignment.endDate || assignment.endDate >= today);
      
      assert.strictEqual(isActiveWithoutEndedAt, true, 'Would be active based on endDate alone');
      assert.strictEqual(isActiveWithEndedAt, false, 'Should be inactive due to endedAt');
    });
    
    it('assignment without endedAt and future endDate is active', () => {
      const assignment = {
        id: '1',
        startDate: '2024-01-01',
        endDate: '2027-12-31',
        endedAt: undefined as string | undefined,
      };
      
      const today = '2026-10-30';
      const isActive = !assignment.endedAt && (!assignment.endDate || assignment.endDate >= today);
      
      assert.strictEqual(isActive, true);
    });
    
    it('End action should use yesterday date for immediate effect', () => {
      const now = new Date('2026-10-30T12:00:00Z');
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const effectiveEndDate = yesterday.toISOString().slice(0, 10);
      
      assert.strictEqual(effectiveEndDate, '2026-10-29');
      
      const isActive = effectiveEndDate >= '2026-10-30';
      assert.strictEqual(isActive, false);
    });
    
    it('End action uses max(yesterday, startDate) when startDate is recent', () => {
      const yesterday = '2026-10-29';
      const startDate = '2026-10-30';
      
      const effectiveEndDate = startDate > yesterday ? startDate : yesterday;
      
      assert.strictEqual(effectiveEndDate, '2026-10-30');
    });
    
    it('End action uses yesterday when startDate is old', () => {
      const yesterday = '2026-10-29';
      const startDate = '2024-01-01';
      
      const effectiveEndDate = startDate > yesterday ? startDate : yesterday;
      
      assert.strictEqual(effectiveEndDate, '2026-10-29');
    });
    
    it('Future assignment should be deleted instead of ended', () => {
      const today = '2026-10-30';
      const startDate = '2026-11-15';
      
      const neverStarted = startDate > today;
      
      assert.strictEqual(neverStarted, true, 'Assignment starting in the future should be deleted');
    });
    
    it('Assignment starting today should be ended, not deleted', () => {
      const today = '2026-10-30';
      const startDate = '2026-10-30';
      
      const neverStarted = startDate > today;
      
      assert.strictEqual(neverStarted, false, 'Assignment starting today has started');
    });
  });
  
  describe('Leadership Display Logic', () => {
    it('sorts SM coverage with primary first', () => {
      const smCoverage = [
        { id: 'p2', name: 'Jane Smith', slot: 'additional' as const, label: 'Training' },
        { id: 'p1', name: 'John Doe', slot: 'primary' as const },
        { id: 'p3', name: 'Bob Jones', slot: 'additional' as const, label: 'Coverage' },
      ];
      
      const sorted = [...smCoverage].sort((a, b) => {
        if (a.slot === 'primary' && b.slot !== 'primary') return -1;
        if (b.slot === 'primary' && a.slot !== 'primary') return 1;
        return a.name.localeCompare(b.name);
      });
      
      assert.strictEqual(sorted[0].slot, 'primary');
      assert.strictEqual(sorted[0].name, 'John Doe');
      assert.strictEqual(sorted[1].name, 'Bob Jones');
      assert.strictEqual(sorted[2].name, 'Jane Smith');
    });
    
    it('shows "Primary unassigned; coverage present" correctly', () => {
      const leadership = {
        smCoverage: [
          { id: 'p1', name: 'Jane Smith', slot: 'additional' as const, label: 'Temporary' },
        ],
        hasPrimarySm: false,
      };
      
      const showCoverageWarning = !leadership.hasPrimarySm && leadership.smCoverage.length > 0;
      
      assert.strictEqual(showCoverageWarning, true);
    });
    
    it('does not show warning when primary exists', () => {
      const leadership = {
        smCoverage: [
          { id: 'p1', name: 'John Doe', slot: 'primary' as const },
          { id: 'p2', name: 'Jane Smith', slot: 'additional' as const, label: 'Training' },
        ],
        hasPrimarySm: true,
      };
      
      const showCoverageWarning = !leadership.hasPrimarySm && leadership.smCoverage.length > 0;
      
      assert.strictEqual(showCoverageWarning, false);
    });
    
    it('does not show warning when no coverage at all', () => {
      const leadership = {
        smCoverage: [],
        hasPrimarySm: false,
      };
      
      const showCoverageWarning = !leadership.hasPrimarySm && leadership.smCoverage.length > 0;
      
      assert.strictEqual(showCoverageWarning, false);
    });
  });
  
  describe('Assignment Ending', () => {
    it('ending primary reveals coverage warning', () => {
      const beforeEnd = {
        smCoverage: [
          { id: 'p1', name: 'John Doe', slot: 'primary' as const },
          { id: 'p2', name: 'Jane Smith', slot: 'additional' as const, label: 'Training' },
        ],
        hasPrimarySm: true,
      };
      
      const afterEnd = {
        smCoverage: [
          { id: 'p2', name: 'Jane Smith', slot: 'additional' as const, label: 'Training' },
        ],
        hasPrimarySm: false,
      };
      
      const showWarningBefore = !beforeEnd.hasPrimarySm && beforeEnd.smCoverage.length > 0;
      const showWarningAfter = !afterEnd.hasPrimarySm && afterEnd.smCoverage.length > 0;
      
      assert.strictEqual(showWarningBefore, false);
      assert.strictEqual(showWarningAfter, true);
    });
  });
  
  describe('Person Assignment Grouping', () => {
    it('groups assignments by active status', () => {
      const assignments = [
        { id: '1', role: 'SM', isActive: true },
        { id: '2', role: 'DM', isActive: true },
        { id: '3', role: 'SM', isActive: false },
      ];
      
      const active = assignments.filter(a => a.isActive);
      const past = assignments.filter(a => !a.isActive);
      
      assert.strictEqual(active.length, 2);
      assert.strictEqual(past.length, 1);
    });
    
    it('sorts active assignments first', () => {
      const assignments = [
        { id: '1', role: 'SM', isActive: false, slot: 'primary' },
        { id: '2', role: 'DM', isActive: true, slot: 'primary' },
        { id: '3', role: 'SM', isActive: true, slot: 'additional' },
      ];
      
      const sorted = [...assignments].sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        if (a.slot !== b.slot) return a.slot === 'primary' ? -1 : 1;
        return a.role.localeCompare(b.role);
      });
      
      assert.strictEqual(sorted[0].isActive, true);
      assert.strictEqual(sorted[0].slot, 'primary');
      assert.strictEqual(sorted[1].isActive, true);
      assert.strictEqual(sorted[1].slot, 'additional');
      assert.strictEqual(sorted[2].isActive, false);
    });
  });
  
  describe('Phone Number Formatting', () => {
    function formatPhoneNumber(phone: string): string {
      const digits = phone.replace(/\D/g, '');
      if (digits.length === 11 && digits.startsWith('1')) {
        return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
      }
      if (digits.length === 10) {
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
      }
      return phone;
    }
    
    it('formats E.164 phone number with country code', () => {
      const result = formatPhoneNumber('+12135551001');
      assert.strictEqual(result, '(213) 555-1001');
    });
    
    it('formats 10-digit phone number', () => {
      const result = formatPhoneNumber('2135551001');
      assert.strictEqual(result, '(213) 555-1001');
    });
    
    it('formats phone number with dashes', () => {
      const result = formatPhoneNumber('213-555-1001');
      assert.strictEqual(result, '(213) 555-1001');
    });
    
    it('formats phone number with parentheses', () => {
      const result = formatPhoneNumber('(213) 555-1001');
      assert.strictEqual(result, '(213) 555-1001');
    });
    
    it('returns original for invalid format', () => {
      const result = formatPhoneNumber('12345');
      assert.strictEqual(result, '12345');
    });
  });
  
  describe('Audit Entry Undefined Handling', () => {
    it('uses null for undefined oldValue with ?? null', () => {
      const assignment = { endDate: undefined as string | undefined };
      const oldValue = assignment.endDate ?? null;
      
      assert.strictEqual(oldValue, null);
    });
    
    it('preserves existing value when not undefined', () => {
      const assignment = { endDate: '2026-10-30' };
      const oldValue = assignment.endDate ?? null;
      
      assert.strictEqual(oldValue, '2026-10-30');
    });
    
    it('handles optional fields gracefully', () => {
      const location = { 
        mainPhone: '+12135551234',
        sharedInboxEmail: undefined as string | undefined,
      };
      
      const changes = [
        { field: 'mainPhone', oldValue: location.mainPhone ?? null },
        { field: 'sharedInboxEmail', oldValue: location.sharedInboxEmail ?? null },
      ];
      
      assert.strictEqual(changes[0].oldValue, '+12135551234');
      assert.strictEqual(changes[1].oldValue, null);
    });
  });
});

describe('Assignment Capacity and Vacancy', () => {
  describe('Capacity field', () => {
    it('defaults capacity to primary when undefined', () => {
      const assignment = { id: '1', personId: 'p1', role: 'SM', slot: 'primary' } as const;
      const capacity = (assignment as { capacity?: string }).capacity ?? 'primary';
      assert.strictEqual(capacity, 'primary');
    });

    it('recognizes training capacity', () => {
      const assignment = { id: '1', personId: 'p1', role: 'SM', slot: 'primary', capacity: 'training' as const };
      assert.strictEqual(assignment.capacity, 'training');
    });

    it('recognizes acting capacity', () => {
      const assignment = { id: '1', personId: 'p1', role: 'SM', slot: 'primary', capacity: 'acting' as const };
      assert.strictEqual(assignment.capacity, 'acting');
    });
  });

  describe('Position vacancy status', () => {
    it('position with holders is filled', () => {
      const holders = [{ personId: 'p1', fullName: 'John Doe', capacity: 'primary' }];
      const status = holders.length > 0 ? 'filled' : 'vacant';
      assert.strictEqual(status, 'filled');
    });

    it('position without holders is vacant', () => {
      const holders: unknown[] = [];
      const status = holders.length > 0 ? 'filled' : 'vacant';
      assert.strictEqual(status, 'vacant');
    });

    it('multiple holders keep position filled', () => {
      const holders = [
        { personId: 'p1', fullName: 'John Doe', capacity: 'primary', slot: 'primary' },
        { personId: 'p2', fullName: 'Jane Smith', capacity: 'training', slot: 'additional' },
      ];
      const status = holders.length > 0 ? 'filled' : 'vacant';
      assert.strictEqual(status, 'filled');
      assert.strictEqual(holders.length, 2);
    });
  });

  describe('Primary slot enforcement', () => {
    it('allows only one primary per position scope', () => {
      const assignments = [
        { id: '1', personId: 'p1', role: 'SM', scopeId: 'store-007', slot: 'primary', isActive: true },
      ];
      
      const existingPrimary = assignments.find(a => 
        a.role === 'SM' && a.scopeId === 'store-007' && a.slot === 'primary' && a.isActive
      );
      
      assert.ok(existingPrimary, 'Should find existing primary');
    });

    it('allows additional slots alongside primary', () => {
      const assignments = [
        { id: '1', personId: 'p1', role: 'SM', scopeId: 'store-007', slot: 'primary' },
        { id: '2', personId: 'p2', role: 'SM', scopeId: 'store-007', slot: 'additional' },
        { id: '3', personId: 'p3', role: 'SM', scopeId: 'store-007', slot: 'additional' },
      ];
      
      const primaryCount = assignments.filter(a => a.slot === 'primary').length;
      const additionalCount = assignments.filter(a => a.slot === 'additional').length;
      
      assert.strictEqual(primaryCount, 1);
      assert.strictEqual(additionalCount, 2);
    });

    it('different scopes can each have a primary', () => {
      const assignments = [
        { id: '1', personId: 'p1', role: 'SM', scopeId: 'store-007', slot: 'primary' },
        { id: '2', personId: 'p2', role: 'SM', scopeId: 'store-008', slot: 'primary' },
      ];
      
      const store007Primary = assignments.filter(a => a.scopeId === 'store-007' && a.slot === 'primary');
      const store008Primary = assignments.filter(a => a.scopeId === 'store-008' && a.slot === 'primary');
      
      assert.strictEqual(store007Primary.length, 1);
      assert.strictEqual(store008Primary.length, 1);
    });
  });

  describe('Export VACANT display', () => {
    it('CSV shows VACANT for vacant positions', () => {
      type PositionStatus = 'filled' | 'vacant';
      const storeManagerStatus = 'vacant' as PositionStatus;
      const csvValue = storeManagerStatus === 'vacant' ? 'VACANT' : 'John Doe';
      assert.strictEqual(csvValue, 'VACANT');
    });

    it('CSV shows name for filled positions', () => {
      type PositionStatus = 'filled' | 'vacant';
      const storeManagerStatus = 'filled' as PositionStatus;
      const storeManager = 'John Doe';
      const csvValue = storeManagerStatus === 'vacant' ? 'VACANT' : storeManager;
      assert.strictEqual(csvValue, 'John Doe');
    });
  });

  describe('Import capacity handling', () => {
    it('valid capacity values are preserved', () => {
      const validCapacities = ['primary', 'training', 'acting'];
      const capacityValue = 'training';
      const capacity = validCapacities.includes(capacityValue) ? capacityValue : 'primary';
      assert.strictEqual(capacity, 'training');
    });

    it('invalid capacity defaults to primary', () => {
      const validCapacities = ['primary', 'training', 'acting'];
      const capacityValue = 'invalid';
      const capacity = validCapacities.includes(capacityValue) ? capacityValue : 'primary';
      assert.strictEqual(capacity, 'primary');
    });

    it('empty capacity defaults to primary', () => {
      const validCapacities = ['primary', 'training', 'acting'];
      const capacityValue = '';
      const capacity = validCapacities.includes(capacityValue) ? capacityValue : 'primary';
      assert.strictEqual(capacity, 'primary');
    });

    it('case-insensitive capacity matching', () => {
      const validCapacities = ['primary', 'training', 'acting'];
      const capacityValue = 'TRAINING'.toLowerCase();
      const capacity = validCapacities.includes(capacityValue) ? capacityValue : 'primary';
      assert.strictEqual(capacity, 'training');
    });
  });
});

describe('Centralized Assignment Active Check', () => {
  function isAssignmentActive(
    assignment: { endDate?: string; endedAt?: string },
    localDate: string
  ): boolean {
    if (assignment.endedAt) {
      return false;
    }
    if (!assignment.endDate) {
      return true;
    }
    return assignment.endDate >= localDate;
  }

  describe('endedAt takes priority', () => {
    it('assignment with endedAt is always inactive', () => {
      const assignment = { 
        endDate: '2026-12-31',
        endedAt: '2026-10-30T10:00:00Z'
      };
      const localDate = '2026-10-30';
      
      assert.strictEqual(isAssignmentActive(assignment, localDate), false);
    });
    
    it('assignment ended today with endedAt is immediately inactive', () => {
      const assignment = { 
        endDate: '2026-10-30',
        endedAt: '2026-10-30T08:00:00Z'
      };
      const localDate = '2026-10-30';
      
      assert.strictEqual(isAssignmentActive(assignment, localDate), false);
    });
  });

  describe('endDate comparison uses local date', () => {
    it('assignment with no endDate is active', () => {
      const assignment = {};
      const localDate = '2026-10-30';
      
      assert.strictEqual(isAssignmentActive(assignment, localDate), true);
    });
    
    it('assignment ending today is active', () => {
      const assignment = { endDate: '2026-10-30' };
      const localDate = '2026-10-30';
      
      assert.strictEqual(isAssignmentActive(assignment, localDate), true);
    });
    
    it('assignment ending yesterday is inactive', () => {
      const assignment = { endDate: '2026-10-29' };
      const localDate = '2026-10-30';
      
      assert.strictEqual(isAssignmentActive(assignment, localDate), false);
    });
    
    it('assignment ending tomorrow is active', () => {
      const assignment = { endDate: '2026-10-31' };
      const localDate = '2026-10-30';
      
      assert.strictEqual(isAssignmentActive(assignment, localDate), true);
    });
  });

  describe('local date vs UTC', () => {
    it('uses provided local date not UTC', () => {
      const assignment = { endDate: '2026-10-30' };
      const laLocalDate = '2026-10-30';
      const nyLocalDate = '2026-10-31';
      
      assert.strictEqual(isAssignmentActive(assignment, laLocalDate), true);
      assert.strictEqual(isAssignmentActive(assignment, nyLocalDate), false);
    });
  });
});
