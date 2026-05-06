import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState, useRef } from 'react';
import { Animated, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Pressable } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DISTRICTS = ['Thiruvananthapuram', 'Kollam', 'Pathanamthitta', 'Alappuzha', 'Kottayam', 'Idukki', 'Ernakulam', 'Thrissur', 'Palakkad', 'Malappuram', 'Kozhikode', 'Wayanad', 'Kannur', 'Kasaragod'];
const STATES = ['Kerala', 'Tamil Nadu', 'Karnataka', 'Maharashtra', 'Delhi', 'Gujarat', 'Rajasthan', 'Uttar Pradesh'];
const BRANCHES = ['IMC', 'IMC Chavakkad', 'IMC Koothuparamba', 'IMC Mukkam', 'IMC PALAKKAD', 'RITS H.O', 'RITS Wayanad', 'RUBIX', 'SYSMAC', 'SYSMAC Kuttyadi', 'WINWAY'];



const fetchDistricts = async () => {
  return DISTRICTS;
};

const fetchStates = async () => {
  return STATES;
};

const fetchSoftwareList = async () => {
  const response = await fetch('https://myimc.in/api/feeders/');
  const data = await response.json();
  return Array.from(new Set(data.map((item: any) => item.software || item.software_name).filter(Boolean)));
};

const fetchNatureList = async () => {
  const response = await fetch('https://myimc.in/api/feeders/');
  const data = await response.json();
  return Array.from(new Set(data.map((item: any) => {
    const value = item.nature || item.business_type;
    return value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : null;
  }).filter(Boolean)));
};

const fetchBranchList = async () => {
  return BRANCHES;
};

const fetchCountries = async () => {
  try {
    const response = await fetch('https://restcountries.com/v3.1/all');
    const data = await response.json();
    return data.map((item: any) => item.name.common).sort();
  } catch (error) {
    // Fallback to static list if API fails
    return ['India', 'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France', 'Japan', 'China', 'Brazil'].sort();
  }
};

