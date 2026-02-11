import { supabase, clearStoredSession } from './supabase';
import { Session, AuthApiError } from '@supabase/supabase-js';

/**
 * Centralized auth session manager to prevent lock contention
 * Caches the session in memory and refreshes periodically
 */
class AuthManager {
  private cachedSession: Session | null = null;
  private lastFetch = 0;
  private readonly CACHE_DURATION = 5000; // 5 seconds cache
  private fetchPromise: Promise<Session | null> | null = null;

  /**
   * Get current session with caching to reduce lock contention
   */
  async getSession(): Promise<Session | null> {
    const now = Date.now();
    
    // Return cached session if still valid
    if (this.cachedSession && (now - this.lastFetch) < this.CACHE_DURATION) {
      return this.cachedSession;
    }

    // If a fetch is already in progress, wait for it
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    // Fetch new session
    this.fetchPromise = this._fetchSession();
    const session = await this.fetchPromise;
    this.fetchPromise = null;
    
    return session;
  }

  private async _fetchSession(): Promise<Session | null> {
    try {
      const { data, error } = await supabase.auth.getSession();
      
      if (error) {
        // Handle invalid refresh token error - sign out and clear invalid session
        if (this.isRefreshTokenError(error)) {
          console.log('[AuthManager] Invalid refresh token detected, clearing session');
          await this.clearInvalidSession();
          return null;
        }
        return null;
      }
      
      this.cachedSession = data.session;
      this.lastFetch = Date.now();
      return data.session;
    } catch (error: any) {
      // Also catch errors thrown as exceptions
      if (this.isRefreshTokenError(error)) {
        console.log('[AuthManager] Invalid refresh token exception, clearing session');
        await this.clearInvalidSession();
        return null;
      }
      return null;
    }
  }

  /**
   * Check if error is related to invalid refresh token
   */
  private isRefreshTokenError(error: any): boolean {
    if (!error) return false;
    
    const message = error?.message || '';
    const code = error?.code || '';
    
    return (
      error instanceof AuthApiError ||
      message.includes('Refresh Token') ||
      message.includes('refresh_token') ||
      message.includes('Invalid Refresh Token') ||
      code === 'refresh_token_not_found'
    );
  }

  /**
   * Clear invalid session data when refresh token is invalid
   */
  private async clearInvalidSession(): Promise<void> {
    try {
      // Clear cached session
      this.invalidateCache();
      
      // Clear Supabase's stored auth token directly from AsyncStorage
      // This prevents Supabase from trying to use the invalid token again
      await clearStoredSession();
      
      // Sign out to clear any remaining tokens
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      console.log('[AuthManager] Error clearing invalid session:', e);
      // Still try to remove the token even if signOut fails
      try {
        await clearStoredSession();
      } catch (e2) {
        // Silent fail
      }
    }
  }

  /**
   * Invalidate cached session (call after sign in/out)
   */
  invalidateCache() {
    this.cachedSession = null;
    this.lastFetch = 0;
  }

  /**
   * Check if user is authenticated (cached)
   */
  async isAuthenticated(): Promise<boolean> {
    const session = await this.getSession();
    return !!session;
  }

  /**
   * Get user ID (cached)
   */
  async getUserId(): Promise<string | null> {
    const session = await this.getSession();
    return session?.user?.id || null;
  }
}

export const authManager = new AuthManager();
