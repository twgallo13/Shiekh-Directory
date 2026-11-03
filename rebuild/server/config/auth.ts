/**
 * Auth configuration for domain restrictions and admin bootstrapping
 * 
 * Environment variables:
 * - ALLOWED_DOMAINS: Comma-separated list of allowed email domains for Google sign-in
 *                    Default: shiekhshoes.org
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
      enabled: data.enabled !== false,
    };
  } catch {
    return { restrictedUntil: null, enabled: false };
  }
}

export async function isSignInRestricted(db: Firestore): Promise<boolean> {
  const restriction = await getSignInRestriction(db);
  if (!restriction.enabled || !restriction.restrictedUntil) {
    return false;
  }
  const restrictedUntil = new Date(restriction.restrictedUntil);
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
