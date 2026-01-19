import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { dataService } from '../lib/dataService';
import { theme } from '../lib/theme';

export default function AttendanceScreen({ route, navigation }) {
  const { session, date } = route.params;
  const [participants, setParticipants] = useState([]);
  const [attendance, setAttendance] = useState({});

  useEffect(() => {
    fetchParticipants();
    fetchExistingAttendance();
  }, []);

  const fetchParticipants = async () => {
    const data = await dataService.getParticipants(session.club_id);
    setParticipants(data);
    // Initialize attendance as absent
    const init = {};
    data.forEach(p => init[p.id] = false);
    setAttendance(init);
  };

  const fetchExistingAttendance = async () => {
    const data = await dataService.getAttendance(session.id, date);
    const existing = {};
    data.forEach(a => existing[a.participant_id] = a.status === 'present');
    setAttendance(prev => ({ ...prev, ...existing }));
  };

  const toggleAttendance = (id) => {
    setAttendance(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const saveAttendance = async () => {
    const records = Object.keys(attendance).map(pid => ({
      session_id: session.id,
      participant_id: pid,
      date,
      status: attendance[pid] ? 'present' : 'absent'
    }));
    await dataService.saveAttendance(records);
    navigation.goBack();
  };

  const uncheckAll = () => {
    const resetAttendance = {};
    participants.forEach(p => resetAttendance[p.id] = false);
    setAttendance(resetAttendance);
  };

  const presentCount = Object.values(attendance).filter(Boolean).length;
  const totalCount = participants.length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header Container */}
        <View style={styles.headerContainer}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.smallBackButton}>
            <Text style={styles.smallBackButtonText}>← Retour</Text>
          </TouchableOpacity>
          {/* Main Header */}
          <View style={styles.mainHeader}>
            <View style={styles.mainHeaderContent}>
              <Text style={styles.mainHeaderTitle}>
                Présence du {new Date(date).toLocaleDateString('fr-FR', {
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
            Présents: {presentCount}
          </Text>
          <TouchableOpacity style={styles.uncheckButton} onPress={uncheckAll}>
            <Text style={styles.uncheckButtonText}>Tout décocher</Text>
          </TouchableOpacity>
        </View>

        {/* Attendance List */}
        <View style={styles.attendanceList}>
          <FlatList
            data={participants}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
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
                  {attendance[item.id] && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.participantName}>
                  {item.first_name} {item.last_name}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>

        {/* Save Button */}
        <View style={styles.saveContainer}>
          <TouchableOpacity style={styles.buttonPrimary} onPress={saveAttendance}>
            <Text style={styles.buttonPrimaryText}>Enregistrer</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.bg },
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
  },
  saveContainer: { marginTop: theme.space[5], marginBottom: theme.space[5], paddingHorizontal: theme.space[4] },
  buttonPrimary: theme.components.buttonPrimary,
  buttonPrimaryText: {
    color: theme.colors.surface,
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.semibold,
  },
});