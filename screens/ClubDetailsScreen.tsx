import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ScrollView, TextInput, Keyboard } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { dataService } from '../lib/dataService';
import { syncService } from '../lib/syncService';
import { authManager } from '../lib/authManager';
import { theme } from '../lib/theme';

export default function ClubDetailsScreen({ route, navigation }: any) {
  const { club } = route.params;
  const [sessions, setSessions] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(club.name);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    checkAuth();
    fetchSessions();
    fetchParticipants();
  }, []);

  const checkAuth = async () => {
    const isAuth = await authManager.isAuthenticated();
    setIsAuthenticated(isAuth);
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
      'Supprimer le club',
      'Êtes-vous sûr de vouloir supprimer ce club ? Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            dataService.checkOnline();
            // Delete in background
            dataService.deleteClub(club.id);
            // Navigate immediately
            navigation.goBack();
          }
        }
      ]
    );
  };

  const deleteSession = async (sessionId: string, sessionName: string) => {
    Alert.alert(
      'Supprimer la session',
      `Voulez-vous supprimer la session ${sessionName} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
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
      'Démarrer l\'année',
      'Cette action va réinitialiser toutes les statistiques de présence. Les présences ne seront comptabilisées qu\'à partir d\'aujourd\'hui. Cette action est irréversible.\n\nVoulez-vous continuer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Réinitialiser',
          style: 'destructive',
          onPress: async () => {
            await dataService.resetClubStats(club.id);
            
            // Reload club with updated stats_reset_date
            const clubs = await dataService.getClubs();
            const updatedClub = clubs.find(c => c.id === club.id);
            
            Alert.alert('Succès', 'Les statistiques ont été réinitialisées.');
            
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
      Alert.alert('Erreur', 'Le nom du club ne peut pas être vide.');
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

  return (
    <View style={styles.container}>
      {/* Header Container */}
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.smallBackButton}>
          <Text style={styles.smallBackButtonText}>← Retour</Text>
        </TouchableOpacity>
        {/* Main Header */}
        <View style={styles.mainHeader}>
          <Text style={styles.headerTitle}>Détails du club</Text>
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
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => setIsEditingName(true)}
              >
                <Feather name="edit" size={18} color={theme.colors.primary[700]} />
              </TouchableOpacity>
            </>
          )}
        </View>
        {club.description && <Text style={styles.description}>{club.description}</Text>}

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.buttonOutline}
            onPress={() => navigation.navigate('AddSession', { clubId: club.id })}
          >
            <View style={styles.buttonWithIcon}>
              <Feather name="plus-circle" size={18} color={theme.colors.primary[700]} />
              <Text style={styles.buttonOutlineText}>Ajouter une session</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.buttonOutline}
            onPress={() => navigation.navigate('AddParticipant', { clubId: club.id })}
          >
            <View style={styles.buttonWithIcon}>
              <Feather name="user-plus" size={18} color={theme.colors.primary[700]} />
              <Text style={styles.buttonOutlineText}>Ajouter un participant</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.buttonOutline}
            onPress={() => navigation.navigate('Stats', { club })}
          >
            <View style={styles.buttonWithIcon}>
              <Feather name="bar-chart-2" size={18} color={theme.colors.primary[700]} />
              <Text style={styles.buttonOutlineText}>Voir les statistiques</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sessions</Text>
          <FlatList
            data={sessions}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={styles.listItem}
                onLongPress={() => deleteSession(item.id, `${item.day_of_week} ${item.start_time}-${item.end_time}`)}
              >
                <Text style={styles.listItemText}>
                  {item.day_of_week} {item.start_time}-{item.end_time}
                </Text>
              </TouchableOpacity>
            )}
            scrollEnabled={false}
            ListEmptyComponent={<Text style={styles.emptyText}>Aucune session</Text>}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Participants</Text>
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
                      <Text style={styles.sickBadgeText}>Malade</Text>
                    </View>
                  )}
                </View>
                <Feather name="chevron-right" size={20} color={theme.colors.text.secondary} />
              </TouchableOpacity>
            )}
            scrollEnabled={false}
            ListEmptyComponent={<Text style={styles.emptyText}>Aucun participant</Text>}
          />
        </View>

        {/* Admin Section */}
        <View style={styles.adminSection}>
          <Text style={styles.adminSectionTitle}>Administration</Text>
          <TouchableOpacity
            style={styles.buttonAdmin}
            onPress={resetStats}
          >
            <View style={styles.buttonWithIcon}>
              <Feather name="refresh-cw" size={18} color="white" />
              <Text style={styles.buttonAdminText}>Démarrer l'année</Text>
            </View>
          </TouchableOpacity>
          {club.stats_reset_date && (
            <Text style={styles.resetDateText}>
              Stats depuis le {new Date(club.stats_reset_date).toLocaleDateString('fr-FR')}
            </Text>
          )}
        </View>

        {isAuthenticated && (
          <View style={styles.adminContainer}>
            <TouchableOpacity 
              style={styles.buttonOutline} 
              onPress={() => navigation.navigate('ShareClub', { clubId: club.id, clubName: club.name })}
            >
              <View style={styles.buttonContent}>
                <Feather name="share-2" size={20} color={theme.colors.primary[700]} />
                <Text style={styles.buttonOutlineText}>Partager le club</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.dangerContainer}>
          <TouchableOpacity style={styles.buttonDanger} onPress={deleteClub}>
            <Text style={styles.buttonDangerText}>Supprimer le club</Text>
          </TouchableOpacity>
        </View>
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
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.primary[900],
    marginBottom: theme.space[3],
  },
  buttonAdmin: {
    backgroundColor: theme.colors.primary[700],
    padding: theme.space[3],
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonAdminText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  resetDateText: {
    fontSize: 12,
    color: '#4A7BA7',
    marginTop: theme.space[2],
    textAlign: 'center',
    fontStyle: 'italic',
  },
  section: {
    marginBottom: theme.space[5],
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
    marginBottom: theme.space[3],
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