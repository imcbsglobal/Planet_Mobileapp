import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import * as SecureStore from '../lib/secureStore';

/* ─────────────────────────── Types ─────────────────────────── */

interface ErpEntry {
  id: string;
  ticketNo: string;
  type: string;
  campaignId: string;
  campaignName: string;
  campaignSoftware: string;
  agent: string;
  customerName: string;
  place: string;
  phone: string;
  product: string[];
  productId: string;
  requirements: string[];
  notes: string;
  createdBy: string;
  date: string;
}

interface AgentOption {
  id: string | number;
  name: string;
  firm?: string;
  location?: string;
  phone?: string;
}

interface SoftwareItem {
  id: number;
  name: string;
  type: string;
}

interface PackageItem {
  id: number;
  code: string;
  product: number;
  product_name: string;
  product_code: string;
  name: string;
  description: string;
  price: string;
  tax_percent: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ProductGroup {
  productId: number;
  productName: string;
  productCode: string;
  packages: PackageItem[];
}

interface CampaignOption {
  id: string | number;
  campaignId: string;
  name: string;
  softwareName: string;
  location?: string;
  status?: string;
}

/* ─────────────────────────── Constants ─────────────────────── */

// Trelli enquiry endpoint — confirmed from the API root, which exposes
// "enquiries" under the trellienquery router.
const TRELLISCO_ERP_API_URL = 'https://planet.imcbs.com/api/trellienquery/enquiries/';

const AGENTS_API_URL = 'https://planet.imcbs.com/api/agentmaster/agents/';
const SOFTWARE_API_URL = 'https://planet.imcbs.com/api/master/software/';
const PACKAGES_API_URL = 'https://planet.imcbs.com/api/trellisco/packages/';
const CAMPAIGNS_API_URL = 'https://planet.imcbs.com/api/campaign/campaigns/';
// The list endpoint is paginated, so ask for a big page — otherwise a campaign
// id the user knows by heart can sit beyond page one and never be found.
const CAMPAIGNS_PAGE_SIZE = 500;

const FETCH_TIMEOUT = 15000;
// The form's TYPE field — how the ERP lead came in.
const ERP_TYPE_OPTIONS = ['Direct', 'Campaign'];
// Groups the requirements sheet, matching the `type` on master/software rows.
const SOFTWARE_TYPE_OPTIONS = ['RA', 'IA', 'HW', 'OTHERS'];

/**
 * `requirements` is a JSON field on the serializer, but older rows may come back
 * as a plain comma-separated string. Accept either shape.
 */
const parseRequirements = (raw: any): string[] => {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw !== 'string' || !raw.trim()) return [];
  const text = raw.trim();
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      // Not valid JSON — fall through to the comma split.
    }
  }
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

/**
 * The API can name the same field differently depending on the serializer.
 * This maps the common variants to one shape.
 */
const mapEntry = (r: any): ErpEntry => ({
  id: String(r.id),
  ticketNo: r.ticket_no || '',
  type: r.type || '',
  campaignId: r.campaign_id || '',
  campaignName: r.campaign_name || '',
  campaignSoftware: r.campaign_software || r.software_name || '',
  agent: r.agent || '',
  customerName: r.customer_name || r.customer || r.shop || r.name || '',
  place: r.place || r.location || '',
  phone: r.phone || r.phone_number || r.mobile || '',
  product: parseRequirements(
    r.product_name || (typeof r.product === 'object' ? r.product?.name : r.product)
  ),
  productId: String(
    typeof r.product === 'object' ? r.product?.id ?? '' : r.product ?? ''
  ),
  requirements: parseRequirements(r.requirements ?? r.software),
  notes: r.notes || '',
  createdBy: r.created_by || r.creator || '',
  date: r.created_at || r.date || '',
});

/* ─────────────────────────── Detail Row ──────────────────────── */

