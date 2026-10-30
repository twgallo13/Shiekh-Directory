/**
 * Auth configuration for domain restrictions and admin bootstrapping
 * 
 * Environment variables:
 * - ALLOWED_DOMAINS: Comma-separated list of allowed email domains for Google sign-in
 *                    Default: shiekhshoes.org
 * - ADMIN_EMAILS: Comma-separated list of emails that should be bootstrapped as Admin
 *                 Example: theo@shiekhshoes.org,admin@shiekhshoes.org
 */

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
