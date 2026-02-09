import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { dataService } from '../lib/dataService';
import { theme } from '../lib/theme';
import { useTranslation } from '../contexts/LanguageContext';

export default function SessionSelectionScreen({ route, navigation }) {
  const { t, language } = useTranslation();
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
    
    data.forEach(session => {
      // Find next occurrences (multiple weeks)
      const dayIndex = getDayIndex(session.day_of_week);
      
      if (dayIndex === -1) {
        return; // Skip this session
      }
      
      for (let week = 0; week < weeksToGenerate; week++) {
        const daysUntilNext = (dayIndex - now.getDay() + 7) % 7;
        let nextDate = new Date(now);
        nextDate.setDate(now.getDate() + daysUntilNext + (week * 7));
        
        // Parse session time and check if it has passed
        const [hours, minutes] = session.start_time.split(':').map(Number);
        const sessionTime = new Date(nextDate);
        sessionTime.setHours(hours, minutes, 0, 0);
        
        // Skip if session has already passed
        if (sessionTime <= now) {
          continue;
        }
        
        upcoming.push({ ...session, date: nextDate.toISOString().split('T')[0] });
      }
    });
    
    // Sort by date
    upcoming.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    setUpcomingSessions(upcoming);
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
          <Text style={styles.headerTitle}>Sélectionner une session</Text>
        </View>
      </View>

      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Sessions disponibles</Text>
        <FlatList
          data={upcomingSessions}
          keyExtractor={(item, index) => `${item.id}-${item.date}-${index}`}
          renderItem={({ item }) => {
            const sessionDate = new Date(item.date + 'T12:00:00'); // Add time to avoid timezone issues
            const dayName = sessionDate.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { weekday: 'long' });
            const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
            
            return (
              <TouchableOpacity
                style={styles.sessionItem}
                onPress={() => {
                  const { dateObj, ...sessionWithoutDate } = item;
                  navigation.navigate('Attendance', { session: sessionWithoutDate, date: item.date });
                }}
              >
                <View style={styles.sessionInfo}>
                  <Text style={styles.sessionDay}>{capitalizedDay}</Text>
                  <Text style={styles.sessionTime}>
                    {item.start_time} - {item.end_time}
                  </Text>
                  <Text style={styles.sessionDate}>
                    {sessionDate.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </Text>
                </View>
                <Text style={styles.arrowIcon}>→</Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<Text style={styles.emptyText}>Aucune session disponible</Text>}
        />
      </View>
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