export default function AddFeederScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'district' | 'state' | 'software' | 'nature' | 'branch' | 'country' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dropdownData, setDropdownData] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    location: '',
    area: '',
    district: '',
    state: '',
    contactPerson: '',
    contactNumber: '',
    email: '',
    reputedPersonName: '',
    reputedPersonNumber: '',
    software: '',
    nature: '',
    branch: '',
    noOfSystem: '',
    pincode: '',
    country: 'India',
    installationDate: '',
    remarks: '',
    softwareAmount: '',
    totalCost: '',
  });

  const [expandedSections, setExpandedSections] = useState({
    mobileApps: false,
    advancedTask: false,
  });

  const [versions, setVersions] = useState({
    bCare: false,
    iCare: false,
    ultimate: false,
  });

  const [mobileApps, setMobileApps] = useState<Record<string, { checked: boolean; amount: string }>>({
    dineKOT: { checked: false, amount: '' },
    magicPDAFull: { checked: false, amount: '' },
    magicPDASuper: { checked: false, amount: '' },
    scanner: { checked: false, amount: '' },
    ewayTask: { checked: false, amount: '' },
    magNetPay: { checked: false, amount: '' },
    dineReporter: { checked: false, amount: '' },
    taskPro: { checked: false, amount: '' },
  });

  const [advancedTask, setAdvancedTask] = useState<Record<string, { checked: boolean; amount: string }>>({
    eInvoice: { checked: false, amount: '' },
    tpos: { checked: false, amount: '' },
    mpos: { checked: false, amount: '' },
    hosted: { checked: false, amount: '' },
    hostedPlus: { checked: false, amount: '' },
  });

  const openModal = async (type: 'district' | 'state' | 'software' | 'nature' | 'branch' | 'country') => {
    setModalType(type);
    setModalVisible(true);
    setSearchQuery('');
    setLoading(true);
    
    if (type === 'district') {
      const data = await fetchDistricts();
      setDropdownData(data);
    } else if (type === 'state') {
      const data = await fetchStates();
      setDropdownData(data);
    } else if (type === 'software') {
      const data = await fetchSoftwareList();
      setDropdownData(data);
    } else if (type === 'nature') {
      const data = await fetchNatureList();
      setDropdownData(data);
    } else if (type === 'branch') {
      const data = await fetchBranchList();
      setDropdownData(data);
    } else if (type === 'country') {
      const data = await fetchCountries();
      setDropdownData(data);
    }
    
    setLoading(false);
  };

  const selectItem = (item: string) => {
    if (modalType === 'district') {
      setFormData({...formData, district: item});
    } else if (modalType === 'state') {
      setFormData({...formData, state: item});
    } else if (modalType === 'software') {
      setFormData({...formData, software: item});
    } else if (modalType === 'nature') {
      setFormData({...formData, nature: item});
    } else if (modalType === 'branch') {
      setFormData({...formData, branch: item});
    } else if (modalType === 'country') {
      setFormData({...formData, country: item});
    }
    setModalVisible(false);
  };

  const getFilteredData = () => {
    const data = dropdownData;
    return data.filter(item => item.toLowerCase().includes(searchQuery.toLowerCase()));
  };

  const toggleSection = (section: 'mobileApps' | 'advancedTask') => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setFormData({...formData, installationDate: selectedDate.toLocaleDateString()});
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const response = await fetch('https://myimc.in/api/feeders/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          mobileApps,
          advancedTask,
          versions,
        }),
      });
      const result = await response.json();
      console.log('Save success:', result);
      alert('Feeder saved successfully!');
      navigation.goBack();
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save feeder');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
    <KeyboardAvoidingView 
      style={styles.keyboardView} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1C1B17" />
        </Pressable>
        <Text style={styles.headerTitle}>Add Feeder</Text>
        <View style={{ width: 44 }} />
      </View>
      
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.breadcrumb}>Home / Feeder / Add</Text>

        {/* Section 1: Primary Details */}
        <LinearGradient
          colors={['#FFFFFF', '#F6F1E8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <Text style={styles.sectionTitle}>Primary Details</Text>
          
          <View style={styles.formGroupFloating}>
            <TextInput
              style={[styles.input, focusedField === 'name' && styles.inputFocused]}
              value={formData.name}
              onChangeText={(text) => setFormData({...formData, name: text})}
              placeholder="Enter name"
              placeholderTextColor={'#6E6E6E'}
              onFocus={() => setFocusedField('name')}
              onBlur={() => setFocusedField(null)}
            />
            <Text style={[styles.floatingLabel, focusedField === 'name' && styles.floatingLabelFocused]}>Name</Text>
          </View>

          <View style={styles.formGroupFloating}>
            <TextInput
              style={[styles.input, styles.textArea, focusedField === 'address' && styles.inputFocused]}
              value={formData.address}
              onChangeText={(text) => setFormData({...formData, address: text})}
              placeholder="Enter address"
              placeholderTextColor={'#6E6E6E'}
              multiline
              numberOfLines={3}
              onFocus={() => setFocusedField('address')}
              onBlur={() => setFocusedField(null)}
            />
            <Text style={[styles.floatingLabel, focusedField === 'address' && styles.floatingLabelFocused]}>Address / Landmark</Text>
          </View>

          <View style={styles.formGroupFloating}>
            <TextInput
              style={[styles.input, focusedField === 'location' && styles.inputFocused]}
              value={formData.location}
              onChangeText={(text) => setFormData({...formData, location: text})}
              placeholder="Enter location"
              placeholderTextColor={'#6E6E6E'}
              onFocus={() => setFocusedField('location')}
              onBlur={() => setFocusedField(null)}
            />
            <Text style={[styles.floatingLabel, focusedField === 'location' && styles.floatingLabelFocused]}>Location</Text>
          </View>

          <View style={styles.formGroupFloating}>
            <TextInput
              style={[styles.input, focusedField === 'area' && styles.inputFocused]}
              value={formData.area}
              onChangeText={(text) => setFormData({...formData, area: text})}
              placeholder="Enter area"
              placeholderTextColor={'#6E6E6E'}
              onFocus={() => setFocusedField('area')}
              onBlur={() => setFocusedField(null)}
            />
            <Text style={[styles.floatingLabel, focusedField === 'area' && styles.floatingLabelFocused]}>Area</Text>
          </View>

          <View style={styles.formGroupFloating}>
            <TouchableOpacity style={styles.dropdown} onPress={() => openModal('district')}>
              <Text style={styles.dropdownText}>{formData.district || 'Select district'}</Text>
              <Ionicons name="chevron-down" size={20} color={'#6E6E6E'} />
            </TouchableOpacity>
            <Text style={styles.floatingLabel}>District</Text>
          </View>

          <View style={styles.formGroupFloating}>
            <TouchableOpacity style={styles.dropdown} onPress={() => openModal('state')}>
              <Text style={styles.dropdownText}>{formData.state || 'Select state'}</Text>
              <Ionicons name="chevron-down" size={20} color={'#6E6E6E'} />
            </TouchableOpacity>
            <Text style={styles.floatingLabel}>State</Text>
          </View>

          <View style={styles.formGroupFloating}>
            <TextInput
              style={[styles.input, focusedField === 'contactPerson' && styles.inputFocused]}
              value={formData.contactPerson}
              onChangeText={(text) => setFormData({...formData, contactPerson: text})}
              placeholder="Enter contact person"
              placeholderTextColor={'#6E6E6E'}
              onFocus={() => setFocusedField('contactPerson')}
              onBlur={() => setFocusedField(null)}
            />
            <Text style={[styles.floatingLabel, focusedField === 'contactPerson' && styles.floatingLabelFocused]}>Contact Person</Text>
          </View>

          <View style={styles.formGroupFloating}>
            <TextInput
              style={[styles.input, focusedField === 'contactNumber' && styles.inputFocused]}
              value={formData.contactNumber}
              onChangeText={(text) => setFormData({...formData, contactNumber: text})}
              placeholder="Enter contact number"
              placeholderTextColor={'#6E6E6E'}
              keyboardType="phone-pad"
              onFocus={() => setFocusedField('contactNumber')}
              onBlur={() => setFocusedField(null)}
            />
            <Text style={[styles.floatingLabel, focusedField === 'contactNumber' && styles.floatingLabelFocused]}>Contact Number</Text>
          </View>

          <View style={styles.formGroupFloating}>
            <TextInput
              style={[styles.input, focusedField === 'email' && styles.inputFocused]}
              value={formData.email}
              onChangeText={(text) => setFormData({...formData, email: text})}
              placeholder="Enter email"
              placeholderTextColor={'#6E6E6E'}
              keyboardType="email-address"
              autoCapitalize="none"
              onFocus={() => setFocusedField('email')}
              onBlur={() => setFocusedField(null)}
            />
            <Text style={[styles.floatingLabel, focusedField === 'email' && styles.floatingLabelFocused]}>Email</Text>
          </View>

          <View style={styles.formGroupFloating}>
            <TextInput
              style={[styles.input, focusedField === 'reputedPersonName' && styles.inputFocused]}
              value={formData.reputedPersonName}
              onChangeText={(text) => setFormData({...formData, reputedPersonName: text})}
              placeholder="Enter reputed person name"
              placeholderTextColor={'#6E6E6E'}
              onFocus={() => setFocusedField('reputedPersonName')}
              onBlur={() => setFocusedField(null)}
            />
            <Text style={[styles.floatingLabel, focusedField === 'reputedPersonName' && styles.floatingLabelFocused]}>Reputed Person Name</Text>
          </View>

          <View style={styles.formGroupFloating}>
            <TextInput
              style={[styles.input, focusedField === 'reputedPersonNumber' && styles.inputFocused]}
              value={formData.reputedPersonNumber}
              onChangeText={(text) => setFormData({...formData, reputedPersonNumber: text})}
              placeholder="Enter reputed person number"
              placeholderTextColor={'#6E6E6E'}
              keyboardType="phone-pad"
              onFocus={() => setFocusedField('reputedPersonNumber')}
              onBlur={() => setFocusedField(null)}
            />
            <Text style={[styles.floatingLabel, focusedField === 'reputedPersonNumber' && styles.floatingLabelFocused]}>Reputed Person Number</Text>
          </View>
        </LinearGradient>

        {/* Section 2: Client Details */}
        <LinearGradient
          colors={['#FFFFFF', '#F6F1E8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <Text style={styles.sectionTitle}>Client Details</Text>

          <View style={styles.formGroupFloating}>
            <TouchableOpacity style={styles.dropdown} onPress={() => openModal('software')}>
              <Text style={styles.dropdownText}>{formData.software || 'Select software'}</Text>
              <Ionicons name="chevron-down" size={20} color={'#6E6E6E'} />
            </TouchableOpacity>
            <Text style={styles.floatingLabel}>Software</Text>
          </View>

          <View style={styles.formGroupFloating}>
            <TouchableOpacity style={styles.dropdown} onPress={() => openModal('nature')}>
              <Text style={styles.dropdownText}>{formData.nature || 'Select nature'}</Text>
              <Ionicons name="chevron-down" size={20} color={'#6E6E6E'} />
            </TouchableOpacity>
            <Text style={styles.floatingLabel}>Nature (Business Type)</Text>
          </View>

          <View style={styles.formGroupFloating}>
            <TextInput
              style={[styles.input, focusedField === 'branch' && styles.inputFocused]}
              value={formData.branch}
              onChangeText={(text) => setFormData({...formData, branch: text})}
              placeholder="Enter branch"
              placeholderTextColor={'#6E6E6E'}
              onFocus={() => setFocusedField('branch')}
              onBlur={() => setFocusedField(null)}
            />
            <Text style={[styles.floatingLabel, focusedField === 'branch' && styles.floatingLabelFocused]}>Branch</Text>
          </View>

          <View style={styles.formGroupFloating}>
            <TextInput
              style={[styles.input, focusedField === 'noOfSystem' && styles.inputFocused]}
              value={formData.noOfSystem}
              onChangeText={(text) => setFormData({...formData, noOfSystem: text})}
              placeholder="Enter number of systems"
              placeholderTextColor={'#6E6E6E'}
              keyboardType="numeric"
              onFocus={() => setFocusedField('noOfSystem')}
              onBlur={() => setFocusedField(null)}
            />
            <Text style={[styles.floatingLabel, focusedField === 'noOfSystem' && styles.floatingLabelFocused]}>No. of System</Text>
          </View>

          <View style={styles.formGroupFloating}>
            <TextInput
              style={[styles.input, focusedField === 'pincode' && styles.inputFocused]}
              value={formData.pincode}
              onChangeText={(text) => setFormData({...formData, pincode: text})}
              placeholder="Enter pincode"
              placeholderTextColor={'#6E6E6E'}
              keyboardType="numeric"
              onFocus={() => setFocusedField('pincode')}
              onBlur={() => setFocusedField(null)}
            />
            <Text style={[styles.floatingLabel, focusedField === 'pincode' && styles.floatingLabelFocused]}>Pincode</Text>
          </View>

          <View style={styles.formGroupFloating}>
            <TextInput
              style={[styles.input, focusedField === 'country' && styles.inputFocused]}
              value={formData.country}
              onChangeText={(text) => setFormData({...formData, country: text})}
              placeholder="Enter country"
              placeholderTextColor={'#6E6E6E'}
              onFocus={() => setFocusedField('country')}
              onBlur={() => setFocusedField(null)}
            />
            <Text style={[styles.floatingLabel, focusedField === 'country' && styles.floatingLabelFocused]}>Country</Text>
          </View>

          <View style={styles.formGroupFloating}>
            <TouchableOpacity style={styles.dropdown} onPress={() => setShowDatePicker(true)}>
              <Text style={styles.dropdownText}>{formData.installationDate || 'Select date'}</Text>
              <Ionicons name="calendar-outline" size={20} color={'#6E6E6E'} />
            </TouchableOpacity>
            <Text style={styles.floatingLabel}>Installation Date</Text>
          </View>

          <View style={styles.formGroupFloating}>
            <TextInput
              style={[styles.input, styles.textArea, focusedField === 'remarks' && styles.inputFocused]}
              value={formData.remarks}
              onChangeText={(text) => setFormData({...formData, remarks: text})}
              placeholder="Enter remarks"
              placeholderTextColor={'#6E6E6E'}
              multiline
              numberOfLines={3}
              onFocus={() => setFocusedField('remarks')}
              onBlur={() => setFocusedField(null)}
            />
            <Text style={[styles.floatingLabel, focusedField === 'remarks' && styles.floatingLabelFocused]}>Remarks</Text>
          </View>

          <View style={styles.formGroupFloating}>
            <TextInput
              style={[styles.input, focusedField === 'softwareAmount' && styles.inputFocused]}
              value={formData.softwareAmount}
              onChangeText={(text) => setFormData({...formData, softwareAmount: text})}
              placeholder="Enter software amount"
              placeholderTextColor={'#6E6E6E'}
              keyboardType="numeric"
              onFocus={() => setFocusedField('softwareAmount')}
              onBlur={() => setFocusedField(null)}
            />
            <Text style={[styles.floatingLabel, focusedField === 'softwareAmount' && styles.floatingLabelFocused]}>Software Amount</Text>
          </View>

          <View style={styles.formGroupFloating}>
            <TextInput
              style={[styles.input, focusedField === 'totalCost' && styles.inputFocused]}
              value={formData.totalCost}
              onChangeText={(text) => setFormData({...formData, totalCost: text})}
              placeholder="Enter total cost"
              placeholderTextColor={'#6E6E6E'}
              keyboardType="numeric"
              onFocus={() => setFocusedField('totalCost')}
              onBlur={() => setFocusedField(null)}
            />
            <Text style={[styles.floatingLabel, focusedField === 'totalCost' && styles.floatingLabelFocused]}>Total Cost</Text>
          </View>
        </LinearGradient>

        {/* Section 3: More Modules */}
        <LinearGradient
          colors={['#FFFFFF', '#F6F1E8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <Text style={styles.sectionTitle}>More Modules</Text>

          <TouchableOpacity 
            style={styles.accordion}
            onPress={() => toggleSection('mobileApps')}
          >
            <Text style={styles.accordionText}>Mobile Apps</Text>
            <Ionicons 
              name={expandedSections.mobileApps ? 'chevron-up' : 'chevron-down'} 
              size={20} 
              color={'#1C1C1C'} 
            />
          </TouchableOpacity>
          {expandedSections.mobileApps && (
            <View style={styles.accordionContent}>
              {[
                { key: 'dineKOT', label: 'Dine KOT' },
                { key: 'magicPDAFull', label: 'MagicPDA Full (MST)' },
                { key: 'magicPDASuper', label: 'MagicPDA Super' },
                { key: 'scanner', label: 'Scanner' },
                { key: 'ewayTask', label: 'EWAY Task' },
                { key: 'magNetPay', label: 'MagNet Pay' },
                { key: 'dineReporter', label: 'DINE Reporter' },
                { key: 'taskPro', label: 'TASK Pro' },
              ].map((item) => (
                <View key={item.key} style={styles.moduleRow}>
                  <TouchableOpacity
                    style={styles.moduleCheckbox}
                    onPress={() => setMobileApps(prev => ({
                      ...prev,
                      [item.key]: { ...prev[item.key], checked: !prev[item.key].checked }
                    }))}
                  >
                    <Ionicons
                      name={mobileApps[item.key].checked ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={'#F4C84A'}
                    />
                  </TouchableOpacity>
                  <Text style={styles.moduleLabel}>{item.label}</Text>
                  <View style={styles.amountContainer}>
                    <Text style={styles.currencySymbol}>₹</Text>
                    <TextInput
                      style={[styles.amountInput, !mobileApps[item.key].checked && styles.amountInputDisabled]}
                      value={mobileApps[item.key].amount}
                      onChangeText={(text) => setMobileApps(prev => ({
                        ...prev,
                        [item.key]: { ...prev[item.key], amount: text }
                      }))}
                      placeholder="0"
                      placeholderTextColor={'#6E6E6E'}
                      keyboardType="numeric"
                      editable={mobileApps[item.key].checked}
                    />
                  </View>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity 
            style={styles.accordion}
            onPress={() => toggleSection('advancedTask')}
          >
            <Text style={styles.accordionText}>Advanced Task</Text>
            <Ionicons 
              name={expandedSections.advancedTask ? 'chevron-up' : 'chevron-down'} 
              size={20} 
              color={'#1C1C1C'} 
            />
          </TouchableOpacity>
          {expandedSections.advancedTask && (
            <View style={styles.accordionContent}>
              {[
                { key: 'eInvoice', label: 'E Invoice' },
                { key: 'tpos', label: 'TPOS' },
                { key: 'mpos', label: 'Mpos' },
                { key: 'hosted', label: 'Hosted' },
                { key: 'hostedPlus', label: 'Hosted +' },
              ].map((item) => (
                <View key={item.key} style={styles.moduleRow}>
                  <TouchableOpacity
                    style={styles.moduleCheckbox}
                    onPress={() => setAdvancedTask(prev => ({
                      ...prev,
                      [item.key]: { ...prev[item.key], checked: !prev[item.key].checked }
                    }))}
                  >
                    <Ionicons
                      name={advancedTask[item.key].checked ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={'#F4C84A'}
                    />
                  </TouchableOpacity>
                  <Text style={styles.moduleLabel}>{item.label}</Text>
                  <View style={styles.amountContainer}>
                    <Text style={styles.currencySymbol}>₹</Text>
                    <TextInput
                      style={[styles.amountInput, !advancedTask[item.key].checked && styles.amountInputDisabled]}
                      value={advancedTask[item.key].amount}
                      onChangeText={(text) => setAdvancedTask(prev => ({
                        ...prev,
                        [item.key]: { ...prev[item.key], amount: text }
                      }))}
                      placeholder="0"
                      placeholderTextColor={'#6E6E6E'}
                      keyboardType="numeric"
                      editable={advancedTask[item.key].checked}
                    />
                  </View>
                </View>
              ))}
            </View>
          )}
        </LinearGradient>

        {/* Section 4: Version Selection */}
        <LinearGradient
          colors={['#FFFFFF', '#F6F1E8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <Text style={styles.sectionTitle}>Version Selection</Text>

          <TouchableOpacity 
            style={styles.checkboxRow}
            onPress={() => setVersions({...versions, bCare: !versions.bCare})}
          >
            <Ionicons 
              name={versions.bCare ? 'checkbox' : 'square-outline'} 
              size={24} 
              color={'#F4C84A'} 
            />
            <Text style={styles.checkboxLabel}>B-care</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.checkboxRow}
            onPress={() => setVersions({...versions, iCare: !versions.iCare})}
          >
            <Ionicons 
              name={versions.iCare ? 'checkbox' : 'square-outline'} 
              size={24} 
              color={'#F4C84A'} 
            />
            <Text style={styles.checkboxLabel}>I-care</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.checkboxRow}
            onPress={() => setVersions({...versions, ultimate: !versions.ultimate})}
          >
            <Ionicons 
              name={versions.ultimate ? 'checkbox' : 'square-outline'} 
              size={24} 
              color={'#F4C84A'} 
            />
            <Text style={styles.checkboxLabel}>Ultimate</Text>
          </TouchableOpacity>
        </LinearGradient>
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.saveButton}
          disabled={loading}
          onPress={handleSave}
        >
          <Text style={styles.saveButtonText}>{loading ? 'Saving...' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom Sheet Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select {modalType === 'district' ? 'District' : modalType === 'state' ? 'State' : modalType === 'software' ? 'Software' : modalType === 'nature' ? 'Nature' : modalType === 'branch' ? 'Branch' : 'Country'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={'#1C1C1C'} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.searchInput}
              placeholder="Search..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor={'#6E6E6E'}
            />
            <FlatList
              data={getFilteredData()}
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.modalItem} onPress={() => selectItem(item)}>
                  <Text style={styles.modalItemText}>{item}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                loading ? <Text style={styles.loadingText}>Loading...</Text> : null
              }
            />
          </View>
        </View>
      </Modal>

      {/* Date Picker */}
      {showDatePicker && (
        <DateTimePicker
          value={formData.installationDate ? new Date(formData.installationDate) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDateChange}
        />
      )}
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
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1B17',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 100,
  },
  breadcrumb: {
    fontSize: 12,
    color: '#7E7767',
    marginBottom: 24,
    fontWeight: '500',
  },
  card: {
    borderRadius: 32,
    padding: 24,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.06,
    shadowRadius: 40,
    elevation: 6,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1B17',
    marginBottom: 20,
  },
  formGroup: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  formGroupFloating: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    position: 'relative',
  },
  floatingLabel: {
    position: 'absolute',
    top: -8,
    left: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 6,
    fontSize: 11,
    fontWeight: '700',
    color: '#7E7767',
    letterSpacing: 0.5,
  },
  floatingLabelFocused: {
    color: '#D4A574',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1C1C1C',
    marginBottom: 8,
  },
  required: {
    color: '#EF4444',
  },
  helperText: {
    fontSize: 12,
    color: '#6E6E6E',
    marginTop: 4,
  },
  input: {
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 16,
    fontSize: 15,
    color: '#1C1B17',
    backgroundColor: '#FFFFFF',
    fontWeight: '600',
  },
  inputFocused: {
    borderColor: '#D4A574',
    borderWidth: 2,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  disabledInput: {
    backgroundColor: '#F3F4F6',
    color: '#6E6E6E',
  },
  dropdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  dropdownText: {
    fontSize: 15,
    color: '#7E7767',
    fontWeight: '600',
  },
  accordion: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F6F1E8',
    borderRadius: 12,
    marginBottom: 12,
  },
  accordionText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1C1C1C',
  },
  accordionContent: {
    padding: 16,
    backgroundColor: '#FAFBFC',
    borderRadius: 12,
    marginBottom: 12,
  },
  accordionContentText: {
    fontSize: 14,
    color: '#6E6E6E',
  },
  moduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  moduleCheckbox: {
    marginRight: 12,
  },
  moduleLabel: {
    flex: 1,
    fontSize: 15,
    color: '#1C1C1C',
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    paddingHorizontal: 10,
    height: 42,
    minWidth: 100,
  },
  currencySymbol: {
    fontSize: 15,
    color: '#1C1C1C',
    marginRight: 4,
    fontWeight: '500',
  },
  amountInput: {
    flex: 1,
    fontSize: 15,
    color: '#1C1C1C',
    padding: 0,
  },
  amountInputDisabled: {
    color: '#6E6E6E',
    backgroundColor: '#F5F5F5',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  checkboxLabel: {
    fontSize: 16,
    color: '#1C1C1C',
    marginLeft: 16,
  },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 4,
  },
  cancelButton: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6E6E6E',
  },
  saveButton: {
    flex: 1,
    height: 56,
    borderRadius: 50,
    backgroundColor: '#1C1B17',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1C1B17',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F5C451',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1C',
  },
  searchInput: {
    margin: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    borderRadius: 10,
    fontSize: 15,
  },
  modalItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  modalItemText: {
    fontSize: 15,
    color: '#1C1C1C',
  },
  loadingText: {
    fontSize: 15,
    color: '#6E6E6E',
    textAlign: 'center',
    padding: 20,
  },
});
