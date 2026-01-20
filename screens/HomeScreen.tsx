import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { dataService } from '../lib/dataService';
import { syncService } from '../lib/syncService';
import { authManager } from '../lib/authManager';
import { theme } from '../lib/theme';

export default function HomeScreen({ navigation }: any) {
  const [clubs, setClubs] = useState<any[]>([]);
  const [selectedClub, setSelectedClub] = useState<any>(null);
  const [upcomingSessions, setUpcomingSessions] = useState<any[]>([]);
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    console.log('[HomeScreen] Component mounted');
    checkAuth();
    fetchData();
  }, []);

  useEffect(() => {
    console.log('[HomeScreen] Adding focus listener');
    const unsubscribe = navigation.addListener('focus', () => {
      console.log('[HomeScreen] Screen focused, fetching data');
      fetchData();
    });
    return unsubscribe;
  }, [navigation]);

  // Start auto-sync when authenticated
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    
    if (isAuthenticated) {
      console.log('[HomeScreen] User authenticated, starting auto-sync');
      // Start auto-sync
      syncService.startAutoSync();
      
      // Subscribe to sync status
      unsubscribe = syncService.onSyncStatusChange((status) => {
        if (status.isSyncing) {
          setSyncStatus('Synchronisation...');
        } else if (status.lastSync) {
          const minutes = Math.floor((Date.now() - status.lastSync.getTime()) / 60000);
          setSyncStatus(minutes === 0 ? 'Synchronisé' : `Sync il y a ${minutes}min`);
        }
      });
    } else {
      console.log('[HomeScreen] User not authenticated, skipping auto-sync');
    }
    
    return () => {
      if (unsubscribe) unsubscribe();
      if (isAuthenticated) {
        syncService.stopAutoSync();
      }
    };
  }, [isAuthenticated]);

  const checkAuth = async () => {
    console.log('[HomeScreen] checkAuth called');
    const isAuth = await authManager.isAuthenticated();
    console.log('[HomeScreen] isAuthenticated:', isAuth);
    setIsAuthenticated(isAuth);
  };

  const fetchData = async () => {
    const clubsData = await dataService.getClubs();
    setClubs(clubsData);

    if (clubsData.length === 0) {
      setSelectedClub(null);
      setUpcomingSessions([]);
      return;
    }

    // If no club selected or selected club doesn't exist, select first one
    // If club exists, refresh it with latest data (including stats_reset_date)
    let clubToUse = selectedClub;
    if (!selectedClub || !clubsData.find(c => c.id === selectedClub.id)) {
      clubToUse = clubsData[0];
      setSelectedClub(clubsData[0]);
    } else {
      // Refresh selected club with latest data
      const refreshedClub = clubsData.find(c => c.id === selectedClub.id);
      if (refreshedClub) {
        clubToUse = refreshedClub;
        setSelectedClub(refreshedClub);
      }
    }

    // Fetch sessions for selected club
    await fetchSessionsForClub(clubToUse);
  };

  const fetchSessionsForClub = async (club: any) => {
    console.log('[HomeScreen] Fetching sessions for club:', club.id, club.name);
    const sessions = await dataService.getSessions(club.id);
    console.log('[HomeScreen] Found sessions:', sessions.length, sessions);
    const now = new Date();
    const upcoming = [];
    const weeksToGenerate = 4; // Generate 4 weeks of sessions

    // Helper to get day index, handling both French and English
    const getDayIndex = (dayName: string) => {
      const frenchDays = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
      const englishDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      
      let index = frenchDays.indexOf(dayName);
      if (index === -1) {
        index = englishDays.indexOf(dayName);
      }
      return index;
    };

    for (const session of sessions) {
      const dayIndex = getDayIndex(session.day_of_week);      
      if (dayIndex === -1) {
        console.warn('Unknown day name:', session.day_of_week);
        continue; // Skip this session if day is not recognized
      }
      
      // Generate multiple weeks of this session
      for (let week = 0; week < weeksToGenerate; week++) {
        // Calculate days until next occurrence of this day
        const daysUntilNext = (dayIndex - now.getDay() + 7) % 7;
        let nextDate = new Date(now);
        nextDate.setDate(now.getDate() + daysUntilNext + (week * 7));
        
        // Parse session time
        const [hours, minutes] = session.start_time.split(':').map(Number);
        const sessionTime = new Date(nextDate);
        sessionTime.setHours(hours, minutes, 0, 0);
        
        // Parse end time to check expiration window
        const [endHours, endMinutes] = session.end_time.split(':').map(Number);
        const sessionEnd = new Date(nextDate);
        sessionEnd.setHours(endHours, endMinutes, 0, 0);
        const expirationTime = new Date(sessionEnd.getTime() + 3 * 60 * 60 * 1000); // 3h after end
        
        // Skip if this session's expiration window has passed
        if (expirationTime <= now) {
          console.info(`HomeScreen: skipping expired session ${session.day_of_week} ${session.start_time} (expired at ${expirationTime.toLocaleString('fr-FR')})`);
          continue;
        }
        
        // Determine display date
        let displayDate;
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const nextDateOnly = new Date(nextDate);
        nextDateOnly.setHours(0, 0, 0, 0);
        const todayOnly = new Date(now);
        todayOnly.setHours(0, 0, 0, 0);
        
        if (nextDateOnly.getTime() === todayOnly.getTime()) {
          displayDate = 'Aujourd\'hui';
        } else if (nextDateOnly.getTime() === tomorrow.getTime()) {
          displayDate = 'Demain';
        } else {
          // Include day of week in the display
          displayDate = nextDate.toLocaleDateString('fr-FR', { 
            weekday: 'long',
            day: 'numeric', 
            month: 'long'
          });
          // Capitalize first letter
          displayDate = displayDate.charAt(0).toUpperCase() + displayDate.slice(1);
        }
        
        const presentCount = await getPresentCount(session, nextDate.toISOString().split('T')[0]);
        const assignedCount = await getAssignedCount(session);
        upcoming.push({ ...session, club, date: nextDate.toISOString().split('T')[0], displayDate, dateObj: nextDate, presentCount, assignedCount });
      }
    }

    // Sort by date and time
    upcoming.sort((a, b) => {
      if (a.dateObj.getTime() !== b.dateObj.getTime()) return a.dateObj.getTime() - b.dateObj.getTime();
      return a.start_time.localeCompare(b.start_time);
    });

    setUpcomingSessions(upcoming.slice(0, 10)); // Show next 10
  };

  const getPresentCount = async (session: any, date: any) => {
    try {
      const attendance = await dataService.getAttendance(session.id, date);
      const presentCount = attendance.filter(a => a.status === 'present').length;
      return presentCount;
    } catch (error) {
      console.error('Error getting present count:', error);
      return 0;
    }
  };

  const getAssignedCount = async (session: any) => {
    try {
      const participants = await dataService.getParticipantsWithSessions(session.club_id);
      return participants.filter(p => p.preferred_session_ids?.includes(session.id)).length;
    } catch (error) {
      console.error('Error getting assigned count:', error);
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
      <View style={styles.screenContainer}>
        <View style={styles.container}>
            <Text style={styles.title}>Aucun club pour le moment</Text>
            <Text style={styles.subtitle}>Créez votre premier club !</Text>
            <View style={styles.buttonContainer}>
              <TouchableOpacity style={styles.buttonPrimary} onPress={() => navigation.navigate('CreateClub')}>
                <Text style={styles.buttonPrimaryText}>Créer un club</Text>
              </TouchableOpacity>
              {isAuthenticated && (
                <TouchableOpacity 
                  style={[styles.buttonSecondary, { marginTop: 12 }]} 
                  onPress={() => navigation.navigate('JoinClub')}
                >
                  <Text style={styles.buttonSecondaryText}>Rejoindre un club</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
      </View>
    );
  }

  return (
    <View style={styles.screenContainer}>
      {/* Club Header */}
      <View style={styles.clubHeader}>
        <View style={styles.clubHeaderContent}>
          <View style={styles.logoContainer}>
            <View style={styles.clubLogo}>
              <Feather name="users" size={40} color="#FFFFFF" />
            </View>
            {clubs.length > 1 && (
              <TouchableOpacity onPress={switchClub} style={styles.switchButton}>
                <Feather name="refresh-cw" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.clubName}>{selectedClub?.name}</Text>
          {isAuthenticated && syncStatus && (
            <Text style={styles.syncStatus}>
              {syncStatus}
            </Text>
          )}
        </View>
        {clubs.length <= 1 && <View style={styles.headerSpacer} />}
      </View>

      {/* Sessions List */}
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Sessions à venir</Text>
        <FlatList
          data={upcomingSessions}
          keyExtractor={(item) => `${item.id}-${item.date}`}
          renderItem={({ item }) => {
            const now = new Date();
            
            // Parse session date and time
            const [startHours, startMinutes] = item.start_time.split(':').map(Number);
            const [endHours, endMinutes] = item.end_time.split(':').map(Number);
            
            const sessionStart = new Date(item.date + 'T00:00:00');
            sessionStart.setHours(startHours, startMinutes, 0, 0);
            
            const sessionEnd = new Date(item.date + 'T00:00:00');
            sessionEnd.setHours(endHours, endMinutes, 0, 0);
            
            // Session is active 2h before start and up to 3h after end
            const activationTime = new Date(sessionStart.getTime() - 2 * 60 * 60 * 1000); // 2h before
            const expirationTime = new Date(sessionEnd.getTime() + 3 * 60 * 60 * 1000); // 3h after
            
            const isActive = now >= activationTime && now <= expirationTime;
            
            return (
              <TouchableOpacity
                style={[styles.sessionItem, !isActive && styles.sessionItemDisabled]}
                onPress={() => {
                  if (isActive) {
                    const { dateObj, ...sessionWithoutDate } = item;
                    navigation.navigate('Attendance', { 
                      session: sessionWithoutDate, 
                      date: item.date
                    });
                  }
                }}
                disabled={!isActive}
              >
                <View style={styles.sessionContent}>
                  <View style={styles.sessionLeft}>
                    <View style={styles.dateContainer}>
                      <Feather name="calendar" size={20} color={isActive ? theme.colors.text.primary : theme.colors.text.secondary} style={[!isActive && styles.iconDisabled]} />
                      <Text style={[styles.dateText, !isActive && styles.textDisabled]}>{item.displayDate}</Text>
                    </View>
                    <View style={styles.timeContainer}>
                      <Feather name="clock" size={20} color={isActive ? theme.colors.text.secondary : theme.colors.text.secondary} style={[!isActive && styles.iconDisabled]} />
                      <Text style={[styles.timeText, !isActive && styles.textDisabled]}>
                        {item.start_time}-{item.end_time}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.presentCountContainer}>
                    <Text style={[styles.presentCountText, !isActive && styles.textDisabled]}>
                      {item.presentCount || 0} / {item.assignedCount || 0}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<Text style={styles.emptyText}>Aucune session à venir</Text>}
        />

        <View style={styles.manageButtonContainer}>
          <TouchableOpacity style={styles.manageClubButton} onPress={() => navigation.navigate('ClubList')}>
            <Text style={styles.manageClubButtonText}>Gérer le club</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: { flex: 1, backgroundColor: theme.colors.primary[900] },
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
  clubName: {
    fontSize: theme.typography.fontSize.xl * 1.2,
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  headerSpacer: {
    width: theme.space[7],
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
  sessionItemDisabled: {
    opacity: 0.75,
    backgroundColor: theme.colors.bg,
    transform: [{ scale: 0.95 }],
  },
  textDisabled: {
    color: theme.colors.text.secondary,
    opacity: 0.8,
  },
  iconDisabled: {
    opacity: 0.6,
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
    gap: theme.space[2],
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
    gap: theme.space[2],
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
  manageClubButton: {
    borderWidth: 1,
    borderColor: theme.colors.primary[700],
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.space[3],
    paddingHorizontal: theme.space[4],
    alignItems: 'center',
  },
  manageClubButtonText: {
    color: theme.colors.primary[700],
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.medium,
  },
  syncStatus: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.8,
    marginTop: 4,
    textAlign: 'center',
  },
});