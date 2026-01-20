import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();


const redirectTo = makeRedirectUri({
  path: '',
});

export async function signInWithOAuth(provider: 'google' | 'github') {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;

  console.log('[Auth] OAuth URL:', data.url);
  console.log('[Auth] Redirect URL:', redirectTo);
  const res = await WebBrowser.openAuthSessionAsync(data.url!, redirectTo);
  console.log('[Auth] Auth session result:', res);

  if (res.type === 'success') {
    WebBrowser.dismissBrowser();
    const { params } = QueryParams.getQueryParams(res.url);
    if (params?.access_token) {
      await supabase.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
      });

    }
  }
}

export async function signOut() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    console.error("No session to sign out")
    return;
  }
  return supabase.auth.signOut();
}