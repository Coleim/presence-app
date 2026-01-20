import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as AuthSession from 'expo-auth-session';

// Configuration du redirect URL pour OAuth
const redirectTo = AuthSession.makeRedirectUri({
  scheme: 'app-presence',
  path: 'auth/callback'
});


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