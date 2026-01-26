# Localization Implementation Guide

## ✅ What's Been Created

### 1. **Translation Files**
- [locales/fr.ts](locales/fr.ts) - French translations
- [locales/en.ts](locales/en.ts) - English translations

### 2. **Core System**
- [lib/i18n.ts](lib/i18n.ts) - i18n engine (manages language switching & translations)
- [contexts/LanguageContext.tsx](contexts/LanguageContext.tsx) - React context for language state

### 3. **Components**
- [components/LanguageSelector.tsx](components/LanguageSelector.tsx) - Language switcher (🇫🇷 FR / 🇬🇧 EN)

### 4. **App Integration**
- [App.tsx](App.tsx) - Wrapped with `LanguageProvider`

## 🚀 How to Use

### Basic Usage in Screens

```tsx
import { useTranslation } from '../contexts/LanguageContext';

function MyScreen() {
  const { t } = useTranslation();
  
  return (
    <View>
      <Text>{t('home.title')}</Text>
      <Text>{t('common.back')}</Text>
    </View>
  );
}
```

### Example: Translated Button

```tsx
<TouchableOpacity onPress={createClub}>
  <Text>{t('createClub.create')}</Text>
</TouchableOpacity>
```

### Add Language Selector to HomeScreen

```tsx
import { LanguageSelector } from '../components/LanguageSelector';

function HomeScreen() {
  return (
    <View>
      {/* Add in header or settings */}
      <LanguageSelector />
    </View>
  );
}
```

## 📝 Translation Keys Structure

All translations follow this structure:

```
common.*          - Common words (back, cancel, delete, etc.)
home.*            - Home screen
club.*            - Club details screen
createClub.*      - Create club screen
addParticipant.*  - Add participant screen
editParticipant.* - Edit participant screen
addSession.*      - Add session screen
days.*            - Days of week
attendance.*      - Attendance screen
stats.*           - Statistics screen
limits.*          - Usage limits messages
auth.*            - Authentication screen
share.*           - Share club screen
joinClub.*        - Join club screen
```

## 🔧 Adding New Translations

### 1. Add to both language files:

**locales/en.ts:**
```ts
export const en = {
  // ...existing translations
  myNewScreen: {
    title: 'My New Screen',
    button: 'Click Me',
  },
};
```

**locales/fr.ts:**
```ts
export const fr = {
  // ...existing translations
  myNewScreen: {
    title: 'Mon Nouvel Écran',
    button: 'Cliquez-moi',
  },
};
```

### 2. Use in your screen:

```tsx
const { t } = useTranslation();
<Text>{t('myNewScreen.title')}</Text>
```

## 🎨 Language Selector Placement

You can add the language selector in multiple places:

### Option 1: In HomeScreen header
```tsx
<View style={styles.header}>
  <Text>{t('home.title')}</Text>
  <LanguageSelector />
</View>
```

### Option 2: In settings/menu
```tsx
<View style={styles.settings}>
  <Text>{t('common.language')}</Text>
  <LanguageSelector />
</View>
```

### Option 3: In AuthScreen
```tsx
// At the top for first-time users
<LanguageSelector />
<Text>{t('auth.signIn')}</Text>
```

## 🔄 Converting Existing Screens

To convert a screen to use translations:

### Before:
```tsx
<Text>Créer un club</Text>
<TextInput placeholder="Entrez le nom du club" />
<TouchableOpacity><Text>Créer le club</Text></TouchableOpacity>
```

### After:
```tsx
const { t } = useTranslation();
<Text>{t('createClub.title')}</Text>
<TextInput placeholder={t('createClub.namePlaceholder')} />
<TouchableOpacity><Text>{t('createClub.create')}</Text></TouchableOpacity>
```

## 💾 Storage

- User's language preference is saved in AsyncStorage
- Persists across app restarts
- Defaults to French if no preference is set
- Can be changed at any time with the LanguageSelector

## 🌍 Features

✅ **Instant switching** - no reload needed  
✅ **Persistent** - saved in local storage  
✅ **Type-safe** - uses TypeScript  
✅ **Simple API** - just `t('key')`  
✅ **Lightweight** - no external dependencies  
✅ **Reactive** - all screens update automatically  

## 📋 Next Steps

### 1. Add LanguageSelector to HomeScreen
Place it in the header for easy access

### 2. Convert screens one by one
Start with the most-used screens:
- HomeScreen
- CreateClubScreen  
- ClubDetailsScreen
- AddParticipantScreen
- AddSessionScreen

### 3. Test both languages
Make sure all text displays correctly in both English and French

### 4. Add more languages (optional)
Easy to add Spanish, German, etc.:
```ts
// locales/es.ts
export const es = { ... };

// lib/i18n.ts
const translations = {
  en, fr, es
};
```

## 🎯 Example Implementation

I'll now convert **CreateClubScreen** as an example to show you how it works!
