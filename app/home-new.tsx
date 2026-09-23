import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Modal,
  Pressable,
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
  menuKey: string;
}

export default function Home() {
  const navigation = useNavigation();

  const [isInitializing, setIsInitializing] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userCredentials, setUserCredentials] = useState<UserCredentials | null>(null);
  const [username, setUsername] = useState<string>('User');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
 const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [userMenuKeys, setUserMenuKeys] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);

  const modules: ModuleItem[] = [
    {
      id: '1',
      title: 'Collections',
      subtitle: 'Track payments',
      icon: 'wallet-outline',
      route: 'collection',
      menuKey: 'collection',
    },
    {
      id: '2',
      title: 'Feeder',
      subtitle: 'Manage feeders',
      icon: 'git-network-outline',
      route: 'feeder',
      menuKey: 'feeder',
    },
    
    {
      id: '3',
      title: 'Claims',
      subtitle: 'Track claims',
      icon: 'document-text-outline',
      route: 'claims',
      menuKey: 'claims',
    },
   {
      id: '4',
      title: 'Ledger',
      subtitle: 'View accounts & ledger',
      icon: 'book-outline',
      route: 'ledger',
      // Matches any "debtors-<company>" key (e.g. "debtors-sysmac-computers")
      menuKey: 'debtors-*',
    },
    {
      id: '5',
      title: 'Stock Report',
      subtitle: 'Check product stock',
      icon: 'cube-outline',
      route: 'stockreport',
      // Matches any "stock-report-<company>" key
      menuKey: 'stock-report-*',
    },
    {
      id: '6',
      title: 'Punch In',
      subtitle: 'Mark attendance',
      icon: 'finger-print-outline',
      route: 'punchin',
      // Open to every user for now, like Leads — switch to a real
      // menu_keys value once the backend adds permission gating for this.
      menuKey: '*',
    },
    {
      id: '7',
      title: 'Enquiry',
      subtitle: 'Create enquiries',
      icon: 'help-buoy-outline',
      route: 'enquiry',
      menuKey: '*',
    },
  ];

    const getUserSpecificKey = (baseKey: string) => {
    return userCredentials?.userId ? `${baseKey}_${userCredentials.userId}` : baseKey;
  };

  // Admins (or any user whose role field says so) always see every module
  // unlocked. Everyone else is checked against their stored menu_keys.
  // Keys ending in "-*" are wildcard checks (e.g. "debtors-*" matches
  // "debtors-sysmac-computers") since Ledger/Stock Report access is granted
  // per-company rather than by one blanket key.
  const isModuleUnlocked = (menuKey: string) => {
    if (menuKey === '*') return true; // always-open module, e.g. Leads
    if (isAdmin) return true;
    if (menuKey.endsWith('-*')) {
      const prefix = menuKey.slice(0, -1); // "debtors-*" -> "debtors-"
      return userMenuKeys.some((k) => k.startsWith(prefix));
    }
    return userMenuKeys.includes(menuKey);
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
      const response = await fetch('https://my.myimc.in/flutter/users/', {
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
      const [userId, password, storedUsername, role, menuKeysRaw] = await Promise.all([
        SecureStore.getItemAsync('userId'),
        SecureStore.getItemAsync('password'),
        SecureStore.getItemAsync('username'),
        SecureStore.getItemAsync('role'),
        SecureStore.getItemAsync('menuKeys'),
      ]);
      if (userId && password) {
        setUserCredentials({ userId, password });
        if (storedUsername) {
          setUsername(storedUsername);
        }
        setIsAdmin((role || '').trim().toLowerCase() === 'admin');
        try {
          const parsed = menuKeysRaw ? JSON.parse(menuKeysRaw) : [];
          setUserMenuKeys(Array.isArray(parsed) ? parsed : []);
        } catch {
          setUserMenuKeys([]);
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
    await fetchUserProfile();
    setRefreshing(false);
  }, [userCredentials]);

const handleModulePress = (module: ModuleItem) => {
    if (!isModuleUnlocked(module.menuKey)) {
      Alert.alert(
        'Access Restricted',
        `You don't have access to ${module.title}. Contact your admin to request access.`
      );
      return;
    }
    const routeMap: { [key: string]: string } = {
      'collection': 'Collection',
      'feeder': 'Feeder',
      'target': 'Target',
      'fuel': 'Fuel',
      'claims': 'Claim',
       'ledger': 'LedgerCompanies',
       'stockreport': 'StockReportCompanies',
        'punchin': 'PunchIn',
       'enquiry': 'Enquiry',
    };
    navigation.navigate(routeMap[module.route] || module.route);
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
            await SecureStore.deleteItemAsync('token');
            navigation.replace('Login');
          },
        },
      ]
    );
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const renderProfileImage = () => {
    if (!profileImageUri || imageLoadError) {
      return (
        <View style={styles.profileImagePlaceholder}>
          <Ionicons name="person" size={20} color="#A39A85" />
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
  }, []);

  useEffect(() => {
    if (userCredentials?.userId && !isInitializing) {
      fetchUserProfile();
    }
  }, [userCredentials, isInitializing]);

  if (isInitializing || !userCredentials) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#D4A574" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerLeft}
          onPress={toggleMoreMenu}
          activeOpacity={0.7}
        >
          {renderProfileImage()}
          <View>
            <Text style={styles.greetingLabel}>{getGreeting().toUpperCase()}</Text>
            <View style={styles.userNameRow}>
              <Text style={styles.userName}>{username}</Text>
              <Ionicons name="chevron-down" size={14} color="#A39A85" style={styles.userNameCaret} />
            </View>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.notificationButton}
          onPress={() => navigation.navigate('Notifications')}
          activeOpacity={0.7}
        >
          <Ionicons name="notifications-outline" size={22} color="#1C1B17" />
          <View style={styles.notificationDot} />
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollViewRef}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D4A574" />
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Welcome banner */}
        <View style={styles.heroCard}>
          <View style={styles.heroDecoration} />
          <View style={styles.heroCardContent}>
            <Text style={styles.heroLabel}>OVERVIEW</Text>
            <Text style={styles.heroTitle}>Everything you need,{'\n'}in one place</Text>
            <Text style={styles.heroSubtitle}>
              Manage collections, feeders, and leads without leaving your dashboard.
            </Text>
          </View>
        </View>

        {/* Work Modules */}
        <View style={styles.modulesSection}>
          <View style={styles.moduleHeader}>
            <Text style={styles.moduleTitle}>Work Modules</Text>
            <Text style={styles.moduleCount}>{modules.length} available</Text>
          </View>

       <View style={styles.moduleList}>
            {modules.map((module) => {
              const unlocked = isModuleUnlocked(module.menuKey);
              return (
                <TouchableOpacity
                  key={module.id}
                  style={[styles.moduleCard, !unlocked && styles.moduleCardLocked]}
                  onPress={() => handleModulePress(module)}
                  activeOpacity={unlocked ? 0.7 : 1}
                >
               <View style={[styles.moduleIconContainer, !unlocked && styles.moduleIconContainerLocked, { marginRight: 0, marginBottom: 10 }]}>
                    <Ionicons
                      name={unlocked ? (module.icon as any) : 'lock-closed'}
                      size={22}
                      color={unlocked ? '#B5854A' : '#C2BBA8'}
                    />
                  </View>
                  <View style={[styles.moduleTextContainer, { flex: 0, alignItems: 'center' }]}>
                    <Text style={[styles.moduleCardTitle, !unlocked && styles.moduleCardTitleLocked, { textAlign: 'center' }]}>
                      {module.title}
                    </Text>
                    <Text style={[styles.moduleCardSubtitle, { textAlign: 'center' }]}>
                      {unlocked ? module.subtitle : 'No access'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>

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
            <View style={styles.moreMenuHandle} />
            <View style={styles.moreMenuHeader}>
              <Text style={styles.moreMenuTitle}>Account</Text>
              <TouchableOpacity onPress={toggleMoreMenu} activeOpacity={0.7}>
                <Ionicons name="close-circle" size={24} color="#A39A85" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.moreMenuItem}
              onPress={() => handleMoreMenuOption('profile')}
              activeOpacity={0.7}
            >
              <View style={styles.moreMenuIconContainer}>
                <Ionicons name="person-circle-outline" size={22} color="#B5854A" />
              </View>
              <View style={styles.moreMenuTextContainer}>
                <Text style={styles.moreMenuItemTitle}>Profile</Text>
                <Text style={styles.moreMenuItemSubtitle}>View and edit profile</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#C2BBA8" />
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity
              style={[styles.moreMenuItem, styles.logoutItem]}
              onPress={handleLogout}
              activeOpacity={0.7}
            >
              <View style={[styles.moreMenuIconContainer, styles.logoutIconContainer]}>
                <Ionicons name="log-out-outline" size={22} color="#EF4444" />
              </View>
              <View style={styles.moreMenuTextContainer}>
                <Text style={[styles.moreMenuItemTitle, styles.logoutText]}>Logout</Text>
                <Text style={styles.moreMenuItemSubtitle}>Sign out of your account</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#EF4444" />
            </TouchableOpacity>
          </Animated.View>
        </Pressable>
      </Modal>
    </View>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
    fontSize: 14,
    color: '#7E7767',
    fontWeight: '600',
  },

  /* Header */
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: '#FAF9F6',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#F0EAD8',
  },
  profileImagePlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0EAD8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  greetingLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#A39A85',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1B17',
    letterSpacing: -0.3,
  },
  userNameCaret: {
    marginLeft: 4,
    marginTop: 1,
  },
  notificationButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  notificationDot: {
    position: 'absolute',
    top: 9,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E0763C',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },

  /* Scroll content */
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
  },

  /* Hero / welcome card */
  heroCard: {
    backgroundColor: '#1C1B17',
    borderRadius: 28,
    padding: 24,
    marginBottom: 28,
    overflow: 'hidden',
    shadowColor: '#1C1B17',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 8,
  },
  heroCardContent: {
    position: 'relative',
    zIndex: 10,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D4A574',
    letterSpacing: 2,
    marginBottom: 10,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 28,
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    fontSize: 13,
    color: '#C2BBA8',
    lineHeight: 19,
    maxWidth: 260,
  },
  heroDecoration: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(212, 165, 116, 0.12)',
  },

  /* Modules */
  modulesSection: {
    paddingBottom: 8,
  },
  moduleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  moduleTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1B17',
    letterSpacing: -0.2,
  },
  moduleCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#A39A85',
  },
 moduleList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
    columnGap: 12,
  },
  moduleCard: {
    width: '48%',
    flexDirection: 'column',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
   moduleCardLocked: {
    backgroundColor: '#F5F4F0',
    opacity: 0.6,
    shadowOpacity: 0,
    elevation: 0,
  },
  moduleIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#FBF0DA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  moduleTextContainer: {
    flex: 1,
  },
  moduleCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1B17',
    marginBottom: 3,
  },
   moduleCardTitleLocked: {
    color: '#A39A85',
  },
  moduleCardSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#A39A85',
  },
  moduleChevron: {
    marginLeft: 8,
  },

  /* More menu modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(28, 27, 23, 0.5)',
    justifyContent: 'flex-end',
  },
  moreMenuContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 12,
  },
  moreMenuHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E1D6',
    alignSelf: 'center',
    marginBottom: 16,
  },
  moreMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  moreMenuTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1B17',
  },
  moreMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#FAF9F6',
    borderRadius: 16,
    marginBottom: 10,
  },
  moreMenuIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FBF0DA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  moreMenuTextContainer: {
    flex: 1,
  },
  moreMenuItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1B17',
    marginBottom: 2,
  },
  moreMenuItemSubtitle: {
    fontSize: 12,
    color: '#A39A85',
    fontWeight: '500',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#F0EAD8',
    marginVertical: 4,
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
});