import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

interface ProductBatch {
  salesprice: string;
  secondprice: string | null;
  thirdprice: string | null;
  fourthprice: string | null;
  nlc1: string | null;
  quantity: string;
  barcode: string;
  bmrp: string | null;
  cost: string;
  expirydate: string | null;
  modified: string;
  modifiedtime: string;
  settings: string;
}

interface Product {
  code: string;
  name: string;
  catagory: string;
  unit: string;
  taxcode: string;
  company: string;
  product: string;
  brand: string;
  text6: string;
  withinstate: string;
  client_id: string;
  productbatches: ProductBatch[];
  photos: { url2: string }[];
  department_name: string | null;
}

const API_URL = 'https://accmaster.imcbs.com/api/sync/acc-product/';
const QUANTITY_FILTERS = [
  'All Quantities',
  'In Stock (> 0)',
  'Out of Stock (0)',
  'Low Stock (< 10)',
] as const;
type QuantityFilter = (typeof QUANTITY_FILTERS)[number];
const ROW_OPTIONS = [15, 30, 50, 100];

const getTotalQuantity = (p: Product) =>
  p.productbatches.reduce((sum, b) => sum + (parseFloat(b.quantity) || 0), 0);

export default function StockReportProducts() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { clientId, companyName } = route.params || {};

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const [quantityFilter, setQuantityFilter] = useState<QuantityFilter>('All Quantities');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [rowLimit, setRowLimit] = useState(15);
  const [showRowDropdown, setShowRowDropdown] = useState(false);

  const fetchProducts = async () => {
    try {
      setError(null);
      const response = await fetch(API_URL, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('Failed to load stock data');
      const data = await response.json();
      const allProducts: Product[] = data.products || [];
      const filtered = allProducts.filter((p) => p.client_id === clientId);
      setProducts(filtered);
    } catch (err) {
      setError('Unable to load stock report. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProducts();
  };

  const filteredProducts = useMemo(() => {
    let result = products;

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.productbatches.some((b) => b.barcode.toLowerCase().includes(q))
      );
    }

    if (quantityFilter === 'In Stock (> 0)') {
      result = result.filter((p) => getTotalQuantity(p) > 0);
    } else if (quantityFilter === 'Out of Stock (0)') {
      result = result.filter((p) => getTotalQuantity(p) === 0);
    } else if (quantityFilter === 'Low Stock (< 10)') {
      result = result.filter((p) => getTotalQuantity(p) < 10);
    }

    return result;
  }, [products, searchQuery, quantityFilter]);

  const visibleProducts = filteredProducts.slice(0, rowLimit);

  const openDetail = (product: Product) => {
    setSelectedProduct(product);
    setDetailVisible(true);
  };

  const closeDetail = () => {
    setDetailVisible(false);
    setSelectedProduct(null);
  };

  const closeDropdowns = () => {
    setShowFilterDropdown(false);
    setShowRowDropdown(false);
  };

  const renderItem = ({ item }: { item: Product }) => {
    const photoUrl = item.photos && item.photos.length > 0 ? item.photos[0].url2 : null;
    return (
      <View style={styles.productCard}>
        {photoUrl ? (
          <TouchableOpacity onPress={() => setPreviewUri(photoUrl)} activeOpacity={0.85}>
            <Image source={{ uri: photoUrl }} style={styles.productImage} />
          </TouchableOpacity>
        ) : (
          <View style={styles.productImagePlaceholder}>
            <Ionicons name="cube-outline" size={22} color="#A39A85" />
          </View>
        )}
        <View style={styles.productTextContainer}>
          <Text style={styles.productName} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.productCode}>Code: {item.code}</Text>
        </View>
        <TouchableOpacity style={styles.eyeButton} onPress={() => openDetail(item)} activeOpacity={0.7}>
          <Ionicons name="eye-outline" size={20} color="#B5854A" />
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#D4A574" />
          <Text style={styles.loadingText}>Loading stock report...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color="#1C1B17" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {companyName || 'Stock Report'}
          </Text>
          <Text style={styles.headerSubtitle}>
            {visibleProducts.length} of {filteredProducts.length} products
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color="#A39A85" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search product, code, brand..."
          placeholderTextColor="#A39A85"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color="#C2BBA8" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.controlsRow}>
        <View style={styles.dropdownWrapper}>
          <TouchableOpacity
            style={styles.dropdownButton}
            onPress={() => {
              setShowFilterDropdown((v) => !v);
              setShowRowDropdown(false);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.dropdownButtonText} numberOfLines={1}>
              {quantityFilter}
            </Text>
            <Ionicons name="chevron-down" size={14} color="#7E7767" />
          </TouchableOpacity>
          {showFilterDropdown && (
            <View style={styles.dropdownMenu}>
              {QUANTITY_FILTERS.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={styles.dropdownOption}
                  onPress={() => {
                    setQuantityFilter(option);
                    setShowFilterDropdown(false);
                  }}
                >
                  <Text
                    style={[
                      styles.dropdownOptionText,
                      option === quantityFilter && styles.dropdownOptionTextActive,
                    ]}
                  >
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.dropdownWrapper}>
          <TouchableOpacity
            style={styles.dropdownButton}
            onPress={() => {
              setShowRowDropdown((v) => !v);
              setShowFilterDropdown(false);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.dropdownButtonText}>Show {rowLimit} rows</Text>
            <Ionicons name="chevron-down" size={14} color="#7E7767" />
          </TouchableOpacity>
          {showRowDropdown && (
            <View style={styles.dropdownMenu}>
              {ROW_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={styles.dropdownOption}
                  onPress={() => {
                    setRowLimit(option);
                    setShowRowDropdown(false);
                  }}
                >
                  <Text
                    style={[
                      styles.dropdownOptionText,
                      option === rowLimit && styles.dropdownOptionTextActive,
                    ]}
                  >
                    Show {option} rows
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={visibleProducts}
        keyExtractor={(item, index) => `${item.code}-${index}`}
        renderItem={renderItem}
        contentContainerStyle={[styles.listContent, { paddingBottom: 32 + insets.bottom }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D4A574" />}
        onScrollBeginDrag={closeDropdowns}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="cube-outline" size={40} color="#C2BBA8" />
            <Text style={styles.emptyText}>No products found</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      <ProductBatchesModal
        visible={detailVisible}
        product={selectedProduct}
        onClose={closeDetail}
        onPreviewImage={setPreviewUri}
      />

      <ImagePreviewModal uri={previewUri} onClose={() => setPreviewUri(null)} />
    </SafeAreaView>
  );
}

function ProductBatchesModal({
  visible,
  product,
  onClose,
  onPreviewImage,
}: {
  visible: boolean;
  product: Product | null;
  onClose: () => void;
  onPreviewImage: (uri: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (visible) {
      setSearch('');
    }
  }, [visible]);

  const batches = product?.productbatches || [];

  const filteredBatches = useMemo(() => {
    if (!search.trim()) return batches;
    const q = search.trim().toLowerCase();
    return batches.filter((b) => b.barcode.toLowerCase().includes(q));
  }, [batches, search]);

  if (!product) return null;

  const photoUrl = product.photos && product.photos.length > 0 ? product.photos[0].url2 : null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        style={modalStyles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[modalStyles.sheet, { paddingBottom: 20 + insets.bottom }]}>
          <View style={modalStyles.handle} />

          <View style={modalStyles.header}>
            {photoUrl ? (
              <TouchableOpacity onPress={() => onPreviewImage(photoUrl)} activeOpacity={0.85}>
                <Image source={{ uri: photoUrl }} style={modalStyles.headerImage} />
              </TouchableOpacity>
            ) : (
              <View style={modalStyles.headerImagePlaceholder}>
                <Ionicons name="cube-outline" size={20} color="#A39A85" />
              </View>
            )}
            <View style={modalStyles.headerTextContainer}>
              <Text style={modalStyles.headerTitle} numberOfLines={2}>
                {product.name}
              </Text>
              <Text style={modalStyles.headerSubtitle}>Code: {product.code}</Text>
            </View>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Ionicons name="close-circle" size={24} color="#A39A85" />
            </TouchableOpacity>
          </View>

          <View style={modalStyles.statsRow}>
            <View style={modalStyles.statBox}>
              <Text style={modalStyles.statValue}>{batches.length}</Text>
              <Text style={modalStyles.statLabel}>Total Barcodes</Text>
            </View>
            <View style={modalStyles.statBox}>
              <Text style={modalStyles.statValue}>{filteredBatches.length}</Text>
              <Text style={modalStyles.statLabel}>Matching</Text>
            </View>
          </View>

          <View style={modalStyles.searchBox}>
            <Ionicons name="search" size={16} color="#A39A85" style={{ marginRight: 6 }} />
            <TextInput
              style={modalStyles.searchInput}
              placeholder="Search barcode..."
              placeholderTextColor="#A39A85"
              value={search}
              onChangeText={setSearch}
            />
          </View>

          <View style={modalStyles.tableHeader}>
            <Text style={[modalStyles.tableHeaderText, { flex: 2.2 }]}>Barcode</Text>
            <Text style={[modalStyles.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Qty</Text>
            <Text style={[modalStyles.tableHeaderText, { flex: 1.3, textAlign: 'right' }]}>Price</Text>
          </View>

          <FlatList
            data={filteredBatches}
            keyExtractor={(item, index) => `${item.barcode}-${index}`}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 8 }}
            renderItem={({ item, index }) => {
              const qty = parseFloat(item.quantity);
              return (
                <View style={[modalStyles.tableRow, index % 2 === 1 && modalStyles.tableRowAlt]}>
                  <Text style={[modalStyles.tableCell, { flex: 2.2 }]} numberOfLines={1}>
                    {item.barcode}
                  </Text>
                  <Text
                    style={[
                      modalStyles.tableCell,
                      { flex: 1, textAlign: 'right', fontWeight: '700' },
                      qty <= 0 ? modalStyles.qtyZero : qty < 10 ? modalStyles.qtyLow : modalStyles.qtyOk,
                    ]}
                  >
                    {item.quantity}
                  </Text>
                  <Text style={[modalStyles.tableCell, { flex: 1.3, textAlign: 'right' }]}>
                    {parseFloat(item.salesprice || '0').toFixed(2)}
                  </Text>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={modalStyles.emptyContainer}>
                <Text style={modalStyles.emptyText}>No matching barcodes</Text>
              </View>
            }
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ImagePreviewModal({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={previewStyles.overlay} onPress={onClose}>
        <TouchableOpacity
          style={[previewStyles.closeButton, { top: insets.top + 12 }]}
          onPress={onClose}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={26} color="#FFFFFF" />
        </TouchableOpacity>
        {uri && <Image source={{ uri }} style={previewStyles.image} resizeMode="contain" />}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF9F6' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, color: '#7E7767', fontWeight: '600' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  headerTitleContainer: { flex: 1, marginLeft: 14 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#1C1B17' },
  headerSubtitle: { fontSize: 12, color: '#A39A85', fontWeight: '500', marginTop: 2 },
  headerSpacer: { width: 40 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    marginHorizontal: 20,
    marginBottom: 10,
    height: 44,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#1C1B17' },
  controlsRow: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 12,
    zIndex: 10,
  },
  dropdownWrapper: { flex: 1, position: 'relative', zIndex: 10 },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  dropdownButtonText: { fontSize: 12, fontWeight: '600', color: '#1C1B17', flex: 1, marginRight: 4 },
  dropdownMenu: {
    position: 'absolute',
    top: 44,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
    zIndex: 20,
  },
  dropdownOption: { paddingVertical: 10, paddingHorizontal: 14 },
  dropdownOptionText: { fontSize: 12, color: '#1C1B17', fontWeight: '500' },
  dropdownOptionTextActive: { color: '#B5854A', fontWeight: '700' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
  },
  errorText: { fontSize: 12, color: '#EF4444', fontWeight: '600', flex: 1 },
  listContent: { paddingHorizontal: 20, gap: 10 },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
  },
  productImage: { width: 48, height: 48, borderRadius: 12, marginRight: 12, backgroundColor: '#F0EAD8' },
  productImagePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 12,
    marginRight: 12,
    backgroundColor: '#FBF0DA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  productTextContainer: { flex: 1 },
  productName: { fontSize: 14, fontWeight: '700', color: '#1C1B17', marginBottom: 3 },
  productCode: { fontSize: 11, color: '#A39A85', fontWeight: '500' },
  eyeButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FBF0DA',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 13, color: '#A39A85', fontWeight: '600' },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(28, 27, 23, 0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '85%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E1D6', alignSelf: 'center', marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  headerImage: { width: 44, height: 44, borderRadius: 12, marginRight: 12, backgroundColor: '#F0EAD8' },
  headerImagePlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 12,
    marginRight: 12,
    backgroundColor: '#FBF0DA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTextContainer: { flex: 1, marginRight: 8 },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#1C1B17' },
  headerSubtitle: { fontSize: 11, color: '#A39A85', fontWeight: '500', marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statBox: { flex: 1, backgroundColor: '#FAF9F6', borderRadius: 14, paddingVertical: 10, alignItems: 'center' },
  statValue: { fontSize: 17, fontWeight: '700', color: '#1C1B17' },
  statLabel: { fontSize: 10, color: '#A39A85', fontWeight: '600', marginTop: 2 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAF9F6',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 13, color: '#1C1B17' },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EAD8',
    marginTop: 6,
  },
  tableHeaderText: { fontSize: 11, fontWeight: '700', color: '#A39A85', letterSpacing: 0.3 },
  tableRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 4 },
  tableRowAlt: { backgroundColor: '#FAF9F6', borderRadius: 8 },
  tableCell: { fontSize: 12.5, color: '#1C1B17' },
  qtyZero: { color: '#EF4444' },
  qtyLow: { color: '#D97706' },
  qtyOk: { color: '#16A34A' },
  emptyContainer: { alignItems: 'center', paddingVertical: 30 },
  emptyText: { fontSize: 13, color: '#A39A85', fontWeight: '600' },
});

const previewStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  image: { width: '92%', height: '75%' },
});