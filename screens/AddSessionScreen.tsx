import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Alert, ScrollView } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { dataService } from '../lib/dataService';
import { usageService } from '../lib/usageService';
import { hasReachedSessionsLimit, getLimitMessage, USAGE_LIMITS, shouldShowWarning } from '../lib/usageLimits';
import { UsageBadge } from '../components/UsageBadge';
import { UpgradePrompt } from '../components/UpgradePrompt';
import { theme } from '../lib/theme';

export default function AddSessionScreen({ route, navigation }) {
  const { clubId } = route.params;
  const [day, setDay] = useState('Lundi');
  const [startTime, setStartTime] = useState(new Date(2000, 0, 1, 9, 0)); // 9:00 AM
  const [endTime, setEndTime] = useState(new Date(2000, 0, 1, 10, 0)); // 10:00 AM
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkSessionLimit();
  }, []);

  const checkSessionLimit = async () => {
    try {
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
    }
  };

  const onEndTimeChange = (event: any, selectedDate?: Date) => {
    setShowEndPicker(Platform.OS === 'ios');
    if (selectedDate) {
      setEndTime(selectedDate);
    }
  };

  const addSession = async () => {
    // Check limit before adding
    if (hasReachedSessionsLimit(sessionCount)) {
      Alert.alert(
        'Limite atteinte',
        getLimitMessage('sessions') + '\n\nPassez à la version Premium pour des créneaux illimités.',
        [{ text: 'OK', style: 'cancel' }]
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
          'Limite atteinte',
          getLimitMessage('sessions') + '\n\nPassez à la version Premium pour des créneaux illimités.'
        );
      } else {
        Alert.alert('Erreur', 'Impossible d\'ajouter la session. Veuillez réessayer.');
      }
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
          <Text style={styles.headerTitle}>Ajouter une session</Text>
        </View>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        {/* Show usage badge */}
        {!isLoading && (
          <UsageBadge
            current={sessionCount}
            limit={USAGE_LIMITS.SESSIONS_PER_CLUB}
            label="Créneaux dans ce club"
          />
        )}

        {/* Show upgrade prompt when approaching or at limit */}
        {!isLoading && shouldShowWarning(sessionCount, USAGE_LIMITS.SESSIONS_PER_CLUB) && (
          <UpgradePrompt
            message={
              hasReachedSessionsLimit(sessionCount)
                ? getLimitMessage('sessions')
                : `Vous approchez de la limite (${sessionCount}/${USAGE_LIMITS.SESSIONS_PER_CLUB})`
            }
            style={styles.upgradePrompt}
          />
        )}

        <Text style={styles.label}>Jour de la semaine</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={day}
            onValueChange={setDay}
            style={styles.picker}
            itemStyle={styles.pickerItem}
          >
            <Picker.Item label="Lundi" value="Lundi" />
            <Picker.Item label="Mardi" value="Mardi" />
            <Picker.Item label="Mercredi" value="Mercredi" />
            <Picker.Item label="Jeudi" value="Jeudi" />
            <Picker.Item label="Vendredi" value="Vendredi" />
            <Picker.Item label="Samedi" value="Samedi" />
            <Picker.Item label="Dimanche" value="Dimanche" />
          </Picker>
        </View>

        <Text style={styles.label}>Heure de début</Text>
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

        <Text style={styles.label}>Heure de fin</Text>
        <TouchableOpacity onPress={() => setShowEndPicker(true)} style={styles.timeButton}>
          <Text style={styles.timeButtonText}>{formatTime(endTime)}</Text>
        </TouchableOpacity>
        {showEndPicker && (
          <DateTimePicker
            value={endTime}
            mode="time"
            is24Hour={true}
            display="default"
            onChange={onEndTimeChange}
          />
        )}

        <TouchableOpacity style={styles.buttonPrimary} onPress={addSession}>
          <Text style={styles.buttonPrimaryText}>Ajouter la session</Text>
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
  timeButtonText: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.primary,
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