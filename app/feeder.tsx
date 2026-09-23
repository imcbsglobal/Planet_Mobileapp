/* eslint-disable prettier/prettier */
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUserScope, isAllowed } from './authScope';
import { Feeder as FeederRecord, feederApi } from './feederApi';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  Installed: { bg: '#E9F7EF', text: '#1E8E4B' },
  Pending: { bg: '#FEF3E2', text: '#B8720B' },
  Cancelled: { bg: '#FDEAEA', text: '#C0392B' },
};

const ADM_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  Approved: { bg: '#E9F7EF', text: '#1E8E4B' },
  Pending: { bg: '#FEF3E2', text: '#B8720B' },
  Rejected: { bg: '#FDEAEA', text: '#C0392B' },
};

const StatusBadge = ({ status }: { status?: string }) => {
  if (!status) return null;
  const colors = STATUS_COLORS[status] || { bg: '#F1F0EC', text: '#7E7767' };
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.badgeText, { color: colors.text }]}>{status}</Text>
    </View>
  );
};

const AdmStatusBadge = ({ status }: { status?: string }) => {
  if (!status) return null;
  const colors = ADM_STATUS_COLORS[status] || { bg: '#F1F0EC', text: '#7E7767' };
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.badgeText, { color: colors.text }]}>{status}</Text>
    </View>
  );
};

