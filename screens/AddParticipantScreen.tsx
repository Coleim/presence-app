import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { dataService } from '../lib/dataService';
import { theme } from '../lib/theme';

export default function AddParticipantScreen({ route, navigation }) {
  const { clubId } = route.params;
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [sessions, setSessions] = useState([]);
  const [selectedSessions, setSelectedSessions] = useState([]);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    const data = await dataService.getSessions(clubId);
    // Sort sessions by day and time
    const sortedSessions = data.sort((a, b) => {
      const dayOrder = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
      const dayComparison = dayOrder.indexOf(a.day_of_week) - dayOrder.indexOf(b.day_of_week);
      if (dayComparison !== 0) return dayComparison;
      return a.start_time.localeCompare(b.start_time);
    });
    setSessions(sortedSessions);
  };

  const toggleSession = (sessionId) => {
    if (selectedSessions.includes(sessionId)) {
      setSelectedSessions(selectedSessions.filter(id => id !== sessionId));
    } else {
      setSelectedSessions([...selectedSessions, sessionId]);
    }
  };

  const addParticipant = async () => {
    const participant = { club_id: clubId, first_name: firstName, last_name: lastName };
    const savedParticipant = await dataService.saveParticipant(participant);
    
    // Save preferred sessions
    if (selectedSessions.length > 0) {
      await dataService.saveParticipantSessions(savedParticipant.id, selectedSessions);
    }
    
    navigation.goBack();
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
          <Text style={styles.headerTitle}>Ajouter un participant</Text>
        </View>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
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

        <Text style={styles.sectionTitle}>Sessions régulières (optionnel)</Text>
        <Text style={styles.sectionDescription}>
          Sélectionnez les sessions auxquelles ce participant vient habituellement.
          Cela permettra de calculer son taux de présence.
        </Text>

        {sessions.map((session) => (
          <TouchableOpacity
            key={session.id}
            style={[
              styles.sessionCheckbox,
              selectedSessions.includes(session.id) && styles.sessionCheckboxSelected
            ]}
            onPress={() => toggleSession(session.id)}
          >
            <View style={[
              styles.checkbox,
              selectedSessions.includes(session.id) && styles.checkboxChecked
            ]}>
              {selectedSessions.includes(session.id) && (
                <Text style={styles.checkmark}>✓</Text>
              )}
            </View>
            <Text style={styles.sessionLabel}>
              {session.day_of_week} {session.start_time}-{session.end_time}
            </Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.buttonPrimary} onPress={addParticipant}>
          <Text style={styles.buttonPrimaryText}>Ajouter le participant</Text>
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
  sectionTitle: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginTop: theme.space[3],
    marginBottom: theme.space[2],
  },
  sectionDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    marginBottom: theme.space[3],
    lineHeight: 20,
  },
  sessionCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.space[3],
    marginBottom: theme.space[2],
  },
  sessionCheckboxSelected: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.success,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.space[3],
  },
  checkboxChecked: {
    backgroundColor: theme.colors.success,
    borderColor: theme.colors.success,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  sessionLabel: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.primary,
    flex: 1,
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