function DetailRow({ icon, label, value }: { icon: any; label: string; value?: string }) {
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

export default function TrelliscoErp() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [isInitializing, setIsInitializing] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [entries, setEntries] = useState<ErpEntry[]>([]);

  // Identity of the logged-in user — used to only show their own entries.
  const [myUsername, setMyUsername] = useState('');
  const [myUserId, setMyUserId] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  // Detail popup (eye icon)
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<ErpEntry | null>(null);

  const [type, setType] = useState('');
  const [agent, setAgent] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [place, setPlace] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedRequirements, setSelectedRequirements] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [showRequirementsModal, setShowRequirementsModal] = useState(false);

  /* ── Agents (fetched from agentmaster API) ── */
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [agentQuery, setAgentQuery] = useState('');
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);

  /* ── Requirements (fetched from packages API - product/package/description) ── */
  const [packageList, setPackageList] = useState<PackageItem[]>([]);
  const [packageGroups, setPackageGroups] = useState<ProductGroup[]>([]);
  const [packagesLoaded, setPackagesLoaded] = useState(false);
  const [loadingPackages, setLoadingPackages] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState<ProductGroup | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<PackageItem | null>(null);
  const [packageDescription, setPackageDescription] = useState('');

  /* ── Campaigns (fetched from campaign API) ── */
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [campaignsLoaded, setCampaignsLoaded] = useState(false);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [loadingCampaignDetail, setLoadingCampaignDetail] = useState(false);
  const [campaignQuery, setCampaignQuery] = useState('');
  const [showCampaignDropdown, setShowCampaignDropdown] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignOption | null>(null);
  // Guards the lazy campaign load: without it a failed request would leave
  // campaignsLoaded false and the effect below would retry forever, spinning.
  const campaignsRequested = useRef(false);

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

  const authHeaders = async () => ({
    Authorization: `Bearer ${await SecureStore.getItemAsync('token')}`,
  });

  const fetchEntries = async () => {
    try {
      const headers = await authHeaders();
      const response = await fetch(TRELLISCO_ERP_API_URL, { headers });
      const text = await response.text();
      if (!response.ok) throw new Error(text);

      const parsed = JSON.parse(text);
      const rows: any[] = Array.isArray(parsed) ? parsed : parsed?.results || [];
      const formatted: ErpEntry[] = rows.map(mapEntry);
      formatted.sort((a, b) => (a.date < b.date ? 1 : -1));
      setEntries(formatted);
    } catch (err) {
      console.log('fetchEntries error:', err);
    }
  };

  // Only the logged-in user's own entries. The API names this `created_by`, and
