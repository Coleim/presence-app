import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, redirectTo } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export async function signInWithOAuth(provider: 'google' | 'github') {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: redirectTo,
      skipBrowserRedirect: true,
      queryParams: {
        prompt: 'select_account', // Force account selection for Google
      },
    },
  });

  if (error) throw error;

  console.log('[Auth] 🌐 OAuth URL:', data.url);
  console.log('[Auth] 📍 Redirect URL:', redirectTo);
  console.log('[Auth] 🚀 Opening browser...');
  
  const res = await WebBrowser.openAuthSessionAsync(data.url!, redirectTo);
  
  console.log('[Auth] ✅ Browser returned!');
  console.log('[Auth] 📱 Result type:', res.type);
  console.log('[Auth] 🔗 Result:', JSON.stringify(res, null, 2));

  if (res.type === 'success') {
    WebBrowser.dismissBrowser();
    const { params } = QueryParams.getQueryParams(res.url);
    if (params?.['access_token'] && params?.['refresh_token']) {
      const { data: sessionData } = await supabase.auth.setSession({
        access_token: params['access_token'],
        refresh_token: params['refresh_token'],
      });
      
      return sessionData.session;
    }
  }
  
  return null;
}

export async function signOut() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    console.error("No session to sign out")
    return;
  }
  
  // Clear all local data
  await AsyncStorage.multiRemove([
    '@presence_app:clubs',
    '@presence_app:sessions',
    '@presence_app:participants',
    '@presence_app:participant_sessions',
    '@presence_app:attendance',
    '@presence_app:user',
    '@presence_app:never_ask_login',
    'last_sync_timestamp',
  ]);
  
  return supabase.auth.signOut();
}