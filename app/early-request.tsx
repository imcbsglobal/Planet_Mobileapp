/* eslint-disable prettier/prettier */
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

interface EarlyDepartureRequestData {
  userid: string;
  password: string;
  date: string;
  early_time: string;
  reason: string;
}

interface UserCredentials {
  userid: string;
  password: string;
}

const REASON_OPTIONS = [
  'Health Emergency',
  'Medical Appointment',
  'Dependent Care',
  'Bereavement',
  'Transportation Issues',
  'Accident',
];

const EarlyDepartureRequest = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const params = route.params || {};

  // Form state
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [departureTime, setDepartureTime] = useState('');
  const [selectedReason, setSelectedReason] = useState('');

  // UI state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showReasonPicker, setShowReasonPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // User credentials state
  const [userCredentials, setUserCredentials] = useState<UserCredentials>({
    userid: '',
    password: '',
  });
  const [isLoadingCredentials, setIsLoadingCredentials] = useState(true);

  useEffect(() => {
    const loadUserCredentials = async () => {
      try {
        if (params.userid && params.password) {
          setUserCredentials({
            userid: params.userid as string,
            password: params.password as string,
          });
          setIsLoadingCredentials(false);
          return;
        }

        const storedUserid = await SecureStore.getItemAsync('userId');
        const storedPassword = await SecureStore.getItemAsync('password');

        if (storedUserid && storedPassword) {
          setUserCredentials({ userid: storedUserid, password: storedPassword });
        } else {
          Alert.alert(
            'Authentication Error',
            'User credentials not found. Please login again.',
            [{ text: 'OK', onPress: () => navigation.goBack() }]
          );
        }
      } catch (error) {
        console.error('Error loading user credentials:', error);
        Alert.alert(
          'Error',
          'Failed to load user credentials. Please try again.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } finally {
        setIsLoadingCredentials(false);
      }
    };

    loadUserCredentials();
  }, [params.userid, params.password, navigation]);

  const API_CONFIG = { baseUrl: 'https://myimc.in', timeout: 15000 };

  const formatDate = (date: Date) =>
    date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const formatDateForAPI = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const convertTimeTo24Hour = (time12h: string) => {
    const [time, modifier] = time12h.split(' ');
    let [hours, minutes] = time.split(':');
    if (hours === '12') hours = '00';
    if (modifier === 'PM' || modifier === 'pm') hours = String(parseInt(hours, 10) + 12);
    return `${String(hours).padStart(2, '0')}:${minutes}`;
  };

  const validateTimeFormat = (timeStr: string) => {
    const time12hPattern = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM|am|pm)$/;
    const time24hPattern = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return time12hPattern.test(timeStr) || time24hPattern.test(timeStr);
  };

  const handleDateChange = (event: any, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      if (event.type === 'set' && date) setSelectedDate(date);
    } else {
      if (date) setSelectedDate(date);
    }
  };

  const renderDatePicker = () => {
    if (!showDatePicker) return null;

    if (Platform.OS === 'android') {
      return (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          onChange={handleDateChange}
          minimumDate={new Date()}
        />
      );
    }

    return (
      <Modal
        visible={showDatePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowDatePicker(false)}>
          <View style={styles.bottomSheet}>
            <View style={styles.bottomSheetHandle} />
            <View style={styles.bottomSheetHeader}>
              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                <Text style={styles.bottomSheetCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.bottomSheetTitle}>Select Date</Text>
              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                <Text style={styles.bottomSheetDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display="spinner"
              onChange={handleDateChange}
              minimumDate={new Date()}
              themeVariant="light"
            />
          </View>
        </Pressable>
      </Modal>
    );
  };

  const renderReasonPicker = () => (
    <Modal
      visible={showReasonPicker}
      transparent
      animationType="slide"
      onRequestClose={() => setShowReasonPicker(false)}
    >
      <Pressable style={styles.modalOverlay} onPress={() => setShowReasonPicker(false)}>
        <View style={styles.bottomSheet}>
          <View style={styles.bottomSheetHandle} />
          <View style={styles.bottomSheetHeader}>
            <TouchableOpacity onPress={() => setShowReasonPicker(false)}>
              <Text style={styles.bottomSheetCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.bottomSheetTitle}>Select Reason</Text>
            <TouchableOpacity onPress={() => setShowReasonPicker(false)}>
              <Text style={styles.bottomSheetDone}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {REASON_OPTIONS.map((reason, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.sheetOption,
                  selectedReason === reason && styles.sheetOptionSelected,
                ]}
                onPress={() => {
                  setSelectedReason(reason);
                  setShowReasonPicker(false);
                }}
              >
                <View style={[
                  styles.sheetOptionIcon,
                  selectedReason === reason && styles.sheetOptionIconSelected,
                ]}>
                  <Ionicons
                    name={selectedReason === reason ? 'checkmark' : 'ellipse-outline'}
                    size={16}
                    color={selectedReason === reason ? '#453714' : '#7E7767'}
                  />
                </View>
                <Text style={[
                  styles.sheetOptionText,
                  selectedReason === reason && styles.sheetOptionTextSelected,
                ]}>
                  {reason}
                </Text>
              </TouchableOpacity>
            ))}
            <View style={{ height: 20 }} />
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );

  const validateForm = (): boolean => {
    if (!userCredentials.userid || !userCredentials.password) {
      Alert.alert('Authentication Error', 'User credentials not available. Please login again.');
      return false;
    }
    if (!departureTime.trim()) {
      Alert.alert('Validation Error', 'Please enter departure time');
      return false;
    }
    if (!validateTimeFormat(departureTime.trim())) {
      Alert.alert('Validation Error', 'Please enter time in correct format (e.g., 4:00 PM or 16:00)');
      return false;
    }
    if (!selectedReason) {
      Alert.alert('Validation Error', 'Please select a reason for early departure');
      return false;
    }
    return true;
  };

  const submitEarlyDepartureRequest = async () => {
    if (!validateForm()) return;
    setIsSubmitting(true);

    try {
      let formattedTime = departureTime.trim();
      if (
        formattedTime.includes('AM') || formattedTime.includes('PM') ||
        formattedTime.includes('am') || formattedTime.includes('pm')
      ) {
        formattedTime = convertTimeTo24Hour(formattedTime);
      }

      const requestData: EarlyDepartureRequestData = {
        userid: userCredentials.userid,
        password: userCredentials.password,
        date: formatDateForAPI(selectedDate),
        early_time: formattedTime,
        reason: selectedReason,
      };

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), API_CONFIG.timeout)
      );

      const fetchPromise = fetch(`${API_CONFIG.baseUrl}/flutter/early/create/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(requestData),
      });

      const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText || 'Unknown error'}`);
      }

      const result = await response.json();

      if (result.success) {
        Alert.alert(
          'Success',
          result.message || 'Early departure request submitted successfully!',
          [{
            text: 'OK',
            onPress: () => {
              setSelectedDate(new Date());
              setDepartureTime('');
              setSelectedReason('');
              navigation.goBack();
            },
          }]
        );
      } else {
        throw new Error(result.message || 'Request failed');
      }
    } catch (error) {
      let errorMessage = 'An unexpected error occurred. Please try again.';
      if (error instanceof Error) {
        if (error.message === 'Request timeout') errorMessage = 'Request timed out. Please check your internet connection.';
        else if (error.message.includes('Network request failed')) errorMessage = 'Network connection failed. Please check your internet connection.';
        else if (error.message.includes('HTTP 401')) errorMessage = 'Authentication failed. Please login again.';
        else if (error.message.includes('HTTP 403')) errorMessage = 'Access denied. You may not have permission to submit early departure requests.';
        else if (error.message.includes('HTTP 4')) errorMessage = 'Invalid request. Please check your details and try again.';
        else if (error.message.includes('HTTP 5')) errorMessage = 'Server error. Please try again later.';
        else errorMessage = error.message;
      }
      Alert.alert('Submission Failed', errorMessage, [
        { text: 'Retry', onPress: submitEarlyDepartureRequest },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    const hasChanges =
      selectedReason !== '' ||
      departureTime.trim() !== '' ||
      selectedDate.toDateString() !== new Date().toDateString();

    if (hasChanges) {
      Alert.alert(
        'Discard Changes',
        'You have unsaved changes. Are you sure you want to close?',
        [
          { text: 'Continue Editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
        ]
      );
    } else {
      navigation.goBack();
    }
  };

  if (isLoadingCredentials) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#F5C451" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!userCredentials.userid || !userCredentials.password) {
    return (
      <View style={styles.errorScreen}>
        <View style={styles.errorIconWrap}>
          <Ionicons name="warning-outline" size={32} color="#D4A574" />
        </View>
        <Text style={styles.errorTitle}>Authentication Required</Text>
        <Text style={styles.errorMessage}>
          Please login to submit early departure requests.
        </Text>
        <TouchableOpacity style={styles.errorButton} onPress={() => navigation.goBack()}>
          <Text style={styles.errorButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleClose}>
          <Ionicons name="arrow-back" size={20} color="#1C1B17" />
        </TouchableOpacity>
        <View>
          <Text style={styles.pageLabelSmall}>FORM</Text>
          <Text style={styles.pageTitle}>Early Request</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Banner */}
        <View style={styles.heroBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroLabel}>NOTIFY YOUR TEAM</Text>
            <Text style={styles.heroTitle}>Leaving{'\n'}early?</Text>
          </View>
          <View style={styles.heroIconWrap}>
            <Ionicons name="exit" size={32} color="#F5C451" />
          </View>
          <View style={styles.heroDecoration} />
        </View>

        {/* Form Card */}
        <View style={styles.formCard}>

          {/* Date Field */}
          <Text style={styles.sectionCardTitle}>DETAILS</Text>

          <TouchableOpacity
            style={styles.inputRow}
            onPress={() => setShowDatePicker(true)}
            activeOpacity={0.7}
          >
            <View style={styles.inputIconWrap}>
              <Ionicons name="calendar-outline" size={20} color="#D4A574" />
            </View>
            <View style={styles.inputTextGroup}>
              <Text style={styles.inputFieldLabel}>DATE</Text>
              <Text style={styles.inputValue}>{formatDate(selectedDate)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#7E7767" />
          </TouchableOpacity>

          <View style={styles.fieldDivider} />

          {/* Departure Time Field */}
          <View style={styles.inputRow}>
            <View style={styles.inputIconWrap}>
              <Ionicons name="time-outline" size={20} color="#D4A574" />
            </View>
            <View style={styles.inputTextGroup}>
              <Text style={styles.inputFieldLabel}>DEPARTURE TIME</Text>
              <TextInput
                style={styles.textInput}
                value={departureTime}
                onChangeText={setDepartureTime}
                placeholder="e.g., 4:00 PM or 16:00"
                placeholderTextColor="#B5B0A4"
              />
            </View>
          </View>

          <View style={styles.fieldDivider} />

          {/* Reason Field */}
          <TouchableOpacity
            style={styles.inputRow}
            onPress={() => setShowReasonPicker(true)}
            activeOpacity={0.7}
          >
            <View style={styles.inputIconWrap}>
              <Ionicons name="document-text-outline" size={20} color="#D4A574" />
            </View>
            <View style={styles.inputTextGroup}>
              <Text style={styles.inputFieldLabel}>REASON</Text>
              <Text style={[styles.inputValue, !selectedReason && styles.inputPlaceholder]}>
                {selectedReason || 'Select reason for early departure'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#7E7767" />
          </TouchableOpacity>
        </View>

        {/* Helper text */}
        <Text style={styles.helperText}>
          Enter time in 12-hour (4:00 PM) or 24-hour format (16:00)
        </Text>

        {/* Selected reason badge */}
        {selectedReason ? (
          <View style={styles.selectedBadge}>
            <Ionicons name="checkmark-circle" size={16} color="#D4A574" />
            <Text style={styles.selectedBadgeText}>{selectedReason}</Text>
            <TouchableOpacity onPress={() => setSelectedReason('')}>
              <Ionicons name="close-circle" size={16} color="#7E7767" />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={submitEarlyDepartureRequest}
          disabled={isSubmitting}
          activeOpacity={0.85}
        >
          {isSubmitting ? (
            <View style={styles.submitRow}>
              <ActivityIndicator size="small" color="#453714" />
              <Text style={styles.submitText}>Submitting...</Text>
            </View>
          ) : (
            <View style={styles.submitRow}>
              <Ionicons name="send" size={18} color="#453714" />
              <Text style={styles.submitText}>Submit Request</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {renderDatePicker()}
      {renderReasonPicker()}
    </View>
  );
};

export default EarlyDepartureRequest;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  loadingScreen: {
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
  errorScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAF9F6',
    padding: 40,
  },
  errorIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FEF8E7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1C1B17',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#7E7767',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 20,
  },
  errorButton: {
    backgroundColor: '#1C1B17',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 50,
  },
  errorButtonText: {
    color: '#F5C451',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // Header
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
  pageLabelSmall: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7E7767',
    letterSpacing: 1.4,
    marginBottom: 2,
    textAlign: 'center',
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1B17',
    letterSpacing: -0.5,
    textAlign: 'center',
  },

  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },

  // Hero Banner
  heroBanner: {
    backgroundColor: '#1C1B17',
    borderRadius: 40,
    padding: 40,
    marginBottom: 24,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.08,
    shadowRadius: 40,
    elevation: 8,
  },
  heroLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#F5C451',
    letterSpacing: 3.2,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 34,
  },
  heroIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(245, 196, 81, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  heroDecoration: {
    position: 'absolute',
    top: -48,
    right: -48,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(245, 196, 81, 0.05)',
  },

  // Form Card
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    paddingHorizontal: 20,
    paddingBottom: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.06,
    shadowRadius: 40,
    elevation: 6,
  },
  sectionCardTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7E7767',
    letterSpacing: 2,
    paddingTop: 18,
    paddingBottom: 12,
  },
  fieldDivider: {
    height: 1,
    backgroundColor: '#F2F0E9',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  inputIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FEF8E7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputTextGroup: {
    flex: 1,
  },
  inputFieldLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#B5B0A4',
    letterSpacing: 1.5,
    marginBottom: 3,
  },
  inputValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1B17',
  },
  inputPlaceholder: {
    color: '#B5B0A4',
    fontWeight: '400',
  },
  textInput: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1B17',
    paddingVertical: 0,
  },

  // Helper text
  helperText: {
    fontSize: 11,
    color: '#B5B0A4',
    fontStyle: 'italic',
    marginBottom: 16,
    paddingHorizontal: 4,
  },

  // Selected reason badge
  selectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF8E7',
    borderRadius: 50,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 20,
    alignSelf: 'flex-start',
  },
  selectedBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1B17',
    flex: 1,
  },

  // Submit Button
  submitButton: {
    backgroundColor: '#F5C451',
    borderRadius: 50,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F5C451',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#E5E0D4',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  submitText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#453714',
  },

  // Bottom Sheet (Modal)
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '70%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 12,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E0D4',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  bottomSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F0E9',
    marginBottom: 8,
  },
  bottomSheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C1B17',
  },
  bottomSheetCancel: {
    fontSize: 14,
    color: '#7E7767',
    fontWeight: '600',
  },
  bottomSheetDone: {
    fontSize: 14,
    color: '#D4A574',
    fontWeight: '700',
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginBottom: 4,
  },
  sheetOptionSelected: {
    backgroundColor: '#FEF8E7',
  },
  sheetOptionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F2F0E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetOptionIconSelected: {
    backgroundColor: '#F5C451',
  },
  sheetOptionText: {
    fontSize: 15,
    color: '#1C1B17',
    fontWeight: '500',
    flex: 1,
  },
  sheetOptionTextSelected: {
    fontWeight: '700',
  },
});