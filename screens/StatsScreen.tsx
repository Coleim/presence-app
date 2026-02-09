import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Share, Alert, Modal, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { dataService, Session, AttendanceRecord } from '../lib/dataService';
import { useTranslation } from '../contexts/LanguageContext';
import { theme } from '../lib/theme';

export default function StatsScreen({ route, navigation }: any) {
  const { club } = route.params;
  const { t } = useTranslation();
  const [stats, setStats] = useState<any[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [allAttendance, setAllAttendance] = useState<AttendanceRecord[]>([]);
  const [selectedParticipant, setSelectedParticipant] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    const participants = await dataService.getParticipantsWithSessions(club.id);
    const fetchedAttendance = await dataService.getAllAttendance();
    const fetchedSessions = await dataService.getSessions(club.id);
    
    // Store for use in modal
    setSessions(fetchedSessions);
    setAllAttendance(fetchedAttendance);

    const participantStats = participants
      .filter(p => !p.is_long_term_sick) // Exclude long-term sick participants
      .map(p => {
      const pAttendance = fetchedAttendance.filter(a => a.participant_id === p.id);
      
      // Separate attendance into assigned and bonus sessions
      const assignedSessionIds = p.preferred_session_ids || [];
      let presentInAssigned = 0;
      let totalAssigned = 0;
      let bonusPresences = 0;

      pAttendance.forEach(a => {
        const isAssignedSession = assignedSessionIds.includes(a.session_id);
        
        if (a.present) {
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
    
    // Sort by percentage (highest first), then by bonus presences
    participantStats.sort((a, b) => {
      const percentA = a.percentage === 'N/A' ? -1 : parseFloat(a.percentage);
      const percentB = b.percentage === 'N/A' ? -1 : parseFloat(b.percentage);
      
      // First sort by percentage
      if (percentB !== percentA) {
        return percentB - percentA;
      }
      
      // If same percentage, sort by bonus presences (highest first)
      return b.bonusPresences - a.bonusPresences;
    });
    
    setStats(participantStats);
  };

  const getSessionLabel = (session: Session): string => {
    const dayNames: { [key: string]: string } = {
      monday: t('days.monday'),
      tuesday: t('days.tuesday'),
      wednesday: t('days.wednesday'),
      thursday: t('days.thursday'),
      friday: t('days.friday'),
      saturday: t('days.saturday'),
      sunday: t('days.sunday'),
    };
    const dayName = dayNames[session.day_of_week.toLowerCase()] || session.day_of_week;
    return `${dayName} ${session.start_time}-${session.end_time}`;
  };

  const getParticipantSessionDetails = (participant: any) => {
    const pAttendance = allAttendance.filter(a => a.participant_id === participant.id);
    const assignedSessionIds = participant.preferred_session_ids || [];
    
    // Group attendance by session with date
    const attendanceBySessionDate: { [key: string]: AttendanceRecord } = {};
    pAttendance.forEach(a => {
      const key = `${a.session_id}|${a.date}`;
      attendanceBySessionDate[key] = a;
    });

    // Build list of attended and missed sessions
    const attendedSessions: { session: Session; date: string; isBonus: boolean }[] = [];
    const missedSessions: { session: Session; date: string }[] = [];

    pAttendance.forEach(a => {
      const session = sessions.find(s => s.id === a.session_id);
      if (!session) return;
      
      const isAssigned = assignedSessionIds.includes(a.session_id);
      
      if (a.present) {
        attendedSessions.push({
          session,
          date: a.date,
          isBonus: !isAssigned,
        });
      } else if (isAssigned) {
        // Only show missed for assigned sessions
        missedSessions.push({
          session,
          date: a.date,
        });
      }
    });

    // Sort by date (most recent first)
    attendedSessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    missedSessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return { attendedSessions, missedSessions };
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const openParticipantDetails = (participant: any) => {
    setSelectedParticipant(participant);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setSelectedParticipant(null);
  };

  const shareStats = async () => {
    try {
      let message = `${t('stats.shareTitle')}\n${club.name}\n\n`;
      
      if (club.stats_reset_date) {
        const resetDate = new Date(club.stats_reset_date).toLocaleDateString('fr-FR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
        message += `${t('stats.sharePeriod')} ${resetDate}\n\n`;
      }
      
      message += `${t('stats.shareRanking')}\n`;
      message += `${'='.repeat(12)}\n\n`;
      
      stats.forEach((participant, index) => {
        const position = index + 1;
        const medal = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `${position}.`;
        
        message += `${medal} ${participant.first_name} ${participant.last_name.toUpperCase()}\n`;
        
        if (participant.hasAssignedSessions) {
          message += `   • ${t('stats.shareRate')} ${participant.percentage}%\n`;
          message += `   • ${t('stats.bonusPresences')}: ${participant.effectivePresent}/${participant.totalAssigned} sessions\n`;
          
          if (participant.bonusUsed > 0) {
            message += `   • ${t('stats.shareBonusUsed')} ${participant.bonusUsed}\n`;
          }
          if (participant.bonusRemaining > 0) {
            message += `   • ${t('stats.shareBonusRemaining')} ${participant.bonusRemaining}\n`;
          }
        } else {
          message += `   • ${t('stats.noAssignedSessions')}\n`;
          if (participant.bonusPresences > 0) {
            message += `   • ${t('stats.bonusPresences')} bonus: ${participant.bonusPresences}\n`;
          }
        }
        message += `\n`;
      });
      
      const result = await Share.share({
        message: message,
      });
      
      if (result.action === Share.sharedAction) {
        // Successfully shared
      }
    } catch (error: any) {
      Alert.alert(t('common.error'), 'Impossible de partager les statistiques.');
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
          <Text style={styles.headerTitle}>{t('stats.title')}</Text>
        </View>
        <TouchableOpacity onPress={shareStats} style={styles.shareButton}>
          <Feather name="share-2" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.container}>
        <View style={styles.contentHeader}>
          <Text style={styles.clubTitle}>{club.name}</Text>
          <Text style={styles.sectionTitle}>{t('stats.attendanceRate')}</Text>
        </View>
        <FlatList
          contentContainerStyle={styles.listContent}
          data={stats}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={styles.statItem}
              onPress={() => openParticipantDetails(item)}
              activeOpacity={0.7}
            >
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
                        +{item.bonusRemaining} {item.bonusRemaining > 1 ? t('stats.bonusRemainingPlural') : t('stats.bonusRemaining')}
                      </Text>
                    )}
                    <Text style={styles.percentageText}>
                      {item.percentage}%
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.attendanceText}>
                      {t('stats.noAssignedSessions')}
                    </Text>
                    {item.bonusPresences > 0 && (
                      <Text style={styles.bonusHighlight}>
                        {item.bonusPresences} {t('stats.bonusPresences')}
                      </Text>
                    )}
                  </>
                )}
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>{t('stats.noData')}</Text>}
        />

        {/* Participant Details Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={modalVisible}
          onRequestClose={closeModal}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {selectedParticipant?.last_name.toUpperCase()} {selectedParticipant?.first_name}
                </Text>
                <TouchableOpacity onPress={closeModal} style={styles.closeButton}>
                  <Feather name="x" size={24} color={theme.colors.text.primary} />
                </TouchableOpacity>
              </View>
              
              {selectedParticipant && (
                <ScrollView style={styles.modalBody}>
                  {(() => {
                    const { attendedSessions, missedSessions } = getParticipantSessionDetails(selectedParticipant);
                    return (
                      <>
                        {/* Summary */}
                        <View style={styles.summaryBox}>
                          <Text style={styles.summaryText}>
                            {selectedParticipant.hasAssignedSessions 
                              ? `${selectedParticipant.effectivePresent}/${selectedParticipant.totalAssigned} sessions (${selectedParticipant.percentage}%)`
                              : t('stats.noAssignedSessions')
                            }
                          </Text>
                          {selectedParticipant.bonusUsed > 0 && (
                            <Text style={styles.summarySubtext}>
                              {selectedParticipant.presentInAssigned} + {selectedParticipant.bonusUsed} bonus
                            </Text>
                          )}
                        </View>

                        {/* Attended Sessions */}
                        <Text style={styles.sectionLabel}>
                          <Feather name="check-circle" size={16} color={theme.colors.success} /> {t('stats.attendedSessions')} ({attendedSessions.length})
                        </Text>
                        {attendedSessions.length > 0 ? (
                          attendedSessions.map((item, index) => (
                            <View key={`attended-${index}`} style={styles.sessionRow}>
                              <View style={styles.sessionInfo}>
                                <Text style={styles.sessionName}>{getSessionLabel(item.session)}</Text>
                                <Text style={styles.sessionDate}>{formatDate(item.date)}</Text>
                              </View>
                              {item.isBonus && (
                                <View style={styles.bonusBadge}>
                                  <Text style={styles.bonusBadgeText}>BONUS</Text>
                                </View>
                              )}
                            </View>
                          ))
                        ) : (
                          <Text style={styles.noSessionsText}>{t('stats.noAttendedSessions')}</Text>
                        )}

                        {/* Missed Sessions */}
                        <Text style={[styles.sectionLabel, { marginTop: theme.space[4] }]}>
                          <Feather name="x-circle" size={16} color={theme.colors.error} /> {t('stats.missedSessions')} ({missedSessions.length})
                        </Text>
                        {missedSessions.length > 0 ? (
                          missedSessions.map((item, index) => (
                            <View key={`missed-${index}`} style={styles.sessionRow}>
                              <View style={styles.sessionInfo}>
                                <Text style={[styles.sessionName, styles.missedSession]}>{getSessionLabel(item.session)}</Text>
                                <Text style={styles.sessionDate}>{formatDate(item.date)}</Text>
                              </View>
                            </View>
                          ))
                        ) : (
                          <Text style={styles.noSessionsText}>{t('stats.noMissedSessions')}</Text>
                        )}
                      </>
                    );
                  })()}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
    maxHeight: '80%',
    paddingBottom: theme.space[6],
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.space[4],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  modalTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    flex: 1,
  },
  closeButton: {
    padding: theme.space[2],
  },
  modalBody: {
    padding: theme.space[4],
  },
  summaryBox: {
    backgroundColor: theme.colors.bg,
    padding: theme.space[3],
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.space[4],
    alignItems: 'center',
  },
  summaryText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  summarySubtext: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    marginTop: theme.space[1],
  },
  sectionLabel: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
    marginBottom: theme.space[2],
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.space[2],
    paddingHorizontal: theme.space[3],
    backgroundColor: theme.colors.bg,
    marginBottom: theme.space[1],
    borderRadius: theme.borderRadius.sm,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionName: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
  },
  sessionDate: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.text.secondary,
    marginTop: theme.space[1],
  },
  missedSession: {
    color: theme.colors.error,
  },
  bonusBadge: {
    backgroundColor: theme.colors.success,
    paddingHorizontal: theme.space[2],
    paddingVertical: theme.space[1],
    borderRadius: theme.borderRadius.sm,
  },
  bonusBadgeText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#FFFFFF',
  },
  noSessionsText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    fontStyle: 'italic',
    paddingVertical: theme.space[2],
  },
});