import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Share, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { dataService } from '../lib/dataService';
import { theme } from '../lib/theme';
import { useTranslation } from '../contexts/LanguageContext';

export default function AttendanceScreen({ route, navigation }: any) {
  const { t, language, translateDay } = useTranslation();
  const { session, date } = route.params;
  const [participants, setParticipants] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any>({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {    
    // Load participants first
    const data = await dataService.getParticipantsWithSessions(session.club_id);
    
    // Sort participants: 1) Preferred session first, 2) By last name
    const sortedData = data.sort((a, b) => {
      const aIsPreferred = a.preferred_session_ids?.includes(session.id) || false;
      const bIsPreferred = b.preferred_session_ids?.includes(session.id) || false;
      
      // First sort by preferred session (preferred first)
      if (aIsPreferred && !bIsPreferred) return -1;
      if (!aIsPreferred && bIsPreferred) return 1;
      
      // Then sort alphabetically by last name
      return a.last_name.localeCompare(b.last_name);
    });
    
    setParticipants(sortedData);
    
    // Initialize attendance as absent
    const init: any = {};
    sortedData.forEach(p => init[p.id] = false);
    
    // Load existing attendance and merge with init
    const existingData = await dataService.getAttendance(session.id, date);
    existingData.forEach(a => {
      init[a.participant_id] = a.present;
    });
    
    setAttendance(init);
  };

  const toggleAttendance = (id: any) => {
    setAttendance((prev: any) => ({ ...prev, [id]: !prev[id] }));
  };

  const saveAttendance = async () => {
    const records = Object.keys(attendance).map(pid => ({
      session_id: session.id,
      participant_id: pid,
      date,
      present: attendance[pid]
    }));
    dataService.checkOnline();
    // Wait for local save (fast), cloud sync happens in background
    await dataService.saveAttendance(records);
    // Navigate after local save completes
    navigation.goBack();
  };

  const shareAttendance = async () => {
    try {
      const presentParticipants = participants.filter(p => attendance[p.id]);
      const absentParticipants = participants.filter(p => !attendance[p.id] && p.preferred_session_ids?.includes(session.id));
      
      const formattedDate = new Date(date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'long',
        year: 'numeric'
      });
      
      let message = `${t('attendance.shareTitle')} ${formattedDate}\n`;
      message += `${translateDay(session.day_of_week)} ${session.start_time} à ${session.end_time}\n\n`;
      message += `${t('attendance.sharePresent')} (${presentCount}/${assignedParticipantsCount}):\n`;
      
      if (presentParticipants.length > 0) {
        presentParticipants.forEach(p => {
          message += `  • ${p.first_name} ${p.last_name.toUpperCase()}\n`;
        });
      } else {
        message += `  ${t('attendance.noPresent')}\n`;
      }
      
      if (absentParticipants.length > 0) {
        message += `\n${t('attendance.shareAbsent')} (${absentParticipants.length}):\n`;
        absentParticipants.forEach(p => {
          message += `  • ${p.first_name} ${p.last_name.toUpperCase()}\n`;
        });
      }
      
      const result = await Share.share({
        message: message,
      });
      
      if (result.action === Share.sharedAction) {
        // Successfully shared
      }
    } catch (error: any) {
      Alert.alert(t('common.error'), t('attendance.errorSharing'));
    }
  };

  const uncheckAll = () => {
    const resetAttendance: any = {};
    participants.forEach(p => resetAttendance[p.id] = false);
    setAttendance(resetAttendance);
  };

  const presentCount = Object.values(attendance).filter(Boolean).length;
  const assignedParticipantsCount = participants.filter(p => 
    p.preferred_session_ids?.includes(session.id)
  ).length;

  return (
    <View style={styles.container}>
      {/* Header Container */}
      <View style={styles.headerContainer}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.smallBackButton}>
            <Text style={styles.smallBackButtonText}>{t('common.back')}</Text>
          </TouchableOpacity>
          {/* Main Header */}
          <View style={styles.mainHeader}>
            <View style={styles.mainHeaderContent}>
              <Text style={styles.mainHeaderTitle}>
                {t('attendance.attendanceOn')} {new Date(date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
              </Text>
              <Text style={styles.sessionTime}>
                {session.start_time} - {session.end_time}
              </Text>
            </View>
          </View>
        </View>

        {/* Attendance Header with count and uncheck button */}
      <View style={styles.attendanceHeader}>
          <Text style={styles.presentCountText}>
            {t('attendance.presentCount')}: {presentCount} / {assignedParticipantsCount}
          </Text>
          <TouchableOpacity style={styles.uncheckButton} onPress={uncheckAll}>
            <Text style={styles.uncheckButtonText}>{t('attendance.uncheckAll')}</Text>
          </TouchableOpacity>
        </View>

      {/* Attendance List */}
      <View style={styles.attendanceList}>
          <FlatList
            data={participants}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => {
              const isAssignedSession = item.preferred_session_ids?.includes(session.id) || false;
              return (
                <TouchableOpacity
                  onPress={() => toggleAttendance(item.id)}
                  style={[
                    styles.attendanceItem,
                    attendance[item.id] && styles.attendanceItemPresent
                  ]}
                >
                  <View style={[
                    styles.checkbox,
                    attendance[item.id] && styles.checkboxChecked
                  ]}>
                    {attendance[item.id] && <Feather name="check" size={20} color="white" />}
                  </View>
                  <Text style={styles.participantName}>
                    {item.last_name.toUpperCase()} {item.first_name}
                  </Text>
                  {isAssignedSession && (
                    <Feather name="star" size={16} color="#FFB84D" style={styles.assignedBadge} />
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </View>

      {/* Save Button */}
      <View style={styles.saveContainer}>
          <TouchableOpacity style={styles.buttonSecondary} onPress={shareAttendance}>
            <View style={styles.buttonWithIcon}>
              <Feather name="share-2" size={18} color={theme.colors.primary[700]} />
              <Text style={styles.buttonSecondaryText}>Partager</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.buttonPrimary} onPress={saveAttendance}>
            <Text style={styles.buttonPrimaryText}>Enregistrer</Text>
          </TouchableOpacity>
        </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  headerContainer: {
    position: 'relative',
    backgroundColor: theme.colors.primary[900],
    padding: theme.space[4],
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
  presentCountContainer: {
    position: 'absolute',
    right: theme.space[4],
    top: theme.space[3],
  },
  presentCountHeaderText: {
    color: '#FFFFFF',
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.medium,
  },
  mainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.space[4],
  },
  mainHeaderContent: {
    flex: 1,
    alignItems: 'center',
  },
  mainHeaderTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#FFFFFF',
    marginBottom: theme.space[1],
  },
  sessionTime: {
    fontSize: theme.typography.fontSize.md,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  attendanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.space[4],
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  presentCountText: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
  },
  uncheckButton: {
    paddingVertical: theme.space[2],
    paddingHorizontal: theme.space[3],
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
  },
  uncheckButtonText: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
  },
  attendanceList: { flex: 1 },
  attendanceItem: theme.components.attendanceItem,
  attendanceItemPresent: theme.components.attendanceItemPresent,
  checkbox: theme.components.checkbox,
  checkboxChecked: theme.components.checkboxChecked,
  checkmark: {
    color: theme.colors.surface,
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  participantName: {
    flex: 1,
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
    marginLeft: theme.space[3],
  },
  assignedBadge: {
    marginLeft: theme.space[2],
  },
  saveContainer: { 
    marginTop: theme.space[5], 
    marginBottom: theme.space[5], 
    paddingHorizontal: theme.space[4],
    flexDirection: 'row',
    gap: theme.space[3],
  },
  buttonWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
  },
  buttonPrimary: {
    ...theme.components.buttonPrimary,
    flex: 1,
  },
  buttonSecondary: {
    ...theme.components.buttonSecondary,
    flex: 1,
  },
  buttonPrimaryText: {
    color: theme.colors.surface,
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  buttonSecondaryText: {
    color: theme.colors.primary[700],
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.medium,
  },
});