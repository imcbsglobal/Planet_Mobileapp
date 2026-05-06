import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import EyeLoader from '../components/EyeLoader';
import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Animated,
  Modal,
  Pressable,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

interface ModuleItem {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  route: string;
}

export default function Home() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [isInitializing, setIsInitializing] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userCredentials, setUserCredentials] = useState<UserCredentials | null>(null);
  const [username, setUsername] = useState<string>('User');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
  const [isPunchedIn, setIsPunchedIn] = useState(false);
  const [weekHours, setWeekHours] = useState('32.5');
  const [weekProgress, setWeekProgress] = useState(81);
  const [pendingRequests, setPendingRequests] = useState(3);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isPunchLoading, setIsPunchLoading] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<any>(null);
  const [locationAddress, setLocationAddress] = useState<string>('Fetching location...');
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [screenWidth, setScreenWidth] = useState(Dimensions.get('window').width);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);

  // Configure notification handler
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  const getTodayDateString = () => new Date().toISOString().split('T')[0];

  // Request notification permissions and schedule daily reminders
  const setupNotifications = async () => {
    try {
      // Request permissions
      const { status } = await Notifications.requestPermissionsAsync();
      
      if (status !== 'granted') {
        console.log('Notification permission denied');
        return;
      }

      // Cancel any existing notifications to avoid duplicates
      await Notifications.cancelAllScheduledNotificationsAsync();

      // Schedule 9:30 AM daily notification - Don't forget to punch in
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Don't forget to punch in!",
          body: 'Start your workday - Punch in now',
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: 9,
          minute: 30,
          repeats: true,
        },
      });

      // Schedule 6:00 PM daily notification - Don't forget to punch out
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Don't forget to punch out!",
          body: 'End your workday - Punch out now',
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: 18,
          minute: 0,
          repeats: true,
        },
      });

      console.log('Daily notifications scheduled successfully');
    } catch (error) {
      console.error('Error setting up notifications:', error);
    }
  };

  // Handle notification tap - navigate to punch screen
  const handleNotificationResponse = (response: Notifications.NotificationResponse) => {
    navigation.navigate('PunchRedesign');
  };

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
      console.error('Error getting location:', error);
      setLocationAddress('Unable to fetch location');
      return null;
    }
  };

  const loadTodayPunchStatus = async () => {
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
          } else {
            setIsPunchedIn(false);
          }
        }
      }
    } catch (error) {
      console.error('Error loading punch status:', error);
    }
  };

  const modules: ModuleItem[] = [
    {
      id: '1',
      title: 'Collections',
      subtitle: 'Track payments',
      icon: 'wallet-outline',
      route: 'collection',
    },
    {
      id: '2',
      title: 'Feeder',
      subtitle: 'Manage feeders',
      icon: 'git-network-outline',
      route: 'feeder',
    },
    {
      id: '3',
      title: 'Leads',
      subtitle: 'Manage leads',
      icon: 'people-outline',
      route: 'leads',
    },
    {
      id: '4',
      title: 'Leave',
      subtitle: 'Time off portal',
      icon: 'sunny-outline',
      route: 'leave-request',
    },
  ];

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
        }
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
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
        navigation.replace('Login');
        return false;
      }
    } catch (error) {
      navigation.replace('Login');
      return false;
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchUserProfile(), loadTodayPunchStatus(), getCurrentLocation()]);
    setRefreshing(false);
  }, [userCredentials]);

  const handleModulePress = (route: string) => {
    const routeMap: { [key: string]: string } = {
      'collection': 'Collection',
      'feeder': 'Feeder',
      'target': 'Target',
      'leads': 'Leads',
      'leave-request': 'LeaveRequest',
      'fuel': 'Fuel',
    };
    navigation.navigate(routeMap[route] || route);
  };

  const handleQuickPunch = async () => {
    if (!userCredentials) {
      Alert.alert('Error', 'User credentials not found');
      return;
    }

    // Check if location is available, if not fetch it
    let location = currentLocation;
    if (!location) {
      setIsPunchLoading(true);
      
      // Small delay before showing modal to avoid flash
      const showModalTimer = setTimeout(() => {
        setShowLocationModal(true);
      }, 300);
      
      // Single fast attempt
      location = await getCurrentLocation();
      
      // Clear timer and close modal immediately
      clearTimeout(showModalTimer);
      setShowLocationModal(false);
      setIsPunchLoading(false);
      
      // If location still not available, just return without alert
      if (!location) {
        return;
      }
    }

    // Location is available, proceed with punch
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const type = isPunchedIn ? 'out' : 'in';
    const confirmationTitle = type === 'in' ? 'Punch In' : 'Punch Out';
    const confirmationMessage = `Are you sure you want to punch ${type}?`;

    Alert.alert(confirmationTitle, confirmationMessage, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        style: 'default',
        onPress: () => performPunch(type, location || currentLocation),
      },
    ]);
  };

  const performPunch = async (type: 'in' | 'out', location: any) => {
    if (!userCredentials || !location) return;

    setIsPunchLoading(true);

    try {
      const payload = {
        userid: userCredentials.userId,
        password: userCredentials.password,
        location: locationAddress,
        latitude: location.coords.latitude.toString(),
        longitude: location.coords.longitude.toString(),
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
        if (type === 'in') {
          setIsPunchedIn(true);
        } else {
          setIsPunchedIn(false);
        }

        Alert.alert('Success', `Punch ${type === 'in' ? 'In' : 'Out'} successful!`);
        
        // Send instant success notification
        try {
          // Check if permission is granted
          const { status } = await Notifications.getPermissionsAsync();
          
          if (status !== 'granted') {
            console.log('Notification permission not granted');
            return;
          }
          
          const currentTime = new Date().toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
          });
          
          const notificationId = await Notifications.scheduleNotificationAsync({
            content: {
              title: type === 'in' ? "Punch In Successful!" : "Punch Out Successful!",
              body: type === 'in' 
                ? `You punched in at ${currentTime}` 
                : `You punched out at ${currentTime}`,
              sound: true,
              priority: Notifications.AndroidNotificationPriority.HIGH,
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: 2,
              repeats: false,
            },
          });
          
          console.log('Success notification scheduled with ID:', notificationId);
        } catch (notificationError) {
          console.error('Error sending success notification:', notificationError);
        }
        
        await loadTodayPunchStatus();
      } else {
        Alert.alert('Error', 'Failed to punch. Please try again.');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Network error occurred');
    } finally {
      setIsPunchLoading(false);
    }
  };

  const toggleMoreMenu = () => {
    if (showMoreMenu) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start(() => setShowMoreMenu(false));
    } else {
      setShowMoreMenu(true);
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 80,
          friction: 10,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  };

  const handleMoreMenuOption = (route: string) => {
    toggleMoreMenu();
    setTimeout(() => {
      navigation.navigate(route === 'profile' ? 'Profile' : route);
    }, 200);
  };

  const handleLogout = async () => {
    toggleMoreMenu();
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await SecureStore.deleteItemAsync('userId');
            await SecureStore.deleteItemAsync('password');
            await SecureStore.deleteItemAsync('username');
            navigation.replace('Login');
          },
        },
      ]
    );
  };

  const getGreeting = () => {
    if (isPunchedIn) {
      return 'Thank you';
    }
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const handleViewAll = () => {
    scrollViewRef.current?.scrollTo({ y: 400, animated: true });
  };

  const renderProfileImage = () => {
    if (!profileImageUri || imageLoadError) {
      return (
        <View style={styles.profileImagePlaceholder}>
          <Ionicons name="person" size={20} color="#6E6E6E" />
        </View>
      );
    }

    return (
      <Image
        source={{ uri: profileImageUri }}
        style={styles.profileImage}
        onError={() => setImageLoadError(true)}
      />
    );
  };

  useEffect(() => {
    const init = async () => {
      await initializeUser();
      setIsInitializing(false);
    };
    init();

    // Set up notification tap listener
    const subscription = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    
    // Listen for screen dimension changes
    const dimensionSubscription = Dimensions.addEventListener('change', ({ window }) => {
      setScreenWidth(window.width);
    });
    
    return () => {
      subscription.remove();
      dimensionSubscription?.remove();
    };
  }, []);

  useEffect(() => {
    if (userCredentials?.userId && !isInitializing) {
      fetchUserProfile();
      loadTodayPunchStatus();
      getCurrentLocation();
      setupNotifications(); // Setup daily notifications
    }
  }, [userCredentials, isInitializing]);

  if (isInitializing || !userCredentials) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#F5C451" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {renderProfileImage()}
          <View>
            <Text style={styles.greetingLabel}>{getGreeting().toUpperCase()},</Text>
            <Text style={styles.userName}>{username}!</Text>
          </View>
        </View>
        <TouchableOpacity 
          style={styles.notificationButton}
          onPress={() => navigation.navigate('Notifications')}
        >
          <Ionicons name="notifications-outline" size={24} color="#D4A574" />
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollViewRef}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F5C451" />
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Attendance Card */}
        <TouchableOpacity 
          style={styles.heroCard}
          onPress={handleQuickPunch}
          activeOpacity={0.9}
          disabled={isPunchLoading}
        >
          <View style={styles.heroCardContent}>
            <View>
              <Text style={styles.heroLabel}>CURRENT STATUS</Text>
              <Text style={styles.heroTitle}>
                You're {isPunchedIn ? 'punched in' : 'not\npunched in'}
              </Text>
            </View>
            <View style={styles.heroPunchButton}>
              {isPunchLoading ? (
                <>
                  <ActivityIndicator size="small" color="#453714" />
                  <Text style={[styles.heroPunchText, { marginLeft: 8 }]}>Fetching location...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="finger-print" size={24} color="#453714" />
                  <Text style={styles.heroPunchText}>Quick Punch {isPunchedIn ? 'Out' : 'In'}</Text>
                </>
              )}
            </View>
          </View>
          <View style={styles.heroDecoration} />
        </TouchableOpacity>

        {/* Work Modules */}
        <View style={styles.modulesSection}>
          <View style={styles.moduleHeader}>
            <Text style={styles.moduleTitle}>Work Modules</Text>
            <TouchableOpacity onPress={handleViewAll}>
              <Text style={styles.viewAllText}>VIEW ALL</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.moduleGrid}>
            {modules.map((module) => (
              <TouchableOpacity
                key={module.id}
                style={styles.moduleCard}
                onPress={() => handleModulePress(module.route)}
                activeOpacity={0.7}
              >
                <View style={styles.moduleIconContainer}>
                  <Ionicons name={module.icon as any} size={24} color="#D4A574" />
                </View>
                <Text style={styles.moduleCardTitle}>{module.title}</Text>
                <Text style={styles.moduleCardSubtitle}>{module.subtitle}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Location Status Card - Removed from scroll view */}
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity style={styles.navItemActive}>
          <Ionicons name="home" size={24} color="#D4A574" />
          <Text style={styles.navLabelActive}>HOME</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.navItem}
          onPress={() => navigation.navigate('PunchRedesign')}
        >
          <Ionicons name="finger-print-outline" size={24} color="#7E7767" />
          <Text style={styles.navLabel}>PUNCH</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.navItem}
          onPress={() => navigation.navigate('Request')}
        >
          <Ionicons name="time-outline" size={24} color="#7E7767" />
          <Text style={styles.navLabel}>REQUESTS</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.navItem}
          onPress={toggleMoreMenu}
        >
          <Ionicons name="ellipsis-vertical" size={24} color="#7E7767" />
          <Text style={styles.navLabel}>MORE</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showMoreMenu}
        transparent
        animationType="none"
        onRequestClose={toggleMoreMenu}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={toggleMoreMenu}
        >
          <Animated.View
            style={[
              styles.moreMenuContainer,
              {
                opacity: opacityAnim,
                transform: [
                  {
                    translateY: slideAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [100, 0],
                    }),
                  },
                  {
                    scale: slideAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.9, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.moreMenuHeader}>
              <Text style={styles.moreMenuTitle}>More Options</Text>
              <TouchableOpacity onPress={toggleMoreMenu}>
                <Ionicons name="close-circle" size={24} color="#7E7767" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.moreMenuItem}
              onPress={() => handleMoreMenuOption('profile')}
            >
              <View style={styles.moreMenuIconContainer}>
                <Ionicons name="person-circle-outline" size={24} color="#D4A574" />
              </View>
              <View style={styles.moreMenuTextContainer}>
                <Text style={styles.moreMenuItemTitle}>Profile</Text>
                <Text style={styles.moreMenuItemSubtitle}>View and edit profile</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#7E7767" />
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity
              style={[styles.moreMenuItem, styles.logoutItem]}
              onPress={handleLogout}
            >
              <View style={[styles.moreMenuIconContainer, styles.logoutIconContainer]}>
                <Ionicons name="log-out-outline" size={24} color="#EF4444" />
              </View>
              <View style={styles.moreMenuTextContainer}>
                <Text style={[styles.moreMenuItemTitle, styles.logoutText]}>Logout</Text>
                <Text style={styles.moreMenuItemSubtitle}>Sign out of your account</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#EF4444" />
            </TouchableOpacity>
          </Animated.View>
        </Pressable>
      </Modal>

      {/* Location Fetching Modal */}
      <Modal
        visible={showLocationModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowLocationModal(false);
          setIsPunchLoading(false);
        }}
      >
        <TouchableOpacity 
          style={styles.locationModalOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowLocationModal(false);
            setIsPunchLoading(false);
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
    backgroundColor: '#FAF9F6',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAF9F6',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6E6E6E',
    fontWeight: '600',
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  profileImagePlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F2F0E9',
    justifyContent: 'center',
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
  modulesSection: {
    paddingBottom: 48,
  },
  moduleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  moduleTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1B17',
  },
  viewAllText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D4A574',
    letterSpacing: 3.2,
  },
  moduleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  moduleCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    padding: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.06,
    shadowRadius: 40,
    elevation: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  moduleIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#FEF8E7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  moduleCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1B17',
    marginBottom: 4,
  },
  moduleCardSubtitle: {
    fontSize: 10,
    fontWeight: '500',
    color: '#7E7767',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: Dimensions.get('window').width > 768 ? 80 : 16,
    paddingTop: 12,
    backgroundColor: 'rgba(250, 249, 246, 0.9)',
    borderTopLeftRadius: Dimensions.get('window').width > 768 ? 32 : 48,
    borderTopRightRadius: Dimensions.get('window').width > 768 ? 32 : 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.06,
    shadowRadius: 40,
    elevation: 8,
  },
  navItem: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: Dimensions.get('window').width > 768 ? 32 : 20,
    minWidth: Dimensions.get('window').width > 768 ? 100 : 60,
  },
  navItemActive: {
    alignItems: 'center',
    backgroundColor: '#FEF8E7',
    paddingVertical: 8,
    paddingHorizontal: Dimensions.get('window').width > 768 ? 32 : 20,
    borderRadius: 50,
    minWidth: Dimensions.get('window').width > 768 ? 100 : 60,
  },
  navLabel: {
    fontSize: Dimensions.get('window').width > 768 ? 13 : 11,
    fontWeight: '500',
    color: '#7E7767',
    marginTop: 4,
    letterSpacing: 1.2,
  },
  navLabelActive: {
    fontSize: Dimensions.get('window').width > 768 ? 13 : 11,
    fontWeight: '700',
    color: '#D4A574',
    marginTop: 4,
    letterSpacing: 1.2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  moreMenuContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 12,
  },
  moreMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  moreMenuTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1B17',
  },
  moreMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#FAF9F6',
    borderRadius: 16,
    marginBottom: 12,
  },
  moreMenuIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FEF8E7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  moreMenuTextContainer: {
    flex: 1,
  },
  moreMenuItemTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1B17',
    marginBottom: 2,
  },
  moreMenuItemSubtitle: {
    fontSize: 12,
    color: '#7E7767',
    fontWeight: '500',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 12,
  },
  logoutItem: {
    backgroundColor: '#FEF2F2',
  },
  logoutIconContainer: {
    backgroundColor: '#FEE2E2',
  },
  logoutText: {
    color: '#EF4444',
  },
  locationStatusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    marginTop: 24,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8,
    borderWidth: 2,
    borderColor: '#F5C451',
  },
  locationStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    gap: 12,
  },
  locationStatusTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1B17',
  },
  locationStatusContent: {
    alignItems: 'center',
    gap: 16,
  },
  locationStatusText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1B17',
    textAlign: 'center',
    marginTop: 16,
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
