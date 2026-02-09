import { dataService } from './dataService';
import { UsageStats, ClubUsageStats } from './usageLimits';

/**
 * Service to fetch usage statistics from local storage or database
 * Works with local-first architecture - no Supabase dependency
 */

export const usageService = {
  /**
   * Get usage stats for the current user
   * If userId is null (not logged in), we allow unlimited usage for local-only mode
   */
  async getUserUsageStats(userId: string | null): Promise<UsageStats> {
    try {
      // If not logged in, don't enforce limits (local-only mode)
      if (!userId) {
        return {
          clubsOwned: 0, // No limits for local-only users
          clubMemberships: 0,
        };
      }

      // Get all clubs from local storage (syncs with cloud in background)
      const clubs = await dataService.getClubs();
      
      // Count clubs owned by this user
      const clubsOwned = clubs.filter(club => club.owner_id === userId).length;

      // For club memberships, we'd need to query club_members table
      // Since this is primarily for owner limits, we'll return 0 for now
      // You can extend this if you implement club_members in dataService
      const clubMemberships = 0;

      return {
        clubsOwned,
        clubMemberships,
      };
    } catch (error) {
      return {
        clubsOwned: 0,
        clubMemberships: 0,
      };
    }
  },

  /**
   * Get usage stats for a specific club
   */
  async getClubUsageStats(clubId: string): Promise<ClubUsageStats> {
    try {
      // Get participants and sessions from local storage
      const [participants, sessions] = await Promise.all([
        dataService.getParticipants(clubId),
        dataService.getSessions(clubId),
      ]);

      return {
        participants: participants.length,
        sessions: sessions.length,
      };
    } catch (error) {
      return {
        participants: 0,
        sessions: 0,
      };
    }
  },
};
