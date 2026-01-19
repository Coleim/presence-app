import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { dataService } from '../lib/dataService';
import { theme } from '../lib/theme';

export default function JoinClubScreen({ navigation }) {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');

  const joinClub = async () => {
    const club = await dataService.joinClub(code, password);
    if (club) {
      navigation.goBack();
    } else {
      alert('Invalid code or password, or offline');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header with back button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Rejoindre un club</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.container}>
        <Text style={styles.description}>
          Entrez le code et le mot de passe du club que vous souhaitez rejoindre.
        </Text>

        <Text style={styles.label}>Code du club</Text>
        <TextInput
          placeholder="Entrez le code du club"
          value={code}
          onChangeText={setCode}
          style={styles.input}
          placeholderTextColor={theme.colors.text.secondary}
          autoCapitalize="characters"
        />

        <Text style={styles.label}>Mot de passe</Text>
        <TextInput
          placeholder="Entrez le mot de passe"
          value={password}
          onChangeText={setPassword}
          style={styles.input}
          secureTextEntry
          placeholderTextColor={theme.colors.text.secondary}
        />

        <TouchableOpacity style={styles.buttonPrimary} onPress={joinClub}>
          <Text style={styles.buttonPrimaryText}>Rejoindre le club</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.bg },
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
    width: theme.space[8], // Same width as back button for centering
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
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
  buttonPrimaryText: {
    color: theme.colors.surface,
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.semibold,
  },
});