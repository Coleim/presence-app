import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dataService, User } from '../lib/dataService';
import { useUser } from '../contexts/UserContext';
import { theme } from '../lib/theme';
import { signInWithOAuth, signOut } from '../lib/auth';
import { authManager } from '../lib/authManager';

const NEVER_ASK_AGAIN_KEY = '@presence_app:never_ask_login';

type RootStackParamList = {
  Auth: undefined;
  Home: undefined;
  ClubList: undefined;
  CreateClub: undefined;
  ClubDetails: { club: any };
  AddSession: { clubId: string };
  AddParticipant: { clubId: string };
  SessionSelection: { club: any };
  Attendance: { session: any; date: string };
  Stats: { club: any };
};

type AuthScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Auth'>;

const AuthScreen: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(false);
  const [neverAskAgain, setNeverAskAgain] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const { setUser } = useUser();
  const navigation = useNavigation<AuthScreenNavigationProp>();

  // Vérifier si l'utilisateur a déjà choisi "ne plus demander"
  useEffect(() => {
    checkAuth();
    checkNeverAskAgain();
  }, []);

  const checkAuth = async () => {
    const isAuth = await authManager.isAuthenticated();
    setIsAuthenticated(isAuth);
  };

  const checkNeverAskAgain = async () => {
    try {
      const value = await AsyncStorage.getItem(NEVER_ASK_AGAIN_KEY);
      if (value === 'true') {
        // L'utilisateur ne veut pas se connecter, on passe directement en mode offline
        skipToOfflineMode();
      }
    } catch (error) {
      console.error('Error checking never ask again:', error);
    }
  };

  // NO auth listener - it causes lock issues!
  // Auth state will be handled by the OAuth callback URL instead

  const signInWithGoogle = async (): Promise<void> => {
    try {
      setLoading(true);
      await signInWithOAuth('google');
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async (): Promise<void> => {
    try {
      setLoading(true);
      await signOut();
      // Invalidate cache and update state
      authManager.invalidateCache();
      setIsAuthenticated(false);
      Alert.alert('Succès', 'Déconnexion réussie');
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Erreur lors de la déconnexion');
    } finally {
      setLoading(false);
    }
  };

  const skipToOfflineMode = async (): Promise<void> => {
    const user: User = { email: 'offline@example.com', id: 'offline' };
    await dataService.setUser(user);
    setUser(user);
    // Utiliser reset au lieu de navigate pour empêcher le retour à l'écran Auth
    navigation.reset({
      index: 0,
      routes: [{ name: 'Home' }],
    });
  };

  const handleDoNotLogin = async (): Promise<void> => {
    try {
      if (neverAskAgain) {
        await AsyncStorage.setItem(NEVER_ASK_AGAIN_KEY, 'true');
      }
      skipToOfflineMode();
    } catch (error) {
      console.error('Error saving preference:', error);
      skipToOfflineMode();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Bienvenue</Text>
        <Text style={styles.authStatus}>
          {isAuthenticated ? '🟢 Logged in' : '🔴 Offline'}
        </Text>
        <Text style={styles.subtitle}>Connectez-vous pour synchroniser vos données</Text>

        <TouchableOpacity
          style={[styles.googleButton, loading && styles.buttonDisabled]}
          onPress={signInWithGoogle}
          disabled={loading}
        >
          <View style={styles.googleButtonContent}>
            <View style={styles.googleIconContainer}>
              <Text style={styles.googleIcon}>G</Text>
            </View>
            <Text style={styles.googleButtonText}>
              {loading ? 'Connexion...' : 'Se connecter avec Google'}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.signOutButton, loading && styles.buttonDisabled]}
          onPress={handleSignOut}
          disabled={loading}
        >
          <Text style={styles.signOutButtonText}>
            Se déconnecter
          </Text>
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={[styles.skipButton, loading && styles.buttonDisabled]}
          onPress={handleDoNotLogin}
          disabled={loading}
        >
          <Text style={styles.skipButtonText}>Ne pas se connecter</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.checkboxContainer}
          onPress={() => setNeverAskAgain(!neverAskAgain)}
        >
          <View style={[styles.checkbox, neverAskAgain && styles.checkboxChecked]}>
            {neverAskAgain && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkboxLabel}>Ne plus me demander</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.space[6],
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.space[3],
  },
  authStatus: {
    fontSize: 16,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.space[2],
  },
  subtitle: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    marginBottom: theme.space[8],
  },
  googleButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DADCE0',
    borderRadius: theme.borderRadius.md,
    padding: theme.space[3],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  googleButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIconContainer: {
    width: 20,
    height: 20,
    marginRight: theme.space[3],
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleIcon: {
    fontSize: 18,
    fontWeight: theme.typography.fontWeight.bold,
    color: '#4285F4',
  },
  googleButtonText: {
    color: '#3C4043',
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.medium,
  },
  divider: {
    marginVertical: theme.space[6],
  },
  dividerLine: {
    height: 1,
    backgroundColor: theme.colors.border,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.space[4],
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderRadius: 4,
    marginRight: theme.space[3],
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
  },
  checkboxChecked: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: theme.typography.fontWeight.bold,
  },
  checkboxLabel: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.secondary,
  },
  skipButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.space[4],
    alignItems: 'center',
  },
  skipButtonText: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.medium,
  },
  signOutButton: {
    backgroundColor: '#FF3B30',
    borderRadius: theme.borderRadius.md,
    padding: theme.space[4],
    alignItems: 'center',
    marginTop: theme.space[3],
  },
  signOutButtonText: {
    color: '#FFFFFF',
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.medium,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});

export default AuthScreen;