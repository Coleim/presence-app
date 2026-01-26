import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { i18n, Language } from '../lib/i18n';
import { theme } from '../lib/theme';

export default function LanguageSelectionScreen({ navigation }: any) {
  const [selectedLanguage, setSelectedLanguage] = useState<Language | null>(null);

  const selectLanguage = async (lang: Language) => {
    setSelectedLanguage(lang);
    // Small delay for visual feedback
    setTimeout(async () => {
      await i18n.setLanguage(lang);
      // Mark onboarding as complete
      await AsyncStorage.setItem('@presence_app:language_selected', 'true');
      // Navigate to Auth/Home screen
      navigation.replace('Auth');
    }, 200);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Welcome Icon/Logo */}
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>🌍</Text>
        </View>

        {/* Title */}
        <Text style={styles.title}>Welcome / Bienvenue</Text>
        <Text style={styles.subtitle}>Choose your language / Choisissez votre langue</Text>

        {/* Language Options */}
        <View style={styles.languageOptions}>
          <TouchableOpacity
            style={[
              styles.languageButton,
              selectedLanguage === 'fr' && styles.languageButtonSelected,
            ]}
            onPress={() => selectLanguage('fr')}
            activeOpacity={0.7}
          >
            <Text style={styles.flag}>🇫🇷</Text>
            <Text style={styles.languageName}>Français</Text>
            {selectedLanguage === 'fr' && (
              <View style={styles.checkmark}>
                <Text style={styles.checkmarkText}>✓</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.languageButton,
              selectedLanguage === 'en' && styles.languageButtonSelected,
            ]}
            onPress={() => selectLanguage('en')}
            activeOpacity={0.7}
          >
            <Text style={styles.flag}>🇬🇧</Text>
            <Text style={styles.languageName}>English</Text>
            {selectedLanguage === 'en' && (
              <View style={styles.checkmark}>
                <Text style={styles.checkmarkText}>✓</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer hint */}
        <Text style={styles.footer}>You can change this later in settings</Text>
        <Text style={styles.footer}>Vous pourrez changer cela plus tard</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary[900],
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.space[5],
  },
  iconContainer: {
    marginBottom: theme.space[5],
  },
  icon: {
    fontSize: 80,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: theme.space[2],
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.8,
    marginBottom: theme.space[6],
    textAlign: 'center',
  },
  languageOptions: {
    width: '100%',
    maxWidth: 400,
    gap: theme.space[3],
  },
  languageButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: theme.borderRadius.lg,
    padding: theme.space[5],
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[4],
    borderWidth: 3,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  languageButtonSelected: {
    borderColor: theme.colors.success,
    backgroundColor: '#F0FFF4',
  },
  flag: {
    fontSize: 48,
  },
  languageName: {
    fontSize: 24,
    fontWeight: '600',
    color: theme.colors.text.primary,
    flex: 1,
  },
  checkmark: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.success,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  footer: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.6,
    marginTop: theme.space[6],
    textAlign: 'center',
  },
});
