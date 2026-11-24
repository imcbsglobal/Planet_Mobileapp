import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { buildImageFormPart, captureImageWithCamera, pickImageFromGallery, prepareImageAsset, PreparedImageAsset } from '../lib/imageUpload';
import * as SecureStore from '../lib/secureStore';
import { SERVICE_OPTIONS, ServiceKey } from '../lib/tripServices';

/* ─────────────────────────── Types ─────────────────────────── */

interface VehicleOption {
  id: number;
  vehicle_name: string;
  registration_number: string;
  branch: string;
  branch_name: string;
  status: string;
}

interface OngoingTrip {
  id: number;
  vehicle_id?: number | string | null;
  vehicle_name?: string | null;
  registration_number?: string | null;
  traveled_by?: string | null;
  status?: string | null;
}

/* ─────────────────────────── Constants ─────────────────────── */

// Start a trip: `POST /api/vehicle/trips/` (multipart or JSON). The matching
// `PATCH /api/vehicle/trips/<id>/` endpoint closes it out — this screen only
// opens one.
const TRIPS_API_URL = 'https://planet.imcbs.com/api/vehicle/trips/';
const VEHICLES_API_URL = 'https://planet.imcbs.com/api/vehicle/vehicles/';
// The list endpoint is paginated, so ask for a big page — otherwise a vehicle
// the user knows by registration number can sit beyond page one and never be
// found.
const VEHICLES_PAGE_SIZE = 500;
const TRIPS_PAGE_SIZE = 500;

const FETCH_TIMEOUT = 20000;

