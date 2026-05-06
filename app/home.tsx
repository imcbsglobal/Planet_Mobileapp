/* eslint-disable prettier/prettier */
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Animated,
  Pressable,
} from 'react-native';

interface UserCredentials {
  userId: string;
  password: string;
}

interface UserProfile {
  userid: string;
  name: string;
  status: string;
  image: string;
  image_url: string;
}

interface GridItem {
  id: string;
  title: string;
  value: string;
  icon: string;
  route: string;
  showProgress?: boolean;
  progressValue?: number;
}

export default function Home() {
  const router = useRouter();

  const [isInitializing, setIsInitializing] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showProfileCard, setShowProfileCard] = useState(false);
  const [userCredentials, setUserCredentials] = useState<UserCredentials | null>(null);
  const [username, setUsername] = useState<string>('User');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
  const [loadingTab, setLoadingTab] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedAttendance, setSelectedAttendance] = useState<any>(null);
  const [monthlyAttendance, setMonthlyAttendance] = useState<any[]>([]);
  const liveAnim = useRef(new Animated.Value(1)).current;
  const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFetchingAttendance = useRef(false);

  const gridItems: GridItem[] = [
    {
      id: '1',
      title: 'Attendance',
      value: 'Manage Attendance',
      icon: 'time-outline',
      route: 'dashboard',
    },
    {
      id: '2',
      title: 'Collection',
      value: 'Manage Collection',
      icon: 'wallet-outline',
      route: 'collection',
    },
    {
      id: '3',
      title: 'Feeder',
      value: 'Manage Feeder',
      icon: 'git-network-outline',
      route: 'feeder',
    },
    {
      id: '4',
      title: 'Fuel',
      value: 'Manage Fuel',
      icon: 'water-outline',
      route: 'fuel',
    },
    {
      id: '5',
      title: 'Leads',
      value: 'Manage Leads',
      icon: 'people-outline',
      route: 'leads',
    },
    {
      id: '6',
      title: 'Target',
      value: 'Manage Target',
      icon: 'radio-button-on-outline',
      route: 'target',
    },
  ];

  const dates = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - 3 + i);
    return date;
  });

  const getUserSpecificKey = (baseKey: string) => {
    return userCredentials?.userId ? `${baseKey}_${userCredentials.userId}` : baseKey;
  };

  const processImageUrl = (imageUrl: string): string | null => {
    if (!imageUrl) return null;
    const cleanUrl = imageUrl.trim();
    if (cleanUrl.startsWith('http')) return cleanUrl;
    if (cleanUrl.startsWith('/')) return `https://myimc.in${cleanUrl}`;
    return `https://myimc.in/${cleanUrl}`;
  };

  const handleProfileImageLoading = async (userProfile: UserProfile) => {
    if (!userCredentials?.userId) return;
    const imageUrl = userProfile.image_url || userProfile.image;
    const processedImageUrl = processImageUrl(imageUrl);
    if (processedImageUrl) {
      setProfileImageUri(processedImageUrl);
      setImageLoadError(false);
    } else {
      setImageLoadError(true);
      setProfileImageUri(null);
    }
  };

  const fetchUserProfile = async () => {
    if (!userCredentials?.userId) return;
    try {
      const response = await fetch('https://myimc.in/flutter/users/', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'YourAppName/1.0',
          'Accept': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const currentUserProfile = data.find((user: UserProfile) => 
          user.userid === userCredentials.userId
        );
        
        if (currentUserProfile) {
          setUserProfile(currentUserProfile);
          setUsername(currentUserProfile.name);
          await handleProfileImageLoading(currentUserProfile);
          const profileKey = getUserSpecificKey('user_profile');
          await AsyncStorage.setItem(profileKey, JSON.stringify(currentUserProfile));
        } else {
          await loadStoredUserProfile();
        }
      } else {
        await loadStoredUserProfile();
      }
    } catch (error) {
      await loadStoredUserProfile();
    }
  };

  const fetchMonthlyAttendance = async () => {
    if (!userCredentials?.userId || !userCredentials?.password) return;
    if (isFetchingAttendance.current) return; // skip if previous request still in-flight

    isFetchingAttendance.current = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const month = selectedDate.getMonth() + 1;
      const year = selectedDate.getFullYear();

      const response = await fetch(
        `https://myimc.in/flutter/attendance/monthly/?userid=${userCredentials.userId}&password=${userCredentials.password}&month=${month}&year=${year}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setMonthlyAttendance(data.attendance_records);
          updateSelectedAttendance(data.attendance_records, selectedDate);
        }
      }
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        console.warn('Attendance fetch skipped:', error?.message);
      }
    } finally {
      clearTimeout(timeout);
      isFetchingAttendance.current = false;
    }
  };

  const updateSelectedAttendance = (records: any[], date: Date) => {
    const dateString = date.toISOString().split('T')[0];
    const record = records.find((r: any) => r.date === dateString);
    setSelectedAttendance(record || null);
  };

  const loadStoredUserProfile = async () => {
    if (!userCredentials?.userId) return;
    try {
      const profileKey = getUserSpecificKey('user_profile');
      const storedProfile = await AsyncStorage.getItem(profileKey);
      if (storedProfile) {
        const parsedProfile = JSON.parse(storedProfile);
        setUserProfile(parsedProfile);
        setUsername(parsedProfile.name);
      }
    } catch (error) {
      console.error('Error loading stored user profile:', error);
    }
  };

  const initializeUser = async () => {
    try {
      const [userId, password, storedUsername] = await Promise.all([
        SecureStore.getItemAsync('userId'),
        SecureStore.getItemAsync('password'),
        SecureStore.getItemAsync('username')
      ]);
      if (userId && password) {
        setUserCredentials({ userId, password });
        if (storedUsername) {
          setUsername(storedUsername);
        }
        return true;
      } else {
        router.replace('/login');
        return false;
      }
    } catch (error) {
      router.replace('/login');
      return false;
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setImageLoadError(false);
    setProfileImageUri(null);
    await Promise.all([fetchUserProfile(), fetchMonthlyAttendance()]);
    setRefreshing(false);
  }, [userCredentials, selectedDate]);

  const handleLogout = async () => {
    Alert.alert(
      'Logout', 
      'Are you sure you want to logout?', 
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await Promise.all([
                SecureStore.deleteItemAsync('userId'),
                SecureStore.deleteItemAsync('password'),
                SecureStore.deleteItemAsync('username')
              ]);
              
              if (userCredentials?.userId) {
                const profileKey = getUserSpecificKey('user_profile');
                await AsyncStorage.removeItem(profileKey);
              }
              
              setUserCredentials(null);
              setUsername('User');
              setUserProfile(null);
              setShowProfileCard(false);
              setImageLoadError(false);
              setProfileImageUri(null);
              
              router.replace('/login');
            } catch (logoutError) {
              Alert.alert('Logout Error', 'There was an issue logging out. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleGridItemPress = async (route: string) => {
    if (loadingTab) return;
    setLoadingTab(route);
    await new Promise((res) => setTimeout(res, 300));
    router.push(`/${route}`);
    setLoadingTab(null);
  };

  const renderProfileImage = (size: number) => {
    if (isImageLoading) {
      return (
        <View style={[styles.profileImageContainer, { width: size, height: size }]}>
          <ActivityIndicator size="small" color="#6E6E6E" />
        </View>
      );
    }

    if (!profileImageUri || imageLoadError) {
      return (
        <View style={[styles.profileImageContainer, { width: size, height: size }]}>
          <Ionicons name="person" size={size * 0.5} color="#6E6E6E" />
        </View>
      );
    }

    return (
      <Image
        source={{ uri: profileImageUri }}
        style={[styles.profileImage, { width: size, height: size }]}
        onError={() => setImageLoadError(true)}
        onLoad={() => setImageLoadError(false)}
      />
    );
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const formatTime = (timeString?: string) => {
    if (!timeString) return 'Not recorded';
    try {
      let date;
      if (/^\d{2}:\d{2}:\d{2}$/.test(timeString)) {
        const today = new Date().toISOString().split('T')[0];
        date = new Date(`${today}T${timeString}`);
      } else {
        date = new Date(timeString);
      }
      if (isNaN(date.getTime())) return timeString;
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return timeString;
    }
  };

  useEffect(() => {
    const init = async () => {
      await initializeUser();
      setIsInitializing(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (userCredentials?.userId && !isInitializing) {
      fetchUserProfile();
      fetchMonthlyAttendance();
    }
  }, [userCredentials, isInitializing, selectedDate]);

  // Live polling: refresh today's attendance every 30s only when today is selected
  useEffect(() => {
    const isToday = selectedDate.toDateString() === new Date().toDateString();
    if (!userCredentials?.userId || isInitializing || !isToday) {
      if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);
      return;
    }
    liveIntervalRef.current = setInterval(() => {
      fetchMonthlyAttendance();
    }, 30000);
    return () => {
      if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);
    };
  }, [userCredentials, isInitializing, selectedDate]);

  // Pulsing animation for live dot
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(liveAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(liveAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  useEffect(() => {
    if (monthlyAttendance.length > 0) {
      updateSelectedAttendance(monthlyAttendance, selectedDate);
    }
  }, [selectedDate, monthlyAttendance]);

  if (isInitializing || !userCredentials) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#F4C84A" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

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

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F4C84A" />
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={() => setShowProfileCard(true)}>
              {renderProfileImage(48)}
            </TouchableOpacity>
            <View style={styles.greetingContainer}>
              <Text style={styles.greetingText}>{getGreeting()}</Text>
              <View style={styles.userNameRow}>
                <Text style={styles.userName}>{username}</Text>
                {userCredentials?.userId === 'anazilthottunghal@gmail.com' && (
                  <Ionicons name="checkmark-circle" size={18} color="#4CAF50" style={styles.verificationIcon} />
                )}
              </View>
            </View>
          </View>
          <TouchableOpacity style={styles.notificationButton} onPress={() => router.push('/notifications')}>
            <Ionicons name="notifications-outline" size={24} color="#2C2C2C" />
            <View style={styles.notificationDot} />
          </TouchableOpacity>
        </View>

        {/* Calendar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.calendarContainer}
        >
          {dates.map((date, index) => {
            const isSelected = date.toDateString() === selectedDate.toDateString();
            const isToday = date.toDateString() === new Date().toDateString();
            return (
              <TouchableOpacity
                key={index}
                style={styles.dateCardWrapper}
                onPress={() => setSelectedDate(date)}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={isSelected ? ['#F4C84A', '#F4C84A'] : ['#FFFFFF', '#F6F1E8']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.dateCard,
                    isSelected && styles.dateCardSelected,
                    !isSelected && styles.dateCardUnselected
                  ]}
                >
                  <Text style={[styles.dateDay, isSelected && styles.dateDaySelected]}>
                    {date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
                  </Text>
                  <Text style={[styles.dateNumber, isSelected && styles.dateNumberSelected]}>
                    {date.getDate()}
                  </Text>
                  {isToday && <View style={styles.todayDot} />}
                </LinearGradient>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Selected Date Attendance Card */}
        <TouchableOpacity 
          style={styles.attendanceCard}
          onPress={() => handleGridItemPress('punch')}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.95)', 'rgba(246, 241, 232, 0.95)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.attendanceGradient}
          >
            <View style={styles.attendanceHeader}>
              <Text style={styles.attendanceTitle}>
                {selectedDate.toDateString() === new Date().toDateString() 
                  ? "Today's Attendance" 
                  : selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
              <View style={styles.liveIndicator}>
                <Animated.View style={[styles.pulsingDot, { opacity: selectedAttendance?.punch_in && !selectedAttendance?.punch_out ? liveAnim : 0.3 }]} />
                <Text style={styles.liveText}>
                  {selectedAttendance?.punch_in && !selectedAttendance?.punch_out ? 'Live' : 'Not Active'}
                </Text>
              </View>
            </View>
            
            <View style={styles.timelineContainer}>
              <View style={styles.timelineItem}>
                <View style={[styles.timelineIcon, selectedAttendance?.punch_in && styles.timelineIconActive]}>
                  <Ionicons 
                    name="log-in" 
                    size={20} 
                    color={selectedAttendance?.punch_in ? "#4CAF50" : "#ccc"} 
                  />
                </View>
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineLabel}>Punch In</Text>
                  <Text style={[styles.timelineTime, selectedAttendance?.punch_in && styles.timelineTimeActive]}>
                    {formatTime(selectedAttendance?.punch_in)}
                  </Text>
                </View>
              </View>
              
              <View style={styles.timelineConnector}>
                <View style={[
                  styles.timelineProgress,
                  selectedAttendance?.punch_in && !selectedAttendance?.punch_out && styles.timelineProgressActive
                ]} />
              </View>
              
              <View style={styles.timelineItem}>
                <View style={[styles.timelineIcon, selectedAttendance?.punch_out && styles.timelineIconActive]}>
                  <Ionicons 
                    name="log-out" 
                    size={20} 
                    color={selectedAttendance?.punch_out ? "#F44336" : "#ccc"} 
                  />
                </View>
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineLabel}>Punch Out</Text>
                  <Text style={[styles.timelineTime, selectedAttendance?.punch_out && styles.timelineTimeActive]}>
                    {formatTime(selectedAttendance?.punch_out)}
                  </Text>
                </View>
              </View>
            </View>
            
            {selectedAttendance?.punch_in && !selectedAttendance?.punch_out && 
             selectedDate.toDateString() === new Date().toDateString() && (
              <View style={styles.currentlyWorkingContainer}>
                <View style={styles.breathingDot} />
                <Text style={styles.currentlyWorkingText}>Currently Working</Text>
              </View>
            )}
            
            {selectedAttendance?.working_hours && (
              <View style={styles.workingHoursContainer}>
                <Ionicons name="time-outline" size={16} color="#6E6E6E" />
                <Text style={styles.workingHoursText}>{selectedAttendance.working_hours}</Text>
              </View>
            )}
            
            {selectedAttendance?.status && (
              <View style={styles.statusBadgeContainer}>
                <Text style={styles.statusBadge}>{selectedAttendance.status.toUpperCase()}</Text>
              </View>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* Grid Cards */}
        <View style={styles.actionsSection}>
          <Text style={styles.sectionHeading}>Quick Actions</Text>
          <View style={styles.gridContainer}>
            {gridItems.map((item) => {
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
                  key={item.id}
                  style={styles.gridCardWrapper}
                  onPress={() => handleGridItemPress(item.route)}
                  onPressIn={handlePressIn}
                  onPressOut={handlePressOut}
                >
                  <Animated.View style={{ flex: 1, transform: [{ scale: scaleAnim }] }}>
                    <LinearGradient
                      colors={['#FFFFFF', '#F6F1E8']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.gridCard}
                    >
                      <View style={styles.cardIconContainer}>
                        <Ionicons name={item.icon as any} size={32} color="#87847b" />
                      </View>
                      <Text style={styles.cardTitle}>{item.title}</Text>
                      <Text style={styles.cardValue}>{item.value}</Text>
                    </LinearGradient>
                  </Animated.View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Version 4.0.0</Text>
        </View>
      </ScrollView>

      {/* Profile Modal */}
      <Modal
        visible={showProfileCard}
        transparent
        animationType="fade"
        onRequestClose={() => setShowProfileCard(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowProfileCard(false)}
        >
          <View style={styles.profileCard}>
            <TouchableOpacity activeOpacity={1}>
              <View style={styles.profileHeader}>
                {renderProfileImage(80)}
                <Text style={styles.profileName}>{username}</Text>
                <Text style={styles.profileEmail}>{userCredentials?.userId}</Text>
              </View>
              <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                <Ionicons name="log-out-outline" size={20} color="#2C2C2C" />
                <Text style={styles.logoutText}>Logout</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F2EE',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6E6E6E',
    fontWeight: '400',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 30,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  profileImageContainer: {
    borderRadius: 100,
    backgroundColor: '#F6F1E8',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  profileImage: {
    borderRadius: 100,
  },
  greetingContainer: {
    justifyContent: 'center',
    flex: 1,
  },
  greetingText: {
    fontSize: 14,
    color: '#6E6E6E',
    fontWeight: '400',
    marginBottom: 4,
    opacity: 0.7,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  userName: {
    fontSize: 18,
    color: '#1C1C1C',
    fontWeight: '700',
  },
  verificationIcon: {
    marginLeft: 2,
  },
  notificationButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F6F1E8',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  notificationDot: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F4C84A',
  },
  calendarContainer: {
    paddingVertical: 16,
    gap: 12,
  },
  dateCardWrapper: {
    width: 60,
    height: 80,
  },
  dateCard: {
    flex: 1,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 3,
  },
  dateCardSelected: {
    transform: [{ scale: 1.03 }],
  },
  dateCardUnselected: {
    opacity: 0.85,
  },
  dateDay: {
    fontSize: 11,
    color: '#6E6E6E',
    fontWeight: '400',
    marginBottom: 4,
  },
  dateDaySelected: {
    color: '#1C1C1C',
  },
  dateNumber: {
    fontSize: 18,
    color: '#1C1C1C',
    fontWeight: '500',
  },
  dateNumberSelected: {
    color: '#1C1C1C',
  },
  todayDot: {
    position: 'absolute',
    bottom: 8,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#F4C84A',
  },
  actionsSection: {
    marginTop: 1,
  },
  sectionHeading: {
    fontSize: 18,
    color: '#1C1C1C',
    fontWeight: '500',
    marginBottom: 16,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  gridCardWrapper: {
    width: '47%',
    aspectRatio: 1,
  },
  gridCard: {
    flex: 1,
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 6,
  },
  cardIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(244, 200, 74, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    color: '#1C1C1C',
    fontWeight: '600',
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 12,
    color: '#6E6E6E',
    fontWeight: '400',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileCard: {
    width: '85%',
    maxWidth: 320,
    borderRadius: 24,
    backgroundColor: '#F6F1E8',
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 30,
    elevation: 10,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  profileName: {
    fontSize: 22,
    color: '#2C2C2C',
    fontWeight: '600',
    marginTop: 16,
  },
  profileEmail: {
    fontSize: 14,
    color: '#6E6E6E',
    fontWeight: '400',
    marginTop: 4,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  logoutText: {
    fontSize: 16,
    color: '#2C2C2C',
    fontWeight: '500',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 20,
    marginTop: 16,
  },
  footerText: {
    fontSize: 12,
    color: '#6E6E6E',
    fontWeight: '400',
  },
  attendanceCard: {
    marginTop: 16,
    marginBottom: 24,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  attendanceGradient: {
    padding: 20,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  attendanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  attendanceTitle: {
    fontSize: 18,
    color: '#1C1C1C',
    fontWeight: '600',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  pulsingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
  },
  liveText: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
  },
  timelineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timelineItem: {
    flex: 1,
    alignItems: 'center',
  },
  timelineIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(204, 204, 204, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'rgba(204, 204, 204, 0.3)',
  },
  timelineIconActive: {
    backgroundColor: 'rgba(244, 200, 74, 0.2)',
    borderColor: '#F4C84A',
  },
  timelineContent: {
    alignItems: 'center',
  },
  timelineLabel: {
    fontSize: 12,
    color: '#6E6E6E',
    fontWeight: '400',
    marginBottom: 4,
  },
  timelineTime: {
    fontSize: 16,
    color: '#ccc',
    fontWeight: '600',
  },
  timelineTimeActive: {
    color: '#1C1C1C',
  },
  timelineConnector: {
    width: 60,
    height: 2,
    backgroundColor: 'rgba(204, 204, 204, 0.3)',
    marginHorizontal: 8,
    borderRadius: 1,
    overflow: 'hidden',
  },
  timelineProgress: {
    height: '100%',
    width: 0,
    backgroundColor: '#F4C84A',
  },
  timelineProgressActive: {
    width: '100%',
  },
  workingHoursContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(110, 110, 110, 0.1)',
    gap: 6,
  },
  workingHoursText: {
    fontSize: 14,
    color: '#6E6E6E',
    fontWeight: '500',
  },
  currentlyWorkingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 8,
  },
  breathingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
  },
  currentlyWorkingText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  statusBadgeContainer: {
    alignItems: 'center',
    marginTop: 12,
  },
  statusBadge: {
    fontSize: 11,
    color: '#6E6E6E',
    fontWeight: '600',
    backgroundColor: 'rgba(110, 110, 110, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
});


