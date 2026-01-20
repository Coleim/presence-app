import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { makeRedirectUri } from 'expo-auth-session';

// Configuration du redirect URL pour OAuth
// Don't specify scheme - let Expo determine it automatically
const redirectTo = makeRedirectUri({
  path: 'auth/callback'
});

console.log('[Supabase] 📍 Redirect URL configured:', redirectTo);


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

export { supabase, redirectTo };