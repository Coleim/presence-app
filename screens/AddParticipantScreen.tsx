import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { dataService } from '../lib/dataService';
import { usageService } from '../lib/usageService';
import { hasReachedParticipantsLimit, getLimitMessage, USAGE_LIMITS, shouldShowWarning } from '../lib/usageLimits';
import { UsageBadge } from '../components/UsageBadge';
import { UpgradePrompt } from '../components/UpgradePrompt';
import { useTranslation } from '../contexts/LanguageContext';
import { theme } from '../lib/theme';
import { authManager } from '../lib/authManager';

export default function AddParticipantScreen({ route, navigation }) {
  const { clubId } = route.params;
  const { t, translateDay } = useTranslation();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [sessions, setSessions] = useState([]);
  const [selectedSessions, setSelectedSessions] = useState([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkOwnershipAndFetchData();
  }, []);

  const checkOwnershipAndFetchData = async () => {
    try {
      // Check ownership
      const userId = await authManager.getUserId();
      const clubData = await dataService.getClub(clubId);
      const isOwner = !userId || userId === clubData?.owner_id;
      
      if (!isOwner) {
        Alert.alert(
          t('common.error'),
          t('errors.ownerOnly'),
          [{ text: t('common.ok'), onPress: () => navigation.goBack() }]
        );
        return;
      }

      await Promise.all([fetchSessions(), checkParticipantLimit()]);
    } finally {
      setIsLoading(false);
    }
  };

  const checkParticipantLimit = async () => {
    try {
      const stats = await usageService.getClubUsageStats(clubId);
      setParticipantCount(stats.participants);
    } catch (error) {
      console.error('Error checking participant limit:', error);
    }
  };

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
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert(t('common.error'), t('addParticipant.nameRequired'));
      return;
    }

    // Check limit before adding
    if (hasReachedParticipantsLimit(participantCount)) {
      Alert.alert(
        t('limits.limitReached'),
        getLimitMessage('participants') + '\n\n' + t('limits.upgradeMessage'),
        [{ text: t('common.ok'), style: 'cancel' }]
      );
      return;
    }

    try {
      const participant = { 
        club_id: clubId, 
        first_name: firstName.trim(), 
        last_name: lastName.trim(),
        preferred_session_ids: selectedSessions // Include session assignments
      };
      
      // Wait for local save (fast), cloud sync happens in background
      const savedParticipant = await dataService.saveParticipant(participant);
      
      // Save participant_sessions mapping (wait for local save)
      if (selectedSessions.length > 0) {
        await dataService.saveParticipantSessions(savedParticipant.id, selectedSessions);
      }
      
      // Navigate after local saves complete
      navigation.goBack();
    } catch (error) {
      // Handle database constraint errors
      if (error.message && error.message.includes('cannot have more than 30 participants')) {
        Alert.alert(
          t('limits.limitReached'),
          getLimitMessage('participants') + '\n\n' + t('limits.upgradeMessage')
        );
      } else {
        Alert.alert(t('common.error'), t('addParticipant.error') + ': ' + error.message);
      }
    }
  };

  return (
    <View style={styles.container}>
      {/* Header Container */}
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.smallBackButton}>
          <Text style={styles.smallBackButtonText}>{t('common.back')}</Text>
        </TouchableOpacity>
        {/* Main Header */}
        <View style={styles.mainHeader}>
          <Text style={styles.headerTitle}>{t('addParticipant.title')}</Text>
        </View>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        {/* Show usage badge */}
        {!isLoading && (
          <UsageBadge
            current={participantCount}
            limit={USAGE_LIMITS.PARTICIPANTS_PER_CLUB}
            label={t('limits.participantsInClub')}
          />
        )}

        {/* Show upgrade prompt when approaching or at limit */}
        {!isLoading && shouldShowWarning(participantCount, USAGE_LIMITS.PARTICIPANTS_PER_CLUB) && (
          <UpgradePrompt
            message={
              hasReachedParticipantsLimit(participantCount)
                ? getLimitMessage('participants')
                : t('limits.approaching') + ` (${participantCount}/${USAGE_LIMITS.PARTICIPANTS_PER_CLUB})`
            }
            style={styles.upgradePrompt}
          />
        )}

        <Text style={styles.label}>{t('addParticipant.firstName')}</Text>
        <TextInput
          placeholder={t('addParticipant.firstNamePlaceholder')}
          value={firstName}
          onChangeText={setFirstName}
          style={styles.input}
          placeholderTextColor={theme.colors.text.secondary}
        />

        <Text style={styles.label}>{t('addParticipant.lastName')}</Text>
        <TextInput
          placeholder={t('addParticipant.lastNamePlaceholder')}
          value={lastName}
          onChangeText={setLastName}
          style={styles.input}
          placeholderTextColor={theme.colors.text.secondary}
        />

        <Text style={styles.sectionTitle}>{t('addParticipant.regularSessions')}</Text>
        <Text style={styles.sectionDescription}>
          {t('addParticipant.regularSessionsDesc')}
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
              {translateDay(session.day_of_week)} {session.start_time}-{session.end_time}
            </Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.buttonPrimary} onPress={addParticipant}>
          <Text style={styles.buttonPrimaryText}>{t('addParticipant.add')}</Text>
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
  upgradePrompt: {
    marginTop: theme.space[2],
    marginBottom: theme.space[3],
  },
});