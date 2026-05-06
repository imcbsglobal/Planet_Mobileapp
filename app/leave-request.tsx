/* eslint-disable prettier/prettier */
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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

interface LeaveRequestData {
  userid: string;
  password: string;
  start_date: string;
  end_date: string;
  leave_type: string;
  reason: string;
  note: string;
}

interface UserCredentials {
  userid: string;
  password: string;
}

const LeaveRequest = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const params = route.params || {};

  // Form state
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [leaveType, setLeaveType] = useState('full_day');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  // UI state
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showLeaveTypeModal, setShowLeaveTypeModal] = useState(false);
  const [showReasonModal, setShowReasonModal] = useState(false);
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

  const leaveTypeOptions = [
    { label: 'Full Day', value: 'full_day' },
    { label: 'Half Day - Morning', value: 'half_day_morning' },
    { label: 'Half Day - Evening', value: 'half_day_evening' },
    { label: 'Hourly', value: 'hourly' },
  ];

  const reasonOptions = [
    { label: 'Medical Appointment', value: 'medical_appointment' },
    { label: 'Bereavement Leave', value: 'bereavement_leave' },
    { label: 'Family Event', value: 'personal_family_event' },
    { label: 'Health Emergency', value: 'health_emergency' },
    { label: 'Dependent Care', value: 'dependent_care' },
  ];

  const formatDate = (date: Date): string => date.toISOString().split('T')[0];

  const formatDisplayDate = (date: Date): string =>
    date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const getDurationDays = () =>
    Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const handleStartDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowStartDatePicker(false);
      if (event.type === 'set' && selectedDate) {
        setStartDate(selectedDate);
        if (selectedDate > endDate) setEndDate(selectedDate);
      }
    } else {
      if (selectedDate) {
        setStartDate(selectedDate);
        if (selectedDate > endDate) setEndDate(selectedDate);
      }
    }
  };

  const handleEndDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowEndDatePicker(false);
      if (event.type === 'set' && selectedDate) {
        if (selectedDate >= startDate) setEndDate(selectedDate);
        else Alert.alert('Invalid Date', 'End date cannot be before start date');
      }
    } else {
      if (selectedDate) {
        if (selectedDate >= startDate) setEndDate(selectedDate);
        else Alert.alert('Invalid Date', 'End date cannot be before start date');
      }
    }
  };

  const renderDatePicker = (
    isVisible: boolean,
    value: Date,
    onChange: (event: any, date?: Date) => void,
    minimumDate: Date,
    title: string,
    onClose: () => void
  ) => {
    if (!isVisible) return null;

    if (Platform.OS === 'android') {
      return (
        <DateTimePicker
          value={value}
          mode="date"
          display="default"
          onChange={onChange}
          minimumDate={minimumDate}
        />
      );
    }

    return (
      <Modal visible={isVisible} transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={styles.modalOverlay} onPress={onClose}>
          <View style={styles.bottomSheet}>
            <View style={styles.bottomSheetHandle} />
            <View style={styles.bottomSheetHeader}>
              <TouchableOpacity onPress={onClose}>
                <Text style={styles.bottomSheetCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.bottomSheetTitle}>{title}</Text>
              <TouchableOpacity onPress={onClose}>
                <Text style={styles.bottomSheetDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={value}
              mode="date"
              display="spinner"
              onChange={onChange}
              minimumDate={minimumDate}
              themeVariant="light"
            />
          </View>
        </Pressable>
      </Modal>
    );
  };

  const validateForm = (): boolean => {
    if (!userCredentials.userid || !userCredentials.password) {
      Alert.alert('Authentication Error', 'User credentials not available. Please login again.');
      return false;
    }
    if (startDate > endDate) {
      Alert.alert('Validation Error', 'End date must be after or equal to start date');
      return false;
    }
    if (!reason) {
      Alert.alert('Validation Error', 'Please select a reason for leave');
      return false;
    }
    return true;
  };

  const submitLeaveRequest = async () => {
    if (!validateForm()) return;
    setIsSubmitting(true);

    const selectedReason = reasonOptions.find(o => o.value === reason);
    const requestData: LeaveRequestData = {
      userid: userCredentials.userid,
      password: userCredentials.password,
      start_date: formatDate(startDate),
      end_date: formatDate(endDate),
      leave_type: leaveType,
      reason: selectedReason?.label || reason,
      note: note.trim(),
    };

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), API_CONFIG.timeout)
    );

    try {
      const fetchPromise = fetch(`${API_CONFIG.baseUrl}/flutter/leave/create/`, {
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
        Alert.alert('Success', result.message || 'Leave request submitted successfully!', [{
          text: 'OK',
          onPress: () => {
            setStartDate(new Date());
            setEndDate(new Date());
            setLeaveType('full_day');
            setReason('');
            setNote('');
            navigation.goBack();
          },
        }]);
      } else {
        throw new Error(result.message || 'Request failed');
      }
    } catch (error) {
      let errorMessage = 'An unexpected error occurred. Please try again.';
      if (error instanceof Error) {
        if (error.message === 'Request timeout') errorMessage = 'Request timed out. Please check your internet connection.';
        else if (error.message.includes('Network request failed')) errorMessage = 'Network connection failed. Please check your internet connection.';
        else if (error.message.includes('HTTP 401')) errorMessage = 'Authentication failed. Please login again.';
        else if (error.message.includes('HTTP 403')) errorMessage = 'Access denied. You may not have permission to submit leave requests.';
        else if (error.message.includes('HTTP 4')) errorMessage = 'Invalid request. Please check your details and try again.';
        else if (error.message.includes('HTTP 5')) errorMessage = 'Server error. Please try again later.';
        else errorMessage = error.message;
      }
      Alert.alert('Submission Failed', errorMessage, [
        { text: 'Retry', onPress: submitLeaveRequest },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    const hasChanges =
      reason !== '' ||
      note !== '' ||
      startDate.toDateString() !== new Date().toDateString() ||
      endDate.toDateString() !== new Date().toDateString() ||
      leaveType !== 'full_day';

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
        <Text style={styles.errorMessage}>Please login to submit leave requests.</Text>
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
          <Text style={styles.pageTitle}>Leave Request</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero Banner */}
          <View style={styles.heroBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroLabel}>PLAN YOUR TIME OFF</Text>
              <Text style={styles.heroTitle}>Request{'\n'}a leave</Text>
            </View>
            <View style={styles.heroIconWrap}>
              <Ionicons name="sunny" size={32} color="#F5C451" />
            </View>
            <View style={styles.heroDecoration} />
          </View>

          {/* Duration Pill */}
          <View style={styles.durationPill}>
            <Ionicons name="time-outline" size={16} color="#D4A574" />
            <Text style={styles.durationText}>
              Duration: <Text style={styles.durationBold}>{getDurationDays()} day{getDurationDays() !== 1 ? 's' : ''}</Text>
            </Text>
          </View>

          {/* Dates Card */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionCardTitle}>DATE RANGE</Text>

            {/* Start Date */}
            <TouchableOpacity
              style={styles.inputRow}
              onPress={() => setShowStartDatePicker(true)}
              activeOpacity={0.7}
            >
              <View style={styles.inputIconWrap}>
                <Ionicons name="calendar-outline" size={20} color="#D4A574" />
              </View>
              <View style={styles.inputTextGroup}>
                <Text style={styles.inputFieldLabel}>START DATE</Text>
                <Text style={styles.inputValue}>{formatDisplayDate(startDate)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#7E7767" />
            </TouchableOpacity>

            <View style={styles.fieldDivider} />

            {/* End Date */}
            <TouchableOpacity
              style={styles.inputRow}
              onPress={() => setShowEndDatePicker(true)}
              activeOpacity={0.7}
            >
              <View style={styles.inputIconWrap}>
                <Ionicons name="calendar" size={20} color="#D4A574" />
              </View>
              <View style={styles.inputTextGroup}>
                <Text style={styles.inputFieldLabel}>END DATE</Text>
                <Text style={styles.inputValue}>{formatDisplayDate(endDate)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#7E7767" />
            </TouchableOpacity>
          </View>

          {/* Details Card */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionCardTitle}>LEAVE DETAILS</Text>

            {/* Leave Type */}
            <TouchableOpacity
              style={styles.inputRow}
              onPress={() => setShowLeaveTypeModal(true)}
              activeOpacity={0.7}
            >
              <View style={styles.inputIconWrap}>
                <Ionicons name="layers-outline" size={20} color="#D4A574" />
              </View>
              <View style={styles.inputTextGroup}>
                <Text style={styles.inputFieldLabel}>LEAVE TYPE</Text>
                <Text style={styles.inputValue}>
                  {leaveTypeOptions.find(o => o.value === leaveType)?.label}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#7E7767" />
            </TouchableOpacity>

            <View style={styles.fieldDivider} />

            {/* Reason */}
            <TouchableOpacity
              style={styles.inputRow}
              onPress={() => setShowReasonModal(true)}
              activeOpacity={0.7}
            >
              <View style={styles.inputIconWrap}>
                <Ionicons name="document-text-outline" size={20} color="#D4A574" />
              </View>
              <View style={styles.inputTextGroup}>
                <Text style={styles.inputFieldLabel}>REASON</Text>
                <Text style={[styles.inputValue, !reason && styles.inputPlaceholder]}>
                  {reason
                    ? reasonOptions.find(o => o.value === reason)?.label
                    : 'Select reason for leave'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#7E7767" />
            </TouchableOpacity>
          </View>

          {/* Note Card */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionCardTitle}>ADDITIONAL NOTE</Text>
            <View style={styles.noteInputWrap}>
              <TextInput
                style={styles.noteInput}
                multiline
                numberOfLines={4}
                placeholder="Add any additional information about your leave request..."
                placeholderTextColor="#B5B0A4"
                value={note}
                onChangeText={setNote}
                maxLength={500}
                textAlignVertical="top"
              />
            </View>
            <Text style={styles.characterCount}>{note.length}/500</Text>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={submitLeaveRequest}
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
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Date Pickers */}
      {renderDatePicker(
        showStartDatePicker, startDate, handleStartDateChange,
        new Date(), 'Select Start Date', () => setShowStartDatePicker(false)
      )}
      {renderDatePicker(
        showEndDatePicker, endDate, handleEndDateChange,
        startDate, 'Select End Date', () => setShowEndDatePicker(false)
      )}

      {/* Leave Type Bottom Sheet */}
      <Modal
        visible={showLeaveTypeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLeaveTypeModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowLeaveTypeModal(false)}>
          <View style={styles.bottomSheet}>
            <View style={styles.bottomSheetHandle} />
            <View style={styles.bottomSheetHeader}>
              <TouchableOpacity onPress={() => setShowLeaveTypeModal(false)}>
                <Text style={styles.bottomSheetCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.bottomSheetTitle}>Leave Type</Text>
              <TouchableOpacity onPress={() => setShowLeaveTypeModal(false)}>
                <Text style={styles.bottomSheetDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {leaveTypeOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.sheetOption,
                    leaveType === option.value && styles.sheetOptionSelected,
                  ]}
                  onPress={() => {
                    setLeaveType(option.value);
                    setShowLeaveTypeModal(false);
                  }}
                >
                  <View style={[
                    styles.sheetOptionIcon,
                    leaveType === option.value && styles.sheetOptionIconSelected,
                  ]}>
                    <Ionicons
                      name={leaveType === option.value ? 'checkmark' : 'ellipse-outline'}
                      size={16}
                      color={leaveType === option.value ? '#453714' : '#7E7767'}
                    />
                  </View>
                  <Text style={[
                    styles.sheetOptionText,
                    leaveType === option.value && styles.sheetOptionTextSelected,
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Reason Bottom Sheet */}
      <Modal
        visible={showReasonModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowReasonModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowReasonModal(false)}>
          <View style={styles.bottomSheet}>
            <View style={styles.bottomSheetHandle} />
            <View style={styles.bottomSheetHeader}>
              <TouchableOpacity onPress={() => setShowReasonModal(false)}>
                <Text style={styles.bottomSheetCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.bottomSheetTitle}>Reason</Text>
              <TouchableOpacity onPress={() => setShowReasonModal(false)}>
                <Text style={styles.bottomSheetDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {reasonOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.sheetOption,
                    reason === option.value && styles.sheetOptionSelected,
                  ]}
                  onPress={() => {
                    setReason(option.value);
                    setShowReasonModal(false);
                  }}
                >
                  <View style={[
                    styles.sheetOptionIcon,
                    reason === option.value && styles.sheetOptionIconSelected,
                  ]}>
                    <Ionicons
                      name={reason === option.value ? 'checkmark' : 'ellipse-outline'}
                      size={16}
                      color={reason === option.value ? '#453714' : '#7E7767'}
                    />
                  </View>
                  <Text style={[
                    styles.sheetOptionText,
                    reason === option.value && styles.sheetOptionTextSelected,
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

export default LeaveRequest;

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
    paddingBottom: 100,
  },

  // Hero Banner
  heroBanner: {
    backgroundColor: '#1C1B17',
    borderRadius: 40,
    padding: 40,
    marginBottom: 16,
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

  // Duration pill
  durationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF8E7',
    borderRadius: 50,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  durationText: {
    fontSize: 13,
    color: '#7E7767',
    fontWeight: '500',
  },
  durationBold: {
    color: '#1C1B17',
    fontWeight: '700',
  },

  // Section Cards
  sectionCard: {
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

  // Note input
  noteInputWrap: {
    backgroundColor: '#FAF9F6',
    borderRadius: 16,
    padding: 4,
    marginBottom: 4,
  },
  noteInput: {
    fontSize: 14,
    color: '#1C1B17',
    minHeight: 90,
    paddingHorizontal: 12,
    paddingVertical: 12,
    lineHeight: 22,
  },
  characterCount: {
    fontSize: 11,
    color: '#B5B0A4',
    textAlign: 'right',
    paddingBottom: 12,
    fontWeight: '500',
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