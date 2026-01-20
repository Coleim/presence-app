import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Share, Alert } from 'react-native';
import { syncService } from '../lib/syncService';
import { theme } from '../lib/theme';

export default function ShareClubScreen({ route, navigation }: any) {
  const { clubId, clubName } = route.params;
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadShareCode();
  }, [clubId]);

  const loadShareCode = async () => {
    try {
      const code = await syncService.getClubShareCode(clubId);
      setShareCode(code);
    } catch (error) {
      console.error('Error loading share code:', error);
      Alert.alert('Erreur', 'Impossible de charger le code de partage');
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!shareCode) return;

    try {
      await Share.share({
        message: `Rejoignez mon club "${clubName}" sur l'app de présences!\n\nCode: ${shareCode}\n\nUtilisez l'option "Rejoindre un club" dans l'app.`,
        title: `Invitation club: ${clubName}`,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const copyToClipboard = () => {
    if (!shareCode) return;
    
    // Note: On React Native, you'd use @react-native-clipboard/clipboard
    // For now, just show an alert
    Alert.alert(
      'Code copié',
      `Code: ${shareCode}\n\nPartagez ce code avec les autres enseignants pour qu'ils puissent rejoindre le club.`
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={theme.colors.primary[500]} />
      </View>
    );
  }

  if (!shareCode) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Code de partage non disponible</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.buttonText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Partager le club</Text>
      <Text style={styles.subtitle}>{clubName}</Text>

      <View style={styles.codeContainer}>
        <Text style={styles.codeLabel}>Code de partage</Text>
        <View style={styles.codeBox}>
          <Text style={styles.codeText}>{shareCode}</Text>
        </View>
        <Text style={styles.codeHint}>
          Les autres enseignants peuvent rejoindre ce club avec ce code
        </Text>
      </View>

      <TouchableOpacity
        style={styles.button}
        onPress={handleShare}
      >
        <Text style={styles.buttonText}>📤 Partager le code</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.buttonSecondary]}
        onPress={copyToClipboard}
      >
        <Text style={[styles.buttonText, styles.buttonTextSecondary]}>
          📋 Copier le code
        </Text>
      </TouchableOpacity>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>ℹ️ Comment ça marche?</Text>
        <Text style={styles.infoText}>
          • Partagez ce code avec d'autres enseignants{'\n'}
          • Ils pourront voir et modifier les présences{'\n'}
          • Toutes les modifications se synchronisent automatiquement{'\n'}
          • Les données sont partagées en temps réel (30 secondes)
        </Text>
      </View>

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.backButtonText}>← Retour</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.text.primary,
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 40,
    textAlign: 'center',
  },
  codeContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  codeLabel: {
    fontSize: 16,
    color: '#666',
    marginBottom: 15,
  },
  codeBox: {
    backgroundColor: '#f8f9fa',
    borderWidth: 2,
    borderColor: theme.colors.primary[500],
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 40,
    marginBottom: 10,
  },
  codeText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: theme.colors.primary[500],
    letterSpacing: 8,
    fontFamily: 'monospace',
  },
  codeHint: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  button: {
    backgroundColor: theme.colors.primary[500],
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 15,
  },
  buttonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: theme.colors.primary[500],
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  buttonTextSecondary: {
    color: theme.colors.primary[500],
  },
  infoBox: {
    backgroundColor: '#f0f8ff',
    padding: 20,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary[500],
    marginTop: 20,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text.primary,
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 22,
  },
  backButton: {
    padding: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  backButtonText: {
    color: '#666',
    fontSize: 16,
  },
  errorText: {
    fontSize: 18,
    color: '#d32f2f',
    textAlign: 'center',
    marginBottom: 20,
  },
});
