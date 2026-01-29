import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Switch } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { dataService } from '../lib/dataService';
import { authManager } from '../lib/authManager';
import { theme } from '../lib/theme';
import { useTranslation } from '../contexts/LanguageContext';

export default function EditParticipantScreen({ route, navigation }: any) {
  const { t, translateDay } = useTranslation();
  const { participant, clubId } = route.params;
  const [firstName, setFirstName] = useState(participant.first_name);
  const [lastName, setLastName] = useState(participant.last_name);
  const [isLongTermSick, setIsLongTermSick] = useState(participant.is_long_term_sick || false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [club, setClub] = useState<any>(null);

  useEffect(() => {
    loadSessions();
    loadParticipantSessions();
    checkOwnership();
  }, []);

  const checkOwnership = async () => {
    const clubData = await dataService.getClub(clubId);
    setClub(clubData);
    
    const userId = await authManager.getUserId();
    // If not logged in (userId is null), allow editing (local-only mode)
    setIsOwner(!userId || userId === clubData?.owner_id);
  };

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

  const loadParticipantSessions = async () => {
    const sessionIds = await dataService.getParticipantSessions(participant.id);
    console.log('[EditParticipant] Loaded participant sessions:', sessionIds);
    setSelectedSessions(sessionIds);
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
      Alert.alert(t('common.error'), t('editParticipant.required'));
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

    Alert.alert(t('common.success'), t('editParticipant.updated'));
    navigation.goBack();
  };

  const deleteParticipant = () => {
    Alert.alert(
      t('editParticipant.delete'),
      `${t('editParticipant.confirmDelete')} ${firstName} ${lastName} ?`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            await dataService.deleteParticipant(participant.id);
            Alert.alert(t('common.success'), t('editParticipant.deleted'));
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
          <Text style={styles.smallBackButtonText}>{t('common.back')}</Text>
        </TouchableOpacity>
        <View style={styles.mainHeader}>
          <Text style={styles.headerTitle}>{t('editParticipant.title')}</Text>
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.sectionTitle}>{t('editParticipant.information')}</Text>
        
        {!isOwner && (
          <Text style={styles.ownerOnlyHint}>
            {t('editParticipant.viewOnly')}
          </Text>
        )}
        
        <TextInput
          style={styles.input}
          placeholder={t('editParticipant.firstNamePlaceholder')}
          placeholderTextColor={theme.colors.text.secondary}
          value={firstName}
          onChangeText={setFirstName}
          editable={isOwner}
        />

        <TextInput
          style={styles.input}
          placeholder={t('editParticipant.lastNamePlaceholder')}
          placeholderTextColor={theme.colors.text.secondary}
          value={lastName}
          onChangeText={setLastName}
          editable={isOwner}
        />

        <View style={styles.switchContainer}>
          <View style={styles.switchLabelContainer}>
            <Text style={styles.switchLabel}>{t('editParticipant.longTermSick')}</Text>
            <Text style={styles.switchDescription}>
              {t('editParticipant.longTermSickDesc')}
            </Text>
          </View>
          <Switch
            value={isLongTermSick}
            onValueChange={setIsLongTermSick}
            trackColor={{ false: theme.colors.disabled, true: theme.colors.success }}
            thumbColor="#FFFFFF"
            disabled={!isOwner}
          />
        </View>

        <Text style={styles.sectionTitle}>{t('editParticipant.sessionsAssigned')}</Text>
        <Text style={styles.sectionDescription}>
          {t('editParticipant.sessionsDesc')}
        </Text>

        {sessions.map((session) => (
          <TouchableOpacity
            key={session.id}
            style={[
              styles.sessionCheckbox,
              selectedSessions.includes(session.id) && styles.sessionCheckboxSelected
            ]}
            onPress={() => toggleSession(session.id)}
            disabled={!isOwner}
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
              {translateDay(session.day_of_week)} {session.start_time}-{session.end_time}
            </Text>
          </TouchableOpacity>
        ))}

        {/* Only owner can update participant details */}
        {isOwner && (
          <TouchableOpacity style={styles.buttonPrimary} onPress={saveParticipant}>
            <Text style={styles.buttonPrimaryText}>{t('editParticipant.update')}</Text>
          </TouchableOpacity>
        )}

        {/* Only owner can delete participants */}
        {isOwner && (
          <TouchableOpacity style={styles.buttonDanger} onPress={deleteParticipant}>
            <Text style={styles.buttonDangerText}>{t('editParticipant.delete')}</Text>
          </TouchableOpacity>
        )}
        
        {!isOwner && (
          <Text style={styles.ownerOnlyHint}>
            {t('editParticipant.cannotEdit')}
          </Text>
        )}
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
  ownerOnlyHint: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: theme.space[4],
  },
});
