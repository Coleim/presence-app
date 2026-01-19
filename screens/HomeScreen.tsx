import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { dataService } from '../lib/dataService';
import { theme } from '../lib/theme';

export default function HomeScreen({ navigation }) {
  const [clubs, setClubs] = useState([]);
  const [selectedClub, setSelectedClub] = useState(null);
  const [upcomingSessions, setUpcomingSessions] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchData();
    });
    return unsubscribe;
  }, [navigation]);

  const fetchData = async () => {
    console.log('HomeScreen: fetchData called');
    const clubsData = await dataService.getClubs();
    console.log('HomeScreen: clubs loaded:', clubsData.length);
    setClubs(clubsData);

    if (clubsData.length === 0) {
      setSelectedClub(null);
      setUpcomingSessions([]);
      return;
    }

    // If no club selected or selected club doesn't exist, select first one
    let clubToUse = selectedClub;
    if (!selectedClub || !clubsData.find(c => c.id === selectedClub.id)) {
      clubToUse = clubsData[0];
      setSelectedClub(clubsData[0]);
    }

    // Fetch sessions for selected club
    await fetchSessionsForClub(clubToUse);
  };

  const fetchSessionsForClub = async (club) => {
    console.log('HomeScreen: fetchSessionsForClub called for club:', club.name);
    const sessions = await dataService.getSessions(club.id);
    console.log('HomeScreen: sessions loaded:', sessions.length);
    const now = new Date();
    const upcoming = [];

    for (const session of sessions) {
      console.log('HomeScreen: processing session:', session.day_of_week, session.start_time);
      const dayIndex = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'].indexOf(session.day_of_week);
      console.log('HomeScreen: dayIndex for', session.day_of_week, 'is', dayIndex);
      let nextDate = new Date(now);
      nextDate.setDate(now.getDate() + (dayIndex - now.getDay() + 7) % 7);

      if (nextDate <= now && nextDate.toDateString() === now.toDateString()) {
        // Today, check if session is upcoming
        const [hours, minutes] = session.start_time.split(':').map(Number);
        const sessionTime = new Date(nextDate);
        sessionTime.setHours(hours, minutes, 0, 0);
        if (sessionTime > now) {
          const presentCount = await getPresentCount(session, nextDate.toISOString().split('T')[0]);
          upcoming.push({ ...session, club, date: nextDate, displayDate: 'Aujourd\'hui', dateObj: nextDate, presentCount });
        }
      } else if (nextDate > now) {
        // Future session
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);

        let displayDate;
        if (nextDate.toDateString() === tomorrow.toDateString()) {
          displayDate = 'Demain';
        } else {
          displayDate = nextDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
        }

        const presentCount = await getPresentCount(session, nextDate.toISOString().split('T')[0]);
        upcoming.push({ ...session, club, date: nextDate.toISOString().split('T')[0], displayDate, dateObj: nextDate, presentCount });
      }
    }

    // Sort by date and time
    upcoming.sort((a, b) => {
      if (a.dateObj.getTime() !== b.dateObj.getTime()) return a.dateObj.getTime() - b.dateObj.getTime();
      return a.start_time.localeCompare(b.start_time);
    });

    console.log('HomeScreen: upcoming sessions found:', upcoming.length);
    setUpcomingSessions(upcoming.slice(0, 10)); // Show next 10
  };

  const getPresentCount = async (session, date) => {
    try {
      const attendance = await dataService.getAttendance(session.id, date);
      return attendance.filter(a => a.status === 'present').length;
    } catch (error) {
      console.error('Error getting present count:', error);
      return 0;
    }
  };

  const switchClub = () => {
    if (clubs.length <= 1) return;

    const currentIndex = clubs.findIndex(c => c.id === selectedClub.id);
    const nextIndex = (currentIndex + 1) % clubs.length;
    const nextClub = clubs[nextIndex];
    setSelectedClub(nextClub);
    fetchSessionsForClub(nextClub);
  };

  if (clubs.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <Text style={styles.title}>Aucun club pour le moment</Text>
          <Text style={styles.subtitle}>Créez votre premier club !</Text>
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.buttonPrimary} onPress={() => navigation.navigate('CreateClub')}>
              <Text style={styles.buttonPrimaryText}>Créer un club</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Club Header */}
      <View style={styles.clubHeader}>
        <View style={styles.clubHeaderContent}>
          <View style={styles.logoContainer}>
            <View style={styles.clubLogo}>
              <Text style={styles.clubLogoText}>🏆</Text>
            </View>
            {clubs.length > 1 && (
              <TouchableOpacity onPress={switchClub} style={styles.switchButton}>
                <Text style={styles.switchText}>🔄</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.clubName}>{selectedClub?.name}</Text>
        </View>
        {clubs.length <= 1 && <View style={styles.headerSpacer} />}
      </View>

      {/* Sessions List */}
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Sessions à venir</Text>
        <FlatList
          data={upcomingSessions}
          keyExtractor={(item) => `${item.id}-${item.date}`}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.sessionItem}
              onPress={() => navigation.navigate('Attendance', { session: item, date: item.date })}
            >
              <View style={styles.sessionContent}>
                <View style={styles.sessionLeft}>
                  <View style={styles.dateContainer}>
                    <Text style={styles.calendarIcon}>📅</Text>
                    <Text style={styles.dateText}>{item.displayDate}</Text>
                  </View>
                  <View style={styles.timeContainer}>
                    <Text style={styles.clockIcon}>🕐</Text>
                    <Text style={styles.timeText}>
                      {item.start_time}-{item.end_time}
                    </Text>
                  </View>
                </View>
                <View style={styles.presentCountContainer}>
                  <Text style={styles.presentCountText}>
                    {item.presentCount || 0} présents
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>Aucune session à venir</Text>}
        />

        <View style={styles.manageButtonContainer}>
          <TouchableOpacity style={styles.buttonSecondary} onPress={() => navigation.navigate('ClubList')}>
            <Text style={styles.buttonSecondaryText}>Gérer les clubs</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.primary[900] },
  clubHeader: {
    backgroundColor: theme.colors.primary[900],
    paddingHorizontal: theme.space[4],
    paddingVertical: theme.space[3],
  },
  clubHeaderContent: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.space[2],
    width: '100%',
    position: 'relative',
  },
  clubLogo: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchButton: {
    position: 'absolute',
    right: 0,
    padding: theme.space[2],
  },
  clubLogoText: {
    fontSize: theme.typography.fontSize.xl * 1.5,
  },
  clubName: {
    fontSize: theme.typography.fontSize.xl * 1.2,
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  headerSpacer: {
    width: theme.space[8],
  },
  switchButton: {
    padding: theme.space[2],
  },
  switchText: {
    fontSize: theme.typography.fontSize.lg,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    padding: theme.space[4]
  },
  title: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.space[2],
  },
  subtitle: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.secondary,
    marginBottom: theme.space[5],
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.space[3],
  },
  sessionItem: {
    backgroundColor: theme.colors.surface,
    marginBottom: theme.space[2],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.space[4],
  },
  sessionContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    position: 'relative',
  },
  sessionLeft: {
    flex: 1,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.space[2],
  },
  calendarIcon: {
    fontSize: theme.typography.fontSize.lg,
    marginRight: theme.space[2],
  },
  dateText: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.space[2],
  },
  clockIcon: {
    fontSize: theme.typography.fontSize.lg,
    marginRight: theme.space[2],
  },
  timeText: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.secondary,
  },
  dayText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    fontWeight: theme.typography.fontWeight.medium,
    marginBottom: theme.space[1],
  },
  presentCountText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.success,
    fontWeight: theme.typography.fontWeight.medium,
    marginTop: theme.space[1],
  },
  presentCountContainer: {
    position: 'absolute',
    top: theme.space[2],
    right: theme.space[2],
  },
  manageButtonContainer: {
    marginTop: theme.space[4],
  },
  emptyText: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    marginTop: theme.space[6],
  },
  buttonContainer: {
    marginTop: theme.space[5],
    marginBottom: theme.space[5]
  },
  buttonPrimary: theme.components.buttonPrimary,
  buttonPrimaryText: {
    color: theme.colors.surface,
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  buttonSecondary: theme.components.buttonSecondary,
  buttonSecondaryText: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSize.md,
  },
});