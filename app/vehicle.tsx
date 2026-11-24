import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
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
import { formatServices } from '../lib/tripServices';

/* ─────────────────────────── Types ─────────────────────────── */

// One row of `GET /api/vehicle/trips/`. The API returns both snake_case and
// camelCase spellings of the same field, so everything is optional here — a
// trip that was just started has no end data yet.
interface TripRecord {
  id: number;
  vehicle_id: number;
  vehicle_name?: string;
  registration_number?: string;
  branch_name?: string;
  client_name?: string;
  date?: string | null;
  time?: string | null;
  purpose_of_trip?: string;
  status?: string;
  odometer_start?: string | null;
  odometer_end?: string | null;
  distance_covered?: string | null;
  maintenance_cost?: string | null;
  fuel_cost?: string | null;
  services?: string[] | string | null;
  traveled_by?: string | null;
  end_date?: string | null;
  end_time?: string | null;
  odometer_start_image?: string | ImageFieldValue | null;
  odometer_end_image?: string | ImageFieldValue | null;
  fuel_proof_image?: string | ImageFieldValue | null;
  // The `odometer_*_image` URLs point at an R2 bucket that answers 404, so the
  // API also exposes these per-trip proxy endpoints which actually stream the
  // photo (verified 200 image/jpeg). Prefer them, keep the R2 link as backup.
  startImg?: string | ImageFieldValue | null;
  endImg?: string | ImageFieldValue | null;
  fuelProofImg?: string | ImageFieldValue | null;
  // Some rows only carry the generic field the web client posts.
  odometer_image?: string | ImageFieldValue | null;
  created_at?: string;
}

interface ImageFieldValue {
  url?: string;
  image?: string;
  image_url?: string;
  path?: string;
}

/* ─────────────────────────── Constants ─────────────────────── */

// Trip log — everything this screen shows comes from trips started on the
// Start Trip screen. The fleet register itself is managed from web admin, so
// only the trip data is fetched here.
const TRIPS_API_URL = 'https://planet.imcbs.com/api/vehicle/trips/';
const API_HOST = 'https://planet.imcbs.com';
const TRIPS_PAGE_SIZE = 500;
const FETCH_TIMEOUT = 20000;
const EXTENSION_MARKER = '\nExtended: ';

const TRIP_STATUS_COLORS: Record<string, string> = {
  ongoing: '#8A5A00',
  completed: '#1E8E4B',
};

const TRIP_STATUS_LABEL: Record<string, string> = {
  ongoing: 'Ongoing',
  completed: 'Completed',
};

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

const formatNumber = (value?: number | string | null): string => {
  if (value === undefined || value === null || value === '') return '0';
  const num = Number(value);
  return Number.isNaN(num) ? String(value) : num.toLocaleString('en-IN');
};

// Trip figures arrive as "22.00" strings — used for `> 0` guards so zero
// values are simply skipped instead of rendered as "₹0".
const toNumber = (value?: number | string | null): number => {
  if (value === undefined || value === null || value === '') return 0;
  const num = Number(value);
  return Number.isNaN(num) ? 0 : num;
};

const formatCurrency = (value?: string | number | null): string => {
  const num = toNumber(value);
  if (!num) return '';
  return `₹${num.toLocaleString('en-IN')}`;
};

const formatDate = (value?: string | null): string => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const appendTripExtension = (current: string | null | undefined, added: string): string => {
  const value = added.trim();
  if (!value) return current || '';
  const base = (current || '').trim();
  return base ? `${base}${EXTENSION_MARKER}${value}` : value;
};

const splitTripExtension = (value?: string | null) => {
  const parts = (value || '').split(EXTENSION_MARKER);
  return {
    original: parts[0]?.trim() || '',
    extended: parts.slice(1).join(EXTENSION_MARKER).trim(),
  };
};

const getNormalizedTripStatus = (trip: TripRecord): string => (trip.status || '').trim().toLowerCase();

const getStatusLabel = (trip: TripRecord): string =>
  TRIP_STATUS_LABEL[getNormalizedTripStatus(trip)] || trip.status?.trim() || '—';

const getStatusColor = (trip: TripRecord): string =>
  TRIP_STATUS_COLORS[getNormalizedTripStatus(trip)] || '#7E7767';

// DRF stores image fields as `/media/…` relative paths — React Native can't
// load those, so the API host has to be prefixed before the URI reaches Image.
const resolveImageUrl = (value?: string | ImageFieldValue | null): string | undefined => {
  const rawUrl = typeof value === 'string'
    ? value
    : value?.url || value?.image_url || value?.image || value?.path;
  const url = rawUrl?.trim();
  if (!url) return undefined;
  if (url.startsWith('//')) return `https:${url}`;
  if (/^(https?:|file:|data:)/i.test(url)) return url;
  return url.startsWith('/') ? `${API_HOST}${url}` : `${API_HOST}/${url}`;
};

/* ─────────────────────────── Detail Row ──────────────────────── */

