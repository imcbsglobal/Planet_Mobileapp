/* eslint-disable prettier/prettier */
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as SecureStore from '../lib/secureStore';

/* ─────────────────────────── Types ─────────────────────────── */

interface UserCredentials {
  userId: string;
  password: string;
  username?: string;
}

interface Customer {
  id: string;
  name: string;
  place?: string;
  isManual?: boolean;
}

interface Branch {
  id: string;
  name: string;
  code?: string;
}

// Matches API collection_type values exactly
type CollectionType = 'upi' | 'cash' | 'cheque' | 'neft' | 'bank_transfer';

interface CollectionEntry {
  id: string;
  customerId: string;
  customerName: string;
  customerPlace?: string;
  company?: string;
  branchId: string;
  branchName: string;
  collectionType: CollectionType;
  collectionTypeDisplay?: string;
  amount: string;
  paidFor?: string;
  notes?: string;
  paymentProofUrl: string | null;
  status: string;
  createdAt: string;
  createdByName?: string;
  createdById?: string;
  // True once this entry has been observed in the (filtered) server list.
  synced?: boolean;
  // Local Date.now() captured when the submit screen wrote this entry to the
  // cache. Lets fetchCollections tell "my submission raced this fetch" apart
  // from "this record was deleted on the web".
  cachedAt?: number;
}

/* ─────────────────────────── Constants ─────────────────────── */

const API_BASE_URL = 'https://my.myimc.in/app4/api';
const COLLECTION_API_CANDIDATES = [
  // Primary: same backend the web administration (Planet Administration SPA)
  // reads from and issues DELETE against — so deletions made on the web are
  // reflected here immediately. Also receives mobile ADD submissions.
  'https://planet.imcbs.com/api/collection/collections/',
  // Legacy fallbacks (stale datasets, kept only if primary is unreachable)
  'https://my.myimc.in/collection/collections/api/list/',
  'https://my.myimc.in/app4/api/collections/',
  'https://my.myimc.in/collection/api/collections/',
  'https://my.myimc.in/collection/collections/',
];
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const COLLECTION_TYPE_CONFIG: Record<CollectionType, { label: string; bg: string; text: string; icon: string }> = {
  upi:           { label: 'UPI',           bg: '#DCFCE7', text: '#15803D', icon: 'logo-google' },
  cash:          { label: 'Cash',          bg: '#FEF9C3', text: '#A16207', icon: 'cash-outline' },
  cheque:        { label: 'Cheque',        bg: '#EDE9FE', text: '#6D28D9', icon: 'document-text-outline' },
  neft:          { label: 'NEFT',          bg: '#FFE4E6', text: '#BE123C', icon: 'card-outline' },
  bank_transfer: { label: 'Bank Transfer', bg: '#DBEAFE', text: '#1D4ED8', icon: 'business-outline' },
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  pending:  { label: 'Pending',  bg: '#FEF9C3', text: '#A16207' },
  approved: { label: 'Approved', bg: '#DCFCE7', text: '#15803D' },
  verified: { label: 'Verified', bg: '#DCFCE7', text: '#15803D' },
  rejected: { label: 'Rejected', bg: '#FFE4E6', text: '#BE123C' },
};

/* ─────────────────────────── Component ─────────────────────── */

