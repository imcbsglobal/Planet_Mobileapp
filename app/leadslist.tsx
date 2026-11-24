/* eslint-disable prettier/prettier */
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from '../lib/secureStore';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

/* ─────────────────────────── Types ─────────────────────────── */

interface UserCredentials {
  userId: string;
  password: string;
  username?: string;
}

interface LeadEntry {
  id: string;
  ownerName: string;
  shopName: string;
  location: string;
  phoneNumber: string;
  purpose: string;
  notes?: string;
  imageUrl: string | null;
  createdAt: string;
  createdByName?: string;
  createdById?: string;
}

/* ─────────────────────────── Constants ─────────────────────── */

// Same host used to submit enquiries in leads.tsx — GET on this endpoint
// is assumed to return the list. If your backend uses a different path
// for listing (e.g. /enquiry/api/list/), update this one constant.
const LEADS_API_URL = 'https://my.myimc.in/enquiry/api/';

// Route name of the existing "New Enquiry" form (leads.tsx). Adjust this
// to match whatever name it's registered under in your navigator.
const ADD_LEAD_ROUTE = 'Leads';

const PURPOSE_COLORS: Record<string, { bg: string; text: string }> = {
  'Software Enquiry': { bg: '#DBEAFE', text: '#1D4ED8' },
  'Hardware Enquiry': { bg: '#EDE9FE', text: '#6D28D9' },
  Both: { bg: '#DCFCE7', text: '#15803D' },
  Other: { bg: '#FEF9C3', text: '#A16207' },
};

/* ─────────────────────────── Component ─────────────────────── */

