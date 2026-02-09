import React, { useEffect, useState, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { dataService } from '../lib/dataService';
import { syncService } from '../lib/syncService';
import { authManager } from '../lib/authManager';
import { useTranslation } from '../contexts/LanguageContext';
import { theme } from '../lib/theme';

export default function HomeScreen({ navigation }: any) {
  const { t, language, translateDay } = useTranslation();
  const [clubs, setClubs] = useState<any[]>([]);
  const [selectedClub, setSelectedClub] = useState<any>(null);
  const [upcomingSessions, setUpcomingSessions] = useState<any[]>([]);
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const wasSyncingRef = useRef(false);

  useEffect(() => {
    const init = async () => {
      await checkAuth();
      await fetchData();
    };
    init();
  }, []); // Only run once on mount

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchData();
      // Always refetch sessions to update attendance counts
      if (selectedClub) {
        fetchSessionsForClub(selectedClub);
      }
    });
    return unsubscribe;
  }, [navigation, selectedClub]); // Include selectedClub to refetch sessions

  // Start auto-sync when authenticated
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    
    if (isAuthenticated) {
      // Start auto-sync
      syncService.startAutoSync();
      
      // Subscribe to sync status
      unsubscribe = syncService.onSyncStatusChange((status) => {
        const wasSyncing = wasSyncingRef.current;
        wasSyncingRef.current = status.isSyncing;
        setIsSyncing(status.isSyncing);
        
        if (status.isSyncing) {
          setSyncStatus(t('home.syncing'));
        } else if (status.lastSync) {
          const minutes = Math.floor((Date.now() - status.lastSync.getTime()) / 60000);
          setSyncStatus(minutes === 0 ? t('home.synced') : `${t('home.sync')} ${minutes}min`);
          
          // Refresh data when sync completes
          if (wasSyncing && !status.isSyncing) {
            fetchData();
          }
        }
      });
    }
    
    return () => {
      if (unsubscribe) unsubscribe();
      if (isAuthenticated) {
        syncService.stopAutoSync();
      }
    };
  }, [isAuthenticated]);

  const checkAuth = async () => {
    const isAuth = await authManager.isAuthenticated();
    setIsAuthenticated(isAuth);
  };

  const fetchData = async () => {
    // Get local data immediately - no waiting for cloud
    const clubsData = await dataService.getClubs();
    setClubs(clubsData);

    if (clubsData.length === 0) {
      setSelectedClub(null);
      setUpcomingSessions([]);
      return;
    }

    // Determine which club to use
    let clubToUse = selectedClub;
    let shouldUpdateState = false;
    
    if (!selectedClub || !clubsData.find(c => c.id === selectedClub.id)) {
      // No club selected or selected club doesn't exist - select first one
      clubToUse = clubsData[0];
      shouldUpdateState = true;
    } else {
      // Refresh with latest data
      const refreshedClub = clubsData.find(c => c.id === selectedClub.id);
      if (refreshedClub) {
        clubToUse = refreshedClub;
        // Only update state if data actually changed
        if (JSON.stringify(refreshedClub) !== JSON.stringify(selectedClub)) {
          shouldUpdateState = true;
        }
      }
    }
    
    // Update state only if needed
    if (shouldUpdateState) {
      setSelectedClub(clubToUse);
    }

    // Fetch sessions for selected club
    await fetchSessionsForClub(clubToUse);
  };

  const fetchSessionsForClub = async (club: any) => {
    const sessions = await dataService.getSessions(club.id);
    const now = new Date();
    const upcomingBasic = [];
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

    // First pass: generate all upcoming sessions without counts
    for (const session of sessions) {
      const dayIndex = getDayIndex(session.day_of_week);      
      if (dayIndex === -1) {
        continue; // Skip this session if day is not recognized
      }
      
      // Generate multiple weeks of this session (including the most recent past occurrence)
      for (let week = -1; week < weeksToGenerate; week++) {
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
        
        // Check if attendance has been recorded for this session
        const sessionDate = nextDate.toISOString().split('T')[0];
        const attendance = await dataService.getAttendance(session.id, sessionDate);
        const hasAttendance = attendance && attendance.length > 0;
        
        // If no attendance recorded, keep open for 24h; otherwise 3h after end
        const expirationHours = hasAttendance ? 3 : 24;
        const expirationTime = new Date(sessionEnd.getTime() + expirationHours * 60 * 60 * 1000);
        
        // Skip if this session's expiration window has passed
        if (expirationTime <= now) {
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
          displayDate = language === 'fr' ? 'Aujourd\'hui' : 'Today';
        } else if (nextDateOnly.getTime() === tomorrow.getTime()) {
          displayDate = language === 'fr' ? 'Demain' : 'Tomorrow';
        } else {
          // Include day of week in the display
          displayDate = nextDate.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { 
            weekday: 'long',
            day: 'numeric', 
            month: 'long'
          });
          // Capitalize first letter
          displayDate = displayDate.charAt(0).toUpperCase() + displayDate.slice(1);
        }
        
        upcomingBasic.push({ 
          ...session, 
          club, 
          date: nextDate.toISOString().split('T')[0], 
          displayDate, 
          dateObj: nextDate 
        });
      }
    }

    // Sort by date and time
    upcomingBasic.sort((a, b) => {
      if (a.dateObj.getTime() !== b.dateObj.getTime()) return a.dateObj.getTime() - b.dateObj.getTime();
      return a.start_time.localeCompare(b.start_time);
    });

    // Take top 10
    const top10 = upcomingBasic.slice(0, 10);

    // Second pass: fetch all counts in parallel
    const upcomingWithCounts = await Promise.all(
      top10.map(async (session) => {
        const [attendanceInfo, assignedCount] = await Promise.all([
          getAttendanceInfo(session, session.date),
          getAssignedCount(session)
        ]);
        return { ...session, presentCount: attendanceInfo.presentCount, assignedCount, hasAttendance: attendanceInfo.hasAttendance };
      })
    );

    setUpcomingSessions(upcomingWithCounts);
  };

  const getAttendanceInfo = async (session: any, date: any) => {
    try {
      const attendance = await dataService.getAttendance(session.id, date);
      return {
        presentCount: attendance.filter(a => a.present).length,
        hasAttendance: attendance && attendance.length > 0
      };
    } catch (error) {
      return { presentCount: 0, hasAttendance: false };
    }
  };

  const getAssignedCount = async (session: any) => {
    try {
      const participants = await dataService.getParticipantsWithSessions(session.club_id);
      return participants.filter(p => p.preferred_session_ids?.includes(session.id)).length;
    } catch (error) {
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
            <Text style={styles.title}>{t('home.noClubs')}</Text>
            <Text style={styles.subtitle}>{t('home.createFirst')}</Text>
            <View style={styles.buttonContainer}>
              <TouchableOpacity 
                style={[styles.buttonPrimary, isSyncing && styles.buttonDisabled]} 
                onPress={() => navigation.navigate('CreateClub')}
                disabled={isSyncing}
              >
                <Text style={styles.buttonPrimaryText}>{t('home.createClub')}</Text>
              </TouchableOpacity>
              {isAuthenticated && (
                <TouchableOpacity 
                  style={[styles.buttonSecondary, { marginTop: 12 }, isSyncing && styles.buttonDisabled]} 
                  onPress={() => navigation.navigate('JoinClub')}
                  disabled={isSyncing}
                >
                  <Text style={styles.buttonSecondaryText}>{t('home.joinClub')}</Text>
                </TouchableOpacity>
              )}
            </View>
            {isSyncing && (
              <Text style={styles.syncingText}>{t('home.syncing')}</Text>
            )}
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
            <TouchableOpacity onPress={() => syncService.syncNow()}>
              <Text style={styles.syncStatus}>
                {syncStatus}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        {clubs.length <= 1 && <View style={styles.headerSpacer} />}
      </View>

      {/* Sessions List */}
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>{t('home.upcomingSessions')}</Text>
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
            
            // Session is active 2h before start
            // Expiration: 3h after end if attendance recorded, 24h if not
            const activationTime = new Date(sessionStart.getTime() - 2 * 60 * 60 * 1000); // 2h before
            const expirationHours = item.hasAttendance ? 3 : 24;
            const expirationTime = new Date(sessionEnd.getTime() + expirationHours * 60 * 60 * 1000);
            
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
          ListEmptyComponent={<Text style={styles.emptyText}>{t('home.noSessions')}</Text>}
        />

        <View style={styles.manageButtonContainer}>
          <TouchableOpacity 
            style={styles.manageClubButton} 
            onPress={() => {
              if (clubs.length === 1) {
                navigation.navigate('ClubDetails', { club: clubs[0] });
              } else {
                navigation.navigate('ClubList');
              }
            }}
          >
            <Text style={styles.manageClubButtonText}>{t('club.administration')}</Text>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  syncingText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    marginTop: theme.space[3],
  },
});