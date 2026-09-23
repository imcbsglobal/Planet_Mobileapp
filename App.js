import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
import About from './app/about';
import AddFeeder from './app/add-feeder';
import AddClaim from './app/Addclaim';
import AddCollection from './app/addcollection';
import Claim from './app/Claim';
import Collection from './app/collection';
import Enquiry from './app/enquiry';
import Feeder from './app/feeder';
import Fuel from './app/fuel';
import GradientSplash from './app/gradient-splash';
import HomeNew from './app/home-new';
import Leads from './app/leads';
import LeadsList from './app/leadslist';
import LedgerAccounts from './app/LedgerAccounts';
import LedgerCompanies from './app/LedgerCompanies';
import Login from './app/login';
import Notifications from './app/notifications';
import Profile from './app/profile';
import PunchIn from './app/punchin';
import StockReportCompanies from './app/StockReportCompanies';
import StockReportProducts from './app/StockReportProduct';
import Target from './app/target';





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
          <Stack.Screen name="Profile" component={Profile} />
          <Stack.Screen name="Target" component={Target} />
          <Stack.Screen name="Leads" component={Leads} />
          <Stack.Screen name="LeadsList" component={LeadsList} />
          <Stack.Screen name="Fuel" component={Fuel} />
          <Stack.Screen name="Collection" component={Collection} />
          <Stack.Screen name="AddCollection" component={AddCollection} />
          <Stack.Screen name="Feeder" component={Feeder} />
          <Stack.Screen name="AddFeeder" component={AddFeeder} />
          <Stack.Screen name="About" component={About} />
          <Stack.Screen name="Notifications" component={Notifications} />
          <Stack.Screen name="Claim" component={Claim} />
          <Stack.Screen name="AddClaim" component={AddClaim} />
          <Stack.Screen name="LedgerCompanies" component={LedgerCompanies} />
          <Stack.Screen name="LedgerAccounts" component={LedgerAccounts} />
          <Stack.Screen name="StockReportCompanies" component={StockReportCompanies} />
          <Stack.Screen name="StockReportProducts" component={StockReportProducts} />
          <Stack.Screen name="PunchIn" component={PunchIn} />
          <Stack.Screen name="Enquiry" component={Enquiry} />

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