import React, { useRef, useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProvider } from './contexts/UserContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { dataService } from './lib/dataService';
import LanguageSelectionScreen from './screens/LanguageSelectionScreen';
import AuthScreen from './screens/AuthScreen';
import HomeScreen from './screens/HomeScreen';
import ClubListScreen from './screens/ClubListScreen';
import CreateClubScreen from './screens/CreateClubScreen';
import ClubDetailsScreen from './screens/ClubDetailsScreen';
import AddSessionScreen from './screens/AddSessionScreen';
import AddParticipantScreen from './screens/AddParticipantScreen';
import EditParticipantScreen from './screens/EditParticipantScreen';
import SessionSelectionScreen from './screens/SessionSelectionScreen';
import AttendanceScreen from './screens/AttendanceScreen';
import StatsScreen from './screens/StatsScreen';
import TestUtilsScreen from './screens/TestUtilsScreen';
import JoinClubScreen from './screens/JoinClubScreen';
import ShareClubScreen from './screens/ShareClubScreen';

const NEVER_ASK_AGAIN_KEY = '@presence_app:never_ask_login';
const LANGUAGE_SELECTED_KEY = '@presence_app:language_selected';

type RootStackParamList = {
  LanguageSelection: undefined;
  Auth: undefined;
  Home: undefined;
  ClubList: undefined;
  CreateClub: undefined;
  ClubDetails: { club: any };
  AddSession: { clubId: string };
  AddParticipant: { clubId: string };
  EditParticipant: { participant: any; clubId: string };
  SessionSelection: { club: any };
  Attendance: { session: any; date: string };
  Stats: { club: any };
  TestUtils: { clubId: string };
  JoinClub: undefined;
  ShareClub: { clubId: string; clubName: string };
};

const Stack = createStackNavigator<RootStackParamList>();

function AppNavigator() {
  const navigationRef = useRef(null);
  const [initialRoute, setInitialRoute] = useState<'LanguageSelection' | 'Auth' | 'Home' | null>(null);

  useEffect(() => {
    checkInitialRoute();
    // Check online status in background (non-blocking)
    dataService.checkOnline();
  }, []);

  const checkInitialRoute = async () => {
    try {
      console.log('[App] Checking initial route...');
      
      // Check if user has explicitly selected a language (onboarding complete)
      const languageSelected = await AsyncStorage.getItem(LANGUAGE_SELECTED_KEY);
      console.log('[App] Language selected:', languageSelected);
      
      // If language not selected yet, show language selection first
      if (!languageSelected) {
        console.log('[App] First launch - showing language selection');
        setInitialRoute('LanguageSelection');
        return;
      }
      
      // Vérifier si l'utilisateur a choisi de ne jamais se connecter
      const neverAskAgain = await AsyncStorage.getItem(NEVER_ASK_AGAIN_KEY);
      console.log('[App] Never ask again:', neverAskAgain);
      
      // DON'T check auth at startup - causes lock issues!
      // Auth state will be handled by screens that need it
      
      // Si l'utilisateur a choisi de ne jamais se connecter, aller directement à Home
      if (neverAskAgain === 'true') {
        console.log('[App] User chose offline mode, going to Home');
        setInitialRoute('Home');
      } else {
        console.log('[App] Showing auth screen');
        setInitialRoute('Auth');
      }
    } catch (error) {
      console.error('Error checking initial route:', error);
      setInitialRoute('LanguageSelection');
    }
  };

  if (!initialRoute) {
    return null; // ou un écran de chargement
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator initialRouteName={initialRoute}>
        <Stack.Screen name="LanguageSelection" component={LanguageSelectionScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="ClubList" component={ClubListScreen} options={{ headerShown: false }} />
        <Stack.Screen name="CreateClub" component={CreateClubScreen} options={{ headerShown: false }} />
        <Stack.Screen name="ClubDetails" component={ClubDetailsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="AddSession" component={AddSessionScreen} options={{ headerShown: false }} />
        <Stack.Screen name="AddParticipant" component={AddParticipantScreen} options={{ headerShown: false }} />
        <Stack.Screen name="EditParticipant" component={EditParticipantScreen} options={{ headerShown: false }} />
        <Stack.Screen name="SessionSelection" component={SessionSelectionScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Attendance" component={AttendanceScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Stats" component={StatsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="TestUtils" component={TestUtilsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="JoinClub" component={JoinClubScreen} options={{ headerShown: false }} />
        <Stack.Screen name="ShareClub" component={ShareClubScreen} options={{ headerShown: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <LanguageProvider>
        <UserProvider>
          <AppNavigator />
        </UserProvider>
      </LanguageProvider>
    </SafeAreaView>
  );
}
