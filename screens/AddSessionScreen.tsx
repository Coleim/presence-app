import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Alert, ScrollView } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { dataService } from '../lib/dataService';
import { usageService } from '../lib/usageService';
import { hasReachedSessionsLimit, getLimitMessage, USAGE_LIMITS, shouldShowWarning } from '../lib/usageLimits';
import { UsageBadge } from '../components/UsageBadge';
import { UpgradePrompt } from '../components/UpgradePrompt';
import { useTranslation } from '../contexts/LanguageContext';
import { theme } from '../lib/theme';
import { authManager } from '../lib/authManager';

export default function AddSessionScreen({ route, navigation }) {
  const { clubId } = route.params;
  const { t, language } = useTranslation();
  const [day, setDay] = useState(language === 'fr' ? 'Lundi' : 'Monday');
  const [startTime, setStartTime] = useState(new Date(2000, 0, 1, 9, 0)); // 9:00 AM
  const [endTime, setEndTime] = useState(new Date(2000, 0, 1, 10, 0)); // 10:00 AM
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [startTimeSet, setStartTimeSet] = useState(false); // Track if user has set start time
  const [sessionCount, setSessionCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkOwnershipAndLimit();
  }, []);

  const checkOwnershipAndLimit = async () => {
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

      // Check session limit
      const stats = await usageService.getClubUsageStats(clubId);
      setSessionCount(stats.sessions);
    } catch (error) {
      console.error('Error checking session limit:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (date: Date) => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const onStartTimeChange = (event: any, selectedDate?: Date) => {
    setShowStartPicker(Platform.OS === 'ios');
    if (selectedDate) {
      setStartTime(selectedDate);
      setStartTimeSet(true);
      
      // Auto-adjust end time to be 1 hour after start time if it's before or equal to start time
      const newEndTime = new Date(selectedDate);
      newEndTime.setHours(selectedDate.getHours() + 1);
      
      // If end time is before or equal to the new start time, update it
      if (endTime <= selectedDate) {
        setEndTime(newEndTime);
      }
    }
  };

  const onEndTimeChange = (event: any, selectedDate?: Date) => {
    setShowEndPicker(Platform.OS === 'ios');
    if (selectedDate) {
      // Ensure end time is after start time
      if (selectedDate <= startTime) {
        // Set end time to 1 hour after start time
        const adjustedEndTime = new Date(startTime);
        adjustedEndTime.setHours(startTime.getHours() + 1);
        setEndTime(adjustedEndTime);
        
        Alert.alert(
          t('common.error'),
          t('addSession.endTimeAfterStart'),
          [{ text: t('common.ok') }]
        );
      } else {
        setEndTime(selectedDate);
      }
    }
  };

  const addSession = async () => {
    // Check limit before adding
    if (hasReachedSessionsLimit(sessionCount)) {
      Alert.alert(
        t('limits.limitReached'),
        getLimitMessage('sessions') + '\n\n' + t('limits.upgradeMessage'),
        [{ text: t('common.ok'), style: 'cancel' }]
      );
      return;
    }

    try {
      const session = { club_id: clubId, day_of_week: day, start_time: formatTime(startTime), end_time: formatTime(endTime) };
      // Wait for local save (fast), cloud sync happens in background
      await dataService.saveSession(session);
      // Navigate after local save completes
      navigation.goBack();
    } catch (error) {
      console.error('Error adding session:', error);
      // Handle database constraint errors
      if (error.message && error.message.includes('cannot have more than 10 sessions')) {
        Alert.alert(
          t('limits.limitReached'),
          getLimitMessage('sessions') + '\n\n' + t('limits.upgradeMessage')
        );
      } else {
        Alert.alert(t('common.error'), t('addSession.error'));
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
          <Text style={styles.headerTitle}>{t('addSession.title')}</Text>
        </View>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        {/* Show usage badge */}
        {!isLoading && (
          <UsageBadge
            current={sessionCount}
            limit={USAGE_LIMITS.SESSIONS_PER_CLUB}
            label={t('limits.sessionsInClub')}
          />
        )}

        {/* Show upgrade prompt when approaching or at limit */}
        {!isLoading && shouldShowWarning(sessionCount, USAGE_LIMITS.SESSIONS_PER_CLUB) && (
          <UpgradePrompt
            message={
              hasReachedSessionsLimit(sessionCount)
                ? getLimitMessage('sessions')
                : t('limits.approaching') + ` (${sessionCount}/${USAGE_LIMITS.SESSIONS_PER_CLUB})`
            }
            style={styles.upgradePrompt}
          />
        )}

        <Text style={styles.label}>{t('addSession.dayOfWeek')}</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={day}
            onValueChange={setDay}
            style={styles.picker}
            itemStyle={styles.pickerItem}
          >
            <Picker.Item label={t('days.monday')} value={language === 'fr' ? 'Lundi' : 'Monday'} />
            <Picker.Item label={t('days.tuesday')} value={language === 'fr' ? 'Mardi' : 'Tuesday'} />
            <Picker.Item label={t('days.wednesday')} value={language === 'fr' ? 'Mercredi' : 'Wednesday'} />
            <Picker.Item label={t('days.thursday')} value={language === 'fr' ? 'Jeudi' : 'Thursday'} />
            <Picker.Item label={t('days.friday')} value={language === 'fr' ? 'Vendredi' : 'Friday'} />
            <Picker.Item label={t('days.saturday')} value={language === 'fr' ? 'Samedi' : 'Saturday'} />
            <Picker.Item label={t('days.sunday')} value={language === 'fr' ? 'Dimanche' : 'Sunday'} />
          </Picker>
        </View>

        <Text style={styles.label}>{t('addSession.startTime')}</Text>
        <TouchableOpacity onPress={() => setShowStartPicker(true)} style={styles.timeButton}>
          <Text style={styles.timeButtonText}>{formatTime(startTime)}</Text>
        </TouchableOpacity>
        {showStartPicker && (
          <DateTimePicker
            value={startTime}
            mode="time"
            is24Hour={true}
            display="default"
            onChange={onStartTimeChange}
          />
        )}

        <Text style={styles.label}>{t('addSession.endTime')}</Text>
        <TouchableOpacity 
          onPress={() => startTimeSet && setShowEndPicker(true)} 
          style={[styles.timeButton, !startTimeSet && styles.timeButtonDisabled]}
          disabled={!startTimeSet}
        >
          <Text style={[styles.timeButtonText, !startTimeSet && styles.timeButtonTextDisabled]}>
            {formatTime(endTime)}
          </Text>
        </TouchableOpacity>
        {!startTimeSet && (
          <Text style={styles.helperText}>{t('addSession.selectStartFirst')}</Text>
        )}
        {showEndPicker && (
          <DateTimePicker
            value={endTime}
            mode="time"
            is24Hour={true}
            display="default"
            onChange={onEndTimeChange}
            minimumDate={startTime}
          />
        )}

        <TouchableOpacity style={styles.buttonPrimary} onPress={addSession}>
          <Text style={styles.buttonPrimaryText}>{t('addSession.add')}</Text>
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
  pickerContainer: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.space[4],
  },
  picker: {
    color: theme.colors.text.primary,
  },
  pickerItem: {
    color: theme.colors.text.primary,
  },
  timeButton: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.space[3],
    marginBottom: theme.space[4],
  },
  timeButtonDisabled: {
    backgroundColor: theme.colors.disabled || '#E5E7EB',
    borderColor: theme.colors.disabled || '#E5E7EB',
    opacity: 0.6,
  },
  timeButtonText: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.primary,
  },
  timeButtonTextDisabled: {
    color: theme.colors.text.secondary || '#9CA3AF',
  },
  helperText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary || '#9CA3AF',
    fontStyle: 'italic',
    marginTop: -theme.space[3],
    marginBottom: theme.space[4],
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