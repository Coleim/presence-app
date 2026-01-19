import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { dataService } from '../lib/dataService';
import { theme } from '../lib/theme';

export default function ClubDetailsScreen({ route, navigation }) {
  const { club } = route.params;
  const [sessions, setSessions] = useState([]);
  const [participants, setParticipants] = useState([]);

  useEffect(() => {
    fetchSessions();
    fetchParticipants();
  }, []);

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
    const data = await dataService.getParticipants(club.id);
    
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
            await dataService.deleteClub(club.id);
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
            await dataService.deleteSession(sessionId);
            fetchSessions(); // Refresh list
          }
        }
      ]
    );
  };

  const deleteParticipant = async (participantId: string, participantName: string) => {
    Alert.alert(
      'Supprimer le participant',
      `Voulez-vous supprimer ${participantName} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            await dataService.deleteParticipant(participantId);
            fetchParticipants(); // Refresh list
          }
        }
      ]
    );
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

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.title}>{club.name}</Text>
        {club.description && <Text style={styles.description}>{club.description}</Text>}

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.buttonPrimary}
            onPress={() => navigation.navigate('AddSession', { clubId: club.id })}
          >
            <Text style={styles.buttonPrimaryText}>Ajouter une session</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.buttonSecondary}
            onPress={() => navigation.navigate('AddParticipant', { clubId: club.id })}
          >
            <Text style={styles.buttonSecondaryText}>Ajouter un participant</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.buttonSecondary}
            onPress={() => navigation.navigate('Stats', { club })}
          >
            <Text style={styles.buttonSecondaryText}>Voir les statistiques</Text>
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
                onLongPress={() => deleteParticipant(item.id, `${item.first_name} ${item.last_name}`)}
              >
                <Text style={styles.listItemText}>
                  {item.last_name.toUpperCase()} {item.first_name}
                </Text>
              </TouchableOpacity>
            )}
            scrollEnabled={false}
            ListEmptyComponent={<Text style={styles.emptyText}>Aucun participant</Text>}
          />
        </View>

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
  title: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.space[2],
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
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.space[4],
    marginBottom: theme.space[2],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  listItemText: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.primary,
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