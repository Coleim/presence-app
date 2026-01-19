import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
    setSessions(data);
  };

  const fetchParticipants = async () => {
    const data = await dataService.getParticipants(club.id);
    setParticipants(data);
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

  return (
    <SafeAreaView style={styles.safeArea}>
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
              <View style={styles.listItem}>
                <Text style={styles.listItemText}>
                  {item.day_of_week} {item.start_time}-{item.end_time}
                </Text>
              </View>
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
              <View style={styles.listItem}>
                <Text style={styles.listItemText}>
                  {item.first_name} {item.last_name}
                </Text>
              </View>
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