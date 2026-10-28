import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beginOrganizationRoster, buildOrganizationRosterIntent, reapplyOrganizationRosters } from '../src/lib/organizationRosterDraft';
import { OrganizationRosterFields } from '../src/components/people/OrganizationResponsibilities';
import { organizationCatalogFixture } from './helpers/organizationWorkflowFixture';

test('onboarding an eligible DM preserves incumbent Primary and adds Additional without workplace/email/account data', () => {
  const c = organizationCatalogFixture(), before = structuredClone(c), draft = beginOrganizationRoster(c.units[1], c, 'new-hire');
  assert.deepEqual(draft.members, ['incumbent', 'new-hire']); assert.equal(draft.primary, 'incumbent');
  const units = buildOrganizationRosterIntent(c, [draft], '');
  assert.equal(units[0].primaryPersonId, 'incumbent'); assert.deepEqual(c, before);
  assert.doesNotMatch(JSON.stringify(units), /workplace|email|role|account/);
});

test('first manager in a Region requires explicit Primary and setup acknowledgment; Region and District IDs never alias', () => {
  const c = organizationCatalogFixture(), d = beginOrganizationRoster(c.units[0], c, 'new-hire');
  assert.equal(d.primary, null); assert.equal(d.activationReviewed, false);
  assert.throws(() => buildOrganizationRosterIntent(c, [d], 'Approved setup'), /Choose a Primary/);
  d.primary = 'new-hire';
  assert.throws(() => buildOrganizationRosterIntent(c, [d], 'Approved setup'), /Acknowledge/);
  d.activationReviewed = true;
  const district = beginOrganizationRoster(c.units[1], c, 'new-hire');
  const units = buildOrganizationRosterIntent(c, [d, district], 'Approved setup');
  assert.deepEqual(units.map(u => [u.unitType, u.unitId]), [['region', '01'], ['district', '01']]);
});

test('removing a Primary never promotes an Additional implicitly; removal of all confirms explicit vacancy', () => {
  const c = organizationCatalogFixture(), d = beginOrganizationRoster(c.units[1], c, 'new-hire');
  d.members = ['new-hire']; d.primary = null;
  assert.throws(() => buildOrganizationRosterIntent(c, [d], 'Reviewed ending'), /Primary Manager/);
  d.primary = 'new-hire'; assert.equal(buildOrganizationRosterIntent(c, [d], 'Reviewed handover')[0].primaryPersonId, 'new-hire');
  d.members = []; d.primary = null; assert.equal(buildOrganizationRosterIntent(c, [d], 'Reviewed vacancy')[0].primaryPersonId, null);
});

test('retained unresolved manager may stay, but cannot be newly promoted or assigned', () => {
  const c = organizationCatalogFixture(), d = beginOrganizationRoster(c.units[1], c, 'new-hire');
  c.people[0].eligibleUnitTypes = []; c.units[1].members[0].eligible = false;
  assert.doesNotThrow(() => buildOrganizationRosterIntent(c, [d], ''));
  c.people[1].eligibleUnitTypes = []; d.primary = 'new-hire';
  assert.throws(() => buildOrganizationRosterIntent(c, [d], 'Promotion review'), /matching linked position/);
});

test('no-op, duplicate members/units, missing units and diagnosed hierarchy are not silently submitted', () => {
  const c = organizationCatalogFixture(), d = beginOrganizationRoster(c.units[1], c);
  assert.throws(() => buildOrganizationRosterIntent(c, [d], ''), /Add or remove/);
  d.members.push('new-hire'); assert.throws(() => buildOrganizationRosterIntent(c, [d, d], ''), /five valid/);
  d.members.push('new-hire'); assert.throws(() => buildOrganizationRosterIntent(c, [d], ''), /unique managers/);
  d.members.pop(); c.units[1].issues.push('Hierarchy conflict'); assert.throws(() => buildOrganizationRosterIntent(c, [d], ''), /organization issues/);
});

test('explicit draft reapplication preserves concurrently added managers and fresh Primary without inferring a replacement', () => {
  const old = organizationCatalogFixture(), d = beginOrganizationRoster(old.units[1], old, 'new-hire'), fresh = structuredClone(old);
  fresh.people.push({ id: 'other', fullName: 'Another Manager', eligibleUnitTypes: ['district'] });
  fresh.units[1].members.push({ personId: 'other', fullName: 'Another Manager', isPrimary: true, eligible: true, issues: [] });
  fresh.units[1].members[0].isPrimary = false; fresh.units[1].primaryPersonId = 'other'; fresh.units[1].version++;
  const result = reapplyOrganizationRosters(old, fresh, [d])[0];
  assert.deepEqual(result.members, ['incumbent', 'other', 'new-hire']); assert.equal(result.primary, 'other');
  d.members = ['new-hire']; d.primary = null;
  assert.equal(reapplyOrganizationRosters(old, fresh, [d])[0].primary, null);
});

test('roster fields visibly distinguish Primary and Additional; first vacant assignment has no checked Primary radio', () => {
  const c = organizationCatalogFixture(), d = beginOrganizationRoster(c.units[1], c, 'new-hire');
  const html = renderToStaticMarkup(React.createElement(OrganizationRosterFields, { unit: c.units[1], catalog: c, draft: d, onChange() {} }));
  assert.match(html, /Additional Manager/); assert.match(html, /Current Manager as Primary Manager for Central/);
  const region = beginOrganizationRoster(c.units[0], c, 'new-hire');
  const vacant = renderToStaticMarkup(React.createElement(OrganizationRosterFields, { unit: c.units[0], catalog: c, draft: region, onChange() {} }));
  assert.match(vacant, /Choose a Primary Manager/);
  assert.doesNotMatch(vacant, /type="radio"[^>]*checked/);
});