// older rows may carry `creator` — both are accepted.
  const myEntries = useMemo(() => {
    const uname = myUsername.trim().toLowerCase();
    const uid = myUserId.trim().toLowerCase();
    if (!uname && !uid) return [];
    return entries.filter((e) => {
      const creator = (e.createdBy || '').trim().toLowerCase();
      if (!creator) return false;
      return (!!uname && creator === uname) || (!!uid && creator === uid);
    });
  }, [entries, myUsername, myUserId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchEntries();
    setRefreshing(false);
  }, []);

  /* ── Agents ── */
  async function fetchAgents() {
    try {
      setLoadingAgents(true);
      const headers = await authHeaders();
      const response = await fetch(AGENTS_API_URL, { headers });
      const text = await response.text();
      if (!response.ok) throw new Error(text);

      const json = JSON.parse(text);
      const rows: any[] = Array.isArray(json) ? json : json.results || [];
      const formatted: AgentOption[] = rows.map((a: any) => ({
        id: a.id,
        name: a.name || '',
        firm: a.firm || '',
        location: a.location || '',
        phone: a.phone_number || a.phone || '',
      }));
      formatted.sort((a, b) => a.name.localeCompare(b.name));
      setAgents(formatted);
      setAgentsLoaded(true);
    } catch (err) {
      console.log('fetchAgents error:', err);
    } finally {
      setLoadingAgents(false);
    }
  }

  const filteredAgents = useMemo(() => {
    const q = agentQuery.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.firm || '').toLowerCase().includes(q) ||
        (a.location || '').toLowerCase().includes(q)
    );
  }, [agents, agentQuery]);

  const selectAgent = (a: AgentOption) => {
    setAgent(a.name);
    setShowAgentDropdown(false);
    setAgentQuery('');
  };

  /* ── Requirements ── */
  async function fetchPackageList() {
    try {
      setLoadingPackages(true);
      const headers = await authHeaders();
      const response = await fetch(PACKAGES_API_URL, { headers });
      const text = await response.text();
      if (!response.ok) throw new Error(text);

      const json = JSON.parse(text);
      const rows: any[] = Array.isArray(json) ? json : json.value || json.results || [];
      const packages: PackageItem[] = rows.map((p: any) => ({
        id: p.id,
        code: p.code || '',
        product: p.product,
        product_name: p.product_name || '',
        product_code: p.product_code || '',
        name: p.name || '',
        description: p.description || '',
        price: p.price || '',
        tax_percent: p.tax_percent || '',
        created_by: p.created_by || '',
        created_at: p.created_at || '',
        updated_at: p.updated_at || '',
      }));
      setPackageList(packages);

      const groupedMap = new Map<number, ProductGroup>();
      packages.forEach((pkg) => {
        if (!groupedMap.has(pkg.product)) {
          groupedMap.set(pkg.product, {
            productId: pkg.product,
            productName: pkg.product_name,
            productCode: pkg.product_code,
            packages: [],
          });
        }
        groupedMap.get(pkg.product)?.packages.push(pkg);
      });
      const groups = Array.from(groupedMap.values()).sort(
        (a, b) => a.productName.localeCompare(b.productName)
      );
      setPackageGroups(groups);
      setPackagesLoaded(true);
    } catch (err) {
      console.log('fetchPackageList error:', err);
    } finally {
      setLoadingPackages(false);
    }
  }

  const selectProductForRequirement = (group: ProductGroup) => {
    setSelectedProduct(group);
    setSelectedPackage(null);
    setPackageDescription('');
  };

  const selectPackageForRequirement = (pkg: PackageItem) => {
    setSelectedPackage(pkg);
    setPackageDescription(pkg.description || '');
  };

  const applySelectedRequirement = () => {
    const parts: string[] = [];
    if (selectedProduct) {
      parts.push(selectedProduct.productName);
    }
    if (selectedPackage) {
      parts.push(selectedPackage.name);
    }
    if (packageDescription) {
      parts.push(packageDescription);
    }
    if (parts.length > 0) {
      const reqName = parts.filter((p) => p)                    .join(' - ')
                    .replace(/\s*\([^)]*\)\s*/g, '');
      const cleanName = reqName.trim();
      if (cleanName && !selectedRequirements.includes(cleanName)) {
        setSelectedRequirements((prev) => [...prev, cleanName]);
        if (selectedProduct?.productName) {
          setSelectedProducts((prev) =>
            prev.includes(selectedProduct.productName) ? prev : [...prev, selectedProduct.productName]
          );
          setSelectedProductIds((prev) => {
            const productId = String(selectedProduct.productId);
            return prev.includes(productId) ? prev : [...prev, productId];
          });
        }
      }
    }
    setSelectedProduct(null);
    setSelectedPackage(null);
    setPackageDescription('');
    setShowRequirementsModal(false);
  };

  /* ── Campaigns ── */
  async function fetchCampaigns() {
    try {
      setLoadingCampaigns(true);
      const headers = await authHeaders();
      const response = await fetch(`${CAMPAIGNS_API_URL}?page_size=${CAMPAIGNS_PAGE_SIZE}`, { headers });
      const text = await response.text();
      if (!response.ok) throw new Error(text);

      const json = JSON.parse(text);
      const rows: any[] = Array.isArray(json) ? json : json.results || [];
      const formatted: CampaignOption[] = rows.map((c: any) => ({
        id: c.id,
        campaignId: c.campaign_id || '',
        name: c.campaign_name || '',
        softwareName: c.software_name || '',
        location: c.campaign_location || '',
        status: c.status || '',
      }));
      formatted.sort((a, b) => a.campaignId.localeCompare(b.campaignId) || a.name.localeCompare(b.name));
      setCampaigns(formatted);
      setCampaignsLoaded(true);
    } catch (err) {
      console.log('fetchCampaigns error:', err);
    } finally {
      setLoadingCampaigns(false);
    }
  }

  // The campaign list is only needed once Type = Campaign, so it loads then.
  useEffect(() => {
    if (type === 'Campaign' && !campaignsLoaded && !campaignsRequested.current) {
      campaignsRequested.current = true;
      fetchCampaigns();
    }
  }, [type, campaignsLoaded]);

  // Campaign id is the primary search key; name/software are fallbacks so a
  // partially-remembered value still finds the row.
  const filteredCampaigns = useMemo(() => {
    const q = campaignQuery.trim().toLowerCase();
    if (!q) return campaigns;
    return campaigns.filter(
      (c) =>
        c.campaignId.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.softwareName.toLowerCase().includes(q)
    );
  }, [campaigns, campaignQuery]);

  // Picking a campaign id immediately shows the list values, then re-reads the
  // single record so campaign name and software come straight from the server.
  // Returns the campaign that ended up selected so callers can use it directly
  // instead of reading state that hasn't re-rendered yet.
  const selectCampaign = async (c: CampaignOption): Promise<CampaignOption> => {
    setSelectedCampaign(c);
    setCampaignQuery('');
    setShowCampaignDropdown(false);
    setLoadingCampaignDetail(true);
    let detail = c;
    try {
      const headers = await authHeaders();
      const response = await fetch(`${CAMPAIGNS_API_URL}${c.id}/`, { headers });
      const text = await response.text();
      if (!response.ok) throw new Error(text);

      const row = JSON.parse(text);
      detail = {
        id: row.id ?? c.id,
        campaignId: row.campaign_id || c.campaignId,
        name: row.campaign_name || c.name,
        softwareName: row.software_name || c.softwareName,
        location: row.campaign_location || c.location,
        status: row.status || c.status,
      };
      setSelectedCampaign(detail);
      setCampaigns((prev) => prev.map((x) => (String(x.id) === String(detail.id) ? detail : x)));
    } catch (err) {
      console.log('fetchCampaignDetail error:', err);
      // Keep the list values if the detail lookup fails.
    } finally {
      setLoadingCampaignDetail(false);
    }
    return detail;
  };

  const clearCampaign = () => {
    setSelectedCampaign(null);
    setCampaignQuery('');
    setShowCampaignDropdown(false);
  };

  // Lets someone paste/type a known campaign id and still get the name and
  // software pulled in, without having to tap the dropdown row.
  const resolveCampaignById = async (rawId: string): Promise<CampaignOption | null> => {
    const wanted = rawId.trim().toLowerCase();
    if (!wanted) return null;
    const exact = campaigns.find((c) => c.campaignId.toLowerCase() === wanted);
    // Fall back to a prefix match, but only when it points at a single campaign.
    const prefixHits = campaigns.filter((c) => c.campaignId.toLowerCase().startsWith(wanted));
    const hit = exact || (prefixHits.length === 1 ? prefixHits[0] : undefined);
    if (!hit) return null;
    return await selectCampaign(hit);
  };

  /* ── Form reset / open / close ── */
  const resetForm = () => {
    setType('');
    setAgent('');
    setCustomerName('');
    setPlace('');
    setPhone('');
    setNotes('');
    setSelectedRequirements([]);
    setSelectedProducts([]);
    setSelectedProductIds([]);
    setAgentQuery('');
    setShowAgentDropdown(false);
    setShowRequirementsModal(false);
    clearCampaign();
    setEditingEntryId(null);
  };

  const openAddForm = () => {
    resetForm();
    fetchAgents();
    fetchPackageList();
    setShowAddModal(true);
  };

  const closeAddForm = () => {
    setShowAddModal(false);
    resetForm();
  };

  /* ── Detail popup ── */
  const openDetail = (entry: ErpEntry) => {
    setSelectedEntry(entry);
    setShowDetailModal(true);
  };

  const closeDetail = () => {
    setShowDetailModal(false);
    setSelectedEntry(null);
  };

  /* ── Edit ── */
  const openEdit = (entry: ErpEntry) => {
    setEditingEntryId(entry.id);
    setType(entry.type || '');
    setAgent(entry.agent || '');
    setCustomerName(entry.customerName || '');
    setPlace(entry.place || '');
    setPhone(entry.phone || '');
    setNotes(entry.notes || '');
    setSelectedRequirements(entry.requirements || []);
    setSelectedProducts(
      entry.product?.length
        ? entry.product
        : (entry.requirements || [])
            .map((requirement) => requirement.split(/\s+-\s+/)[0].trim())
            .filter(Boolean)
            .filter((product, index, products) => products.indexOf(product) === index)
    );
    setSelectedProductIds(entry.productId ? [entry.productId] : []);
    setShowDetailModal(false);
    fetchAgents();
    fetchPackageList();
    if (entry.type === 'Campaign') {
      setSelectedCampaign({
        id: entry.campaignId,
        campaignId: entry.campaignId,
        name: entry.campaignName || '',
        softwareName: entry.campaignSoftware || '',
      });
      fetchCampaigns();
    }
    setShowAddModal(true);
  };

  /* ── Submit (create or update) ── */
  const handleSubmit = async () => {
    if (!type) {
      Alert.alert('Validation Error', 'Please select a type.');
      return;
    }
    // A fully-typed campaign id is enough — resolve it before giving up.
    let campaign = selectedCampaign;
    if (type === 'Campaign' && !campaign) {
      campaign = await resolveCampaignById(campaignQuery);
      if (!campaign) {
        Alert.alert('Validation Error', 'Please select a campaign.');
        return;
      }
    }
    if (!customerName.trim()) {
      Alert.alert('Validation Error', 'Please enter the customer name.');
      return;
    }
    if (!phone.trim()) {
      Alert.alert('Validation Error', 'Please enter the phone number.');
      return;
    }
    if (!place.trim()) {
      Alert.alert('Validation Error', 'Please enter the place.');
      return;
    }
    if (!selectedRequirements.length) {
      Alert.alert('Validation Error', 'Please select at least one requirement.');
      return;
    }

    const isEdit = !!editingEntryId;

    try {
      setLoading(true);

      const formData = new FormData();
      formData.append('agent', agent.trim());
      formData.append('type', type);
      formData.append('campaign_id', campaign ? campaign.campaignId : '');
      formData.append('campaign_name', campaign ? campaign.name : '');
      formData.append('campaign_software', campaign ? campaign.softwareName : '');
      formData.append('customer_name', customerName.trim());
      formData.append('place', place.trim());
      formData.append('phone', phone.trim());
      // The web API's product column is backed by the product relation, so it
      // expects the product's numeric ID rather than its display name.
      if (selectedProductIds.length) {
        formData.append('product', selectedProductIds[0]);
      }
      formData.append('requirements', JSON.stringify(selectedRequirements));
      formData.append('notes', notes.trim());
      formData.append('created_by', myUsername || myUserId);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
      const headers = await authHeaders();

      const url = isEdit ? `${TRELLISCO_ERP_API_URL}${editingEntryId}/` : TRELLISCO_ERP_API_URL;
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
        Alert.alert(`Server Error (${response.status})`, responseText.substring(0, 900));
        return;
      }

      closeAddForm();
      await fetchEntries();
    } catch (err) {
      console.error(err);
      Alert.alert(
        'Error',
        isEdit ? 'Failed to update details. Please try again.' : 'Failed to save details. Please try again.'
      );
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color="#1C1B17" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trellisco ERP</Text>
        <TouchableOpacity onPress={openAddForm} style={styles.addBtn} activeOpacity={0.7}>
          <Ionicons name="add" size={24} color="#1C1B17" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={myEntries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F5C451" />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="globe-outline" size={40} color="#C2BBA8" />
            <Text style={styles.emptyStateText}>No ERP details yet</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTopRow}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.customerName || 'Unknown customer'}
              </Text>
              <Text style={styles.cardDate}>{item.date ? new Date(item.date).toLocaleDateString() : ''}</Text>
            </View>

            <View style={styles.cardBottomRow}>
              <View style={styles.cardInfoCol}>
                {!!item.type && (
                  <View style={styles.cardTagRow}>
                    <Ionicons name="pricetag-outline" size={13} color="#B5854A" />
                    <Text style={styles.cardPurpose} numberOfLines={1}>
                      {item.type === 'Campaign' && item.campaignId ? `Campaign · ${item.campaignId}` : item.type}
                    </Text>
                  </View>
                )}
                {!!item.place && (
                  <View style={styles.cardTagRow}>
                    <Ionicons name="location-outline" size={13} color="#A39A85" />
                    <Text style={styles.cardMetaText} numberOfLines={1}>
                      {item.place}
                    </Text>
                  </View>
                )}
                {!!item.ticketNo && (
                  <View style={styles.cardTagRow}>
                    <Ionicons name="ticket-outline" size={13} color="#A39A85" />
                    <Text style={styles.cardMetaText} numberOfLines={1}>
                      {item.ticketNo}
                    </Text>
                  </View>
                )}
              </View>

              <TouchableOpacity style={styles.eyeBtn} onPress={() => openDetail(item)} activeOpacity={0.7}>
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
                {selectedEntry?.customerName || 'Trellisco ERP'}
              </Text>
              <View style={styles.detailHeaderActions}>
                <TouchableOpacity
                  style={styles.detailIconBtn}
                  onPress={() => selectedEntry && openEdit(selectedEntry)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="create-outline" size={20} color="#1C1B17" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.detailIconBtn} onPress={closeDetail} activeOpacity={0.7}>
                  <Ionicons name="close" size={20} color="#1C1B17" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={styles.detailBody} contentContainerStyle={{ paddingBottom: 24 }}>
              {selectedEntry && (
                <>
                  <DetailRow icon="ticket-outline" label="Ticket No" value={selectedEntry.ticketNo} />
                  <DetailRow icon="pricetag-outline" label="Type" value={selectedEntry.type} />
                  {selectedEntry.campaignId ? (
                    <DetailRow
                      icon="megaphone-outline"
                      label="Campaign"
                      value={[
                        selectedEntry.campaignId,
                        selectedEntry.campaignName,
                        selectedEntry.campaignSoftware,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    />
                  ) : null}
                  <DetailRow icon="person-circle-outline" label="Agent" value={selectedEntry.agent} />
                  <DetailRow
                    icon="person-outline"
                    label="Customer Name"
                    value={selectedEntry.customerName}
                  />
                  <DetailRow icon="location-outline" label="Place" value={selectedEntry.place} />
                  <DetailRow icon="call-outline" label="Phone" value={selectedEntry.phone} />
                  {!!selectedEntry.requirements?.length && (
                    <DetailRow
                      icon="list-outline"
                      label="Product"
                      value={selectedEntry.requirements.join('\n')}
                    />
                  )}
                  {!!selectedEntry.notes && (
                    <DetailRow icon="document-text-outline" label="Notes" value={selectedEntry.notes} />
                  )}
                  <DetailRow
                    icon="calendar-outline"
                    label="Date"
                    value={selectedEntry.date ? new Date(selectedEntry.date).toLocaleString() : ''}
                  />
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
            <TouchableOpacity onPress={closeAddForm} style={styles.backBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={22} color="#1C1B17" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{editingEntryId ? 'Edit Details' : 'New Details'}</Text>
            <View style={{ width: 44 }} />
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
              {/* ── Type ── */}
              <Text style={styles.label}>TYPE</Text>
              <View style={styles.pillRow}>
                {ERP_TYPE_OPTIONS.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.pill, type === t && styles.pillActive]}
                    onPress={() => {
                      setType(t);
                      if (t !== 'Campaign') clearCampaign();
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.pillText, type === t && styles.pillTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* ── Campaign (only when Type = Campaign) ── */}
              {type === 'Campaign' && (
                <>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>CAMPAIGN ID</Text>
                    {(loadingCampaigns || loadingCampaignDetail) && (
                      <ActivityIndicator size="small" color="#A39A85" />
                    )}
                  </View>

                  {selectedCampaign ? (
                    <View style={styles.campaignChip}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.campaignChipId}>{selectedCampaign.campaignId}</Text>
                        <Text style={styles.campaignChipSub}>
                          {[selectedCampaign.name, selectedCampaign.softwareName].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={clearCampaign}>
                        <Ionicons name="close-circle" size={22} color="#A39A85" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <>
                      <TextInput
                        style={styles.input}
                        placeholder="Search campaign id…"
                        placeholderTextColor="#A39A85"
                        value={campaignQuery}
                        onChangeText={(text) => {
                          setCampaignQuery(text);
                          setShowCampaignDropdown(true);
                        }}
                        onFocus={() => setShowCampaignDropdown(true)}
                        onEndEditing={() => resolveCampaignById(campaignQuery)}
                        autoCapitalize="characters"
                      />
                      {showCampaignDropdown && (
                        <View style={styles.dropdownBox}>
                          {loadingCampaigns ? (
                            <View style={styles.dropdownEmpty}>
                              <ActivityIndicator size="small" color="#A39A85" />
                            </View>
                          ) : filteredCampaigns.length === 0 ? (
                            <View style={styles.dropdownEmpty}>
                              <Text style={styles.dropdownEmptyText}>
                                {campaignsLoaded ? 'No matching campaigns' : 'Loading campaigns…'}
                              </Text>
                            </View>
                          ) : (
                            <ScrollView
                              style={styles.dropdownScroll}
                              nestedScrollEnabled
                              keyboardShouldPersistTaps="handled"
                            >
                              {filteredCampaigns.map((c) => (
                                <TouchableOpacity
                                  key={String(c.id)}
                                  style={styles.dropdownItem}
                                  onPress={() => selectCampaign(c)}
                                >
                                  <Text style={styles.dropdownItemTitle}>{c.campaignId}</Text>
                                  <Text style={styles.dropdownItemSub}>
                                    {[c.name, c.softwareName].filter(Boolean).join(' · ')}
                                  </Text>
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

              {/* ── Agent ── */}
              <View style={styles.labelRow}>
                <Text style={styles.label}>AGENT</Text>
                {loadingAgents && <ActivityIndicator size="small" color="#A39A85" />}
              </View>
              <TouchableOpacity
                style={styles.selectInput}
                onPress={() => setShowAgentDropdown((prev) => !prev)}
              >
                <Text style={{ fontSize: 15, fontWeight: '500', color: agent ? '#1C1B17' : '#A39A85' }}>
                  {agent || 'Select agent'}
                </Text>
                <Ionicons name={showAgentDropdown ? 'chevron-up' : 'chevron-down'} size={18} color="#A39A85" />
              </TouchableOpacity>
              {showAgentDropdown && (
                <View style={styles.dropdownBox}>
                  <TextInput
                    style={[styles.input, { marginBottom: 6 }]}
                    placeholder="Search agent…"
                    placeholderTextColor="#A39A85"
                    value={agentQuery}
                    onChangeText={setAgentQuery}
                    autoFocus
                  />
                  {loadingAgents ? (
                    <View style={styles.dropdownEmpty}>
                      <ActivityIndicator size="small" color="#A39A85" />
                    </View>
                  ) : filteredAgents.length === 0 ? (
                    <View style={styles.dropdownEmpty}>
                      <Text style={styles.dropdownEmptyText}>
                        {agentsLoaded ? 'No matching agents' : 'Loading agents…'}
                      </Text>
                    </View>
                  ) : (
                    <ScrollView style={styles.dropdownScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      {filteredAgents.map((a) => (
                        <TouchableOpacity key={String(a.id)} style={styles.dropdownItem} onPress={() => selectAgent(a)}>
                          <Text style={styles.dropdownItemTitle}>{a.name}</Text>
                          <Text style={styles.dropdownItemSub}>
                            {[a.firm, a.location, a.phone].filter(Boolean).join(' · ')}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                </View>
              )}

              {/* ── Customer name ── */}
              <Text style={styles.label}>CUSTOMER NAME</Text>
              <TextInput
                style={styles.input}
                placeholder="Customer name"
                placeholderTextColor="#A39A85"
                value={customerName}
                onChangeText={setCustomerName}
              />

              {/* ── Place ── */}
              <Text style={styles.label}>PLACE</Text>
              <TextInput
                style={styles.input}
                placeholder="Place / location"
                placeholderTextColor="#A39A85"
                value={place}
                onChangeText={setPlace}
              />

              {/* ── Phone ── */}
              <Text style={styles.label}>PHONE NO</Text>
              <TextInput
                style={styles.input}
                placeholder="Phone number"
                placeholderTextColor="#A39A85"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />

              {/* ── Requirements ── */}
              <View style={styles.labelRow}>
                <Text style={styles.label}>REQUIREMENTS</Text>
                {loadingPackages && <ActivityIndicator size="small" color="#A39A85" />}
              </View>
              <TouchableOpacity style={styles.selectInput} onPress={() => setShowRequirementsModal(true)}>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: '500',
                    color: selectedRequirements.length ? '#1C1B17' : '#A39A85',
                  }}
                >
                  {selectedRequirements.length ? `${selectedRequirements.length} selected` : 'Select requirements'}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#A39A85" />
              </TouchableOpacity>
              {!!selectedRequirements.length && (
                <View style={{ marginTop: 8, gap: 6 }}>
                  {selectedRequirements.map((req, idx) => (
                    <View key={idx} style={styles.requirementChip}>
                      <Text style={styles.requirementChipText} numberOfLines={2}>{req.replace(/\s*\([^)]*\)\s*/g, '').replace(/ - $/g, '').trim()}</Text>
                      <TouchableOpacity
                        onPress={() => {
                          const remaining = selectedRequirements.filter((_, i) => i !== idx);
                          const removedProduct = req.split(/\s+-\s+/)[0].trim();
                          const productStillSelected = remaining.some(
                            (requirement) =>
                              requirement === removedProduct || requirement.startsWith(`${removedProduct} - `)
                          );
                          setSelectedRequirements(remaining);
                          setSelectedProducts((prev) =>
                            productStillSelected ? prev : prev.filter((product) => product !== removedProduct)
                          );
                          if (!productStillSelected) {
                            setSelectedProductIds((prev) =>
                              prev.filter((_, productIndex) => selectedProducts[productIndex] !== removedProduct)
                            );
                          }
                        }}
                      >
                        <Ionicons name="close-circle" size={18} color="#A39A85" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
              {!!selectedRequirements.length && (
                <TouchableOpacity
                  onPress={() => {
                    setSelectedRequirements([]);
                    setSelectedProducts([]);
                    setSelectedProductIds([]);
                  }}
                  style={styles.clearBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.clearBtnText}>Clear All</Text>
                </TouchableOpacity>
              )}

              {/* ── Notes ── */}
              <Text style={styles.label}>NOTES</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Additional notes (optional)"
                placeholderTextColor="#A39A85"
                value={notes}
                onChangeText={setNotes}
                multiline
              />

              {/* ── Actions ── */}
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.cancelBtn, loading && styles.btnDisabled]}
                  onPress={closeAddForm}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.submitBtn, loading && styles.btnDisabled]}
                  onPress={handleSubmit}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#F5C451" />
                  ) : (
                    <Text style={styles.submitBtnText}>{editingEntryId ? 'Update' : 'Submit'}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>

          {/* ── Requirements picker ── */}
          <Modal
            visible={showRequirementsModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowRequirementsModal(false)}
          >
            <TouchableOpacity
              style={styles.sheetOverlay}
              activeOpacity={1}
              onPress={() => setShowRequirementsModal(false)}
            >
              <View style={styles.sheet}>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>Requirements</Text>
                  <TouchableOpacity onPress={() => setShowRequirementsModal(false)}>
                    <Ionicons name="close" size={20} color="#1C1B17" />
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.sheetBody} nestedScrollEnabled>
                  {loadingPackages ? (
                    <ActivityIndicator size="small" color="#A39A85" style={{ marginTop: 16 }} />
                  ) : !packageGroups.length ? (
                    <Text style={styles.sheetEmptyText}>
                      {packagesLoaded ? 'No packages available' : 'Loading packages…'}
                    </Text>
                  ) : (
                    <>
                      <View style={styles.sheetSection}>
                        <Text style={styles.sheetSectionLabel}>PRODUCT</Text>
                        {packageGroups.map((g) => (
                          <TouchableOpacity
                            key={g.productId}
                            style={[styles.dropdownItem, styles.checkRow]}
                            onPress={() => selectProductForRequirement(g)}
                          >
                            <Ionicons
                              name={selectedProduct?.productId === g.productId ? 'radio-button-on' : 'radio-button-off'}
                              size={20}
                              color={selectedProduct?.productId === g.productId ? '#F5C451' : '#A39A85'}
                            />
                            <Text style={styles.dropdownItemTitle}>{g.productName}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {selectedProduct && selectedProduct.packages.length > 0 && (
                        <View style={styles.sheetSection}>
                          <Text style={styles.sheetSectionLabel}>PACKAGE</Text>
                          {selectedProduct.packages.map((pkg) => (
                            <TouchableOpacity
                              key={pkg.id}
                              style={[styles.dropdownItem, styles.checkRow]}
                              onPress={() => selectPackageForRequirement(pkg)}
                            >
                              <Ionicons
                                name={selectedPackage?.id === pkg.id ? 'radio-button-on' : 'radio-button-off'}
                                size={20}
                                color={selectedPackage?.id === pkg.id ? '#F5C451' : '#A39A85'}
                              />
                              <Text style={styles.dropdownItemTitle}>{pkg.name}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}

                      {selectedPackage && (
                        <View style={styles.sheetSection}>
                          <Text style={styles.sheetSectionLabel}>DESCRIPTION</Text>
                          <View style={[styles.input, styles.textArea]}>
                            <Text style={{ fontSize: 14, color: '#1C1B17' }}>{packageDescription || '(No description)'}</Text>
                          </View>
                        </View>
                      )}
                    </>
                  )}
                </ScrollView>
                <TouchableOpacity
                  style={styles.sheetDoneBtn}
                  onPress={applySelectedRequirement}
                  activeOpacity={0.8}
                >
                  <Text style={styles.sheetDoneBtnText}>Add</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.cancelBtn, { marginTop: 8 }]}
                  onPress={() => {
                    setSelectedProduct(null);
                    setSelectedPackage(null);
                    setPackageDescription('');
                    setShowRequirementsModal(false);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelBtnText}>Close</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>
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
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5C451',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#1C1B17' },
  listContent: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },

  /* Compact card: title/date row + type/place + eye icon */
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
  cardDate: { fontSize: 11, color: '#A39A85', fontWeight: '600' },
  cardBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardInfoCol: { flex: 1, gap: 3 },
  cardTagRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardPurpose: { fontSize: 12, fontWeight: '700', color: '#B5854A', flexShrink: 1 },
  cardMetaText: { fontSize: 12, color: '#A39A85', fontWeight: '500', flexShrink: 1 },
  eyeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F7F5EE',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyStateText: { fontSize: 14, fontWeight: '600', color: '#A39A85' },

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

  /* Add / Edit modal */
  modalRoot: { flex: 1, backgroundColor: '#FAF9F6' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EAD8',
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#1C1B17' },
  form: { padding: 20, gap: 6, paddingBottom: 48 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5C584F',
    letterSpacing: 1.2,
    marginTop: 14,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F7F5EE',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: '500',
    color: '#1C1B17',
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  selectInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F7F5EE',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },

  /* Type pills */
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  pill: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E8E3D9',
    backgroundColor: '#FFFFFF',
  },
  pillActive: { borderColor: '#F5C451', backgroundColor: '#FFF9E9' },
  pillText: { fontSize: 13, fontWeight: '700', color: '#1C1B17' },
  pillTextActive: { color: '#B5854A' },

  clearBtn: { paddingTop: 8, alignSelf: 'flex-end' },
  clearBtnText: { color: '#A39A85', fontWeight: '700', fontSize: 13 },

  /* Actions */
  actionsRow: { flexDirection: 'row', gap: 12, marginTop: 28 },
  submitBtn: {
    flex: 1,
    backgroundColor: '#1C1B17',
    borderRadius: 50,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: { fontSize: 16, fontWeight: '800', color: '#F5C451' },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#F5F4F0',
    borderRadius: 50,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E8E3D9',
  },
  cancelBtnText: { fontSize: 16, fontWeight: '800', color: '#7E7767' },
  btnDisabled: { opacity: 0.6 },

  /* Dropdowns */
  dropdownBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8E3D9',
    marginTop: 6,
    overflow: 'hidden',
  },
  dropdownScroll: { maxHeight: 220 },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EAD8',
  },
  dropdownItemTitle: { fontSize: 14, fontWeight: '700', color: '#1C1B17' },
  dropdownItemSub: { fontSize: 12, color: '#6E695F', marginTop: 2 },
  dropdownEmpty: { paddingVertical: 16, alignItems: 'center' },
  dropdownEmptyText: { fontSize: 12, color: '#A39A85', fontWeight: '600' },

  /* Selected campaign chip */
  campaignChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F0EAD8',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  campaignChipId: { fontSize: 14, fontWeight: '800', color: '#1C1B17' },
  campaignChipSub: { fontSize: 12, color: '#6E695F', marginTop: 2 },

  /* Requirements sheet */
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(28,27,23,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EAD8',
  },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: '#1C1B17' },
  sheetBody: { paddingTop: 8, maxHeight: 420 },
  sheetSection: { marginTop: 14 },
  sheetSectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#A39A85',
    letterSpacing: 1,
    marginBottom: 8,
  },
  sheetEmptyText: { fontSize: 15, fontWeight: '500', color: '#A39A85', marginTop: 16 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sheetDoneBtn: {
    marginTop: 14,
    backgroundColor: '#1C1B17',
    borderRadius: 50,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sheetDoneBtnText: { fontSize: 15, fontWeight: '800', color: '#F5C451' },
  requirementChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0EAD8',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  requirementChipText: {
    flex: 1,
    fontSize: 12,
    color: '#1C1B17',
    fontWeight: '600',
  },
});
