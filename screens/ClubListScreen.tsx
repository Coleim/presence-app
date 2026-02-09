import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { dataService } from '../lib/dataService';
import { signOut } from '../lib/auth';
import { authManager } from '../lib/authManager';
import { syncService } from '../lib/syncService';
import { theme } from '../lib/theme';
import { useTranslation } from '../contexts/LanguageContext';

export default function ClubListScreen({ navigation }) {
  const { t } = useTranslation();
  const [clubs, setClubs] = useState([]);

  const fetchClubs = async () => {
    const data = await dataService.getClubs();
    setClubs(data);
  };

  const handleLogout = async () => {
    try {
      await signOut();
      authManager.invalidateCache();
      syncService.stopAutoSync();
      navigation.navigate('Auth');
    } catch (error) {
      // Silent fail
    }
  };

  useEffect(() => {
    fetchClubs();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchClubs();
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    if (clubs.length === 1) {
      navigation.replace('ClubDetails', { club: clubs[0] });
    }
  }, [clubs, navigation]);

  return (
    <View style={styles.container}>
      {/* Header Container */}
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.smallBackButton}>
          <Text style={styles.smallBackButtonText}>{t('common.back')}</Text>
        </TouchableOpacity>
        {/* Main Header */}
        <View style={styles.mainHeader}>
          <Text style={styles.headerTitle}>{t('home.title')}</Text>
        </View>
      </View>

      {/* Content */}
      <View style={styles.contentContainer}>
        <TouchableOpacity style={styles.buttonPrimary} onPress={() => navigation.navigate('CreateClub')}>
          <Text style={styles.buttonPrimaryText}>{t('home.createClub')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.buttonSecondary} onPress={() => navigation.navigate('JoinClub')}>
          <Text style={styles.buttonSecondaryText}>{t('home.joinClub')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Feather name="log-out" size={20} color={theme.colors.error} />
          <Text style={styles.logoutText}>{t('auth.signOut')}</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>{t('home.title')}</Text>
        <FlatList
          data={clubs}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.clubItem}
              onPress={() => navigation.navigate('ClubDetails', { club: item })}
            >
              <Text style={styles.clubName}>{item.name}</Text>
              <Text style={styles.arrowIcon}>→</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>{t('home.noClubs')}</Text>}
        />
      </View>
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
    flex: 1,
    padding: theme.space[4],
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
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space[2],
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.space[3],
    paddingHorizontal: theme.space[4],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.error,
    marginTop: theme.space[4],
  },
  logoutText: {
    color: theme.colors.error,
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.medium,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginTop: theme.space[4],
    marginBottom: theme.space[3],
  },
  clubItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: theme.space[4],
    marginBottom: theme.space[2],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  clubName: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
  },
  arrowIcon: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.text.secondary,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.secondary,
    marginTop: theme.space[6],
  },
});