/* eslint-disable prettier/prettier */
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
  password: string;
  username?: string;
}

interface Customer {
  id: string;
  code?: string;
  name: string;
  place?: string;
  departmentCode?: string;
  clientId?: string;
  company?: string;
  isManual?: boolean;
  balance?: number; // debit - credit from acc-master API
}

interface Branch {
  id: string;
  name: string;
  code?: string;
  clientId?: string;
  company?: string;
}

interface CompanyOption {
  id: string;
  name: string;
  clientId?: string;
  code?: string;
}

// Matches the API collection_type values
type CollectionType = 'upi' | 'cash' | 'cheque' | 'neft' | 'bank_transfer';

interface CollectionEntry {
  id: string;
  customerId: string;
  customerName: string;
  customerPlace?: string;
  company?: string;
  branchId: string;
  branchName: string;
  amount: string;
  paidFor?: string;
  notes?: string;
  screenshot: string | null;
  createdAt: string;
  collectionType?: CollectionType;
  collectionTypeDisplay?: string;
  paymentProofUrl?: string | null;
  status?: string;
  createdByName?: string;
}

interface PaymentProofAsset {
  uri: string;
  name: string;
  type: string;
}

const formatServerError = (responseText: string) => {
  try {
    const parsed = JSON.parse(responseText);
    const detail = parsed.errors || parsed.data || parsed.details || parsed;

    if (parsed.message && detail && detail !== parsed.message) {
      return `${parsed.message}\n${JSON.stringify(detail, null, 2)}`;
    }

    return parsed.message || parsed.detail || parsed.error || JSON.stringify(parsed, null, 2);
  } catch {
    return responseText;
  }
};

/* ─────────────────────────── Constants ─────────────────────── */

const API_BASE_URL = 'https://my.myimc.in/app4/api';
const ADD_COLLECTION_API_URL = 'https://planet.imcbs.com/api/collection/collections/add/';
const COMPANY_API_URL = 'https://planet.imcbs.com/api/master/company/';
const ACC_DEPARTMENTS_API_URL = 'https://accmaster.imcbs.com/api/sync/acc-departments/';
const ACC_MASTER_API_URL = 'https://accmaster.imcbs.com/api/sync/acc-master/';
const ALL_DEPARTMENTS_ID = '__ALL_DEPARTMENTS__';
const ALL_DEPARTMENTS_BRANCH: Branch = { id: ALL_DEPARTMENTS_ID, name: 'All Departments', code: '' };
const DEFAULT_COMPANY_OPTIONS: CompanyOption[] = [
  { id: 'sysmac_computers', name: 'Sysmac Computers' },
  { id: 'sysmac_info', name: 'Sysmac Info' },
  { id: 'imcb_llp', name: 'IMCB LLP' },
];
const { height: screenHeight } = Dimensions.get('window');

const COLLECTION_TYPES: { id: CollectionType; label: string; icon: string }[] = [
  { id: 'upi',           label: 'UPI',           icon: 'logo-google' },
  { id: 'cash',          label: 'Cash',          icon: 'cash-outline' },
  { id: 'cheque',        label: 'Cheque',        icon: 'document-text-outline' },
  { id: 'neft',          label: 'NEFT',          icon: 'card-outline' },
  { id: 'bank_transfer', label: 'Bank Transfer', icon: 'business-outline' },
];

const MAX_FETCH_ATTEMPTS = 3;
const FETCH_TIMEOUT = 15000;
const RETRY_DELAY = 2000;

/* ─────────────────────────── Component ─────────────────────── */

export default function AddCollection() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const params = route.params || {};

  const editData: CollectionEntry | null = params.editData
    ? JSON.parse(params.editData as string)
    : null;

  /* ── State ── */
  const [showSuccessCard, setShowSuccessCard]   = useState(false);
  const [loading, setLoading]                   = useState(false);
  const [userCredentials, setUserCredentials]   = useState<UserCredentials | null>(null);
  const [isInitializing, setIsInitializing]     = useState(true);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [branches, setBranches]   = useState<Branch[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);

  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showBranchDropdown, setShowBranchDropdown]     = useState(false);

  const [companySearchText, setCompanySearchText]   = useState('');
  const [customerSearchText, setCustomerSearchText] = useState('');
  const [branchSearchText, setBranchSearchText]     = useState('');

  const [isManualCustomerMode, setIsManualCustomerMode] = useState(false);
  const [manualCustomerName, setManualCustomerName]     = useState('');
  const [manualCustomerPlace, setManualCustomerPlace]   = useState('');

  // Form fields
  const [selectedCustomerId, setSelectedCustomerId]     = useState<string>(editData?.customerId || '');
  const [selectedCustomerPlace, setSelectedCustomerPlace] = useState<string>(editData?.customerPlace || '');
  const [company, setCompany]                           = useState<string>(editData?.company || '');
  const [selectedBranchId, setSelectedBranchId]         = useState<string>(editData?.branchId || '');
  const [amount, setAmount]                             = useState<string>(editData?.amount || '');
  const [paidFor, setPaidFor]                           = useState<string>(editData?.paidFor || '');
  const [notes, setNotes]                               = useState<string>(editData?.notes || '');
  const [screenshot, setScreenshot]                     = useState<string | null>(editData?.screenshot || null);
  const [paymentProofAsset, setPaymentProofAsset]       = useState<PaymentProofAsset | null>(null);
  const [collectionType, setCollectionType]             = useState<CollectionType>(editData?.collectionType || 'upi');

  const [branchFetchAttempts, setBranchFetchAttempts]     = useState(0);
  const [customerFetchAttempts, setCustomerFetchAttempts] = useState(0);
  const [isFetchingBranches, setIsFetchingBranches]       = useState(false);
  const [isFetchingCustomers, setIsFetchingCustomers]     = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);

  /* ── Derived ── */
  const selectedCompany = useMemo(
    () => companies.find(c => c.name === company),
    [companies, company],
  );

  const selectedCustomer = useMemo(() => customers.find(c => c.id === selectedCustomerId), [customers, selectedCustomerId]);
