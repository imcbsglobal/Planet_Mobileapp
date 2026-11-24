import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import * as SecureStore from '../lib/secureStore';
import React, { useCallback, useEffect, useState } from 'react';
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

export default function Profile() {
  const navigation = useNavigation();

  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userCredentials, setUserCredentials] = useState<UserCredentials | null>(null);
  const [username, setUsername] = useState<string>('User');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);

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
    
    setIsImageLoading(true);
    const imageUrl = userProfile.image_url || userProfile.image;
    
    console.log('=== PROFILE IMAGE LOADING ===');
    console.log('Raw image URL:', imageUrl);
    
    const processedImageUrl = processImageUrl(imageUrl);
    console.log('Processed image URL:', processedImageUrl);
    
    if (processedImageUrl) {
      setProfileImageUri(processedImageUrl);
      setImageLoadError(false);
    } else {
      console.log('No valid image URL found');
      setImageLoadError(true);
      setProfileImageUri(null);
    }
    
    setIsImageLoading(false);
  };

  const fetchUserProfile = async () => {
    if (!userCredentials?.userId) return;
    
    console.log('=== FETCHING USER PROFILE ===');
    console.log('User ID:', userCredentials.userId);
    
    try {
      const response = await fetch('https://my.myimc.in/flutter/users/', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'YourAppName/1.0',
          'Accept': 'application/json',
        },
      });

      console.log('API Response Status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('Total users fetched:', data.length);
        
        const currentUserProfile = data.find((user: UserProfile) => 
          user.userid === userCredentials.userId
        );
        
        if (currentUserProfile) {
          console.log('=== USER PROFILE FOUND ===');
          console.log('Name:', currentUserProfile.name);
          console.log('Status:', currentUserProfile.status);
          console.log('Image:', currentUserProfile.image);
          console.log('Image URL:', currentUserProfile.image_url);
          
          setUserProfile(currentUserProfile);
          setUsername(currentUserProfile.name);
          await handleProfileImageLoading(currentUserProfile);
          
          // Cache profile data
          const profileKey = getUserSpecificKey('user_profile');
          await AsyncStorage.setItem(profileKey, JSON.stringify(currentUserProfile));
          console.log('Profile cached successfully');
        } else {
          console.log('User profile not found in API response');
          // Try to load from cache
          await loadStoredUserProfile();
        }
      } else {
        console.error('API request failed with status:', response.status);
        await loadStoredUserProfile();
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      await loadStoredUserProfile();
    }
  };

  const loadStoredUserProfile = async () => {
    if (!userCredentials?.userId) return;
    
    console.log('Loading profile from cache...');
    try {
      const profileKey = getUserSpecificKey('user_profile');
      const storedProfile = await AsyncStorage.getItem(profileKey);
      if (storedProfile) {
        const parsedProfile = JSON.parse(storedProfile);
        console.log('Cached profile loaded:', parsedProfile.name);
        setUserProfile(parsedProfile);
        setUsername(parsedProfile.name);
        await handleProfileImageLoading(parsedProfile);
      } else {
        console.log('No cached profile found');
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
    setImageLoadError(false);
    setProfileImageUri(null);
    await fetchUserProfile();
    setRefreshing(false);
  }, [userCredentials]);

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
              
              navigation.replace('Login');
            } catch (logoutError) {
              Alert.alert('Logout Error', 'There was an issue logging out. Please try again.');
            }
          },
        },
      ]
    );
  };

  // Developer test notification trigger
  const handleTestNotification = async () => {
    try {
      // Check if permission is granted
      const { status } = await Notifications.getPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Notification permission is not granted. Please enable it in settings.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Schedule test notification with proper trigger format
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: "Test Notification",
          body: 'This is a test notification from MY IMC app!',
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 2,
          repeats: false,
        },
      });
      
      console.log('Test notification scheduled with ID:', notificationId);
      
      Alert.alert(
        'Test Notification Scheduled',
        'A test notification will appear in 2 seconds. Minimize the app to see it in notification tray!',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Test notification error:', error);
      Alert.alert(
        'Error', 
        `Failed to schedule test notification: ${error.message || 'Unknown error'}`,
        [{ text: 'OK' }]
      );
    }
  };

  const renderProfileImage = () => {
    if (isImageLoading) {
      return (
        <View style={styles.profileImagePlaceholder}>
          <ActivityIndicator size="large" color="#805f00" />
        </View>
      );
    }

    if (!profileImageUri || imageLoadError) {
      return (
        <View style={styles.profileImagePlaceholder}>
          <Ionicons name="person" size={60} color="#805f00" />
        </View>
      );
    }

    return (
      <Image
        source={{ uri: profileImageUri }}
        style={styles.profileImage}
        onError={(error) => {
          console.log('Image load error:', error.nativeEvent.error);
          setImageLoadError(true);
        }}
        onLoad={() => {
          console.log('Image loaded successfully');
          setImageLoadError(false);
        }}
      />
    );
  };

  useEffect(() => {
    const init = async () => {
      await initializeUser();
      setIsLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (userCredentials?.userId && !isLoading) {
      fetchUserProfile();
    }
  }, [userCredentials, isLoading]);

  if (isLoading || !userCredentials) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#805f00" />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#805f00" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>PROFILE</Text>
        <TouchableOpacity style={styles.notificationButton} onPress={() => navigation.navigate('Notifications')}>
          <Ionicons name="notifications-outline" size={24} color="#805f00" />
        </TouchableOpacity>
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#805f00" />
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.profileImageContainer}>
            {renderProfileImage()}
          </View>
          <View style={styles.profileNameContainer}>
            <Text style={styles.profileName}>{username}</Text>
            {userCredentials.userId === 'anazilthottunghal@gmail.com' && (
              <View style={styles.verificationBadge}>
                <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
              </View>
            )}
          </View>
          <Text style={styles.profileRole}>EMPLOYEE</Text>
          <Text style={styles.profileId}>ID: {userCredentials.userId}</Text>
        </View>

        {/* Menu Sections */}
        <View style={styles.menuContainer}>
          {/* Account Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ACCOUNT</Text>
            <View style={styles.sectionContent}>
              <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('Notifications')}>
                <View style={styles.menuItemLeft}>
                  <View style={styles.iconContainer}>
                    <Ionicons name="notifications-outline" size={20} color="#666559" />
                  </View>
                  <Text style={styles.menuItemText}>Notifications</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#bcb9ab" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Support Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>SUPPORT</Text>
            <View style={styles.sectionContent}>
              <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('About')}>
                <View style={styles.menuItemLeft}>
                  <View style={styles.iconContainer}>
                    <Ionicons name="information-circle-outline" size={20} color="#666559" />
                  </View>
                  <Text style={styles.menuItemText}>About</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#bcb9ab" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Logout Button */}
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color="#ae4025" />
            <Text style={styles.logoutText}>LOG OUT</Text>
          </TouchableOpacity>
        </View>

        {/* App Version */}
        <Text style={styles.versionText}>Version 5.3.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fffbff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fffbff',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666559',
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: 'rgba(255, 251, 255, 0.8)',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f7f4e7',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#805f00',
    letterSpacing: 3.2,
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f7f4e7',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  profileHeader: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  profileImageContainer: {
    position: 'relative',
    marginBottom: 20,
  },
  profileImage: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 4,
    borderColor: '#f7f4e7',
  },
  profileImagePlaceholder: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#f7f4e7',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#ece8d9',
  },
  profileNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 4,
  },
  profileName: {
    fontSize: 28,
    fontWeight: '900',
    color: '#39382e',
    letterSpacing: -0.5,
  },
  verificationBadge: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileRole: {
    fontSize: 12,
    fontWeight: '700',
    color: '#805f00',
    letterSpacing: 2.4,
    marginBottom: 8,
  },
  profileId: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666559',
  },
  menuContainer: {
    gap: 24,
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#39382e',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.03,
    shadowRadius: 40,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#666559',
    letterSpacing: 2.4,
    marginBottom: 20,
  },
  sectionContent: {
    gap: 16,
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f7f4e7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#39382e',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2eee0',
    paddingVertical: 20,
    borderRadius: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#ae4025',
    letterSpacing: 2.4,
  },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#bcb9ab',
    fontWeight: '500',
    marginTop: 32,
  },
});
