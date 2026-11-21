/**
 * Auth configuration for domain restrictions and admin bootstrapping
 * 
 * Environment variables:
 * - ALLOWED_DOMAINS: Comma-separated domains for password, email-link, and invitation
 *                    checks (isEmailDomainAllowed). Default: shiekhshoes.org.
 *                    shiekhshoes.com is not in this list. Store mailboxes
 *                    (store{n}@shiekhshoes.com) are a separate store-session flow.
 *                    Existing user records pass regardless of domain.
 * - Google Workspace sign-in is NOT this list. Only the exact domain
 *   shiekhshoes.org is allowed, and only when creating or linking a record
 *   or when choosing domain_not_allowed for an unregistered Google token.
 * - ADMIN_EMAILS: Comma-separated list of emails that should be bootstrapped as Admin
 *                 Example: theo@shiekhshoes.org,admin@shiekhshoes.org
 * 
 * Soft-launch mode (r31):
 * - When signIn.restrictedUntil is in the future, only users on the signInAllowList
 *   (or in ADMIN_EMAILS) can sign in. New @shiekhshoes.org users are NOT auto-provisioned
 *   as Viewer during this period.
 */

import type { Firestore } from 'firebase-admin/firestore';

const DEFAULT_ALLOWED_DOMAINS = ['shiekhshoes.org'];
const DEFAULT_ADMIN_EMAILS: string[] = [];

function parseCommaSeparated(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

export function getAllowedDomains(): string[] {
  const envDomains = parseCommaSeparated(process.env.ALLOWED_DOMAINS);
  return envDomains.length > 0 ? envDomains : DEFAULT_ALLOWED_DOMAINS;
}

export function getAdminEmails(): string[] {
  const envAdmins = parseCommaSeparated(process.env.ADMIN_EMAILS);
  return envAdmins.length > 0 ? envAdmins : DEFAULT_ADMIN_EMAILS;
}

export function isEmailDomainAllowed(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  
  const allowedDomains = getAllowedDomains();
  return allowedDomains.includes(domain);
}

/** Exact Google Workspace domain. Not configurable via ALLOWED_DOMAINS. */
export const GOOGLE_WORKSPACE_DOMAIN = 'shiekhshoes.org';

/**
 * Google sign-in (sign_in_provider google.com) may create or link a user only
 * when the email's domain is exactly shiekhshoes.org. Comparison is lowercase
 * and exact (same split as isEmailDomainAllowed): subdomains and lookalikes fail.
 * shiekhshoes.com is a store-mailbox / password domain, not a Google Workspace domain.
 */
export function isGoogleSignInDomainAllowed(email: string): boolean {
  const domain = getEmailDomain(email.trim());
  return domain === GOOGLE_WORKSPACE_DOMAIN;
}

/**
 * A users/{uid} record is registered only when status is missing, 'active', or 'pending'.
 * Every other value is blocked, including 'disabled', 'suspended', 'inactive',
 * 'Disabled', 'deactivated', and ''.
 */
export function isRegisteredUserStatus(status: unknown): boolean {
  return status === undefined || status === 'active' || status === 'pending';
}

export function isAdminEmail(email: string): boolean {
  const adminEmails = getAdminEmails();
  return adminEmails.includes(email.toLowerCase());
}

export function getEmailDomain(email: string): string | null {
  return email.split('@')[1]?.toLowerCase() || null;
}

export interface SignInRestriction {
  restrictedUntil: string | null;
  enabled: boolean;
}

export async function getSignInRestriction(db: Firestore): Promise<SignInRestriction> {
  try {
    const doc = await db.collection('settings').doc('signIn').get();
    if (!doc.exists) {
      return { restrictedUntil: null, enabled: false };
    }
    const data = doc.data()!;
    return {
      restrictedUntil: data.restrictedUntil || null,
      // r32 fix #3: Only enabled === true turns restriction on (default to false)
      enabled: data.enabled === true,
    };
  } catch {
    return { restrictedUntil: null, enabled: false };
  }
}

export async function isSignInRestricted(db: Firestore): Promise<boolean> {
  const restriction = await getSignInRestriction(db);
  if (!restriction.enabled) {
    return false;
  }
  // D4 (2026-11-04): enabled with no end date = permanent approved-list mode.
  if (!restriction.restrictedUntil) {
    return true;
  }
  const restrictedUntil = new Date(restriction.restrictedUntil);
  if (isNaN(restrictedUntil.getTime())) return true;
  return new Date() < restrictedUntil;
}

export async function isEmailOnAllowList(db: Firestore, email: string): Promise<boolean> {
  const normalizedEmail = email.toLowerCase();
  
  if (isAdminEmail(normalizedEmail)) {
    return true;
  }
  
  const allowDoc = await db.collection('signInAllowList').doc(normalizedEmail).get();
  return allowDoc.exists;
}

export interface AllowListEntry {
  email: string;
  addedBy: string;
  addedByEmail: string;
  addedAt: string;
  notes?: string;
}
