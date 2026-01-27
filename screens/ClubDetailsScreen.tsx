import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ScrollView, TextInput, Keyboard, Share } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { dataService } from '../lib/dataService';
import { syncService } from '../lib/syncService';
import { authManager } from '../lib/authManager';
import { LanguageSelector } from '../components/LanguageSelector';
import { useTranslation } from '../contexts/LanguageContext';
import { theme } from '../lib/theme';

export default function ClubDetailsScreen({ route, navigation }: any) {
  const { club } = route.params;
  const { t, translateDay } = useTranslation();
  const [sessions, setSessions] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(club.name);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [shareCode, setShareCode] = useState(club.share_code);

  useEffect(() => {
    checkAuth();
    fetchSessions();
    fetchParticipants();
    ensureShareCode();
  }, []);

  const ensureShareCode = async () => {
    // If club doesn't have a share code and it's not a local club, generate one
    if (!shareCode && !club.id.startsWith('local-')) {
      try {
        const { supabase } = await import('../lib/supabase');
        // Call the SQL function to generate a share code
        const { data, error } = await supabase.rpc('generate_share_code');
        
        if (error) {
          console.error('[ClubDetailsScreen] Error calling generate_share_code:', error);
          return;
        }
        
        const newShareCode = data;
        
        // Update the club with the new share code
        const { error: updateError } = await supabase
          .from('clubs')
          .update({ share_code: newShareCode })
          .eq('id', club.id);
        
        if (!updateError) {
          setShareCode(newShareCode);
          // Update local storage
          club.share_code = newShareCode;
          await dataService.saveClub(club);
        }
      } catch (error) {
        console.error('[ClubDetailsScreen] Error generating share code:', error);
      }
    }
  };

  const checkAuth = async () => {
    const isAuth = await authManager.isAuthenticated();
    setIsAuthenticated(isAuth);
    
    if (isAuth) {
      const userId = await authManager.getUserId();
      setCurrentUserId(userId);
      setIsOwner(userId === club.owner_id);
    } else {
      // Not logged in = local-only mode = full permissions
      setIsOwner(true);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchSessions();
      fetchParticipants();
    });
    return unsubscribe;
  }, [navigation]);

  const fetchSessions = async () => {
    const data = await dataService.getSessions(club.id);
    
    // Helper to get day index for sorting
    const getDayIndex = (dayName: string) => {
      const frenchDays = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
      const englishDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      
      let index = frenchDays.indexOf(dayName);
      if (index === -1) {
        index = englishDays.indexOf(dayName);
      }
      return index === -1 ? 999 : index; // Unknown days at the end
    };
    
    // Sort sessions by day of week, then by start time
    const sortedData = [...data].sort((a, b) => {
      const dayA = getDayIndex(a.day_of_week);
      const dayB = getDayIndex(b.day_of_week);
      
      if (dayA !== dayB) {
        return dayA - dayB;
      }
      
      // Same day, sort by time
      return a.start_time.localeCompare(b.start_time);
    });
    
    setSessions(sortedData);
  };

  const fetchParticipants = async () => {
    const data = await dataService.getParticipantsWithSessions(club.id);
    
    // Sort participants alphabetically by last name, then first name
    const sortedData = [...data].sort((a, b) => {
      const lastNameCompare = a.last_name.localeCompare(b.last_name, 'fr', { sensitivity: 'base' });
      if (lastNameCompare !== 0) {
        return lastNameCompare;
      }
      return a.first_name.localeCompare(b.first_name, 'fr', { sensitivity: 'base' });
    });
    
    setParticipants(sortedData);
  };

  const deleteClub = async () => {
    Alert.alert(
      t('club.deleteClub'),
      t('club.confirmDelete'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete locally first (always works)
              await dataService.deleteClub(club.id);
              console.log('[ClubDetails] Club deleted locally');
              
              // Navigate immediately after local deletion
              navigation.goBack();
            } catch (error) {
              console.error('[ClubDetails] Error deleting club:', error);
              Alert.alert(t('common.error'), t('club.errorDeletingClub'));
            }
          }
        }
      ]
    );
  };

  const deleteSession = async (sessionId: string, sessionName: string) => {
    Alert.alert(
      `${t('common.delete')} ${t('club.session')}`,
      `${t('club.confirmDeleteSession')} ${sessionName} ?`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            // Wait for local delete to complete
            await dataService.deleteSession(sessionId);
            // Refresh list after delete completes
            fetchSessions();
          }
        }
      ]
    );
  };


  const resetStats = async () => {
    Alert.alert(
      t('club.startYear'),
      t('club.confirmReset'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: 'Réinitialiser',
          style: 'destructive',
          onPress: async () => {
            await dataService.resetClubStats(club.id);
            
            // Reload club with updated stats_reset_date
            const clubs = await dataService.getClubs();
            const updatedClub = clubs.find(c => c.id === club.id);
            
            Alert.alert(t('common.success'), t('club.statsReset'));
            
            // Update navigation params with fresh club data
            if (updatedClub) {
              navigation.setParams({ club: updatedClub });
            }
          }
        }
      ]
    );
  };

  const saveClubName = async () => {
    Keyboard.dismiss();
    
    if (!editedName.trim()) {
      Alert.alert(t('common.error'), 'Le nom du club ne peut pas être vide.');
      setEditedName(club.name);
      setIsEditingName(false);
      return;
    }
    
    // Wait for local save (fast), cloud sync happens in background
    await dataService.saveClub({ ...club, name: editedName.trim() });
    // Update UI after local save completes
    navigation.setParams({ club: { ...club, name: editedName.trim() } });
    setIsEditingName(false);
  };

  const shareClubCode = async () => {
    if (!shareCode) return;
    
    try {
      await Share.share({
        message: `Rejoins mon club "${club.name}" !\n\nCode d'accès: ${shareCode}\n\nUtilise ce code dans l'application pour rejoindre le club.`,
        title: `Partager le club ${club.name}`
      });
    } catch (error) {
      console.error('Error sharing:', error);
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
          <Text style={styles.headerTitle}>{t('club.title')}</Text>
        </View>
      </View>

      <ScrollView 
        style={styles.container} 
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.titleContainer}>
          {isEditingName ? (
            <>
              <TextInput
                style={styles.titleInput}
                value={editedName}
                onChangeText={setEditedName}
                autoFocus
                selectTextOnFocus
              />
              <TouchableOpacity
                style={styles.actionButton}
                onPress={saveClubName}
              >
                <Feather name="check" size={28} color={theme.colors.success} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => {
                  setEditedName(club.name);
                  setIsEditingName(false);
                }}
              >
                <Feather name="x" size={28} color={theme.colors.danger} />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.title}>{club.name}</Text>
              {/* Only owner can edit club name */}
              {isOwner && (
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => setIsEditingName(true)}
                >
                  <Feather name="edit" size={18} color={theme.colors.primary[700]} />
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
        {club.description && <Text style={styles.description}>{club.description}</Text>}

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.buttonOutline}
            onPress={() => navigation.navigate('Stats', { club })}
          >
            <View style={styles.buttonWithIcon}>
              <Feather name="bar-chart-2" size={18} color={theme.colors.primary[700]} />
              <Text style={styles.buttonOutlineText}>{t('club.stats')}</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('club.participants')}</Text>
            {participants.length > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{participants.length}</Text>
              </View>
            )}
            <View style={styles.sectionHeaderSpacer} />
            {/* Everyone can add participants */}
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => navigation.navigate('AddParticipant', { clubId: club.id })}
            >
              <Feather name="user-plus" size={18} color={theme.colors.primary[700]} />
              <Text style={styles.headerButtonText}>{t('common.add')}</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={participants}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={styles.listItem}
                onPress={() => navigation.navigate('EditParticipant', { participant: item, clubId: club.id })}
              >
                <View style={styles.listItemContent}>
                  <Text style={styles.listItemText}>
                    {item.last_name.toUpperCase()} {item.first_name}
                  </Text>
                  {item.is_long_term_sick && (
                    <View style={styles.sickBadge}>
                      <Text style={styles.sickBadgeText}>🤒</Text>
                    </View>
                  )}
                </View>
                <Feather name="chevron-right" size={20} color={theme.colors.text.secondary} />
              </TouchableOpacity>
            )}
            scrollEnabled={false}
            ListEmptyComponent={<Text style={styles.emptyText}>{t('club.noParticipants')}</Text>}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('club.sessions')}</Text>
            {sessions.length > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{sessions.length}</Text>
              </View>
            )}
            <View style={styles.sectionHeaderSpacer} />
            {/* Only owner can add sessions */}
            {isOwner && (
              <TouchableOpacity
                style={styles.headerButton}
                onPress={() => navigation.navigate('AddSession', { clubId: club.id })}
              >
                <Feather name="plus-circle" size={18} color={theme.colors.primary[700]} />
                <Text style={styles.headerButtonText}>{t('common.add')}</Text>
              </TouchableOpacity>
            )}
          </View>
          <FlatList
            data={sessions}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={styles.listItem}
                onLongPress={isOwner ? () => deleteSession(item.id, `${translateDay(item.day_of_week)} ${item.start_time}-${item.end_time}`) : undefined}
              >
                <Text style={styles.sessionText}>
                  {translateDay(item.day_of_week)} {item.start_time}-{item.end_time}
                </Text>
                {!isOwner && <Text style={styles.ownerOnlyHint}>{t('club.ownerOnly')}</Text>}
              </TouchableOpacity>
            )}
            scrollEnabled={false}
            ListEmptyComponent={<Text style={styles.emptyText}>{t('club.noSessions')}</Text>}
          />
        </View>

        {/* Admin Section - Only owner can reset stats */}
        {isOwner && (
          <View style={styles.adminSection}>
            <Text style={styles.adminSectionTitle}>{t('club.administration')}</Text>
            
            {/* Share Code */}
            {shareCode && (
              <View style={styles.adminRow}>
                <View style={styles.adminRowContent}>
                  <Text style={styles.adminRowLabel}>{t('club.shareCode')}</Text>
                  <Text style={styles.shareCodeText}>{shareCode}</Text>
                </View>
                <TouchableOpacity
                  style={styles.adminIconButton}
                  onPress={shareClubCode}
                >
                  <Feather name="share-2" size={20} color={theme.colors.primary[700]} />
                </TouchableOpacity>
              </View>
            )}
            
            {/* Language Selector */}
            <View style={styles.adminRow}>
              <View style={styles.adminRowContent}>
                <Text style={styles.adminRowLabel}>{t('club.language')}</Text>
              </View>
              <LanguageSelector />
            </View>
            
            <TouchableOpacity
              style={styles.adminRow}
              onPress={resetStats}
            >
              <View style={styles.adminRowContent}>
                <Text style={styles.adminRowLabel}>{t('club.startYear')}</Text>
                {club.stats_reset_date && (
                  <Text style={styles.adminRowHint}>
                    {t('club.statsSince')} {new Date(club.stats_reset_date).toLocaleDateString('fr-FR')}
                  </Text>
                )}
              </View>
              <Feather name="refresh-cw" size={20} color={theme.colors.primary[700]} />
            </TouchableOpacity>
          </View>
        )}

        {/* Only owner can delete club */}
        {isOwner && (
          <View style={styles.dangerContainer}>
            <TouchableOpacity style={styles.buttonDanger} onPress={deleteClub}>
              <Text style={styles.buttonDangerText}>{t('club.deleteClub')}</Text>
            </TouchableOpacity>
          </View>
        )}
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
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.space[2],
  },
  title: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  titleInput: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.primary[700],
    paddingVertical: theme.space[1],
    minWidth: 100,
  },
  editButton: {
    padding: theme.space[1],
    marginLeft: theme.space[1] / 2,
  },
  actionButton: {
    padding: theme.space[2],
    marginLeft: theme.space[2],
  },
  buttonWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
  },
  description: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.secondary,
    marginBottom: theme.space[5],
  },
  buttonContainer: {
    gap: theme.space[3],
    marginBottom: theme.space[6],
  },
  adminContainer: {
    marginTop: theme.space[5],
    marginBottom: theme.space[3],
  },
  buttonOutline: {
    borderWidth: 1,
    borderColor: theme.colors.primary[700],
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.space[2],
    paddingHorizontal: theme.space[3],
    alignItems: 'center',
  },
  buttonOutlineText: {
    color: theme.colors.primary[700],
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
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
  buttonTest: {
    backgroundColor: '#FFF4E6',
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.space[3],
    paddingHorizontal: theme.space[4],
    alignItems: 'center',
    marginTop: theme.space[2],
    borderWidth: 1,
    borderColor: '#FFB84D',
  },
  buttonTestText: {
    color: '#CC7A00',
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
  },
  adminSection: {
    marginTop: theme.space[6],
    padding: theme.space[4],
    backgroundColor: '#E6EEF5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#B0C4D9',
  },
  adminSectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.space[3],
  },
  adminRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.white,
    padding: theme.space[4],
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.space[2],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  adminRowContent: {
    flex: 1,
  },
  adminRowLabel: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
    marginBottom: theme.space[1],
  },
  adminRowHint: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
  },
  adminIconButton: {
    padding: theme.space[2],
  },
  shareCodeText: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.primary[700],
    letterSpacing: 2,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.space[4],
    marginBottom: theme.space[2],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  ownerOnlyHint: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.text.tertiary,
    fontStyle: 'italic',
    marginLeft: theme.space[2],
  },
  listItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: theme.space[2],
  },
  listItemText: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.primary,
  },
  sickBadge: {
    backgroundColor: theme.colors.dangerBg,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.space[2],
    paddingVertical: theme.space[1] / 2,
  },
  sickBadgeText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.danger,
    fontWeight: theme.typography.fontWeight.medium,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  section: {
    marginBottom: theme.space[6],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.space[3],
    gap: theme.space[2],
  },
  sectionHeaderSpacer: {
    flex: 1,
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[1],
    paddingVertical: theme.space[1],
    paddingHorizontal: theme.space[2],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary[50],
  },
  headerButtonText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.primary[700],
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
  countBadge: {
    backgroundColor: theme.colors.primary[100],
    borderRadius: theme.borderRadius.full,
    minWidth: 24,
    height: 24,
    paddingHorizontal: theme.space[2],
    justifyContent: 'center',
    alignItems: 'center',
  },
  countBadgeText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.primary[700],
  },
  addButton: {
    borderWidth: 1,
    borderColor: theme.colors.primary[700],
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.space[3],
    paddingHorizontal: theme.space[4],
    alignItems: 'center',
    marginTop: theme.space[2],
    backgroundColor: theme.colors.surface,
  },
  addButtonText: {
    color: theme.colors.primary[700],
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.medium,
  },
  sessionText: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.primary,
  },
  dangerContainer: {
    marginTop: theme.space[4],
    marginBottom: theme.space[4],
  },
  buttonDanger: {
    ...theme.components.buttonPrimary,
    backgroundColor: theme.colors.danger,
  },
  buttonDangerText: {
    color: theme.colors.surface,
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.semibold,
  },
});