const DetailRow = ({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
}) => {
  if (!value) return null;
  return (
    <View style={styles.sheetDetailRow}>
      <Ionicons name={icon} size={14} color="#7E7767" style={{ marginRight: 6 }} />
      <Text style={styles.sheetDetailLabel}>{label}</Text>
      <Text style={styles.sheetDetailValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
};

export default function Feeder() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [feeders, setFeeders] = useState<FeederRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userLabel, setUserLabel] = useState<string | null>(null);

  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedFeeder, setSelectedFeeder] = useState<FeederRecord | null>(null);

  const loadFeeders = useCallback(async () => {
    try {
      setError(null);

      const scope = await getUserScope();
      setUserRole(scope.role);
      setUserLabel(await SecureStore.getItemAsync('username'));

      const data = await feederApi.list();

      // Admins see everything. Everyone else sees only feeders whose branch
      // is one of their assigned branches — straight from the login payload.
      const scoped = scope.isAdmin
        ? data
        : data.filter((f) => isAllowed(f.branch, scope.branches));

      setFeeders(scoped);
    } catch (err: any) {
      setError(err?.message || 'Failed to load feeders');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadFeeders();
    }, [loadFeeders])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadFeeders();
  };

  const filtered = feeders.filter((f) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      f.name?.toLowerCase().includes(q) ||
      f.location?.toLowerCase().includes(q) ||
      f.branch?.toLowerCase().includes(q) ||
      f.software?.toLowerCase().includes(q) ||
      f.phone?.toLowerCase().includes(q) ||
      f.uniqueCode?.toLowerCase().includes(q)
    );
  });

  const goToAdd = () => navigation.navigate('AddFeeder');
  const goToEdit = (feeder: FeederRecord) => navigation.navigate('AddFeeder', { feeder });

  const formatAmount = (value?: string | number) => {
    if (value === undefined || value === null || value === '') return undefined;
    const num = Number(value);
    if (Number.isNaN(num)) return String(value);
    return `\u20B9${num.toLocaleString('en-IN')}`;
  };

  // "Place" for the compact card — falls back through the location-ish fields
  const getPlace = (f: FeederRecord) => f.location || f.area || f.district || '';

  const openDetails = (feeder: FeederRecord) => {
    setSelectedFeeder(feeder);
    setShowDetailsModal(true);
  };

  const closeDetails = () => setShowDetailsModal(false);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1C1B17" />
        </Pressable>
        <Text style={styles.headerTitle}>Feeder</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.searchWrapper}>
        <Ionicons name="search" size={18} color="#7E7767" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, location, branch..."
          placeholderTextColor="#A6A08F"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color="#A6A08F" />
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color="#D4A574" />
        </View>
      ) : error ? (
        <View style={styles.centerFill}>
          <Ionicons name="alert-circle-outline" size={40} color="#C0392B" />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={loadFeeders}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D4A574" />
          }
          ListEmptyComponent={
            <View style={styles.centerFill}>
              <Ionicons name="file-tray-outline" size={40} color="#C7C1B0" />
              <Text style={styles.emptyText}>
                {search
                  ? 'No feeders match your search'
                  : userLabel
                  ? `No feeders found for ${userLabel}`
                  : 'No feeders yet'}
              </Text>
              {!search && (
                <Pressable style={styles.emptyAddButton} onPress={goToAdd}>
                  <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.emptyAddButtonText}>Add Feeder</Text>
                </Pressable>
              )}
            </View>
          }
          renderItem={({ item }) => {
            const amount = formatAmount((item as any).totalCost);
            const place = getPlace(item);

            return (
              <Pressable style={styles.card} onPress={() => openDetails(item)}>
                <View style={styles.cardTopRow}>
                  <View style={styles.cardIconContainer}>
                    <Ionicons name="business-outline" size={20} color="#D4A574" />
                  </View>

                  <View style={styles.cardMain}>
                    <Text style={styles.cardName} numberOfLines={1}>
                      {item.name}
                    </Text>

                    <View style={styles.cardMetaRow}>
                      <Ionicons name="location-outline" size={12} color="#A6A08F" />
                      <Text style={styles.cardMetaText} numberOfLines={1}>
                        {place || 'Location not available'}
                      </Text>
                    </View>

                    {!!item.software && (
                      <View style={styles.cardMetaRow}>
                        <Ionicons name="apps-outline" size={12} color="#A6A08F" />
                        <Text style={styles.cardMetaText} numberOfLines={1}>
                          {item.software}
                        </Text>
                      </View>
                    )}
                  </View>

                  <StatusBadge status={item.status} />
                </View>

                <View style={styles.cardDivider} />

                <View style={styles.cardBottomRow}>
                  <View>
                    <Text style={styles.cardAmountLabel}>Amount</Text>
                    <Text style={styles.cardAmountValue}>{amount || '—'}</Text>
                  </View>

                  <Pressable
                    style={styles.viewBtn}
                    onPress={() => openDetails(item)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="eye-outline" size={15} color="#8A6D3B" />
                    <Text style={styles.viewBtnText}>View</Text>
                  </Pressable>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <Pressable
        style={[styles.fab, { bottom: Math.max(insets.bottom, 16) + 16 }]}
        onPress={goToAdd}
      >
        <Ionicons name="add" size={28} color="#1C1B17" />
      </Pressable>

      {/* ── Details popup: everything that used to live on the card ── */}
      <Modal
        visible={showDetailsModal}
        transparent
        animationType="slide"
        onRequestClose={closeDetails}
      >
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={closeDetails} />

          {selectedFeeder && (
            <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
              <View style={styles.sheetHandle} />

              <View style={styles.sheetHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetName} numberOfLines={1}>
                    {selectedFeeder.name}
                  </Text>
                  {!!getPlace(selectedFeeder) && (
                    <Text style={styles.sheetSubName} numberOfLines={1}>
                      {getPlace(selectedFeeder)}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.sheetCloseBtn}
                  onPress={closeDetails}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={20} color="#1C1B17" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetScrollContent}>
                <View style={styles.sheetPillRow}>
                  <StatusBadge status={selectedFeeder.status} />
                  {!!(selectedFeeder as any).admStatus && (
                    <AdmStatusBadge status={(selectedFeeder as any).admStatus} />
                  )}
                </View>

                {!!formatAmount((selectedFeeder as any).totalCost) && (
                  <View style={styles.sheetAmountBlock}>
                    <Text style={styles.sheetAmountLabel}>Total Cost</Text>
                    <Text style={styles.sheetAmount}>
                      {formatAmount((selectedFeeder as any).totalCost)}
                    </Text>
                  </View>
                )}

                {selectedFeeder.modules && selectedFeeder.modules.length > 0 && (
                  <View style={styles.sheetChipsWrap}>
                    {selectedFeeder.modules.map((m) => (
                      <View key={m} style={styles.chip}>
                        <Text style={styles.chipText}>{m}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={styles.sheetDetailsCard}>
                  <DetailRow icon="apps-outline" label="Software" value={selectedFeeder.software} />
                  <DetailRow icon="git-branch-outline" label="Branch" value={selectedFeeder.branch} />
                  <DetailRow icon="business-outline" label="Corporate" value={selectedFeeder.corporate || undefined} />
                  <DetailRow icon="layers-outline" label="Nature" value={selectedFeeder.businessNature} />
                  <DetailRow icon="calendar-outline" label="Installed" value={selectedFeeder.installDate} />
                  <DetailRow icon="cash-outline" label="Software Amt" value={formatAmount(selectedFeeder.softwareAmount)} />
                  <DetailRow icon="desktop-outline" label="No. Systems" value={selectedFeeder.noOfSystem ? String(selectedFeeder.noOfSystem) : undefined} />
                  <DetailRow icon="key-outline" label="Unique Code" value={selectedFeeder.uniqueCode || undefined} />
                </View>

                <View style={styles.sheetDetailsCard}>
                  <DetailRow icon="location-outline" label="Address" value={selectedFeeder.address} />
                  <DetailRow icon="map-outline" label="Area" value={selectedFeeder.area} />
                  <DetailRow icon="map-outline" label="District" value={selectedFeeder.district} />
                  <DetailRow icon="flag-outline" label="State" value={selectedFeeder.state} />
                  <DetailRow icon="earth-outline" label="Country" value={selectedFeeder.country} />
                  <DetailRow icon="pin-outline" label="Pin Code" value={selectedFeeder.pinCode} />
                </View>

                <View style={styles.sheetDetailsCard}>
                  <DetailRow icon="person-outline" label="Contact" value={selectedFeeder.contactPerson} />
                  <DetailRow icon="call-outline" label="Phone" value={selectedFeeder.phone} />
                  <DetailRow icon="mail-outline" label="Email" value={selectedFeeder.email} />
                  <DetailRow icon="person-outline" label="Reputed Name" value={selectedFeeder.reputedName} />
                  <DetailRow icon="call-outline" label="Reputed Phone" value={selectedFeeder.reputedPhone} />
                </View>

                {!!selectedFeeder.remark && (
                  <View style={styles.sheetNotesBlock}>
                    <View style={styles.sheetNotesHeader}>
                      <Ionicons name="document-text-outline" size={14} color="#A6A08F" />
                      <Text style={styles.sheetNotesLabel}>Remark</Text>
                    </View>
                    <Text style={styles.sheetNotesText}>{selectedFeeder.remark}</Text>
                  </View>
                )}

                <View style={styles.sheetDetailsCard}>
                  <DetailRow icon="person-circle-outline" label="Created By" value={selectedFeeder.createdBy} />
                  <DetailRow icon="time-outline" label="Created At" value={selectedFeeder.createdAt} />
                  <DetailRow icon="time-outline" label="Updated At" value={selectedFeeder.updatedAt} />
                </View>

                <TouchableOpacity
                  style={styles.sheetEditBtn}
                  onPress={() => {
                    closeDetails();
                    goToEdit(selectedFeeder);
                  }}
                >
                  <Ionicons name="create-outline" size={18} color="#1C1B17" />
                  <Text style={styles.sheetEditBtnText}>Edit Feeder</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
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
  addIconButton: {
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
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 24,
    marginBottom: 12,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1C1B17',
    fontWeight: '500',
  },
  listContent: {
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 100,
    flexGrow: 1,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 30,
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    color: '#7E7767',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#1C1B17',
  },
  retryButtonText: {
    color: '#F5C451',
    fontWeight: '700',
    fontSize: 13,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
    color: '#A6A08F',
    fontWeight: '500',
    textAlign: 'center',
  },
  emptyAddButton: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#D4A574',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  emptyAddButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },

  /* ── Compact card (replaces the old big detail-grid card) ── */
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  cardIconContainer: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FEF8E7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardMain: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1B17',
    marginBottom: 1,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardMetaText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#7E7767',
    flexShrink: 1,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F3F2ED',
    marginTop: 12,
    marginBottom: 10,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardAmountLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#A6A08F',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  cardAmountValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C1B17',
  },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FEF8E7',
  },
  viewBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#8A6D3B',
  },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  chip: {
    backgroundColor: '#FEF8E7',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8A6D3B',
  },

  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F5C451',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },

  /* ── Details popup (bottom sheet) ── */
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
    maxHeight: '86%',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E8E3D9',
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F2ED',
  },
  sheetName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1B17',
  },
  sheetSubName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#A6A08F',
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
    borderColor: '#F3F2ED',
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
    backgroundColor: '#FEF8E7',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetAmountLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A6A08F',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  sheetAmount: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1C1B17',
  },
  sheetChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  sheetDetailsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F3F2ED',
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 16,
  },
  sheetDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F3EC',
  },
  sheetDetailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#A6A08F',
    width: 90,
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
    borderColor: '#F3F2ED',
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
    color: '#A6A08F',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  sheetNotesText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#4A4636',
    lineHeight: 19,
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
});