export default function Collection() {
  const navigation = useNavigation<any>();

  const [isInitializing, setIsInitializing]             = useState(true);
  const [refreshing, setRefreshing]                     = useState(false);
  const [userCredentials, setUserCredentials]           = useState<UserCredentials | null>(null);
  const [isLoadingCollections, setIsLoadingCollections] = useState(true);

  const [customers, setCustomers]   = useState<Customer[]>([]);
  const [branches, setBranches]     = useState<Branch[]>([]);
  const [collections, setCollections] = useState<CollectionEntry[]>([]);

  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImage, setSelectedImage]   = useState<string | null>(null);
  const [imageErrors, setImageErrors]       = useState<Set<string>>(new Set());

  const [showDetailsModal, setShowDetailsModal]     = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<CollectionEntry | null>(null);

  // Animated loading dots
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  /* ── API helper ── */
  const makeAPICall = async (
    endpoint: string,
    method = 'GET',
    body: any = null,
    isFormData = false,
    creds?: UserCredentials,
  ) => {
    const activeCreds = creds ?? userCredentials;
    if (!activeCreds) throw new Error('User credentials not available');

    const config: RequestInit = {
      method,
      headers: {
        Authorization: `Basic ${btoa(`${activeCreds.userId}:${activeCreds.password}`)}`,
      },
      credentials: 'include',
    };

    if (body && method !== 'GET') {
      if (isFormData) {
        config.body = body;
      } else {
        (config.headers as any)['Content-Type'] = 'application/json';
        config.body = JSON.stringify(body);
      }
    }

    const response     = await fetch(`${API_BASE_URL}${endpoint}`, config);
    const responseText = await response.text();

    if (responseText.trim().startsWith('<!DOCTYPE html') || responseText.trim().startsWith('<html')) {
      throw new Error('Authentication failed');
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${responseText}`);

    try { return JSON.parse(responseText); }
    catch { throw new Error('Invalid JSON response from server'); }
  };

  /* ── Customers ── */
  const loadManualCustomers = async (userId: string): Promise<Customer[]> => {
    try {
      const raw = await AsyncStorage.getItem(`manual_customers_${userId}`);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  };

  // Wider net of possible field names the /clients API might use for a place/location
  const formatCustomer = (c: any, i: number): Customer => ({
    id:       c.code || c.id?.toString() || i.toString(),
    name:     c.name,
    place:    c.place || c.location || c.address || c.city || c.town ||
              c.district || c.area || c.branch_place || '',
    isManual: false,
  });

  const fetchCustomers = async (creds: UserCredentials) => {
    try {
      const cached = await AsyncStorage.getItem('cached_customers');
      const manual = await loadManualCustomers(creds.userId);
      if (cached) {
        setCustomers([...JSON.parse(cached), ...manual]);
        // refresh in background silently
        makeAPICall('/clients', 'GET', null, false, creds).then((res: any) => {
          if (res && Array.isArray(res)) {
            const formatted: Customer[] = res.map(formatCustomer);
            setCustomers([...formatted, ...manual]);
            AsyncStorage.setItem('cached_customers', JSON.stringify(formatted));
          }
        }).catch(() => {});
        return;
      }
      const res = await makeAPICall('/clients', 'GET', null, false, creds);
      if (res && Array.isArray(res)) {
        if (__DEV__ && res.length > 0) {
          console.log('RAW CUSTOMER DEBUG → keys:', Object.keys(res[0]));
          console.log('RAW CUSTOMER DEBUG → first customer:', JSON.stringify(res[0]));
        }
        const formatted: Customer[] = res.map(formatCustomer);
        setCustomers([...formatted, ...manual]);
        await AsyncStorage.setItem('cached_customers', JSON.stringify(formatted));
      }
    } catch {
      try {
        const cached = await AsyncStorage.getItem('cached_customers');
        const manual = await loadManualCustomers(creds.userId);
        setCustomers(cached ? [...JSON.parse(cached), ...manual] : manual);
      } catch {}
    }
  };

  /* ── Branches ── */
  const fetchBranches = async (creds: UserCredentials): Promise<Branch[]> => {
    try {
      const cached = await AsyncStorage.getItem('cached_branches');
      if (cached) {
        const parsed: Branch[] = JSON.parse(cached);
        setBranches(parsed);
        // refresh silently in background
        makeAPICall('/departments', 'GET', null, false, creds).then((res: any) => {
          const data: any[] = res?.data && Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : [];
          if (data.length > 0) {
            const formatted: Branch[] = data.map((b: any, i: number) => ({
              id:   b.id?.toString() || i.toString(),
              name: b.name || b.department_name || 'Unknown',
              code: b.code || '',
            }));
            setBranches(formatted);
            AsyncStorage.setItem('cached_branches', JSON.stringify(formatted));
          }
        }).catch(() => {});
        return parsed;
      }
      const res = await makeAPICall('/departments', 'GET', null, false, creds);
      const data: any[] = res?.data && Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : [];
      if (data.length > 0) {
        const formatted: Branch[] = data.map((b: any, i: number) => ({
          id:   b.id?.toString() || i.toString(),
          name: b.name || b.department_name || 'Unknown',
          code: b.code || '',
        }));
        setBranches(formatted);
        await AsyncStorage.setItem('cached_branches', JSON.stringify(formatted));
        return formatted;
      }
    } catch {}
    return [];
  };

  /* ── Helper: resolve branch name ── */
  const getBranchName = (collection: any, branchList: Branch[]): string => {
    const direct = collection.department || collection.branch || collection.branch_name || collection.branchName;
    if (direct?.trim()) return direct;
    const id = (collection.branch_id || collection.branchId)?.toString();
    return branchList.find(b => b.id === id)?.name || 'Unknown Branch';
  };

  /* ── Helper: resolve proof URL ── */
  const resolveProofUrl = (collection: any): string | null => {
    const url =
      collection.cloudflare_r2_url ||
      collection.payment_proof_url ||
      collection.screenshot_url ||
      collection.payment_proof ||
      collection.payment_screenshot ||
      collection.screenshot ||
      null;

    if (!url) return null;
    if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('file:')) return url;
    return `https://myimc.in${url.startsWith('/') ? '' : '/'}${url}`;
  };

  /* ── Helper: resolve collection type ── */
  const resolveCollectionType = (collection: any): CollectionType => {
    const raw = (
      collection.collection_type ||
      collection.payment_method  ||
      collection.paymentMethod   ||
      'upi'
    ).toLowerCase().replace(' ', '_');

    if (['upi', 'cash', 'cheque', 'neft', 'bank_transfer'].includes(raw)) {
      return raw as CollectionType;
    }
    return 'upi';
  };

  /* ── Map raw API item → CollectionEntry ── */
  const mapCollection = (c: any, i: number, branchList: Branch[]): CollectionEntry => ({
    id:                    c.id?.toString()          || i.toString(),
    customerId:            c.customer_id?.toString() || c.client_id?.toString() || '',
    customerName:          c.client_name             || c.customer_name         || 'Unknown Customer',
    customerPlace:         c.client_place            || c.customer_place        || c.place ||
                            c.client_location         || c.customer_location     || c.location || '',
    company:               c.company                 || '',
    branchId:              c.branch_id?.toString()   || '',
    branchName:            getBranchName(c, branchList),
    collectionType:        resolveCollectionType(c),
    collectionTypeDisplay: c.collection_type_display || '',
    amount:                c.amount?.toString()      || '0',
    paidFor:               c.paid_for                || '',
    notes:                 c.notes                   || '',
    paymentProofUrl:       resolveProofUrl(c),
    status:                c.status                  || 'pending',
    createdAt:             c.created_at              || c.createdAt || new Date().toISOString(),
    createdByName:         c.created_by_name || c.user_name || '',
    // API returns `created_by` (numeric id) — not `created_by_id`
    createdById:           c.created_by?.toString() || c.created_by_id?.toString() || c.user_id?.toString() || '',
  });

  /* ── Filter collections to logged-in user only ── */
  const filterToUser = (entries: CollectionEntry[], creds: UserCredentials): CollectionEntry[] => {
    const uid      = creds.userId.toLowerCase().trim();
    const uname    = (creds.username || '').toLowerCase().trim();

    if (__DEV__) {
      console.log('FILTER DEBUG → creds.userId:', creds.userId, '| creds.username:', creds.username);
    }

   return entries.filter(c => {
  const byName = (c.createdByName || '').toLowerCase().trim();
  const byId   = (c.createdById || '').toLowerCase().trim();
  const matched =
    (byName && (byName === uid || (uname && byName === uname))) ||
    (byId && byId === uid);

      if (__DEV__) {
        console.log(
          `FILTER DEBUG → id:${c.id} client:"${c.customerName}" createdByName:"${c.createdByName}" createdById:"${c.createdById}" → ${matched ? 'KEEP' : 'DROP'}`
        );
      }

      return matched;
    });
  };

  /* ── Load cached collections ── */
  const loadCachedCollections = async (creds: UserCredentials): Promise<boolean> => {
    try {
      const raw = await AsyncStorage.getItem(`collections_${creds.userId}`);
      if (raw) {
        const parsed: CollectionEntry[] = JSON.parse(raw);
        setCollections(parsed);
        return true;
      }
    } catch {}
    return false;
  };

  /* ── Fetch collections — auto-discovers working URL from candidates ── */
  const fetchCollections = async (creds: UserCredentials, branchList: Branch[]) => {
    const authHeader = `Basic ${btoa(`${creds.userId}:${creds.password}`)}`;
    const fetchStartedAt = Date.now();
    let usedUrl = '';

    try {
      let rawList: any[] = [];
      let found = false;

      for (const url of COLLECTION_API_CANDIDATES) {
        try {
          const res = await fetch(url, {
            method: 'GET',
            headers: { Authorization: authHeader },
            credentials: 'include',
          });

          if (!res.ok) {
            console.log(`fetchCollections: ${url} → ${res.status}, trying next…`);
            continue;
          }

          const text = await res.text();
          let parsed: any;
          try { parsed = JSON.parse(text); }
          catch { console.log(`fetchCollections: ${url} returned non-JSON, trying next…`); continue; }

          // Normalise response shape
          if (Array.isArray(parsed)) {
            rawList = parsed;
          } else if (parsed?.data && Array.isArray(parsed.data)) {
            rawList = parsed.data;
          } else if (parsed?.results && Array.isArray(parsed.results)) {
            rawList = parsed.results;
          } else {
            console.log(`fetchCollections: ${url} returned unexpected shape, trying next…`);
            continue;
          }

          console.log(`fetchCollections: success with ${url}, got ${rawList.length} records`);
          if (__DEV__ && rawList.length > 0) {
            console.log('RAW RECORD DEBUG → keys:', Object.keys(rawList[0]));
            console.log('RAW RECORD DEBUG → first record:', JSON.stringify(rawList[0]));
          }
          usedUrl = url;
          found = true;
          break;
        } catch (urlErr) {
          console.log(`fetchCollections: ${url} threw error, trying next…`);
        }
      }

      if (!found) {
        console.error('fetchCollections: all candidate URLs failed');
        return;
      }

      const mapped: CollectionEntry[] = rawList.map((c: any, i: number) =>
        mapCollection(c, i, branchList)
      );

      const userCollections = filterToUser(mapped, creds);
      // Everything coming from the server list counts as synced — once an
      // entry is seen here it must never be resurrected from local cache.
      userCollections.forEach(e => { e.synced = true; });

      // Reconcile local cache against the server list:
      //  * Cached id IS in the full (pre-filter) server list → the record is
      //    NOT deleted; filterToUser merely excluded it, so keep showing the
      //    cached copy (deduped against the filtered server copy below).
      //  * Cached id is NOT in the server list → deleted from the web (the
      //    DELETE endpoint 404s and drops it from the list) → evict it —
      //    unless it was written to cache AFTER this fetch started (the fetch
      //    raced a just-completed submission; the next fetch evicts it if it
      //    was really deleted).
      //  * A fallback (non-primary) URL served this request, so its dataset is
      //    stale/unrelated → never evict anything based on it.
      let merged = userCollections;
      try {
        const cachedRaw = await AsyncStorage.getItem(`collections_${creds.userId}`);
        if (cachedRaw) {
          const cached: CollectionEntry[] = JSON.parse(cachedRaw);
          const serverIds = new Set(userCollections.map(e => e.id));
          const rawIds    = new Set(mapped.map(e => e.id));
          const isPrimary = usedUrl === COLLECTION_API_CANDIDATES[0];
          const pendingLocal = cached.filter(e =>
            !serverIds.has(e.id) &&
            (!isPrimary ||
              rawIds.has(e.id) ||
              (typeof e.cachedAt === 'number' && e.cachedAt > fetchStartedAt))
          );
          if (pendingLocal.length > 0) {
            if (__DEV__) console.log('MERGE DEBUG → keeping cached entries still present on server (or racing this fetch):', pendingLocal.map(e => e.id));
            merged = [...pendingLocal, ...userCollections];
          }
          const evictedIds = cached
            .filter(e => !serverIds.has(e.id) && !pendingLocal.includes(e))
            .map(e => e.id);
          if (evictedIds.length > 0) {
            if (__DEV__) console.log('MERGE DEBUG → evicting cache entries absent from server list (deleted on web):', evictedIds);
          }
        }
      } catch {}

      merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setCollections(merged);
      await AsyncStorage.setItem(`collections_${creds.userId}`, JSON.stringify(merged));

    } catch (err) {
      console.error('Error in fetchCollections:', err);
    } finally {
      setIsLoadingCollections(false);
    }
  };

  /* ── Init: load credentials → show cache → fetch fresh in parallel ── */
  useEffect(() => {
    const init = async () => {
      try {
        const [userId, password, username] = await Promise.all([
          SecureStore.getItemAsync('userId'),
          SecureStore.getItemAsync('password'),
          SecureStore.getItemAsync('username'),
        ]);

        if (!userId || !password) {
          navigation.replace('Login');
          return;
        }

        const creds: UserCredentials = { userId, password, username: username || undefined };
        setUserCredentials(creds);

        // Show cached collections immediately so screen feels instant
        const hasCached = await loadCachedCollections(creds);
        if (hasCached) setIsLoadingCollections(false);

        // Fetch branches (from cache first) and customers in parallel, then collections
        const [branchList] = await Promise.all([
          fetchBranches(creds),
          fetchCustomers(creds),
        ]);

        // Now fetch fresh collections (branches already resolved — no extra call)
        await fetchCollections(creds, branchList);

      } catch {
        navigation.replace('Login');
      } finally {
        setIsInitializing(false);
        setIsLoadingCollections(false);
      }
    };

    init();
  }, []);

  /* ── Refresh on focus: catches new/edited collections added from the
         Add Collection screen, which otherwise wouldn't appear until a
         manual pull-to-refresh since this screen doesn't unmount ── */
  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return; // initial load already handled by the init useEffect above
      }
      if (!userCredentials) return;

      (async () => {
        const branchList = await fetchBranches(userCredentials);
        await Promise.all([
          fetchCustomers(userCredentials),
          fetchCollections(userCredentials, branchList),
        ]);
      })();
    }, [userCredentials])
  );

  /* ── Loading dots animation ── */
  useEffect(() => {
    if (!isLoadingCollections) return;

    const anim = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: 280, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 280, useNativeDriver: true }),
        ])
      );

    const a = Animated.parallel([anim(dot1, 0), anim(dot2, 120), anim(dot3, 240)]);
    a.start();
    return () => { a.stop(); dot1.setValue(0); dot2.setValue(0); dot3.setValue(0); };
  }, [isLoadingCollections]);

  /* ── Handlers ── */
  const onRefresh = useCallback(async () => {
    if (!userCredentials) return;
    setRefreshing(true);
    setImageErrors(new Set());
    const branchList = await fetchBranches(userCredentials);
    await Promise.all([
      fetchCustomers(userCredentials),
      fetchCollections(userCredentials, branchList),
    ]);
    setRefreshing(false);
  }, [userCredentials]);

  const handleImageError = useCallback((url: string) => {
    setImageErrors(prev => new Set([...prev, url]));
  }, []);

  const handleEditCollection = useCallback((item: CollectionEntry) => {
    setShowDetailsModal(false);
    navigation.navigate('AddCollection', { editData: JSON.stringify(item) });
  }, [navigation]);

  const openDetails = useCallback((item: CollectionEntry) => {
    setSelectedCollection(item);
    setShowDetailsModal(true);
  }, []);

  const closeDetails = useCallback(() => {
    setShowDetailsModal(false);
  }, []);

  /* ── Formatters ── */
  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  };

  const formatAmount = (val: string) => {
    const n = parseFloat(val);
    return isNaN(n) ? val : `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  /* ── Resolve a collection's place, tolerant of case/whitespace differences
         between client_name on the collection and name in the customers list ── */
  const normalize = (s?: string) => (s || '').trim().toLowerCase();

  const resolvePlace = (item: CollectionEntry, customerList: Customer[]): string => {
    if (item.customerPlace) return item.customerPlace;
    const nameNorm = normalize(item.customerName);
    const match = customerList.find(c =>
      (item.customerId && c.id === item.customerId) ||
      normalize(c.name) === nameNorm
    );
    return match?.place || '';
  };

  /* ── Render: compact row card ── */
  const renderCollectionItem = useCallback(({ item }: { item: CollectionEntry }) => {
    const typeConfig   = COLLECTION_TYPE_CONFIG[item.collectionType] || COLLECTION_TYPE_CONFIG.upi;
    const statusConfig = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
    const displayPlace = resolvePlace(item, customers);

    return (
      <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => openDetails(item)}>
        <View style={[styles.rowTypeDot, { backgroundColor: typeConfig.bg }]}>
          <Ionicons name={typeConfig.icon as any} size={16} color={typeConfig.text} />
        </View>

        <View style={styles.rowMain}>
          <Text style={styles.rowName} numberOfLines={1}>{item.customerName}</Text>
          <View style={styles.rowSubRow}>
            <Ionicons name="location-outline" size={11} color="#A39A85" />
            <Text style={styles.rowSub} numberOfLines={1}>
              {displayPlace || 'Location not available'}
            </Text>
          </View>
        </View>

        <View style={styles.rowRight}>
          <Text style={styles.rowAmount} numberOfLines={1}>{formatAmount(item.amount)}</Text>
          <View style={[styles.rowStatusPill, { backgroundColor: statusConfig.bg }]}>
            <Text style={[styles.rowStatusText, { color: statusConfig.text }]}>{statusConfig.label}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.eyeBtn}
          onPress={() => openDetails(item)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="eye-outline" size={18} color="#7E7767" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }, [customers, openDetails]);

  /* ── Init loading gate ── */
  if (isInitializing && collections.length === 0) {
    return (
      <View style={styles.initLoader}>
        <ActivityIndicator size="large" color="#F5C451" />
        <Text style={styles.initLoaderText}>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#1C1B17" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Collections</Text>
        <TouchableOpacity
          style={[styles.headerBtn, styles.addBtn]}
          onPress={() => navigation.navigate('AddCollection')}
        >
          <Ionicons name="add" size={22} color="#1C1B17" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={collections}
        keyExtractor={item => item.id}
        renderItem={renderCollectionItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F5C451" colors={['#F5C451']} />
        }
        ListEmptyComponent={
          isLoadingCollections ? (
            <View style={styles.centeredBlock}>
              <View style={styles.dotsRow}>
                {[dot1, dot2, dot3].map((d, i) => (
                  <Animated.View
                    key={i}
                    style={[
                      styles.dot,
                      {
                        opacity: d,
                        transform: [{ scale: d.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.3] }) }],
                      },
                    ]}
                  />
                ))}
              </View>
              <Text style={styles.loadingText}>Loading collections…</Text>
            </View>
          ) : (
            <View style={styles.centeredBlock}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="wallet-outline" size={40} color="#D4A574" />
              </View>
              <Text style={styles.emptyTitle}>No collections yet</Text>
              <Text style={styles.emptySub}>Tap + to add your first collection entry</Text>
            </View>
          )
        }
      />

      {/* Image viewer modal */}
      <Modal visible={showImageModal} transparent animationType="fade" onRequestClose={() => setShowImageModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowImageModal(false)}>
          <View style={styles.modalContent} pointerEvents="box-none">
            {selectedImage && (
              <Image
                source={{ uri: selectedImage }}
                style={styles.fullImage}
                resizeMode="contain"
                onError={() => setShowImageModal(false)}
              />
            )}
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowImageModal(false)}>
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Details popup — everything not shown on the compact row */}
      <Modal
        visible={showDetailsModal}
        transparent
        animationType="slide"
        onRequestClose={closeDetails}
      >
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={closeDetails} />

          {selectedCollection && (() => {
            const item         = selectedCollection;
            const typeConfig   = COLLECTION_TYPE_CONFIG[item.collectionType] || COLLECTION_TYPE_CONFIG.upi;
            const statusConfig = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
            const proofUrl     = item.paymentProofUrl;
            const hasProof     = !!proofUrl && !imageErrors.has(proofUrl);
            const displayPlace = resolvePlace(item, customers);

            return (
              <View style={styles.sheet}>
                <View style={styles.sheetHandle} />

                <View style={styles.sheetHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetName} numberOfLines={1}>{item.customerName}</Text>
                    {!!displayPlace && (
                      <Text style={styles.sheetSubName} numberOfLines={1}>{displayPlace}</Text>
                    )}
                  </View>
                  <TouchableOpacity style={styles.sheetCloseBtn} onPress={closeDetails} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close" size={20} color="#1C1B17" />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetScrollContent}>
                  <View style={styles.sheetPillRow}>
                    <View style={[styles.typePill, { backgroundColor: typeConfig.bg }]}>
                      <Ionicons name={typeConfig.icon as any} size={12} color={typeConfig.text} />
                      <Text style={[styles.typePillText, { color: typeConfig.text }]}>{typeConfig.label}</Text>
                    </View>
                    <View style={[styles.statusPill, { backgroundColor: statusConfig.bg }]}>
                      <Text style={[styles.statusPillText, { color: statusConfig.text }]}>{statusConfig.label}</Text>
                    </View>
                  </View>

                  <Text style={styles.sheetProofLabel}>Payment Proof</Text>
                  <TouchableOpacity
                    style={styles.sheetProofBox}
                    activeOpacity={hasProof ? 0.8 : 1}
                    onPress={() => {
                      if (hasProof && proofUrl) {
                        setSelectedImage(proofUrl);
                        setShowImageModal(true);
                      }
                    }}
                  >
                    {hasProof && proofUrl ? (
                      <Image
                        source={{ uri: proofUrl }}
                        style={styles.sheetProofImage}
                        resizeMode="cover"
                        onError={() => handleImageError(proofUrl)}
                      />
                    ) : (
                      <View style={styles.sheetProofPlaceholder}>
                        <Ionicons name="image-outline" size={26} color="#D4A574" />
                        <Text style={styles.proofPlaceholderText}>
                          {item.collectionType === 'cash' ? 'Cash — no proof needed' : 'No proof uploaded'}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  <View style={styles.sheetAmountBlock}>
                    <Text style={styles.sheetAmountLabel}>Amount</Text>
                    <Text style={styles.sheetAmount}>{formatAmount(item.amount)}</Text>
                  </View>

                  <View style={styles.sheetDetailsCard}>
                    {!!displayPlace && (
                      <View style={styles.sheetDetailRow}>
                        <Ionicons name="location-outline" size={15} color="#A39A85" />
                        <Text style={styles.sheetDetailLabel}>Place</Text>
                        <Text style={styles.sheetDetailValue} numberOfLines={1}>{displayPlace}</Text>
                      </View>
                    )}
                    {!!item.company && (
                      <View style={styles.sheetDetailRow}>
                        <Ionicons name="briefcase-outline" size={15} color="#A39A85" />
                        <Text style={styles.sheetDetailLabel}>Company</Text>
                        <Text style={styles.sheetDetailValue} numberOfLines={1}>{item.company}</Text>
                      </View>
                    )}
                    <View style={styles.sheetDetailRow}>
                      <Ionicons name="business-outline" size={15} color="#A39A85" />
                      <Text style={styles.sheetDetailLabel}>Branch</Text>
                      <Text style={styles.sheetDetailValue} numberOfLines={1}>{item.branchName}</Text>
                    </View>
                    {!!item.paidFor && (
                      <View style={styles.sheetDetailRow}>
                        <Ionicons name="receipt-outline" size={15} color="#A39A85" />
                        <Text style={styles.sheetDetailLabel}>Paid For</Text>
                        <Text style={styles.sheetDetailValue} numberOfLines={1}>{item.paidFor}</Text>
                      </View>
                    )}
                    <View style={styles.sheetDetailRow}>
                      <Ionicons name="calendar-outline" size={15} color="#A39A85" />
                      <Text style={styles.sheetDetailLabel}>Date</Text>
                      <Text style={styles.sheetDetailValue} numberOfLines={1}>{formatDate(item.createdAt)}</Text>
                    </View>
                    {!!item.createdByName && (
                      <View style={styles.sheetDetailRow}>
                        <Ionicons name="person-outline" size={15} color="#A39A85" />
                        <Text style={styles.sheetDetailLabel}>Created By</Text>
                        <Text style={styles.sheetDetailValue} numberOfLines={1}>{item.createdByName}</Text>
                      </View>
                    )}
                  </View>

                  {!!item.notes && item.notes.trim() !== '' && (
                    <View style={styles.sheetNotesBlock}>
                      <View style={styles.sheetNotesHeader}>
                        <Ionicons name="chatbubble-outline" size={14} color="#A39A85" />
                        <Text style={styles.sheetNotesLabel}>Notes</Text>
                      </View>
                      <Text style={styles.sheetNotesText}>{item.notes}</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.sheetEditBtn}
                    onPress={() => handleEditCollection(item)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="create-outline" size={17} color="#1C1B17" />
                    <Text style={styles.sheetEditBtnText}>Edit Collection</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            );
          })()}
        </View>
      </Modal>
    </View>
  );
}

/* ─────────────────────────── Styles ─────────────────────────── */
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },

  initLoader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAF9F6',
  },
  initLoaderText: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '600',
    color: '#7E7767',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 14,
    backgroundColor: '#FAF9F6',
    borderBottomWidth: 1,
    borderBottomColor: '#F0EAD8',
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#1C1B17',
    letterSpacing: -0.3,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  addBtn: {
    backgroundColor: '#F5C451',
    shadowColor: '#F5C451',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },

  listContent: {
    padding: 16,
    paddingBottom: 32,
  },

  /* ── Compact row card ── */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 10,
    shadowColor: '#1C1B17',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F0EAD8',
  },
  rowTypeDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1B17',
  },
  rowSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  rowSub: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#A39A85',
    flexShrink: 1,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  rowAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1C1B17',
  },
  rowStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 50,
  },
  rowStatusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  eyeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FAF9F6',
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* ── Shared pills (used inside details sheet) ── */
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 50,
  },
  typePillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 50,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  proofPlaceholderText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#A39A85',
    textAlign: 'center',
  },

  /* ── Details bottom sheet (view more popup) ── */
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28,27,23,0.5)',
  },
  sheet: {
    backgroundColor: '#FAF9F6',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: screenHeight * 0.86,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E4DCC8',
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EAD8',
  },
  sheetName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1B17',
  },
  sheetSubName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#A39A85',
    marginTop: 2,
  },
  sheetCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F0EAD8',
  },
  sheetScrollContent: {
    paddingTop: 16,
    paddingBottom: 30,
  },
  sheetPillRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  sheetAmountBlock: {
    backgroundColor: '#FEF9EE',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetAmountLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A39A85',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  sheetAmount: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1C1B17',
  },
  sheetDetailsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F0EAD8',
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 16,
  },
  sheetDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F3EC',
  },
  sheetDetailLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#A39A85',
    width: 82,
  },
  sheetDetailValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#1C1B17',
    textAlign: 'right',
  },
  sheetNotesBlock: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F0EAD8',
    padding: 14,
    marginBottom: 16,
  },
  sheetNotesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  sheetNotesLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A39A85',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  sheetNotesText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#4A4636',
    lineHeight: 19,
  },
  sheetProofLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A39A85',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sheetProofBox: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
  },
  sheetProofImage: {
    width: '100%',
    height: 200,
    borderRadius: 16,
  },
  sheetProofPlaceholder: {
    width: '100%',
    height: 120,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#F0EAD8',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
  },
  sheetEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 14,
    borderRadius: 50,
    backgroundColor: '#F5C451',
    shadowColor: '#F5C451',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  sheetEditBtnText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#1C1B17',
  },

  centeredBlock: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
    gap: 10,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  dot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#F5C451',
  },
  loadingText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#7E7767',
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FEF9EE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1C1B17',
  },
  emptySub: {
    fontSize: 13,
    fontWeight: '500',
    color: '#A39A85',
    textAlign: 'center',
    lineHeight: 19,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: screenWidth * 0.92,
    height: screenHeight * 0.78,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  fullImage: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});