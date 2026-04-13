import React, { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from './screens/HomeScreen';
import DepartmentsScreen from './screens/DepartmentsScreen';
import UploadScreen from './screens/UploadScreen';
import QuickAccessScreen from './screens/QuickAccessScreen';
import ProfileScreen from './screens/ProfileScreen';
import BottomNavigation from './components/BottomNavigation';
import DepartmentDetailScreen from './screens/DepartmentDetailScreen';
import FileDetailsScreen from './screens/FileDetailsScreen';
import DepartmentAuthScreen from './screens/DepartmentAuthScreen';
import UsersScreen from './screens/UsersScreen';
import FinishedProjectsScreen from './screens/FinishedProjectsScreen';
import BrandedSplash from './components/BrandedSplash';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './context/AuthContext';
import { rootNavigationRef } from './navigation/rootNavigationRef';
import { colors } from './styles/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const RootStack = createNativeStackNavigator();

const linking = {
  prefixes: ['inyatsi://', 'https://inyatsi.app'],
  config: {
    screens: {
      MainTabs: {
        screens: {
          Home: {
            screens: {
              HomeScreen: 'home',
              FinishedProjectsScreen: 'finished-projects',
              DepartmentDetailScreen: 'departments/:departmentId',
              FileDetailsScreen: 'departments/:departmentId/files/:fileId',
            },
          },
          Departments: 'departments',
          Upload: 'upload',
          QuickAccess: 'quick-access',
          Profile: 'profile',
        },
      },
    },
  },
};

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeScreen" component={HomeScreen} />
      <HomeStack.Screen
        name="FinishedProjectsScreen"
        component={FinishedProjectsScreen}
        options={{
          headerShown: true,
          title: 'Finished projects',
          headerBackTitleVisible: false,
          headerTintColor: colors.primaryBlue,
          headerStyle: { backgroundColor: colors.white },
          headerShadowVisible: true,
        }}
      />
      <HomeStack.Screen
        name="DepartmentDetailScreen"
        component={DepartmentDetailScreen}
      />
      <HomeStack.Screen name="FileDetailsScreen" component={FileDetailsScreen} />
      <HomeStack.Screen name="UsersScreen" component={UsersScreen} />
    </HomeStack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      tabBar={(props) => <BottomNavigation {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen name="Home" component={HomeStackNavigator} />
      <Tab.Screen name="Departments" component={DepartmentsScreen} />
      <Tab.Screen name="Upload" component={UploadScreen} />
      <Tab.Screen
        name="Activity"
        component={QuickAccessScreen}
        options={{ title: 'Activity' }}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  return (
    <RootStack.Navigator
      initialRouteName="MainTabs"
      screenOptions={{ headerShown: false }}
    >
      <RootStack.Screen name="MainTabs" component={MainTabs} />
      <RootStack.Screen name="DepartmentAuth" component={DepartmentAuthScreen} />
    </RootStack.Navigator>
  );
}

function AuthGate() {
  const { loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loading]);

  if (loading) {
    return <BrandedSplash />;
  }

  return (
    <NavigationContainer ref={rootNavigationRef} linking={linking}>
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  /** Hide native splash as soon as JS runs so Expo Go never sits on “bundling 100%” with splash frozen. */
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (rootNavigationRef.isReady() && rootNavigationRef.canGoBack()) {
          rootNavigationRef.goBack();
          return true;
        }
        return false;
      }
    );
    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