const selectedBranch = useMemo(() => {
  if (selectedBranchId === ALL_DEPARTMENTS_ID) return ALL_DEPARTMENTS_BRANCH;
  return branches.find(b => b.id === selectedBranchId);
}, [branches, selectedBranchId]);

const companyScopedBranches = useMemo(() => {
  const scoped = !selectedCompany?.clientId
    ? branches
    : branches.filter(b => b.clientId === selectedCompany.clientId);

  // Show every department the user has access to, even ones with no
  // clients under them yet — a department shouldn't disappear from the
  // picker just because nobody's been added there in the client master.
  return [ALL_DEPARTMENTS_BRANCH, ...scoped];
}, [branches, selectedCompany]);

 const filteredCustomers = useMemo(() => {
const isAllDepartments = selectedBranch?.id === ALL_DEPARTMENTS_ID;
const selectedDepartmentCode = isAllDepartments ? '' : (selectedBranch?.code || '');
  const scoped = customers.filter(c => {
    const companyMatches =
      !selectedCompany?.clientId ||
      c.clientId === selectedCompany.clientId;
    const departmentMatches =
      !selectedDepartmentCode ||
      (c.departmentCode || '').toLowerCase() === selectedDepartmentCode.toLowerCase();

    return companyMatches && departmentMatches;
  });
    const base = customerSearchText.trim()
      ? scoped.filter(c =>
          c.name.toLowerCase().includes(customerSearchText.toLowerCase()) ||
          (c.code && c.code.toLowerCase().includes(customerSearchText.toLowerCase())) ||
          (c.place && c.place.toLowerCase().includes(customerSearchText.toLowerCase()))
        )
      : scoped;
    return [...base].sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, customerSearchText, selectedBranch, selectedCompany]);

  const filteredBranches = useMemo(() => {
    if (!branchSearchText.trim()) return companyScopedBranches;
    return companyScopedBranches.filter(b =>
      b.name.toLowerCase().includes(branchSearchText.toLowerCase()) ||
      (b.code && b.code.toLowerCase().includes(branchSearchText.toLowerCase()))
    );
  }, [companyScopedBranches, branchSearchText]);

  const filteredCompanies = useMemo(() => {
    if (!companySearchText.trim()) return companies;
    return companies.filter(c =>
      c.name.toLowerCase().includes(companySearchText.toLowerCase()) ||
      (c.clientId && c.clientId.toLowerCase().includes(companySearchText.toLowerCase()))
    );
  }, [companies, companySearchText]);

  const requiresProof = collectionType !== 'cash';

  /* ── API helper ── */
  const makeAPICall = async (
    endpoint: string,
    method = 'GET',
    body: any = null,
    isFormData = false,
  ) => {
    if (!userCredentials) throw new Error('User credentials not available');

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const config: RequestInit = {
      method,
      headers: {
        Authorization: `Basic ${btoa(`${userCredentials.userId}:${userCredentials.password}`)}`,
      },
      signal: controller.signal,
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

    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    clearTimeout(timeoutId);

    const responseText = await response.text();

    if (responseText.trim().startsWith('<!DOCTYPE html') || responseText.trim().startsWith('<html')) {
      throw new Error('Authentication failed - received login page instead of data');
    }
    if (response.status === 404) throw new Error(`Endpoint not found: ${endpoint}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}, message: ${responseText}`);

    try {
      return JSON.parse(responseText);
    } catch {
      throw new Error(`Invalid JSON response from server.`);
    }
  };

  /* ── Customers ── */
  const fetchExternalArray = async (url: string) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    const responseText = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${responseText}`);

    const parsed = JSON.parse(responseText);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.data)) return parsed.data;
    if (Array.isArray(parsed?.results)) return parsed.results;
    throw new Error('Invalid API response');
  };

  const getFirstValue = (item: any, keys: string[]) => {
    for (const key of keys) {
      const value = item?.[key];
      if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
    }
    return '';
  };

  const getCompanyFromRecord = (item: any) => getFirstValue(item, [
    'company',
    'company_name',
    'companyName',
    'client_company',
    'firm',
    'firm_name',
    'organization',
    'organisation',
  ]);

// client_ids that should never appear in the Select Company list
const EXCLUDED_CLIENT_IDS = new Set(['NTS04WC95G3U4'.toLowerCase()]);

// Company master API returns the real company_name directly, so no more
// guessing the name from acc-master/acc-departments rows or a manual map.
const buildCompanyOptionsFromApi = (rows: any[]): CompanyOption[] => {
  const byClientId = new Map<string, CompanyOption>();

  rows.forEach((item) => {
    const clientId = getFirstValue(item, ['client_id', 'clientId', 'client']);
    if (!clientId) return; // company must be identifiable by its client_id
    const key = clientId.toLowerCase();
    if (EXCLUDED_CLIENT_IDS.has(key)) return; // hide this client entirely

    const name = getFirstValue(item, ['company_name', 'name']) || clientId;
    const code = getFirstValue(item, ['code']);
    const id   = getFirstValue(item, ['id']) || clientId;

    byClientId.set(key, { id, name, clientId, code });
  });

  const options = [...byClientId.values()].sort((a, b) => a.name.localeCompare(b.name));
  return options.length > 0 ? options : DEFAULT_COMPANY_OPTIONS;
};

  const loadManualCustomers = async (): Promise<Customer[]> => {
    try {
      if (!userCredentials?.userId) return [];
      const key    = `manual_customers_${userCredentials.userId}`;
      const stored = await AsyncStorage.getItem(key);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };

  const saveManualCustomers = async (list: Customer[]) => {
    try {
      if (!userCredentials?.userId) return;
      await AsyncStorage.setItem(`manual_customers_${userCredentials.userId}`, JSON.stringify(list));
    } catch {}
  };

  const loadCustomersFromCache = async () => {
    try {
      const cached  = await AsyncStorage.getItem('cached_customers');
      if (cached) {
        setCustomers(JSON.parse(cached));
        return;
      }
    } catch {}
    setCustomers([]);
  };

  const fetchCustomers = async () => {
    if (isFetchingCustomers) return;
    try {
      setIsFetchingCustomers(true);

      const data = await fetchExternalArray(ACC_MASTER_API_URL);
      const formatted: Customer[] = data
        .filter((c: any) => getFirstValue(c, ['name']))
        .map((c: any, i: number) => {
          const debit  = parseFloat(c.debit  ?? '0') || 0;
          const credit = parseFloat(c.credit ?? '0') || 0;
          return {
            id:             getFirstValue(c, ['code', 'id']) || i.toString(),
            code:           getFirstValue(c, ['code']),
            name:           getFirstValue(c, ['name']),
            place:          getFirstValue(c, ['place', 'location', 'address', 'address3']),
            departmentCode: getFirstValue(c, ['openingdepartment', 'department_code', 'department', 'dept', 'branch_code']),
            clientId:       getFirstValue(c, ['client_id', 'clientId', 'client']),
            company:        getCompanyFromRecord(c),
            isManual:       false,
            balance:        debit - credit,
          };
        });

      setCustomers(formatted);
      await AsyncStorage.setItem('cached_customers', JSON.stringify(formatted));
      setCustomerFetchAttempts(0);
      return;
    } catch (err) {
      if (customerFetchAttempts < MAX_FETCH_ATTEMPTS) {
        setCustomerFetchAttempts(p => p + 1);
        setTimeout(() => { setIsFetchingCustomers(false); fetchCustomers(); }, RETRY_DELAY);
        return;
      }
    } finally {
      setIsFetchingCustomers(false);
    }
    await loadCustomersFromCache();
  };

  /* ── Branches ── */
  const loadBranchesFromCache = async (): Promise<boolean> => {
    try {
      const cached = await AsyncStorage.getItem('cached_branches');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) { setBranches(parsed); return true; }
      }
    } catch {}
    setBranches([]);
    return false;
  };

  const loadCompaniesFromCache = async (): Promise<boolean> => {
    try {
      const cached = await AsyncStorage.getItem('cached_companies');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) { setCompanies(parsed); return true; }
      }
    } catch {}
    setCompanies(DEFAULT_COMPANY_OPTIONS);
    return false;
  };

const fetchCompanies = async () => {
    try {
      const rows = await fetchExternalArray(COMPANY_API_URL);
      const formatted = buildCompanyOptionsFromApi(rows);

      const allowedCompanyRaw = await SecureStore.getItemAsync('company');
      let allowedCompanies: string[] = [];
      try {
        const parsed = allowedCompanyRaw ? JSON.parse(allowedCompanyRaw) : [];
        allowedCompanies = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
      } catch {
        // Not JSON — treat the raw string as a single allowed company (legacy format)
        allowedCompanies = allowedCompanyRaw ? [allowedCompanyRaw] : [];
      }
      const normalizedAllowed = allowedCompanies.map(c => c.trim().toLowerCase());

      const scoped = normalizedAllowed.length
        ? formatted.filter(c =>
            normalizedAllowed.includes(c.name.trim().toLowerCase()) ||
            normalizedAllowed.includes((c.clientId || '').trim().toLowerCase()) ||
            normalizedAllowed.includes((c.code || '').trim().toLowerCase())
          )
        : formatted;

      console.log('allowed companies:', allowedCompanies, 'available companies:', formatted.map(c => c.name));

      setCompanies(scoped);
      await AsyncStorage.setItem('cached_companies', JSON.stringify(scoped));
    } catch {
      await loadCompaniesFromCache();
    }
  };

  const fetchBranches = async () => {
    if (isFetchingBranches) return;
    try {
      setIsFetchingBranches(true);

      const data = await fetchExternalArray(ACC_DEPARTMENTS_API_URL);

      const formatted: Branch[] = data.map((b: any, i: number) => {
        const rawId = getFirstValue(b, ['department_id', 'id', 'code', 'department_code', 'dept']) || i.toString();
        return {
          id:       `${rawId}-${i}`,
          name:     getFirstValue(b, ['department', 'name', 'department_name', 'dept_name']) || 'Unknown',
          code:     getFirstValue(b, ['department_id', 'code', 'department_code', 'dept']),
          clientId: getFirstValue(b, ['client_id', 'clientId', 'client']),
          company:  getCompanyFromRecord(b),
        };
      });

     const allowedDeptRaw = await SecureStore.getItemAsync('department');
      const allowedDepartments: string[] = allowedDeptRaw ? JSON.parse(allowedDeptRaw) : [];
      const normalizedAllowed = allowedDepartments.map(d => d.trim().toLowerCase());
      const scoped = normalizedAllowed.length
        ? formatted.filter(b => normalizedAllowed.includes((b.name || '').trim().toLowerCase()))
        : formatted;
      console.log('allowed depts:', allowedDepartments, 'available depts:', formatted.map(b => b.name));

      setBranches(scoped);
      await AsyncStorage.setItem('cached_branches', JSON.stringify(scoped));
      setBranchFetchAttempts(0);
    } catch {
      const cached = await loadBranchesFromCache();
      if (!cached && branchFetchAttempts < MAX_FETCH_ATTEMPTS) {
        setBranchFetchAttempts(p => p + 1);
        setTimeout(() => { setIsFetchingBranches(false); fetchBranches(); }, RETRY_DELAY);
        return;
      }
    } finally {
      setIsFetchingBranches(false);
    }
  };

  /* ── Initialisation ── */
  useEffect(() => {
    const init = async () => {
      try {
        const [userId, password, username] = await Promise.all([
          SecureStore.getItemAsync('userId'),
          SecureStore.getItemAsync('password'),
          SecureStore.getItemAsync('username'),
        ]);
        if (userId && password) {
          const creds = { userId, password, username: username || userId };
          setUserCredentials(creds);

          // ── Show cached data instantly so the screen is usable immediately ──
          await Promise.all([
            loadCompaniesFromCache(),
            loadCustomersFromCache(),
            loadBranchesFromCache(),
          ]);

          // ── Mark ready now — user can start filling the form ──
          setIsInitializing(false);

          // ── Refresh from network in background (no await) ──
          Promise.all([fetchCompanies(), fetchCustomers(), fetchBranches()]).catch(() => {});
        } else {
          navigation.replace('Login');
        }
      } catch {
        await Promise.all([loadCompaniesFromCache(), loadCustomersFromCache(), loadBranchesFromCache()]);
        setIsInitializing(false);
      }
    };
    init();
  }, []);

  // Auto-retry branches
  useEffect(() => {
    if (userCredentials && branches.length === 0 && !isInitializing && !isFetchingBranches && branchFetchAttempts < MAX_FETCH_ATTEMPTS) {
      const t = setTimeout(fetchBranches, 2000);
      return () => clearTimeout(t);
    }
  }, [userCredentials, branches.length, isInitializing, isFetchingBranches, branchFetchAttempts]);

  /* ── Handlers ── */
  const handleAddManualCustomer = async () => {
    if (!manualCustomerName.trim()) {
      Alert.alert('Validation Error', 'Please enter customer name.');
      return;
    }
    try {
      const id = `MANUAL_${Date.now()}`;
      const newCustomer: Customer = {
        id,
        name:     manualCustomerName.trim(),
        place:    manualCustomerPlace.trim(),
        isManual: true,
      };
      const existing = await loadManualCustomers();
      await saveManualCustomers([...existing, newCustomer]);
      setCustomers(prev => [...prev, newCustomer]);
      setSelectedCustomerId(id);
      setSelectedCustomerPlace(manualCustomerPlace.trim());
      setIsManualCustomerMode(false);
      setManualCustomerName('');
      setManualCustomerPlace('');
      setShowCustomerDropdown(false);
      Alert.alert('Success', 'Customer added successfully!');
    } catch {
      Alert.alert('Error', 'Failed to add customer. Please try again.');
    }
  };

  const handleCustomerSelect = useCallback((id: string) => {
    const c = customers.find(x => x.id === id);
    setSelectedCustomerId(id);
    setSelectedCustomerPlace(c?.place || '');
    if (c?.company && !company) setCompany(c.company);
    setShowCustomerDropdown(false);
    setCustomerSearchText('');
  }, [company, customers]);

  const handleBranchSelect = useCallback((id: string) => {
    setSelectedBranchId(id);
    setSelectedCustomerId('');
    setSelectedCustomerPlace('');
    setShowBranchDropdown(false);
    setBranchSearchText('');
  }, []);

  const handleCompanySelect = useCallback((item: CompanyOption) => {
    setCompany(item.name);
    setSelectedBranchId('');
    setSelectedCustomerId('');
    setSelectedCustomerPlace('');
    setShowCompanyDropdown(false);
    setCompanySearchText('');
    setBranchSearchText('');
    setCustomerSearchText('');
  }, []);

  const handleCollectionTypeChange = useCallback((type: CollectionType) => {
    setCollectionType(type);
    if (type === 'cash') { setScreenshot(null); setPaymentProofAsset(null); }
  }, []);

  const resetForm = useCallback(() => {
    setSelectedCustomerId('');
    setSelectedCustomerPlace('');
    setCompany('');
    setSelectedBranchId('');
    setAmount('');
    setPaidFor('');
    setNotes('');
    setScreenshot(null);
    setPaymentProofAsset(null);
    setCollectionType('upi');
    setShowCompanyDropdown(false);
    setShowCustomerDropdown(false);
    setShowBranchDropdown(false);
    setCompanySearchText('');
    setCustomerSearchText('');
    setBranchSearchText('');
    setIsManualCustomerMode(false);
    setManualCustomerName('');
    setManualCustomerPlace('');
  }, []);

  const buildPaymentProofAsset = (asset: ImagePicker.ImagePickerAsset): PaymentProofAsset => {
    const uri = asset.uri;
    const rawName = asset.fileName || asset.uri.split('/').pop() || `payment_proof_${Date.now()}.jpg`;
    const name = /\.[a-z0-9]+$/i.test(rawName) ? rawName : `${rawName}.jpg`;
    const extension = (name.match(/\.([a-z0-9]+)$/i)?.[1] || 'jpg').toLowerCase();
    const normalizedExtension = extension === 'jpg' ? 'jpeg' : extension;
    const type = asset.mimeType || `image/${normalizedExtension}`;

    return { uri, name, type };
  };

  /* ── Image picker ── */
  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera roll permission is needed.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setScreenshot(asset.uri);
        setPaymentProofAsset(buildPaymentProofAsset(asset));
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
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setScreenshot(asset.uri);
        setPaymentProofAsset(buildPaymentProofAsset(asset));
      }
    } catch {
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  /* ── Submit ── */
  const handleSubmit = async () => {
    // Resolve customer name/place
    let customerName  = '';
    let customerPlace = '';

    if (!company.trim() || !selectedCompany) {
      Alert.alert('Validation Error', 'Please select a company from the list.');
      return;
    }
    if (!selectedBranchId || !selectedBranch) {
      Alert.alert('Validation Error', 'Please select a department.');
      return;
    }
    if (!selectedCustomerId || !selectedCustomer) {
      Alert.alert('Validation Error', 'Please select a customer.');
      return;
    }

    customerName  = selectedCustomer.name;
    customerPlace = selectedCustomerPlace;

    if (!amount.trim()) {
      Alert.alert('Validation Error', 'Please enter an amount.');
      return;
    }
    
    if (requiresProof && !paymentProofAsset) {
      Alert.alert('Validation Error', 'Please attach a payment proof image.');
      return;
    }

    // Snapshot credentials at call time — avoids stale closure issue
    const creds = userCredentials;
    if (!creds) {
      Alert.alert('Error', 'Session expired. Please login again.');
      navigation.replace('Login');
      return;
    }

    try {
      setLoading(true);

      const formData = new FormData();
      const creatorId = creds.userId;
      const creatorName = creds.username || creds.userId;

      formData.append('client_name',     customerName);
      formData.append('company',         company.trim());
      formData.append('department',      selectedBranch.name);
      formData.append('collection_type', collectionType);
      formData.append('amount',          amount.trim());
      formData.append('paid_for',        paidFor.trim());
      formData.append('notes',           notes.trim());
      formData.append('created_by',      creatorId);
      formData.append('created_by_name', creatorName);
      formData.append('creator',         creatorName);
      formData.append('collected_by',    creatorName);
      formData.append('user_id',         creatorId);
      formData.append('userid',          creatorId);
      // Place was being captured in state but never sent — this was why it
      // never showed up on the collection card. Sending a couple of likely
      // field-name variants since the exact one the backend expects isn't confirmed.
      formData.append('place',           customerPlace.trim());
      formData.append('client_place',    customerPlace.trim());

      // Payment proof — only when required
     if (requiresProof && paymentProofAsset) {
      const proofFile = {
        uri: paymentProofAsset.uri,
        name: paymentProofAsset.name,
        type: paymentProofAsset.type,
      } as any;

      formData.append('payment_proof', proofFile);
    }

      // Direct fetch — avoids the stale-state risk inside makeAPICall
      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

      const response = await fetch(ADD_COLLECTION_API_URL, {
        method:      'POST',
        headers: {
          Authorization: `Basic ${btoa(`${creds.userId}:${creds.password}`)}`,
        },
        body:        formData,
        credentials: 'include',
        signal:      controller.signal,
      });
      clearTimeout(timeoutId);

      const responseText = await response.text();

      // Show the raw server response in the alert so we can debug
      if (!response.ok) {
        const serverMsg = formatServerError(responseText);
        Alert.alert(
          `Server Error (${response.status})`,
          serverMsg.substring(0, 900),
        );
        return;
      }

     
        let result: any = {};
        try {
          result = JSON.parse(responseText);
        } catch {
          // Non-JSON 2xx — treat as success
        }

        // TEMP DEBUG — remove once confirmed
        if (__DEV__) {
        console.log('SUBMIT DEBUG → proof asset sent:', paymentProofAsset);
        console.log('SUBMIT DEBUG → server returned:', JSON.stringify(result?.data));
      }

      // Save locally and navigate back
      const newEntry: CollectionEntry = {
        id:                   result?.data?.id?.toString() || `temp_${Date.now()}`,
        customerId:           selectedCustomerId || 'manual',
        customerName,
        customerPlace,
        company:              company.trim(),
        branchId:             selectedBranchId,
        branchName:           selectedBranch.name,
        collectionType,
        collectionTypeDisplay: '',
        amount:               amount.trim(),
        paidFor:              paidFor.trim(),
        notes:                notes.trim(),
        screenshot,
        paymentProofUrl:      result?.data?.payment_proof_url || result?.data?.cloudflare_r2_url || screenshot,
        status:               'pending',
        createdAt:            result?.data?.created_at || new Date().toISOString(),
        createdByName:        result?.data?.created_by_name || creatorName,
      };

      const storageKey  = `collections_${creds.userId}`;
      const stored      = await AsyncStorage.getItem(storageKey);
      const existing    = stored ? JSON.parse(stored) : [];
      existing.unshift(newEntry); // newest first
      await AsyncStorage.setItem(storageKey, JSON.stringify(existing));

      resetForm();
      setShowSuccessCard(true);
      setTimeout(() => { setShowSuccessCard(false); navigation.goBack(); }, 2200);

    } catch (error: any) {
      if (error.name === 'AbortError') {
        Alert.alert('Timeout', 'Request timed out. Check your connection and try again.');
      } else {
        // Show the actual error message — not a generic one
        Alert.alert('Submission Failed', error.message || 'An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  /* ── Render helpers ── */
  const renderCustomerItem = useCallback(({ item }: { item: Customer }) => {
    const bal = item.balance ?? 0;
    const balColor = bal > 0 ? '#16A34A' : bal < 0 ? '#DC2626' : '#A39A85';
    return (
      <TouchableOpacity style={styles.dropdownItem} onPress={() => handleCustomerSelect(item.id)} activeOpacity={0.7}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.dropdownItemTitle} numberOfLines={1}>{item.name}</Text>
              {item.isManual && (
                <View style={styles.manualBadge}><Text style={styles.manualBadgeText}>Manual</Text></View>
              )}
            </View>
            {item.place ? <Text style={styles.dropdownItemSub} numberOfLines={1}>{item.place}</Text> : null}
          </View>
          {!item.isManual && item.balance !== undefined && (
            <Text style={{ fontSize: 13, fontWeight: '700', color: balColor }}>
              ₹{Math.abs(bal).toFixed(2)}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [handleCustomerSelect]);

  const renderBranchItem = useCallback(({ item }: { item: Branch }) => (
  <TouchableOpacity style={styles.dropdownItem} onPress={() => handleBranchSelect(item.id)} activeOpacity={0.7}>
    <Text style={styles.dropdownItemTitle} numberOfLines={2}>{item.name}</Text>
  </TouchableOpacity>
), [handleBranchSelect]);
const renderCompanyItem = useCallback(({ item }: { item: CompanyOption }) => (
  <TouchableOpacity style={styles.dropdownItem} onPress={() => handleCompanySelect(item)} activeOpacity={0.7}>
    <Text style={styles.dropdownItemTitle} numberOfLines={2}>{item.name}</Text>
    {item.clientId ? (
      <Text style={styles.dropdownItemSub} numberOfLines={1}>{item.clientId}</Text>
    ) : null}
  </TouchableOpacity>
), [handleCompanySelect]);

 /* ── Loading gate ── */
  if (isInitializing) {
    return (
      <View style={styles.initLoader}>
        <ActivityIndicator size="large" color="#F5C451" />
        <Text style={styles.initLoaderText}>Loading…</Text>
      </View>
    );
  }

  /* ── Main render ── */
  return (
    <View style={styles.root}>
    {/* Header */}
    <View style={styles.header} onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
      <TouchableOpacity style={styles.backButton} onPress={() => { resetForm(); navigation.goBack(); }}>
        <Ionicons name="arrow-back" size={22} color="#1C1B17" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{editData ? 'Edit Collection' : 'Add Collection'}</Text>
      <View style={{ width: 44 }} />
    </View>

   <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : headerHeight}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
          {/* ── Section: Customer ── */}
          <Text style={styles.sectionLabel}>COLLECTION INFO</Text>

          {/* Customer selector */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Company <Text style={styles.required}>*</Text></Text>
            <TouchableOpacity
              style={styles.selector}
              onPress={() => setShowCompanyDropdown(true)}
              activeOpacity={0.8}
            >
              <Text style={[styles.selectorText, !selectedCompany && styles.placeholderText]} numberOfLines={1}>
                {selectedCompany ? selectedCompany.name : 'Select company'}
              </Text>
              <Ionicons name="chevron-down" size={18} color="#A39A85" />
            </TouchableOpacity>
          </View>

          {/* Department */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Department <Text style={styles.required}>*</Text></Text>
            <TouchableOpacity
              style={[styles.selector, !selectedCompany && styles.selectorDisabled]}
              onPress={() => selectedCompany && setShowBranchDropdown(true)}
              activeOpacity={0.8}
              disabled={!selectedCompany}
            >
              <Text style={[styles.selectorText, !selectedBranch && styles.placeholderText]} numberOfLines={1}>
                {selectedBranch ? selectedBranch.name : (selectedCompany ? 'Select department' : 'Select company first')}
              </Text>
              <Ionicons name="chevron-down" size={18} color="#A39A85" />
            </TouchableOpacity>
          </View>

          {/* Client */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Client Name <Text style={styles.required}>*</Text></Text>
            <TouchableOpacity
              style={[styles.selector, (!selectedCompany || !selectedBranch) && styles.selectorDisabled]}
              onPress={() => selectedCompany && selectedBranch && setShowCustomerDropdown(true)}
              activeOpacity={0.8}
              disabled={!selectedCompany || !selectedBranch}
            >
              <Text style={[styles.selectorText, !selectedCustomer && styles.placeholderText]} numberOfLines={1}>
                {selectedCustomer ? selectedCustomer.name : (selectedBranch ? 'Select client' : 'Select department first')}
              </Text>
              <Ionicons name="chevron-down" size={18} color="#A39A85" />
            </TouchableOpacity>
          </View>

          {/* Balance chip — shown after a client is selected */}
          {selectedCustomer && selectedCustomer.balance !== undefined && !selectedCustomer.isManual && (() => {
            const bal = selectedCustomer.balance ?? 0;
            const balColor = bal > 0 ? '#16A34A' : bal < 0 ? '#DC2626' : '#A39A85';
            const balLabel = bal > 0 ? 'Outstanding' : bal < 0 ? 'Advance' : 'Settled';
            return (
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#FFFFFF',
                borderRadius: 12,
                paddingHorizontal: 16,
                paddingVertical: 10,
                marginBottom: 8,
                borderWidth: 1,
                borderColor: '#E8E3D9',
              }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#7E7767' }}>Balance</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: balColor }}>
                    ₹{Math.abs(bal).toFixed(2)}
                  </Text>
                  <View style={{
                    backgroundColor: balColor + '20',
                    borderRadius: 6,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                  }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: balColor }}>{balLabel}</Text>
                  </View>
                </View>
              </View>
            );
          })()}

          {/* ── Section: Payment ── */}
          <Text style={[styles.sectionLabel, { marginTop: 24 }]}>PAYMENT DETAILS</Text>

          {/* Place */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Place</Text>
            <TextInput
              style={styles.input}
              placeholder="Client place"
              placeholderTextColor="#A39A85"
              value={selectedCustomerPlace}
              onChangeText={setSelectedCustomerPlace}
            />
          </View>

          {/* Collection Type */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Collection Type <Text style={styles.required}>*</Text></Text>
            <View style={styles.typeGrid}>
              {COLLECTION_TYPES.map(ct => {
                const active = collectionType === ct.id;
                return (
                  <TouchableOpacity
                    key={ct.id}
                    style={[styles.typeChip, active && styles.typeChipActive]}
                    onPress={() => handleCollectionTypeChange(ct.id)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={ct.icon as any} size={18} color={active ? '#1C1B17' : '#A39A85'} />
                    <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>{ct.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Amount */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Amount <Text style={styles.required}>*</Text></Text>
            <View style={styles.amountRow}>
              <View style={styles.amountPrefix}>
                <Text style={styles.amountPrefixText}>₹</Text>
              </View>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                placeholderTextColor="#A39A85"
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
              />
            </View>
          </View>

          {/* Paid For */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Paid For (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Invoice #1023"
              placeholderTextColor="#A39A85"
              value={paidFor}
              onChangeText={setPaidFor}
            />
          </View>

          {/* Notes */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              placeholder="Additional notes (optional)"
              placeholderTextColor="#A39A85"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* ── Payment Proof ── */}
          {requiresProof && (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>
                Payment Proof <Text style={styles.required}>*</Text>
              </Text>
              <Text style={styles.fieldHint}>
                {collectionType === 'cheque' ? 'Take a clear photo of the cheque.' : 'Upload a screenshot of the transfer.'}
              </Text>

              {screenshot ? (
                <View style={styles.proofPreviewWrap}>
                  <Image source={{ uri: screenshot }} style={styles.proofPreview} resizeMode="cover" />
                  <TouchableOpacity
                    style={styles.proofRemoveBtn}
                    onPress={() => { setScreenshot(null); setPaymentProofAsset(null); }}
                  >
                    <Ionicons name="close-circle" size={28} color="#E0763C" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.proofButtonRow}>
                  {collectionType === 'cheque' ? (
                    <TouchableOpacity style={styles.proofButton} onPress={takePhoto} activeOpacity={0.8}>
                      <Ionicons name="camera-outline" size={24} color="#1C1B17" />
                      <Text style={styles.proofButtonText}>Take Photo</Text>
                    </TouchableOpacity>
                  ) : (
                    <>
                      <TouchableOpacity style={styles.proofButton} onPress={pickImage} activeOpacity={0.8}>
                        <Ionicons name="images-outline" size={24} color="#1C1B17" />
                        <Text style={styles.proofButtonText}>Gallery</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.proofButton} onPress={takePhoto} activeOpacity={0.8}>
                        <Ionicons name="camera-outline" size={24} color="#1C1B17" />
                        <Text style={styles.proofButtonText}>Camera</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, loading && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#1C1B17" />
            ) : (
              <Text style={styles.submitBtnText}>{editData ? 'Update Collection' : 'Add Collection'}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Success overlay ── */}
      {showSuccessCard && (
        <View style={styles.successOverlay} pointerEvents="none">
          <View style={styles.successCard}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark" size={28} color="#1C1B17" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.successTitle}>Collection Added!</Text>
              <Text style={styles.successSub}>Record saved successfully.</Text>
            </View>
          </View>
        </View>
      )}

      {/* Full-screen loader */}
      {loading && (
        <View style={styles.fullLoader}>
          <View style={styles.fullLoaderCard}>
            <ActivityIndicator size="large" color="#F5C451" />
            <Text style={styles.fullLoaderText}>Submitting…</Text>
          </View>
        </View>
      )}

      {/* ── Customer Dropdown Modal ── */}
    <Modal visible={showCompanyDropdown} animationType="slide" presentationStyle="fullScreen">
  <SafeAreaView style={styles.modalRoot}>
    <View style={styles.modalHeader}>
      <TouchableOpacity style={styles.modalBackBtn} onPress={() => setShowCompanyDropdown(false)}>
        <Ionicons name="arrow-back" size={22} color="#1C1B17" />
      </TouchableOpacity>
      <Text style={styles.modalTitle}>Select Company</Text>
      <View style={{ width: 44 }} />
    </View>

    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#A39A85" style={{ marginRight: 10 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search companies..."
          placeholderTextColor="#A39A85"
          value={companySearchText}
          onChangeText={setCompanySearchText}
          autoFocus
        />
        {companySearchText.length > 0 && (
          <TouchableOpacity onPress={() => setCompanySearchText('')}>
            <Ionicons name="close-circle" size={18} color="#A39A85" />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filteredCompanies}
        keyExtractor={item => item.id}
        renderItem={renderCompanyItem}
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="business-outline" size={40} color="#D4A574" />
            <Text style={styles.emptyStateText}>No companies found</Text>
          </View>
        }
      />
    </KeyboardAvoidingView>
  </SafeAreaView>
</Modal>

      <Modal visible={showCustomerDropdown} animationType="slide" presentationStyle="fullScreen">
  <SafeAreaView style={styles.modalRoot}>
    <View style={styles.modalHeader}>
      <TouchableOpacity
        style={styles.modalBackBtn}
        onPress={() => {
          setShowCustomerDropdown(false);
          setIsManualCustomerMode(false);
          setManualCustomerName('');
          setManualCustomerPlace('');
        }}
      >
        <Ionicons name="arrow-back" size={22} color="#1C1B17" />
      </TouchableOpacity>
      <Text style={styles.modalTitle}>
        Select Client
      </Text>
      <View style={{ width: 44 }} />
    </View>

    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {isManualCustomerMode ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.manualForm} keyboardShouldPersistTaps="handled">
          <Text style={styles.fieldLabel}>Customer Name <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={[styles.input, { marginBottom: 16 }]}
            placeholder="Enter customer name"
            placeholderTextColor="#A39A85"
            value={manualCustomerName}
            onChangeText={setManualCustomerName}
            autoFocus
          />
          <Text style={styles.fieldLabel}>Place</Text>
          <TextInput
            style={[styles.input, { marginBottom: 24 }]}
            placeholder="Enter place (optional)"
            placeholderTextColor="#A39A85"
            value={manualCustomerPlace}
            onChangeText={setManualCustomerPlace}
          />
          <TouchableOpacity style={styles.submitBtn} onPress={handleAddManualCustomer} activeOpacity={0.85}>
            <Text style={styles.submitBtnText}>Add Customer</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="#A39A85" style={{ marginRight: 10 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search customers…"
              placeholderTextColor="#A39A85"
              value={customerSearchText}
              onChangeText={setCustomerSearchText}
              autoFocus
            />
            {customerSearchText.length > 0 && (
              <TouchableOpacity onPress={() => setCustomerSearchText('')}>
                <Ionicons name="close-circle" size={18} color="#A39A85" />
              </TouchableOpacity>
            )}
          </View>
          <FlatList
            data={filteredCustomers}
            keyExtractor={item => item.id}
            renderItem={renderCustomerItem}
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={40} color="#D4A574" />
                <Text style={styles.emptyStateText}>No customers found</Text>
              </View>
            }
          />
        </>
      )}
    </KeyboardAvoidingView>
  </SafeAreaView>
</Modal>

     <Modal visible={showBranchDropdown} animationType="slide" presentationStyle="fullScreen">
  <SafeAreaView style={styles.modalRoot}>
    <View style={styles.modalHeader}>
      <TouchableOpacity style={styles.modalBackBtn} onPress={() => setShowBranchDropdown(false)}>
        <Ionicons name="arrow-back" size={22} color="#1C1B17" />
      </TouchableOpacity>
      <Text style={styles.modalTitle}>Select Department</Text>
      <View style={{ width: 44 }} />
    </View>

    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#A39A85" style={{ marginRight: 10 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search departments…"
          placeholderTextColor="#A39A85"
          value={branchSearchText}
          onChangeText={setBranchSearchText}
          autoFocus
        />
        {branchSearchText.length > 0 && (
          <TouchableOpacity onPress={() => setBranchSearchText('')}>
            <Ionicons name="close-circle" size={18} color="#A39A85" />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filteredBranches}
        keyExtractor={item => item.id}
        renderItem={renderBranchItem}
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="business-outline" size={40} color="#D4A574" />
            <Text style={styles.emptyStateText}>
              {isFetchingBranches ? 'Loading departments…' : 'No departments found'}
            </Text>
          </View>
        }
      />
    </KeyboardAvoidingView>
  </SafeAreaView>
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

  /* Init loader */
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

  /* Header */
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
  backButton: {
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1B17',
    letterSpacing: -0.3,
  },

  /* Scroll */
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 48,
  },

  /* Section label */
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A39A85',
    letterSpacing: 1.4,
    marginBottom: 14,
  },

  /* Field */
  field: {
    marginBottom: 18,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C1B17',
    marginBottom: 8,
  },
  fieldHint: {
    fontSize: 12,
    color: '#A39A85',
    marginBottom: 10,
    fontWeight: '500',
  },
  required: {
    color: '#E0763C',
  },

  /* Text input */
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E8E3D9',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1B17',
  },
  textarea: {
    height: 90,
    paddingTop: 14,
  },

  /* Selector (dropdown trigger) */
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E8E3D9',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  selectorDisabled: {
    opacity: 0.55,
  },
  selectorText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1B17',
    marginRight: 8,
  },
  placeholderText: {
    color: '#A39A85',
    fontWeight: '500',
  },

  /* Collection type chips */
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 50,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E8E3D9',
  },
  typeChipActive: {
    backgroundColor: '#F5C451',
    borderColor: '#F5C451',
  },
  typeChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#A39A85',
  },
  typeChipTextActive: {
    color: '#1C1B17',
  },

  /* Amount input */
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E8E3D9',
    borderRadius: 14,
    overflow: 'hidden',
  },
  amountPrefix: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#F0EAD8',
    borderRightWidth: 1.5,
    borderRightColor: '#E8E3D9',
  },
  amountPrefixText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1C1B17',
  },
  amountInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1B17',
  },

  /* Payment proof */
  proofButtonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  proofButton: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E8E3D9',
    borderRadius: 16,
    borderStyle: 'dashed',
  },
  proofButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C1B17',
  },
  proofPreviewWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    height: 200,
    position: 'relative',
  },
  proofPreview: {
    width: '100%',
    height: '100%',
  },
  proofRemoveBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  /* Submit button */
  submitBtn: {
    marginTop: 12,
    backgroundColor: '#1C1B17',
    borderRadius: 50,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: '#1C1B17',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F5C451',
    letterSpacing: 0.5,
  },

  /* Success overlay */
  successOverlay: {
    position: 'absolute',
    bottom: 40,
    left: 24,
    right: 24,
  },
  successCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1B17',
    borderRadius: 20,
    padding: 20,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  successIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F5C451',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F5C451',
  },
  successSub: {
    fontSize: 13,
    fontWeight: '500',
    color: '#A39A85',
    marginTop: 2,
  },

  /* Full loader */
  fullLoader: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28,27,23,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  fullLoaderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    minWidth: 160,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  fullLoaderText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1B17',
  },

  /* Modal */
  modalRoot: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EAD8',
    backgroundColor: '#FAF9F6',
  },
  modalBackBtn: {
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
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1C1B17',
    letterSpacing: -0.2,
  },

  /* Search bar */
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginVertical: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 50,
    borderWidth: 1.5,
    borderColor: '#E8E3D9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1B17',
    padding: 0,
  },

  /* Dropdown items */
  dropdownItem: {
    marginHorizontal: 20,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  dropdownItemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1B17',
  },
  dropdownItemSub: {
    fontSize: 12,
    color: '#A39A85',
    fontWeight: '500',
    marginTop: 2,
  },

  /* Manual badge */
  manualBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  manualBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D97706',
  },

  /* Empty state */
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyStateText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#A39A85',
  },

  /* Manual form */
  manualForm: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 48,
  },
});