function TripDetailRow({
  icon,
  label,
  value,
  valueColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  valueColor?: string;
}) {
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={16} color="#A39A85" style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.detailRowLabel}>{label}</Text>
        <Text style={[styles.detailRowValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
      </View>
    </View>
  );
}

/* ─────────────────────────── Trip photo ──────────────────────── */

// Each photo has more than one URL (the proxy endpoint plus the stored object
// link). Candidates are tried in order and the next one is used as soon as one
// fails to load, so a dead host never leaves a blank box.
function TripPhoto({
  uris,
  label,
  labelAbove,
}: {
  uris: (string | undefined)[];
  label: string;
  labelAbove?: boolean;
}) {
  const candidates = uris.filter((uri): uri is string => !!uri);
  const [index, setIndex] = useState(0);
  const uri = candidates[index];

  if (!uri) return null;
  const labelNode = (
    <Text style={[styles.tripImageLabel, labelAbove && styles.tripImageLabelAbove]}>{label}</Text>
  );
  return (
    <View style={styles.tripImageWrap}>
      {labelAbove && labelNode}
      <Image
        source={{ uri }}
        style={styles.tripImage}
        resizeMode="cover"
        onError={() => setIndex((i) => i + 1)}
      />
      {!labelAbove && labelNode}
    </View>
  );
}

/* ─────────────────────────── Component ─────────────────────── */

