import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as AuthSession from 'expo-auth-session';

// Configuration du redirect URL pour OAuth
const redirectTo = AuthSession.makeRedirectUri({
  scheme: 'app-presence',
  path: 'auth/callback'
});

// Check if Supabase is configured
const supabaseUrl = process.env['EXPO_PUBLIC_SUPABASE_URL'] || '';
const supabaseKey = process.env['EXPO_PUBLIC_SUPABASE_KEY'] || '';
const isSupabaseConfigured = 
  !!supabaseUrl && 
  !!supabaseKey &&
  supabaseUrl !== 'YOUR_SUPABASE_URL';

const supabase = createClient(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  })

export { supabase, redirectTo, isSupabaseConfigured };