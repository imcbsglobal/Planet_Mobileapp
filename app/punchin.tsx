/* eslint-disable prettier/prettier */
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { buildImageFormPart, captureImageWithCamera, pickImageFromGallery, prepareImageAsset } from '../lib/imageUpload';
import * as SecureStore from '../lib/secureStore';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/* ─────────────────────────── Types ─────────────────────────── */

interface UserCredentials {
  userId: string;
  username?: string;
}

interface Client {
  id: string;
  name: string;
  place?: string;
}

interface PunchInEntry {
  id: string;
  client: string;
  clientName: string;
  purpose: string;
  latitude: string;
  longitude: string;
  locationName: string;
  imageUrl?: string | null;
  punchInTime: string;
  punchOutTime: string | null;
  createdByName?: string;
createdByUsername?: string;

}

interface CapturedImage {
  uri: string;
  name: string;
  type: string;
}

const formatServerError = (responseText: string) => {
  try {
    const parsed = JSON.parse(responseText);
    return parsed.message || parsed.detail || parsed.error || JSON.stringify(parsed, null, 2);
  } catch {
    return responseText;
  }
};

/* ─────────────────────────── Constants ─────────────────────── */

const PUNCHIN_API_URL = 'https://planet.imcbs.com/api/punchin/punchins/';
// AFTER
// AFTER
const ACC_MASTER_API_URL = 'https://planet.imcbs.com/api/clientmaster/clientmaster/?names=1';
const FETCH_TIMEOUT = 15000;

/* ─────────────────────────── Component ─────────────────────── */

const PURPOSE_SUGGESTIONS = ['Quotation', 'Product Enquiry', 'Pricing', 'Follow-up', 'Complaint', 'Other'];

