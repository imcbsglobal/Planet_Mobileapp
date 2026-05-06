/* eslint-disable prettier/prettier */
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface UserCredentials {
  userId: string;
  password: string;
}

interface TodayStatus {
  date: string;
  punchIn: {
    time: string;
    location: string;
  } | null;
  punchOut: {
    time: string;
    location: string;
  } | null;
  totalHours: string;
  status: string;
  verified: boolean;
}

export default function PunchNew() {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userCredentials, setUserCredentials] = useState<UserCredentials | null>(null);
  const [todayStatus, setTodayStatus] = useState<TodayStatus | null>(null);
  const [currentLocation, setCurrentLocation] = useState<any>(null);
  const [locationAddress, setLocationAddress] = useState<any>(null);
  const [username, setUsername] = useState<string>('User');
  const [weekHours, setWeekHours] = useState('32.5');
  const [weekProgress, setWeekProgress] = useState(81);
  const [pendingRequests, setPendingRequests] = useState(3);

  const getTodayDateString = () => new Date().toISOString().split('T')[0];

  const getUserSpecificKey = (baseKey: string) =>
    userCredentials?.userId ? `${baseKey}_${userCredentials.userId}` : baseKey;

  const getCurrentLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({});
    setCurrentLocation(loc);
    const [addr] = await Location.reverseGeocodeAsync(loc.coords);
    setLocationAddress({
      city: addr?.city || '',
      fullAddress: `${addr?.street || ''}, ${addr?.city || ''}`,
      state: addr?.region || '',
    });
  };

  const getUserCredentials = async () => {
    try {
      const [uid, pwd, name] = await Promise.all([
        SecureStore.getItemAsync('userId'),
        SecureStore.getItemAsync('password'),
        SecureStore.getItemAsync('username'),
      ]);

      if (uid && pwd) {
        setUserCredentials({ userId: uid, password: pwd });
        if (name) setUsername(name);
      } else {
        router.replace('/login');
      }
    } catch (error) {
      router.replace('/login');
    }
  };

  const loadTodayStatus = async () => {
    if (!userCredentials?.userId) return;

    const key = getUserSpecificKey(`punch_data_${getTodayDateString()}`);
    const raw = await AsyncStorage.getItem(key);
    const localData = raw ? JSON.parse(raw) : {};

    setTodayStatus(localData);
  };

  const handlePunch = async (type: 'in' | 'out') => {
    if (!userCredentials || !currentLocation) {
      Alert.alert('Error', 'Location not available');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    const confirmationTitle = type === 'in' ? 'Punch In Confirmation' : 'Punch Out Confirmation';
    const confirmationMessage =
      type === 'in'
        ? 'Are you sure you want to punch in for today?'
        : 'Are you sure you want to punch out for today?';

    Alert.alert(confirmationTitle, confirmationMessage, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        style: 'default',
        onPress: () => performPunch(type),
      },
    ]);
  };

  const performPunch = async (type: 'in' | 'out') => {
    if (!userCredentials || !currentLocation) return;

    setIsLoading(true);

    try {
      const payload = {
        userid: userCredentials.userId,
        password: userCredentials.password,
        location: locationAddress?.city || '',
        latitude: currentLocation.coords.latitude.toString(),
        longitude: currentLocation.coords.longitude.toString(),
        enhanced_location: JSON.stringify(locationAddress),
      };

      const endpoint =
        type === 'in'
          ? 'https://myimc.in/flutter/punch-in/'
          : 'https://myimc.in/flutter/punch-out/';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const key = getUserSpecificKey(`punch_data_${getTodayDateString()}`);
        let record = JSON.parse((await AsyncStorage.getItem(key)) || '{}');
        const now = new Date().toISOString();
        if (type === 'in') record.punchIn = { time: now, location: locationAddress?.city };
        else record.punchOut = { time: now, location: locationAddress?.city };
        await AsyncStorage.setItem(key, JSON.stringify(record));
        setTodayStatus(record);

        Alert.alert('Success', `Punch ${type === 'in' ? 'In' : 'Out'} successful!`);
      } else {
        Alert.alert('Error', 'Failed to punch');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTodayStatus();
    setRefreshing(false);
  }, [userCredentials]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const formatTime = (timeString?: string) => {
    if (!timeString) return 'Not recorded';
    try {
      const date = new Date(timeString);
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return timeString;
    }
  };

  const isPunchedIn = () => {
    return todayStatus?.punchIn && !todayStatus?.punchOut;
  };

  useEffect(() => {
    getCurrentLocation();
    getUserCredentials();
  }, []);

  useEffect(() => {
    if (userCredentials?.userId) {
      loadTodayStatus();
    }
  }, [userCredentials]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1C1B17" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.greetingLabel}>{getGreeting().toUpperCase()},</Text>
          <Text style={styles.userName}>{username}!</Text>
        </View>
        <TouchableOpacity style={styles.notificationButton}>
          <Ionicons name="notifications-outline" size={24} color="#D4A574" />
        </TouchableOpacity>
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F5C451" />
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Punch Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroCardContent}>
            <View>
              <Text style={styles.heroLabel}>CURRENT STATUS</Text>
              <Text style={styles.heroTitle}>
                You're {isPunchedIn() ? 'punched in' : 'not\npunched in'}
              </Text>
              <Text style={styles.heroSubtitle}>
                {isPunchedIn()
                  ? 'Working hard! Remember to punch out when done.'
                  : 'Ready to start your shift? Punch in to track your productivity today.'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.heroPunchButton}
              onPress={() => handlePunch(isPunchedIn() ? 'out' : 'in')}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#453714" />
              ) : (
                <>
                  <Ionicons name="finger-print" size={24} color="#453714" />
                  <Text style={styles.heroPunchText}>
                    Quick Punch {isPunchedIn() ? 'Out' : 'In'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.heroDecoration} />
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          {/* Week Progress */}
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>WEEK PROGRESS</Text>
            <View style={styles.statValueRow}>
              <Text style={styles.statValue}>{weekHours}</Text>
              <Text style={styles.statUnit}>hrs</Text>
            </View>
            <View style={styles.progressSection}>
              <View style={styles.progressLabels}>
                <Text style={styles.progressLabel}>TARGET: 40H</Text>
                <Text style={styles.progressLabel}>{weekProgress}%</Text>
              </View>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${weekProgress}%` }]} />
              </View>
            </View>
          </View>

          {/* Pending Requests */}
          <View style={styles.statCardSmall}>
            <View style={styles.statIconContainer}>
              <Ionicons name="time-outline" size={28} color="#D4A574" />
            </View>
            <View>
              <Text style={styles.statValueSmall}>{pendingRequests.toString().padStart(2, '0')}</Text>
              <Text style={styles.statLabelSmall}>PENDING REQUESTS</Text>
            </View>
          </View>
        </View>

        {/* Attendance Log Card */}
        <View style={styles.attendanceCard}>
          <View style={styles.attendanceHeader}>
            <Text style={styles.attendanceTitle}>Attendance Log</Text>
            <View style={styles.monthSelector}>
              <TouchableOpacity style={styles.monthButton}>
                <Ionicons name="chevron-back" size={14} color="#7E7767" />
              </TouchableOpacity>
              <Text style={styles.monthText}>OCTOBER 2023</Text>
              <TouchableOpacity style={styles.monthButton}>
                <Ionicons name="chevron-forward" size={14} color="#7E7767" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Calendar Grid */}
          <View style={styles.calendarGrid}>
            {/* Weekday Headers */}
            {['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].map((day) => (
              <Text key={day} style={styles.weekdayLabel}>
                {day}
              </Text>
            ))}

            {/* Calendar Days */}
            {[28, 29, 30, 31, 1, 2, 3].map((day, index) => (
              <View key={index} style={styles.calendarDay}>
                <View
                  style={[
                    styles.dayCircle,
                    day === 1 && styles.dayCircleActive,
                    day < 28 && styles.dayCircleFaded,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayNumber,
                      day === 1 && styles.dayNumberActive,
                      day < 28 && styles.dayNumberFaded,
                    ]}
                  >
                    {day}
                  </Text>
                </View>
                {(day === 30 || day === 31 || day === 1) && (
                  <View
                    style={[
                      styles.dayDot,
                      day === 1 ? styles.dayDotActive : styles.dayDotInactive,
                    ]}
                  />
                )}
              </View>
            ))}
          </View>
        </View>

        {/* Today's Details */}
        <View style={styles.todayCard}>
          <Text style={styles.todayTitle}>Today's Details</Text>
          <View style={styles.todayRow}>
            <View style={styles.todayItem}>
              <Ionicons name="log-in-outline" size={20} color="#4CAF50" />
              <Text style={styles.todayLabel}>Punch In</Text>
              <Text style={styles.todayValue}>
                {todayStatus?.punchIn ? formatTime(todayStatus.punchIn.time) : '--:--'}
              </Text>
            </View>
            <View style={styles.todayDivider} />
            <View style={styles.todayItem}>
              <Ionicons name="log-out-outline" size={20} color="#F44336" />
              <Text style={styles.todayLabel}>Punch Out</Text>
              <Text style={styles.todayValue}>
                {todayStatus?.punchOut ? formatTime(todayStatus.punchOut.time) : '--:--'}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/home-new')}>
          <Ionicons name="home-outline" size={24} color="#7E7767" />
          <Text style={styles.navLabel}>HOME</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItemActive}>
          <Ionicons name="finger-print" size={24} color="#D4A574" />
          <Text style={styles.navLabelActive}>PUNCH</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="calendar-outline" size={24} color="#7E7767" />
          <Text style={styles.navLabel}>CALENDAR</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/request')}>
          <Ionicons name="time-outline" size={24} color="#7E7767" />
          <Text style={styles.navLabel}>REQUESTS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="ellipsis-horizontal" size={24} color="#7E7767" />
          <Text style={styles.navLabel}>MORE</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: 'rgba(250, 249, 246, 0.8)',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F2F0E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  greetingLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7E7767',
    letterSpacing: 1.4,
    marginBottom: 2,
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1B17',
    letterSpacing: -0.5,
  },
  notificationButton: {
    padding: 8,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 100,
  },
  heroCard: {
    backgroundColor: '#1C1B17',
    borderRadius: 40,
    padding: 40,
    marginTop: 16,
    marginBottom: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.08,
    shadowRadius: 40,
    elevation: 8,
  },
  heroCardContent: {
    position: 'relative',
    zIndex: 10,
  },
  heroLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#F5C451',
    letterSpacing: 3.2,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 36,
    marginBottom: 12,
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#D1CEC4',
    lineHeight: 20,
    marginBottom: 24,
    maxWidth: 240,
  },
  heroPunchButton: {
    backgroundColor: '#F5C451',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 40,
    borderRadius: 50,
    gap: 12,
    shadowColor: '#F5C451',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 8,
  },
  heroPunchText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#453714',
  },
  heroDecoration: {
    position: 'absolute',
    top: -48,
    right: -48,
    width: 256,
    height: 256,
    borderRadius: 128,
    backgroundColor: 'rgba(245, 196, 81, 0.05)',
  },
  statsGrid: {
    gap: 16,
    marginBottom: 32,
  },
  statCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    padding: 32,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.08,
    shadowRadius: 40,
    elevation: 6,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7E7767',
    letterSpacing: 1.6,
    marginBottom: 16,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 24,
  },
  statValue: {
    fontSize: 48,
    fontWeight: '800',
    color: '#1C1B17',
  },
  statUnit: {
    fontSize: 14,
    fontWeight: '700',
    color: '#7E7767',
    marginLeft: 8,
  },
  progressSection: {
    gap: 8,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7E7767',
    letterSpacing: 0.8,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#F2F0E9',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#F5C451',
    borderRadius: 4,
  },
  statCardSmall: {
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    padding: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.08,
    shadowRadius: 40,
    elevation: 6,
  },
  statIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#FAF9F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statValueSmall: {
    fontSize: 30,
    fontWeight: '800',
    color: '#1C1B17',
    marginBottom: 4,
  },
  statLabelSmall: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7E7767',
    letterSpacing: 1.2,
  },
  attendanceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    padding: 32,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.08,
    shadowRadius: 40,
    elevation: 6,
  },
  attendanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  attendanceTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1B17',
  },
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  monthButton: {
    padding: 8,
    borderRadius: 20,
  },
  monthText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1C1B17',
    letterSpacing: 3.2,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 24,
  },
  weekdayLabel: {
    width: '12%',
    fontSize: 9,
    fontWeight: '700',
    color: '#7E7767',
    textAlign: 'center',
    letterSpacing: 1.4,
  },
  calendarDay: {
    width: '12%',
    alignItems: 'center',
    paddingVertical: 8,
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCircleActive: {
    backgroundColor: '#1C1B17',
  },
  dayCircleFaded: {
    opacity: 0.3,
  },
  dayNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1C1B17',
  },
  dayNumberActive: {
    color: '#FFFFFF',
  },
  dayNumberFaded: {
    color: '#7E7767',
  },
  dayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
  },
  dayDotActive: {
    backgroundColor: '#F5C451',
  },
  dayDotInactive: {
    backgroundColor: 'rgba(245, 196, 81, 0.5)',
  },
  todayCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    padding: 32,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.08,
    shadowRadius: 40,
    elevation: 6,
  },
  todayTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1B17',
    marginBottom: 24,
  },
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  todayItem: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  todayDivider: {
    width: 1,
    height: 60,
    backgroundColor: '#F2F0E9',
    marginHorizontal: 16,
  },
  todayLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7E7767',
  },
  todayValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1B17',
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
    backgroundColor: 'rgba(250, 249, 246, 0.9)',
    borderTopLeftRadius: 48,
    borderTopRightRadius: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.06,
    shadowRadius: 40,
    elevation: 8,
  },
  navItem: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  navItemActive: {
    alignItems: 'center',
    backgroundColor: '#FEF8E7',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 50,
  },
  navLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#7E7767',
    marginTop: 4,
    letterSpacing: 1.2,
  },
  navLabelActive: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D4A574',
    marginTop: 4,
    letterSpacing: 1.2,
  },
});
