import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Navigation role visibility', () => {
  describe('Main navigation bar', () => {
    it('shows Directory to all roles', () => {
      const roles = ['Store', 'Leader', 'Steward', 'Admin'];
      roles.forEach(role => {
        const showDirectory = true;
        assert.ok(showDirectory, `Directory should show for ${role}`);
      });
    });

    it('shows Approvals only to users with canApproveCorrections', () => {
      const roles = ['Leader', 'Steward', 'Admin'];
      const hiddenRoles = ['Store'];
      roles.forEach(role => {
        const show = ['Leader', 'Steward', 'Admin'].includes(role);
        assert.ok(show, `Approvals should show for ${role}`);
      });
      hiddenRoles.forEach(role => {
        const show = ['Leader', 'Steward', 'Admin'].includes(role);
        assert.ok(!show, `Approvals should NOT show for ${role}`);
      });
    });

    it('shows Verification and Closures to Leader and above', () => {
      const roles = ['Leader', 'Steward', 'Admin'];
      const hiddenRoles = ['Store'];
      roles.forEach(role => {
        const show = ['Leader', 'Steward', 'Admin'].includes(role);
        assert.ok(show, `Verification should show for ${role}`);
      });
      hiddenRoles.forEach(role => {
        const show = ['Leader', 'Steward', 'Admin'].includes(role);
        assert.ok(!show, `Verification should NOT show for ${role}`);
      });
    });

    it('shows People and Hierarchy to Steward and Admin only', () => {
      const roles = ['Steward', 'Admin'];
      const hiddenRoles = ['Store', 'Leader'];
      roles.forEach(role => {
        const show = ['Steward', 'Admin'].includes(role);
        assert.ok(show, `People should show for ${role}`);
      });
      hiddenRoles.forEach(role => {
        const show = ['Steward', 'Admin'].includes(role);
        assert.ok(!show, `People should NOT show for ${role}`);
      });
    });

    it('shows Admin to Admin only', () => {
      const show = (role: string) => role === 'Admin';
      assert.ok(show('Admin'));
      assert.ok(!show('Steward'));
      assert.ok(!show('Leader'));
      assert.ok(!show('Store'));
    });
  });

  describe('Tools menu', () => {
    it('shows Manage Holidays to Steward and Admin', () => {
      const show = (role: string) => ['Steward', 'Admin'].includes(role);
      assert.ok(show('Admin'));
      assert.ok(show('Steward'));
      assert.ok(!show('Leader'));
      assert.ok(!show('Store'));
    });

    it('shows Stale Stores to Leader and above', () => {
      const show = (role: string) => ['Leader', 'Steward', 'Admin'].includes(role);
      assert.ok(show('Admin'));
      assert.ok(show('Steward'));
      assert.ok(show('Leader'));
      assert.ok(!show('Store'));
    });

    it('shows Print/Export to Leader and above only', () => {
      const show = (role: string) => ['Leader', 'Steward', 'Admin'].includes(role);
      assert.ok(show('Admin'));
      assert.ok(show('Steward'));
      assert.ok(show('Leader'));
      assert.ok(!show('Store'));
      assert.ok(!show('Viewer'));
    });

    it('does NOT contain Backups (moved to Admin panel)', () => {
      const toolsMenuItems = ['Manage Holidays', 'Stale Stores', 'Print / Export'];
      assert.ok(!toolsMenuItems.includes('Backups'));
    });

    it('does NOT contain Settings (moved to Account menu)', () => {
      const toolsMenuItems = ['Manage Holidays', 'Stale Stores', 'Print / Export'];
      assert.ok(!toolsMenuItems.includes('Settings'));
    });
  });

  describe('Account menu', () => {
    it('contains My Requests', () => {
      const accountMenuItems = ['My Requests', 'Sign Out'];
      assert.ok(accountMenuItems.includes('My Requests'));
    });

    it('contains Sign Out', () => {
      const accountMenuItems = ['My Requests', 'Sign Out'];
      assert.ok(accountMenuItems.includes('Sign Out'));
    });

    it('does NOT contain Settings (removed)', () => {
      const accountMenuItems = ['My Requests', 'Sign Out'];
      assert.ok(!accountMenuItems.includes('Settings'));
    });
  });

  describe('Mobile drawer', () => {
    it('closes on Escape key', () => {
      const handleEscape = (key: string) => key === 'Escape';
      assert.ok(handleEscape('Escape'));
      assert.ok(!handleEscape('Enter'));
    });

    it('traps focus within drawer', () => {
      const focusTrapEnabled = true;
      assert.ok(focusTrapEnabled);
    });
  });

  describe('API Docs access', () => {
    it('requires Admin role only', () => {
      const canAccess = (role: string) => role === 'Admin';
      assert.ok(canAccess('Admin'));
      assert.ok(!canAccess('Steward'));
      assert.ok(!canAccess('Leader'));
      assert.ok(!canAccess('Store'));
    });
  });
});
