import { LEADERBOARD_LIMIT } from '../../src/domain/totals.js';
import { parseAllowList } from '../../src/domain/membership.js';

/**
 * @param {Record<string, string|undefined>} env
 */
export function loadConfig(env) {
  return {
    waClientId: env.WA_CLIENT_ID || '',
    waClientSecret: env.WA_CLIENT_SECRET || '',
    waAccountId: env.WA_ACCOUNT_ID || '',
    waApiKey: env.WA_API_KEY || '',
    waSiteUrl: (env.WA_SITE_URL || '').replace(/\/$/, ''),
    sessionSecret: env.SESSION_SECRET || '',
    frontendOrigin: (env.FRONTEND_ORIGIN || '').replace(/\/$/, ''),
    allowedGroupIds: parseAllowList(env.ALLOWED_GROUP_IDS),
    allowedGroupNames: parseAllowList(env.ALLOWED_GROUP_NAMES),
    adminGroupIds: parseAllowList(env.ADMIN_GROUP_IDS),
    adminGroupNames: parseAllowList(env.ADMIN_GROUP_NAMES),
    leaderboardLimit: Number(env.LEADERBOARD_LIMIT) || LEADERBOARD_LIMIT,
    memberRefreshTtlMs:
      Math.max(60, Number(env.MEMBER_REFRESH_TTL_SEC) || 900) * 1000,
  };
}
