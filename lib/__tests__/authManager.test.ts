import { authManager } from '../authManager';
import { supabase } from '../supabase';

describe('AuthManager Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Invalidate authManager cache before each test
    authManager.invalidateCache();
  });

  describe('Authentication State', () => {
    it('should check if user is authenticated', async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValue({
        data: { 
          session: { 
            user: { id: 'user-123', email: 'test@example.com' } 
          } 
        },
        error: null,
      });

      const isAuth = await authManager.isAuthenticated();

      expect(isAuth).toBe(true);
    });

    it('should return false when user is not authenticated', async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const isAuth = await authManager.isAuthenticated();

      expect(isAuth).toBe(false);
    });

    it('should get current user ID', async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValue({
        data: { 
          session: { 
            user: { id: 'user-123' } 
          } 
        },
        error: null,
      });

      const userId = await authManager.getUserId();

      expect(userId).toBe('user-123');
    });

    it('should return null when no user is logged in', async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const userId = await authManager.getUserId();

      expect(userId).toBeNull();
    });

    it('should cache session for 5 seconds', async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValue({
        data: { 
          session: { 
            user: { id: 'user-123' } 
          } 
        },
        error: null,
      });

      // First call
      await authManager.getSession();
      // Second call within cache duration
      await authManager.getSession();

      // Should only fetch once due to caching
      expect(supabase.auth.getSession).toHaveBeenCalledTimes(1);
    });

    it('should invalidate cache when requested', async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValue({
        data: { 
          session: { 
            user: { id: 'user-123' } 
          } 
        },
        error: null,
      });

      // First call
      await authManager.getSession();
      
      // Invalidate cache
      authManager.invalidateCache();
      
      // Second call after invalidation
      await authManager.getSession();

      // Should fetch twice
      expect(supabase.auth.getSession).toHaveBeenCalledTimes(2);
    });
  });
});
