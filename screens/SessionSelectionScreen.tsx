import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { dataService } from '../lib/dataService';
import { theme } from '../lib/theme';

export default function SessionSelectionScreen({ route, navigation }) {
  const { club } = route.params;
  const [sessions, setSessions] = useState([]);
  const [upcomingSessions, setUpcomingSessions] = useState([]);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    const data = await dataService.getSessions(club.id);
    setSessions(data);
    // Generate upcoming sessions
    const now = new Date();
    const upcoming = [];
    data.forEach(session => {
      // Find next occurrence
      const dayIndex = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'].indexOf(session.day_of_week);
      let nextDate = new Date(now);
      nextDate.setDate(now.getDate() + (dayIndex - now.getDay() + 7) % 7);
      if (nextDate < now) nextDate.setDate(nextDate.getDate() + 7);
      upcoming.push({ ...session, date: nextDate.toISOString().split('T')[0] });
    });
    setUpcomingSessions(upcoming);
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
          <Text style={styles.headerTitle}>Sélectionner une session</Text>
        </View>
      </View>

      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Sessions disponibles</Text>
        <FlatList
          data={upcomingSessions}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.sessionItem}
              onPress={() => navigation.navigate('Attendance', { session: item, date: item.date })}
            >
              <View style={styles.sessionInfo}>
                <Text style={styles.sessionDay}>{item.day_of_week}</Text>
                <Text style={styles.sessionTime}>
                  {item.start_time} - {item.end_time}
                </Text>
                <Text style={styles.sessionDate}>
                  {new Date(item.date).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long'
                  })}
                </Text>
              </View>
              <Text style={styles.arrowIcon}>→</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>Aucune session disponible</Text>}
        />
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
  sectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.space[3],
  },
  sessionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: theme.space[4],
    marginBottom: theme.space[2],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionDay: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  sessionTime: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    marginTop: theme.space[1],
  },
  sessionDate: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    marginTop: theme.space[1],
  },
  arrowIcon: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.text.secondary,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.secondary,
    marginTop: theme.space[6],
  },
});