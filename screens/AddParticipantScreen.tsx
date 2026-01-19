import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { dataService } from '../lib/dataService';
import { theme } from '../lib/theme';

export default function AddParticipantScreen({ route, navigation }) {
  const { clubId } = route.params;
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [grade, setGrade] = useState('');
  const [level, setLevel] = useState('');
  const [notes, setNotes] = useState('');

  const addParticipant = async () => {
    const participant = { club_id: clubId, first_name: firstName, last_name: lastName, grade, level, notes };
    await dataService.saveParticipant(participant);
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header Container */}
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.smallBackButton}>
          <Text style={styles.smallBackButtonText}>← Retour</Text>
        </TouchableOpacity>
        {/* Main Header */}
        <View style={styles.mainHeader}>
          <Text style={styles.headerTitle}>Ajouter un participant</Text>
        </View>
      </View>

      <View style={styles.container}>
        <Text style={styles.label}>Prénom</Text>
        <TextInput
          placeholder="Entrez le prénom"
          value={firstName}
          onChangeText={setFirstName}
          style={styles.input}
          placeholderTextColor={theme.colors.text.secondary}
        />

        <Text style={styles.label}>Nom</Text>
        <TextInput
          placeholder="Entrez le nom"
          value={lastName}
          onChangeText={setLastName}
          style={styles.input}
          placeholderTextColor={theme.colors.text.secondary}
        />

        <TouchableOpacity style={styles.buttonPrimary} onPress={addParticipant}>
          <Text style={styles.buttonPrimaryText}>Ajouter le participant</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.bg },
  headerContainer: {
    position: 'relative',
    backgroundColor: theme.colors.primary[900],
    paddingHorizontal: theme.space[4],
    paddingVertical: theme.space[3],
    paddingBottom: theme.space[2],
  },
  smallBackButton: {
    position: 'absolute',
    top: 0,
    left: 0,
    padding: theme.space[2],
  },
  smallBackButtonText: {
    fontSize: theme.typography.fontSize.sm,
    color: '#FFFFFF',
    fontWeight: theme.typography.fontWeight.medium,
  },
  mainHeader: {
    alignItems: 'center',
  },
  headerTitle: {
    textAlign: 'center',
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    padding: theme.space[4],
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
  textArea: {
    height: theme.space[7] * 3, // 3 lines height
    textAlignVertical: 'top',
  },
  buttonPrimary: theme.components.buttonPrimary,
  buttonPrimaryText: {
    color: theme.colors.surface,
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.semibold,
  },
});