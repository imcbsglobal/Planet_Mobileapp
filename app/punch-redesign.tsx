import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import EyeLoader from '../components/EyeLoader';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import MoreMenu from '../components/MoreMenu';

interface UserCredentials {
  userId: string;
  password: string;
}

export default function PunchNew() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userCredentials, setUserCredentials] = useState<UserCredentials | null>(null);
  const [username, setUsername] = useState<string>('User');
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<any>(null);
  const [locationAddress, setLocationAddress] = useState<string>('Fetching location...');
  const [isPunchedIn, setIsPunchedIn] = useState(false);
  const [punchInTime, setPunchInTime] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState('00:00:00');
  const [shiftProgress, setShiftProgress] = useState(0);
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [isBreakLoading, setIsBreakLoading] = useState(false);
  const [breakStatus, setBreakStatus] = useState<any>(null);
  const [currentBreakId, setCurrentBreakId] = useState<string | null>(null);
  const [showBreakHistory, setShowBreakHistory] = useState(false);
  const [breakHistory, setBreakHistory] = useState<any[]>([]);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(1)).current;
  const historyHeightAnim = useRef(new Animated.Value(0)).current;

  const getTodayDateString = () => new Date().toISOString().split('T')[0];

  const getUserSpecificKey = (baseKey: string) =>
    userCredentials?.userId ? `${baseKey}_${userCredentials.userId}` : baseKey;

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        setLocationAddress('Location permission denied');
        return null;
      }
      
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Lowest,
        maximumAge: 60000,
        timeout: 5000,
      });
      
      setCurrentLocation(loc);
      
      const [addr] = await Location.reverseGeocodeAsync(loc.coords);
      const address = `${addr?.street || ''}, ${addr?.city || 'Unknown Location'}`;
      setLocationAddress(address);
      
      return loc;
    } catch (error) {
      setLocationAddress('Unable to fetch location');
      return null;
    }
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
        navigation.replace('Login');
      }
    } catch (error) {
      navigation.replace('Login');
    }
  };

  const loadTodayStatus = async () => {
    if (!userCredentials?.userId || !userCredentials?.password) return;

    try {
      const currentDate = new Date();
      const month = currentDate.getMonth() + 1;
      const year = currentDate.getFullYear();
      const todayDateString = getTodayDateString();

      const response = await fetch(
        `https://myimc.in/flutter/attendance/monthly/?userid=${userCredentials.userId}&password=${userCredentials.password}&month=${month}&year=${year}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const todayRecord = data.attendance_records.find(
            (record: any) => record.date === todayDateString
          );

          if (todayRecord && todayRecord.punch_in && !todayRecord.punch_out) {
            setIsPunchedIn(true);
            setPunchInTime(todayRecord.punch_in);
          } else {
            setIsPunchedIn(false);
            setPunchInTime(null);
          }
        }
      }
    } catch (error) {
      // Error loading attendance
    }
  };

  const loadBreakStatus = async () => {
    if (!userCredentials?.userId || !userCredentials?.password) return;

    try {
      const response = await fetch('https://myimc.in/flutter/break-status/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userid: userCredentials.userId,
          password: userCredentials.password,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setBreakStatus(data);
        
        const hasActiveBreak = data.has_active_break && 
                              (data.break_punch_in || data.current_break_in) && 
                              !data.break_punch_out;
        
        setIsOnBreak(hasActiveBreak);
        
        if (data.break_id && hasActiveBreak) {
          setCurrentBreakId(data.break_id.toString());
        } else {
          setCurrentBreakId(null);
        }

        if (data.breaks_today && data.breaks_today.length > 0) {
          setBreakHistory(data.breaks_today);
        }
      }
    } catch (error) {
      // Error loading break status
    }
  };

  const handleBreakPunch = async () => {
    if (!userCredentials || !isPunchedIn) {
      Alert.alert('Error', 'Please punch in first before taking a break');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const type = isOnBreak ? 'out' : 'in';
    const confirmationTitle = type === 'in' ? 'Start Break' : 'End Break';
    const confirmationMessage = `Are you sure you want to ${type === 'in' ? 'start' : 'end'} your break?`;

    Alert.alert(confirmationTitle, confirmationMessage, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        style: 'default',
        onPress: () => performBreakPunch(type),
      },
    ]);
  };

  const toggleBreakHistory = () => {
    const toValue = showBreakHistory ? 0 : 1;
    setShowBreakHistory(!showBreakHistory);
    
    Animated.spring(historyHeightAnim, {
      toValue,
      useNativeDriver: false,
      tension: 50,
      friction: 8,
    }).start();
  };

  const performBreakPunch = async (type: 'in' | 'out') => {
    if (!userCredentials) return;

    setIsBreakLoading(true);

    try {
      const payload = {
        userid: userCredentials.userId,
        password: userCredentials.password,
      };

      const endpoint =
        type === 'in'
          ? 'https://myimc.in/flutter/break-punch-in/'
          : 'https://myimc.in/flutter/break-punch-out/';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        
        if (type === 'in') {
          setIsOnBreak(true);
          if (data.break_id) {
            setCurrentBreakId(data.break_id.toString());
          }
          Alert.alert('Success', 'Break started successfully!');
        } else {
          setIsOnBreak(false);
          setCurrentBreakId(null);
          const message = data.duration 
            ? `Break ended. Duration: ${data.duration}`
            : 'Break ended successfully!';
          Alert.alert('Success', message);
        }
        
        await loadBreakStatus();
      } else {
        Alert.alert('Error', 'Failed to record break');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setIsBreakLoading(false);
    }
  };

  const calculateElapsedTime = useCallback(() => {
    if (!punchInTime) {
      setElapsedTime('00:00:00');
      setShiftProgress(0);
      return;
    }

    const start = new Date(punchInTime).getTime();
    const now = Date.now();
    const diff = now - start;

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    setElapsedTime(
      `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds
        .toString()
        .padStart(2, '0')}`
    );

    const totalMinutes = hours * 60 + minutes;
    const progress = Math.min((totalMinutes / 480) * 100, 100); // 8 hours = 480 minutes
    setShiftProgress(Math.round(progress));
  }, [punchInTime]);

  const handlePunch = async () => {
    if (!userCredentials) {
      Alert.alert('Error', 'User credentials not found');
      return;
    }

    // Only show modal if location is not available
    if (!currentLocation) {
      setIsLoading(true);
      
      // Small delay before showing modal to avoid flash
      const showModalTimer = setTimeout(() => {
        setShowLocationModal(true);
      }, 300);
      
      // Single fast attempt
      const fetchedLocation = await getCurrentLocation();
      
      // Clear timer and close modal immediately
      clearTimeout(showModalTimer);
      setShowLocationModal(false);
      setIsLoading(false);
      
      // If location still not available, just return without alert
      if (!fetchedLocation) {
        return;
      }
    }

    // Location is available, proceed with punch confirmation
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    const type = isPunchedIn ? 'out' : 'in';
    const confirmationTitle = type === 'in' ? 'Punch In' : 'Punch Out';
    const confirmationMessage = `Are you sure you want to punch ${type}?`;

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
        location: locationAddress,
        latitude: currentLocation.coords.latitude.toString(),
        longitude: currentLocation.coords.longitude.toString(),
        enhanced_location: JSON.stringify({ address: locationAddress }),
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
        const now = new Date().toISOString();
        if (type === 'in') {
          setPunchInTime(now);
          setIsPunchedIn(true);
        } else {
          setPunchInTime(null);
          setIsPunchedIn(false);
        }

        Alert.alert('Success', `Punch ${type === 'in' ? 'In' : 'Out'} successful!`);
        await loadTodayStatus();
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
    await Promise.all([loadTodayStatus(), loadBreakStatus(), getCurrentLocation()]);
    setRefreshing(false);
  }, [userCredentials]);

  const formatTime = (timeString?: string) => {
    if (!timeString) return 'Not recorded';
    
    try {
      let date;
      
      if (/^\d{2}:\d{2}:\d{2}$/.test(timeString)) {
        const today = new Date().toISOString().split('T')[0];
        date = new Date(`${today}T${timeString}`);
      } else if (timeString.includes('T') || timeString.includes('Z')) {
        date = new Date(timeString);
      } else {
        date = new Date(timeString);
      }
      
      if (isNaN(date.getTime())) {
        return timeString;
      }
      
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch (error) {
      return timeString;
    }
  };

  useEffect(() => {
    getCurrentLocation();
    getUserCredentials();
  }, []);

  useEffect(() => {
    if (userCredentials?.userId) {
      loadTodayStatus();
      loadBreakStatus();
    }
  }, [userCredentials]);

  useEffect(() => {
    const interval = setInterval(calculateElapsedTime, 1000);
    return () => clearInterval(interval);
  }, [calculateElapsedTime]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1.5, duration: 3000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 1, duration: 3000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.profileImage}>
            <Ionicons name="person" size={20} color="#7E7767" />
          </View>
          <Text style={styles.headerTitle}>Punch</Text>
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
        {/* Timer Display */}
        <View style={styles.timerSection}>
          <Text style={styles.timerLabel}>CURRENT SESSION</Text>
          <Text style={styles.timerDisplay}>{elapsedTime}</Text>
          {isPunchedIn && (
            <View style={styles.statusBadge}>
              <View style={styles.pulseDot} />
              <Text style={styles.statusText}>Punched In since {formatTime(punchInTime)}</Text>
            </View>
          )}
        </View>

        {/* Main Punch Button */}
        <View style={styles.punchButtonContainer}>
          <Animated.View style={[styles.glowEffect, { transform: [{ scale: glowAnim }] }]} />
          <TouchableOpacity
            style={styles.punchButton}
            onPress={handlePunch}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            <View style={styles.punchButtonInner}>
              {isLoading ? (
                <ActivityIndicator size="large" color="#451a03" />
              ) : (
                <>
                  <View style={styles.iconContainer}>
                    <Ionicons name="finger-print" size={60} color="#451a03" />
                  </View>
                  <Text style={styles.punchButtonText}>
                    Punch {isPunchedIn ? 'Out' : 'In'}
                  </Text>
                  <Text style={styles.punchButtonHint}>HOLD TO CONFIRM</Text>
                </>
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* Break Management Card with History */}
        <View style={styles.breakCard}>
          <View style={styles.actionCardRow}>
            <View style={styles.actionCardLeft}>
              <View style={[styles.actionIcon, isOnBreak && styles.actionIconActive]}>
                <Ionicons name="cafe-outline" size={24} color={isOnBreak ? '#F59E0B' : '#D4A574'} />
              </View>
              <View>
                <Text style={styles.actionLabel}>BREAK STATUS</Text>
                <Text style={styles.actionValue}>{isOnBreak ? 'On Break' : 'On Duty'}</Text>
              </View>
            </View>
            <TouchableOpacity 
              style={[styles.actionButton, !isPunchedIn && styles.actionButtonDisabled]}
              onPress={handleBreakPunch}
              disabled={!isPunchedIn || isBreakLoading}
            >
              {isBreakLoading ? (
                <ActivityIndicator size="small" color="#2D2A26" />
              ) : (
                <Text style={styles.actionButtonText}>
                  {isOnBreak ? 'End Break' : 'Take Break'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {breakHistory.length > 0 && (
            <View>
              <TouchableOpacity 
                style={styles.historyToggle}
                onPress={toggleBreakHistory}
              >
                <Text style={styles.historyToggleText}>
                  {showBreakHistory ? 'Hide Break History' : 'Show Break History'}
                </Text>
                <Animated.View
                  style={{
                    transform: [{
                      rotate: historyHeightAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', '180deg'],
                      }),
                    }],
                  }}
                >
                  <Ionicons name="chevron-down" size={20} color="#78716C" />
                </Animated.View>
              </TouchableOpacity>
              
              <Animated.View
                style={[
                  styles.historyContainer,
                  {
                    maxHeight: historyHeightAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 1000],
                    }),
                    opacity: historyHeightAnim,
                  },
                ]}
              >
                <View style={styles.historyList}>
                  <Text style={styles.historyTitle}>Today's Breaks</Text>
                  {breakHistory.map((breakItem: any, index: number) => (
                    <View key={breakItem.break_id || index} style={styles.historyItem}>
                      <View style={styles.historyTimesGrid}>
                        <View style={styles.timeBlock}>
                          <View style={styles.timeIconWrapper}>
                            <Ionicons name="log-in-outline" size={16} color="#10B981" />
                          </View>
                          <View>
                            <Text style={styles.timeBlockLabel}>Started</Text>
                            <Text style={styles.timeBlockValue}>{formatTime(breakItem.punch_in)}</Text>
                          </View>
                        </View>
                        
                        <View style={styles.timeDivider} />
                        
                        <View style={styles.timeBlock}>
                          <View style={styles.timeIconWrapper}>
                            <Ionicons name="log-out-outline" size={16} color="#EF4444" />
                          </View>
                          <View>
                            <Text style={styles.timeBlockLabel}>Ended</Text>
                            <Text style={styles.timeBlockValue}>
                              {breakItem.punch_out ? formatTime(breakItem.punch_out) : '--:--'}
                            </Text>
                          </View>
                        </View>
                      </View>
                      
                      {breakItem.duration && (
                        <View style={styles.durationBanner}>
                          <Ionicons name="timer-outline" size={16} color="#F59E0B" />
                          <Text style={styles.durationText}>{breakItem.duration}</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              </Animated.View>
            </View>
          )}
        </View>

        {/* Location Card */}
        <View style={styles.locationCard}>
          <View style={styles.locationHeader}>
            <View style={styles.locationLeft}>
              <Ionicons name="location" size={24} color="#D4A574" />
              <View>
                <Text style={styles.locationTitle}>Current Location</Text>
                <Text style={styles.locationAddress}>{locationAddress}</Text>
              </View>
            </View>
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedText}>VERIFIED</Text>
            </View>
          </View>
          {currentLocation ? (
            <View style={styles.mapPreview}>
              <View style={styles.coordinatesDisplay}>
                <Ionicons name="navigate" size={32} color="#D4A574" />
                <View style={styles.coordsText}>
                  <Text style={styles.coordLabel}>Latitude</Text>
                  <Text style={styles.coordValue}>{currentLocation.coords.latitude.toFixed(6)}</Text>
                </View>
                <View style={styles.coordsText}>
                  <Text style={styles.coordLabel}>Longitude</Text>
                  <Text style={styles.coordValue}>{currentLocation.coords.longitude.toFixed(6)}</Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.mapPreview}>
              <ActivityIndicator size="large" color="#D4A574" />
              <Text style={styles.loadingText}>Loading location...</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Floating Progress Bar */}
      <View style={styles.floatingBar}>
        <View style={styles.floatingBarContent}>
          <View style={styles.floatingBarLeft}>
            <View style={styles.floatingIcon}>
              <Ionicons name="timer-outline" size={20} color="#FFFFFF" />
            </View>
            <View>
              <Text style={styles.floatingLabel}>SHIFT TARGET</Text>
              <Text style={styles.floatingValue}>08:00 Hours</Text>
            </View>
          </View>
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${shiftProgress}%` }]} />
            </View>
            <Text style={styles.progressText}>{shiftProgress}% Complete</Text>
          </View>
        </View>
      </View>

      {/* Bottom Navigation */}
      <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('HomeNew')}>
          <Ionicons name="home-outline" size={24} color="#7E7767" />
          <Text style={styles.navLabel}>HOME</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItemActive}>
          <Ionicons name="finger-print" size={24} color="#D4A574" />
          <Text style={styles.navLabelActive}>PUNCH</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('Request')}>
          <Ionicons name="time-outline" size={24} color="#7E7767" />
          <Text style={styles.navLabel}>REQUESTS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setShowMoreMenu(true)}>
          <Ionicons name="ellipsis-vertical" size={24} color="#7E7767" />
          <Text style={styles.navLabel}>MORE</Text>
        </TouchableOpacity>
      </View>

      <MoreMenu visible={showMoreMenu} onClose={() => setShowMoreMenu(false)} />

      {/* Location Fetching Modal */}
      <Modal
        visible={showLocationModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowLocationModal(false);
          setIsLoading(false);
        }}
      >
        <TouchableOpacity 
          style={styles.locationModalOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowLocationModal(false);
            setIsLoading(false);
          }}
        >
          <TouchableOpacity 
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.locationModalCard}>
              <View style={styles.locationModalIconContainer}>
                <View style={styles.locationModalIconBg}>
                  <Ionicons name="location" size={40} color="#D4A574" />
                </View>
              </View>
              
              <Text style={styles.locationModalTitle}>Fetching Location</Text>
              <Text style={styles.locationModalSubtitle}>Please wait a moment</Text>
              
              <View style={styles.locationModalSpinnerContainer}>
                <EyeLoader />
              </View>
              
              <View style={styles.locationModalStatusCard}>
                <View style={styles.locationModalStatusDot} />
                <Text style={styles.locationModalStatusText}>
                  {locationAddress}
                </Text>
              </View>
              
              <Text style={styles.locationModalHint}>
                Getting your current location for attendance tracking
              </Text>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF7F2',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: 'rgba(250, 247, 242, 0.8)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3EDE2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(245, 196, 81, 0.2)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2D2A26',
    letterSpacing: -0.5,
  },
  notificationButton: {
    padding: 8,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 200,
    alignItems: 'center',
  },
  timerSection: {
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 24,
  },
  timerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#78716C',
    letterSpacing: 3.2,
    marginBottom: 8,
  },
  timerDisplay: {
    fontSize: 64,
    fontWeight: '800',
    color: '#78350F',
    letterSpacing: -2,
    lineHeight: 72,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 50,
    marginTop: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 196, 81, 0.3)',
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F59E0B',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#78350F',
  },
  punchButtonContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 48,
    position: 'relative',
  },
  glowEffect: {
    position: 'absolute',
    width: 288,
    height: 288,
    borderRadius: 144,
    backgroundColor: 'rgba(245, 196, 81, 0.3)',
  },
  punchButton: {
    width: 288,
    height: 288,
    borderRadius: 144,
    backgroundColor: '#F5C451',
    shadowColor: '#F5C451',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.4,
    shadowRadius: 50,
    elevation: 12,
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  punchButtonInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 24,
    borderRadius: 50,
    marginBottom: 16,
  },
  punchButtonText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#451a03',
    letterSpacing: -0.5,
  },
  punchButtonHint: {
    fontSize: 11,
    fontWeight: '700',
    color: '#451a03',
    letterSpacing: 2.4,
    marginTop: 8,
    opacity: 0.8,
  },
  actionCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#78716C',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.15,
    shadowRadius: 50,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#F3EDE2',
  },
  actionCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionIconActive: {
    backgroundColor: '#FEF3C7',
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  actionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#78716C',
    letterSpacing: 1.6,
    marginBottom: 4,
  },
  actionValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D2A26',
  },
  actionButton: {
    backgroundColor: '#F3EDE2',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 50,
  },
  actionButtonDisabled: {
    backgroundColor: '#E5E7EB',
    opacity: 0.5,
  },
  breakCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
    shadowColor: '#78716C',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.15,
    shadowRadius: 50,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#F3EDE2',
  },
  actionCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3EDE2',
  },
  historyToggleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#78716C',
    letterSpacing: 0.3,
  },
  historyContainer: {
    overflow: 'hidden',
  },
  historyList: {
    paddingTop: 8,
  },
  historyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#2D2A26',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  historyItem: {
    backgroundColor: '#FEFDFB',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F3EDE2',
    shadowColor: '#78716C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  historyTimesGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  timeBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timeIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  timeBlockLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#78716C',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  timeBlockValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2D2A26',
    letterSpacing: 0.3,
  },
  timeDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 16,
  },
  durationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFBEB',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  durationText: {
    fontSize: 13,
    color: '#92400E',
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2D2A26',
  },
  locationCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
    shadowColor: '#78716C',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.15,
    shadowRadius: 50,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#F3EDE2',
  },
  locationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  locationLeft: {
    flexDirection: 'row',
    gap: 16,
    flex: 1,
  },
  locationTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D2A26',
    marginBottom: 4,
  },
  locationAddress: {
    fontSize: 14,
    fontWeight: '500',
    color: '#78716C',
  },
  verifiedBadge: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: '#6EE7B7',
  },
  verifiedText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#065F46',
    letterSpacing: 1.4,
  },
  mapPreview: {
    width: '100%',
    height: 160,
    backgroundColor: '#F3EDE2',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#78716C',
    fontWeight: '600',
  },
  coordinatesDisplay: {
    alignItems: 'center',
    gap: 16,
  },
  coordsText: {
    alignItems: 'center',
  },
  coordLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#78716C',
    marginBottom: 4,
  },
  coordValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2D2A26',
  },
  floatingBar: {
    position: 'absolute',
    bottom: 120,
    left: 24,
    right: 24,
    zIndex: 40,
  },
  floatingBarContent: {
    backgroundColor: 'rgba(120, 53, 15, 0.95)',
    borderRadius: 24,
    padding: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#78716C',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.15,
    shadowRadius: 50,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  floatingBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  floatingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  floatingLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: 1.6,
    marginBottom: 4,
  },
  floatingValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  progressContainer: {
    alignItems: 'flex-end',
    gap: 8,
    width: 120,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#F59E0B',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
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
    backgroundColor: 'rgba(250, 247, 242, 0.9)',
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
    backgroundColor: '#FEF3C7',
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
  locationModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(28, 27, 23, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  locationModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    padding: 32,
    width: '80%',
    maxWidth: 320,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 30 },
    shadowOpacity: 0.4,
    shadowRadius: 60,
    elevation: 24,
  },
  locationModalIconContainer: {
    marginBottom: 24,
  },
  locationModalIconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEF8E7',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#D4A574',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  locationModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1B17',
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  locationModalSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#7E7767',
    marginBottom: 24,
  },
  locationModalSpinnerContainer: {
    marginVertical: 20,
  },
  locationModalStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF8E7',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginTop: 20,
    marginBottom: 12,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  locationModalStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F5C451',
    marginRight: 12,
  },
  locationModalStatusText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1B17',
    flex: 1,
  },
  locationModalHint: {
    fontSize: 12,
    color: '#7E7767',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
  },
});