export default function LeadsList() {
  const navigation = useNavigation<any>();

  const [isInitializing, setIsInitializing] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userCredentials, setUserCredentials] = useState<UserCredentials | null>(null);
  const [leads, setLeads] = useState<LeadEntry[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState<LeadEntry | null>(null);

  /* ── Map raw API item → LeadEntry ── */
  const mapLead = (l: any, i: number): LeadEntry => ({
    id: l.id?.toString() || i.toString(),
    ownerName: l.owner_name || l.ownerName || 'Unknown',
    shopName: l.shop_name || l.shopName || 'Unknown Shop',
    location: l.location || '',
    phoneNumber: (l.phone_number || l.phoneNumber || '').toString().trim(),
    purpose: l.purpose || '',
    notes: l.notes || '',
    imageUrl: l.image_url || l.image || null,
    createdAt: l.created_at || l.createdAt || new Date().toISOString(),
    createdByName: l.created_by_name || l.creator || l.created_by || '',
    createdById: l.user_id?.toString() || l.created_by_id?.toString() || '',
  });

  /* ── Filter leads to the logged-in user only ── */
  const filterToUser = (entries: LeadEntry[], creds: UserCredentials): LeadEntry[] => {
    const uid = creds.userId.toLowerCase().trim();
    const uname = (creds.username || '').toLowerCase().trim();

    return entries.filter((l) => {
      const byName = (l.createdByName || '').toLowerCase().trim();
      const byId = (l.createdById || '').toLowerCase().trim();
      return (byName && (byName === uid || (uname && byName === uname))) || (byId && byId === uid);
    });
  };

  /* ── Load cached leads immediately ── */
  const loadCachedLeads = async (creds: UserCredentials): Promise<boolean> => {
    try {
      const raw = await AsyncStorage.getItem(`leads_${creds.userId}`);
      if (raw) {
        setLeads(JSON.parse(raw));
        return true;
      }
    } catch {}
    return false;
  };

  /* ── Fetch fresh leads ── */
  const fetchLeads = useCallback(async (creds: UserCredentials) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(LEADS_API_URL, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${btoa(`${creds.userId}:${creds.password}`)}`,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const text = await res.text();
      const parsed = JSON.parse(text);
      const rawList: any[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.data)
        ? parsed.data
        : Array.isArray(parsed?.results)
        ? parsed.results
        : [];

      const mapped = rawList.map(mapLead);
      const userLeads = filterToUser(mapped, creds);
      userLeads.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setLeads(userLeads);
      await AsyncStorage.setItem(`leads_${creds.userId}`, JSON.stringify(userLeads));
    } catch (err) {
      console.error('fetchLeads error:', err);
    }
  }, []);

  /* ── Init ── */
  useFocusEffect(
    useCallback(() => {
      let active = true;

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
          if (!active) return;
          setUserCredentials(creds);

          const hasCached = await loadCachedLeads(creds);
          if (hasCached && active) setIsInitializing(false);

          await fetchLeads(creds);
        } catch {
          navigation.replace('Login');
        } finally {
          if (active) setIsInitializing(false);
        }
      };

      init();
      return () => {
        active = false;
      };
    }, [fetchLeads, navigation])
  );

  const handleRefresh = async () => {
    if (!userCredentials) return;
    setRefreshing(true);
    await fetchLeads(userCredentials);
    setRefreshing(false);
  };

  /* ── Call / copy phone number ── */
  const handleCall = (phone: string) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() =>
      Alert.alert('Error', 'Could not open the dialer on this device.')
    );
  };

  const handleCopyPhone = async (phone: string, id: string) => {
    if (!phone) return;
    await Clipboard.setStringAsync(phone);
    setCopiedId(id);
    setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
  };

  const openDetails = (lead: LeadEntry) => {
    setSelectedLead(lead);
    setShowDetailsModal(true);
  };

  /* ── Render: list item ── */
  const renderLead = ({ item }: { item: LeadEntry }) => {
    const purposeStyle = PURPOSE_COLORS[item.purpose] || { bg: '#F0EAD8', text: '#7E7767' };
    const dateLabel = new Date(item.createdAt).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => openDetails(item)}>
        <View style={styles.cardTopRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{item.shopName.charAt(0).toUpperCase()}</Text>
          </View>

          <View style={styles.cardInfo}>
            <Text style={styles.shopName} numberOfLines={1}>
              {item.shopName}
            </Text>
            <Text style={styles.ownerName} numberOfLines={1}>
              {item.ownerName}
            </Text>
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={12} color="#A39A85" />
              <Text style={styles.locationText} numberOfLines={1}>
                {item.location || 'Location not available'}
              </Text>
            </View>
          </View>

          <View style={styles.cardRight}>
            {!!item.purpose && (
              <View style={[styles.purposePill, { backgroundColor: purposeStyle.bg }]}>
                <Text style={[styles.purposePillText, { color: purposeStyle.text }]} numberOfLines={1}>
                  {item.purpose}
                </Text>
              </View>
            )}
            <Text style={styles.dateText}>{dateLabel}</Text>
          </View>
        </View>

        {/* ── Phone number: tap to call, tap the copy icon to copy ── */}
        {!!item.phoneNumber && (
          <View style={styles.phoneRow}>
            <TouchableOpacity
              style={styles.phoneChip}
              activeOpacity={0.75}
              onPress={() => handleCall(item.phoneNumber)}
            >
              <Ionicons name="call" size={14} color="#15803D" />
              <Text style={styles.phoneChipText}>{item.phoneNumber}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.copyBtn}
              activeOpacity={0.75}
              onPress={() => handleCopyPhone(item.phoneNumber, item.id)}
            >
              <Ionicons
                name={copiedId === item.id ? 'checkmark' : 'copy-outline'}
                size={16}
                color={copiedId === item.id ? '#15803D' : '#7E7767'}
              />
              {copiedId === item.id && <Text style={styles.copiedText}>Copied</Text>}
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  /* ── Render: empty / loading states ── */
  if (isInitializing) {
    return (
      <View style={styles.centeredBlock}>
        <ActivityIndicator size="large" color="#F5C451" />
        <Text style={styles.loadingText}>Loading leads…</Text>
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
        <Text style={styles.headerTitle}>Leads</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate(ADD_LEAD_ROUTE as never)}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={26} color="#1C1B17" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={leads}
        keyExtractor={(item) => item.id}
        renderItem={renderLead}
        contentContainerStyle={leads.length === 0 ? styles.emptyListContent : styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#F5C451" />}
        ListEmptyComponent={
          <View style={styles.emptyBlock}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="people-outline" size={30} color="#D4A574" />
            </View>
            <Text style={styles.emptyTitle}>No leads yet</Text>
            <Text style={styles.emptySub}>Leads you add will show up here.</Text>
          </View>
        }
      />

      {/* Details bottom sheet */}
      <Modal
        visible={showDetailsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDetailsModal(false)}
      >
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setShowDetailsModal(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            {selectedLead && (
              <>
                <View style={styles.sheetHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetShopName}>{selectedLead.shopName}</Text>
                    <Text style={styles.sheetOwnerName}>{selectedLead.ownerName}</Text>
                  </View>
                  <TouchableOpacity style={styles.sheetCloseBtn} onPress={() => setShowDetailsModal(false)}>
                    <Ionicons name="close" size={18} color="#1C1B17" />
                  </TouchableOpacity>
                </View>

                {/* Highlighted phone block — call or copy */}
                {!!selectedLead.phoneNumber && (
                  <View style={styles.sheetPhoneBlock}>
                    <TouchableOpacity
                      style={styles.sheetPhoneCallArea}
                      activeOpacity={0.8}
                      onPress={() => handleCall(selectedLead.phoneNumber)}
                    >
                      <Ionicons name="call" size={18} color="#15803D" />
                      <Text style={styles.sheetPhoneText}>{selectedLead.phoneNumber}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.sheetPhoneCopyBtn}
                      activeOpacity={0.8}
                      onPress={() => handleCopyPhone(selectedLead.phoneNumber, selectedLead.id)}
                    >
                      <Ionicons
                        name={copiedId === selectedLead.id ? 'checkmark' : 'copy-outline'}
                        size={18}
                        color="#15803D"
                      />
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.sheetDetailsCard}>
                  <View style={styles.sheetDetailRow}>
                    <Text style={styles.sheetDetailLabel}>Location</Text>
                    <Text style={styles.sheetDetailValue}>{selectedLead.location || '—'}</Text>
                  </View>
                  <View style={[styles.sheetDetailRow, { borderBottomWidth: 0 }]}>
                    <Text style={styles.sheetDetailLabel}>Purpose</Text>
                    <Text style={styles.sheetDetailValue}>{selectedLead.purpose || '—'}</Text>
                  </View>
                </View>

                {!!selectedLead.notes && (
                  <View style={styles.sheetNotesBlock}>
                    <Text style={styles.sheetNotesLabel}>NOTES</Text>
                    <Text style={styles.sheetNotesText}>{selectedLead.notes}</Text>
                  </View>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ─────────────────────────── Styles ─────────────────────────── */

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAF9F6' },

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
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#1C1B17' },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5C451',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F5C451',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },

  listContent: { padding: 16, paddingBottom: 40 },
  emptyListContent: { flexGrow: 1, padding: 16 },

  /* Card */
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F0EAD8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FEF3DC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 17, fontWeight: '800', color: '#D4A574' },
  cardInfo: { flex: 1 },
  shopName: { fontSize: 15, fontWeight: '800', color: '#1C1B17' },
  ownerName: { fontSize: 12.5, fontWeight: '600', color: '#7E7767', marginTop: 1 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  locationText: { fontSize: 11.5, fontWeight: '500', color: '#A39A85', flexShrink: 1 },
  cardRight: { alignItems: 'flex-end', gap: 6, maxWidth: 110 },
  purposePill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  purposePillText: { fontSize: 10.5, fontWeight: '700' },
  dateText: { fontSize: 10.5, fontWeight: '600', color: '#A39A85' },

  /* Phone — highlighted, tappable to call, separate icon to copy */
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F5F3EC',
  },
  phoneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#DCFCE7',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  phoneChipText: { fontSize: 13.5, fontWeight: '700', color: '#15803D' },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F5F3EC',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  copiedText: { fontSize: 12, fontWeight: '700', color: '#15803D' },

  /* Empty / loading */
  centeredBlock: { flex: 1, backgroundColor: '#FAF9F6', justifyContent: 'center', alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 15, fontWeight: '600', color: '#7E7767' },
  emptyBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 8 },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEF9EE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#1C1B17' },
  emptySub: { fontSize: 13, fontWeight: '500', color: '#A39A85' },

  /* Details bottom sheet */
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(28,27,23,0.5)' },
  sheet: {
    backgroundColor: '#FAF9F6',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 30,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E4DCC8',
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EAD8',
    marginBottom: 16,
  },
  sheetShopName: { fontSize: 18, fontWeight: '800', color: '#1C1B17' },
  sheetOwnerName: { fontSize: 12.5, fontWeight: '600', color: '#A39A85', marginTop: 2 },
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

  sheetPhoneBlock: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#DCFCE7',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  sheetPhoneCallArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  sheetPhoneText: { fontSize: 17, fontWeight: '800', color: '#15803D' },
  sheetPhoneCopyBtn: {
    width: 52,
    justifyContent: 'center',
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(21,128,61,0.15)',
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
    justifyContent: 'space-between',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F3EC',
  },
  sheetDetailLabel: { fontSize: 12.5, fontWeight: '600', color: '#A39A85' },
  sheetDetailValue: { fontSize: 13, fontWeight: '700', color: '#1C1B17', flexShrink: 1, textAlign: 'right' },

  sheetNotesBlock: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F0EAD8',
    padding: 14,
  },
  sheetNotesLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A39A85',
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  sheetNotesText: { fontSize: 13, fontWeight: '500', color: '#4A4636', lineHeight: 19 },
});