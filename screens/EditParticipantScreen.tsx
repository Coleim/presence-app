import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Switch } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { dataService } from '../lib/dataService';
import { theme } from '../lib/theme';

export default function EditParticipantScreen({ route, navigation }: any) {
  const { participant, clubId } = route.params;
  const [firstName, setFirstName] = useState(participant.first_name);
  const [lastName, setLastName] = useState(participant.last_name);
  const [isLongTermSick, setIsLongTermSick] = useState(participant.is_long_term_sick || false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSessions, setSelectedSessions] = useState<string[]>(participant.preferred_session_ids || []);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    const data = await dataService.getSessions(clubId);
    
    // Sort sessions by day of week, then by time
    const getDayIndex = (dayName: string) => {
      const frenchDays = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
      return frenchDays.indexOf(dayName);
    };
    
    const sortedSessions = [...data].sort((a, b) => {
      const dayA = getDayIndex(a.day_of_week);
      const dayB = getDayIndex(b.day_of_week);
      if (dayA !== dayB) return dayA - dayB;
      return a.start_time.localeCompare(b.start_time);
    });
    
    setSessions(sortedSessions);
  };

  const toggleSession = (sessionId: string) => {
    if (selectedSessions.includes(sessionId)) {
      setSelectedSessions(selectedSessions.filter(id => id !== sessionId));
    } else {
      setSelectedSessions([...selectedSessions, sessionId]);
    }
  };

  const saveParticipant = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Erreur', 'Le prénom et le nom sont requis.');
      return;
    }

    const updatedParticipant = {
      ...participant,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      is_long_term_sick: isLongTermSick,
      preferred_session_ids: selectedSessions // Include session assignments
    };

    // Wait for local saves (fast), cloud sync happens in background
    await dataService.saveParticipant(updatedParticipant);
    await dataService.saveParticipantSessions(participant.id, selectedSessions);

    Alert.alert('Succès', 'Le participant a été modifié.');
    navigation.goBack();
  };

  const deleteParticipant = () => {
    Alert.alert(
      'Supprimer le participant',
      `Êtes-vous sûr de vouloir supprimer ${firstName} ${lastName} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            await dataService.deleteParticipant(participant.id);
            Alert.alert('Succès', 'Participant supprimé.');
            navigation.goBack();
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header Container */}
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.smallBackButton}>
          <Text style={styles.smallBackButtonText}>← Retour</Text>
        </TouchableOpacity>
        <View style={styles.mainHeader}>
          <Text style={styles.headerTitle}>Modifier le participant</Text>
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.sectionTitle}>Informations</Text>
        
        <TextInput
          style={styles.input}
          placeholder="Prénom *"
          placeholderTextColor={theme.colors.text.secondary}
          value={firstName}
          onChangeText={setFirstName}
        />

        <TextInput
          style={styles.input}
          placeholder="Nom *"
          placeholderTextColor={theme.colors.text.secondary}
          value={lastName}
          onChangeText={setLastName}
        />

        <View style={styles.switchContainer}>
          <View style={styles.switchLabelContainer}>
            <Text style={styles.switchLabel}>Malade longue durée</Text>
            <Text style={styles.switchDescription}>
              Les absences ne comptent pas dans les statistiques
            </Text>
          </View>
          <Switch
            value={isLongTermSick}
            onValueChange={setIsLongTermSick}
            trackColor={{ false: theme.colors.disabled, true: theme.colors.success }}
            thumbColor="#FFFFFF"
          />
        </View>

        <Text style={styles.sectionTitle}>Sessions assignées</Text>
        <Text style={styles.sectionDescription}>
          Sélectionnez les sessions auxquelles ce participant est inscrit
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
                <Feather name="check" size={18} color="white" />
              )}
            </View>
            <Text style={styles.sessionLabel}>
              {session.day_of_week} {session.start_time}-{session.end_time}
            </Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.buttonPrimary} onPress={saveParticipant}>
          <Text style={styles.buttonPrimaryText}>Enregistrer</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.buttonDanger} onPress={deleteParticipant}>
          <Text style={styles.buttonDangerText}>Supprimer le participant</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
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
  content: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  contentContainer: {
    padding: theme.space[4],
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
    height: theme.space[7] * 3,
    textAlignVertical: 'top',
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.space[3],
    marginBottom: theme.space[4],
  },
  switchLabelContainer: {
    flex: 1,
    marginRight: theme.space[3],
  },
  switchLabel: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
    marginBottom: theme.space[1],
  },
  switchDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    lineHeight: 18,
  },
  sessionCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.space[3],
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
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
  sessionLabel: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.primary,
    flex: 1,
  },
  buttonPrimary: theme.components.buttonPrimary,
  buttonPrimaryText: {
    color: theme.colors.surface,
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  buttonDanger: {
    backgroundColor: theme.colors.dangerBg,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.space[3],
    paddingHorizontal: theme.space[4],
    alignItems: 'center',
    marginTop: theme.space[3],
  },
  buttonDangerText: {
    color: theme.colors.danger,
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.medium,
  },
});
