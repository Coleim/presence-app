import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { syncService } from '../lib/syncService';
import { theme } from '../lib/theme';

export default function JoinClubScreen({ navigation }) {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const joinClub = async () => {
    if (!code.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un code de partage');
      return;
    }

    setLoading(true);
    try {
      const clubId = await syncService.joinClubWithCode(
        code.trim().toUpperCase(),
        password.trim() || undefined
      );
      
      Alert.alert(
        'Succès',
        'Vous avez rejoint le club avec succès!',
        [
          {
            text: 'OK',
            onPress: () => {
              // Navigate to the club details or back to home
              navigation.navigate('Home');
            }
          }
        ]
      );
    } catch (error: any) {
      console.error('Error joining club:', error);
      
      let errorMessage = 'Impossible de rejoindre le club';
      if (error.message?.includes('not found')) {
        errorMessage = 'Code de partage invalide';
      } else if (error.message?.includes('password')) {
        errorMessage = 'Mot de passe incorrect';
      }
      
      Alert.alert('Erreur', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header with back button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Rejoindre un club</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.description}>
          Entrez le code et le mot de passe du club que vous souhaitez rejoindre.
        </Text>

        <Text style={styles.label}>Code du club</Text>
        <TextInput
          placeholder="Ex: ABC123"
          value={code}
          onChangeText={(text) => setCode(text.toUpperCase())}
          style={styles.input}
          placeholderTextColor={theme.colors.text.secondary}
          autoCapitalize="characters"
          maxLength={6}
          editable={!loading}
        />

        <Text style={styles.label}>Mot de passe (optionnel)</Text>
        <TextInput
          placeholder="Si requis"
          value={password}
          onChangeText={setPassword}
          style={styles.input}
          secureTextEntry
          placeholderTextColor={theme.colors.text.secondary}
          editable={!loading}
        />

        <TouchableOpacity 
          style={[styles.buttonPrimary, loading && styles.buttonDisabled]} 
          onPress={joinClub}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonPrimaryText}>Rejoindre le club</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary[900],
    paddingHorizontal: theme.space[4],
    paddingVertical: theme.space[3],
  },
  backButton: {
    padding: theme.space[2],
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.medium,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#FFFFFF',
  },
  headerSpacer: {
    width: theme.space[7], // Same width as back button for centering
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  contentContainer: {
    padding: theme.space[4],
  },
  description: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.secondary,
    marginBottom: theme.space[5],
    textAlign: 'center',
  },
  label: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
    marginBottom: theme.space[2],
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.space[3],
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.primary,
    marginBottom: theme.space[4],
  },
  buttonPrimary: theme.components.buttonPrimary,
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonPrimaryText: {
    color: theme.colors.surface,
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.semibold,
  },
});