import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from '../contexts/LanguageContext';
import { theme } from '../lib/theme';

export function LanguageSelector() {
  const { language, setLanguage } = useTranslation();

  const handleLanguageChange = async (lang: 'en' | 'fr') => {
    console.log('[LanguageSelector] Changing language to:', lang);
    await setLanguage(lang);
    console.log('[LanguageSelector] Language changed');
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, language === 'fr' && styles.buttonActive]}
        onPress={() => handleLanguageChange('fr')}
      >
        <Text style={[styles.buttonText, language === 'fr' && styles.buttonTextActive]}>
          🇫🇷 FR
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[styles.button, language === 'en' && styles.buttonActive]}
        onPress={() => handleLanguageChange('en')}
      >
        <Text style={[styles.buttonText, language === 'en' && styles.buttonTextActive]}>
          🇬🇧 EN
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  buttonActive: {
    backgroundColor: theme.colors.primary[500],
    borderColor: theme.colors.primary[500],
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text.primary,
  },
  buttonTextActive: {
    color: '#FFFFFF',
  },
});
