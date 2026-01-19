import React, { useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UserProvider } from './contexts/UserContext';
import AuthScreen from './screens/AuthScreen';
import HomeScreen from './screens/HomeScreen';
import ClubListScreen from './screens/ClubListScreen';
import CreateClubScreen from './screens/CreateClubScreen';
import ClubDetailsScreen from './screens/ClubDetailsScreen';
import AddSessionScreen from './screens/AddSessionScreen';
import AddParticipantScreen from './screens/AddParticipantScreen';
import SessionSelectionScreen from './screens/SessionSelectionScreen';
import AttendanceScreen from './screens/AttendanceScreen';
import StatsScreen from './screens/StatsScreen';
import TestUtilsScreen from './screens/TestUtilsScreen';

type RootStackParamList = {
  Auth: undefined;
  Home: undefined;
  ClubList: undefined;
  CreateClub: undefined;
  ClubDetails: { club: any };
  AddSession: { clubId: string };
  AddParticipant: { clubId: string };
  SessionSelection: { club: any };
  Attendance: { session: any; date: string };
  Stats: { club: any };
  TestUtils: { clubId: string };
};

const Stack = createStackNavigator<RootStackParamList>();

function AppNavigator() {
  const navigationRef = useRef(null);

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Auth" component={AuthScreen} />
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="ClubList" component={ClubListScreen} options={{ headerShown: false }} />
        <Stack.Screen name="CreateClub" component={CreateClubScreen} options={{ headerShown: false }} />
        <Stack.Screen name="ClubDetails" component={ClubDetailsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="AddSession" component={AddSessionScreen} options={{ headerShown: false }} />
        <Stack.Screen name="AddParticipant" component={AddParticipantScreen} options={{ headerShown: false }} />
        <Stack.Screen name="SessionSelection" component={SessionSelectionScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Attendance" component={AttendanceScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Stats" component={StatsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="TestUtils" component={TestUtilsScreen} options={{ headerShown: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <UserProvider>
        <AppNavigator />
      </UserProvider>
    </SafeAreaView>
  );
}