/* ─────────────────────────── Helpers ───────────────────────── */

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` — the format the date field on this endpoint expects. */
const toApiDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** `HH:MM` — 24h, matching the `time` field (`max_length` 10). */
const toApiTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const formatDisplayDate = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const formatDisplayTime = (d: Date) =>
  d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

/* ─────────────────────────── Component ─────────────────────── */

export default function StartTrip() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  /* Vehicles */
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [vehicleQuery, setVehicleQuery] = useState('');
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleOption | null>(null);
  const [ongoingVehicles, setOngoingVehicles] = useState<OngoingTrip[]>([]);
  const [ongoingTrip, setOngoingTrip] = useState<OngoingTrip | null>(null);
  const [checkingOngoingTrip, setCheckingOngoingTrip] = useState(true);
  const [ongoingTripCheckError, setOngoingTripCheckError] = useState(false);

  /* Date / time */
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(new Date());
  // One picker state serves both fields: 'date' | 'time' | null.
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  // iOS shows a spinner in a modal, so it edits a temp value until Done.
  const [tempValue, setTempValue] = useState(new Date());

  /* Fields */
  const [clientName, setClientName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [fuelCost, setFuelCost] = useState('');
  const [odometerStart, setOdometerStart] = useState('');
  const [services, setServices] = useState<Record<string, boolean>>({});

  /* Odometer photo */
  const [photoAsset, setPhotoAsset] = useState<PreparedImageAsset | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);

  const fetchOngoingTrips = useCallback(async (): Promise<{
    trips: OngoingTrip[];
    userTrip: OngoingTrip | null;
  }> => {
    const [token, username, userId] = await Promise.all([
      SecureStore.getItemAsync('token'),
      SecureStore.getItemAsync('username'),
      SecureStore.getItemAsync('userId'),
    ]);
    const travelerIds = [username, userId]
      .map((value) => value?.trim().toLowerCase())
      .filter((value): value is string => !!value);
    if (travelerIds.length === 0) {
      throw new Error('Could not identify the signed-in user.');
    }

    const response = await fetch(`${TRIPS_API_URL}?page_size=${TRIPS_PAGE_SIZE}`, {
      headers: { Authorization: `Token ${token}` },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(text);

    const parsed = JSON.parse(text);
    const rows: OngoingTrip[] = Array.isArray(parsed) ? parsed : parsed?.results || [];
    const ongoingTrips = rows.filter(
      (trip) => (trip.status || '').trim().toLowerCase() === 'ongoing'
    );
    return {
      trips: ongoingTrips,
      userTrip:
        ongoingTrips.find((trip) =>
          travelerIds.includes((trip.traveled_by || '').trim().toLowerCase())
        ) || null,
    };
  }, []);

  const refreshOngoingTrip = useCallback(async () => {
    setCheckingOngoingTrip(true);
    setOngoingTripCheckError(false);
    try {
      const result = await fetchOngoingTrips();
      setOngoingVehicles(result.trips);
      setOngoingTrip(result.userTrip);
    } catch (err) {
      console.error('checkOngoingTrip error:', err);
      setOngoingVehicles([]);
      setOngoingTrip(null);
      setOngoingTripCheckError(true);
    } finally {
      setCheckingOngoingTrip(false);
    }
  }, [fetchOngoingTrips]);

  const loadVehicles = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      const response = await fetch(`${VEHICLES_API_URL}?page_size=${VEHICLES_PAGE_SIZE}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      if (!response.ok) throw new Error(text);

      const parsed = JSON.parse(text);
      const rows: any[] = Array.isArray(parsed) ? parsed : parsed?.results || [];
      setVehicles(
        rows.map((v: any) => ({
          id: v.id,
          vehicle_name: v.vehicle_name || '',
          registration_number: v.registration_number || '',
          branch: v.branch || '',
          branch_name: v.branch_name || '',
          status: v.status || '',
        }))
      );
    } catch (err) {
      console.log('loadVehicles error:', err);
    } finally {
      setLoadingVehicles(false);
    }
  }, []);

  // Same load-on-focus pattern the vehicle list uses — refetching only what
  // this form needs whenever the screen becomes active.
  useFocusEffect(
    useCallback(() => {
      loadVehicles();
      refreshOngoingTrip();
    }, [loadVehicles, refreshOngoingTrip])
  );

  /* ── Vehicle dropdown ── */
  const filteredVehicles = vehicles.filter((v) => {
    const q = vehicleQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      v.vehicle_name.toLowerCase().includes(q) ||
      v.registration_number.toLowerCase().includes(q) ||
      v.branch_name.toLowerCase().includes(q)
    );
  });

  const selectVehicle = (vehicle: VehicleOption) => {
    if (isVehicleOngoing(vehicle)) return;
    setSelectedVehicle(vehicle);
    setShowVehicleDropdown(false);
    setVehicleQuery('');
  };

  const isVehicleOngoing = (vehicle: VehicleOption) =>
    ongoingVehicles.some(
      (trip) =>
        (trip.vehicle_id != null && String(trip.vehicle_id) === String(vehicle.id)) ||
        (!!trip.registration_number &&
          trip.registration_number.trim().toLowerCase() ===
            vehicle.registration_number.trim().toLowerCase())
    );

  const handleVehicleDropdownPress = () => {
    if (checkingOngoingTrip) {
      Alert.alert('Checking Trip Status', 'Please wait while we check for an ongoing trip.');
      return;
    }
    if (ongoingTripCheckError) {
      Alert.alert(
        'Unable to Check Trip Status',
        'Please retry the trip status check before starting a new trip.'
      );
      return;
    }
    if (ongoingTrip) return;
    setShowVehicleDropdown((prev) => !prev);
  };

  /* ── Date / time pickers ── */
  const openPicker = (kind: 'date' | 'time') => {
    setTempValue(kind === 'date' ? date : time);
    setPicker(kind);
  };

  const handlePickerChange = (event: any, selected?: Date) => {
    // Android renders the dialog in place, so it closes itself on either choice.
    if (Platform.OS === 'android') setPicker(null);
    if (event?.type === 'dismissed' || !selected) return;

    if (Platform.OS === 'android') {
      if (picker === 'date') setDate(selected);
      else setTime(selected);
      return;
    }
    setTempValue(selected);
  };

  const confirmIosPicker = () => {
    if (picker === 'date') setDate(tempValue);
    else if (picker === 'time') setTime(tempValue);
    setPicker(null);
  };

  /* ── Services ── */
  const toggleService = (key: ServiceKey) =>
    setServices((prev) => ({ ...prev, [key]: !prev[key] }));

  const enabledServices = SERVICE_OPTIONS.filter((s) => services[s.key]).map((s) => s.key);

  /* ── Odometer photo ── */
  const applyImage = async (asset: Awaited<ReturnType<typeof pickImageFromGallery>>) => {
    if (!asset) return;
    const prepared = await prepareImageAsset(asset);
    if (!prepared) return;
    setPhotoAsset(prepared);
    setPhotoPreview(prepared.uri);
  };

  const pickPhoto = async () => applyImage(await pickImageFromGallery());

  const takePhoto = async () => applyImage(await captureImageWithCamera());

  const clearPhoto = () => {
    setPhotoAsset(null);
    setPhotoPreview(null);
  };

  /* ── Validation ── */
  const validate = (): string | null => {
    if (!selectedVehicle) return 'Please select a vehicle.';
    if (!date) return 'Date is required.';
    if (!time) return 'Time is required.';
    const trimmed = odometerStart.trim();
    if (!trimmed) return 'Start odometer reading is required.';
    const reading = parseFloat(trimmed);
    if (Number.isNaN(reading) || reading < 0) return 'Enter a valid odometer reading.';
    if (fuelCost.trim() && Number.isNaN(parseFloat(fuelCost.trim())))
      return 'Enter a valid fuel cost.';
    return null;
  };

  /* ── Submit ── */
  const handleSubmit = async (confirmed = false) => {
    if (submitting) return;
    if (checkingOngoingTrip) {
      Alert.alert('Checking Trip Status', 'Please wait while we check for an ongoing trip.');
      return;
    }
    if (ongoingTripCheckError) {
      Alert.alert(
        'Unable to Check Trip Status',
        'Please retry the trip status check before starting a new trip.'
      );
      return;
    }
    if (ongoingTrip) return;

    const problem = validate();
    if (problem) {
      Alert.alert('Validation Error', problem);
      return;
    }

    if (!confirmed) {
      Alert.alert('Start Trip', 'Are you sure you want to start this trip?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Start Trip', onPress: () => handleSubmit(true) },
      ]);
      return;
    }

    setSubmitting(true);
    try {
      let activeTrip: OngoingTrip | null;
      let activeVehicles: OngoingTrip[];
      try {
        const result = await fetchOngoingTrips();
        activeTrip = result.userTrip;
        activeVehicles = result.trips;
        setOngoingVehicles(activeVehicles);
        setOngoingTrip(activeTrip);
        setOngoingTripCheckError(false);
      } catch (err) {
        console.error('checkOngoingTrip error:', err);
        setOngoingTripCheckError(true);
        Alert.alert(
          'Unable to Check Trip Status',
          'The trip could not be verified. Please try again before starting a new trip.'
        );
        return;
      }

      if (activeTrip) {
        return;
      }

      const vehicle = selectedVehicle!;
      const selectedVehicleIsOngoing = activeVehicles.some(
        (trip) =>
          (trip.vehicle_id != null && String(trip.vehicle_id) === String(vehicle.id)) ||
          (!!trip.registration_number &&
            trip.registration_number.trim().toLowerCase() ===
              vehicle.registration_number.trim().toLowerCase())
      );
      if (selectedVehicleIsOngoing) {
        Alert.alert(
          'Vehicle Unavailable',
          `${vehicle.vehicle_name || vehicle.registration_number} already has an ongoing trip.`
        );
        return;
      }
      const [username, userId] = await Promise.all([
        SecureStore.getItemAsync('username'),
        SecureStore.getItemAsync('userId'),
      ]);
      const traveler = username || userId || '';

      const formData = new FormData();
      formData.append('vehicle_id', String(vehicle.id));
      formData.append('vehicle_name', vehicle.vehicle_name);
      formData.append('registration_number', vehicle.registration_number);
      if (vehicle.branch) formData.append('branch', vehicle.branch);
      formData.append('date', toApiDate(date));
      formData.append('time', toApiTime(time));
      formData.append('client_name', clientName.trim());
      formData.append('purpose_of_trip', purpose.trim());
      formData.append('odometer_start', String(parseFloat(odometerStart.trim())));
      if (fuelCost.trim()) {
        formData.append('fuel_cost', String(parseFloat(fuelCost.trim())));
      }
      // Arrays go through multipart as JSON text — that is how the web client
      // serialises the same field, and the backend parses it either way.
      formData.append('services', JSON.stringify(enabledServices));
      formData.append('traveled_by', traveler);
      // A freshly started trip is always still open; the PATCH endpoint flips it
      // to `completed` when it ends.
      formData.append('status', 'ongoing');

      if (photoAsset) {
        const photoPart = buildImageFormPart(photoAsset) as any;
        formData.append('odometer_start_image', photoPart);
        formData.append('odometer_image', photoPart);
      }

      const token = await SecureStore.getItemAsync('token');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

      const response = await fetch(TRIPS_API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const responseText = await response.text();
      if (!response.ok) {
        Alert.alert(`Server Error (${response.status})`, responseText.substring(0, 900));
        return;
      }

      Alert.alert('Trip Started', 'Your trip has been saved.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to save trip. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedVehicle(null);
    setVehicleQuery('');
    setDate(new Date());
    setTime(new Date());
    setClientName('');
    setPurpose('');
    setFuelCost('');
    setOdometerStart('');
    setServices({});
    clearPhoto();
  };

  const handleCancel = () => {
    Alert.alert('Discard Trip', 'Discard this trip and go back?', [
      { text: 'Keep Editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          resetForm();
          navigation.goBack();
        },
      },
    ]);
  };

  /* ── Render ── */
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={handleCancel} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color="#1C1B17" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Start Trip</Text>
        <View style={styles.headerGhost} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          {/* ── Vehicle ── */}
          <Text style={styles.label}>VEHICLE</Text>
          {ongoingTripCheckError && (
            <View style={styles.ongoingTripNotice}>
              <Ionicons name="alert-circle-outline" size={20} color="#A33A2B" />
              <View style={styles.ongoingTripNoticeContent}>
                <Text style={styles.ongoingTripNoticeTitle}>Could not verify trip status</Text>
                <Text style={styles.ongoingTripNoticeText}>
                  Retry the check before starting a new trip.
                </Text>
                <TouchableOpacity onPress={refreshOngoingTrip} activeOpacity={0.7}>
                  <Text style={styles.ongoingTripNoticeAction}>Retry</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          <TouchableOpacity
            style={[
              styles.selectInput,
              (checkingOngoingTrip || !!ongoingTrip || ongoingTripCheckError) && styles.btnDisabled,
            ]}
            onPress={handleVehicleDropdownPress}
            disabled={checkingOngoingTrip || !!ongoingTrip || ongoingTripCheckError}
          >
            <Text
              style={{
                flex: 1,
                fontSize: 15,
                fontWeight: '500',
                color: selectedVehicle || ongoingTrip ? '#1C1B17' : '#A39A85',
              }}
            >
              {ongoingTrip
                ? [
                    ongoingTrip.vehicle_name || 'Unnamed vehicle',
                    ongoingTrip.registration_number,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : selectedVehicle
                  ? `${selectedVehicle.vehicle_name || 'Unnamed vehicle'} · ${selectedVehicle.registration_number}`
                  : 'Select vehicle'}
            </Text>
            <Ionicons
              name={ongoingTrip ? 'lock-closed-outline' : showVehicleDropdown ? 'chevron-up' : 'chevron-down'}
              size={18}
              color="#A39A85"
            />
          </TouchableOpacity>

          {showVehicleDropdown && (
            <View style={styles.dropdownBox}>
              <TextInput
                style={[styles.input, { marginBottom: 6 }]}
                placeholder="Search vehicle…"
                placeholderTextColor="#A39A85"
                value={vehicleQuery}
                onChangeText={setVehicleQuery}
                autoFocus
              />
              {loadingVehicles ? (
                <View style={styles.dropdownEmpty}>
                  <ActivityIndicator size="small" color="#A39A85" />
                </View>
              ) : filteredVehicles.length === 0 ? (
                <View style={styles.dropdownEmpty}>
                  <Text style={styles.dropdownEmptyText}>No matching vehicles</Text>
                </View>
              ) : (
                <ScrollView style={styles.dropdownScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {filteredVehicles.map((v) => (
                    <TouchableOpacity
                      key={v.id}
                      style={[styles.dropdownItem, isVehicleOngoing(v) && styles.dropdownItemDisabled]}
                      onPress={() => selectVehicle(v)}
                      disabled={isVehicleOngoing(v)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.dropdownItemTitle}>
                          {v.vehicle_name || v.registration_number}
                        </Text>
                        <Text style={styles.dropdownItemSub}>
                          {[v.registration_number, v.branch_name].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      {isVehicleOngoing(v) ? (
                        <Text style={styles.ongoingVehicleLabel}>Ongoing</Text>
                      ) : selectedVehicle?.id === v.id ? (
                        <Ionicons name="checkmark-circle" size={20} color="#F5C451" />
                      ) : null}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          )}

          {/* ── Date ── */}
          <Text style={styles.label}>DATE</Text>
          <TouchableOpacity style={styles.selectInput} onPress={() => openPicker('date')}>
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '500', color: '#1C1B17' }}>
              {formatDisplayDate(date)}
            </Text>
            <Ionicons name="calendar-outline" size={18} color="#A39A85" />
          </TouchableOpacity>

          {/* ── Time ── */}
          <Text style={styles.label}>TIME</Text>
          <TouchableOpacity style={styles.selectInput} onPress={() => openPicker('time')}>
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '500', color: '#1C1B17' }}>
              {formatDisplayTime(time)}
            </Text>
            <Ionicons name="time-outline" size={18} color="#A39A85" />
          </TouchableOpacity>

          {/* ── Client ── */}
          <Text style={styles.label}>CLIENT</Text>
          <TextInput
            style={styles.input}
            placeholder="Client name"
            placeholderTextColor="#A39A85"
            value={clientName}
            onChangeText={setClientName}
          />

          {/* ── Purpose ── */}
          <Text style={styles.label}>PURPOSE</Text>
          <TextInput
            style={styles.input}
            placeholder="Purpose of trip"
            placeholderTextColor="#A39A85"
            value={purpose}
            onChangeText={setPurpose}
          />

          {/* ── Fuel cost ── */}
          <Text style={styles.label}>FUEL COST</Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            placeholderTextColor="#A39A85"
            value={fuelCost}
            onChangeText={setFuelCost}
            keyboardType="decimal-pad"
          />

          {/* ── Odometer start ── */}
          <Text style={styles.label}>ODOMETER START (KM)</Text>
          <TextInput
            style={styles.input}
            placeholder="Start reading in km"
            placeholderTextColor="#A39A85"
            value={odometerStart}
            onChangeText={setOdometerStart}
            keyboardType="decimal-pad"
          />

          {/* ── Services ── */}
          <Text style={styles.label}>SELECT SERVICE</Text>
          <View style={styles.pillRow}>
            {SERVICE_OPTIONS.map((s) => {
              const active = !!services[s.key];
              return (
                <TouchableOpacity
                  key={s.key}
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => toggleService(s.key)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={(active ? 'checkmark-circle' : s.icon) as any}
                    size={16}
                    color={active ? '#B5854A' : '#7E7767'}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>{s.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Odometer photo ── */}
          <Text style={styles.label}>ODOMETER IMAGE</Text>
          {photoPreview ? (
            <View style={styles.photoPreviewWrap}>
              <Image source={{ uri: photoPreview }} style={styles.photoPreview} resizeMode="cover" />
              <TouchableOpacity style={styles.photoRemoveBtn} onPress={clearPhoto} activeOpacity={0.7}>
                <Ionicons name="trash-outline" size={18} color="#C0392B" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.photoBtnRow}>
              <TouchableOpacity style={styles.photoBtn} onPress={takePhoto} activeOpacity={0.8}>
                <Ionicons name="camera-outline" size={18} color="#1C1B17" />
                <Text style={styles.photoBtnText}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.photoBtn} onPress={pickPhoto} activeOpacity={0.8}>
                <Ionicons name="image-outline" size={18} color="#1C1B17" />
                <Text style={styles.photoBtnText}>Gallery</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Actions ── */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.cancelBtn, submitting && styles.btnDisabled]}
              onPress={handleCancel}
              disabled={submitting}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.submitBtn,
                (submitting || checkingOngoingTrip || !!ongoingTrip || ongoingTripCheckError) &&
                  styles.btnDisabled,
              ]}
              onPress={() => handleSubmit()}
              disabled={submitting || checkingOngoingTrip || !!ongoingTrip || ongoingTripCheckError}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#F5C451" />
              ) : (
                <Text style={styles.submitBtnText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Pickers — Android renders inline, iOS uses a modal ── */}
      {picker && Platform.OS === 'android' && (
        <DateTimePicker
          value={picker === 'date' ? date : time}
          mode={picker}
          display="default"
          onChange={handlePickerChange}
        />
      )}

      {Platform.OS === 'ios' && (
        <Modal visible={picker !== null} transparent animationType="slide" onRequestClose={() => setPicker(null)}>
          <Pressable style={styles.pickerOverlay} onPress={() => setPicker(null)}>
            <Pressable style={styles.pickerContainer} onPress={(e) => e.stopPropagation()}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={() => setPicker(null)}>
                  <Text style={styles.pickerCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.pickerTitle}>{picker === 'time' ? 'Time' : 'Date'}</Text>
                <TouchableOpacity onPress={confirmIosPicker}>
                  <Text style={styles.pickerDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempValue}
                mode={picker || 'date'}
                display="spinner"
                onChange={handlePickerChange}
                style={styles.pickerSpinner}
                textColor="#1C1B17"
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </SafeAreaView>
  );
}

/* ─────────────────────────── Styles ──────────────────────────── */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FDFCF8' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EAD8',
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Keeps the title centred — this screen has no trailing action button.
  headerGhost: { width: 44, height: 44 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#1C1B17' },

  form: { padding: 20, gap: 6, paddingBottom: 48 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5C584F',
    letterSpacing: 1.2,
    marginTop: 14,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F7F5EE',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: '500',
    color: '#1C1B17',
  },
  selectInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F7F5EE',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  ongoingTripNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FFF1EF',
    borderColor: '#F1C5BF',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 6,
  },
  ongoingTripNoticeContent: { flex: 1 },
  ongoingTripNoticeTitle: { fontSize: 13, fontWeight: '800', color: '#8E2D22' },
  ongoingTripNoticeText: { fontSize: 13, color: '#5C302B', marginTop: 3, lineHeight: 18 },
  ongoingTripNoticeAction: {
    fontSize: 13,
    fontWeight: '800',
    color: '#8E2D22',
    marginTop: 8,
    textDecorationLine: 'underline',
  },

  /* Vehicle dropdown */
  dropdownBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8E3D9',
    marginTop: 6,
    overflow: 'hidden',
  },
  dropdownScroll: { maxHeight: 220 },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EAD8',
  },
  dropdownItemDisabled: { opacity: 0.55 },
  dropdownItemTitle: { fontSize: 14, fontWeight: '700', color: '#1C1B17' },
  dropdownItemSub: { fontSize: 12, color: '#6E695F', marginTop: 2 },
  ongoingVehicleLabel: {
    color: '#8E2D22',
    fontSize: 11,
    fontWeight: '800',
    marginLeft: 8,
  },
  dropdownEmpty: { paddingVertical: 16, alignItems: 'center' },
  dropdownEmptyText: { fontSize: 12, color: '#A39A85', fontWeight: '600' },

  /* Service pills */
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E8E3D9',
    backgroundColor: '#FFFFFF',
  },
  pillActive: { borderColor: '#F5C451', backgroundColor: '#FFF9E9' },
  pillText: { fontSize: 13, fontWeight: '700', color: '#1C1B17' },
  pillTextActive: { color: '#B5854A' },

  /* Odometer photo */
  photoBtnRow: { flexDirection: 'row', gap: 10 },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: '#E8E3D9',
  },
  photoBtnText: { fontSize: 14, fontWeight: '700', color: '#1C1B17' },
  photoPreviewWrap: { position: 'relative' },
  photoPreview: {
    width: '100%',
    height: 170,
    borderRadius: 16,
    backgroundColor: '#F7F5EE',
  },
  photoRemoveBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* Actions */
  actionsRow: { flexDirection: 'row', gap: 12, marginTop: 28 },
  submitBtn: {
    flex: 1,
    backgroundColor: '#1C1B17',
    borderRadius: 50,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: { fontSize: 16, fontWeight: '800', color: '#F5C451' },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#F5F4F0',
    borderRadius: 50,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E8E3D9',
  },
  cancelBtnText: { fontSize: 16, fontWeight: '800', color: '#7E7767' },
  btnDisabled: { opacity: 0.6 },

  /* Pickers */
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(28,27,23,0.45)',
    justifyContent: 'flex-end',
  },
  pickerContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingBottom: 24,
    paddingHorizontal: 16,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EAD8',
  },
  pickerCancel: { fontSize: 15, fontWeight: '700', color: '#7E7767' },
  pickerTitle: { fontSize: 16, fontWeight: '800', color: '#1C1B17' },
  pickerDone: { fontSize: 15, fontWeight: '800', color: '#B5854A' },
  pickerSpinner: { height: 220, marginTop: 8 },
});
