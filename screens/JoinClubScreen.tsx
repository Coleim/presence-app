import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { dataService } from '../lib/dataService';
import { authManager } from '../lib/authManager';
import { theme } from '../lib/theme';
import { useTranslation } from '../contexts/LanguageContext';

export default function JoinClubScreen({ navigation }) {
  const { t } = useTranslation();
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
        t('joinClub.loginRequired'),
        t('joinClub.loginRequiredMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('auth.signIn'), onPress: () => navigation.navigate('Auth') }
        ]
      );
      return;
    }

    if (!code.trim()) {
      Alert.alert(t('common.error'), t('joinClub.enterCodeError'));
      return;
    }

    setLoading(true);
    try {
      const club = await dataService.joinClubByCode(code.trim().toUpperCase());
      
      if (!club) {
        Alert.alert(t('common.error'), t('joinClub.invalidCodeError'));
        return;
      }
      
      Alert.alert(
        t('common.success'),
        t('joinClub.joinSuccess').replace('{{clubName}}', club.name),
        [
          {
            text: t('common.ok'),
            onPress: () => {
              // Navigate to the club details
              navigation.navigate('Home');
            }
          }
        ]
      );
    } catch (error: any) {
      let errorMessage = t('joinClub.joinError');
      if (error.message?.includes('Invalid share code')) {
        errorMessage = t('joinClub.invalidCodeError');
      }
      
      Alert.alert(t('common.error'), errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header with back button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('joinClub.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        {!isAuthenticated && (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              {t('joinClub.warning')}
            </Text>
          </View>
        )}
        
        <Text style={styles.description}>
          {t('joinClub.description')}
        </Text>

        <Text style={styles.label}>{t('joinClub.codeLabel')}</Text>
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