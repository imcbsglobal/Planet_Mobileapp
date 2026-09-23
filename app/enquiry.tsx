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
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
/* ─────────────────────────── Types ─────────────────────────── */

interface EnquiryEntry {
  id: string;
  owner: string;
  shop: string;
  phone: string;
  location: string;
  branch?: string;
  purpose: string;
  requirements?: string[];
  notes?: string;
  imageUrl?: string | null;
  audioUrl?: string | null;
  creator?: string;
  date: string;
}

interface CapturedImage {
  uri: string;
  name: string;
  type: string;
}

interface CapturedAudio {
  uri: string;
  name: string;
  type: string;
}

interface ClientOption {
  id: string | number;
  owner: string;
  shop: string;
  phone: string;
  location: string;
}

interface Branch {
  id: string;
  name: string;
  code?: string;
}
interface SoftwareItem {
  id: number;
  name: string;
  type: string; // RA | IA | HW | OTHERS
}

const parseJsonArray = (raw: any): string[] => {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  } catch {
    return [];
  }
};

const formatServerError = (responseText: string) => {
  try {
    const parsed = JSON.parse(responseText);
    return parsed.message || parsed.detail || parsed.error || JSON.stringify(parsed, null, 2);
  } catch {
    return responseText;
  }
};

/**
 * The clientmaster API can return different field names depending on how the
 * backend serializer is set up. This maps the most common variants to a
 * consistent shape. If your clients aren't showing correctly, log a raw
 * row from CLIENT_API_URL and adjust the keys below to match.
 */
const mapClient = (c: any): ClientOption => ({
  id: c.id,
  owner: c.owner || c.owner_name || c.contact_person || c.name || '',
  shop: c.shop || c.shop_name || c.business_name || c.company_name || c.name || '',
  phone: c.phone || c.phone_number || c.mobile || c.contact_number || '',
  location: c.location || c.address || c.place || '',
});

/* ─────────────────────────── Constants ─────────────────────── */

const ENQUIRY_API_URL = 'https://planet.imcbs.com/api/enquiry/enquiries/';
const CLIENT_API_URL = 'https://planet.imcbs.com/api/clientmaster/clientmaster/?page=1&page_size=50';
const ACC_DEPARTMENTS_API_URL = 'https://accmaster.imcbs.com/api/sync/acc-departments/';
const SOFTWARE_API_URL = 'https://planet.imcbs.com/api/master/software/';
const FETCH_TIMEOUT = 15000;
const PURPOSE_SUGGESTIONS = ['Quotation', 'Product Enquiry', 'Pricing', 'Follow-up', 'Complaint', 'Other'];
const TYPE_OPTIONS = ['RA', 'IA', 'HW', 'OTHERS'];

/* ─────────────────────────── Audio Player ────────────────────
   Small reusable play/pause control. Used both for previewing a
   freshly recorded voice note and for playing back a saved one. */

function AudioPlayer({ uri, tint = '#1C1B17' }: { uri: string; tint?: string }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);

  const togglePlay = async () => {
    try {
      setIsBuffering(true);
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      if (status.playing) {
        player.pause();
        setIsPlaying(false);
      } else {
        if (status.didJustFinish) await player.seekTo(0);
        player.play();
        setIsPlaying(true);
      }
    } catch (err) {
      console.log('audio playback error', err);
      Alert.alert('Error', 'Failed to play the voice note.');
    } finally {
      setIsBuffering(false);
    }
  };

  return (
    <TouchableOpacity style={styles.audioPlayer} onPress={togglePlay} activeOpacity={0.8}>
      {isBuffering || status.isBuffering ? (
        <ActivityIndicator size="small" color={tint} />
      ) : (
        <Ionicons name={status.playing || isPlaying ? 'pause-circle' : 'play-circle'} size={30} color={tint} />
      )}
      <Text style={[styles.audioPlayerText, { color: tint }]}>{status.playing || isPlaying ? 'Playing…' : 'Play voice note'}</Text>
    </TouchableOpacity>
  );
}

/* ─────────────────────────── Detail Row ──────────────────────── */

function DetailRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value?: string }) {
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={16} color="#A39A85" style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.detailRowLabel}>{label}</Text>
        <Text style={styles.detailRowValue}>{value}</Text>
      </View>
    </View>
  );
}

/* ─────────────────────────── Component ─────────────────────── */

