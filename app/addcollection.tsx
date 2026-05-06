/* eslint-disable prettier/prettier */
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface UserCredentials {
  userId: string;
  password: string;
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

interface CollectionEntry {
  id: string;
  customerId: string;
  customerName: string;
  customerPlace?: string;
  branchId: string;
  branchName: string;
  amount: string;
  notes?: string;
  screenshot: string | null;
  createdAt: string;
  paymentMethod?: 'UPI' | 'cash' | 'cheque' | 'neft';
}

type PaymentMethod = 'UPI' | 'cash' | 'cheque' | 'neft';

const API_BASE_URL = 'https://myimc.in/app4/api';
const { height: screenHeight, width: screenWidth } = Dimensions.get('window');

const PAYMENT_METHODS = [
  { id: 'UPI', label: 'UPI', icon: 'logo-google' },
  { id: 'cash', label: 'Cash', icon: 'cash-outline' },
  { id: 'cheque', label: 'Cheque', icon: 'document-text-outline' },
  { id: 'neft', label: 'NEFT', icon: 'card-outline' },
];

const MAX_FETCH_ATTEMPTS = 3;
const FETCH_TIMEOUT = 15000; // 15 seconds
const RETRY_DELAY = 2000; // 2 seconds

export default function AddCollection() {
  const navigation = useNavigation();
  const route = useRoute();
  const params = route.params || {};
  
  const editData = params.editData ? JSON.parse(params.editData as string) as CollectionEntry : null;

  const [showSuccessCard, setShowSuccessCard] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userCredentials, setUserCredentials] = useState<UserCredentials | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isInitializing, setIsInitializing] = useState(true);
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  
  const [customerSearchText, setCustomerSearchText] = useState('');
  const [branchSearchText, setBranchSearchText] = useState('');

  const [isManualCustomerMode, setIsManualCustomerMode] = useState(false);
  const [manualCustomerName, setManualCustomerName] = useState('');
  const [manualCustomerPlace, setManualCustomerPlace] = useState('');

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(editData?.customerId || '');
  const [selectedCustomerPlace, setSelectedCustomerPlace] = useState<string>(editData?.customerPlace || '');
  const [selectedBranchId, setSelectedBranchId] = useState<string>(editData?.branchId || '');
  const [amount, setAmount] = useState<string>(editData?.amount || '');
  const [notes, setNotes] = useState<string>(editData?.notes || '');
  const [screenshot, setScreenshot] = useState<string | null>(editData?.screenshot || null);
  const [screenshotBase64, setScreenshotBase64] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(editData?.paymentMethod || 'UPI');

  // New state for retry logic
  const [branchFetchAttempts, setBranchFetchAttempts] = useState(0);
  const [customerFetchAttempts, setCustomerFetchAttempts] = useState(0);
  const [isFetchingBranches, setIsFetchingBranches] = useState(false);
  const [isFetchingCustomers, setIsFetchingCustomers] = useState(false);

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    const keyboardDidHideListener = Keyboard.addListener(
      'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );

    return () => {
      keyboardDidHideListener.remove();
      keyboardDidShowListener.remove();
    };
  }, []);

  const filteredCustomers = useMemo(() => {
    let filtered = customers;
    
    if (customerSearchText.trim()) {
      filtered = customers.filter(customer =>
        customer.name.toLowerCase().includes(customerSearchText.toLowerCase()) ||
        (customer.place && customer.place.toLowerCase().includes(customerSearchText.toLowerCase()))
      );
    }
    
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, customerSearchText]);

  const filteredBranches = useMemo(() => {
    if (!branchSearchText.trim()) return branches;
    
    return branches.filter(branch =>
      branch.name.toLowerCase().includes(branchSearchText.toLowerCase()) ||
      (branch.code && branch.code.toLowerCase().includes(branchSearchText.toLowerCase()))
    );
  }, [branches, branchSearchText]);

  const selectedCustomer = useMemo(() => 
    customers.find(c => c.id === selectedCustomerId), 
    [customers, selectedCustomerId]
  );

  const selectedBranch = useMemo(() => 
    branches.find(b => b.id === selectedBranchId), 
    [branches, selectedBranchId]
  );

  const initializeUser = async () => {
    try {
      const [userId, password] = await Promise.all([
        SecureStore.getItemAsync('userId'),
        SecureStore.getItemAsync('password'),
      ]);

      if (userId && password) {
        console.log('✅ User credentials loaded:', userId);
        const credentials = { userId, password };
        setUserCredentials(credentials);
        return credentials;
      } else {
        console.log('❌ No credentials found, redirecting to login');
        navigation.replace('Login');
        return null;
      }
    } catch (error) {
      console.error('❌ Error initializing user:', error);
      navigation.replace('Login');
      return null;
    }
  };

  const makeAPICall = async (endpoint: string, method: string = 'GET', body: any = null, isFormData: boolean = false) => {
    try {
      if (!userCredentials) {
        throw new Error('User credentials not available');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

      const config: RequestInit = {
        method,
        headers: {
          'Authorization': `Basic ${btoa(`${userCredentials.userId}:${userCredentials.password}`)}`,
        },
        signal: controller.signal,
        credentials: 'include', // IMPORTANT: Include cookies
      };

      if (body && method !== 'GET') {
        if (isFormData) {
          config.body = body;
        } else {
          config.headers = {
            ...config.headers,
            'Content-Type': 'application/json',
          };
          config.body = JSON.stringify(body);
        }
      }

      console.log(`📡 Making API call to: ${API_BASE_URL}${endpoint}`);
      console.log(`📡 Method: ${method}`);
      console.log(`📡 Auth: ${userCredentials.userId}`);
      
      const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
      clearTimeout(timeoutId);
      
      console.log(`📡 Response status: ${response.status}`);
      console.log(`📡 Response Content-Type:`, response.headers.get('content-type'));
      
      // Get raw response text first
      const responseText = await response.text();
      console.log(`📡 Raw response (first 500 chars):`, responseText.substring(0, 500));
      
      // Check if response is HTML (login page)
      if (responseText.trim().startsWith('<!DOCTYPE html') || responseText.trim().startsWith('<html')) {
        console.error('❌ Received HTML instead of JSON - Authentication failed or session expired');
        throw new Error('Authentication failed - received login page instead of data');
      }
      
      if (response.status === 404) {
        throw new Error(`Endpoint not found: ${endpoint}`);
      }
      
      if (!response.ok) {
        console.error(`❌ API Error Response: ${responseText}`);
        throw new Error(`HTTP error! status: ${response.status}, message: ${responseText}`);
      }

      // Try to parse JSON
      try {
        const result = JSON.parse(responseText);
        console.log(`✅ API Response received and parsed successfully`);
        return result;
      } catch (parseError) {
        console.error('❌ JSON Parse Error. Response was:', responseText.substring(0, 1000));
        throw new Error(`Invalid JSON response from server. Got: ${responseText.substring(0, 100)}`);
      }
      
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.error(`⏱️ Request timeout for ${endpoint}`);
        throw new Error('Request timeout');
      }
      console.error(`❌ API call failed for ${endpoint}:`, error);
      throw error;
    }
  };

  const loadManualCustomers = async () => {
    try {
      if (!userCredentials?.userId) return [];
      
      const storageKey = `manual_customers_${userCredentials.userId}`;
      const storedManualCustomers = await AsyncStorage.getItem(storageKey);
      
      if (storedManualCustomers) {
        return JSON.parse(storedManualCustomers);
      }
      return [];
    } catch (error) {
      console.error('Error loading manual customers:', error);
      return [];
    }
  };

  const fetchCustomers = async () => {
    if (isFetchingCustomers) {
      console.log('⚠️ Already fetching customers, skipping...');
      return;
    }

    try {
      setIsFetchingCustomers(true);
      console.log('=== FETCHING CUSTOMERS ===');
      console.log('Current userCredentials:', userCredentials ? 'Available' : 'Not Available');
      
      if (!userCredentials) {
        console.log('⚠️ User credentials not available, using cache/mock');
        await loadCustomersFromCache();
        return;
      }
      
      console.log('✅ Fetching customers from API...');
      const response = await makeAPICall('/clients');
      
      if (response && Array.isArray(response)) {
        console.log('✅ Customers API response count:', response.length);
        
        const formattedCustomers: Customer[] = response.map((customer: any, index: number) => ({
          id: customer.code || customer.id?.toString() || index.toString(),
          name: customer.name,
          place: customer.place || customer.location || customer.address || customer.address3 || '',
          isManual: false,
        }));
        
        console.log('✅ Formatted customers count:', formattedCustomers.length);
        
        const manualCustomers = await loadManualCustomers();
        const allCustomers = [...formattedCustomers, ...manualCustomers];
        
        setCustomers(prevCustomers => {
          if (JSON.stringify(prevCustomers) === JSON.stringify(allCustomers)) {
            return prevCustomers;
          }
          return allCustomers;
        });
        
        await AsyncStorage.setItem('cached_customers', JSON.stringify(formattedCustomers));
        console.log('✅ Customers saved to cache');
        setCustomerFetchAttempts(0);
        return;
      }
    } catch (error) {
      console.log('❌ Error fetching customers:', error);
      
      if (customerFetchAttempts < MAX_FETCH_ATTEMPTS) {
        console.log(`Retrying customer fetch... Attempt ${customerFetchAttempts + 1}/${MAX_FETCH_ATTEMPTS}`);
        setCustomerFetchAttempts(prev => prev + 1);
        setTimeout(() => {
          setIsFetchingCustomers(false);
          fetchCustomers();
        }, RETRY_DELAY);
        return;
      }
    } finally {
      setIsFetchingCustomers(false);
    }
    
    await loadCustomersFromCache();
  };

  const loadCustomersFromCache = async (): Promise<boolean> => {
    try {
      const cachedCustomers = await AsyncStorage.getItem('cached_customers');
      const manualCustomers = await loadManualCustomers();
      
      if (cachedCustomers) {
        const parsed = JSON.parse(cachedCustomers);
        setCustomers([...parsed, ...manualCustomers]);
        console.log('✅ Loaded customers from cache');
        return true;
      }
    } catch (cacheError) {
      console.log('⚠️ No cached customers found');
    }
    
    const mockCustomers: Customer[] = [
      { id: 'IN', name: 'ICON RESIDENCY', place: 'OOTY ROAD MEPPADI', isManual: false },
      { id: 'IM128', name: 'INDO SPICES & PULSES', place: 'HUNSOOR (RITS Wayanad)', isManual: false },
      { id: 'IM131', name: 'HITLER MENS WEAR', place: 'SULTHAN BATHERY', isManual: false },
      { id: 'IM132', name: 'HIGHNESS GRILLS RESTAURANT', place: 'KALPETTA', isManual: false },
      { id: 'IM133', name: 'FAMILY HYPERMART MUKKAM', place: 'MUKKAM', isManual: false },
      { id: 'IM134', name: 'LOYAL ENTERPRISES', place: 'KOZHIKODE', isManual: false },
      { id: 'IM135', name: 'CV SUPERMARKET', place: 'WAYANAD', isManual: false },
    ];
    
    const manualCustomers = await loadManualCustomers();
    setCustomers([...mockCustomers, ...manualCustomers]);
    await AsyncStorage.setItem('cached_customers', JSON.stringify(mockCustomers));
    console.log('✅ Using mock customers');
    return true;
  };

  const fetchBranches = async () => {
    if (isFetchingBranches) {
      console.log('⚠️ Already fetching branches, skipping...');
      return;
    }

    try {
      setIsFetchingBranches(true);
      console.log('=== FETCHING BRANCHES ===');
      console.log('API URL:', `${API_BASE_URL}/departments`);
      
      if (!userCredentials) {
        console.log('⚠️ User credentials not available, loading from cache');
        const cacheLoaded = await loadBranchesFromCache();
        if (!cacheLoaded) {
          setTimeout(() => {
            setIsFetchingBranches(false);
            if (userCredentials) {
              fetchBranches();
            }
          }, 1000);
        }
        return;
      }
      
      console.log('✅ Fetching branches from API with credentials...');
      
      const response = await makeAPICall('/departments');
      
      console.log('📡 Branches API response:', response);
      
      // Handle response with data array (your API structure)
      let branchesData: any[] = [];
      
      if (response && response.data && Array.isArray(response.data)) {
        console.log('✅ Found branches in response.data:', response.data.length);
        branchesData = response.data;
      } else if (response && Array.isArray(response)) {
        console.log('✅ Found branches in direct response:', response.length);
        branchesData = response;
      } else {
        console.error('❌ Unexpected response structure:', response);
        throw new Error('Invalid response structure from API');
      }
      
      if (branchesData.length === 0) {
        throw new Error('No branches data received from API');
      }
      
      // Format branches - handle your specific API structure
      const formattedBranches: Branch[] = branchesData.map((branch: any, index: number) => {
        console.log('Processing branch:', branch);
        
        return {
          id: branch.id?.toString() || index.toString(),
          name: branch.name || branch.department_name || branch.dept_name || 'Unknown Branch',
          code: branch.code || branch.dept_code || '',
        };
      });
      
      console.log('✅ Formatted branches:', formattedBranches.length);
      console.log('First formatted branch:', formattedBranches[0]);
      
      if (formattedBranches.length > 0) {
        setBranches(formattedBranches);
        await AsyncStorage.setItem('cached_branches', JSON.stringify(formattedBranches));
        console.log('✅ Branches saved to cache');
        setBranchFetchAttempts(0);
        return;
      } else {
        throw new Error('No branches formatted successfully');
      }
      
    } catch (error) {
      console.error('❌ Error fetching branches:', error);
      
      const cacheLoaded = await loadBranchesFromCache();
      
      if (!cacheLoaded && branchFetchAttempts < MAX_FETCH_ATTEMPTS) {
        console.log(`Retrying branch fetch... Attempt ${branchFetchAttempts + 1}/${MAX_FETCH_ATTEMPTS}`);
        setBranchFetchAttempts(prev => prev + 1);
        
        setTimeout(() => {
          setIsFetchingBranches(false);
          fetchBranches();
        }, RETRY_DELAY);
        return;
      }
      
      if (!cacheLoaded && branchFetchAttempts >= MAX_FETCH_ATTEMPTS) {
        Alert.alert(
          'Connection Issue',
          'Unable to load branches. Please check your internet connection and try again.',
          [
            {
              text: 'Retry',
              onPress: () => {
                setBranchFetchAttempts(0);
                setIsFetchingBranches(false);
                fetchBranches();
              }
            },
            {
              text: 'Cancel',
              style: 'cancel'
            }
          ]
        );
      }
    } finally {
      setIsFetchingBranches(false);
    }
  };

  const loadBranchesFromCache = async (): Promise<boolean> => {
    try {
      const cachedBranches = await AsyncStorage.getItem('cached_branches');
      
      if (cachedBranches) {
        const parsed = JSON.parse(cachedBranches);
        if (parsed && Array.isArray(parsed) && parsed.length > 0) {
          console.log('✅ Loaded branches from cache:', parsed.length);
          console.log('Cache branches:', parsed);
          setBranches(parsed);
          return true;
        }
      }
    } catch (cacheError) {
      console.log('⚠️ Error loading cached branches:', cacheError);
    }
    
    console.log('⚠️ No valid cache available');
    setBranches([]);
    return false;
  };

  const handleAddManualCustomer = async () => {
    if (!manualCustomerName.trim()) {
      Alert.alert('Validation Error', 'Please enter customer name.');
      return;
    }

    try {
      const manualId = `MANUAL_${Date.now()}`;
      
      const newCustomer: Customer = {
        id: manualId,
        name: manualCustomerName.trim(),
        place: manualCustomerPlace.trim(),
        isManual: true,
      };

      const manualCustomers = await loadManualCustomers();
      const updatedManualCustomers = [...manualCustomers, newCustomer];
      
      await saveManualCustomers(updatedManualCustomers);

      setCustomers(prev => [...prev, newCustomer]);

      setSelectedCustomerId(manualId);
      setSelectedCustomerPlace(manualCustomerPlace.trim());

      setIsManualCustomerMode(false);
      setManualCustomerName('');
      setManualCustomerPlace('');
      setShowCustomerDropdown(false);

      Alert.alert('Success', 'Customer added successfully!');
    } catch (error) {
      console.error('Error adding manual customer:', error);
      Alert.alert('Error', 'Failed to add customer. Please try again.');
    }
  };

  const saveManualCustomers = async (manualCustomers: Customer[]) => {
    try {
      if (!userCredentials?.userId) return;
      
      const storageKey = `manual_customers_${userCredentials.userId}`;
      await AsyncStorage.setItem(storageKey, JSON.stringify(manualCustomers));
    } catch (error) {
      console.error('Error saving manual customers:', error);
    }
  };

  const toggleManualCustomerMode = () => {
    setIsManualCustomerMode(!isManualCustomerMode);
    setManualCustomerName('');
    setManualCustomerPlace('');
    setCustomerSearchText('');
  };

  const savePaymentMethodToLocalStorage = async (collectionId: string, paymentMethod: PaymentMethod) => {
    try {
      if (!userCredentials?.userId) return;
      
      const storageKey = `collection_payment_methods_${userCredentials.userId}`;
      const storedPaymentMethods = await AsyncStorage.getItem(storageKey);
      const paymentMethods = storedPaymentMethods ? JSON.parse(storedPaymentMethods) : {};
      
      paymentMethods[collectionId] = paymentMethod;
      
      await AsyncStorage.setItem(storageKey, JSON.stringify(paymentMethods));
      console.log('✅ Saved payment method to local storage:', { collectionId, paymentMethod });
    } catch (error) {
      console.error('❌ ERROR saving payment method to local storage:', error);
    }
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Sorry, we need camera roll permissions to select images.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setScreenshot(asset.uri);
        
        if (asset.base64) {
          setScreenshotBase64(asset.base64);
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Sorry, we need camera permissions to take photos.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setScreenshot(asset.uri);
        
        if (asset.base64) {
          setScreenshotBase64(asset.base64);
        }
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  const resetForm = useCallback(() => {
    setSelectedCustomerId('');
    setSelectedCustomerPlace('');
    setSelectedBranchId('');
    setAmount('');
    setNotes('');
    setScreenshot(null);
    setScreenshotBase64(null);
    setPaymentMethod('UPI');
    setShowCustomerDropdown(false);
    setShowBranchDropdown(false);
    setCustomerSearchText('');
    setBranchSearchText('');
    setIsManualCustomerMode(false);
    setManualCustomerName('');
    setManualCustomerPlace('');
  }, []);

  const handleCustomerSelect = useCallback((customerId: string) => {
    const selectedCustomerData = customers.find(c => c.id === customerId);
    
    setSelectedCustomerId(customerId);
    setSelectedCustomerPlace(selectedCustomerData?.place || '');
    setShowCustomerDropdown(false);
    setCustomerSearchText('');
  }, [customers]);

  const handleBranchSelect = useCallback((branchId: string) => {
    setSelectedBranchId(branchId);
    setShowBranchDropdown(false);
    setBranchSearchText('');
  }, []);

  const handlePaymentMethodChange = useCallback((method: PaymentMethod) => {
    setPaymentMethod(method);
    if (method === 'cash') {
      setScreenshot(null);
      setScreenshotBase64(null);
    }
  }, []);

  const handleSubmit = async () => {
    let customerName = '';
    let customerPlace = '';

    if (isManualCustomerMode) {
      if (!manualCustomerName.trim()) {
        Alert.alert('Validation Error', 'Please enter customer name.');
        return;
      }
      customerName = manualCustomerName.trim();
      customerPlace = manualCustomerPlace.trim();
    } else {
      if (!selectedCustomerId) {
        Alert.alert('Validation Error', 'Please select a customer.');
        return;
      }
      if (!selectedCustomer) {
        Alert.alert('Error', 'Selected customer not found.');
        return;
      }
      customerName = selectedCustomer.name;
      customerPlace = selectedCustomerPlace;
    }
    
    if (!selectedBranchId) {
      Alert.alert('Validation Error', 'Please select a branch.');
      return;
    }
    
    if (!amount.trim()) {
      Alert.alert('Validation Error', 'Please enter an amount.');
      return;
    }
    
    if (paymentMethod !== 'cash' && (!screenshot || !screenshotBase64)) {
      Alert.alert('Validation Error', 'Please add a payment screenshot/photo.');
      return;
    }

    try {
      setLoading(true);
      
      if (!selectedBranch) {
        Alert.alert('Error', 'Selected branch not found.');
        return;
      }

      if (editData) {
        console.log('📝 EDIT MODE: Updating existing collection locally');
        
        if (userCredentials?.userId) {
          const storageKey = `collections_${userCredentials.userId}`;
          const storedCollections = await AsyncStorage.getItem(storageKey);
          
          if (storedCollections) {
            const collections: CollectionEntry[] = JSON.parse(storedCollections);
            const updatedCollections = collections.map(collection => {
              if (collection.id === editData.id) {
                return {
                  ...collection,
                  customerId: selectedCustomerId || 'manual',
                  customerName: customerName,
                  customerPlace: customerPlace,
                  branchId: selectedBranchId,
                  branchName: selectedBranch.name,
                  amount: amount.trim(),
                  notes: notes.trim() || 'No notes',
                  screenshot: screenshot,
                  paymentMethod: paymentMethod,
                };
              }
              return collection;
            });
            
            await AsyncStorage.setItem(storageKey, JSON.stringify(updatedCollections));
            console.log('✅ Updated existing collection in local storage:', editData.id);
          }
        }
        
        if (userCredentials?.userId) {
          const cachedApiKey = `cached_collections_${userCredentials.userId}`;
          const cachedCollections = await AsyncStorage.getItem(cachedApiKey);
          
          if (cachedCollections) {
            const apiCollections: CollectionEntry[] = JSON.parse(cachedCollections);
            const updatedApiCollections = apiCollections.map(collection => {
              if (collection.id === editData.id) {
                return {
                  ...collection,
                  customerId: selectedCustomerId || 'manual',
                  customerName: customerName,
                  customerPlace: customerPlace,
                  branchId: selectedBranchId,
                  branchName: selectedBranch.name,
                  amount: amount.trim(),
                  notes: notes.trim() || 'No notes',
                  screenshot: screenshot,
                  paymentMethod: paymentMethod,
                };
              }
              return collection;
            });
            
            await AsyncStorage.setItem(cachedApiKey, JSON.stringify(updatedApiCollections));
            console.log('✅ Updated existing collection in API cache:', editData.id);
          }
        }
        
        await savePaymentMethodToLocalStorage(editData.id, paymentMethod);
        
        resetForm();
        setShowSuccessCard(true);
        
        setTimeout(() => {
          setShowSuccessCard(false);
          navigation.goBack();
        }, 2000);
        
        return;
      }

      console.log('➕ ADD MODE: Adding new collection via API');
      
      const formData = new FormData();

      if (userCredentials?.userId) {
        formData.append('user_id', userCredentials.userId);
        formData.append('created_by', userCredentials.userId);
      }
            
      formData.append('client_name', customerName);
      formData.append('client_place', customerPlace);
      formData.append('department', selectedBranch.name);
      formData.append('amount', amount.trim());
      formData.append('payment_method', paymentMethod);
      
      const notesToSend = notes.trim() || 'Payment received';
      formData.append('notes', notesToSend);
      formData.append('paid_for', notesToSend);
      
      formData.append('customer_id', selectedCustomerId || 'manual');
      formData.append('branch_id', selectedBranchId);
      
      if (paymentMethod !== 'cash' && screenshot && screenshotBase64) {
        const imageUri = screenshot;
        const filename = imageUri.split('/').pop() || `screenshot_${Date.now()}.jpg`;
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : 'image/jpeg';
        
        const imageFile = {
          uri: Platform.OS === 'android' ? imageUri : imageUri.replace('file://', ''),
          name: filename,
          type: type,
        };
        
        formData.append('payment_screenshot', imageFile as any);
      }

      const response = await makeAPICall('/collections/add/', 'POST', formData, true);
      const collectionId = response?.data?.id?.toString() || response?.id?.toString() || `temp_${Date.now()}`;
      
      console.log('📦 Submission response:', response);
      
      if (response && (response.success !== false)) {
        console.log('💾 Saving payment method for collection:', { collectionId, paymentMethod });
        await savePaymentMethodToLocalStorage(collectionId, paymentMethod);
        
        if (userCredentials?.userId) {
          const storageKey = `collections_${userCredentials.userId}`;
          const storedCollections = await AsyncStorage.getItem(storageKey);
          const collections: CollectionEntry[] = storedCollections ? JSON.parse(storedCollections) : [];
          
          const newCollection: CollectionEntry = {
            id: collectionId,
            customerId: selectedCustomerId || 'manual',
            customerName: customerName,
            customerPlace: customerPlace,
            branchId: selectedBranchId,
            branchName: selectedBranch.name,
            amount: amount.trim(),
            notes: notesToSend || 'No notes',
            screenshot: screenshot,
            createdAt: new Date().toISOString(),
            paymentMethod: paymentMethod,
          };
          
          collections.push(newCollection);
          await AsyncStorage.setItem(storageKey, JSON.stringify(collections));
          console.log('✅ Added new collection to local storage');
        }
        
        resetForm();
        setShowSuccessCard(true);
        
        setTimeout(() => {
          setShowSuccessCard(false);
          navigation.goBack();
        }, 2000);
        
      } else {
        throw new Error(response?.error || response?.message || 'Failed to process collection');
      }
      
    } catch (error: any) {
      console.error('❌ Error submitting form:', error);
      
      let errorMessage = editData 
        ? 'Failed to update collection entry. Please try again.'
        : 'Failed to add collection entry. Please try again.';
      
      if (error.message.includes('404')) {
        errorMessage = 'API endpoint not found. Please contact your administrator.';
      } else if (error.message.includes('401') || error.message.includes('403')) {
        errorMessage = 'Authentication failed. Please login again.';
      } else if (error.message.includes('network') || error.message.includes('timeout')) {
        errorMessage = 'Network error. Please check your internet connection.';
      } else if (error.message.includes('Invalid JSON')) {
        errorMessage = 'Server returned invalid response. Please try again or contact support.';
      }
      
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      console.log('🔄 Initializing AddCollection screen...');
      
      try {
        const credentials = await initializeUser();
        
        if (credentials) {
          console.log('✅ User credentials loaded, waiting for state update...');
          
          await new Promise(resolve => setTimeout(resolve, 500));
          
          console.log('📡 Starting data fetch...');
          
          await fetchCustomers();
          await fetchBranches();
          
          console.log('✅ Data fetch complete');
          console.log('Branches state:', branches.length);
        } else {
          console.log('❌ No user credentials found');
        }
      } catch (error) {
        console.error('❌ Error during initialization:', error);
        await loadCustomersFromCache();
        await loadBranchesFromCache();
      } finally {
        setIsInitializing(false);
        console.log('✅ Initialization complete');
      }
    };
    
    init();
  }, []);

  useEffect(() => {
    if (userCredentials && 
        branches.length === 0 && 
        !isInitializing && 
        !isFetchingBranches &&
        branchFetchAttempts < MAX_FETCH_ATTEMPTS) {
      
      console.log('🔄 Branches empty after init, scheduling retry...');
      console.log('User credentials available:', !!userCredentials);
      
      const retryTimer = setTimeout(() => {
        console.log('Retrying branch fetch (auto-retry)...');
        fetchBranches();
      }, 2000);
      
      return () => clearTimeout(retryTimer);
    }
  }, [userCredentials, branches.length, isInitializing, isFetchingBranches, branchFetchAttempts]);

  const renderCustomerItem = useCallback(({ item }: { item: Customer }) => (
    <TouchableOpacity
      style={styles.dropdownItem}
      onPress={() => handleCustomerSelect(item.id)}
      activeOpacity={0.7}
    >
      <View style={styles.customerItemContainer}>
        <View style={styles.customerNameRow}>
          <Text style={styles.customerNameText} numberOfLines={1}>
            {item.name}
          </Text>
          {item.isManual && (
            <View style={styles.manualBadge}>
              <Text style={styles.manualBadgeText}>Manual</Text>
            </View>
          )}
        </View>
        {item.place && (
          <Text style={styles.customerPlaceText} numberOfLines={1}>
            {item.place}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  ), [handleCustomerSelect]);

  const renderBranchItem = useCallback(({ item }: { item: Branch }) => (
    <TouchableOpacity
      style={styles.dropdownItem}
      onPress={() => handleBranchSelect(item.id)}
      activeOpacity={0.7}
    >
      <Text style={styles.dropdownItemText} numberOfLines={2}>
        {item.name} {item.code ? `(${item.code})` : ''}
      </Text>
    </TouchableOpacity>
  ), [handleBranchSelect]);

  const customerKeyExtractor = useCallback((item: Customer) => item.id, []);
  const branchKeyExtractor = useCallback((item: Branch) => item.id, []);

  if (isInitializing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ffffff" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.fullPageModal}>
      <View style={styles.fullPageHeader}>
        <TouchableOpacity
          onPress={() => {
            resetForm();
            navigation.goBack();
          }}
          style={styles.modalCloseButton}
        >
          <Ionicons name="arrow-back" size={24} color="#1C1B17" />
        </TouchableOpacity>
        <Text style={styles.fullPageTitle}>
          {editData ? 'Edit Collection' : 'Add Collection'}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView 
        style={styles.fullPageContent}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <FlatList
          data={[
            {
              id: 'customer',
              type: 'dropdown',
              label: 'Customer *',
              placeholder: 'Select Customer',
              value: isManualCustomerMode 
                ? (manualCustomerName || '')
                : (selectedCustomer ? `${selectedCustomer.name}` : ''),
              onPress: () => setShowCustomerDropdown(true),
            },
            {
              id: 'place',
              type: 'input',
              label: 'Place',
              placeholder: 'Customer place',
              value: isManualCustomerMode ? manualCustomerPlace : selectedCustomerPlace,
              onChangeText: isManualCustomerMode ? setManualCustomerPlace : setSelectedCustomerPlace,
              editable: true,
            },
            {
              id: 'branch',
              type: 'dropdown',
              label: 'Branch *',
              placeholder: 'Select Branch',
              value: selectedBranch ? `${selectedBranch.name}` : '',
              onPress: () => setShowBranchDropdown(true),
            },
            {
              id: 'paymentMethod',
              type: 'paymentMethod',
              label: 'Payment Method *',
            },
            {
              id: 'amount',
              type: 'input',
              label: 'Amount *',
              placeholder: 'Enter amount',
              value: amount,
              onChangeText: setAmount,
              keyboardType: 'numeric',
            },
            {
              id: 'notes',
              type: 'textarea',
              label: 'Notes',
              placeholder: 'Enter notes (optional)',
              value: notes,
              onChangeText: setNotes,
            },
          ].concat(
            paymentMethod === 'UPI' ? [{
              id: 'screenshot',
              type: 'image',
              label: 'UPI Screenshot *',
              value: screenshot,
              onPress: pickImage,
            }] : 
            paymentMethod === 'cheque' ? [{
              id: 'chequePhoto',
              type: 'camera',
              label: 'Cheque Photo *',
              value: screenshot,
              onPress: takePhoto,
            }] : 
            paymentMethod === 'neft' ? [{
              id: 'neftScreenshot',
              type: 'image',
              label: 'NEFT Screenshot *',
              value: screenshot,
              onPress: pickImage,
            }] : []
          )}
          keyExtractor={(item) => item.id}
          style={styles.formList}
          contentContainerStyle={styles.formContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            switch (item.type) {
              case 'dropdown':
                return (
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>{item.label}</Text>
                    <TouchableOpacity
                      style={styles.dropdownButton}
                      onPress={item.onPress}
                    >
                      <Text style={[styles.dropdownButtonText, !item.value && styles.placeholderText]}>
                        {item.value || item.placeholder}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color="#666" />
                    </TouchableOpacity>
                  </View>
                );
              case 'paymentMethod':
                return (
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>{item.label}</Text>
                    <View style={styles.paymentMethodContainer}>
                      {PAYMENT_METHODS.map((method) => (
                        <TouchableOpacity
                          key={method.id}
                          style={[
                            styles.paymentMethodButton,
                            paymentMethod === method.id && styles.paymentMethodButtonActive
                          ]}
                          onPress={() => handlePaymentMethodChange(method.id as PaymentMethod)}
                          activeOpacity={0.7}
                        >
                          <Ionicons 
                            name={method.icon as any} 
                            size={24} 
                            color={paymentMethod === method.id ? '#4CAF50' : '#666'} 
                          />
                          <Text style={[
                            styles.paymentMethodText,
                            paymentMethod === method.id && styles.paymentMethodTextActive
                          ]}>
                            {method.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                );
              case 'input':
                return (
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>{item.label}</Text>
                    <TextInput
                      style={[
                        item.id === 'amount' ? styles.amountInput : styles.textInput,
                         item.id === 'place' && styles.placeInput
                    ]}
                      placeholder={item.placeholder}
                      value={item.value}
                      onChangeText={item.onChangeText}
                      keyboardType={item.keyboardType}
                      placeholderTextColor="#999"
                      editable={item.editable !== false}
                    />
                  </View>
                );
              case 'textarea':
                return (
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>{item.label}</Text>
                    <TextInput
                      style={[styles.textInput, styles.notesInput]}
                      placeholder={item.placeholder}
                      value={item.value}
                      onChangeText={item.onChangeText}
                      multiline
                      numberOfLines={3}
                      placeholderTextColor="#999"
                      textAlignVertical="top"
                    />
                  </View>
                );
              case 'image':
                return (
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>{item.label}</Text>
                    <TouchableOpacity style={styles.imageButton} onPress={item.onPress}>
                      {item.value ? (
                        <Image source={{ uri: item.value }} style={styles.previewImage} />
                      ) : (
                        <View style={styles.imageButtonContent}>
                          <Ionicons name="images-outline" size={32} color="#254892ff" />
                          <Text style={styles.imageButtonText}>
                            {paymentMethod === 'neft'
                              ? 'Select NEFT Screenshot from Gallery'
                              : 'Select Screenshot from Gallery'
                            }
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              case 'camera':
                return (
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>{item.label}</Text>
                    <TouchableOpacity style={styles.imageButton} onPress={item.onPress}>
                      {item.value ? (
                        <Image source={{ uri: item.value }} style={styles.previewImage} />
                      ) : (
                        <View style={styles.imageButtonContent}>
                          <Ionicons name="camera-outline" size={32} color="#666" />
                          <Text style={styles.imageButtonText}>
                            Take Photo of Cheque
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              default:
                return null;
            }
          }}
          ListFooterComponent={() => (
            <View style={styles.submitButtonContainer}>
              <TouchableOpacity
                style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {editData ? 'Update Collection' : 'Add Collection'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        />
      </KeyboardAvoidingView>

      <Modal
        visible={showCustomerDropdown}
        animationType="slide"
        presentationStyle="fullScreen"
      >
        <SafeAreaView style={styles.fullScreenDropdownModal}>
          <View style={styles.fullScreenDropdownHeader}>
            <TouchableOpacity 
              onPress={() => {
                setShowCustomerDropdown(false);
                setIsManualCustomerMode(false);
                setManualCustomerName('');
                setManualCustomerPlace('');
              }}
              style={styles.fullScreenBackButton}
            >
              <Ionicons name="arrow-back" size={24} color="#c63030ff" />
            </TouchableOpacity>
            <Text style={styles.fullScreenDropdownTitle}>
              {isManualCustomerMode ? 'Add New Customer' : 'Select Customer'}
            </Text>
            <TouchableOpacity
              onPress={toggleManualCustomerMode}
              style={styles.fullScreenBackButton}
            >
              <Ionicons 
                name={isManualCustomerMode ? "list" : "person-add"} 
                size={24} 
                color="#4CAF50" 
              />
            </TouchableOpacity>
          </View>

          {isManualCustomerMode ? (
            <View style={styles.manualCustomerForm}>
              <View style={styles.manualInputGroup}>
                <Text style={styles.manualInputLabel}>Customer Name *</Text>
                <TextInput
                  style={styles.manualTextInput}
                  placeholder="Enter customer name"
                  value={manualCustomerName}
                  onChangeText={setManualCustomerName}
                  placeholderTextColor="#999"
                  autoFocus
                />
              </View>

              <View style={styles.manualInputGroup}>
                <Text style={styles.manualInputLabel}>Place</Text>
                <TextInput
                  style={styles.manualTextInput}
                  placeholder="Enter place (optional)"
                  value={manualCustomerPlace}
                  onChangeText={setManualCustomerPlace}
                  placeholderTextColor="#999"
                />
              </View>

              <TouchableOpacity
                style={styles.manualAddButton}
                onPress={handleAddManualCustomer}
              >
                <Ionicons name="add-circle" size={24} color="#ffffff" />
                <Text style={styles.manualAddButtonText}>Add Customer</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.fullScreenSearchContainer}>
                <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
                <TextInput
                  style={styles.fullScreenSearchInput}
                  placeholder="Search customers..."
                  value={customerSearchText}
                  onChangeText={setCustomerSearchText}
                  placeholderTextColor="#999"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                />
              </View>

              <FlatList
                data={filteredCustomers}
                renderItem={renderCustomerItem}
                keyExtractor={customerKeyExtractor}
                style={styles.fullScreenDropdownList}
                contentContainerStyle={styles.fullScreenDropdownContent}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
                removeClippedSubviews={true}
                maxToRenderPerBatch={10}
                windowSize={5}
                initialNumToRender={8}
                ListEmptyComponent={
                  <View style={styles.emptySearchContainer}>
                    <Ionicons name="search-outline" size={48} color="#ccc" />
                    <Text style={styles.emptySearchText}>No customers found</Text>
                  </View>
                }
              />
            </>
          )}
        </SafeAreaView>
      </Modal>

      <Modal
        visible={showBranchDropdown}
        animationType="slide"
        presentationStyle="fullScreen"
      >
        <SafeAreaView style={styles.fullScreenDropdownModal}>
          <View style={styles.fullScreenDropdownHeader}>
            <TouchableOpacity 
              onPress={() => setShowBranchDropdown(false)}
              style={styles.fullScreenBackButton}
            >
              <Ionicons name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.fullScreenDropdownTitle}>Select Branch</Text>
            <View style={styles.fullScreenBackButton} />
          </View>

          <View style={styles.fullScreenSearchContainer}>
            <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
            <TextInput
              style={styles.fullScreenSearchInput}
              placeholder="Search branches..."
              value={branchSearchText}
              onChangeText={setBranchSearchText}
              placeholderTextColor="#999"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
          </View>

          {isFetchingBranches && branches.length === 0 ? (
            <View style={styles.emptySearchContainer}>
              <ActivityIndicator size="large" color="#4CAF50" />
              <Text style={styles.emptySearchText}>Loading branches...</Text>
            </View>
          ) : (
            <FlatList
              data={filteredBranches}
              renderItem={renderBranchItem}
              keyExtractor={branchKeyExtractor}
              style={styles.fullScreenDropdownList}
              contentContainerStyle={styles.fullScreenDropdownContent}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
              removeClippedSubviews={true}
              maxToRenderPerBatch={10}
              windowSize={5}
              initialNumToRender={8}
              ListEmptyComponent={
                <View style={styles.emptySearchContainer}>
                  <Ionicons name="search-outline" size={48} color="#ccc" />
                  <Text style={styles.emptySearchText}>
                    {branches.length === 0 ? 'No branches available. Please check your connection.' : 'No branches found'}
                  </Text>
                  {branches.length === 0 && branchFetchAttempts > 0 && (
                    <Text style={styles.retryText}>
                      Retrying... ({branchFetchAttempts}/{MAX_FETCH_ATTEMPTS})
                    </Text>
                  )}
                </View>
              }
            />
          )}
        </SafeAreaView>
      </Modal>

      {showSuccessCard && (
        <View style={styles.successCard}>
          <View style={styles.successCardContent}>
            <Ionicons name="checkmark-circle" size={24} color="#f1f5f1ff" />
            <Text style={styles.successCardText}>
              Collection {editData ? 'updated' : 'added'} successfully!
            </Text>
            <TouchableOpacity 
              onPress={() => setShowSuccessCard(false)}
              style={styles.successCardClose}
            >
              <Ionicons name="close" size={20} color="#f9f6f6ff" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {loading && (
        <View style={styles.centeredLoader}>
          <View style={styles.loaderBackground}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.loaderText}>Processing...</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fullPageModal: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  fullPageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: 'rgba(250, 249, 246, 0.8)',
  },
  modalCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEF8E7',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  fullPageTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1B17',
  },
  fullPageContent: {
    flex: 1,
  },
  formList: {
    flex: 1,
  },
  formContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 100,
  },
  inputGroup: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7E7767',
    marginBottom: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  paymentMethodContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  paymentMethodButton: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  paymentMethodButtonActive: {
    borderColor: '#D4A574',
    borderWidth: 2,
    backgroundColor: '#FEF8E7',
    shadowColor: '#D4A574',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  paymentMethodText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7E7767',
  },
  paymentMethodTextActive: {
    color: '#1C1B17',
    fontWeight: '700',
  },
  dropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  dropdownButtonText: {
    fontSize: 15,
    color: '#1C1B17',
    fontWeight: '600',
    flex: 1,
  },
  placeholderText: {
    color: '#7E7767',
    fontWeight: '500',
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 15,
    color: '#1C1B17',
    fontWeight: '600',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  notesInput: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  placeInput: {
    backgroundColor: '#FFFFFF',
  },
  customerItemContainer: {
    flex: 1,
  },
  customerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  customerNameText: {
    fontSize: 16,
    color: '#1C1B17',
    fontWeight: '700',
    flex: 1,
  },
  manualBadge: {
    backgroundColor: '#D4A574',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  manualBadgeText: {
    color: '#1C1B17',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  customerPlaceText: {
    fontSize: 13,
    color: '#7E7767',
    marginTop: 4,
    fontWeight: '500',
  },
  amountInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 18,
    color: '#1C1B17',
    fontWeight: '700',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  imageButton: {
    borderWidth: 2,
    borderColor: '#D4A574',
    borderStyle: 'dashed',
    borderRadius: 16,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FEF8E7',
  },
  imageButtonContent: {
    alignItems: 'center',
    gap: 12,
  },
  imageButtonText: {
    fontSize: 14,
    color: '#7E7767',
    textAlign: 'center',
    fontWeight: '600',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
  },
  submitButtonContainer: {
    marginTop: 32,
    marginBottom: 20,
  },
  submitButton: {
    backgroundColor: '#1C1B17',
    borderRadius: 50,
    paddingVertical: 20,
    alignItems: 'center',
    shadowColor: '#1C1B17',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#F5C451',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  manualCustomerForm: {
    padding: 20,
  },
  manualInputGroup: {
    marginBottom: 20,
  },
  manualInputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7E7767',
    marginBottom: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  manualTextInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 15,
    color: '#1C1B17',
    fontWeight: '600',
  },
  manualAddButton: {
    flexDirection: 'row',
    backgroundColor: '#D4A574',
    borderRadius: 50,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 20,
    shadowColor: '#D4A574',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  manualAddButtonText: {
    color: '#1C1B17',
    fontSize: 16,
    fontWeight: '800',
  },
  fullScreenDropdownModal: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  fullScreenDropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 0,
    backgroundColor: 'rgba(250, 249, 246, 0.8)',
  },
  fullScreenBackButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEF8E7',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  fullScreenDropdownTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1B17',
  },
  fullScreenSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
    marginVertical: 20,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 50,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  searchIcon: {
    marginRight: 12,
  },
  fullScreenSearchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1C1B17',
    fontWeight: '600',
    padding: 0,
  },
  fullScreenDropdownList: {
    flex: 1,
  },
  fullScreenDropdownContent: {
    paddingBottom: 20,
  },
  emptySearchContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptySearchText: {
    fontSize: 16,
    color: '#7E7767',
    marginTop: 12,
    textAlign: 'center',
    paddingHorizontal: 20,
    fontWeight: '600',
  },
  retryText: {
    fontSize: 14,
    color: '#D4A574',
    marginTop: 8,
    textAlign: 'center',
    fontWeight: '700',
  },
  dropdownItem: {
    paddingHorizontal: 24,
    paddingVertical: 18,
    marginHorizontal: 24,
    marginBottom: 8,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  dropdownItemText: {
    fontSize: 16,
    color: '#1C1B17',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    backgroundColor: '#FAF9F6',
  },
  loadingText: {
    color: '#1C1B17',
    marginTop: 10,
    fontSize: 16,
    fontWeight: '700',
  },
  centeredLoader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    zIndex: 9999,
  },
  loaderBackground: {
    backgroundColor: '#FFFFFF',
    padding: 32,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 160,
    minHeight: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  loaderText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1B17',
  },
  successCard: {
    position: 'absolute',
    top: '50%',
    left: 24,
    right: 24,
    backgroundColor: '#1C1B17',
    borderRadius: 24,
    padding: 24,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    zIndex: 9999,
    transform: [{ translateY: -50 }],
  },
  successCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  successCardText: {
    flex: 1,
    marginLeft: 16,
    fontSize: 16,
    fontWeight: '700',
    color: '#F5C451',
  },
  successCardClose: {
    padding: 4,
  },
});