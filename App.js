import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useCallback } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { View, Text, StyleSheet } from 'react-native';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

// Error Boundary Component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorText}>{this.state.error?.toString()}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

// Import all your screens
import GradientSplash from './app/gradient-splash';
import Login from './app/login';
import HomeNew from './app/home-new';
import Home from './app/home';
import PunchRedesign from './app/punch-redesign';
import Punch from './app/punch';
import Request from './app/request';
import LeaveRequest from './app/leave-request';
import LateRequest from './app/late-request';
import EarlyRequest from './app/early-request';
import ViewLeaveRequests from './app/view-leave-requests';
import ViewLateRequests from './app/view-late-requests';
import ViewEarlyRequests from './app/view-early-requests';
import Profile from './app/profile';
import Target from './app/target';
import Leads from './app/leads';
import Fuel from './app/fuel';
import Dashboard from './app/dashboard';
import Collection from './app/collection';
import AddCollection from './app/addcollection';
import Feeder from './app/feeder';
import AddFeeder from './app/add-feeder';
import About from './app/about';
import Notifications from './app/notifications';

const Stack = createNativeStackNavigator();

export default function App() {
  const onNavigationReady = useCallback(async () => {
    await SplashScreen.hideAsync();
  }, []);

  return (
    <ErrorBoundary>
      <NavigationContainer onReady={onNavigationReady}>
        <Stack.Navigator
          initialRouteName="GradientSplash"
          screenOptions={{
            headerShown: false,
            animation: 'none',
          }}
        >
          <Stack.Screen name="GradientSplash" component={GradientSplash} />
          <Stack.Screen name="Login" component={Login} />
          <Stack.Screen name="HomeNew" component={HomeNew} />
          <Stack.Screen name="Home" component={Home} />
          <Stack.Screen name="PunchRedesign" component={PunchRedesign} />
          <Stack.Screen name="Punch" component={Punch} />
          <Stack.Screen name="Request" component={Request} />
          <Stack.Screen name="LeaveRequest" component={LeaveRequest} />
          <Stack.Screen name="LateRequest" component={LateRequest} />
          <Stack.Screen name="EarlyRequest" component={EarlyRequest} />
          <Stack.Screen name="ViewLeaveRequests" component={ViewLeaveRequests} />
          <Stack.Screen name="ViewLateRequests" component={ViewLateRequests} />
          <Stack.Screen name="ViewEarlyRequests" component={ViewEarlyRequests} />
          <Stack.Screen name="Profile" component={Profile} />
          <Stack.Screen name="Target" component={Target} />
          <Stack.Screen name="Leads" component={Leads} />
          <Stack.Screen name="Fuel" component={Fuel} />
          <Stack.Screen name="Dashboard" component={Dashboard} />
          <Stack.Screen name="Collection" component={Collection} />
          <Stack.Screen name="AddCollection" component={AddCollection} />
          <Stack.Screen name="Feeder" component={Feeder} />
          <Stack.Screen name="AddFeeder" component={AddFeeder} />
          <Stack.Screen name="About" component={About} />
          <Stack.Screen name="Notifications" component={Notifications} />
        </Stack.Navigator>
      </NavigationContainer>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#EF4444',
    marginBottom: 10,
  },
  errorText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});
