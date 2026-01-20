# Configuration OAuth Google avec Supabase (2026)

## 📋 Prérequis

1. Un projet Supabase configuré
2. Un projet Google Cloud Platform
3. Les dépendances installées (déjà fait ✅)

## 🔧 Configuration Supabase

### 1. Activer Google OAuth dans Supabase

1. Allez dans votre [Supabase Dashboard](https://supabase.com/dashboard)
2. Sélectionnez votre projet
3. Allez dans **Authentication** > **Providers**
4. Activez **Google**

### 2. Récupérer l'URL de callback Supabase

Votre URL de callback Supabase sera:
```
https://<votre-projet>.supabase.co/auth/v1/callback
```

## 🔐 Configuration Google Cloud Platform

### 1. Créer un projet Google Cloud

1. Allez sur [Google Cloud Console](https://console.cloud.google.com/)
2. Créez un nouveau projet ou sélectionnez-en un existant
3. Activez l'API Google+ API

### 2. Créer des identifiants OAuth 2.0

1. Allez dans **APIs & Services** > **Credentials**
2. Cliquez sur **Create Credentials** > **OAuth client ID**
3. Sélectionnez le type d'application:
   - **Web application** (pour l'authentification mobile)
   
4. Configurez les redirections autorisées:
   - Ajoutez votre URL de callback Supabase: `https://<votre-projet>.supabase.co/auth/v1/callback`

5. Notez votre **Client ID** et **Client Secret**

### 3. Configurer les écrans OAuth (si nécessaire)

1. Allez dans **OAuth consent screen**
2. Configurez les informations de votre application
3. Ajoutez les scopes nécessaires (email, profile)

## 🔗 Finaliser la configuration Supabase

1. Retournez dans Supabase Dashboard > Authentication > Providers > Google
2. Collez votre **Client ID** Google
3. Collez votre **Client Secret** Google
4. Cliquez sur **Save**

## 📱 Configuration de l'application

### 1. Mettre à jour les variables Supabase

Dans [`lib/supabase.ts`](../lib/supabase.ts), remplacez:
```typescript
const supabaseUrl = 'YOUR_SUPABASE_URL';
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY';
```

Par vos vraies valeurs que vous trouverez dans:
- **Supabase Dashboard** > **Settings** > **API**

### 2. URL de redirection

L'URL de redirection est automatiquement configurée dans [`lib/supabase.ts`](../lib/supabase.ts):
```typescript
const redirectTo = AuthSession.makeRedirectUri({
  scheme: 'app-presence',
  path: 'auth/callback'
});
```

Pour vérifier l'URL générée, vous pouvez ajouter un `console.log(redirectTo)` temporaire.

## 🧪 Tester l'authentification

### En développement (Expo)

```bash
npm start
```

1. Scannez le QR code avec Expo Go
2. Appuyez sur "🔐 Se connecter avec Google"
3. Autorisez l'application
4. Vous devriez être redirigé vers l'application

### Problèmes courants

#### 1. Erreur "redirect_uri_mismatch"
- Vérifiez que l'URL de callback dans Google Cloud Console correspond exactement à celle de Supabase
- Format attendu: `https://<votre-projet>.supabase.co/auth/v1/callback`

#### 2. Le navigateur ne se ferme pas
- Vérifiez que `WebBrowser.maybeCompleteAuthSession()` est appelé
- Vérifiez le scheme dans [app.json](../app.json)

#### 3. Pas de redirection après authentification
- Vérifiez que `onAuthStateChange` est bien configuré
- Vérifiez les logs dans la console

## 📚 Documentation officielle

- [Supabase Auth avec OAuth](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Expo AuthSession](https://docs.expo.dev/versions/latest/sdk/auth-session/)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)

## 🔄 Flow d'authentification

1. L'utilisateur appuie sur "Se connecter avec Google"
2. `supabase.auth.signInWithOAuth()` génère une URL d'autorisation Google
3. `WebBrowser.openAuthSessionAsync()` ouvre cette URL dans un navigateur
4. L'utilisateur s'authentifie sur Google
5. Google redirige vers Supabase avec un code d'autorisation
6. Supabase échange le code contre des tokens
7. L'application reçoit la session via `onAuthStateChange`
8. L'utilisateur est redirigé vers l'écran Home

## ✅ Checklist de configuration

- [ ] Projet Supabase créé
- [ ] Google OAuth activé dans Supabase
- [ ] Projet Google Cloud créé
- [ ] OAuth Client ID créé dans Google Cloud
- [ ] URL de callback ajoutée dans Google Cloud
- [ ] Client ID et Secret configurés dans Supabase
- [ ] Variables Supabase mises à jour dans `lib/supabase.ts`
- [ ] Application testée avec succès
