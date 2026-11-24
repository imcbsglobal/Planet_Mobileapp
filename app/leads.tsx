/* eslint-disable prettier/prettier */
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
} from 'expo-audio';
import * as Location from 'expo-location';
import { buildImageFormPart, captureImageWithCamera, pickImageFromGallery, prepareImageAsset, PreparedImageAsset } from '../lib/imageUpload';
import * as SecureStore from '../lib/secureStore';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

interface EnquiryForm {
  ownerName: string;
  shopName: string;
  location: string;
  phoneNumber: string;
  purpose: string;
  notes: string;
  latitude: string | null;
  longitude: string | null;
}

const PURPOSE_OPTIONS = [
  'Software Enquiry',
  'Hardware Enquiry',
  'Both',
  'Other',
];

const initialForm: EnquiryForm = {
  ownerName: '',
  shopName: '',
  location: '',
  phoneNumber: '',
  purpose: '',
  notes: '',
  latitude: null,
  longitude: null,
};

const getFileName = (uri: string, fallbackName: string) => {
  const cleanUri = uri.split('?')[0];
  return cleanUri.split('/').pop() || fallbackName;
};

const getAudioMimeType = (fileName: string) => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'mp3') return 'audio/mpeg';
  if (extension === 'wav') return 'audio/wav';
  if (extension === 'caf') return 'audio/x-caf';
  if (extension === 'mp4') return 'audio/mp4';
  return 'audio/mp4';
};

const normalizeFileUri = (uri: string) => (
  Platform.OS === 'android' ? uri : uri.replace('file://', '')
);