export default function Vehicle() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [isInitializing, setIsInitializing] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  // Detail popup (eye icon)
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<TripRecord | null>(null);
  const [loadingTripDetail, setLoadingTripDetail] = useState(false);

  const [showActionModal, setShowActionModal] = useState(false);
  const [actionTrip, setActionTrip] = useState<TripRecord | null>(null);

  /* End Trip modal */
  const [showEndModal, setShowEndModal] = useState(false);
  const [endTrip, setEndTrip] = useState<TripRecord | null>(null);
  const [endDate, setEndDate] = useState(new Date());
  const [endTime, setEndTime] = useState(new Date());
  // One picker state serves both fields: 'date' | 'time' | null.
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  // iOS shows a spinner in a modal, so it edits a temp value until Done.
  const [tempValue, setTempValue] = useState(new Date());
  const [odometerEnd, setOdometerEnd] = useState('');
  const [maintenanceCost, setMaintenanceCost] = useState('');
  const [endPhotoAsset, setEndPhotoAsset] = useState<PreparedImageAsset | null>(null);
  const [endPhotoPreview, setEndPhotoPreview] = useState<string | null>(null);
  const [fuelProofAsset, setFuelProofAsset] = useState<PreparedImageAsset | null>(null);
  const [fuelProofPreview, setFuelProofPreview] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);

  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extendTrip, setExtendTrip] = useState<TripRecord | null>(null);
  const [extendClientName, setExtendClientName] = useState('');
  const [extendPurpose, setExtendPurpose] = useState('');
  const [extending, setExtending] = useState(false);

  const authHeaders = async () => ({
    Authorization: `Bearer ${await SecureStore.getItemAsync('token')}`,
  });

  const loadTrips = useCallback(async () => {
    try {
      setError('');
      const headers = await authHeaders();
      const response = await fetch(`${TRIPS_API_URL}?page_size=${TRIPS_PAGE_SIZE}`, { headers });
      const text = await response.text();
      if (!response.ok) throw new Error(text);

      const parsed = JSON.parse(text);
      const rows: any[] = Array.isArray(parsed) ? parsed : parsed?.results || [];
      setTrips(rows.map((t: any) => ({ ...t, vehicle_id: Number(t.vehicle_id) })));
    } catch (err) {
      console.log('fetchTrips error:', err);
      setError('Could not load trips. Pull down to retry.');
    }
  }, []);

  // Re-runs on every focus, so a trip saved on Start Trip shows up here as
  // soon as the navigation pops back.
  useFocusEffect(
    useCallback(() => {
      loadTrips().finally(() => setIsInitializing(false));
    }, [loadTrips])
  );

  // Newest first — `created_at` keeps the ordering stable regardless of how
  // the API sorts its list.
  const sortedTrips = useMemo(
    () =>
      [...trips].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))),
    [trips]
  );

  const filteredTrips = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedTrips;
    return sortedTrips.filter(
      (t) =>
        (t.vehicle_name || '').toLowerCase().includes(q) ||
        (t.registration_number || '').toLowerCase().includes(q) ||
        (t.purpose_of_trip || '').toLowerCase().includes(q)
    );
  }, [sortedTrips, query]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTrips();
    setRefreshing(false);
  }, [loadTrips]);

  const openDetail = async (trip: TripRecord) => {
    setSelectedTrip(trip);
    setShowDetailModal(true);
    setLoadingTripDetail(true);

    // The trips list can omit image fields while the detail endpoint returns
    // the same photo URLs used by the web Odometer Photos view.
    try {
      const headers = await authHeaders();
      const response = await fetch(`${TRIPS_API_URL}${trip.id}/`, { headers });
      if (!response.ok) return;
      const detail = await response.json();
      if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
        setSelectedTrip((current) =>
          current?.id === trip.id ? { ...current, ...detail } : current
        );
      }
    } catch (err) {
      console.log('fetchTripDetail error:', err);
    } finally {
      setLoadingTripDetail(false);
    }
  };

  const closeDetail = () => {
    setShowDetailModal(false);
    setSelectedTrip(null);
    setLoadingTripDetail(false);
  };

  const openTripAction = (trip: TripRecord) => {
    setActionTrip(trip);
    setShowActionModal(true);
  };

  const closeActionModal = () => {
    setShowActionModal(false);
    setActionTrip(null);
  };

  const chooseExtendTrip = () => {
    const trip = actionTrip;
    closeActionModal();
    if (!trip) return;
    setExtendTrip(trip);
    setExtendClientName('');
    setExtendPurpose('');
    setShowExtendModal(true);
  };

  const chooseCompleteTrip = () => {
    const trip = actionTrip;
    closeActionModal();
    if (trip) openEndTrip(trip);
  };

  /* ── End Trip ── */
  const openEndTrip = (trip: TripRecord) => {
    setEndTrip(trip);
    setEndDate(new Date());
    setEndTime(new Date());
    setOdometerEnd(trip.odometer_end || '');
    setMaintenanceCost('');
    clearEndPhoto();
    clearFuelProof();
    setShowEndModal(true);
  };

  const closeEndModal = () => {
    if (ending) return;
    setShowEndModal(false);
    setEndTrip(null);
  };

  const closeExtendModal = () => {
    if (extending) return;
    setShowExtendModal(false);
    setExtendTrip(null);
  };

  const submitExtendTrip = async () => {
    if (extending || !extendTrip) return;

    const clientName = extendClientName.trim();
    const purpose = extendPurpose.trim();
    if (!clientName && !purpose) {
      Alert.alert('Validation Error', 'Add a client name or purpose to extend this trip.');
      return;
    }

    const nextClientName = clientName
      ? appendTripExtension(extendTrip.client_name, clientName)
      : extendTrip.client_name || '';
    if (nextClientName.length > 255) {
      Alert.alert('Validation Error', 'Extended client name is too long.');
      return;
    }

    const update = {
      extend: true,
      client_name: clientName,
      purpose_of_trip: purpose,
    };

    try {
      setExtending(true);

      const token = await SecureStore.getItemAsync('token');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

      const response = await fetch(`${TRIPS_API_URL}${extendTrip.id}/`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(update),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const responseText = await response.text();
      if (!response.ok) {
        Alert.alert(`Server Error (${response.status})`, responseText.substring(0, 900));
        return;
      }

      let updatedStatus = '';
      if (responseText.trim()) {
        try {
          const updatedTrip = JSON.parse(responseText);
          updatedStatus = typeof updatedTrip?.status === 'string'
            ? updatedTrip.status.trim().toLowerCase()
            : '';
        } catch {
          // Verify status with the detail endpoint if the update response has no JSON representation.
        }
      }

      if (!updatedStatus) {
        const detailResponse = await fetch(`${TRIPS_API_URL}${extendTrip.id}/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const detailText = await detailResponse.text();
        if (!detailResponse.ok) {
          Alert.alert(`Server Error (${detailResponse.status})`, detailText.substring(0, 900));
          return;
        }
        const updatedTrip = JSON.parse(detailText);
        updatedStatus = typeof updatedTrip?.status === 'string'
          ? updatedTrip.status.trim().toLowerCase()
          : '';
      }

      if (updatedStatus !== 'ongoing') {
        setShowExtendModal(false);
        setExtendTrip(null);
        await loadTrips();
        Alert.alert(
          'Trip Is Already Completed',
          'This trip is already marked completed and cannot be extended. Start a new trip to continue.'
        );
        return;
      }

      setShowExtendModal(false);
      setExtendTrip(null);
      await loadTrips();
      Alert.alert('Trip Extended', 'Client and purpose added. Trip is still ongoing.');
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to extend trip. Please try again.');
    } finally {
      setExtending(false);
    }
  };

  const applyImage = async (
    asset: Awaited<ReturnType<typeof pickImageFromGallery>>,
    setAsset: (value: PreparedImageAsset | null) => void,
    setPreview: (value: string | null) => void
  ) => {
    if (!asset) return;
    const prepared = await prepareImageAsset(asset);
    if (!prepared) return;
    setAsset(prepared);
    setPreview(prepared.uri);
  };

  const pickEndPhoto = async () => applyImage(await pickImageFromGallery(), setEndPhotoAsset, setEndPhotoPreview);

  const takeEndPhoto = async () => applyImage(await captureImageWithCamera(), setEndPhotoAsset, setEndPhotoPreview);

  const pickFuelProof = async () => applyImage(await pickImageFromGallery(), setFuelProofAsset, setFuelProofPreview);

  const takeFuelProof = async () => applyImage(await captureImageWithCamera(), setFuelProofAsset, setFuelProofPreview);

  const clearEndPhoto = () => {
    setEndPhotoAsset(null);
    setEndPhotoPreview(null);
  };

  const clearFuelProof = () => {
    setFuelProofAsset(null);
    setFuelProofPreview(null);
  };

  const openPicker = (kind: 'date' | 'time') => {
    setTempValue(kind === 'date' ? endDate : endTime);
    setPicker(kind);
  };

  const handlePickerChange = (event: any, selected?: Date) => {
    // Android renders the dialog in place, so it closes itself on either choice.
    if (Platform.OS === 'android') setPicker(null);
    if (event?.type === 'dismissed' || !selected) return;

    if (Platform.OS === 'android') {
      if (picker === 'date') setEndDate(selected);
      else setEndTime(selected);
      return;
    }
    setTempValue(selected);
  };

  const confirmIosPicker = () => {
    if (picker === 'date') setEndDate(tempValue);
    else if (picker === 'time') setEndTime(tempValue);
    setPicker(null);
  };

  const submitEndTrip = async (confirmed = false) => {
    if (ending || !endTrip) return;

    const reading = odometerEnd.trim();
    if (!reading) {
      Alert.alert('Validation Error', 'End odometer reading is required.');
      return;
    }
    const endReading = parseFloat(reading);
    if (Number.isNaN(endReading) || endReading < 0) {
      Alert.alert('Validation Error', 'Enter a valid odometer reading.');
      return;
    }
    if (maintenanceCost.trim() && Number.isNaN(parseFloat(maintenanceCost.trim()))) {
      Alert.alert('Validation Error', 'Enter a valid maintenance cost.');
      return;
    }

    if (!confirmed) {
      Alert.alert('End Trip', 'Are you sure you want to end this trip?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'End Trip', style: 'destructive', onPress: () => submitEndTrip(true) },
      ]);
      return;
    }

    const formData = new FormData();
    formData.append('odometer_end', String(endReading));
    formData.append('end_date', toApiDate(endDate));
    formData.append('end_time', toApiTime(endTime));
    // If the backend can't derive the distance itself this is already right —
    // and if it can, this explicit value matches anyway.
    const startReading = toNumber(endTrip.odometer_start);
    if (endReading > startReading) {
      formData.append('distance_covered', String(endReading - startReading));
    }
    if (maintenanceCost.trim()) {
      formData.append('maintenance_cost', String(parseFloat(maintenanceCost.trim())));
    }
    // PATCHing the same record the save went through closes the trip.
    formData.append('status', 'completed');

    if (endPhotoAsset) {
      const photoPart = buildImageFormPart(endPhotoAsset) as any;
      formData.append('odometer_end_image', photoPart);
      formData.append('odometer_image', photoPart);
    }

    if (fuelProofAsset) {
      formData.append('fuel_proof_image', buildImageFormPart(fuelProofAsset) as any);
    }

    try {
      setEnding(true);

      const token = await SecureStore.getItemAsync('token');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

      const response = await fetch(`${TRIPS_API_URL}${endTrip.id}/`, {
        method: 'PATCH',
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

      setShowEndModal(false);
      setEndTrip(null);
      await loadTrips();
      Alert.alert('Trip Completed', 'Your trip has been marked as completed.');
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to end trip. Please try again.');
    } finally {
      setEnding(false);
    }
  };

  /* ── Render ── */
  if (isInitializing) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#F5C451" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color="#1C1B17" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trips</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('StartTrip')}
          style={styles.addBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={24} color="#1C1B17" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color="#A39A85" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search vehicle, reg. no, purpose…"
          placeholderTextColor="#A39A85"
          value={query}
          onChangeText={setQuery}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} activeOpacity={0.7}>
            <Ionicons name="close-circle" size={18} color="#A39A85" />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filteredTrips}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F5C451" />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="car-outline" size={40} color="#C2BBA8" />
            <Text style={styles.emptyStateText}>
              {query ? 'No trips match your search' : error || 'No trips yet'}
            </Text>
            {!query && !!error && (
              <TouchableOpacity style={styles.retryBtn} onPress={onRefresh} activeOpacity={0.8}>
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const started = [formatDate(item.date), item.time].filter(Boolean).join(' · ');

          return (
            <View style={styles.card}>
              <View style={styles.cardTopRow}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.vehicle_name || item.registration_number || 'Vehicle'}
                </Text>
                <Text style={[styles.cardDate, { color: getStatusColor(item) }]}>
                  {getStatusLabel(item)}
                </Text>
              </View>

              <View style={styles.cardBottomRow}>
                <View style={styles.cardInfoCol}>
                  {!!item.registration_number && (
                    <View style={styles.cardTagRow}>
                      <Ionicons name="pricetag-outline" size={13} color="#B5854A" />
                      <Text style={styles.cardPurpose} numberOfLines={1}>
                        {item.registration_number}
                      </Text>
                    </View>
                  )}
                  {!!item.purpose_of_trip && (
                    <View style={styles.cardTagRow}>
                      <Ionicons name="navigate-outline" size={13} color="#A39A85" />
                      <Text style={styles.cardMetaText} numberOfLines={1}>
                        {item.purpose_of_trip}
                      </Text>
                    </View>
                  )}
                  {!!started && (
                    <View style={styles.cardTagRow}>
                      <Ionicons name="calendar-outline" size={13} color="#A39A85" />
                      <Text style={styles.cardMetaText} numberOfLines={1}>
                        {started}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.cardActions}>
                  {getNormalizedTripStatus(item) === 'ongoing' && (
                    <TouchableOpacity
                      style={styles.endBtn}
                      onPress={() => openTripAction(item)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="stop-circle-outline" size={20} color="#C0392B" />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.eyeBtn} onPress={() => openDetail(item)} activeOpacity={0.7}>
                    <Ionicons name="eye-outline" size={20} color="#1C1B17" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        }}
      />

      {/* ── Detail Popup (eye icon) ── */}
      <Modal visible={showDetailModal} animationType="fade" transparent onRequestClose={closeDetail}>
        <View style={styles.detailOverlay}>
          <View style={styles.detailCard}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle} numberOfLines={1}>
                {selectedTrip?.vehicle_name || selectedTrip?.registration_number || 'Trip'}
              </Text>
              <View style={styles.detailHeaderActions}>
                <TouchableOpacity style={styles.detailIconBtn} onPress={closeDetail} activeOpacity={0.7}>
                  <Ionicons name="close" size={20} color="#1C1B17" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={styles.detailBody} contentContainerStyle={{ paddingBottom: 24 }}>
              {selectedTrip &&
                (() => {
                  const status = getStatusLabel(selectedTrip);
                  const statusColor = getStatusColor(selectedTrip);
                  const started = [formatDate(selectedTrip.date), selectedTrip.time].filter(Boolean).join(' · ');
                  const ended = [formatDate(selectedTrip.end_date), selectedTrip.end_time].filter(Boolean).join(' · ');
                  const distance = toNumber(selectedTrip.distance_covered);
                  const services = formatServices(selectedTrip.services);
                  const clientInfo = splitTripExtension(selectedTrip.client_name);
                  const purposeInfo = splitTripExtension(selectedTrip.purpose_of_trip);
                  const isOngoing = getNormalizedTripStatus(selectedTrip) === 'ongoing';
                  // The generic field is used by older API versions: it holds
                  // the start photo for ongoing trips and the end photo after
                  // completion. Keep it on the matching side to avoid showing
                  // one photo twice.
                  const genericImage = resolveImageUrl(selectedTrip.odometer_image);
                  const startUris = [
                    resolveImageUrl(selectedTrip.startImg),
                    resolveImageUrl(selectedTrip.odometer_start_image),
                    isOngoing ? genericImage : undefined,
                  ];
                   const endUris = [
                     resolveImageUrl(selectedTrip.endImg),
                     resolveImageUrl(selectedTrip.odometer_end_image),
                     !isOngoing ? genericImage : undefined,
                   ];
                   const fuelProofUris = [
                     resolveImageUrl(selectedTrip.fuelProofImg),
                     resolveImageUrl(selectedTrip.fuel_proof_image),
                   ];
                   const hasPhotos = [...startUris, ...endUris, ...fuelProofUris].some(Boolean);

                  return (
                    <>
                      <TripDetailRow
                        icon="radio-button-on-outline"
                        label="Status"
                        value={status}
                        valueColor={statusColor}
                      />
                      <TripDetailRow
                        icon="pricetag-outline"
                        label="Registration No"
                        value={selectedTrip.registration_number}
                      />
                      <TripDetailRow
                        icon="business-outline"
                        label="Client Name"
                        value={clientInfo.original}
                      />
                      <TripDetailRow
                        icon="calendar-outline"
                        label="Started"
                        value={started}
                      />
                      <TripDetailRow
                        icon="checkmark-done-outline"
                        label="Ended"
                        value={ended}
                      />
                      <TripDetailRow icon="navigate-outline" label="Purpose" value={purposeInfo.original} />
                      {!!(clientInfo.extended || purposeInfo.extended) && (
                        <View style={styles.extendedSection}>
                          <Text style={styles.extendedSectionTitle}>EXTENDED</Text>
                          <TripDetailRow
                            icon="business-outline"
                            label="Added Client"
                            value={clientInfo.extended}
                          />
                          <TripDetailRow
                            icon="navigate-outline"
                            label="Added Purpose"
                            value={purposeInfo.extended}
                          />
                        </View>
                      )}
                      <TripDetailRow
                        icon="speedometer-outline"
                        label="Odometer Start"
                        value={selectedTrip.odometer_start ? `${formatNumber(selectedTrip.odometer_start)} km` : ''}
                      />
                      <TripDetailRow
                        icon="speedometer-outline"
                        label="Odometer End"
                        value={selectedTrip.odometer_end ? `${formatNumber(selectedTrip.odometer_end)} km` : ''}
                      />
                      <TripDetailRow
                        icon="navigate-outline"
                        label="Distance Covered"
                        value={distance > 0 ? `${formatNumber(distance)} km` : ''}
                      />
                      <TripDetailRow
                        icon="construct-outline"
                        label="Maintenance Cost"
                        value={formatCurrency(selectedTrip.maintenance_cost)}
                      />
                      <TripDetailRow icon="flame-outline" label="Fuel Cost" value={formatCurrency(selectedTrip.fuel_cost)} />
                      <TripDetailRow icon="checkmark-done-outline" label="Services" value={services} />
                      <TripDetailRow icon="person-outline" label="Traveled By" value={selectedTrip.traveled_by || ''} />

                      {loadingTripDetail && !hasPhotos ? (
                        <ActivityIndicator color="#B5854A" style={{ marginTop: 16 }} />
                      ) : null}
                      {hasPhotos && (
                        <View style={styles.tripImagesRow}>
                          <TripPhoto uris={startUris} label="START" />
                          <TripPhoto uris={endUris} label="END" />
                          <TripPhoto uris={fuelProofUris} label="FUEL PROOF" labelAbove />
                        </View>
                      )}
                    </>
                  );
                })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showActionModal} animationType="fade" transparent onRequestClose={closeActionModal}>
        <Pressable style={styles.actionOverlay} onPress={closeActionModal}>
          <Pressable style={styles.actionCard} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.actionTitle}>End Trip</Text>
            <TouchableOpacity style={styles.actionOption} onPress={chooseExtendTrip} activeOpacity={0.7}>
              <View style={[styles.actionIconWrap, { backgroundColor: '#FBF0DA' }]}>
                <Ionicons name="time-outline" size={20} color="#B5854A" />
              </View>
              <View style={styles.actionOptionText}>
                <Text style={styles.actionOptionTitle}>Extend</Text>
                <Text style={styles.actionOptionSubtitle}>Add client and purpose</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#C2BBA8" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionOption} onPress={chooseCompleteTrip} activeOpacity={0.7}>
              <View style={[styles.actionIconWrap, { backgroundColor: '#FCEBE8' }]}>
                <Ionicons name="checkmark-circle-outline" size={20} color="#1E8E4B" />
              </View>
              <View style={styles.actionOptionText}>
                <Text style={styles.actionOptionTitle}>Complete</Text>
                <Text style={styles.actionOptionSubtitle}>End and close this trip</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#C2BBA8" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCancelBtn} onPress={closeActionModal} activeOpacity={0.8}>
              <Text style={styles.actionCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── End Trip Modal ── */}
      <Modal
        visible={showEndModal}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!ending) setShowEndModal(false);
        }}
      >
        <KeyboardAvoidingView
          style={styles.endOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={closeEndModal} />
          <View style={styles.endSheet}>
            <View style={styles.endHandle} />
            <View style={styles.endHeader}>
              <Text style={styles.endTitle}>End Trip</Text>
              <TouchableOpacity style={styles.detailIconBtn} onPress={closeEndModal} activeOpacity={0.7}>
                <Ionicons name="close" size={20} color="#1C1B17" />
              </TouchableOpacity>
            </View>
            {endTrip && (
              <Text style={styles.endSubtitle} numberOfLines={1}>
                {[endTrip.vehicle_name, endTrip.registration_number].filter(Boolean).join(' · ')}
              </Text>
            )}

            <ScrollView contentContainerStyle={styles.endForm} keyboardShouldPersistTaps="handled">
              {/* ── End date ── */}
              <Text style={styles.endLabel}>END DATE</Text>
              <TouchableOpacity style={styles.endSelectInput} onPress={() => openPicker('date')}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '500', color: '#1C1B17' }}>
                  {formatDisplayDate(endDate)}
                </Text>
                <Ionicons name="calendar-outline" size={18} color="#A39A85" />
              </TouchableOpacity>

              {/* ── End time ── */}
              <Text style={styles.endLabel}>END TIME</Text>
              <TouchableOpacity style={styles.endSelectInput} onPress={() => openPicker('time')}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '500', color: '#1C1B17' }}>
                  {formatDisplayTime(endTime)}
                </Text>
                <Ionicons name="time-outline" size={18} color="#A39A85" />
              </TouchableOpacity>

              {/* ── Odometer end ── */}
              <Text style={styles.endLabel}>ODOMETER END (KM)</Text>
              <TextInput
                style={styles.endInput}
                placeholder="End reading in km"
                placeholderTextColor="#A39A85"
                value={odometerEnd}
                onChangeText={setOdometerEnd}
                keyboardType="decimal-pad"
              />

              {/* ── Maintenance cost ── */}
              <Text style={styles.endLabel}>MAINTENANCE COST</Text>
              <TextInput
                style={styles.endInput}
                placeholder="0.00"
                placeholderTextColor="#A39A85"
                value={maintenanceCost}
                onChangeText={setMaintenanceCost}
                keyboardType="decimal-pad"
              />

              {/* ── Odometer end photo ── */}
              <Text style={styles.endLabel}>ODOMETER IMAGE</Text>
              {endPhotoPreview ? (
                <View style={styles.photoPreviewWrap}>
                  <Image source={{ uri: endPhotoPreview }} style={styles.photoPreview} resizeMode="cover" />
                  <TouchableOpacity style={styles.photoRemoveBtn} onPress={clearEndPhoto} activeOpacity={0.7}>
                    <Ionicons name="trash-outline" size={18} color="#C0392B" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.photoBtnRow}>
                  <TouchableOpacity style={styles.photoBtn} onPress={takeEndPhoto} activeOpacity={0.8}>
                    <Ionicons name="camera-outline" size={18} color="#1C1B17" />
                    <Text style={styles.photoBtnText}>Camera</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.photoBtn} onPress={pickEndPhoto} activeOpacity={0.8}>
                    <Ionicons name="image-outline" size={18} color="#1C1B17" />
                    <Text style={styles.photoBtnText}>Gallery</Text>
                  </TouchableOpacity>
                </View>
              )}

              <Text style={styles.endLabel}>FUEL COST PROOF IMAGE</Text>
              {fuelProofPreview ? (
                <View style={styles.photoPreviewWrap}>
                  <Image source={{ uri: fuelProofPreview }} style={styles.photoPreview} resizeMode="cover" />
                  <TouchableOpacity style={styles.photoRemoveBtn} onPress={clearFuelProof} activeOpacity={0.7}>
                    <Ionicons name="trash-outline" size={18} color="#C0392B" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.photoBtnRow}>
                  <TouchableOpacity style={styles.photoBtn} onPress={takeFuelProof} activeOpacity={0.8}>
                    <Ionicons name="camera-outline" size={18} color="#1C1B17" />
                    <Text style={styles.photoBtnText}>Camera</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.photoBtn} onPress={pickFuelProof} activeOpacity={0.8}>
                    <Ionicons name="image-outline" size={18} color="#1C1B17" />
                    <Text style={styles.photoBtnText}>Gallery</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* ── Actions ── */}
              <View style={styles.endActions}>
                <TouchableOpacity
                  style={[styles.endCancelBtn, ending && styles.btnDisabled]}
                  onPress={closeEndModal}
                  disabled={ending}
                  activeOpacity={0.8}
                >
                  <Text style={styles.endCancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.endSaveBtn, ending && styles.btnDisabled]}
                  onPress={() => submitEndTrip()}
                  disabled={ending}
                  activeOpacity={0.8}
                >
                  {ending ? (
                    <ActivityIndicator size="small" color="#F5C451" />
                  ) : (
                    <Text style={styles.endSaveBtnText}>End Trip</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={showExtendModal}
        animationType="slide"
        transparent
        onRequestClose={closeExtendModal}
      >
        <KeyboardAvoidingView
          style={styles.endOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={closeExtendModal} />
          <View style={styles.endSheet}>
            <View style={styles.endHandle} />
            <View style={styles.endHeader}>
              <Text style={styles.endTitle}>Extend Trip</Text>
              <TouchableOpacity style={styles.detailIconBtn} onPress={closeExtendModal} activeOpacity={0.7}>
                <Ionicons name="close" size={20} color="#1C1B17" />
              </TouchableOpacity>
            </View>
            {extendTrip && (
              <Text style={styles.endSubtitle} numberOfLines={1}>
                {[extendTrip.vehicle_name, extendTrip.registration_number].filter(Boolean).join(' · ')}
              </Text>
            )}

            <ScrollView contentContainerStyle={styles.endForm} keyboardShouldPersistTaps="handled">
              <Text style={styles.endLabel}>ADD CLIENT</Text>
              <TextInput
                style={styles.endInput}
                placeholder="Add another client"
                placeholderTextColor="#A39A85"
                value={extendClientName}
                onChangeText={setExtendClientName}
                autoCapitalize="words"
              />

              <Text style={styles.endLabel}>PURPOSE</Text>
              <TextInput
                style={styles.endInput}
                placeholder="Add another purpose"
                placeholderTextColor="#A39A85"
                value={extendPurpose}
                onChangeText={setExtendPurpose}
                autoCapitalize="sentences"
              />

              <View style={styles.endActions}>
                <TouchableOpacity
                  style={[styles.endCancelBtn, extending && styles.btnDisabled]}
                  onPress={closeExtendModal}
                  disabled={extending}
                  activeOpacity={0.8}
                >
                  <Text style={styles.endCancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.endSaveBtn, extending && styles.btnDisabled]}
                  onPress={submitExtendTrip}
                  disabled={extending}
                  activeOpacity={0.8}
                >
                  {extending ? (
                    <ActivityIndicator size="small" color="#F5C451" />
                  ) : (
                    <Text style={styles.endSaveBtnText}>Extend Trip</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Date/time pickers — Android renders inline, iOS uses a modal ── */}
      {picker && Platform.OS === 'android' && (
        <DateTimePicker
          value={picker === 'date' ? endDate : endTime}
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
  centered: { justifyContent: 'center', alignItems: 'center' },
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
  // 44x44 circle — matches the back button so the title stays centred.
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5C451',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#1C1B17' },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 14,
    paddingHorizontal: 16,
    backgroundColor: '#F7F5EE',
    borderRadius: 16,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: '500',
    color: '#1C1B17',
  },

  listContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 32, gap: 10 },

  /* Compact card: title/status row + reg/purpose/date + eye icon */
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: '#1C1B17', marginRight: 8 },
  // Status is shown tinted — gold while a trip is still running
  cardDate: { fontSize: 11, fontWeight: '700' },
  cardBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardInfoCol: { flex: 1, gap: 3 },
  cardTagRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardPurpose: { fontSize: 12, fontWeight: '700', color: '#B5854A', flexShrink: 1 },
  cardMetaText: { fontSize: 12, color: '#A39A85', fontWeight: '500', flexShrink: 1 },
  // Red ''end trip'' action (ongoing trips only) sits next to the neutral eye
  // button so the two intents don't get confused.
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 8 },
  endBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FCEBE8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F7F5EE',
    justifyContent: 'center',
    alignItems: 'center',
  },

  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyStateText: { fontSize: 14, fontWeight: '600', color: '#A39A85', textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 50,
    backgroundColor: '#1C1B17',
  },
  retryBtnText: { fontSize: 13, fontWeight: '800', color: '#F5C451' },

  /* Detail popup */
  detailOverlay: {
    flex: 1,
    backgroundColor: 'rgba(28,27,23,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  detailCard: { backgroundColor: '#FFFFFF', borderRadius: 20, maxHeight: '80%', overflow: 'hidden' },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EAD8',
  },
  detailTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: '#1C1B17', marginRight: 8 },
  detailHeaderActions: { flexDirection: 'row', gap: 8 },
  detailIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F7F5EE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailBody: { paddingHorizontal: 16, paddingTop: 12 },
  detailRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F7F5EE',
  },
  detailRowLabel: { fontSize: 10, fontWeight: '700', color: '#A39A85', letterSpacing: 1, marginBottom: 2 },
  detailRowValue: { fontSize: 14, fontWeight: '600', color: '#1C1B17' },
  extendedSection: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#FBF7EC',
  },
  extendedSectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B5854A',
    letterSpacing: 1.2,
    marginBottom: 4,
  },

  tripImagesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  tripImageWrap: { flex: 1, minWidth: 120 },
  tripImage: { width: '100%', height: 110, borderRadius: 12, backgroundColor: '#F7F5EE' },
  tripImageLabel: { fontSize: 10, fontWeight: '700', color: '#A39A85', letterSpacing: 1, marginTop: 4 },
  tripImageLabelAbove: { marginTop: 0, marginBottom: 4 },

  actionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(28,27,23,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  actionCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, gap: 10 },
  actionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C1B17',
    textAlign: 'center',
    marginBottom: 4,
  },
  actionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FAF9F6',
    borderRadius: 16,
    padding: 14,
  },
  actionIconWrap: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  actionOptionText: { flex: 1, gap: 2 },
  actionOptionTitle: { fontSize: 14, fontWeight: '700', color: '#1C1B17' },
  actionOptionSubtitle: { fontSize: 12, fontWeight: '500', color: '#A39A85' },
  actionCancelBtn: {
    borderRadius: 50,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#F5F4F0',
    borderWidth: 1.5,
    borderColor: '#E8E3D9',
    marginTop: 4,
  },
  actionCancelBtnText: { fontSize: 15, fontWeight: '800', color: '#7E7767' },

  /* End Trip modal */
  endOverlay: {
    flex: 1,
    backgroundColor: 'rgba(28,27,23,0.45)',
    justifyContent: 'flex-end',
  },
  endSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingBottom: 24,
    paddingHorizontal: 16,
    maxHeight: '90%',
  },
  endHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E8E3D9',
    marginBottom: 10,
  },
  endHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  endTitle: { fontSize: 16, fontWeight: '800', color: '#1C1B17' },
  endSubtitle: { fontSize: 12, fontWeight: '600', color: '#A39A85', marginBottom: 8 },
  endForm: { paddingBottom: 8, gap: 6 },
  endLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5C584F',
    letterSpacing: 1.2,
    marginTop: 14,
    marginBottom: 8,
  },
  endInput: {
    backgroundColor: '#F7F5EE',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: '500',
    color: '#1C1B17',
  },
  endSelectInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F7F5EE',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },

  /* Odometer photo (End) */
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

  endActions: { flexDirection: 'row', gap: 12, marginTop: 28 },
  endSaveBtn: {
    flex: 1,
    backgroundColor: '#1C1B17',
    borderRadius: 50,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endSaveBtnText: { fontSize: 16, fontWeight: '800', color: '#F5C451' },
  endCancelBtn: {
    flex: 1,
    backgroundColor: '#F5F4F0',
    borderRadius: 50,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E8E3D9',
  },
  endCancelBtnText: { fontSize: 16, fontWeight: '800', color: '#7E7767' },
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
