import AsyncStorage from '@react-native-async-storage/async-storage';
import { en } from '../locales/en';
import { fr } from '../locales/fr';

const LANGUAGE_KEY = '@presence_app:language';

export type Language = 'en' | 'fr';
export type TranslationKeys = typeof en;

const translations: Record<Language, TranslationKeys> = {
  en,
  fr,
};

class I18n {
  private currentLanguage: Language = 'fr'; // Default to French
  private listeners: Array<(lang: Language) => void> = [];

  async init() {
    try {
      const saved = await AsyncStorage.getItem(LANGUAGE_KEY);
      if (saved && (saved === 'en' || saved === 'fr')) {
        this.currentLanguage = saved as Language;
      }
    } catch (error) {
      console.error('Error loading language:', error);
    }
  }

  getCurrentLanguage(): Language {
    return this.currentLanguage;
  }

  async setLanguage(lang: Language) {
    console.log('[i18n] setLanguage called with:', lang);
    this.currentLanguage = lang;
    try {
      await AsyncStorage.setItem(LANGUAGE_KEY, lang);
      console.log('[i18n] Language saved to AsyncStorage:', lang);
    } catch (error) {
      console.error('Error saving language:', error);
    }
    console.log('[i18n] Notifying listeners, count:', this.listeners.length);
    this.notifyListeners();
  }

  t(key: string): string {
    const keys = key.split('.');
    let value: any = translations[this.currentLanguage];
    
    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = value[k];
      } else {
        return key; // Return key if translation not found
      }
    }
    
    return typeof value === 'string' ? value : key;
  }

  // Translate day names between languages
  translateDay(dayName: string): string {
    const frenchDays = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const englishDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    // Find the index in either French or English
    let dayIndex = frenchDays.indexOf(dayName);
    if (dayIndex === -1) {
      dayIndex = englishDays.indexOf(dayName);
    }
    
    if (dayIndex === -1) {
      console.warn('Unknown day name:', dayName);
      return dayName; // Return as-is if not found
    }
    
    // Return the day name in the current language
    const translatedDay = this.currentLanguage === 'fr' ? frenchDays[dayIndex] : englishDays[dayIndex];
    return translatedDay || dayName;
  }

  // Subscribe to language changes
  subscribe(listener: (lang: Language) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.currentLanguage));
  }
}

export const i18n = new I18n();
