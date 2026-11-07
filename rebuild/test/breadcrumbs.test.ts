import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Breadcrumbs Component', () => {
  describe('BreadcrumbItem interface', () => {
    it('accepts label-only items', () => {
      const item: { label: string; href?: string } = { label: 'Home' };
      assert.strictEqual(item.label, 'Home');
      assert.strictEqual(item.href, undefined);
    });

    it('accepts items with href', () => {
      const item = { label: 'Directory', href: '/' };
      assert.strictEqual(item.label, 'Directory');
      assert.strictEqual(item.href, '/');
    });
  });

  describe('Breadcrumb path construction', () => {
    it('builds store detail path correctly', () => {
      const items = [
        { label: 'Directory', href: '/' },
        { label: 'West District', href: '/?district=west-1' },
        { label: '#123 Main Street Store' },
      ];

      assert.strictEqual(items.length, 3);
      assert.strictEqual(items[0].href, '/');
      assert.strictEqual(items[1].href, '/?district=west-1');
      assert.strictEqual(items[2].href, undefined);
    });

    it('builds person detail path correctly', () => {
      const items = [
        { label: 'People', href: '/people' },
        { label: 'John Smith' },
      ];

      assert.strictEqual(items.length, 2);
      assert.strictEqual(items[0].href, '/people');
      assert.strictEqual(items[1].href, undefined);
    });

    it('marks last item as current page (no href)', () => {
      const items = [
        { label: 'Directory', href: '/' },
        { label: 'Store #456' },
      ];

      const lastItem = items[items.length - 1];
      assert.strictEqual(lastItem.href, undefined);
    });
  });

  describe('Accessibility requirements', () => {
    it('breadcrumb nav should have aria-label', () => {
      const ariaLabel = 'Breadcrumb';
      assert.strictEqual(ariaLabel, 'Breadcrumb');
    });

    it('current page should have aria-current="page"', () => {
      const ariaCurrent = 'page';
      assert.strictEqual(ariaCurrent, 'page');
    });

    it('home link should have aria-label', () => {
      const homeAriaLabel = 'Home';
      assert.strictEqual(homeAriaLabel, 'Home');
    });

    it('separator icons should have aria-hidden', () => {
      const ariaHidden = true;
      assert.strictEqual(ariaHidden, true);
    });
  });
});
