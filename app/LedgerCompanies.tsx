import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getUserScope, hasMenuKey } from './authScope';
import { findCompanyAccess } from './companyAccess';

interface CompanyOption {
  clientId: string;
  name: string;
  code: string;
}

const COMPANY_API_URL = 'https://planet.imcbs.com/api/master/company/';
const FETCH_TIMEOUT = 15000;

const DEFAULT_ICON = 'business-outline';
const ICON_BY_CODE: Record<string, string> = {
  SYS: 'desktop-outline',
  SYIN: 'information-circle-outline',
  IMCL: 'business-outline',
};

const fetchCompanies = async (): Promise<CompanyOption[]> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const response = await fetch(COMPANY_API_URL, { signal: controller.signal });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text}`);
    const parsed = JSON.parse(text);
    const raw: any[] = Array.isArray(parsed) ? parsed : parsed?.results || [];
    return raw
      .filter((c) => c.client_id && c.company_name)
      .map((c) => ({
        clientId: String(c.client_id),
        name: String(c.company_name),
        code: String(c.code ?? ''),
      }));
  } finally {
    clearTimeout(timeoutId);
  }
};

export default function LedgerCompanies() {
  const navigation = useNavigation<any>();
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

const loadCompanies = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchCompanies();
      const scope = await getUserScope();

      const filtered = scope.isAdmin
        ? data
        : data.filter((c) => {
            const access = findCompanyAccess(c.name);
            return access ? hasMenuKey(scope, access.debtorsKey) : false;
          });

      setCompanies(filtered);
    } catch (e: any) {
      setError(e?.message || 'Failed to load companies');
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadCompanies();
      setLoading(false);
    })();
  }, [loadCompanies]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCompanies();
    setRefreshing(false);
  }, [loadCompanies]);

  const handleSelectCompany = (company: CompanyOption) => {
    navigation.navigate('LedgerAccounts', {
      clientId: company.clientId,
      companyName: company.name,
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={22} color="#1C1B17" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ledger</Text>
        <View style={{ width: 44 }} />
      </View>

      <Text style={styles.helperText}>Select a company to view its ledger</Text>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color="#D4A574" />
          <Text style={styles.loadingText}>Loading companies...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerFill}>
          <Ionicons name="alert-circle-outline" size={40} color="#A39A85" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadCompanies} activeOpacity={0.8}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={companies}
          keyExtractor={(item) => item.clientId}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D4A574" />}
          ListEmptyComponent={
            <View style={styles.centerFill}>
              <Ionicons name="folder-open-outline" size={40} color="#A39A85" />
              <Text style={styles.emptyText}>No companies found</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.companyCard}
              onPress={() => handleSelectCompany(item)}
              activeOpacity={0.7}
            >
              <View style={styles.companyIconContainer}>
                <Ionicons
                  name={(ICON_BY_CODE[item.code] || DEFAULT_ICON) as any}
                  size={24}
                  color="#D4A574"
                />
              </View>
              <View style={styles.companyTextContainer}>
                <Text style={styles.companyName}>{item.name}</Text>
                <Text style={styles.companySubtitle}>View accounts &amp; ledger</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#A39A85" />
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF9F6' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  backBtn: {
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
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#1C1B17' },
  helperText: {
    fontSize: 13,
    color: '#A39A85',
    fontWeight: '500',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  listContent: { paddingHorizontal: 20, paddingBottom: 32 },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60, gap: 10 },
  loadingText: { fontSize: 13, color: '#7E7767', fontWeight: '600' },
  errorText: { fontSize: 13, color: '#A39A85', fontWeight: '600', textAlign: 'center', paddingHorizontal: 32 },
  emptyText: { fontSize: 14, color: '#A39A85', fontWeight: '600' },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#1C1B17',
    borderRadius: 50,
  },
  retryBtnText: { color: '#F5C451', fontWeight: '700', fontSize: 13 },
  companyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  companyIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#FBF0DA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  companyTextContainer: { flex: 1 },
  companyName: { fontSize: 15, fontWeight: '700', color: '#1C1B17', marginBottom: 3 },
  companySubtitle: { fontSize: 12, fontWeight: '500', color: '#A39A85' },
});