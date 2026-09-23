import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUserScope, isAllowed } from './authScope';
import {
  branchApi,
  businessNatureApi,
  corporateApi,
  countryApi,
  districtApi,
  Feeder,
  feederApi,
  MasterItem,
  moduleApi,
  softwareApi,
  stateApi,
} from './feederApi';

type ModalType =
  | 'district'
  | 'state'
  | 'country'
  | 'software'
  | 'businessNature'
  | 'branch'
  | 'corporate'
  | 'modules'
  | null;

const todayStr = () => new Date().toISOString().split('T')[0]; // YYYY-MM-DD

const EMPTY_FORM: Feeder = {
  name: '',
  address: '',
  location: '',
  area: '',
  district: '',
  state: '',
  contactPerson: '',
  phone: '',
  email: '',
  reputedName: '',
  reputedPhone: '',
  software: '',
  businessNature: '',
  branch: '',
  corporate: '',
  noOfSystem: '',
  pinCode: '',
  country: '',
  installDate: todayStr(),
  remark: '',
  softwareAmount: '',
  totalCost: '',
  modules: [],
};

export default function AddFeederScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();

  const editingFeeder: Feeder | undefined = route.params?.feeder;
  const isEdit = Boolean(editingFeeder?.id);

  const [formData, setFormData] = useState<Feeder>({
    ...EMPTY_FORM,
    ...editingFeeder,
    modules: editingFeeder?.modules || [],
    installDate: editingFeeder?.installDate || todayStr(),
  });

  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Master dropdown data ──────────────────────────────────────────────────
  const [masters, setMasters] = useState<{
    districts: MasterItem[];
    states: MasterItem[];
    countries: MasterItem[];
    softwares: MasterItem[];
    businessNatures: MasterItem[];
    branches: MasterItem[];
    corporates: MasterItem[];
    modules: MasterItem[];
  }>({
    districts: [],
    states: [],
    countries: [],
    softwares: [],
    businessNatures: [],
    branches: [],
    corporates: [],
    modules: [],
  });
  const [mastersLoading, setMastersLoading] = useState(true);

 useEffect(() => {
    const safe = (p: Promise<MasterItem[]>) => p.catch(() => []);
    Promise.all([
      safe(districtApi.list()),
      safe(stateApi.list()),
      safe(countryApi.list()),
      safe(softwareApi.list()),
      safe(businessNatureApi.list()),
      safe(branchApi.list()),
      safe(corporateApi.list()),
      safe(moduleApi.list()),
      getUserScope(),
    ])
      .then(([districts, states, countries, softwares, businessNatures, branches, corporates, modules, scope]) => {
        const scopedBranches = scope.isAdmin
          ? branches
          : branches.filter((b) => isAllowed(b.name, scope.branches));

        setMasters({ districts, states, countries, softwares, businessNatures, branches: scopedBranches, corporates, modules });

        if (!scope.isAdmin && scope.branches.length === 1 && !editingFeeder?.branch) {
          setFormData((f) => ({ ...f, branch: scope.branches[0] }));
        }
      })
      .finally(() => setMastersLoading(false));
  }, []);

  // ── Modal (dropdown / multi-select) state ─────────────────────────────────
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<ModalType>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(
    formData.installDate ? new Date(formData.installDate) : new Date()
  );

  const masterFor = (type: ModalType): MasterItem[] => {
    switch (type) {
      case 'district': return masters.districts;
      case 'state': return masters.states;
      case 'country': return masters.countries;
      case 'software': return masters.softwares;
      case 'businessNature': return masters.businessNatures;
      case 'branch': return masters.branches;
      case 'corporate': return masters.corporates;
      case 'modules': return masters.modules;
      default: return [];
    }
  };

  const openModal = (type: ModalType) => {
    setModalType(type);
    setSearchQuery('');
    setModalVisible(true);
  };

  const set = (key: keyof Feeder, value: any) => {
    setFormData((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  };

  const selectItem = (item: MasterItem) => {
    if (modalType === 'modules') {
      const current = formData.modules || [];
      const next = current.includes(item.name)
        ? current.filter((m) => m !== item.name)
        : [...current, item.name];
      set('modules', next);
      return; // keep modal open for multi-select
    }
    if (modalType) set(modalType as keyof Feeder, item.name);
    setModalVisible(false);
  };

  const removeModule = (name: string) => {
    set('modules', (formData.modules || []).filter((m) => m !== name));
  };

  const getFilteredData = () => {
    const q = searchQuery.toLowerCase();
    return masterFor(modalType).filter((item) => item.name.toLowerCase().includes(q));
  };

  const modalTitle = (): string => {
    switch (modalType) {
      case 'district': return 'District';
      case 'state': return 'State';
      case 'country': return 'Country';
      case 'software': return 'Software';
      case 'businessNature': return 'Business Nature';
      case 'branch': return 'Branch';
      case 'corporate': return 'Corporate';
      case 'modules': return 'Modules';
      default: return '';
    }
  };

  // ── Date picker handling ────────────────────────────────────────────────────
  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      // Android shows its own native dialog; close on any interaction.
      setShowDatePicker(false);
      if (event.type === 'set' && selectedDate) {
        set('installDate', selectedDate.toISOString().split('T')[0]);
      }
      return;
    }
    // iOS: spinner lives inside our bottom-sheet Modal, just track the value
    // until the user taps "Done".
    if (selectedDate) setTempDate(selectedDate);
  };

  const openDatePicker = () => {
    setTempDate(formData.installDate ? new Date(formData.installDate) : new Date());
    setShowDatePicker(true);
  };

  const confirmIosDate = () => {
    set('installDate', tempDate.toISOString().split('T')[0]);
    setShowDatePicker(false);
  };

  // ── Validation ─────────────────────────────────────────────────────────────
  const validate = () => {
    const e: Record<string, string> = {};
    if (!formData.name?.trim()) e.name = 'Name is required';
    if (formData.email && !/^\S+@\S+\.\S+$/.test(formData.email)) e.email = 'Enter a valid email';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Save ───────────────────────────────────────────────────────────────────
 const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload: Feeder = {
        ...formData,
        noOfSystem: formData.noOfSystem ? Number(formData.noOfSystem) : undefined,
      };

      if (isEdit && editingFeeder?.id) {
        await feederApi.update(editingFeeder.id, payload);
        Alert.alert('Success', 'Feeder updated successfully');
      } else {
        const [userId, username] = await Promise.all([
          SecureStore.getItemAsync('userId'),
          SecureStore.getItemAsync('username'),
        ]);
        payload.createdBy = username || userId || '';

        await feederApi.create(payload);
        Alert.alert('Success', 'Feeder saved successfully');
      }
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Save failed', err?.message || 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Field renderer ────────────────────────────────────────────────────────
  const renderInput = (
    key: keyof Feeder,
    label: string,
    opts: {
      placeholder?: string;
      keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'email-address';
      multiline?: boolean;
      autoCapitalize?: 'none' | 'sentences';
    } = {}
  ) => (
    <View style={styles.formGroupFloating}>
      <TextInput
        style={[
          styles.input,
          opts.multiline && styles.textArea,
          focusedField === key && styles.inputFocused,
          errors[key] && styles.inputError,
        ]}
        value={String(formData[key] ?? '')}
        onChangeText={(text) => set(key, text)}
        placeholder={opts.placeholder}
        placeholderTextColor="#6E6E6E"
        keyboardType={opts.keyboardType || 'default'}
        autoCapitalize={opts.autoCapitalize}
        multiline={opts.multiline}
        numberOfLines={opts.multiline ? 3 : 1}
        onFocus={() => setFocusedField(key)}
        onBlur={() => setFocusedField(null)}
      />
      <Text style={[styles.floatingLabel, focusedField === key && styles.floatingLabelFocused]}>
        {label}
      </Text>
      {!!errors[key] && <Text style={styles.errorText}>{errors[key]}</Text>}
    </View>
  );

  const renderDropdown = (key: keyof Feeder, label: string, type: ModalType) => (
    <View style={styles.formGroupFloating}>
      <TouchableOpacity style={styles.dropdown} onPress={() => openModal(type)}>
        <Text style={styles.dropdownText}>
          {(formData[key] as string) || `Select ${label.toLowerCase()}`}
        </Text>
        <Ionicons name="chevron-down" size={20} color="#6E6E6E" />
      </TouchableOpacity>
      <Text style={styles.floatingLabel}>{label}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#1C1B17" />
          </Pressable>
          <Text style={styles.headerTitle}>{isEdit ? 'Edit Feeder' : 'Add Feeder'}</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.breadcrumb}>Home / Feeder / {isEdit ? 'Edit' : 'Add'}</Text>

          {isEdit && formData.uniqueCode ? (
            <View style={styles.keyBadge}>
              <Text style={styles.keyBadgeLabel}>KEY</Text>
              <Text style={styles.keyBadgeValue}>{formData.uniqueCode}</Text>
            </View>
          ) : null}

          {/* Section 1: Primary Details */}
          <LinearGradient colors={['#FFFFFF', '#F6F1E8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
            <Text style={styles.sectionTitle}>Primary Details</Text>

            {renderInput('name', 'Name', { placeholder: 'Enter name' })}
            {renderInput('address', 'Address / Landmark', { placeholder: 'Enter address', multiline: true })}
            {renderInput('location', 'Location', { placeholder: 'Enter location' })}
            {renderInput('area', 'Area', { placeholder: 'Enter area' })}
            {renderInput('pinCode', 'Pin Code', { placeholder: 'Enter pin code', keyboardType: 'numeric' })}

            {renderDropdown('district', 'District', 'district')}
            {renderDropdown('state', 'State', 'state')}
            {renderDropdown('country', 'Country', 'country')}

            {renderInput('contactPerson', 'Contact Person', { placeholder: 'Enter contact person' })}
            {renderInput('phone', 'Phone Number', { placeholder: 'Enter phone number', keyboardType: 'phone-pad' })}
            {renderInput('reputedName', 'Reputed Person Name', { placeholder: 'Enter reputed person name' })}
            {renderInput('reputedPhone', 'Reputed Person Phone', { placeholder: 'Enter reputed person phone', keyboardType: 'phone-pad' })}
            {renderInput('email', 'Email', { placeholder: 'Enter email', keyboardType: 'email-address', autoCapitalize: 'none' })}
          </LinearGradient>

          {/* Section 2: Client Details */}
          <LinearGradient colors={['#FFFFFF', '#F6F1E8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
            <Text style={styles.sectionTitle}>Client Details</Text>

            {renderDropdown('software', 'Software', 'software')}
            {renderDropdown('businessNature', 'Business Nature', 'businessNature')}
            {renderDropdown('branch', 'Branch', 'branch')}
            {renderDropdown('corporate', 'Corporate', 'corporate')}

            {/* Modules multi-select */}
            <View style={styles.formGroupFloating}>
              <TouchableOpacity style={styles.dropdown} onPress={() => openModal('modules')}>
                <Text style={styles.dropdownText}>
                  {(formData.modules || []).length > 0
                    ? `${formData.modules!.length} module${formData.modules!.length > 1 ? 's' : ''} selected`
                    : 'Select modules'}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#6E6E6E" />
              </TouchableOpacity>
              <Text style={styles.floatingLabel}>Modules</Text>
              {(formData.modules || []).length > 0 && (
                <View style={styles.chipsWrap}>
                  {formData.modules!.map((m) => (
                    <View key={m} style={styles.chip}>
                      <Text style={styles.chipText}>{m}</Text>
                      <Pressable onPress={() => removeModule(m)} hitSlop={6}>
                        <Ionicons name="close" size={13} color="#8A6D3B" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {renderInput('noOfSystem', 'No. of System', { placeholder: 'Enter number of systems', keyboardType: 'numeric' })}

            <View style={styles.formGroupFloating}>
              <TouchableOpacity style={styles.dropdown} onPress={openDatePicker}>
                <Text style={styles.dropdownText}>{formData.installDate || 'Select date'}</Text>
                <Ionicons name="calendar-outline" size={20} color="#6E6E6E" />
              </TouchableOpacity>
              <Text style={styles.floatingLabel}>Installation Date</Text>
            </View>

            {renderInput('softwareAmount', 'Software Amount', { placeholder: 'Enter software amount', keyboardType: 'numeric' })}
            {renderInput('totalCost', 'Total Cost', { placeholder: 'Enter total cost', keyboardType: 'numeric' })}
            {renderInput('remark', 'Remark', { placeholder: 'Enter remark', multiline: true })}
          </LinearGradient>
        </ScrollView>

        {/* Bottom Action Bar */}
        <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()} disabled={saving}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveButton} disabled={saving} onPress={handleSave}>
            <Text style={styles.saveButtonText}>
              {saving ? 'Saving...' : isEdit ? 'Update' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Dropdown / Multi-select Modal */}
        <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select {modalTitle()}</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#1C1C1C" />
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.searchInput}
                placeholder="Search..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor="#6E6E6E"
              />
              <FlatList
                data={getFilteredData()}
                keyExtractor={(item) => String(item.id)}
                renderItem={({ item }) => {
                  const isSelected =
                    modalType === 'modules'
                      ? (formData.modules || []).includes(item.name)
                      : formData[modalType as keyof Feeder] === item.name;
                  return (
                    <TouchableOpacity style={styles.modalItem} onPress={() => selectItem(item)}>
                      <Text style={styles.modalItemText}>{item.name}</Text>
                      {isSelected && <Ionicons name="checkmark" size={18} color="#D4A574" />}
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <Text style={styles.loadingText}>
                    {mastersLoading ? 'Loading...' : 'No results found'}
                  </Text>
                }
              />
              {modalType === 'modules' && (
                <TouchableOpacity style={styles.doneButton} onPress={() => setModalVisible(false)}>
                  <Text style={styles.doneButtonText}>Done</Text>
                </TouchableOpacity>
          )}
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Date Picker — Android: native dialog, no wrapper needed */}
        {showDatePicker && Platform.OS === 'android' && (
          <DateTimePicker
            value={formData.installDate ? new Date(formData.installDate) : new Date()}
            mode="date"
            display="default"
            onChange={handleDateChange}
          />
        )}

        {/* Date Picker — iOS: proper bottom-sheet modal with Cancel/Done */}
        {Platform.OS === 'ios' && (
          <Modal
            visible={showDatePicker}
            transparent
            animationType="slide"
            onRequestClose={() => setShowDatePicker(false)}
          >
            <Pressable style={styles.datePickerOverlay} onPress={() => setShowDatePicker(false)}>
              <Pressable style={styles.datePickerContainer} onPress={(e) => e.stopPropagation()}>
                <View style={styles.datePickerHeader}>
                  <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                    <Text style={styles.datePickerCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={styles.datePickerTitle}>Installation Date</Text>
                  <TouchableOpacity onPress={confirmIosDate}>
                    <Text style={styles.datePickerDone}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={tempDate}
                  mode="date"
                  display="spinner"
                  onChange={handleDateChange}
                  style={styles.datePickerSpinner}
                  textColor="#1C1B17"
                />
              </Pressable>
            </Pressable>
          </Modal>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF9F6' },
  keyboardView: { flex: 1 },
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
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#FEF8E7', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#1C1B17' },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 100 },
  breadcrumb: { fontSize: 12, color: '#7E7767', marginBottom: 16, fontWeight: '500' },
  keyBadge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 8,
    backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 16,
  },
  keyBadgeLabel: { fontSize: 11, color: '#92400E', fontWeight: '700', letterSpacing: 0.5 },
  keyBadgeValue: { fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }), fontWeight: '700', color: '#D4A574', fontSize: 14, letterSpacing: 1 },
  card: {
    borderRadius: 32, padding: 24, marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.06, shadowRadius: 40, elevation: 6,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1C1B17', marginBottom: 20 },
  formGroupFloating: {
    marginBottom: 16, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f5', position: 'relative',
  },
  floatingLabel: {
    position: 'absolute', top: -8, left: 12,
    backgroundColor: '#FFFFFF', paddingHorizontal: 6,
    fontSize: 11, fontWeight: '700', color: '#7E7767', letterSpacing: 0.5,
  },
  floatingLabelFocused: { color: '#D4A574' },
  input: {
    borderWidth: 2, borderColor: '#E5E7EB', borderRadius: 16, padding: 16,
    fontSize: 15, color: '#1C1B17', backgroundColor: '#FFFFFF', fontWeight: '600',
  },
  inputFocused: { borderColor: '#D4A574', borderWidth: 2 },
  inputError: { borderColor: '#EF4444' },
  errorText: { fontSize: 11, color: '#EF4444', marginTop: 6, fontWeight: '600' },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  dropdown: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 2, borderColor: '#E5E7EB', borderRadius: 16, padding: 16, backgroundColor: '#FFFFFF',
  },
  dropdownText: { fontSize: 15, color: '#7E7767', fontWeight: '600' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FEF8E7', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6,
  },
  chipText: { fontSize: 12, fontWeight: '700', color: '#8A6D3B' },
  actionBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 16,
    paddingHorizontal: 20, paddingTop: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 4,
  },
  cancelButton: {
    flex: 1, height: 52, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF',
  },
  cancelButtonText: { fontSize: 16, fontWeight: '600', color: '#6E6E6E' },
  saveButton: {
    flex: 1, height: 56, borderRadius: 50, backgroundColor: '#1C1B17',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#1C1B17', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8,
  },
  saveButtonText: { fontSize: 16, fontWeight: '800', color: '#F5C451' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF', borderRadius: 20,
    width: '100%', maxHeight: '70%', paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#1C1C1C' },
  searchInput: {
    margin: 16, padding: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', borderRadius: 10, fontSize: 15,
  },
  modalItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  modalItemText: { fontSize: 15, color: '#1C1C1C' },
  loadingText: { fontSize: 15, color: '#6E6E6E', textAlign: 'center', padding: 20 },
  doneButton: {
    marginHorizontal: 16, marginTop: 8, backgroundColor: '#1C1B17',
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  doneButtonText: { color: '#F5C451', fontWeight: '700', fontSize: 15 },
  datePickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  datePickerContainer: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 20,
  },
  datePickerHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  datePickerTitle: { fontSize: 16, fontWeight: '700', color: '#1C1B17' },
  datePickerCancel: { fontSize: 15, color: '#6E6E6E', fontWeight: '600' },
  datePickerDone: { fontSize: 15, color: '#D4A574', fontWeight: '700' },
  datePickerSpinner: { height: 200, backgroundColor: '#FFFFFF' },
});