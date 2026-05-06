/* eslint-disable prettier/prettier */
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface AttendanceRecord {
  date: string;
  date_formatted: string;
  day: number;
  day_name: string;
  status: string;
  punch_in: string | null;
  punch_out: string | null;
  punch_in_time: string | null;
  punch_out_time: string | null;
  punch_in_location: string | null;
  punch_out_location: string | null;
  working_hours: string | null;
  verified: boolean;
  note: string;
  has_record: boolean;
}

interface MonthlyAttendanceResponse {
  success: boolean;
  employee_name: string;
  month: number;
  year: number;
  month_name: string;
  summary: {
    total_days_in_month: number;
    total_attendance_records: number;
    present_days: number;
    full_days: number;
    half_days: number;
    leave_days: number;
    absent_days: number;
    no_record_days: number;
    total_working_hours: string;
    attendance_percentage: number;
  };
  attendance_records: AttendanceRecord[];
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

const Punch = () => {
  const router = useRouter();

  // Animation refs
  const punchInScale = useRef(new Animated.Value(1)).current;
  const punchOutScale = useRef(new Animated.Value(1)).current;
  const breakInScale = useRef(new Animated.Value(1)).current;
  const breakOutScale = useRef(new Animated.Value(1)).current;
  const punchInPulse = useRef(new Animated.Value(1)).current;
  const punchOutPulse = useRef(new Animated.Value(1)).current;
  const punchInPulseOpacity = useRef(new Animated.Value(0)).current;
  const punchOutPulseOpacity = useRef(new Animated.Value(0)).current;

  const animatePress = (scaleRef: Animated.Value, pulseRef: Animated.Value, pulseOpacity: Animated.Value) => {
    // Scale bounce
    Animated.sequence([
      Animated.spring(scaleRef, { toValue: 0.88, useNativeDriver: true, speed: 50, bounciness: 0 }),
      Animated.spring(scaleRef, { toValue: 1.08, useNativeDriver: true, speed: 20, bounciness: 12 }),
      Animated.spring(scaleRef, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }),
    ]).start();
    // Pulse ring
    pulseRef.setValue(1);
    pulseOpacity.setValue(0.6);
    Animated.parallel([
      Animated.timing(pulseRef, { toValue: 2.2, duration: 600, useNativeDriver: true }),
      Animated.timing(pulseOpacity, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  };

  const [isLoading, setIsLoading] = useState(false);
  const [isBreakLoading, setIsBreakLoading] = useState(false);
  const [todayStatus, setTodayStatus] = useState<TodayStatus | null>(null);
  const [attendanceId, setAttendanceId] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<any>(null);
  const [locationAddress, setLocationAddress] = useState<any>(null);
  const [userCredentials, setUserCredentials] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Break punch state
  const [breakStatus, setBreakStatus] = useState<any>(null);
  const [currentBreakId, setCurrentBreakId] = useState<string | null>(null);
  const [breakHistory, setBreakHistory] = useState<any[]>([]);
  const [showBreakHistory, setShowBreakHistory] = useState(false);

  /* ---------- loading overlay states ---------- */
  const [loadingTab, setLoadingTab] = useState<string | null>(null);

  useEffect(() => {
    getCurrentLocation();
    getUserCredentials();
  }, []);

  useEffect(() => {
    if (userCredentials?.userId) {
      loadTodayStatus();
      loadBreakStatus();
      loadBreakHistory();
      const interval = setInterval(refreshBreakStatus, 30000);
      return () => clearInterval(interval);
    }
  }, [userCredentials]);

  useFocusEffect(
    useCallback(() => {
      if (userCredentials?.userId) refreshBreakStatus();
    }, [userCredentials])
  );

  const getTodayDateString = () => new Date().toISOString().split('T')[0];
  const getUserSpecificKey = (baseKey: string) =>
    userCredentials?.userId ? `${baseKey}_${userCredentials.userId}` : baseKey;

  const fetchTodayStatusFromAPI = async () => {
    if (!userCredentials?.userId || !userCredentials?.password) return null;
    
    try {
      const currentDate = new Date();
      const month = currentDate.getMonth() + 1;
      const year = currentDate.getFullYear();
      const todayDateString = getTodayDateString();

      const response = await fetch(
        `https://myimc.in/flutter/attendance/monthly/?userid=${userCredentials.userId}&password=${userCredentials.password}&month=${month}&year=${year}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        const data: MonthlyAttendanceResponse = await response.json();
        
        if (data.success) {
          const todayRecord = data.attendance_records.find(
            record => record.date === todayDateString
          );

          if (todayRecord) {
            // Map the attendance record to TodayStatus format
            const todayData: TodayStatus = {
              date: todayRecord.date,
              punchIn: todayRecord.punch_in ? {
                time: todayRecord.punch_in,
                location: todayRecord.punch_in_location || 'N/A'
              } : null,
              punchOut: todayRecord.punch_out ? {
                time: todayRecord.punch_out,
                location: todayRecord.punch_out_location || 'N/A'
              } : null,
              totalHours: todayRecord.working_hours || '0h 0m',
              status: todayRecord.status,
              verified: todayRecord.verified
            };
            
            return todayData;
          } else {
            // No record for today - set default status
            return {
              date: todayDateString,
              punchIn: null,
              punchOut: null,
              totalHours: '0h 0m',
              status: 'no_record',
              verified: false
            };
          }
        }
      }
    } catch (error) {
      console.error('Error fetching today status from API:', error);
    }
    
    return null;
  };

  const loadTodayStatus = async () => {
    if (!userCredentials?.userId) return;
    
    // Load local data first
    const key = getUserSpecificKey(`punch_data_${getTodayDateString()}`);
    const raw = await AsyncStorage.getItem(key);
    const localData = raw ? JSON.parse(raw) : {};
    
    // Fetch API data
    const apiData = await fetchTodayStatusFromAPI();
    
    // Merge local and API data, giving priority to API data
    let mergedData = { ...localData };
    
    if (apiData) {
      if (apiData.punchIn && !mergedData.punchIn) {
        mergedData.punchIn = apiData.punchIn;
      }
      if (apiData.punchOut && !mergedData.punchOut) {
        mergedData.punchOut = apiData.punchOut;
      }
      // Set other properties from API
      mergedData.totalHours = apiData.totalHours;
      mergedData.status = apiData.status;
      mergedData.verified = apiData.verified;
      mergedData.date = apiData.date;
    }
    
    console.log('Merged Today Status:', mergedData);
    setTodayStatus(mergedData);
    
    const attendanceKey = getUserSpecificKey('current_attendance_id');
    setAttendanceId(await AsyncStorage.getItem(attendanceKey));
  };

  const loadBreakStatus = async () => {
    if (!userCredentials?.userId) return;
    await fetchBreakStatusFromServer();
  };

  const loadBreakHistory = async () => {
    if (!userCredentials?.userId) return;
    const historyKey = getUserSpecificKey(`break_history_${getTodayDateString()}`);
    const storedHistory = await AsyncStorage.getItem(historyKey);
    if (storedHistory) setBreakHistory(JSON.parse(storedHistory));
  };

  const saveBreakToHistory = async (breakData: any) => {
    if (!userCredentials?.userId) return;
    const historyKey = getUserSpecificKey(`break_history_${getTodayDateString()}`);
    const currentHistory = await AsyncStorage.getItem(historyKey);
    let history = currentHistory ? JSON.parse(currentHistory) : [];
    
    // Only save breaks that have valid break_id and are completed (have break_punch_out)
    if (breakData.break_id && breakData.break_punch_out) {
      const existingIndex = history.findIndex(
        (item: any) => item.break_id === breakData.break_id
      );
      
      if (existingIndex >= 0) {
        // Update existing break record
        history[existingIndex] = {
          ...history[existingIndex],
          ...breakData,
          timestamp: new Date().toISOString(),
        };
      } else {
        // Add new completed break record
        history.push({ 
          ...breakData, 
          timestamp: new Date().toISOString() 
        });
      }
      
      // Sort by timestamp (newest first)
      history.sort(
        (a: any, b: any) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      
      await AsyncStorage.setItem(historyKey, JSON.stringify(history));
      setBreakHistory(history);
    }
  };

  const fetchBreakStatusFromServer = async () => {
    if (!userCredentials?.userId || !userCredentials?.password) {
      console.log('Cannot fetch break status: Missing credentials');
      return;
    }
    
    console.log('=== FETCHING BREAK STATUS FROM SERVER ===');
    console.log('User ID:', userCredentials.userId);
    
    try {
      const response = await fetch('https://myimc.in/flutter/break-status/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userid: userCredentials.userId,
          password: userCredentials.password,
        }),
      });
      
      console.log('Break status API response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('=== BREAK STATUS API RESPONSE ===');
        console.log('Full break status data:', JSON.stringify(data, null, 2));
        console.log('Break ID:', data.break_id);
        console.log('Has active break:', data.has_active_break);
        console.log('Break punch in:', data.break_punch_in);
        console.log('Break punch out:', data.break_punch_out);
        console.log('Current break in:', data.current_break_in);
        console.log('Total breaks today:', data.total_breaks_today);
        
        // Enhanced debugging for break status
        if (data.has_active_break && !data.break_punch_in && !data.current_break_in) {
          console.warn('WARNING: has_active_break is true but no punch in time found');
        }
        
        if (data.has_active_break && data.break_punch_out) {
          console.warn('WARNING: has_active_break is true but break_punch_out exists');
        }
        
        setBreakStatus(data);
        const breakStatusKey = getUserSpecificKey(`break_status_${getTodayDateString()}`);
        await AsyncStorage.setItem(breakStatusKey, JSON.stringify(data));
        console.log('Saved break status to AsyncStorage');
        
        const breakIdKey = getUserSpecificKey('current_break_id');
        
        // More accurate break ID management
        const hasRealActiveBreak = data.has_active_break && 
                                  (data.break_punch_in || data.current_break_in) && 
                                  !data.break_punch_out;
        
        if (data.break_id && hasRealActiveBreak) {
          // Only set break ID if break is truly active
          await AsyncStorage.setItem(breakIdKey, data.break_id.toString());
          setCurrentBreakId(data.break_id.toString());
          console.log('Set active break ID:', data.break_id);
        } else {
          // Clear break ID if no active break
          await AsyncStorage.removeItem(breakIdKey);
          setCurrentBreakId(null);
          console.log('Cleared break ID - no active break');
        }
        
        // Only save to history if break is completed (has break_punch_out)
        if (data.break_punch_out) {
          console.log('Saving completed break to history');
          await saveBreakToHistory(data);
        } else {
          console.log('Break not completed yet, not saving to history');
        }
      } else {
        console.error('Break status API failed with status:', response.status);
        const errorText = await response.text();
        console.error('Error response:', errorText);
      }
    } catch (error) {
      console.error('=== BREAK STATUS FETCH ERROR ===');
      console.error('Error fetching break status:', error);
    }
  };

  const refreshBreakStatus = async () => {
    if (userCredentials?.userId && userCredentials?.password) {
      await fetchBreakStatusFromServer();
    }
  };

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
      const [uid, pwd] = await Promise.all([
        SecureStore.getItemAsync('userId'),
        SecureStore.getItemAsync('password'),
      ]);
      
      console.log('=== PUNCH CREDENTIAL CHECK ===');
      console.log('UserID:', uid);
      console.log('Password length:', pwd ? pwd.length : 'null');
      console.log('===============================');
      
      if (uid && pwd) {
        setUserCredentials({ userId: uid, password: pwd });
        console.log('Credentials set successfully in punch component');
      } else {
        console.log('No credentials found, redirecting to login');
        Alert.alert(
          'Authentication Required',
          'Please login to continue',
          [
            {
              text: 'OK',
              onPress: () => router.replace('/login')
            }
          ]
        );
      }
    } catch (error) {
      console.error('Error getting user credentials:', error);
      Alert.alert(
        'Error',
        'Unable to retrieve login credentials. Please login again.',
        [
          {
            text: 'OK',
            onPress: () => router.replace('/login')
          }
        ]
      );
    }
  };

  const makeApiCall = async (url: string, data: any) => {
    console.log('Making API call to:', url);
    console.log('With data:', { ...data, password: '[PASSWORD]' });
    
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      console.log('API Response Status:', res.status);
      
      if (res.status === 401) {
        console.error('Authentication failed - 401 error');
        Alert.alert(
          'Authentication Error', 
          'Your login session has expired. Please login again.',
          [
            {
              text: 'OK',
              onPress: async () => {
                // Clear invalid credentials
                await SecureStore.deleteItemAsync('userId');
                await SecureStore.deleteItemAsync('password');
                router.replace('/login');
              }
            }
          ]
        );
        throw new Error('Authentication failed');
      }
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('API Error:', res.status, errorText);
        throw new Error(`API Error: ${res.status} - ${errorText}`);
      }
      
      const result = await res.json();
      console.log('API call successful');
      return result;
    } catch (error) {
      console.error('API call failed:', error);
      throw error;
    }
  };

  const savePunchData = async (type: 'in' | 'out', data: any) => {
    if (!userCredentials?.userId) return;
    const key = getUserSpecificKey(`punch_data_${getTodayDateString()}`);
    let record = JSON.parse((await AsyncStorage.getItem(key)) || '{}');
    const now = new Date().toISOString();
    if (type === 'in') record.punchIn = { time: now, ...data };
    else record.punchOut = { time: now, ...data };
    await AsyncStorage.setItem(key, JSON.stringify(record));
    setTodayStatus(record);
    return record;
  };

  // Updated handlePunch with confirmation dialog
  const handlePunch = async (type: 'in' | 'out') => {
    if (!userCredentials || !currentLocation) return;

    // Haptic + animation
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (type === 'in') animatePress(punchInScale, punchInPulse, punchInPulseOpacity);
    else animatePress(punchOutScale, punchOutPulse, punchOutPulseOpacity);
    
    // Show confirmation dialog
    const confirmationTitle = type === 'in' ? 'Punch In Confirmation' : 'Punch Out Confirmation';
    const confirmationMessage = type === 'in' 
      ? 'Are you sure you want to punch in for today?' 
      : 'Are you sure you want to punch out for today?';
    
    Alert.alert(
      confirmationTitle,
      confirmationMessage,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            console.log(`${type === 'in' ? 'Punch In' : 'Punch Out'} cancelled`);
          }
        },
        {
          text: 'Confirm',
          style: 'default',
          onPress: () => {
            performPunch(type);
          }
        }
      ],
      { cancelable: true }
    );
  };

  // Separate function to perform the actual punch operation
  const performPunch = async (type: 'in' | 'out') => {
    if (!userCredentials) {
      Alert.alert('Error', 'User credentials not found. Please login again.');
      return;
    }
    
    if (!currentLocation) {
      Alert.alert('Error', 'Location not available. Please enable location services.');
      return;
    }
    
    console.log(`Starting ${type} punch operation`);
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
      
      console.log(`Punch ${type} payload:`, { 
        ...payload, 
        password: '[PASSWORD]' 
      });
      
      const endpoint = type === 'in'
        ? 'https://myimc.in/flutter/punch-in/'
        : 'https://myimc.in/flutter/punch-out/';
      
      const res = await makeApiCall(endpoint, payload);
      console.log(`Punch ${type} response:`, res);
      
      // Handle attendance ID
      if (res.attendance?.id) {
        setAttendanceId(res.attendance.id.toString());
        const attendanceKey = getUserSpecificKey('current_attendance_id');
        await AsyncStorage.setItem(attendanceKey, res.attendance.id.toString());
        console.log('Attendance ID saved:', res.attendance.id);
      } else if (type === 'out') {
        const attendanceKey = getUserSpecificKey('current_attendance_id');
        await AsyncStorage.removeItem(attendanceKey);
        setAttendanceId(null);
        console.log('Attendance ID cleared for punch out');
      }
      
      // Save punch data locally
      await savePunchData(type, payload);
      
      // 🔔 Trigger success notification
      await triggerSuccessNotification(type);
      
      Alert.alert('Success', `Punch ${type === 'in' ? 'In' : 'Out'} successful!`);
      
      // Force refresh home screen
      const refreshKey = getUserSpecificKey('force_home_refresh');
      await AsyncStorage.setItem(refreshKey, Date.now().toString());
      
      console.log(`Punch ${type} completed successfully`);
      
    } catch (error: any) {
      console.error(`Punch ${type} error:`, error);
      Alert.alert('Error', `Failed to punch ${type}: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  // FIXED: More accurate function to check if user can start a break
  const canStartBreak = () => {
    console.log('Checking break eligibility:', {
      hasPunchIn: !!todayStatus?.punchIn,
      hasPunchOut: !!todayStatus?.punchOut,
      status: todayStatus?.status,
      hasActiveBreak: breakStatus?.has_active_break,
      currentBreakId: currentBreakId,
      breakPunchIn: breakStatus?.break_punch_in,
      breakPunchOut: breakStatus?.break_punch_out,
      currentBreakIn: breakStatus?.current_break_in
    });

    // Must have punched in at least once
    if (!todayStatus?.punchIn) {
      console.log('Cannot start break: No punch in recorded');
      return false;
    }
    
    // Check if there's truly an active break:
    // An active break means:
    // 1. has_active_break is true AND
    // 2. there's a break_punch_in or current_break_in time AND 
    // 3. there's NO break_punch_out time
    const hasRealActiveBreak = breakStatus?.has_active_break && 
                              (breakStatus?.break_punch_in || breakStatus?.current_break_in) && 
                              !breakStatus?.break_punch_out;
    
    if (hasRealActiveBreak || currentBreakId) {
      console.log('Cannot start break: Already have an active break');
      return false;
    }
    
    console.log('Break is allowed');
    return true;
  };

  // Updated handleBreakPunch function with enhanced debugging
  const handleBreakPunch = async (type: 'in' | 'out') => {
    console.log(`=== BREAK ${type.toUpperCase()} ATTEMPT ===`);
    console.log('User credentials:', { 
      userId: userCredentials?.userId, 
      hasPassword: !!userCredentials?.password 
    });
    console.log('Current break status:', breakStatus);
    console.log('Current break ID:', currentBreakId);
    console.log('Can start break:', canStartBreak());
    
    if (!userCredentials?.userId || !userCredentials?.password) {
      console.log('ERROR: Missing credentials');
      Alert.alert('Error', 'User credentials not found');
      return;
    }

    // Additional validation for break in
    if (type === 'in' && !canStartBreak()) {
      const message = !todayStatus?.punchIn 
        ? 'Please punch in first before starting a break'
        : (breakStatus?.has_active_break && (breakStatus?.break_punch_in || breakStatus?.current_break_in) && !breakStatus?.break_punch_out) || currentBreakId
        ? 'You already have an active break'
        : 'Break is not available at this time';
      
      console.log('ERROR: Break validation failed:', message);
      Alert.alert('Break Not Available', message);
      return;
    }

    setIsBreakLoading(true);
    
    try {
      const payload = {
        userid: userCredentials.userId,
        password: userCredentials.password,
      };
      
      console.log(`Starting break ${type} operation with payload:`, {
        userid: payload.userid,
        password: '[HIDDEN]'
      });
      
      const endpoint = type === 'in'
        ? 'https://myimc.in/flutter/break-punch-in/'
        : 'https://myimc.in/flutter/break-punch-out/';
        
      console.log('Making API call to:', endpoint);
      
      const response = await makeApiCall(endpoint, payload);
      
      console.log(`=== BREAK ${type.toUpperCase()} API RESPONSE ===`);
      console.log('Full response:', JSON.stringify(response, null, 2));
      console.log('Response type:', typeof response);
      console.log('Response keys:', response ? Object.keys(response) : 'null');
      
      if (response) {
        // Update break status immediately
        console.log('Updating break status with response');
        setBreakStatus(response);
        
        const breakStatusKey = getUserSpecificKey(`break_status_${getTodayDateString()}`);
        await AsyncStorage.setItem(breakStatusKey, JSON.stringify(response));
        console.log('Saved break status to AsyncStorage');
        
        const breakIdKey = getUserSpecificKey('current_break_id');
        
        if (type === 'in') {
          console.log('Processing break IN response');
          console.log('Response break_id:', response.break_id);
          console.log('Response break_punch_in:', response.break_punch_in);
          console.log('Response current_break_in:', response.current_break_in);
          console.log('Response has_active_break:', response.has_active_break);
          
          // Break punch in success
          if (response.break_id) {
            await AsyncStorage.setItem(breakIdKey, response.break_id.toString());
            setCurrentBreakId(response.break_id.toString());
            console.log('Set current break ID:', response.break_id);
            
            // Check multiple possible time fields
            const breakTime = response.break_punch_in || response.current_break_in || response.break_in_time;
            console.log('Break time found:', breakTime);
            
            const message = breakTime 
              ? `Break started at ${formatTime(breakTime)}`
              : 'Break started successfully';
            Alert.alert('Success', message);
          } else {
            console.log('ERROR: No break ID in response');
            console.log('Response structure:', response);
            throw new Error('No break ID received from server');
          }
        } else {
          console.log('Processing break OUT response');
          // Break punch out success
          await AsyncStorage.removeItem(breakIdKey);
          setCurrentBreakId(null);
          console.log('Cleared break ID');
          
          const message = response.duration 
            ? `Break ended. Duration: ${response.duration}`
            : 'Break ended successfully';
          Alert.alert('Success', message);
          
          // Save completed break to history
          if (response.break_punch_out) {
            console.log('Saving break to history');
            await saveBreakToHistory(response);
          }
        }
        
        // Refresh break status after a short delay
        console.log('Scheduling break status refresh');
        setTimeout(async () => {
          console.log('Refreshing break status from server');
          await fetchBreakStatusFromServer();
        }, 1000);
        
        // Force refresh home screen
        const refreshKey = getUserSpecificKey('force_home_refresh');
        await AsyncStorage.setItem(refreshKey, Date.now().toString());
        console.log('Set home refresh flag');
        
      } else {
        console.log('ERROR: Empty response from server');
        throw new Error('No response received from server');
      }
    } catch (error: any) {
      console.error(`=== BREAK ${type.toUpperCase()} ERROR ===`);
      console.error('Error details:', error);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      
      // Provide more specific error messages
      let errorMessage = `Failed to record break ${type}`;
      
      if (error.message.includes('401')) {
        errorMessage = 'Session expired. Please login again.';
      } else if (error.message.includes('Network')) {
        errorMessage = 'Network error. Please check your connection.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      Alert.alert('Error', errorMessage);
    } finally {
      console.log(`Break ${type} operation finished, stopping loading`);
      setIsBreakLoading(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([
      loadTodayStatus(),
      refreshBreakStatus()
    ]).finally(() => setRefreshing(false));
  }, [userCredentials]);

  /* ---------- Instagram-style navigation ---------- */
  const handleTabNavigation = async (route: string) => {
    if (loadingTab) return;
    setLoadingTab(route);
    await new Promise((res) => setTimeout(res, 300));
    router.push(`/${route}`);
    setLoadingTab(null);
  };

  // FIXED formatTime function to handle different time formats
  const formatTime = (timeString?: string) => {
    if (!timeString) return 'Not recorded';
    
    try {
      // Handle different time formats
      let date;
      
      // If it's just a time string like "11:37:08"
      if (/^\d{2}:\d{2}:\d{2}$/.test(timeString)) {
        const today = new Date().toISOString().split('T')[0];
        date = new Date(`${today}T${timeString}`);
      } 
      // If it's already a full ISO string
      else if (timeString.includes('T') || timeString.includes('Z')) {
        date = new Date(timeString);
      }
      // If it's a date string
      else {
        date = new Date(timeString);
      }
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        return timeString; // Return original if can't parse
      }
      
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch (error) {
      console.error('Error formatting time:', error);
      return timeString; // Return original if error
    }
  };

  const formatLocation = (location: string | null): string => {
    if (!location) return 'N/A';
    return location;
  };

  const getWorkingStatus = () => {
    if (!todayStatus) return 'No data';
    
    switch (todayStatus.status) {
      case 'verified_full':
        return 'Work completed (Full day)';
      case 'verified_half':
        return 'Work completed (Half day)';
      case 'present':
        if (todayStatus.punchIn && !todayStatus.punchOut) {
          return 'Currently working';
        }
        return 'Present';
      case 'absent':
        return 'Absent';
      case 'leave':
        return 'On leave';
      case 'no_record':
        return 'No record';
      default:
        if (todayStatus.punchIn && !todayStatus.punchOut) {
          return 'Currently working';
        } else if (todayStatus.punchIn && todayStatus.punchOut) {
          return 'Work completed';
        }
        return 'Not started';
    }
  };

  const getStatusColor = () => {
    if (!todayStatus) return '#6c757d';
    
    switch (todayStatus.status) {
      case 'verified_full':
        return '#28a745';
      case 'verified_half':
        return '#ffc107';
      case 'present':
        return todayStatus.punchOut ? '#007bff' : '#28a745';
      case 'absent':
        return '#dc3545';
      case 'leave':
        return '#17a2b8';
      case 'no_record':
        return '#6c757d';
      default:
        if (todayStatus.punchIn && !todayStatus.punchOut) {
          return '#28a745';
        } else if (todayStatus.punchIn && todayStatus.punchOut) {
          return '#007bff';
        }
        return '#6c757d';
    }
  };

  // FIXED: Better break status text with accurate timing
  const getBreakStatusText = () => {
    if (!breakStatus) return 'Break not started';
    
    // Check if truly in progress
    const isReallyActive = breakStatus.has_active_break && 
                          (breakStatus.break_punch_in || breakStatus.current_break_in) && 
                          !breakStatus.break_punch_out;
    
    if (isReallyActive) {
      const startTime = formatTime(breakStatus.break_punch_in || breakStatus.current_break_in);
      return `Break in progress since ${startTime}`;
    }
    
    if (breakStatus.total_breaks_today > 0) {
      return `Break completed (${breakStatus.total_breaks_today} breaks today)`;
    }
    
    return 'Break not started';
  };

  // FIXED: More accurate break progress detection
  const isBreakInProgress = () => {
    if (!breakStatus) return false;
    
    // A break is truly in progress if:
    // 1. has_active_break is true AND
    // 2. there's a break_punch_in or current_break_in time AND 
    // 3. there's NO break_punch_out time
    const inProgress = breakStatus.has_active_break === true && 
                       (breakStatus.break_punch_in || breakStatus.current_break_in) && 
                       !breakStatus.break_punch_out;
    
    console.log('Break in progress check:', {
      hasActive: breakStatus.has_active_break,
      hasPunchIn: !!(breakStatus.break_punch_in || breakStatus.current_break_in),
      hasPunchOut: !!breakStatus.break_punch_out,
      result: inProgress
    });
    
    return inProgress;
  };

  const isPunchedIn = () => {
    const hasPunchIn = !!(todayStatus?.punchIn);
    const hasPunchOut = !!(todayStatus?.punchOut);
    
    console.log('Checking punch in status:', {
      todayStatus,
      hasPunchIn,
      hasPunchOut,
      result: hasPunchIn && !hasPunchOut
    });
    
    return hasPunchIn && !hasPunchOut;
  };

  const isPunchedOut = () => {
    console.log('Checking punch out status:', {
      todayStatus,
      hasPunchIn: !!todayStatus?.punchIn,
      hasPunchOut: !!todayStatus?.punchOut
    });
    return todayStatus?.punchIn && todayStatus?.punchOut;
  };

  return (
    <LinearGradient
      colors={['#FFF8E7', '#FFE5B4', '#FFD89B']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      {/* ---------- loading overlay ---------- */}
      {loadingTab && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#F4C84A" />
          <Text style={styles.loadingOverlayTxt}>Loading…</Text>
        </View>
      )}

      {/* Back Icon */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1C1C1C" />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>ATTENDANCE</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F4C84A" />
        }
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Today's Status Card */}
        <View style={styles.todayStatusCard}>
          <View style={styles.transparentCardContent}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Today's Status</Text>
              <TouchableOpacity style={styles.statusIndicator} onPress={onRefresh}>
                <Ionicons name="refresh-circle" size={24} color="#4CAF50" />
              </TouchableOpacity>
            </View>
            <Text style={styles.dateText}>
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
            <View style={styles.statusContainer}>
              <View style={styles.statusRow}>
                <View style={styles.statusLeft}>
                  <Ionicons name="log-in" size={16} color="#4CAF50" />
                  <Text style={styles.statusLabel}>Punch In:</Text>
                </View>
                <Text style={styles.statusValue}>
                  {todayStatus?.punchIn ? formatTime(todayStatus.punchIn.time) : 'Not recorded'}
                </Text>
              </View>
              <View style={styles.statusRow}>
                <View style={styles.statusLeft}>
                  <Ionicons name="location" size={16} color="#4CAF50" />
                  <Text style={styles.statusLabel}>Punch In Location:</Text>
                </View>
                <Text style={[styles.statusValue, styles.locationValue]}>
                  {todayStatus?.punchIn ? formatLocation(todayStatus.punchIn.location) : 'N/A'}
                </Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.statusRow}>
                <View style={styles.statusLeft}>
                  <Ionicons name="log-out" size={16} color="#F44336" />
                  <Text style={styles.statusLabel}>Punch Out:</Text>
                </View>
                <Text style={styles.statusValue}>
                  {todayStatus?.punchOut ? formatTime(todayStatus.punchOut.time) : 'Not punched out yet'}
                </Text>
              </View>
              <View style={styles.statusRow}>
                <View style={styles.statusLeft}>
                  <Ionicons name="location" size={16} color="#F44336" />
                  <Text style={styles.statusLabel}>Punch Out Location:</Text>
                </View>
                <Text style={[styles.statusValue, styles.locationValue]}>
                  {todayStatus?.punchOut ? formatLocation(todayStatus.punchOut.location) : 'Not punched out yet'}
                </Text>
              </View>
              
              {/* Verification Status */}
              {todayStatus?.verified && (
                <View style={styles.statusRow}>
                  <View style={styles.statusLeft}>
                    <Ionicons name="checkmark-circle" size={16} color="#28a745" />
                    <Text style={styles.statusLabel}>Verified:</Text>
                  </View>
                  <Text style={[styles.statusValue, { color: '#28a745', fontWeight: 'bold' }]}>
                    Yes
                  </Text>
                </View>
              )}
              
              <View style={styles.workingStatusContainer}>
                <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
                <Text style={[styles.workingStatus, { color: getStatusColor() }]}>
                  {getWorkingStatus()}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Main Attendance Punch */}
        <View style={styles.card}>
          <Text style={styles.cardHeading}>DAILY PUNCH</Text>
          <View style={styles.mainButtonRow}>
            {/* Punch In */}
            <View style={styles.btnWrapper}>
              <Animated.View style={[styles.pulseRing, { backgroundColor: '#4CAF50', transform: [{ scale: punchInPulse }], opacity: punchInPulseOpacity }]} />
              <Animated.View style={{ transform: [{ scale: punchInScale }] }}>
                <TouchableOpacity
                  style={[styles.mainBtn, styles.mainInBtn, isPunchedIn() && styles.disabledMainBtn]}
                  onPress={() => handlePunch('in')}
                  disabled={isLoading || isBreakLoading || isPunchedIn()}
                  activeOpacity={0.85}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" size="large" />
                  ) : (
                    <>
                      <Ionicons name="finger-print" size={40} color={isPunchedIn() ? '#999' : '#fff'} />
                      <Text style={[styles.btnText, isPunchedIn() && styles.disabledBtnText]}>Punch In</Text>
                    </>
                  )}
                </TouchableOpacity>
              </Animated.View>
            </View>
            {/* Punch Out */}
            <View style={styles.btnWrapper}>
              <Animated.View style={[styles.pulseRing, { backgroundColor: '#F44336', transform: [{ scale: punchOutPulse }], opacity: punchOutPulseOpacity }]} />
              <Animated.View style={{ transform: [{ scale: punchOutScale }] }}>
                <TouchableOpacity
                  style={[styles.mainBtn, styles.mainOutBtn, (!isPunchedIn() || isPunchedOut()) && styles.disabledMainBtn]}
                  onPress={() => handlePunch('out')}
                  disabled={isLoading || isBreakLoading || !isPunchedIn() || isPunchedOut()}
                  activeOpacity={0.85}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" size="large" />
                  ) : (
                    <>
                      <Ionicons name="finger-print" size={40} color={(!isPunchedIn() || isPunchedOut()) ? '#999' : '#fff'} />
                      <Text style={[styles.btnText, (!isPunchedIn() || isPunchedOut()) && styles.disabledBtnText]}>Punch Out</Text>
                    </>
                  )}
                </TouchableOpacity>
              </Animated.View>
            </View>
          </View>
        </View>

        {/* Break Punch Card */}
        <View style={styles.breakCard}>
          <Text style={styles.cardHeading}>BREAK PUNCH </Text>
          
          <View style={styles.buttonRow}>
            {/* Break In */}
            <View style={styles.btnWrapper}>
              <Animated.View style={{ transform: [{ scale: breakInScale }] }}>
                <TouchableOpacity
                  style={[styles.breakBtn, styles.inBtn, (isBreakInProgress() || !canStartBreak()) && styles.disabledBtn]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    Animated.sequence([
                      Animated.spring(breakInScale, { toValue: 0.88, useNativeDriver: true, speed: 50, bounciness: 0 }),
                      Animated.spring(breakInScale, { toValue: 1.06, useNativeDriver: true, speed: 20, bounciness: 10 }),
                      Animated.spring(breakInScale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }),
                    ]).start();
                    handleBreakPunch('in');
                  }}
                  disabled={isBreakLoading || isBreakInProgress() || !canStartBreak()}
                  activeOpacity={0.85}
                >
                  {isBreakLoading ? <ActivityIndicator color="#fff" size="large" /> : (
                    <>
                      <Ionicons name="finger-print" size={40} color="#fff" />
                      <Text style={styles.btnText}>Break In</Text>
                    </>
                  )}
                </TouchableOpacity>
              </Animated.View>
            </View>
            {/* Break Out */}
            <View style={styles.btnWrapper}>
              <Animated.View style={{ transform: [{ scale: breakOutScale }] }}>
                <TouchableOpacity
                  style={[styles.breakBtn, styles.outBtn, !isBreakInProgress() && styles.disabledBtn]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    Animated.sequence([
                      Animated.spring(breakOutScale, { toValue: 0.88, useNativeDriver: true, speed: 50, bounciness: 0 }),
                      Animated.spring(breakOutScale, { toValue: 1.06, useNativeDriver: true, speed: 20, bounciness: 10 }),
                      Animated.spring(breakOutScale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }),
                    ]).start();
                    handleBreakPunch('out');
                  }}
                  disabled={isBreakLoading || !isBreakInProgress()}
                  activeOpacity={0.85}
                >
                  {isBreakLoading ? <ActivityIndicator color="#fff" size="large" /> : (
                    <>
                      <Ionicons name="finger-print" size={40} color="#fff" />
                      <Text style={styles.btnText}>Break Out</Text>
                    </>
                  )}
                </TouchableOpacity>
              </Animated.View>
            </View>
          </View>
          <Text style={styles.breakStatus}>{getBreakStatusText()}</Text>
          {!canStartBreak() && (
            <Text style={styles.breakWarning}>
              {!todayStatus?.punchIn ? 'Please punch in first to start break' : 
               (breakStatus?.has_active_break && (breakStatus?.break_punch_in || breakStatus?.current_break_in) && !breakStatus?.break_punch_out) || currentBreakId ? 'You already have an active break' : 
               'Break not available'}
            </Text>
          )}
          
          {/* Break History Toggle */}
          <TouchableOpacity
            style={styles.historyToggle}
            onPress={() => setShowBreakHistory(!showBreakHistory)}
          >
            <Text style={styles.historyToggleText}>
              {showBreakHistory ? 'Hide Break History' : 'Show Break History'}
            </Text>
            <Ionicons
              name={showBreakHistory ? 'chevron-up' : 'chevron-down'}
              size={16}
              color="#87847b"
            />
          </TouchableOpacity>
          
          {/* UPDATED Break History Item Component */}
          {showBreakHistory && (
            <View style={styles.historyContainer}>
              <Text style={styles.historyTitle}>Today's Break History</Text>
              {(breakStatus?.breaks_today?.length > 0 ? breakStatus.breaks_today : breakHistory).length === 0 ? (
                <Text style={styles.noHistoryText}>No break history for today</Text>
              ) : (
                (breakStatus?.breaks_today || breakHistory).map((breakItem: any, index: number) => (
                  <View key={breakItem.break_id || index} style={styles.historyItem}>
                    <View style={styles.historyHeader}>
                      <Text style={styles.historyBreakId}>Break #{breakItem.break_id}</Text>
                      <Text style={styles.historyDate}>
                        {new Date().toLocaleDateString()}
                      </Text>
                    </View>
                    <View style={styles.historyTimes}>
                      <Text style={styles.historyTime}>
                        <Text style={styles.historyLabel}>In:</Text> {formatTime(breakItem.punch_in)}
                      </Text>
                      <Text style={styles.historyTime}>
                        <Text style={styles.historyLabel}>Out:</Text> {formatTime(breakItem.punch_out)}
                      </Text>
                    </View>
                    {breakItem.duration && (
                      <Text style={styles.historyDuration}>Duration: {breakItem.duration}</Text>
                    )}
                    <View style={styles.historyStatus}>
                      <Text
                        style={[
                          styles.historyStatusText,
                          breakItem.punch_out || !breakItem.is_active
                            ? styles.completedStatus
                            : styles.activeStatus,
                        ]}
                      >
                        {breakItem.punch_out || !breakItem.is_active ? 'Completed' : 'Active'}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingOverlayTxt: { color: '#2C2416', marginTop: 10, fontWeight: '600', fontSize: 15 },
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 24,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#2C2416',
    letterSpacing: 0.5,
  },
  scrollContainer: {
    paddingBottom: 150,
  },
  // Today's Status Card Styles
  todayStatusCard: {
    margin: 20,
    marginTop: 0,
    borderRadius: 24,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#D4A574',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  transparentCardContent: {
    paddingVertical: 24,
    paddingHorizontal: 24,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardTitle: { fontSize: 19, fontWeight: '800', color: '#2C2416', letterSpacing: 0.3 },
  statusIndicator: { padding: 4 },
  dateText: { fontSize: 14, color: '#8B7355', marginBottom: 22, fontWeight: '600', letterSpacing: 0.2 },
  statusContainer: {
    backgroundColor: 'rgba(255, 248, 231, 0.6)',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(212, 165, 116, 0.2)',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    minHeight: 38,
  },
  statusLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  statusLabel: { fontSize: 14, color: '#6B5744', fontWeight: '700', marginLeft: 10, letterSpacing: 0.1 },
  statusValue: { fontSize: 15, color: '#2C2416', fontWeight: '800', textAlign: 'right', flex: 1 },
  locationValue: { fontSize: 13, color: '#8B7355', fontWeight: '600' },
  divider: { height: 1, backgroundColor: 'rgba(212, 165, 116, 0.25)', marginVertical: 14 },
  workingStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: 'rgba(212, 165, 116, 0.25)',
  },
  statusDot: { width: 12, height: 12, borderRadius: 6, marginRight: 10, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  workingStatus: { fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  
  // Main Punch Card Styles
  card: {
    margin: 20,
    borderRadius: 24,
    padding: 28,
    shadowColor: '#D4A574',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    alignItems: 'center',
  },
  cardHeading: {
    fontSize: 17,
    fontWeight: '800',
    color: '#2C2416',
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: 0.8,
  },
  mainButtonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 36,
    width: '100%',
  },
  btnWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
  },
  mainBtn: {
    width: 130,
    height: 130,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 65,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  mainInBtn: { 
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  mainOutBtn: { 
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  disabledMainBtn: { 
    backgroundColor: 'rgba(200, 200, 200, 0.5)', 
    opacity: 0.6,
    shadowOpacity: 0.08,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  disabledBtnText: { 
    color: '#A0A0A0' 
  },
  btnText: { 
    color: '#fff', 
    fontSize: 15, 
    fontWeight: '800',
    marginTop: 6,
    letterSpacing: 0.5,
  },
  
  // Break Card Styles
  breakCard: {
    margin: 20,
    marginTop: 0,
    borderRadius: 24,
    padding: 28,
    shadowColor: '#D4A574',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
    marginBottom: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    alignItems: 'center',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 26,
    backgroundColor: 'rgba(255, 248, 231, 0.7)',
    padding: 18,
    borderRadius: 18,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(212, 165, 116, 0.2)',
  },
  timeLabel: { color: '#2C2416', fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    gap: 36,
    width: '100%',
  },
  breakBtn: {
    width: 130,
    height: 130,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 65,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  inBtn: { 
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  outBtn: { 
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  disabledBtn: { 
    backgroundColor: 'rgba(200, 200, 200, 0.5)', 
    opacity: 0.6, 
    shadowOpacity: 0.08,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  breakStatus: {
    textAlign: 'center',
    color: '#6B5744',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
    padding: 14,
    borderRadius: 14,
    letterSpacing: 0.2,
  },
  breakId: {
    textAlign: 'center',
    color: '#A0A0A0',
    fontSize: 11,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  historyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(212, 165, 116, 0.2)',
    marginTop: 18,
  },
  historyToggleText: { color: '#8B7355', fontSize: 15, fontWeight: '700', marginRight: 6, letterSpacing: 0.2 },
  historyContainer: {
    marginTop: 18,
    paddingTop: 18,
  },
  historyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#2C2416',
    textAlign: 'center',
    marginBottom: 18,
    letterSpacing: 0.3,
  },
  noHistoryText: {
    textAlign: 'center',
    color: '#8B7355',
    fontSize: 14,
    fontStyle: 'italic',
    paddingVertical: 22,
  },
  historyItem: {
    backgroundColor: 'rgba(255, 248, 231, 0.8)',
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderLeftWidth: 5,
    borderLeftColor: '#F4C84A',
    shadowColor: '#D4A574',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(212, 165, 116, 0.2)',
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  historyBreakId: { fontSize: 16, fontWeight: '800', color: '#2C2416', letterSpacing: 0.2 },
  historyDate: { fontSize: 13, color: '#8B7355', fontWeight: '600' },
  historyTimes: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(212, 165, 116, 0.15)',
  },
  historyTime: { fontSize: 14, color: '#2C2416', fontWeight: '600' },
  historyLabel: { fontWeight: '800', color: '#6B5744' },
  historyDuration: {
    fontSize: 14,
    color: '#D4A574',
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
    backgroundColor: 'rgba(244, 200, 74, 0.2)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    letterSpacing: 0.3,
  },
  historyStatus: { alignItems: 'center' },
  historyStatusText: {
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    textAlign: 'center',
    minWidth: 90,
    letterSpacing: 0.3,
  },
  completedStatus: { backgroundColor: '#D1FAE5', color: '#065F46', borderWidth: 1, borderColor: '#10B981' },
  activeStatus: { backgroundColor: '#FEF3C7', color: '#92400E', borderWidth: 1, borderColor: '#F59E0B' },
  breakWarning: {
    textAlign: 'center',
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
    paddingHorizontal: 18,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    letterSpacing: 0.2,
  }, 
  

});

export default Punch;