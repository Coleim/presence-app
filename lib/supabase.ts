import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { makeRedirectUri } from 'expo-auth-session';

// Configuration du redirect URL pour OAuth
// Don't specify scheme - let Expo determine it automatically
const redirectTo = makeRedirectUri({
  path: 'auth/callback'
});

// Key that Supabase uses to store session
const SUPABASE_AUTH_TOKEN_KEY = 'sb-hrnfqaquyxwyavhjhlrx-auth-token';

// Check if Supabase is configured

const supabaseUrl = "https://hrnfqaquyxwyavhjhlrx.supabase.co"
const supabasePublishableKey = "sb_publishable_md1N1lJxyQh_7Ov4WUhrxg_dcLK0dBn"

const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  })

/**
 * Clear stored auth session - useful when token is invalid
 */
export const clearStoredSession = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(SUPABASE_AUTH_TOKEN_KEY);
  } catch (e) {
    // Silent fail
  }
};

export { supabase, redirectTo };