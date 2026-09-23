import { useNavigation } from '@react-navigation/native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Platform, StatusBar, StyleSheet, Text, View } from 'react-native';

const logoImage = require('../assets/images/logo_blk.png');
const VERSION_CHECK_URL = 'https://ship.imcbs.com/api/v1/my-imc/';

const normalizeVersion = (version: string) =>
  version
    .split('.')
    .map((part) => parseInt(part, 10) || 0)
    .slice(0, 3);

const compareVersions = (current: string, minimum: string) => {
  const currentParts = normalizeVersion(current);
  const minimumParts = normalizeVersion(minimum);

  for (let i = 0; i < 3; i += 1) {
    if (currentParts[i] < minimumParts[i]) return -1;
    if (currentParts[i] > minimumParts[i]) return 1;
  }

  return 0;
};

export default function GradientSplash() {
  const navigation = useNavigation();
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [forcedUpdate, setForcedUpdate] = useState(false);
  const [optionalUpdate, setOptionalUpdate] = useState(false);
  const [updateUrl, setUpdateUrl] = useState('https://play.google.com/store/apps/details?id=com.myimc2006.app&hl=en_IN');
  const [checkingVersion, setCheckingVersion] = useState(true);

  const onUpdatePress = async (url?: string) => {
    try {
      await Linking.openURL(url || updateUrl);
    } catch (error) {
      Alert.alert('Update required', 'Please update the app from the Play Store to continue.');
    }
  };

  const onContinuePress = () => {
    navigation.replace('Login');
  };

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const checkVersion = async () => {
      try {
        const response = await fetch(VERSION_CHECK_URL, { method: 'GET' });
        const payload = await response.json();

        // Android-only for now. iOS has no store_url / minimum_version logic
        // yet, so it should just fall through to the "no update" path below
        // and continue to Login like normal. Add an `ios` branch here once
        // the App Store link is ready.
        if (Platform.OS === 'android' && payload?.status === 'success' && payload?.data?.android) {
          const currentVersion =
            Constants.expoConfig?.version || Application.nativeApplicationVersion || (Constants as any).manifest?.version || '0.0.0';
          const storeUrl = payload.data.android.store_url ?? updateUrl;
          const serverLatest = payload.data.android.latest_version ?? null;
          const serverMinimum = payload.data.android.minimum_version ?? null;

          setUpdateUrl(storeUrl);

          // Trust the server's latest_version directly. (We previously tried
          // scraping the Play Store page for the live version, but its HTML
          // doesn't reliably expose a version number, so the scraper's
          // fallback regex would often grab an unrelated number on the page
          // and falsely trigger the "update available" prompt on every
          // launch. The API's latest_version is the source of truth.)
          const latestVersion = serverLatest;

          // If server provides a minimum_version, treat it as a forced update threshold
          if (serverMinimum && compareVersions(currentVersion, serverMinimum) < 0) {
            setForcedUpdate(true);
            setCheckingVersion(false);
            // show a blocking alert for forced update
            Alert.alert('Update Required', 'A new version is required to continue.', [
              { text: 'Update', onPress: () => onUpdatePress(storeUrl) },
            ], { cancelable: false });
            return;
          }

          if (latestVersion && compareVersions(currentVersion, latestVersion) < 0) {
            setOptionalUpdate(true);
            setCheckingVersion(false);
            // show optional alert with choice to update or continue
            Alert.alert('Update Available', 'A newer version of the app is available. Update now?', [
              { text: 'Update', onPress: () => onUpdatePress(storeUrl) },
              { text: 'Continue', onPress: onContinuePress, style: 'cancel' },
            ], { cancelable: true });
            return;
          }
        }
      } catch (error) {
        console.warn('Version check failed:', error);
      }

      // No update required; navigate to Login after a short delay
      timer = setTimeout(() => {
        navigation.replace('Login');
      }, 800);
      setCheckingVersion(false);
    };

    checkVersion();

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [navigation]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FDFCF8" />
      <LinearGradient
        colors={['#FDFCF8', '#FFF8E7', '#FDFCF8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.logoContainer}>
        <Image source={logoImage} style={styles.logo} />
      </View>

      <View style={styles.textContainer}>
        <Text style={styles.title}>
          <Text style={styles.titleMy}>MY</Text>
          <Text style={styles.titleSpace}> </Text>
          <Text style={styles.titleImc}>IMC</Text>
        </Text>
        <View style={styles.divider} />
        <Text style={styles.subtitle}>Workforce Management Platform</Text>

        {checkingVersion ? (
          <>
            <ActivityIndicator size="large" color="#F5C451" style={styles.loader} />
            <Text style={styles.loadingText}>Checking app version...</Text>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color="#F5C451" style={styles.loader} />
            <Text style={styles.loadingText}>Loading...</Text>
          </>
        )}
      </View>

      <View style={styles.footerContainer}>
        <Text style={styles.footer}>Powered by IMC</Text>
        <Text style={styles.versionText}>Version {Constants.expoConfig?.version}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FDFCF8',
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  logo: {
    width: 160,
    height: 160,
    resizeMode: 'contain',
  },
  textContainer: {
    alignItems: 'center',
    marginTop: 20,
    paddingHorizontal: 40,
  },
  title: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  titleMy: {
    fontSize: 56,
    fontWeight: '900',
    color: '#1C1B17',
    letterSpacing: 2,
  },
  titleSpace: {
    width: 12,
  },
  titleImc: {
    fontSize: 56,
    fontWeight: '900',
    color: '#F5C451',
    letterSpacing: 6,
  },
  divider: {
    width: 60,
    height: 3,
    backgroundColor: '#F5C451',
    borderRadius: 2,
    marginBottom: 16,
    shadowColor: '#F5C451',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8B8B8B',
    marginBottom: 48,
    letterSpacing: 2.5,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  loaderContainer: {
    marginBottom: 20,
  },
  loader: {
    marginVertical: 20,
  },
  circle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#F5C451',
    marginHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#F5C451',
  },
  outline: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#F5C451',
  },
  loadingText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#B0B0B0',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  updateTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1B17',
    marginBottom: 12,
    textAlign: 'center',
  },
  updateText: {
    fontSize: 13,
    color: '#5A5A5A',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  updateButton: {
    marginTop: 20,
    paddingVertical: 14,
    paddingHorizontal: 32,
    backgroundColor: '#F5C451',
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButton: {
    marginLeft: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#F5C451',
  },
  updateButtonText: {
    color: '#1C1B17',
    fontSize: 15,
    fontWeight: '800',
  },
  continueButtonText: {
    color: '#F5C451',
  },
  footerContainer: {
    position: 'absolute',
    bottom: 50,
    alignItems: 'center',
  },
  footer: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7E7767',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  versionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#B0B0B0',
    letterSpacing: 0.8,
  },
});