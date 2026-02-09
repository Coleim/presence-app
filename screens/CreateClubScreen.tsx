import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { dataService } from '../lib/dataService';
import { authManager } from '../lib/authManager';
import { usageService } from '../lib/usageService';
import { hasReachedClubLimit, getLimitMessage, USAGE_LIMITS } from '../lib/usageLimits';
import { UpgradePrompt } from '../components/UpgradePrompt';
import { useTranslation } from '../contexts/LanguageContext';
import { theme } from '../lib/theme';

export default function CreateClubScreen({ navigation }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [canCreateClub, setCanCreateClub] = useState(true);
  const [clubsOwned, setClubsOwned] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkClubLimit();
  }, []);

  const checkClubLimit = async () => {
    try {
      const userId = await authManager.getUserId();
      
      // If not logged in, allow unlimited clubs (local-only mode)
      if (!userId) {
        setCanCreateClub(true);
        setClubsOwned(0);
        setIsLoading(false);
        return;
      }

      const stats = await usageService.getUserUsageStats(userId);
      setClubsOwned(stats.clubsOwned);
      setCanCreateClub(!hasReachedClubLimit(stats.clubsOwned));
    } catch (error) {
      // On error, allow creation (fail open for better UX)
      setCanCreateClub(true);
    } finally {
      setIsLoading(false);
    }
  };

  const createClub = async () => {
    if (!name.trim()) {
      alert(t('createClub.nameRequired'));
      return;
    }

    // Check limit before creating
    if (!canCreateClub) {
      Alert.alert(
        t('limits.limitReached'),
        getLimitMessage('club') + '\n\n' + t('limits.upgradeMessage'),
        [
          { text: t('common.ok'), style: 'cancel' },
        ]
      );
      return;
    }

    try {
      // Get current user ID if authenticated
      const userId = await authManager.getUserId();
      
      const club = {
        name: name.trim(),
        description: description.trim(),
        owner_id: userId || undefined, // Set owner if authenticated
      };
      // Wait for local save (fast), cloud sync happens in background
      await dataService.saveClub(club);
      // Navigate after local save completes
      navigation.goBack();
    } catch (error) {
      // Handle database constraint errors
      if (error.message && error.message.includes('only own 1 club')) {
        Alert.alert(
          t('limits.limitReached'),
          getLimitMessage('club') + '\n\n' + t('limits.upgradeMessage')
        );
      } else {
        alert(t('common.error') + ': ' + error.message);
      }
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
          <Text style={styles.headerTitle}>{t('createClub.title')}</Text>
        </View>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        {/* Show upgrade prompt if limit reached */}
        {!canCreateClub && !isLoading && (
          <UpgradePrompt
            message={getLimitMessage('club')}
            style={styles.upgradePrompt}
          />
        )}

        {/* Show usage info if user can create and is logged in */}
        {canCreateClub && !isLoading && clubsOwned > 0 && (
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              {t('limits.freeVersion')} {clubsOwned}/{USAGE_LIMITS.CLUBS_PER_USER} {t('limits.clubUsed')}
            </Text>
          </View>
        )}

        <Text style={styles.label}>{t('createClub.name')}</Text>
        <TextInput
          placeholder={t('createClub.namePlaceholder')}
          value={name}
          onChangeText={setName}
          style={styles.input}
          placeholderTextColor={theme.colors.text.secondary}
          editable={canCreateClub}
        />

        <Text style={styles.label}>{t('createClub.description')} ({t('common.optional')})</Text>
        <TextInput
          placeholder={t('createClub.descriptionPlaceholder')}
          value={description}
          onChangeText={setDescription}
          style={[styles.input, styles.textArea]}
          multiline
          numberOfLines={3}
          placeholderTextColor={theme.colors.text.secondary}
          editable={canCreateClub}
        />

        <TouchableOpacity 
          style={[styles.buttonPrimary, !canCreateClub && styles.buttonDisabled]} 
          onPress={createClub}
          disabled={!canCreateClub || isLoading}
        >
          <Text style={styles.buttonPrimaryText}>
            {isLoading ? t('createClub.checking') : t('createClub.create')}
          </Text>
        </TouchableOpacity>
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
  textArea: {
    height: theme.space[7] * 3, // 3 lines height
    textAlignVertical: 'top',
  },
  buttonPrimary: theme.components.buttonPrimary,
  buttonPrimaryText: {
    color: theme.colors.surface,
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  buttonDisabled: {
    backgroundColor: theme.colors.disabled,
    opacity: 0.5,
  },
  upgradePrompt: {
    marginBottom: theme.space[4],
  },
  infoBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: theme.borderRadius.md,
    padding: theme.space[3],
    marginBottom: theme.space[4],
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  infoText: {
    fontSize: theme.typography.fontSize.sm,
    color: '#1E40AF',
    textAlign: 'center',
  },
});