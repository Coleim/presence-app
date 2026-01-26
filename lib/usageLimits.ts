/**
 * Usage Limits for Free Tier
 * These should match the database constraints in add_rate_limits.sql
 */

export const USAGE_LIMITS = {
  CLUBS_PER_USER: 1,
  PARTICIPANTS_PER_CLUB: 30,
  SESSIONS_PER_CLUB: 10,
  CLUB_MEMBERSHIPS_PER_USER: 5,
} as const;

export interface UsageStats {
  clubsOwned: number;
  clubMemberships: number;
}

export interface ClubUsageStats {
  participants: number;
  sessions: number;
}

/**
 * Check if user has reached the club creation limit
 */
export function hasReachedClubLimit(clubsOwned: number): boolean {
  return clubsOwned >= USAGE_LIMITS.CLUBS_PER_USER;
}

/**
 * Check if club has reached participants limit
 */
export function hasReachedParticipantsLimit(count: number): boolean {
  return count >= USAGE_LIMITS.PARTICIPANTS_PER_CLUB;
}

/**
 * Check if club has reached sessions limit
 */
export function hasReachedSessionsLimit(count: number): boolean {
  return count >= USAGE_LIMITS.SESSIONS_PER_CLUB;
}

/**
 * Get user-friendly message about limits
 */
export function getLimitMessage(type: 'club' | 'participants' | 'sessions'): string {
  const messages = {
    club: `Vous avez atteint la limite gratuite de ${USAGE_LIMITS.CLUBS_PER_USER} club.`,
    participants: `Vous avez atteint la limite gratuite de ${USAGE_LIMITS.PARTICIPANTS_PER_CLUB} participants par club.`,
    sessions: `Vous avez atteint la limite gratuite de ${USAGE_LIMITS.SESSIONS_PER_CLUB} créneaux par club.`,
  };
  return messages[type];
}

/**
 * Get upgrade call-to-action message
 */
export function getUpgradeMessage(): string {
  return 'Passez à la version Premium pour des clubs illimités !';
}

/**
 * Calculate percentage used for progress bars
 */
export function getUsagePercentage(current: number, limit: number): number {
  return Math.min((current / limit) * 100, 100);
}

/**
 * Determine if we should show a warning (>= 80%)
 */
export function shouldShowWarning(current: number, limit: number): boolean {
  return current >= limit * 0.8;
}