export default function Leads() {
  const navigation = useNavigation();

  const [form, setForm] = useState<EnquiryForm>(initialForm);
  const [detecting, setDetecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPurposeOptions, setShowPurposeOptions] = useState(false);
  const [createdBy, setCreatedBy] = useState<string>('anonymous');

  // Attachments
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoAsset, setPhotoAsset] = useState<PreparedImageAsset | null>(null);

  // Voice note
  const [voiceUri, setVoiceUri] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [playingVoice, setPlayingVoice] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const player = useAudioPlayer(voiceUri);
  const playerStatus = useAudioPlayerStatus(player);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const name = await SecureStore.getItemAsync('username');
        console.log('Loaded username from SecureStore:', name);
        if (name) setCreatedBy(name);
      } catch (e) {
        console.error('Failed to read username:', e);
      }
    };
    loadUser();
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const updateField = (key: keyof EnquiryForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // ── Location ──────────────────────────────────────────────────────────────────
  const handleDetectLocation = async () => {
    setDetecting(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location Permission Needed', 'Please allow location access to auto-detect your address.');
        setDetecting(false);
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = position.coords;
      let readableAddress = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      try {
        const geocoded = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geocoded && geocoded.length > 0) {
          const place = geocoded[0];
          const parts = [place.city || place.subregion, place.region, place.country].filter(Boolean);
          if (parts.length > 0) readableAddress = parts.join(', ');
        }
      } catch (geoError) {
        console.error('Reverse geocode failed:', geoError);
      }
      setForm((prev) => ({
        ...prev,
        location: readableAddress,
        latitude: parseFloat(latitude.toFixed(6)).toString(),
        longitude: parseFloat(longitude.toFixed(6)).toString(),
      }));
    } catch (error) {
      console.error('Location detection failed:', error);
      Alert.alert('Error', 'Could not detect your location. Please enter it manually.');
    } finally {
      setDetecting(false);
    }
  };

  const applyPickedImage = async (asset: Awaited<ReturnType<typeof pickImageFromGallery>>) => {
    if (!asset) return;
    const prepared = await prepareImageAsset(asset);
    if (!prepared) return;
    setPhotoAsset(prepared);
    setPhotos([prepared.uri]);
  };

  const handleOpenCamera = async () => applyPickedImage(await captureImageWithCamera());

  const handleOpenGallery = async () => applyPickedImage(await pickImageFromGallery());

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPhotoAsset(null);
  };

  const handleAttachment = () => {
    Alert.alert('Add Photo', 'Choose an option', [
      { text: 'Take Photo', onPress: handleOpenCamera },
      { text: 'Choose from Gallery', onPress: handleOpenGallery },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ── Voice Note ────────────────────────────────────────────────────────────────
  const handleStartRecording = async () => {
    try {
      const { granted } = await AudioModule.requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission Needed', 'Microphone access is required to record voice notes.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
      setRecordingDuration(0);
      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Start recording failed:', error);
      Alert.alert('Error', 'Could not start recording.');
    }
  };

  const handleStopRecording = async () => {
    try {
      if (!recorder.isRecording) return;
      if (timerRef.current) clearInterval(timerRef.current);
      await recorder.stop();
      const uri = recorder.uri;
      setIsRecording(false);
      if (uri) setVoiceUri(uri);
    } catch (error) {
      console.error('Stop recording failed:', error);
    }
  };

  const handlePlayVoice = async () => {
    if (!voiceUri) return;
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      if (playerStatus.playing) {
        player.pause();
        setPlayingVoice(false);
      } else {
        if (playerStatus.didJustFinish) await player.seekTo(0);
        player.play();
        setPlayingVoice(true);
      }
    } catch (error) {
      console.error('Playback failed:', error);
      setPlayingVoice(false);
    }
  };

  const handleDeleteVoice = () => {
    player.pause();
    setVoiceUri(null);
    setRecordingDuration(0);
    setPlayingVoice(false);
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // ── Validation ────────────────────────────────────────────────────────────────
  const validateForm = (): boolean => {
    if (!form.ownerName.trim()) {
      Alert.alert('Missing Info', 'Please enter the owner name.');
      return false;
    }
    if (!form.shopName.trim()) {
      Alert.alert('Missing Info', 'Please enter the shop name.');
      return false;
    }
    if (!form.location.trim()) {
      Alert.alert('Missing Info', 'Please enter or detect the location.');
      return false;
    }
    return true;
  };

  const resetForm = () => {
    setForm(initialForm);
    setPhotos([]);
    setPhotoAsset(null);
    setVoiceUri(null);
    setRecordingDuration(0);
  };

  // ── Submit ────────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      const storedUserId = await SecureStore.getItemAsync('userId');
      const storedPassword = await SecureStore.getItemAsync('password');
      const storedUsername = await SecureStore.getItemAsync('username');

      if (!storedUserId || !storedPassword) {
        Alert.alert('Login Required', 'Please log in again before submitting an enquiry.');
        navigation.replace('Login' as never);
        return;
      }

      const credentials = `${storedUserId}:${storedPassword}`;
      const base64Credentials = btoa(credentials);
      const creatorName = storedUsername || createdBy || storedUserId;
      const formData = new FormData();

      formData.append('owner_name', form.ownerName.trim());
      formData.append('shop_name', form.shopName.trim());
      formData.append('location', form.location.trim());
      formData.append('phone_number', form.phoneNumber.trim());
      formData.append('purpose', form.purpose.trim());
      formData.append('notes', form.notes.trim());
      if (form.latitude) {
        formData.append('latitude', parseFloat(parseFloat(form.latitude).toFixed(6)).toString());
      }
      if (form.longitude) {
        formData.append('longitude', parseFloat(parseFloat(form.longitude).toFixed(6)).toString());
      }
      formData.append('creator', creatorName);
      formData.append('created_by', creatorName);
      formData.append('user_id', storedUserId);

      if (photoAsset) {
        formData.append('image', buildImageFormPart(photoAsset) as any);
      }

      if (voiceUri) {
        const audioName = getFileName(voiceUri, `voice_${Date.now()}.m4a`);
        formData.append('audio', {
          uri: normalizeFileUri(voiceUri),
          name: audioName,
          type: getAudioMimeType(audioName),
        } as any);
      }

      const response = await fetch('https://my.myimc.in/enquiry/api/', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${base64Credentials}`,
        },
        body: formData,
      });

      if (response.ok) {
        Alert.alert('Success', 'Enquiry submitted successfully.', [
          {
            text: 'OK',
            onPress: () => {
              resetForm();
              navigation.goBack();
            },
          },
        ]);
      } else {
        let serverMessage = `Server responded with status ${response.status}.`;
        try {
          const errorBody = await response.text();
          console.error('Enquiry submit failed:', response.status, errorBody);
          if (errorBody) {
            try {
              const parsed = JSON.parse(errorBody);
              serverMessage = JSON.stringify(parsed);
            } catch {
              serverMessage = errorBody.slice(0, 300);
            }
          }
        } catch (readError) {
          console.error('Could not read error body:', readError);
        }
        Alert.alert('Submission Failed', serverMessage);
      }
    } catch (error) {
      console.error('Submit error:', error);
      Alert.alert('Error', `Network or server issue: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────
// add near the other useState hooks in the component
const [headerHeight, setHeaderHeight] = useState(0);

return (
  <View style={styles.container}>
    {/* Header */}
    <View style={styles.header} onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.7}>
        <Ionicons name="arrow-back" size={20} color="#1C1B17" />
      </TouchableOpacity>
      <View style={styles.headerTextContainer}>
        <Text style={styles.headerTitle}>New Enquiry</Text>
        <Text style={styles.headerSubtitle}>Fill in the details below</Text>
      </View>
      <View style={styles.placeholder} />
    </View>

    <KeyboardAvoidingView
      style={styles.keyboardView}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
          {/* Owner Name */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>OWNER NAME <Text style={styles.required}>*</Text></Text>
            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={18} color="#A39A85" style={styles.inputIcon} />
              <TextInput
                placeholder="e.g. Tom Johnson"
                placeholderTextColor="#C2BBA8"
                style={styles.input}
                value={form.ownerName}
                onChangeText={(text) => updateField('ownerName', text)}
                editable={!submitting}
              />
            </View>
          </View>

          {/* Shop Name */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>SHOP NAME <Text style={styles.required}>*</Text></Text>
            <View style={styles.inputContainer}>
              <Ionicons name="storefront-outline" size={18} color="#A39A85" style={styles.inputIcon} />
              <TextInput
                placeholder="e.g. ABC Store"
                placeholderTextColor="#C2BBA8"
                style={styles.input}
                value={form.shopName}
                onChangeText={(text) => updateField('shopName', text)}
                editable={!submitting}
              />
            </View>
          </View>

          {/* Phone Number */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>PHONE NUMBER</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="call-outline" size={18} color="#A39A85" style={styles.inputIcon} />
              <TextInput
                placeholder="e.g. +91 XXXXX XXXXX"
                placeholderTextColor="#C2BBA8"
                style={styles.input}
                value={form.phoneNumber}
                onChangeText={(text) => updateField('phoneNumber', text)}
                keyboardType="phone-pad"
                editable={!submitting}
              />
            </View>
          </View>

          {/* Location */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>LOCATION <Text style={styles.required}>*</Text></Text>
            <View style={styles.locationRow}>
              <View style={[styles.inputContainer, styles.locationInputContainer]}>
                <Ionicons name="location-outline" size={18} color="#A39A85" style={styles.inputIcon} />
                <TextInput
                  placeholder="e.g. Kozhikode, Kerala"
                  placeholderTextColor="#C2BBA8"
                  style={styles.input}
                  value={form.location}
                  onChangeText={(text) => updateField('location', text)}
                  editable={!submitting && !detecting}
                />
              </View>
              <TouchableOpacity
                style={styles.detectButton}
                onPress={handleDetectLocation}
                disabled={detecting || submitting}
                activeOpacity={0.8}
              >
                {detecting ? (
                  <ActivityIndicator size="small" color="#1C1B17" />
                ) : (
                  <>
                    <Ionicons name="locate-outline" size={16} color="#1C1B17" />
                    <Text style={styles.detectButtonText}>Detect</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
            {form.latitude && form.longitude ? (
              <View style={styles.coordsBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#3F8F5F" />
                <Text style={styles.coordsText}>
                  GPS locked · {parseFloat(form.latitude).toFixed(4)}, {parseFloat(form.longitude).toFixed(4)}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Purpose */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>PURPOSE</Text>
            <TouchableOpacity
              style={styles.inputContainer}
              onPress={() => setShowPurposeOptions((prev) => !prev)}
              activeOpacity={0.7}
              disabled={submitting}
            >
              <Ionicons name="clipboard-outline" size={18} color="#A39A85" style={styles.inputIcon} />
              <TextInput
                placeholder="Type or select a purpose..."
                placeholderTextColor="#C2BBA8"
                style={styles.input}
                value={form.purpose}
                onChangeText={(text) => updateField('purpose', text)}
                onFocus={() => setShowPurposeOptions(true)}
                editable={!submitting}
              />
              <Ionicons name={showPurposeOptions ? 'chevron-up' : 'chevron-down'} size={18} color="#A39A85" />
            </TouchableOpacity>
            {showPurposeOptions && (
              <View style={styles.purposeOptionsContainer}>
                {PURPOSE_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={styles.purposeOption}
                    onPress={() => {
                      updateField('purpose', option);
                      setShowPurposeOptions(false);
                    }}
                  >
                    <Text style={styles.purposeOptionText}>{option}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Notes */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>NOTES</Text>
            <View style={[styles.inputContainer, styles.notesContainer]}>
              <TextInput
                placeholder="Any additional information or requests..."
                placeholderTextColor="#C2BBA8"
                style={styles.notesInput}
                value={form.notes}
                onChangeText={(text) => updateField('notes', text)}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                editable={!submitting}
              />
            </View>
          </View>

          {/* Attachments */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>ATTACHMENTS</Text>

            {/* 3 action buttons */}
            <View style={styles.attachmentActionsRow}>
              {/* Camera */}
              <TouchableOpacity style={styles.attachmentActionBtn} onPress={handleOpenCamera} disabled={submitting} activeOpacity={0.8}>
                <View style={styles.attachmentActionIcon}>
                  <Ionicons name="camera-outline" size={22} color="#D4A574" />
                </View>
                <Text style={styles.attachmentActionText}>Camera</Text>
              </TouchableOpacity>

              {/* Gallery */}
              <TouchableOpacity style={styles.attachmentActionBtn} onPress={handleOpenGallery} disabled={submitting} activeOpacity={0.8}>
                <View style={styles.attachmentActionIcon}>
                  <Ionicons name="images-outline" size={22} color="#D4A574" />
                </View>
                <Text style={styles.attachmentActionText}>Gallery</Text>
              </TouchableOpacity>

              {/* Voice Note */}
              <TouchableOpacity
                style={styles.attachmentActionBtn}
                onPress={isRecording ? handleStopRecording : voiceUri ? handleDeleteVoice : handleStartRecording}
                disabled={submitting}
                activeOpacity={0.8}
              >
                <View style={[styles.attachmentActionIcon, isRecording && styles.recordingActiveIcon]}>
                  <Ionicons
                    name={isRecording ? 'stop-circle-outline' : voiceUri ? 'trash-outline' : 'mic-outline'}
                    size={22}
                    color={isRecording ? '#E55A5A' : voiceUri ? '#E55A5A' : '#D4A574'}
                  />
                </View>
                <Text style={[styles.attachmentActionText, isRecording && { color: '#E55A5A' }]}>
                  {isRecording ? 'Stop' : voiceUri ? 'Delete' : 'Voice'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Recording indicator */}
            {isRecording && (
              <View style={styles.recordingBadge}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingText}>Recording... {formatDuration(recordingDuration)}</Text>
              </View>
            )}

            {/* Voice note preview */}
            {voiceUri && !isRecording && (
              <View style={styles.voicePreview}>
                <Ionicons name="musical-notes-outline" size={18} color="#3F8F5F" />
                <Text style={styles.voicePreviewText}>Voice note · {formatDuration(recordingDuration)}</Text>
                <TouchableOpacity onPress={handlePlayVoice} disabled={playingVoice} style={styles.voicePlayBtn}>
                  <Ionicons name={playingVoice ? 'pause-circle' : 'play-circle'} size={28} color="#3F8F5F" />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDeleteVoice} style={styles.voiceDeleteBtn}>
                  <Ionicons name="close-circle" size={22} color="#E55A5A" />
                </TouchableOpacity>
              </View>
            )}

            {/* Photo grid */}
            {photos.length > 0 && (
              <View style={styles.photosGrid}>
                {photos.map((uri, index) => (
                  <View key={index} style={styles.photoThumbContainer}>
                    <Image source={{ uri }} style={styles.photoThumb} />
                    <TouchableOpacity style={styles.photoRemoveBtn} onPress={() => handleRemovePhoto(index)}>
                      <Ionicons name="close-circle" size={20} color="#E55A5A" />
                    </TouchableOpacity>
                  </View>
                ))}
                {photos.length < 1 && (
                  <TouchableOpacity style={styles.addMorePhotoBtn} onPress={handleAttachment}>
                    <Ionicons name="add" size={28} color="#A39A85" />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* Actions */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => navigation.goBack()}
              disabled={submitting}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#1C1B17" />
              ) : (
                <>
                  <Text style={styles.submitButtonText}>Submit</Text>
                  <Ionicons name="arrow-forward" size={18} color="#1C1B17" />
                </>
              )}
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  keyboardView: {
    flex: 1,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: '#FAF9F6',
  },
  backButton: {
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
  headerTextContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1B17',
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#A39A85',
    marginTop: 2,
  },
  placeholder: {
    width: 40,
  },

  /* Scroll */
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },

  /* Fields */
  fieldContainer: {
    marginBottom: 18,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7E7767',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  labelInRow: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7E7767',
    letterSpacing: 1.2,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  required: {
    color: '#D4A574',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 52,
    borderWidth: 1,
    borderColor: '#F0EAD8',
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#1C1B17',
    fontWeight: '500',
  },

  /* Location */
  locationRow: {
    flexDirection: 'row',
    gap: 10,
  },
  locationInputContainer: {
    flex: 1,
  },
  detectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#D4A574',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 52,
    shadowColor: '#D4A574',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  detectButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C1B17',
  },
  coordsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  coordsText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3F8F5F',
  },

  /* Purpose */
  purposeOptionsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginTop: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#F0EAD8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  purposeOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  purposeOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1C1B17',
  },

  /* Notes */
  notesContainer: {
    height: 110,
    paddingVertical: 12,
    alignItems: 'flex-start',
  },
  notesInput: {
    flex: 1,
    fontSize: 15,
    color: '#1C1B17',
    fontWeight: '500',
    width: '100%',
  },

  /* Attachments */
  attachmentActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  attachmentActionBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  attachmentActionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F0EAD8',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  recordingActiveIcon: {
    borderColor: '#E55A5A',
    backgroundColor: '#FFF5F5',
  },
  attachmentActionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7E7767',
    letterSpacing: 0.5,
  },

  /* Recording badge */
  recordingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF5F5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#FFD5D5',
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E55A5A',
  },
  recordingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E55A5A',
  },

  /* Voice preview */
  voicePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F0FFF6',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#C8EDD8',
  },
  voicePreviewText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#3F8F5F',
  },
  voicePlayBtn: {
    padding: 2,
  },
  voiceDeleteBtn: {
    padding: 2,
  },

  /* Photos grid */
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  photoThumbContainer: {
    position: 'relative',
    width: 80,
    height: 80,
    borderRadius: 12,
    overflow: 'visible',
  },
  photoThumb: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#F0EAD8',
  },
  photoRemoveBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  addMorePhotoBtn: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#F0EAD8',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* Actions */
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  cancelButton: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F0EAD8',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#7E7767',
  },
  submitButton: {
    flex: 2,
    height: 54,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5C451',
    gap: 8,
    shadowColor: '#F5C451',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  submitButtonDisabled: {
    opacity: 0.6,
    shadowOpacity: 0.15,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C1B17',
  },
});
