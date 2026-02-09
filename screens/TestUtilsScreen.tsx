import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { dataService } from '../lib/dataService';
import { theme } from '../lib/theme';

const testParticipants = [
  { first_name: "Antoine", last_name: "BERNARD" },
  { first_name: "Sophie", last_name: "MARTIN" },
  { first_name: "Lucas", last_name: "DUBOIS" },
  { first_name: "Emma", last_name: "THOMAS" },
  { first_name: "Hugo", last_name: "ROBERT" },
  { first_name: "Léa", last_name: "PETIT" },
  { first_name: "Tom", last_name: "DURAND" },
  { first_name: "Chloé", last_name: "LEROY" },
  { first_name: "Mathis", last_name: "MOREAU" },
  { first_name: "Sarah", last_name: "SIMON" },
  { first_name: "Nathan", last_name: "LAURENT" },
  { first_name: "Manon", last_name: "LEFEBVRE" },
  { first_name: "Enzo", last_name: "MICHEL" },
  { first_name: "Camille", last_name: "GARCIA" },
  { first_name: "Maxime", last_name: "DAVID" },
  { first_name: "Inès", last_name: "BERTRAND" },
  { first_name: "Arthur", last_name: "ROUX" },
  { first_name: "Jade", last_name: "VINCENT" },
  { first_name: "Paul", last_name: "FOURNIER" },
  { first_name: "Zoé", last_name: "MOREL" }
];

export default function TestUtilsScreen({ route, navigation }) {
  const { clubId } = route.params;
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');

  const createTestParticipants = async () => {
    setLoading(true);
    setProgress('Création en cours...');
    
    // Fetch all sessions for the club to assign randomly
    const sessions = await dataService.getSessions(clubId);
    
    if (sessions.length === 0) {
      setLoading(false);
      Alert.alert('Erreur', 'Aucune session disponible dans ce club. Créez d\'abord des sessions.');
      return;
    }
    
    for (let i = 0; i < testParticipants.length; i++) {
      const participant = {
        club_id: clubId,
        first_name: testParticipants[i].first_name,
        last_name: testParticipants[i].last_name,
        grade: '',
        level: '',
        notes: 'TEST - À SUPPRIMER'
      };
      
      try {
        const savedParticipant = await dataService.saveParticipant(participant);
        
        // Assign 1 random session
        const randomSession = sessions[Math.floor(Math.random() * sessions.length)];
        await dataService.saveParticipantSessions(savedParticipant.id, [randomSession.id]);
        
        setProgress(`${i + 1}/20 - ${participant.first_name} ${participant.last_name}`);
      } catch (error) {
        // Silent fail
      }
    }
    
    setProgress('');
    setLoading(false);
    Alert.alert('Succès', '20 participants de test créés avec sessions aléatoires !', [
      { text: 'OK', onPress: () => navigation.goBack() }
    ]);
  };

  const deleteTestParticipants = async () => {
    Alert.alert(
      'Confirmation',
      'Supprimer tous les participants de test (notes: "TEST - À SUPPRIMER") ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            setProgress('Suppression en cours...');
            
            const participants = await dataService.getParticipants(clubId);
            const testParticipants = participants.filter(p => p.notes === 'TEST - À SUPPRIMER');
            
            for (let i = 0; i < testParticipants.length; i++) {
              try {
                await dataService.deleteParticipant(testParticipants[i].id);
                setProgress(`${i + 1}/${testParticipants.length} supprimés`);
              } catch (error) {
                // Silent fail
              }
            }
            
            setProgress('');
            setLoading(false);
            Alert.alert('Succès', `${testParticipants.length} participants supprimés !`, [
              { text: 'OK', onPress: () => navigation.goBack() }
            ]);
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.smallBackButton}>
          <Text style={styles.smallBackButtonText}>← Retour</Text>
        </TouchableOpacity>
        <View style={styles.mainHeader}>
          <Text style={styles.headerTitle}>Utilitaires de Test</Text>
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>Participants de Test</Text>
        <Text style={styles.description}>
          Créez ou supprimez 20 participants fictifs pour tester l'application.
        </Text>

        {progress ? (
          <View style={styles.progressContainer}>
            <Text style={styles.progressText}>{progress}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.button, styles.buttonPrimary, loading && styles.buttonDisabled]}
          onPress={createTestParticipants}
          disabled={loading}
        >
          <Text style={styles.buttonPrimaryText}>
            Créer 20 participants de test
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonDanger, loading && styles.buttonDisabled]}
          onPress={deleteTestParticipants}
          disabled={loading}
        >
          <Text style={styles.buttonDangerText}>
            Supprimer les participants de test
          </Text>
        </TouchableOpacity>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>ℹ️ Information</Text>
          <Text style={styles.infoText}>
            • Les participants créés auront la note "TEST - À SUPPRIMER"{'\n'}
            • Vous pouvez les supprimer individuellement ou tous à la fois{'\n'}
            • Pratique pour tester le tri, les statistiques, etc.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
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
  content: {
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
    lineHeight: 22,
  },
  progressContainer: {
    backgroundColor: theme.colors.surface,
    padding: theme.space[3],
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.space[4],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  progressText: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.primary,
    textAlign: 'center',
  },
  button: {
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.space[4],
    paddingHorizontal: theme.space[4],
    marginBottom: theme.space[3],
    alignItems: 'center',
  },
  buttonPrimary: {
    backgroundColor: theme.colors.primary[500],
  },
  buttonPrimaryText: {
    color: '#FFFFFF',
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  buttonDanger: {
    backgroundColor: theme.colors.danger,
  },
  buttonDangerText: {
    color: '#FFFFFF',
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  infoBox: {
    backgroundColor: theme.colors.surface,
    padding: theme.space[4],
    borderRadius: theme.borderRadius.md,
    marginTop: theme.space[5],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  infoTitle: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.space[2],
  },
  infoText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    lineHeight: 20,
  },
});
