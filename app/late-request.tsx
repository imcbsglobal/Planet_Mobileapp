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

interface LateRequestData {
  userid: string;
  password: string;
  date: string;
  delay_time: string;
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

const LateRequest = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const params = route.params || {};

  // Form state
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [delayTime, setDelayTime] = useState('');
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

  const formatDateForAPI = (date: Date) => date.toISOString().split('T')[0];

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      if (event.type === 'set' && selectedDate) setSelectedDate(selectedDate);
    } else {
      if (selectedDate) setSelectedDate(selectedDate);
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
    } else {
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
    }
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
          <ScrollView style={styles.reasonList} showsVerticalScrollIndicator={false}>
            {REASON_OPTIONS.map((reason, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.reasonOption,
                  selectedReason === reason && styles.reasonOptionSelected,
                ]}
                onPress={() => {
                  setSelectedReason(reason);
                  setShowReasonPicker(false);
                }}
              >
                <View style={[
                  styles.reasonIconWrap,
                  selectedReason === reason && styles.reasonIconWrapSelected,
                ]}>
                  <Ionicons
                    name={selectedReason === reason ? 'checkmark' : 'ellipse-outline'}
                    size={16}
                    color={selectedReason === reason ? '#453714' : '#7E7767'}
                  />
                </View>
                <Text style={[
                  styles.reasonOptionText,
                  selectedReason === reason && styles.reasonOptionTextSelected,
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
    if (!delayTime.trim()) {
      Alert.alert('Validation Error', 'Please enter delay time');
      return false;
    }
    if (!selectedReason) {
      Alert.alert('Validation Error', 'Please select a reason for late arrival');
      return false;
    }
    return true;
  };

  const submitLateRequest = async () => {
    if (!validateForm()) return;
    setIsSubmitting(true);

    const requestData: LateRequestData = {
      userid: userCredentials.userid,
      password: userCredentials.password,
      date: formatDateForAPI(selectedDate),
      delay_time: delayTime.trim(),
      reason: selectedReason,
    };

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), API_CONFIG.timeout)
    );

    try {
      const fetchPromise = fetch(`${API_CONFIG.baseUrl}/flutter/late/create/`, {
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
          result.message || 'Late request submitted successfully!',
          [{
            text: 'OK',
            onPress: () => {
              setSelectedDate(new Date());
              setDelayTime('');
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
        if (error.message === 'Request timeout') {
          errorMessage = 'Request timed out. Please check your internet connection.';
        } else if (error.message.includes('Network request failed')) {
          errorMessage = 'Network connection failed. Please check your internet connection.';
        } else if (error.message.includes('HTTP 401')) {
          errorMessage = 'Authentication failed. Please login again.';
        } else if (error.message.includes('HTTP 403')) {
          errorMessage = 'Access denied. You may not have permission to submit late requests.';
        } else if (error.message.includes('HTTP 4')) {
          errorMessage = 'Invalid request. Please check your details and try again.';
        } else if (error.message.includes('HTTP 5')) {
          errorMessage = 'Server error. Please try again later.';
        } else {
          errorMessage = error.message;
        }
      }
      Alert.alert('Submission Failed', errorMessage, [
        { text: 'Retry', onPress: submitLateRequest },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    const hasChanges =
      selectedReason !== '' ||
      delayTime.trim() !== '' ||
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
        <Text style={styles.errorMessage}>Please login to submit late requests.</Text>
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
        <View style={styles.headerCenter}>
          <Text style={styles.pageLabelSmall}>FORM</Text>
          <Text style={styles.pageTitle}>Late Request</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Banner */}
        <View style={styles.heroBanner}>
          <View>
            <Text style={styles.heroLabel}>NOTIFY YOUR TEAM</Text>
            <Text style={styles.heroTitle}>Running{'\n'}late?</Text>
          </View>
          <View style={styles.heroIconWrap}>
            <Ionicons name="time" size={32} color="#F5C451" />
          </View>
          <View style={styles.heroDecoration} />
        </View>

        {/* Form Card */}
        <View style={styles.formCard}>

          {/* Date Field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>DATE</Text>
            <TouchableOpacity
              style={styles.inputRow}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.7}
            >
              <View style={styles.inputIconWrap}>
                <Ionicons name="calendar-outline" size={20} color="#D4A574" />
              </View>
              <Text style={styles.inputValue}>{formatDate(selectedDate)}</Text>
              <Ionicons name="chevron-forward" size={18} color="#7E7767" />
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.fieldDivider} />

          {/* Delay Time Field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>DELAY TIME</Text>
            <View style={styles.inputRow}>
              <View style={styles.inputIconWrap}>
                <Ionicons name="hourglass-outline" size={20} color="#D4A574" />
              </View>
              <TextInput
                style={styles.textInput}
                value={delayTime}
                onChangeText={setDelayTime}
                placeholder="e.g., 10 minutes, 1 hour"
                placeholderTextColor="#B5B0A4"
                maxLength={50}
              />
            </View>
          </View>

          {/* Divider */}
          <View style={styles.fieldDivider} />

          {/* Reason Field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>REASON</Text>
            <TouchableOpacity
              style={styles.inputRow}
              onPress={() => setShowReasonPicker(true)}
              activeOpacity={0.7}
            >
              <View style={styles.inputIconWrap}>
                <Ionicons name="document-text-outline" size={20} color="#D4A574" />
              </View>
              <Text style={[styles.inputValue, !selectedReason && styles.inputPlaceholder]}>
                {selectedReason || 'Select reason for late arrival'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color="#7E7767" />
            </TouchableOpacity>
          </View>
        </View>

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
          onPress={submitLateRequest}
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

export default LateRequest;

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
  headerCenter: {
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

  // Hero Banner — matches home heroCard style
  heroBanner: {
    backgroundColor: '#1C1B17',
    borderRadius: 40,
    padding: 40,
    marginBottom: 24,
    overflow: 'hidden',
    flexDirection: 'row',
    justifyContent: 'space-between',
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

  // Form Card — matches moduleCard style
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    paddingVertical: 8,
    paddingHorizontal: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.06,
    shadowRadius: 40,
    elevation: 6,
  },
  fieldGroup: {
    paddingVertical: 18,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7E7767',
    letterSpacing: 2,
    marginBottom: 12,
  },
  fieldDivider: {
    height: 1,
    backgroundColor: '#F2F0E9',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  inputIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FEF8E7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1B17',
  },
  inputPlaceholder: {
    color: '#B5B0A4',
    fontWeight: '400',
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1B17',
    paddingVertical: 0, // remove default padding on Android
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

  // Submit button — matches heroPunchButton
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
  reasonList: {
    maxHeight: 320,
  },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginBottom: 4,
  },
  reasonOptionSelected: {
    backgroundColor: '#FEF8E7',
  },
  reasonIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F2F0E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reasonIconWrapSelected: {
    backgroundColor: '#F5C451',
  },
  reasonOptionText: {
    fontSize: 15,
    color: '#1C1B17',
    fontWeight: '500',
    flex: 1,
  },
  reasonOptionTextSelected: {
    fontWeight: '700',
    color: '#1C1B17',
  },
});