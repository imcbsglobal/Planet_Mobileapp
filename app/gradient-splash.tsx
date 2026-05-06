import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import React, { useEffect } from 'react';
import { Image, StyleSheet, Text, View, ActivityIndicator, StatusBar } from 'react-native';

const logoImage = require('../assets/images/logo_blk.png');

export default function GradientSplash() {
  const navigation = useNavigation();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.replace('Login');
    }, 2000);
    
    return () => clearTimeout(timer);
  }, []);

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
        
        <ActivityIndicator size="large" color="#F5C451" style={styles.loader} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>

      <View style={styles.footerContainer}>
        <Text style={styles.footer}>Powered by IMC</Text>
        <Text style={styles.versionText}>Version 4.1.3</Text>
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

