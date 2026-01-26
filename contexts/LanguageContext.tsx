import React, { createContext, useContext, useState, useEffect } from 'react';
import { i18n, Language } from '../lib/i18n';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  translateDay: (dayName: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(i18n.getCurrentLanguage());

  useEffect(() => {
    // Initialize i18n
    i18n.init().then(() => {
      setLanguageState(i18n.getCurrentLanguage());
    });

    // Subscribe to language changes
    const unsubscribe = i18n.subscribe((lang) => {
      setLanguageState(lang);
    });

    return unsubscribe;
  }, []);

  const setLanguage = async (lang: Language) => {
    await i18n.setLanguage(lang);
  };

  const t = (key: string) => i18n.t(key);
  const translateDay = (dayName: string) => i18n.translateDay(dayName);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, translateDay }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useTranslation must be used within LanguageProvider');
  }
  return context;
}