export default function Enquiry() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [isInitializing, setIsInitializing] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [entries, setEntries] = useState<EnquiryEntry[]>([]);

  // Identity of the logged-in user — used to only show their own enquiries.
  const [myUsername, setMyUsername] = useState('');
  const [myUserId, setMyUserId] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  // Detail popup (eye icon)
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<EnquiryEntry | null>(null);

  const [owner, setOwner] = useState('');
  const [shop, setShop] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');

  const [capturedImage, setCapturedImage] = useState<CapturedImage | null>(null);
  const [capturedAudio, setCapturedAudio] = useState<CapturedAudio | null>(null);
  // When editing, these hold the URLs already saved on the server so they
  // can be previewed/played until the user chooses to replace them.
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [existingAudioUrl, setExistingAudioUrl] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  /* ── Client search (fetched from clientmaster API) ── */
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientsLoaded, setClientsLoaded] = useState(false);
  const [loadingClients, setLoadingClients] = useState(false);
  const [clientQuery, setClientQuery] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [clientMode, setClientMode] = useState<'new' | 'existing'>('new'); // always defaults to "new"
  const [showPurposeDropdown, setShowPurposeDropdown] = useState(false);

    /* ── Branch / Department (fetched from acc-departments API) ── */
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoaded, setBranchesLoaded] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [branchQuery, setBranchQuery] = useState('');
 const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState('');

  /* ── Software Type / Requirements (fetched from master/software API) ── */
  const [softwareList, setSoftwareList] = useState<SoftwareItem[]>([]);
  const [softwareLoaded, setSoftwareLoaded] = useState(false);
  const [loadingSoftware, setLoadingSoftware] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedRequirements, setSelectedRequirements] = useState<string[]>([]);
  const [showRequirementsModal, setShowRequirementsModal] = useState(false);

  /* ── Init ── */
  useEffect(() => {
    const init = async () => {
      try {
        const userId = await SecureStore.getItemAsync('userId');
        if (!userId) {
          navigation.replace('Login');
          return;
        }
        const username = await SecureStore.getItemAsync('username');
        setMyUserId(userId || '');
        setMyUsername(username || '');
        await fetchEntries();
      } finally {
        setIsInitializing(false);
      }
    };
    init();
  }, []);

  // Load the client list the first time the form modal is opened.
  useEffect(() => {
    if (showAddModal && !clientsLoaded) {
      fetchClients();
    }
  }, [showAddModal, clientsLoaded]);

    useEffect(() => {
    if (showAddModal && !branchesLoaded) {
      fetchBranches();
    }
  }, [showAddModal, branchesLoaded]);

  useEffect(() => {
    if (showAddModal && !softwareLoaded) {
      fetchSoftwareList();
    }
  }, [showAddModal, softwareLoaded]);

  const authHeaders = async () => ({
    Authorization: `Bearer ${await SecureStore.getItemAsync('token')}`,
  });

  const fetchEntries = async () => {
    try {
      const headers = await authHeaders();
      const response = await fetch(ENQUIRY_API_URL, { headers });
      const text = await response.text();
      if (!response.ok) throw new Error(text);

      const rows = JSON.parse(text);
      const formatted: EnquiryEntry[] = (Array.isArray(rows) ? rows : []).map((r: any) => ({
        id: String(r.id),
        owner: r.owner || '',
        shop: r.shop || '',
        phone: r.phone || '',
        location: r.location || '',
        branch: r.branch || '',
        purpose: r.purpose || '',
        requirements: r.software ? r.software.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
        notes: r.notes || '',
        imageUrl: r.image_url || r.image || null,
        audioUrl: r.audio_url || r.audio || null,
        creator: r.creator || '',
        date: r.date || r.created_at || '',
      }));

      formatted.sort((a, b) => (a.date < b.date ? 1 : -1));
      setEntries(formatted);
    } catch (err) {
      console.log('fetchEntries error:', err);
    }
  };

  // Only the logged-in user's own enquiries. `creator` on the API can be
  // either the username or the login id (email) depending on the account,
  // so both are checked.
  const myEntries = React.useMemo(() => {
    const uname = myUsername.trim().toLowerCase();
    const uid = myUserId.trim().toLowerCase();
    if (!uname && !uid) return [];
    return entries.filter(e => {
      const creator = (e.creator || '').trim().toLowerCase();
      if (!creator) return false;
      return (!!uname && creator === uname) || (!!uid && creator === uid);
    });
  }, [entries, myUsername, myUserId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchEntries();
    setRefreshing(false);
  }, []);

  /* ── Clients (Select Existing Client) ── */
  const fetchClients = async () => {
    try {
      setLoadingClients(true);
      const headers = await authHeaders();
      const response = await fetch(CLIENT_API_URL, { headers });
      const text = await response.text();
      if (!response.ok) throw new Error(text);

      const json = JSON.parse(text);
      // Handles both a plain array and DRF-style paginated { results: [...] } responses.
      const rows: any[] = Array.isArray(json) ? json : json.results || [];
      setClients(rows.map(mapClient));
      setClientsLoaded(true);
    } catch (err) {
      console.log('fetchClients error:', err);
    } finally {
      setLoadingClients(false);
    }
  };

   const filteredClients = React.useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      c =>
        c.shop.toLowerCase().includes(q) ||
        c.owner.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q)
    );
  }, [clients, clientQuery]);

  /* ── Branches (Select Department) ── */
  const getFirstValue = (item: any, keys: string[]) => {
    for (const key of keys) {
      const value = item?.[key];
      if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
    }
    return '';
  };

  const fetchBranches = async () => {
    try {
      setLoadingBranches(true);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
      const response = await fetch(ACC_DEPARTMENTS_API_URL, { signal: controller.signal });
      clearTimeout(timeoutId);

      const text = await response.text();
      if (!response.ok) throw new Error(text);

      const parsed = JSON.parse(text);
      const rows: any[] = Array.isArray(parsed) ? parsed : parsed?.results || parsed?.data || [];

      const formatted: Branch[] = rows.map((b: any, i: number) => ({
        id:   getFirstValue(b, ['department_id', 'id', 'code', 'department_code', 'dept']) || i.toString(),
        name: getFirstValue(b, ['department', 'name', 'department_name', 'dept_name']) || 'Unknown',
        code: getFirstValue(b, ['department_id', 'code', 'department_code', 'dept']),
      }));

      // De-dupe by name (acc-departments rows repeat per client)
    const uniqueByName = [...new Map(formatted.map(b => [b.name.toLowerCase(), b])).values()]
        .sort((a, b) => a.name.localeCompare(b.name));

      const allowedDeptRaw = await SecureStore.getItemAsync('department');
      const allowedDepartments: string[] = allowedDeptRaw ? JSON.parse(allowedDeptRaw) : [];
      const normalizedAllowed = allowedDepartments.map(d => d.trim().toLowerCase());
      const scoped = normalizedAllowed.length
        ? uniqueByName.filter(b => normalizedAllowed.includes(b.name.trim().toLowerCase()))
        : uniqueByName;

      setBranches(scoped);
      setBranchesLoaded(true);
    } catch (err) {
      console.log('fetchBranches error:', err);
    } finally {
      setLoadingBranches(false);
    }
  };

 const filteredBranches = React.useMemo(() => {
    const q = branchQuery.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter(b => b.name.toLowerCase().includes(q));
  }, [branches, branchQuery]);

  /* ── Software Type / Requirements ── */
  const fetchSoftwareList = async () => {
    try {
      setLoadingSoftware(true);
      const headers = await authHeaders();
      const response = await fetch(SOFTWARE_API_URL, { headers });
      const text = await response.text();
      if (!response.ok) throw new Error(text);

      const json = JSON.parse(text);
      const rows: any[] = Array.isArray(json) ? json : json.results || [];
      setSoftwareList(rows.map((s: any) => ({ id: s.id, name: s.name, type: s.type })));
      setSoftwareLoaded(true);
    } catch (err) {
      console.log('fetchSoftwareList error:', err);
    } finally {
      setLoadingSoftware(false);
    }
  };

  const toggleType = (type: string) => {
    setSelectedTypes(prev => {
      const next = prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type];
      // Drop any selected requirement whose type got unchecked
      setSelectedRequirements(reqs =>
        reqs.filter(name => {
          const item = softwareList.find(s => s.name === name);
          return item ? next.includes(item.type) : false;
        })
      );
      return next;
    });
  };

  const toggleRequirement = (name: string) => {
    setSelectedRequirements(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  const selectedBranch = React.useMemo(
      () => branches.find(b => b.name === selectedBranchId) || null,
      [branches, selectedBranchId]
    );

    const selectBranch = (branch: Branch) => {
      setSelectedBranchId(branch.name);
      setShowBranchDropdown(false);
      setBranchQuery('');
    };

  const selectClient = (client: ClientOption) => {
    setSelectedClient(client);
    setOwner(client.owner);
    setShop(client.shop);
    setPhone(client.phone);
    if (client.location && !location) setLocation(client.location);
    setClientQuery(client.shop || client.owner);
    setShowClientDropdown(false);
  };

  const clearSelectedClient = () => {
    setSelectedClient(null);
    setClientQuery('');
    setOwner('');
    setShop('');
    setPhone('');
  };

  /* ── Location (optional auto-fill) ── */
  const detectLocation = async () => {
    try {
      setIsLocating(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Location permission is needed to auto-fill location.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLat(position.coords.latitude);
      setLng(position.coords.longitude);

      try {
        const [place] = await Location.reverseGeocodeAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        if (place) {
          const parts = [place.city || place.subregion, place.region].filter(Boolean);
          setLocation(parts.join(', ') || place.name || '');
        }
      } catch {
        // best-effort — lat/lng alone is fine if this fails
      }
    } catch {
      Alert.alert('Error', 'Failed to get current location. Please try again.');
    } finally {
      setIsLocating(false);
    }
  };

  /* ── Image ── */
  const buildCapturedImage = async (asset: ImagePicker.ImagePickerAsset): Promise<CapturedImage> => {
    const manipulated = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: 1280 } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
    );
    return { uri: manipulated.uri, name: `enquiry_${Date.now()}.jpg`, type: 'image/jpeg' };
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Photo library permission is needed.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setCapturedImage(await buildCapturedImage(result.assets[0]));
      }
    } catch {
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera permission is needed.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.8 });
      if (!result.canceled && result.assets[0]) {
        setCapturedImage(await buildCapturedImage(result.assets[0]));
      }
    } catch {
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  /* ── Audio recording ── */
  const startRecording = async () => {
    try {
      const { granted } = await AudioModule.requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission Required', 'Microphone permission is needed.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
    } catch {
      Alert.alert('Error', 'Failed to start recording. Please try again.');
    }
  };

  const stopRecording = async () => {
    try {
      if (!recorder.isRecording) return;
      await recorder.stop();
      const uri = recorder.uri;
      setIsRecording(false);
      if (uri) {
        setCapturedAudio({ uri, name: `enquiry_${Date.now()}.m4a`, type: 'audio/m4a' });
      }
    } catch {
      Alert.alert('Error', 'Failed to stop recording. Please try again.');
      setIsRecording(false);
    }
  };

  const resetForm = () => {
    setClientMode('new');
    setOwner('');
    setShop('');
    setPhone('');
    setLocation('');
    setLat(null);
    setLng(null);
    setPurpose('');
    setNotes('');
    setCapturedImage(null);
    setCapturedAudio(null);
    setExistingImageUrl(null);
    setExistingAudioUrl(null);
    setSelectedClient(null);
    setClientQuery('');
    setShowClientDropdown(false);
     setSelectedBranchId('');
    setBranchQuery('');
    setShowBranchDropdown(false);
    setSelectedTypes([]);
    setSelectedRequirements([]);
    setShowRequirementsModal(false);
    setShowPurposeDropdown(false);
    setEditingEntryId(null);
  };

  const openAddForm = () => {
    resetForm();
    setShowAddModal(true);
  };

  const closeAddForm = () => {
    setShowAddModal(false);
    resetForm();
  };

  /* ── Detail popup ── */
  const openDetail = (entry: EnquiryEntry) => {
    setSelectedEntry(entry);
    setShowDetailModal(true);
  };

  const closeDetail = () => {
    setShowDetailModal(false);
    setSelectedEntry(null);
  };

  /* ── Edit ── */
  const openEdit = (entry: EnquiryEntry) => {
    setEditingEntryId(entry.id);
    setOwner(entry.owner);
    setShop(entry.shop);
    setPhone(entry.phone);
    setLocation(entry.location);
    setPurpose(entry.purpose);
    setNotes(entry.notes || '');
    setExistingImageUrl(entry.imageUrl || null);
    setExistingAudioUrl(entry.audioUrl || null);
    setCapturedImage(null);
    setCapturedAudio(null);
    setLat(null);
    setLng(null);
     setSelectedClient(null);
    setClientQuery('');
    setShowClientDropdown(false);
    setSelectedBranchId(entry.branch || '');
    setBranchQuery('');
    setShowBranchDropdown(false);
    setSelectedRequirements(entry.requirements || []);
    setShowPurposeDropdown(false);
    setShowDetailModal(false);
    setShowAddModal(true);
  };

  /* ── Submit (create or update) ── */
  const handleSubmit = async () => {
    if (clientMode === 'existing' && !selectedClient) {
      Alert.alert('Validation Error', 'Please select a client.');
      return;
    }
    if (clientMode === 'new' && !owner.trim()) {
      Alert.alert('Validation Error', 'Please enter the owner name.');
      return;
    }
    if (clientMode === 'new' && !shop.trim()) {
      Alert.alert('Validation Error', 'Please enter the shop name.');
      return;
    }
   if (!selectedBranchId) {
      Alert.alert('Validation Error', 'Please select a branch.');
      return;
    }
    if (!phone.trim()) {
      Alert.alert('Validation Error', 'Please enter a phone number.');
      return;
    }
    if (!purpose.trim()) {
      Alert.alert('Validation Error', 'Please enter the purpose.');
      return;
    }

    const isEdit = !!editingEntryId;

    try {
      setLoading(true);

      // Auto-fetch current location at save time — no manual entry needed.
      let finalLocation = location;
      let finalLat = lat;
      let finalLng = lng;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          finalLat = position.coords.latitude;
          finalLng = position.coords.longitude;
          setLat(finalLat);
          setLng(finalLng);
          try {
            const [place] = await Location.reverseGeocodeAsync({ latitude: finalLat, longitude: finalLng });
            if (place) {
              finalLocation = [place.city || place.subregion, place.region].filter(Boolean).join(', ') || place.name || '';
              setLocation(finalLocation);
            }
          } catch {
          }
        }
      } catch {
      }

    const formData = new FormData();
    formData.append('owner', owner.trim());
    formData.append('shop', shop.trim());
    formData.append('phone', phone.trim());
    formData.append('location', finalLocation.trim());
    if (finalLat !== null) formData.append('lat', finalLat.toFixed(6));
    if (finalLng !== null) formData.append('lng', finalLng.toFixed(6));
    formData.append('purpose', purpose.trim());
    formData.append('software', selectedRequirements.join(', '));   // was 'requirements' + JSON.stringify — key/format the backend didn't recognize
    formData.append('notes', notes.trim());
    formData.append('creator', myUsername || myUserId);
    formData.append('branch', selectedBranchId.trim());
      if (selectedClient) {
        formData.append('client', String(selectedClient.id));
      }

      if (capturedImage) {
        formData.append('image', {
          uri: capturedImage.uri,
          name: capturedImage.name,
          type: capturedImage.type,
        } as any);
      }
      if (capturedAudio) {
        formData.append('audio', {
          uri: capturedAudio.uri,
          name: capturedAudio.name,
          type: capturedAudio.type,
        } as any);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
      const headers = await authHeaders();

      const url = isEdit ? `${ENQUIRY_API_URL}${editingEntryId}/` : ENQUIRY_API_URL;
      const method = isEdit ? 'PATCH' : 'POST';

    const response = await fetch(url, {
            method,
            headers,
            body: formData,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          const responseText = await response.text();
        if (!response.ok) {
            Alert.alert(`Server Error (${response.status})`, formatServerError(responseText).substring(0, 900));
            return;
          }

      closeAddForm();
      await fetchEntries();
    } catch (err) {
      console.error(err);
      Alert.alert('Error', isEdit ? 'Failed to update enquiry. Please try again.' : 'Failed to create enquiry. Please try again.');
    } finally {
      setLoading(false);
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#1C1B17" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Enquiry</Text>
        <TouchableOpacity onPress={openAddForm} style={styles.addBtn}>
          <Ionicons name="add" size={24} color="#1C1B17" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={myEntries}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F5C451" />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="help-buoy-outline" size={40} color="#C2BBA8" />
            <Text style={styles.emptyStateText}>No enquiries yet</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTopRow}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.shop || item.owner || 'Unknown client'}</Text>
              <Text style={styles.cardDate}>{item.date ? new Date(item.date).toLocaleDateString() : ''}</Text>
            </View>

            <View style={styles.cardBottomRow}>
              <View style={styles.cardInfoCol}>
                {!!item.purpose && (
                  <View style={styles.cardTagRow}>
                    <Ionicons name="pricetag-outline" size={13} color="#B5854A" />
                    <Text style={styles.cardPurpose} numberOfLines={1}>{item.purpose}</Text>
                  </View>
                )}
                {!!item.location && (
                  <View style={styles.cardTagRow}>
                    <Ionicons name="location-outline" size={13} color="#A39A85" />
                    <Text style={styles.cardMetaText} numberOfLines={1}>{item.location}</Text>
                  </View>
                )}
              </View>

              <TouchableOpacity style={styles.eyeBtn} onPress={() => openDetail(item)}>
                <Ionicons name="eye-outline" size={20} color="#1C1B17" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {/* ── Detail Popup (eye icon) ── */}
      <Modal visible={showDetailModal} animationType="fade" transparent onRequestClose={closeDetail}>
        <View style={styles.detailOverlay}>
          <View style={styles.detailCard}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle} numberOfLines={1}>
                {selectedEntry?.shop || selectedEntry?.owner || 'Enquiry'}
              </Text>
              <View style={styles.detailHeaderActions}>
                <TouchableOpacity
                  style={styles.detailIconBtn}
                  onPress={() => selectedEntry && openEdit(selectedEntry)}
                >
                  <Ionicons name="create-outline" size={20} color="#1C1B17" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.detailIconBtn} onPress={closeDetail}>
                  <Ionicons name="close" size={20} color="#1C1B17" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={styles.detailBody} contentContainerStyle={{ paddingBottom: 24 }}>
              {selectedEntry && (
                <>
                  <DetailRow icon="person-outline" label="Owner" value={selectedEntry.owner} />
                  <DetailRow icon="call-outline" label="Phone" value={selectedEntry.phone} />
                  <DetailRow icon="location-outline" label="Location" value={selectedEntry.location} />
                  <DetailRow icon="pricetag-outline" label="Purpose" value={selectedEntry.purpose} />
                {!!selectedEntry.requirements?.length && (
                    <DetailRow icon="list-outline" label="Software" value={selectedEntry.requirements.join(', ')} />
                  )}
                  {!!selectedEntry.notes && (
                    <DetailRow icon="document-text-outline" label="Notes" value={selectedEntry.notes} />
                  )}
                  <DetailRow
                    icon="calendar-outline"
                    label="Date"
                    value={selectedEntry.date ? new Date(selectedEntry.date).toLocaleString() : ''}
                  />

                  {!!selectedEntry.imageUrl && (
                    <View style={styles.detailSection}>
                      <Text style={styles.detailSectionLabel}>PHOTO</Text>
                      <Image source={{ uri: selectedEntry.imageUrl }} style={styles.detailImage} resizeMode="cover" />
                    </View>
                  )}

                  {!!selectedEntry.audioUrl && (
                    <View style={styles.detailSection}>
                      <Text style={styles.detailSectionLabel}>VOICE NOTE</Text>
                      <AudioPlayer uri={selectedEntry.audioUrl} />
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Add / Edit Modal ── */}
     <Modal visible={showAddModal} animationType="slide" onRequestClose={closeAddForm}>
        <SafeAreaView style={styles.modalRoot} edges={['left', 'right']}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity onPress={closeAddForm} style={styles.backBtn}>
              <Ionicons name="close" size={22} color="#1C1B17" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{editingEntryId ? 'Edit Enquiry' : 'New Enquiry'}</Text>
            <View style={{ width: 44 }} />
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">

            <View style={styles.labelRow}>
                <Text style={styles.label}>BRANCH</Text>
                {loadingBranches && <ActivityIndicator size="small" color="#A39A85" />}
              </View>
              <TouchableOpacity
                style={[styles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                onPress={() => setShowBranchDropdown(prev => !prev)}
              >
                <Text style={{ fontSize: 15, fontWeight: '500', color: selectedBranch ? '#1C1B17' : '#A39A85' }}>
                  {selectedBranch ? selectedBranch.name : 'Select branch'}
                </Text>
                <Ionicons name={showBranchDropdown ? 'chevron-up' : 'chevron-down'} size={18} color="#A39A85" />
              </TouchableOpacity>
              {showBranchDropdown && (
                <>
                  <View style={styles.dropdownBox}>
                    {filteredBranches.length === 0 ? (
                      <View style={styles.dropdownEmpty}>
                        <Text style={styles.dropdownEmptyText}>
                          {branchesLoaded ? 'No matching branches' : 'Loading branches…'}
                        </Text>
                      </View>
                    ) : (
                       <ScrollView style={styles.dropdownScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                        {filteredBranches.map(b => (
                          <TouchableOpacity key={b.name} style={styles.dropdownItem} onPress={() => selectBranch(b)}>
                            <Text style={styles.dropdownItemTitle}>{b.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                </>
              )}
              {/* ── New / Existing Client toggle ── */}
              <Text style={styles.label}>CLIENT TYPE</Text>
              <View style={styles.proofButtonRow}>
                <TouchableOpacity
                  style={[styles.proofButton, clientMode === 'new' && styles.proofButtonActive]}
                  onPress={() => {
                    setClientMode('new');
                    clearSelectedClient();
                  }}
                >
                  <Text style={styles.proofButtonText}>New Client</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.proofButton, clientMode === 'existing' && styles.proofButtonActive]}
                  onPress={() => setClientMode('existing')}
                >
                  <Text style={styles.proofButtonText}>Existing Client</Text>
                </TouchableOpacity>
              </View>

              {clientMode === 'existing' && (
                <>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>SELECT EXISTING CLIENT</Text>
                    {loadingClients && <ActivityIndicator size="small" color="#A39A85" />}
                  </View>

                  {selectedClient ? (
                    <View style={styles.selectedClientChip}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.selectedClientName}>{selectedClient.shop || selectedClient.owner}</Text>
                        {!!selectedClient.phone && (
                          <Text style={styles.selectedClientSub}>{selectedClient.owner} · {selectedClient.phone}</Text>
                        )}
                      </View>
                      <TouchableOpacity onPress={clearSelectedClient}>
                        <Ionicons name="close-circle" size={22} color="#A39A85" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <>
                      <TextInput
                        style={styles.input}
                        placeholder="Search & select an existing client…"
                        placeholderTextColor="#A39A85"
                        value={clientQuery}
                        onChangeText={text => {
                          setClientQuery(text);
                          setShowClientDropdown(true);
                        }}
                        onFocus={() => setShowClientDropdown(true)}
                      />
                      {showClientDropdown && (
                        <View style={styles.dropdownBox}>
                          {loadingClients ? (
                            <View style={styles.dropdownEmpty}>
                              <ActivityIndicator size="small" color="#A39A85" />
                            </View>
                          ) : filteredClients.length === 0 ? (
                            <View style={styles.dropdownEmpty}>
                              <Text style={styles.dropdownEmptyText}>
                                {clientsLoaded ? 'No matching clients' : 'Loading clients…'}
                              </Text>
                            </View>
                          ) : (
                            <ScrollView style={styles.dropdownScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                              {filteredClients.slice(0, 20).map(c => (
                                <TouchableOpacity
                                  key={String(c.id)}
                                  style={styles.dropdownItem}
                                  onPress={() => selectClient(c)}
                                >
                                  <Text style={styles.dropdownItemTitle}>{c.shop || c.owner}</Text>
                                  <Text style={styles.dropdownItemSub}>{c.owner}{c.phone ? ` · ${c.phone}` : ''}</Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          )}
                        </View>
                      )}
                    </>
                  )}
                </>
              )}

              {clientMode === 'new' && (
                <>
                  <Text style={styles.label}>OWNER NAME</Text>
                  <TextInput style={styles.input} placeholder="Owner name" placeholderTextColor="#A39A85" value={owner} onChangeText={setOwner} />

                  <Text style={styles.label}>SHOP NAME</Text>
                  <TextInput style={styles.input} placeholder="Shop / business name" placeholderTextColor="#A39A85" value={shop} onChangeText={setShop} />
                </>
              )}

              <Text style={styles.label}>PHONE</Text>
              <TextInput style={styles.input} placeholder="Phone number" placeholderTextColor="#A39A85" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

              <Text style={styles.label}>PURPOSE</Text>
              <TouchableOpacity
                style={[styles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                onPress={() => setShowPurposeDropdown(prev => !prev)}
              >
                <Text style={{ fontSize: 15, fontWeight: '500', color: purpose ? '#1C1B17' : '#A39A85' }}>
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
             <Text style={styles.label}>TYPE</Text>
              <View style={styles.proofButtonRow}>
                {TYPE_OPTIONS.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.proofButton, selectedTypes.includes(t) && styles.proofButtonActive]}
                    onPress={() => toggleType(t)}
                  >
                    <Text style={styles.proofButtonText}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.labelRow}>
                <Text style={styles.label}>REQUIREMENTS</Text>
                {loadingSoftware && <ActivityIndicator size="small" color="#A39A85" />}
              </View>
              <TouchableOpacity
                style={[styles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, !selectedTypes.length && { opacity: 0.5 }]}
                onPress={() => selectedTypes.length && setShowRequirementsModal(true)}
                disabled={!selectedTypes.length}
              >
                <Text style={{ fontSize: 15, fontWeight: '500', color: selectedRequirements.length ? '#1C1B17' : '#A39A85' }}>
                  {selectedRequirements.length
                    ? `${selectedRequirements.length} selected`
                    : selectedTypes.length
                    ? 'Select requirements'
                    : 'Select type first'}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#A39A85" />
              </TouchableOpacity>

              <Modal visible={showRequirementsModal} transparent animationType="fade" onRequestClose={() => setShowRequirementsModal(false)}>
                <View style={styles.detailOverlay}>
                  <View style={styles.detailCard}>
                    <View style={styles.detailHeader}>
                      <Text style={styles.detailTitle}>Select Requirements</Text>
                      <TouchableOpacity style={styles.detailIconBtn} onPress={() => setShowRequirementsModal(false)}>
                        <Ionicons name="close" size={20} color="#1C1B17" />
                      </TouchableOpacity>
                    </View>
                    <ScrollView style={styles.detailBody} contentContainerStyle={{ paddingBottom: 16 }}>
                      {selectedTypes.map(type => (
                        <View key={type} style={styles.detailSection}>
                          <Text style={styles.detailSectionLabel}>{type}</Text>
                          {softwareList.filter(s => s.type === type).map(s => (
                            <TouchableOpacity
                              key={s.id}
                              style={[styles.dropdownItem, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}
                              onPress={() => toggleRequirement(s.name)}
                            >
                              <Ionicons
                                name={selectedRequirements.includes(s.name) ? 'checkbox' : 'square-outline'}
                                size={20}
                                color={selectedRequirements.includes(s.name) ? '#F5C451' : '#A39A85'}
                              />
                              <Text style={styles.dropdownItemTitle}>{s.name}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      ))}
                    </ScrollView>
                    <TouchableOpacity onPress={() => setSelectedRequirements([])} style={{ padding: 12, alignItems: 'center' }}>
                      <Text style={{ color: '#A39A85', fontWeight: '700' }}>Clear All</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.submitBtn} onPress={() => setShowRequirementsModal(false)}>
                      <Text style={styles.submitBtnText}>Done ({selectedRequirements.length})</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Modal>
              <Text style={styles.label}>NOTES</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Additional notes (optional)"
                placeholderTextColor="#A39A85"
                value={notes}
                onChangeText={setNotes}
                multiline
              />

              <Text style={styles.label}>PHOTO (OPTIONAL)</Text>
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
              <View style={styles.proofButtonRow}>
                <TouchableOpacity style={styles.proofButton} onPress={pickImage}>
                  <Ionicons name="images-outline" size={20} color="#1C1B17" />
                  <Text style={styles.proofButtonText}>Gallery</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.proofButton} onPress={takePhoto}>
                  <Ionicons name="camera-outline" size={20} color="#1C1B17" />
                  <Text style={styles.proofButtonText}>Camera</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>VOICE NOTE (OPTIONAL)</Text>
              {capturedAudio ? (
                <View style={styles.audioPreview}>
                  <AudioPlayer uri={capturedAudio.uri} />
                  <TouchableOpacity onPress={() => setCapturedAudio(null)}>
                    <Ionicons name="close-circle" size={22} color="#A39A85" />
                  </TouchableOpacity>
                </View>
              ) : existingAudioUrl ? (
                <View style={styles.audioPreview}>
                  <AudioPlayer uri={existingAudioUrl} />
                  <Text style={styles.existingBadgeTextInline}>Current</Text>
                </View>
              ) : null}
              <TouchableOpacity
                style={[styles.recordBtn, isRecording && styles.recordBtnActive]}
                onPress={isRecording ? stopRecording : startRecording}
              >
                <Ionicons name={isRecording ? 'stop-circle' : 'mic-outline'} size={20} color={isRecording ? '#EF4444' : '#1C1B17'} />
                <Text style={[styles.recordBtnText, isRecording && { color: '#EF4444' }]}>
                  {isRecording ? 'Stop Recording' : capturedAudio || existingAudioUrl ? 'Re-record Voice Note' : 'Record Voice Note'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitBtn, loading && { opacity: 0.6 }]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <ActivityIndicator size="small" color="#F5C451" />
                    <Text style={[styles.submitBtnText, { marginLeft: 8 }]}>Saving…</Text>
                  </>
                ) : (
                  <Text style={styles.submitBtnText}>{editingEntryId ? 'Update Enquiry' : 'Save Enquiry'}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F5C451', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#1C1B17' },
  listContent: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },

  /* Compact card: title/date row + purpose/location + eye icon */
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: '#1C1B17', marginRight: 8 },
  cardDate: { fontSize: 11, color: '#A39A85', fontWeight: '600' },
  cardBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardInfoCol: { flex: 1, gap: 3 },
  cardTagRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardPurpose: { fontSize: 12, fontWeight: '700', color: '#B5854A', flexShrink: 1 },
  cardMetaText: { fontSize: 12, color: '#A39A85', fontWeight: '500', flexShrink: 1 },
  eyeBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#F7F5EE',
    justifyContent: 'center', alignItems: 'center', marginLeft: 8,
  },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyStateText: { fontSize: 14, fontWeight: '600', color: '#A39A85' },

  /* Detail popup */
  detailOverlay: { flex: 1, backgroundColor: 'rgba(28,27,23,0.45)', justifyContent: 'center', padding: 20 },
  detailCard: { backgroundColor: '#FFFFFF', borderRadius: 20, maxHeight: '80%', overflow: 'hidden' },
  detailHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0EAD8',
  },
  detailTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: '#1C1B17', marginRight: 8 },
  detailHeaderActions: { flexDirection: 'row', gap: 8 },
  detailIconBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#F7F5EE',
    justifyContent: 'center', alignItems: 'center',
  },
  detailBody: { paddingHorizontal: 16, paddingTop: 12 },
  detailRow: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F7F5EE' },
  detailRowLabel: { fontSize: 10, fontWeight: '700', color: '#A39A85', letterSpacing: 1, marginBottom: 2 },
  detailRowValue: { fontSize: 14, fontWeight: '600', color: '#1C1B17' },
  detailSection: { marginTop: 14 },
  detailSectionLabel: { fontSize: 10, fontWeight: '700', color: '#A39A85', letterSpacing: 1, marginBottom: 8 },
  detailImage: { width: '100%', height: 200, borderRadius: 14 },

  /* Audio player */
  audioPlayer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  audioPlayerText: { fontSize: 13, fontWeight: '700' },

  modalRoot: { flex: 1, backgroundColor: '#FAF9F6' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0EAD8',
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#1C1B17' },
  form: { padding: 20, gap: 6, paddingBottom: 48 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  label: { fontSize: 11, fontWeight: '700', color: '#5C584F', letterSpacing: 1.2, marginTop: 14, marginBottom: 8 },
  input: {
    backgroundColor: '#F7F5EE', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, fontWeight: '500', color: '#1C1B17',
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  locationBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  locationBtnText: { fontSize: 13, fontWeight: '700', color: '#1C1B17' },
  proofButtonRow: { flexDirection: 'row', gap: 12, marginTop: 10 },
 proofButton: {
    flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 20, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E8E3D9',
    borderRadius: 16, borderStyle: 'dashed',
  },
  proofButtonActive: {
    borderStyle: 'solid', borderColor: '#F5C451', backgroundColor: '#FFF9E9',
  },
  proofButtonText: { fontSize: 13, fontWeight: '700', color: '#1C1B17' },
  previewWrap: { borderRadius: 16, overflow: 'hidden', height: 200, position: 'relative' },
  previewImage: { width: '100%', height: '100%' },
  removeBtn: { position: 'absolute', top: 10, right: 10, backgroundColor: '#FFFFFF', borderRadius: 14 },
  existingBadge: {
    position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(28,27,23,0.7)',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4,
  },
  existingBadgeText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  existingBadgeTextInline: { fontSize: 11, fontWeight: '700', color: '#A39A85' },
  recordBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: '#E8E3D9', borderStyle: 'dashed', borderRadius: 16, paddingVertical: 18,
    marginTop: 10,
  },
  recordBtnActive: { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
  recordBtnText: { fontSize: 14, fontWeight: '700', color: '#1C1B17' },
  audioPreview: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    backgroundColor: '#F7F5EE', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14,
  },
  submitBtn: { marginTop: 24, backgroundColor: '#1C1B17', borderRadius: 50, paddingVertical: 18, alignItems: 'center' },
  submitBtnText: { fontSize: 16, fontWeight: '800', color: '#F5C451' },

  selectedClientChip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F0EAD8', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14,
  },
  selectedClientName: { fontSize: 14, fontWeight: '700', color: '#1C1B17' },
  selectedClientSub: { fontSize: 12, color: '#6E695F', marginTop: 2 },
  dropdownBox: {
    backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E8E3D9',
    marginTop: 6, overflow: 'hidden',
  },
  dropdownScroll: { maxHeight: 220 },
  dropdownItem: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0EAD8' },
  dropdownItemTitle: { fontSize: 14, fontWeight: '700', color: '#1C1B17' },
  dropdownItemSub: { fontSize: 12, color: '#6E695F', marginTop: 2 },
  dropdownEmpty: { paddingVertical: 16, alignItems: 'center' },
  dropdownEmptyText: { fontSize: 12, color: '#A39A85', fontWeight: '600' },
});