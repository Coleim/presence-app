import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { dataService } from '../lib/dataService';
import { authManager } from '../lib/authManager';
import { theme } from '../lib/theme';

export default function JoinClubScreen({ navigation }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  React.useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const isAuth = await authManager.isAuthenticated();
    setIsAuthenticated(isAuth);
  };

  const joinClub = async () => {
    if (!isAuthenticated) {
      Alert.alert(
        'Connexion requise',
        'Vous devez être connecté pour rejoindre un club partagé.',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Se connecter', onPress: () => navigation.navigate('Auth') }
        ]
      );
      return;
    }

    if (!code.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un code de partage');
      return;
    }

    setLoading(true);
    try {
      const club = await dataService.joinClubByCode(code.trim().toUpperCase());
      
      if (!club) {
        Alert.alert('Erreur', 'Code de partage invalide ou club introuvable');
        return;
      }
      
      Alert.alert(
        'Succès',
        `Vous avez rejoint le club "${club.name}" avec succès!`,
        [
          {
            text: 'OK',
            onPress: () => {
              // Navigate to the club details
              navigation.navigate('Home');
            }
          }
        ]
      );
    } catch (error: any) {
      console.error('Error joining club:', error);
      
      let errorMessage = 'Impossible de rejoindre le club. Vérifiez que le code est correct.';
      if (error.message?.includes('Invalid share code')) {
        errorMessage = 'Code de partage invalide';
      }
      
      Alert.alert('Erreur', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header with back button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Rejoindre un club</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        {!isAuthenticated && (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              ⚠️ Vous devez être connecté pour rejoindre un club partagé
            </Text>
          </View>
        )}
        
        <Text style={styles.description}>
          Entrez le code partagé par le propriétaire du club pour le rejoindre.
        </Text>

        <Text style={styles.label}>Code du club</Text>
        <TextInput
          placeholder="Ex: ABC123"
          value={code}
          onChangeText={(text) => setCode(text.toUpperCase())}
          style={styles.input}
          placeholderTextColor={theme.colors.text.secondary}
          autoCapitalize="characters"
          maxLength={6}
          editable={!loading}
        />

        <TouchableOpacity 
          style={[styles.buttonPrimary, (loading || !isAuthenticated) && styles.buttonDisabled]} 
          onPress={joinClub}
          disabled={loading || !isAuthenticated}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonPrimaryText}>Rejoindre le club</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary[900],
    paddingHorizontal: theme.space[4],
    paddingVertical: theme.space[3],
  },
  backButton: {
    padding: theme.space[2],
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.medium,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#FFFFFF',
  },
  headerSpacer: {
    width: theme.space[7], // Same width as back button for centering
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  contentContainer: {
    padding: theme.space[4],
  },
  warningBox: {
    backgroundColor: theme.colors.warningBg,
    borderRadius: theme.borderRadius.md,
    padding: theme.space[3],
    marginBottom: theme.space[4],
    borderWidth: 1,
    borderColor: theme.colors.warning,
  },
  warningText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.warning,
    textAlign: 'center',
  },
  description: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.secondary,
    marginBottom: theme.space[5],
    textAlign: 'center',
  },
  label: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
    marginBottom: theme.space[2],
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.space[3],
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.primary,
    marginBottom: theme.space[4],
  },
  buttonPrimary: theme.components.buttonPrimary,
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonPrimaryText: {
    color: theme.colors.surface,
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.semibold,
  },
});