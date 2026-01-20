# Gestion de l'authentification

## Comportement par défaut

Au premier lancement de l'application, si l'utilisateur n'est pas connecté, l'écran d'authentification s'affiche automatiquement avec :

- **Bouton "Se connecter avec Google"** : Lance le processus OAuth Google
- **Checkbox "Ne plus me demander"** : Permet de sauvegarder la préférence
- **Bouton "Ne pas se connecter"** : Continue en mode hors ligne

## Préférence "Ne plus me demander"

Si l'utilisateur coche "Ne plus me demander" et clique sur "Ne pas se connecter" :
- L'application ne demandera plus l'authentification aux lancements suivants
- L'utilisateur sera automatiquement en mode hors ligne
- Les données sont stockées localement uniquement

## Réinitialiser la préférence

Pour permettre à l'utilisateur de se connecter après avoir choisi "Ne plus me demander", vous pouvez :

### Option 1 : Via le code

Appelez la fonction `resetNeverAskAgain()` depuis n'importe où dans l'application :

```typescript
import { resetNeverAskAgain } from '../lib/authPreferences';

// Réinitialiser la préférence
await resetNeverAskAgain();

// Naviguer vers l'écran d'authentification
navigation.navigate('Auth');
```

### Option 2 : Manuellement (pour le développement)

Dans un terminal, exécutez :

```bash
# Pour iOS Simulator
xcrun simctl spawn booted defaults delete com.presence.app
```

Ou supprimez et réinstallez l'application.

### Option 3 : Ajouter un bouton dans les paramètres

Vous pouvez ajouter un écran de paramètres avec un bouton "Se connecter" :

```typescript
import { resetNeverAskAgain } from '../lib/authPreferences';
import { supabase } from '../lib/supabase';

const handleLoginPrompt = async () => {
  // Réinitialiser la préférence
  await resetNeverAskAgain();
  
  // Naviguer vers Auth
  navigation.navigate('Auth');
};
```

## Flow d'authentification

### Au lancement de l'application

1. Vérification de la session Supabase active
   - Si session active → HomeScreen
2. Vérification de la préférence "Ne plus me demander"
   - Si `true` → HomeScreen (mode hors ligne)
   - Si `false` → AuthScreen

### Connexion avec Google

1. Clic sur "Se connecter avec Google"
2. Ouverture du navigateur pour OAuth
3. Authentification Google
4. Redirection vers l'application
5. Session Supabase créée
6. Navigation vers HomeScreen

### Mode hors ligne

1. Clic sur "Ne pas se connecter"
2. Si "Ne plus me demander" est coché → sauvegarde de la préférence
3. Utilisateur créé en mode local (id: 'offline')
4. Navigation vers HomeScreen
5. Toutes les données sont stockées localement (AsyncStorage)

## Stockage des données

- **Préférence "Ne plus demander"** : `AsyncStorage` → `@presence_app:never_ask_login`
- **Session Supabase** : `AsyncStorage` → géré automatiquement par Supabase
- **Données locales** : `AsyncStorage` → géré par `dataService.ts`

## Notes de développement

- Le fichier [lib/authPreferences.ts](../lib/authPreferences.ts) contient les utilitaires pour gérer la préférence
- La logique de routing est dans [App.tsx](../App.tsx)
- L'écran d'authentification est dans [screens/AuthScreen.tsx](../screens/AuthScreen.tsx)
