export const EMAIL_AUDIENCE_ORDER = ['stores', 'leaders', 'admins'] as const;
export type EmailAudience = typeof EMAIL_AUDIENCE_ORDER[number];
