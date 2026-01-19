import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { supabase } from '../lib/supabase';
import { dataService, User } from '../lib/dataService';
import { useUser } from '../contexts/UserContext';
import { theme } from '../lib/theme';

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
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const { setUser } = useUser();
  const navigation = useNavigation<AuthScreenNavigationProp>();

  const signIn = async (): Promise<void> => {
    setLoading(true);
    if (supabase) {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        Alert.alert('Error', error.message);
      } else {
        const user = supabase.auth.user();
        if (user) {
          await dataService.setUser(user);
          setUser(user);
          navigation.navigate('Home');
        }
      }
    } else {
      // Offline mode
      const user: User = { email, id: 'offline' };
      await dataService.setUser(user);
      setUser(user);
      navigation.navigate('ClubList');
    }
    setLoading(false);
  };

  const signUp = async (): Promise<void> => {
    setLoading(true);
    if (supabase) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) {
        Alert.alert('Error', error.message);
      } else {
        Alert.alert('Success', 'Check your email for confirmation');
      }
    } else {
      Alert.alert('Offline mode', 'Cannot sign up');
    }
    setLoading(false);
  };

  const skipAuth = async (): Promise<void> => {
    const user: User = { email: 'offline@example.com', id: 'offline' };
    await dataService.setUser(user);
    setUser(user);
    navigation.navigate('Home');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Connexion</Text>
        <Text style={styles.subtitle}>Connectez-vous en ligne ou utilisez le mode hors ligne</Text>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={theme.colors.text.secondary}
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Mot de passe"
            placeholderTextColor={theme.colors.text.secondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.buttonPrimary, loading && styles.buttonDisabled]}
            onPress={signIn}
            disabled={loading}
          >
            <Text style={styles.buttonPrimaryText}>
              {loading ? 'Connexion...' : 'Se connecter'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.buttonSecondary, loading && styles.buttonDisabled]}
            onPress={signUp}
            disabled={loading}
          >
            <Text style={styles.buttonSecondaryText}>S'inscrire</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.buttonSecondary, loading && styles.buttonDisabled]}
            onPress={skipAuth}
            disabled={loading}
          >
            <Text style={styles.buttonSecondaryText}>Mode hors ligne</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.bg },
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    padding: theme.space[4],
    justifyContent: 'center',
  },
  title: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.space[2],
  },
  subtitle: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    marginBottom: theme.space[6],
  },
  inputContainer: {
    marginBottom: theme.space[5],
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.space[4],
    marginBottom: theme.space[3],
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.primary,
  },
  buttonContainer: {
    gap: theme.space[3],
  },
  buttonPrimary: theme.components.buttonPrimary,
  buttonPrimaryText: {
    color: theme.colors.surface,
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  buttonSecondary: theme.components.buttonSecondary,
  buttonSecondaryText: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSize.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});

export default AuthScreen;