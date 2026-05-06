/* eslint-disable prettier/prettier */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    Animated,
    Pressable,
} from 'react-native';

interface AttendanceOption {
  id: string;
  title: string;
  description: string;
  icon: string;
  route: string;
  color: string;
}

export default function Attendance() {
  const navigation = useNavigation();
  const [loadingTab, setLoadingTab] = useState<string | null>(null);

  const attendanceOptions: AttendanceOption[] = [
    {
      id: '1',
      title: 'PUNCH',
      description: 'Punch in/out attendance',
      icon: 'finger-print',
      route: 'punch',
      color: '#4CAF50'
    },
    {
      id: '2',
      title: 'REQUEST',
      description: 'Submit requests',
      icon: 'document-text',
      route: 'request',
      color: '#2196F3'
    }
  ];

  const handleOptionPress = async (route: string) => {
    if (loadingTab) return;
    setLoadingTab(route);
    await new Promise((res) => setTimeout(res, 300));
    
    // Map routes to navigation screen names
    const routeMap: { [key: string]: string } = {
      'punch': 'Punch',
      'request': 'Request',
    };
    
    navigation.navigate(routeMap[route] || route);
    setLoadingTab(null);
  };

  const handleBackPress = () => {
    navigation.goBack();
  };

  const renderAttendanceOption = (option: AttendanceOption) => {
    const scaleAnim = new Animated.Value(1);
    
    const handlePressIn = () => {
      Animated.timing(scaleAnim, {
        toValue: 0.97,
        duration: 150,
        useNativeDriver: true,
      }).start();
    };
    
    const handlePressOut = () => {
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    };

    return (
      <Pressable
        key={option.id}
        style={styles.optionCardWrapper}
        onPress={() => handleOptionPress(option.route)}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <Animated.View style={{ flex: 1, transform: [{ scale: scaleAnim }] }}>
          <LinearGradient
            colors={['#FFFFFF', '#F6F1E8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.optionCard}
          >
            <View style={[styles.optionIconContainer, { backgroundColor: `${option.color}20` }]}>
              <Ionicons name={option.icon as any} size={48} color={option.color} />
            </View>
            <Text style={styles.optionTitle}>{option.title}</Text>
            <Text style={styles.optionDescription}>{option.description}</Text>
          </LinearGradient>
        </Animated.View>
      </Pressable>
    );
  };

  return (
    <LinearGradient
      colors={['#F3F2EE', '#F2D98C']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      {loadingTab && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#F4C84A" />
        </View>
      )}

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBackPress}
        >
          <Ionicons name="arrow-back" size={24} color="#2C2C2C" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Attendance</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleSection}>
          <Text style={styles.pageTitle}>Choose an option</Text>
          <Text style={styles.pageSubtitle}>
            Select what you'd like to do with your attendance
          </Text>
        </View>

        <View style={styles.optionsContainer}>
          {attendanceOptions.map(renderAttendanceOption)}
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    paddingTop: 60,
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1C',
  },
  placeholder: {
    width: 40,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 32,
    paddingVertical: 20,
  },
  pageTitle: {
    fontSize: 28,
    color: '#1C1C1C',
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  pageSubtitle: {
    fontSize: 16,
    color: '#6E6E6E',
    textAlign: 'center',
    lineHeight: 22,
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  optionCardWrapper: {
    width: '47%',
    aspectRatio: 0.9,
  },
  optionCard: {
    flex: 1,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 6,
  },
  optionIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1C',
    marginBottom: 4,
    textAlign: 'center',
  },
  optionDescription: {
    fontSize: 11,
    color: '#6E6E6E',
    textAlign: 'center',
    lineHeight: 14,
  },
});