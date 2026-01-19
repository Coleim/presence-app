import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Share, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { dataService } from '../lib/dataService';
import { theme } from '../lib/theme';

export default function StatsScreen({ route, navigation }: any) {
  const { club } = route.params;
  const [stats, setStats] = useState<any[]>([]);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    console.log('[DEBUG fetchStats] Club:', club.name);
    const participants = await dataService.getParticipantsWithSessions(club.id);
    const allAttendance = await dataService.getAllAttendance();
    console.log('[DEBUG fetchStats] Attendance records:', allAttendance.length);
    const sessions = await dataService.getSessions(club.id);

    const participantStats = participants
      .filter(p => !p.is_long_term_sick) // Exclude long-term sick participants
      .map(p => {
      const pAttendance = allAttendance.filter(a => a.participant_id === p.id);
      
      // Separate attendance into assigned and bonus sessions
      const assignedSessionIds = p.preferred_session_ids || [];
      let presentInAssigned = 0;
      let totalAssigned = 0;
      let bonusPresences = 0;

      pAttendance.forEach(a => {
        const isAssignedSession = assignedSessionIds.includes(a.session_id);
        
        if (a.status === 'present') {
          if (isAssignedSession) {
            presentInAssigned++;
          } else {
            bonusPresences++;
          }
        }
      });

      // Count total assigned sessions (all attendance records for assigned sessions)
      totalAssigned = pAttendance.filter(a => assignedSessionIds.includes(a.session_id)).length;

      // Bonus presences can compensate for missed assigned sessions
      const bonusUsed = Math.min(bonusPresences, totalAssigned - presentInAssigned);
      const effectivePresent = presentInAssigned + bonusUsed;
      const bonusRemaining = bonusPresences - bonusUsed;

      // Calculate percentage with bonus compensation
      const percentage = totalAssigned > 0 ? (effectivePresent / totalAssigned * 100).toFixed(1) : 'N/A';

      return { 
        ...p, 
        presentInAssigned, 
        totalAssigned, 
        bonusPresences,
        bonusUsed,
        bonusRemaining,
        effectivePresent,
        percentage,
        hasAssignedSessions: assignedSessionIds.length > 0
      };
    });
    
    // Sort by percentage (highest first)
    participantStats.sort((a, b) => {
      const percentA = a.percentage === 'N/A' ? -1 : parseFloat(a.percentage);
      const percentB = b.percentage === 'N/A' ? -1 : parseFloat(b.percentage);
      return percentB - percentA;
    });
    
    setStats(participantStats);
  };

  const shareStats = async () => {
    try {
      let message = `Statistiques de présence\n${club.name}\n\n`;
      
      if (club.stats_reset_date) {
        const resetDate = new Date(club.stats_reset_date).toLocaleDateString('fr-FR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
        message += `Période: depuis le ${resetDate}\n\n`;
      }
      
      message += `🏆 Classement\n`;
      message += `${'='.repeat(12)}\n\n`;
      
      stats.forEach((participant, index) => {
        const position = index + 1;
        const medal = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `${position}.`;
        
        message += `${medal} ${participant.first_name} ${participant.last_name.toUpperCase()}\n`;
        
        if (participant.hasAssignedSessions) {
          message += `   • Taux: ${participant.percentage}%\n`;
          message += `   • Présences: ${participant.effectivePresent}/${participant.totalAssigned} sessions\n`;
          
          if (participant.bonusUsed > 0) {
            message += `   • Bonus utilisés: ${participant.bonusUsed}\n`;
          }
          if (participant.bonusRemaining > 0) {
            message += `   • Bonus restants: ${participant.bonusRemaining}\n`;
          }
        } else {
          message += `   • Aucune session assignée\n`;
          if (participant.bonusPresences > 0) {
            message += `   • Présences bonus: ${participant.bonusPresences}\n`;
          }
        }
        message += `\n`;
      });
      
      const result = await Share.share({
        message: message,
      });
      
      if (result.action === Share.sharedAction) {
        console.log('Stats shared successfully');
      }
    } catch (error: any) {
      Alert.alert('Erreur', 'Impossible de partager les statistiques.');
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
          <Text style={styles.headerTitle}>Statistiques</Text>
        </View>
        <TouchableOpacity onPress={shareStats} style={styles.shareButton}>
          <Feather name="share-2" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.container}>
        <View style={styles.contentHeader}>
          <Text style={styles.clubTitle}>{club.name}</Text>
          <Text style={styles.sectionTitle}>Taux de présence par participant</Text>
        </View>
        <FlatList
          contentContainerStyle={styles.listContent}
          data={stats}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <View style={styles.statItem}>
              <View style={styles.participantInfo}>
                <Text style={styles.participantName}>
                  {item.last_name.toUpperCase()} {item.first_name}
                </Text>
                {item.grade && <Text style={styles.participantGrade}>{item.grade}</Text>}
              </View>
              <View style={styles.attendanceInfo}>
                {item.hasAssignedSessions ? (
                  <>
                    <Text style={styles.attendanceText}>
                      {item.effectivePresent}/{item.totalAssigned} sessions
                    </Text>
                    {item.bonusUsed > 0 && (
                      <Text style={styles.bonusUsedText}>
                        ({item.presentInAssigned} + {item.bonusUsed} bonus)
                      </Text>
                    )}
                    {item.bonusRemaining > 0 && (
                      <Text style={styles.bonusText}>
                        +{item.bonusRemaining} bonus restant{item.bonusRemaining > 1 ? 's' : ''}
                      </Text>
                    )}
                    <Text style={styles.percentageText}>
                      {item.percentage}%
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.attendanceText}>
                      Aucune session assignée
                    </Text>
                    {item.bonusPresences > 0 && (
                      <Text style={styles.bonusHighlight}>
                        {item.bonusPresences} présences
                      </Text>
                    )}
                  </>
                )}
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>Aucune donnée disponible</Text>}
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
  shareButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    padding: theme.space[2],
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
  contentHeader: {
    padding: theme.space[4],
    paddingBottom: theme.space[2],
  },
  listContent: {
    paddingHorizontal: theme.space[4],
  },
  clubTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.space[2],
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
    marginBottom: theme.space[3],
  },
  statItem: {
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
  participantInfo: {
    flex: 1,
  },
  participantName: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
  },
  participantGrade: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    marginTop: theme.space[1],
  },
  attendanceInfo: {
    alignItems: 'flex-end',
  },
  attendanceText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
  },
  bonusText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.success,
    fontWeight: theme.typography.fontWeight.medium,
    marginTop: theme.space[1],
  },
  bonusUsedText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.text.secondary,
    fontStyle: 'italic',
    marginTop: theme.space[1],
  },
  bonusHighlight: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.success,
    marginTop: theme.space[1],
  },
  percentageText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.success,
    marginTop: theme.space[1],
  },
  emptyText: {
    textAlign: 'center',
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.secondary,
    marginTop: theme.space[6],
  },
});