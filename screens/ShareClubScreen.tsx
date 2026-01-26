import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Share, Alert } from 'react-native';
import { syncService } from '../lib/syncService';
import { theme } from '../lib/theme';
import { useTranslation } from '../contexts/LanguageContext';

export default function ShareClubScreen({ route, navigation }: any) {
  const { t } = useTranslation();
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
      Alert.alert(t('common.error'), t('share.errorLoading'));
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!shareCode) return;

    try {
      await Share.share({
        message: `${t('share.shareMessage').replace('{{clubName}}', clubName).replace('{{code}}', shareCode)}`,
        title: `${t('share.shareMessageTitle').replace('{{clubName}}', clubName)}`,
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
      t('share.copied'),
      `${t('share.shareCode')}: ${shareCode}\n\n${t('share.copiedMessage')}`
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
        <Text style={styles.errorText}>{t('share.codeNotAvailable')}</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.buttonText}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('share.title')}</Text>
      <Text style={styles.subtitle}>{clubName}</Text>

      <View style={styles.codeContainer}>
        <Text style={styles.codeLabel}>{t('share.shareCode')}</Text>
        <View style={styles.codeBox}>
          <Text style={styles.codeText}>{shareCode}</Text>
        </View>
        <Text style={styles.codeHint}>
          {t('share.description')}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.button}
        onPress={handleShare}
      >
        <Text style={styles.buttonText}>{t('share.shareButton')}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.buttonSecondary]}
        onPress={copyToClipboard}
      >
        <Text style={[styles.buttonText, styles.buttonTextSecondary]}>
          {t('share.copyButton')}
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