export default function PunchIn() {
  const navigation = useNavigation<any>();

  const [userCredentials, setUserCredentials] = useState<UserCredentials | null>(null);
  const usernameRef = React.useRef<string>('');
  const [isInitializing, setIsInitializing] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [clientSearchText, setClientSearchText] = useState('');
  const [clientMode, setClientMode] = useState<'new' | 'existing'>('new');
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
    const [localClientNames, setLocalClientNames] = useState<Record<string, string>>({});

  const [entries, setEntries] = useState<PunchInEntry[]>([]);
  const [loginId, setLoginId] = useState<string>('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const [purpose, setPurpose] = useState('');
  const [showPurposeDropdown, setShowPurposeDropdown] = useState(false);
  const [locationName, setLocationName] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const [capturedImage, setCapturedImage] = useState<CapturedImage | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [imageLat, setImageLat] = useState<number | null>(null);
  const [imageLng, setImageLng] = useState<number | null>(null);
const [selectedEntry, setSelectedEntry] = useState<PunchInEntry | null>(null);
const [editingId, setEditingId] = useState<string | null>(null);

  /* ── Helpers ── */
  const getFirstValue = (item: any, keys: string[]) => {
    for (const key of keys) {
      const value = item?.[key];
      if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
    }
    return '';
  };

  const authHeaders = async () => ({
    Authorization: `Bearer ${await SecureStore.getItemAsync('token')}`,
  });

  /* ── Fetch clients (for the picker) ── */
  const fetchClients = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
      const headers = await authHeaders();
      const response = await fetch(ACC_MASTER_API_URL, { headers, signal: controller.signal });
      clearTimeout(timeoutId);
      const text = await response.text();
      if (!response.ok) {
        console.log('fetchClients error:', response.status, text);
        return;
      }
    // AFTER
      const parsed = JSON.parse(text);
      const rows = Array.isArray(parsed) ? parsed : parsed?.data || parsed?.results || [];
      console.log('fetchClients raw rows:', JSON.stringify(rows.slice(0, 3)));

      const formatted: Client[] = rows
        .filter((c: any) => getFirstValue(c, ['client_name', 'name']))
        .map((c: any, i: number) => ({
          id: getFirstValue(c, ['id']) || i.toString(),
          name: getFirstValue(c, ['client_name', 'name']),
          place: getFirstValue(c, ['place', 'location', 'address', 'address3']),
        }));
      console.log('fetchClients formatted count:', formatted.length);
      setClients(formatted);
    } catch (err) {
      console.log('fetchClients error:', err);
    }
  };

  /* ── Fetch punch-in list ── */
  const fetchEntries = async (usernameOverride?: string) => {
    try {
      const headers = await authHeaders();
      const response = await fetch(PUNCHIN_API_URL, { headers });
      const text = await response.text();
      if (!response.ok) throw new Error(text);

     // AFTER
      const rows = JSON.parse(text);
      const formatted: PunchInEntry[] = (Array.isArray(rows) ? rows : []).map((r: any) => ({
        id: String(r.id),
        client: String(r.client ?? ''),
        clientName: r.client_name || localClientNames[String(r.id)] || '',
        purpose: r.purpose || '',
        latitude: r.latitude || '',
        longitude: r.longitude || '',
        locationName: r.location_name || '',
        imageUrl: r.image_url || r.image || null,
        punchInTime: r.punch_in_time || '',
        punchOutTime: r.punch_out_time || null,
        createdByName: r.created_by_name || '',
        createdByUsername: r.created_by_username || '',
      }));

// Only this user's own punch-ins
       const activeUsername = usernameOverride ?? usernameRef.current ?? '';
       console.log('DEBUG activeUsername:', JSON.stringify(activeUsername));
       console.log('DEBUG server usernames:', JSON.stringify(formatted.map(e => e.createdByUsername || e.createdByName)));
     const mine = formatted.filter(
    e => (e.createdByUsername || e.createdByName || '').trim().toLowerCase() ===
         activeUsername.trim().toLowerCase()
  );

      // Most recent first
      mine.sort((a, b) => (a.punchInTime < b.punchInTime ? 1 : -1));
      setEntries(mine);
   } catch (err) {
      console.log('fetchEntries error:', err);
      Alert.alert('Connection Error', 'Could not load punch-in list. Please check your connection and try again.');
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchEntries(), fetchClients()]);
    setRefreshing(false);
  }, []);
    const hasActivePunchIn = entries.some(e => !e.punchOutTime);

  /* ── Init ── */
  useEffect(() => {
    const init = async () => {
      try {
        const [userId, username, storedLoginId] = await Promise.all([
          SecureStore.getItemAsync('userId'),
          SecureStore.getItemAsync('username'),
          SecureStore.getItemAsync('loginId'),
        ]);
        if (!userId) {
          navigation.replace('Login');
          return;
        }
      const resolvedUsername = username || userId;
        usernameRef.current = resolvedUsername;
        setUserCredentials({ userId, username: resolvedUsername });
        setLoginId(storedLoginId || '');
        await Promise.all([fetchEntries(resolvedUsername), fetchClients()]);
      } finally {
        setIsInitializing(false);
      }
    };
    init();
  }, []);

  /* ── Location ── */
  const detectLocation = async () => {
    try {
      setIsLocating(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Location permission is needed to punch in.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLatitude(position.coords.latitude);
      setLongitude(position.coords.longitude);

      try {
        const [place] = await Location.reverseGeocodeAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        if (place) {
          const parts = [place.city || place.subregion, place.region].filter(Boolean);
          setLocationName(parts.join(', ') || place.name || '');
        }
      } catch {
        // reverse geocode is best-effort — lat/lng alone is still usable
      }
    } catch {
      Alert.alert('Error', 'Failed to get current location. Please try again.');
    } finally {
      setIsLocating(false);
    }
  };

  /* ── Camera (image proof) ── */
  const applyPickedImage = async (asset: Awaited<ReturnType<typeof pickImageFromGallery>>) => {
    if (!asset) return;
    const prepared = await prepareImageAsset(asset);
    if (!prepared) return;
    setCapturedImage(prepared);
    setExistingImageUrl(null);
    setImageLat(latitude);
    setImageLng(longitude);
  };

  const pickImage = async () => applyPickedImage(await pickImageFromGallery());

  const takePhoto = async () => applyPickedImage(await captureImageWithCamera());

  const resetForm = () => {
    setClientMode('existing');
    setSelectedClient(null);
    setClientSearchText('');
    setNewClientName('');
    setNewClientPhone('');
    setPurpose('');
    setLocationName('');
    setLatitude(null);
    setLongitude(null);
    setCapturedImage(null);
    setExistingImageUrl(null);
    setImageLat(null);
    setImageLng(null);
  };

  /* ── Submit ── */
  const handleSubmit = async () => {
    if (!loginId || !userCredentials?.userId) {
      Alert.alert('Error', 'Session expired. Please login again.');
      navigation.replace('Login');
      return;
    }
   if (clientMode === 'existing' && !selectedClient) {
      Alert.alert('Validation Error', 'Please select a client.');
      return;
    }
    if (clientMode === 'new' && !newClientName.trim()) {
      Alert.alert('Validation Error', 'Please enter the client name.');
      return;
    }
    if (clientMode === 'new' && !newClientPhone.trim()) {
      Alert.alert('Validation Error', 'Please enter the client phone number.');
      return;
    }
    if (!purpose.trim()) {
      Alert.alert('Validation Error', 'Please enter a purpose.');
      return;
    }
    if (latitude === null || longitude === null) {
      Alert.alert('Validation Error', 'Please capture your current location.');
      return;
    }
    if (!capturedImage && !existingImageUrl) {
      Alert.alert('Validation Error', 'Please take or choose a photo to punch in.');
      return;
    }

    try {
      setLoading(true);

      const formData = new FormData();
      // Backend doesn't auto-fill created_by from the auth token — send it explicitly,
      // same fix as enquiry.tsx's "creator" field.
      formData.append('created_by_name', userCredentials?.username || userCredentials?.userId || '');
      let resolvedClientId: string | null = null;

      if (clientMode === 'existing' && selectedClient) {
        resolvedClientId = selectedClient.id;
      } else {
        const createHeaders = await authHeaders();
        const createRes = await fetch(
          'https://planet.imcbs.com/api/clientmaster/clientmaster/',
          {
            method: 'POST',
            headers: { ...createHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newClientName.trim() }),
          }
        );
        const createText = await createRes.text();
        if (!createRes.ok) {
          throw new Error(formatServerError(createText));
        }
        const createdClient = JSON.parse(createText);
        resolvedClientId = String(createdClient.id);
      }

      if (resolvedClientId) {
        formData.append('client', resolvedClientId);
      }
      formData.append('phone', newClientPhone.trim());
      formData.append('purpose', purpose.trim());
      formData.append('latitude', latitude.toFixed(6));
      formData.append('longitude', longitude.toFixed(6));
      formData.append('location_name', locationName || '');
      formData.append('image_latitude', (imageLat ?? latitude).toFixed(6));
      formData.append('image_longitude', (imageLng ?? longitude).toFixed(6));
      if (capturedImage) {
        formData.append('image', buildImageFormPart(capturedImage) as any);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
      const headers = await authHeaders();

      const url = editingId ? `${PUNCHIN_API_URL}${editingId}/` : PUNCHIN_API_URL;
       const response = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers,
        body: formData,
        signal: controller.signal,
        });
      const debugText = await response.clone().text();
      console.log('PUNCHIN SUBMIT RESPONSE:', response.status, debugText);

      if (clientMode === 'new' && newClientName.trim() && response.ok) {
        const created = JSON.parse(debugText);
        setLocalClientNames(prev => ({ ...prev, [String(created.id)]: newClientName.trim() }));
      }
      clearTimeout(timeoutId);

      const responseText = await response.text();
      if (!response.ok) {
        Alert.alert(`Server Error (${response.status})`, formatServerError(responseText).substring(0, 900));
        return;
      }

      setShowAddModal(false);
        setEditingId(null);
        resetForm();
        await fetchEntries();
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to punch in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /* ── Punch out ── */
  const handlePunchOut = async (entry: PunchInEntry) => {
    Alert.alert('Punch Out', `Punch out of ${entry.clientName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Punch Out',
        style: 'destructive',
        onPress: async () => {
          try {
            const headers = await authHeaders();
            const response = await fetch(`${PUNCHIN_API_URL}${entry.id}/`, {
              method: 'PATCH',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({ punch_out_time: new Date().toISOString() }),
            });
            const text = await response.text();
            if (!response.ok) {
              Alert.alert(`Server Error (${response.status})`, formatServerError(text).substring(0, 900));
              return;
            }
            await fetchEntries();
          } catch {
            Alert.alert('Error', 'Failed to punch out. Please try again.');
          }
        },
      },
    ]);
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#1C1B17" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Punch In</Text>
        <TouchableOpacity
          onPress={() => setShowAddModal(true)}
          style={[styles.addBtn, hasActivePunchIn && { opacity: 0.4 }]}
          disabled={hasActivePunchIn}
        >
          <Ionicons name="add" size={24} color="#1C1B17" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={entries}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F5C451" />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="finger-print-outline" size={40} color="#C2BBA8" />
            <Text style={styles.emptyStateText}>No punch-ins yet</Text>
          </View>
        }
        renderItem={({ item }) => (
  <View style={styles.card}>
    <View style={styles.cardRow}>
      <Text style={styles.cardTitle}>{item.clientName || 'Unknown client'}</Text>
      <TouchableOpacity onPress={() => setSelectedEntry(item)} hitSlop={8}>
        <Ionicons name="eye-outline" size={20} color="#A39A85" />
      </TouchableOpacity>
    </View>
    <Text style={styles.cardMetaText}>
      {item.punchInTime ? new Date(item.punchInTime).toLocaleDateString() : '—'}
    </Text>
    {!!item.locationName && (
      <View style={styles.cardMetaRow}>
        <Ionicons name="location-outline" size={14} color="#A39A85" />
        <Text style={styles.cardMetaText}>{item.locationName}</Text>
      </View>
    )}
    {!item.punchOutTime ? (
      <TouchableOpacity style={styles.punchOutBtn} onPress={() => handlePunchOut(item)}>
        <Text style={styles.punchOutBtnText}>Punch Out</Text>
      </TouchableOpacity>
    ) : (
      <View style={styles.doneBadge}>
        <Text style={styles.doneBadgeText}>Completed</Text>
      </View>
    )}
  </View>
)}

      />

      {/* ── Detail Modal ── */}
      <Modal visible={!!selectedEntry} transparent animationType="fade" onRequestClose={() => setSelectedEntry(null)}>
        <View style={styles.pickerOverlay}>
          <SafeAreaView style={[styles.modalRoot, { justifyContent: 'center', padding: 16 }]}>
            <View style={styles.card}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{selectedEntry?.clientName}</Text>
                <TouchableOpacity onPress={() => setSelectedEntry(null)}>
                  <Ionicons name="close" size={22} color="#1C1B17" />
                </TouchableOpacity>
              </View>

              {!!selectedEntry?.imageUrl && (
                <Image source={{ uri: selectedEntry.imageUrl }} style={styles.cardImage} resizeMode="cover" />
              )}

              <View style={styles.cardMetaRow}>
                <Ionicons name="time-outline" size={14} color="#A39A85" />
                <Text style={styles.cardMetaText}>
                  {selectedEntry?.punchInTime ? new Date(selectedEntry.punchInTime).toLocaleString() : '—'}
                  {selectedEntry?.punchOutTime ? ` → ${new Date(selectedEntry.punchOutTime).toLocaleTimeString()}` : ''}
                </Text>
              </View>

              <View style={styles.cardMetaRow}>
                <Ionicons name="location-outline" size={14} color="#A39A85" />
                <Text style={styles.cardMetaText}>{selectedEntry?.locationName}</Text>
              </View>

              <Text style={styles.cardSub}>{selectedEntry?.purpose}</Text>

              {!selectedEntry?.punchOutTime && (
                <TouchableOpacity
                  style={[styles.punchOutBtn, { marginTop: 10 }]}
                  onPress={() => {
                    if (!selectedEntry) return;
                    const match = clients.find(c => c.id === selectedEntry.client);
                    setSelectedClient(match || { id: selectedEntry.client, name: selectedEntry.clientName });
                    setPurpose(selectedEntry.purpose);
                    setLocationName(selectedEntry.locationName);
                    setLatitude(parseFloat(selectedEntry.latitude) || null);
                    setLongitude(parseFloat(selectedEntry.longitude) || null);
                    setCapturedImage(null);
                    setExistingImageUrl(selectedEntry.imageUrl || null);
                    setEditingId(selectedEntry.id);
                    setSelectedEntry(null);
                    setShowAddModal(true);
                  }}
                >
                  <Text style={styles.punchOutBtnText}>Edit</Text>
                </TouchableOpacity>
              )}
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      {/* ── Add Modal ── */}
      <Modal visible={showAddModal} animationType="slide" onRequestClose={() => setShowAddModal(false)}>
        <SafeAreaView style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setShowAddModal(false); setEditingId(null); resetForm(); }} style={styles.backBtn}>
              <Ionicons name="close" size={22} color="#1C1B17" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{editingId ? 'Edit Punch In' : 'New Punch In'}</Text>
            <View style={{ width: 44 }} />
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
              {/* Client Type toggle */}
              <Text style={styles.label}>CLIENT TYPE</Text>
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[styles.toggleBtn, clientMode === 'new' && styles.toggleBtnActive]}
                  onPress={() => {
                    setClientMode('new');
                    setSelectedClient(null);
                  }}
                >
                  <Text style={styles.toggleBtnText}>New Client</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleBtn, clientMode === 'existing' && styles.toggleBtnActive]}
                  onPress={() => setClientMode('existing')}
                >
                  <Text style={styles.toggleBtnText}>Existing Client</Text>
                </TouchableOpacity>
              </View>

              {clientMode === 'existing' ? (
                <>
                  <Text style={styles.label}>CLIENT</Text>
                  <TouchableOpacity style={styles.selectField} onPress={() => setShowClientPicker(true)}>
                    <Text style={selectedClient ? styles.selectFieldText : styles.selectFieldPlaceholder}>
                      {selectedClient ? selectedClient.name : 'Select client'}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color="#A39A85" />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.label}>CLIENT NAME</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Client name"
                    placeholderTextColor="#A39A85"
                    value={newClientName}
                    onChangeText={setNewClientName}
                  />
                  <Text style={styles.label}>CLIENT PHONE</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Phone number"
                    placeholderTextColor="#A39A85"
                    value={newClientPhone}
                    onChangeText={setNewClientPhone}
                    keyboardType="phone-pad"
                  />
                </>
              )}

              {/* Purpose */}
              <Text style={styles.label}>PURPOSE</Text>
              <TouchableOpacity
                style={styles.selectField}
                onPress={() => setShowPurposeDropdown(prev => !prev)}
              >
                <Text style={purpose ? styles.selectFieldText : styles.selectFieldPlaceholder}>
                  {purpose || 'Select purpose'}
                </Text>
                <Ionicons name={showPurposeDropdown ? 'chevron-up' : 'chevron-down'} size={18} color="#A39A85" />
              </TouchableOpacity>
              {showPurposeDropdown && (
                <View style={styles.dropdownBox}>
                  {PURPOSE_SUGGESTIONS.map(p => (
                    <TouchableOpacity
                      key={p}
                      style={styles.dropdownItem}
                      onPress={() => {
                        setPurpose(p);
                        setShowPurposeDropdown(false);
                      }}
                    >
                      <Text style={styles.dropdownItemTitle}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Location */}
              <Text style={styles.label}>LOCATION</Text>
              <TouchableOpacity style={styles.locationBtn} onPress={detectLocation} disabled={isLocating}>
                {isLocating ? (
                  <ActivityIndicator size="small" color="#1C1B17" />
                ) : (
                  <Ionicons name="locate-outline" size={18} color="#1C1B17" />
                )}
                <Text style={styles.locationBtnText}>
                  {latitude !== null ? locationName || `${latitude.toFixed(4)}, ${longitude?.toFixed(4)}` : 'Capture current location'}
                </Text>
              </TouchableOpacity>

              {/* Photo */}
              <Text style={styles.label}>PHOTO PROOF</Text>
              {capturedImage ? (
                <View style={styles.previewWrap}>
                  <Image source={{ uri: capturedImage.uri }} style={styles.previewImage} />
                  <TouchableOpacity style={styles.removeBtn} onPress={() => setCapturedImage(null)}>
                    <Ionicons name="close-circle" size={24} color="#1C1B17" />
                  </TouchableOpacity>
                </View>
              ) : existingImageUrl ? (
                <View style={styles.previewWrap}>
                  <Image source={{ uri: existingImageUrl }} style={styles.previewImage} />
                  <View style={styles.existingBadge}>
                    <Text style={styles.existingBadgeText}>Current photo</Text>
                  </View>
                </View>
              ) : null}
              <View style={styles.photoBtnRow}>
                <TouchableOpacity style={[styles.cameraBtn, { flex: 1 }]} onPress={pickImage}>
                  <Ionicons name="images-outline" size={20} color="#1C1B17" />
                  <Text style={styles.cameraBtnText}>Gallery</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.cameraBtn, { flex: 1 }]} onPress={takePhoto}>
                  <Ionicons name="camera-outline" size={20} color="#1C1B17" />
                  <Text style={styles.cameraBtnText}>Camera</Text>
                </TouchableOpacity>
              </View>

            
              <TouchableOpacity
                style={[styles.submitBtn, loading && { opacity: 0.6 }]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#F5C451" />
                ) : (
                  <Text style={styles.submitBtnText}>Punch In</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>

          {/* ── Client Picker overlay (kept inside this Modal — a second
               <Modal> here won't reliably present on top of an already-open
               one on iOS) ── */}
          {showClientPicker && (
            <View style={styles.pickerOverlay}>
              <SafeAreaView style={styles.modalRoot}>
                <View style={styles.modalHeader}>
                  <TouchableOpacity onPress={() => setShowClientPicker(false)} style={styles.backBtn}>
                    <Ionicons name="close" size={22} color="#1C1B17" />
                  </TouchableOpacity>
                  <Text style={styles.modalTitle}>Select Client</Text>
                  <View style={{ width: 44 }} />
                </View>
                <View style={styles.searchBar}>
                  <Ionicons name="search" size={16} color="#A39A85" />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search clients..."
                    placeholderTextColor="#A39A85"
                    value={clientSearchText}
                    onChangeText={setClientSearchText}
                    autoFocus
                  />
                </View>
                <FlatList
                  data={clients.filter(c => c.name.toLowerCase().includes(clientSearchText.toLowerCase()))}
                  keyExtractor={item => item.id}
                  keyboardShouldPersistTaps="handled"
                  ListEmptyComponent={
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyStateText}>No clients found</Text>
                    </View>
                  }
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.dropdownItem}
                      onPress={() => {
                        setSelectedClient(item);
                        setShowClientPicker(false);
                        setClientSearchText('');
                      }}
                    >
                      <Text style={styles.dropdownItemTitle}>{item.name}</Text>
                      {!!item.place && <Text style={styles.dropdownItemSub}>{item.place}</Text>}
                    </TouchableOpacity>
                  )}
                />
              </SafeAreaView>
            </View>
          )}
        </SafeAreaView>
      </Modal>
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
    paddingVertical: 12,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center',
  },
  addBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#F5C451', justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#1C1B17' },
  listContent: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1C1B17' },
  cardSub: { fontSize: 13, color: '#6E695F', fontWeight: '500' },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardMetaText: { fontSize: 12, color: '#A39A85', fontWeight: '500' },
  cardImage: { width: '100%', height: 160, borderRadius: 12, marginTop: 6 },
  punchOutBtn: { backgroundColor: '#1C1B17', borderRadius: 50, paddingHorizontal: 14, paddingVertical: 8 },
  punchOutBtnText: { color: '#F5C451', fontSize: 12, fontWeight: '700' },
  doneBadge: { backgroundColor: '#EFEAD8', borderRadius: 50, paddingHorizontal: 12, paddingVertical: 6 },
  doneBadgeText: { color: '#6E695F', fontSize: 11, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyStateText: { fontSize: 14, fontWeight: '600', color: '#A39A85' },

  // AFTER
  modalRoot: { flex: 1, backgroundColor: '#FAF9F6' },
  pickerOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#FAF9F6',
    zIndex: 50,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F0EAD8',
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#1C1B17' },
  form: { padding: 20, gap: 6, paddingBottom: 48 },
  label: { fontSize: 11, fontWeight: '700', color: '#5C584F', letterSpacing: 1.2, marginTop: 14, marginBottom: 8 },
  input: {
    backgroundColor: '#F7F5EE', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, fontWeight: '500', color: '#1C1B17',
  },
  toggleRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  toggleBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14,
    backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E8E3D9', borderRadius: 16,
  },
  toggleBtnActive: { borderColor: '#F5C451', borderStyle: 'solid', backgroundColor: '#FFF9E9' },
  toggleBtnText: { fontSize: 13, fontWeight: '700', color: '#1C1B17' },
  selectField: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F7F5EE', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14,
  },
  selectFieldText: { fontSize: 15, fontWeight: '600', color: '#1C1B17' },
  selectFieldPlaceholder: { fontSize: 15, fontWeight: '500', color: '#A39A85' },
  locationBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F7F5EE', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14,
  },
  locationBtnText: { fontSize: 14, fontWeight: '600', color: '#1C1B17', flexShrink: 1 },
  cameraBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: '#E8E3D9', borderStyle: 'dashed', borderRadius: 16, paddingVertical: 20,
  },
  cameraBtnText: { fontSize: 14, fontWeight: '700', color: '#1C1B17' },
  photoBtnRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  previewWrap: { borderRadius: 16, overflow: 'hidden', height: 200, position: 'relative' },
  existingBadge: {
    position: 'absolute', bottom: 10, left: 10,
    backgroundColor: 'rgba(28,27,23,0.75)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6,
  },
  existingBadgeText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  previewImage: { width: '100%', height: '100%' },
  removeBtn: { position: 'absolute', top: 10, right: 10, backgroundColor: '#FFFFFF', borderRadius: 14 },
  submitBtn: {
    marginTop: 24, backgroundColor: '#1C1B17', borderRadius: 50, paddingVertical: 18, alignItems: 'center',
  },
  submitBtnText: { fontSize: 16, fontWeight: '800', color: '#F5C451' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginVertical: 12, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#FFFFFF', borderRadius: 50, borderWidth: 1.5, borderColor: '#E8E3D9',
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1C1B17', padding: 0 },
  dropdownBox: {
    backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E8E3D9',
    marginTop: 6, overflow: 'hidden',
  },
  dropdownItem: {
    marginHorizontal: 16, marginBottom: 8, backgroundColor: '#FFFFFF', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  dropdownItemTitle: { fontSize: 14, fontWeight: '700', color: '#1C1B17' },
  dropdownItemSub: { fontSize: 12, color: '#A39A85', fontWeight: '500', marginTop: 2 },
});
