import { supabase } from './supabase';
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
        if (error instanceof AuthApiError && 
            (error.message.includes('Refresh Token') || 
             error.message.includes('refresh_token') ||
             error.code === 'refresh_token_not_found')) {
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
      if (error?.message?.includes('Refresh Token') || 
          error?.message?.includes('refresh_token')) {
        await this.clearInvalidSession();
        return null;
      }
      return null;
    }
  }

  /**
   * Clear invalid session data when refresh token is invalid
   */
  private async clearInvalidSession(): Promise<void> {
    try {
      // Clear cached session
      this.invalidateCache();
      // Sign out to clear stored tokens
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      // Silent fail
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
