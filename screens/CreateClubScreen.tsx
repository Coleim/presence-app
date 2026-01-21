import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { dataService } from '../lib/dataService';
import { authManager } from '../lib/authManager';
import { theme } from '../lib/theme';

export default function CreateClubScreen({ navigation }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const createClub = async () => {
    if (!name.trim()) {
      alert('Please enter a club name');
      return;
    }
    try {
      // Get current user ID if authenticated
      const userId = await authManager.getUserId();
      
      const club = {
        name: name.trim(),
        description: description.trim(),
        owner_id: userId || undefined, // Set owner if authenticated
      };
      // Wait for local save (fast), cloud sync happens in background
      await dataService.saveClub(club);
      // Navigate after local save completes
      navigation.goBack();
    } catch (error) {
      alert('Error creating club: ' + error.message);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header Container */}
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.smallBackButton}>
          <Text style={styles.smallBackButtonText}>← Retour</Text>
        </TouchableOpacity>
        {/* Main Header */}
        <View style={styles.mainHeader}>
          <Text style={styles.headerTitle}>Créer un club</Text>
        </View>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.label}>Nom du club</Text>
        <TextInput
          placeholder="Entrez le nom du club"
          value={name}
          onChangeText={setName}
          style={styles.input}
          placeholderTextColor={theme.colors.text.secondary}
        />

        <Text style={styles.label}>Description (optionnel)</Text>
        <TextInput
          placeholder="Entrez une description"
          value={description}
          onChangeText={setDescription}
          style={[styles.input, styles.textArea]}
          multiline
          numberOfLines={3}
          placeholderTextColor={theme.colors.text.secondary}
        />

        <TouchableOpacity style={styles.buttonPrimary} onPress={createClub}>
          <Text style={styles.buttonPrimaryText}>Créer le club</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
  },
  contentContainer: {
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