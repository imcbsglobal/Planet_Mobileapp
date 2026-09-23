import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { getUserScope, isAllowed } from './authScope';

interface AccountRow {
  code: string;
  name: string;
  place: string;
  phone: string;
  department: string; // department CODE, e.g. "DF"
  debit: number;
  credit: number;
  balance: number; // debit - credit
}

interface DepartmentOption {
  code: string; // e.g. "DF"
  name: string; // e.g. "MAIN"
}

interface RawLedgerEntry {
  code: string;
  particulars: string;
  debit: number | null;
  credit: number | null;
  entry_mode: string;
  voucher_no: string;
  narration: string;
  date: string;
}

interface LedgerRow extends RawLedgerEntry {
  balance: number; // running balance after this entry
}

/* ─────────────────────────── Constants ─────────────────────── */

const ACC_MASTER_API_URL = 'https://accmaster.imcbs.com/api/sync/acc-master/';
const ACC_LEDGERS_API_URL = 'https://accmaster.imcbs.com/api/sync/acc-ledgers/';
const ACC_DEPARTMENTS_API_URL = 'https://accmaster.imcbs.com/api/sync/acc-departments/';
const FETCH_TIMEOUT = 15000;

// Same "rows to show" choices as the website's Rows Count dropdown.
const ROWS_OPTIONS: Array<number | 'all'> = [25, 50, 100, 200, 'all'];
const DEFAULT_ROWS_LIMIT: number | 'all' = 50;

/* ─────────────────────────── Helpers ─────────────────────────── */

const getFirstValue = (item: any, keys: string[]) => {
  for (const key of keys) {
    const value = item?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
};

const parseAmount = (value: any): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = parseFloat(value);
  return Number.isNaN(n) ? null : n;
};

const formatCurrency = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fetchJsonArray = async (url: string): Promise<any[]> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text}`);
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.results)) return parsed.results;
    if (Array.isArray(parsed?.data)) return parsed.data;
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
};

const fetchAccounts = async (clientId: string): Promise<AccountRow[]> => {
  const raw = await fetchJsonArray(ACC_MASTER_API_URL);
  return raw
    .filter(
      (c) => getFirstValue(c, ['client_id', 'clientId', 'client']).toLowerCase() === clientId.toLowerCase()
    )
    .filter((c) => getFirstValue(c, ['name']))
    .map((c) => {
      const debit = parseAmount(c.debit) || 0;
      const credit = parseAmount(c.credit) || 0;
      return {
        code: getFirstValue(c, ['code', 'id']),
        name: getFirstValue(c, ['name']),
        place: getFirstValue(c, ['place', 'location', 'address', 'address3']),
        phone: getFirstValue(c, ['phone', 'mobile', 'contact', 'phone1', 'mobileno']),
        department: getFirstValue(c, ['openingdepartment', 'department_code', 'department', 'dept', 'branch_code']),
        debit,
        credit,
        balance: debit - credit,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

const fetchDepartments = async (clientId: string): Promise<DepartmentOption[]> => {
  const raw = await fetchJsonArray(ACC_DEPARTMENTS_API_URL);
  const map = new Map<string, DepartmentOption>();
  raw
    .filter((d) => (d.client_id || '').toLowerCase() === clientId.toLowerCase())
    .forEach((d) => {
      const code = String(d.department_id ?? '').trim();
      const name = String(d.department ?? '').trim();
      if (!code || map.has(code)) return;
      map.set(code, { code, name: name || code });
    });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
};

const fetchLedgerEntries = async (code: string, clientId: string): Promise<RawLedgerEntry[]> => {
  const url = `${ACC_LEDGERS_API_URL}?code=${encodeURIComponent(code)}`;
  const raw = await fetchJsonArray(url);

  const tagged = raw.filter((r) => (r.client_id || '').trim());
  const scoped =
    tagged.length > 0
      ? tagged.filter((r) => (r.client_id || '').toLowerCase() === clientId.toLowerCase())
      : raw;

  return scoped.map((r) => ({
    code: String(r.code ?? ''),
    particulars: String(r.particulars ?? '').trim(),
    debit: parseAmount(r.debit),
    credit: parseAmount(r.credit),
    entry_mode: String(r.entry_mode ?? '').trim(),
    voucher_no: String(r.voucher_no ?? '').trim(),
    narration: String(r.narration ?? '').trim(),
    date: String(r.date ?? '').trim(),
  }));
};

const buildLedgerRows = (entries: RawLedgerEntry[]) => {
  const sorted = entries
    .map((e, idx) => ({ ...e, _idx: idx }))
    .sort((a, b) => (a.date !== b.date ? a.date.localeCompare(b.date) : a._idx - b._idx));

  let running = 0;
  const rows: LedgerRow[] = sorted.map((e) => {
    running = running + (e.debit ?? 0) - (e.credit ?? 0);
    const { _idx, ...rest } = e;
    return { ...rest, balance: running };
  });

  const totalDebit = rows.reduce((s, r) => s + (r.debit ?? 0), 0);
  const totalCredit = rows.reduce((s, r) => s + (r.credit ?? 0), 0);

  return { rows, totalDebit, totalCredit, closingBalance: running };
};
export default function LedgerAccounts() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { clientId, companyName } = route.params || {};

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');

  const [selectedDept, setSelectedDept] = useState<string>(''); // '' = All Dept
  const [hideZeroBalance, setHideZeroBalance] = useState(true); // matches website default (filter = 1)
  const [rowsLimit, setRowsLimit] = useState<number | 'all'>(DEFAULT_ROWS_LIMIT);
  const [filtersVisible, setFiltersVisible] = useState(false);

  const [selectedAccount, setSelectedAccount] = useState<AccountRow | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [ledgerRows, setLedgerRows] = useState<LedgerRow[]>([]);
  const [ledgerTotals, setLedgerTotals] = useState({ totalDebit: 0, totalCredit: 0, closingBalance: 0 });

const loadData = useCallback(async () => {
    if (!clientId) return;
    try {
      setError(null);
      const [accountsData, deptData, scope] = await Promise.all([
        fetchAccounts(clientId),
        fetchDepartments(clientId),
        getUserScope(),
      ]);

      if (scope.isAdmin || scope.departments.length === 0) {
        setDepartments(deptData);
        setAccounts(accountsData);
      } else {
        const allowedDeptCodes = new Set(
          deptData
            .filter((d) => isAllowed(d.name, scope.departments))
            .map((d) => d.code.toLowerCase())
        );
        setDepartments(deptData.filter((d) => allowedDeptCodes.has(d.code.toLowerCase())));
        setAccounts(accountsData.filter((a) => allowedDeptCodes.has(a.department.toLowerCase())));
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load accounts');
    }
  }, [clientId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadData();
      setLoading(false);
    })();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const deptCodeToName = useMemo(() => {
    const map: Record<string, string> = {};
    departments.forEach((d) => {
      map[d.code.toLowerCase()] = d.name;
    });
    return map;
  }, [departments]);

  const getDeptName = useCallback(
    (code: string) => deptCodeToName[code.toLowerCase()] || code,
    [deptCodeToName]
  );

  const searchedAccounts = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.code.toLowerCase().includes(q) ||
        a.place.toLowerCase().includes(q) ||
        a.phone.toLowerCase().includes(q) ||
        a.department.toLowerCase().includes(q) ||
        getDeptName(a.department).toLowerCase().includes(q)
    );
  }, [accounts, searchText, getDeptName]);

  const filteredAccounts = useMemo(() => {
    return searchedAccounts.filter((a) => {
      const deptMatches = !selectedDept || a.department.toLowerCase() === selectedDept.toLowerCase();
      const balanceMatches = !hideZeroBalance || Math.abs(a.balance) >= 1;
      return deptMatches && balanceMatches;
    });
  }, [searchedAccounts, selectedDept, hideZeroBalance]);

  const visibleAccounts = useMemo(() => {
    if (rowsLimit === 'all') return filteredAccounts;
    return filteredAccounts.slice(0, rowsLimit);
  }, [filteredAccounts, rowsLimit]);

  const totalBalance = useMemo(
    () => visibleAccounts.reduce((sum, a) => sum + a.balance, 0),
    [visibleAccounts]
  );

  const activeFilterCount =
    (selectedDept ? 1 : 0) + (!hideZeroBalance ? 1 : 0) + (rowsLimit !== DEFAULT_ROWS_LIMIT ? 1 : 0);

  const handleViewLedger = async (account: AccountRow) => {
    setSelectedAccount(account);
    setLedgerLoading(true);
    setLedgerError(null);
    setLedgerRows([]);
    try {
      const entries = await fetchLedgerEntries(account.code, clientId);
      const { rows, totalDebit, totalCredit, closingBalance } = buildLedgerRows(entries);
      setLedgerRows(rows);
      setLedgerTotals({ totalDebit, totalCredit, closingBalance });
    } catch (e: any) {
      setLedgerError(e?.message || 'Failed to load ledger');
    } finally {
      setLedgerLoading(false);
    }
  };

  const closeModal = () => {
    setSelectedAccount(null);
    setLedgerRows([]);
    setLedgerError(null);
  };

  const resetFilters = () => {
    setSelectedDept('');
    setHideZeroBalance(true);
    setRowsLimit(DEFAULT_ROWS_LIMIT);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color="#1C1B17" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {companyName || 'Ledger'}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#A39A85" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, code, place, phone, dept"
            placeholderTextColor="#A39A85"
            value={searchText}
            onChangeText={setSearchText}
          />
          {!!searchText && (
            <TouchableOpacity onPress={() => setSearchText('')}>
              <Ionicons name="close-circle" size={18} color="#A39A85" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={styles.filterIconBtn}
          onPress={() => setFiltersVisible(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="options-outline" size={20} color="#1C1B17" />
          {activeFilterCount > 0 && <View style={styles.filterActiveDot} />}
        </TouchableOpacity>
      </View>

      {!loading && !error && (
        <View style={styles.summaryBar}>
          <View style={styles.summaryAccent} />
          <View style={styles.summaryTextCol}>
            <View style={styles.summaryTextRow}>
              <Text style={styles.summaryLabel}>
                Total Balance: <Text style={styles.summaryValue}>{formatCurrency(totalBalance)}</Text>
              </Text>
              <Text style={styles.summaryLabel}>
                Accounts: <Text style={styles.summaryValue}>{visibleAccounts.length}</Text>
              </Text>
            </View>
            {rowsLimit !== 'all' && filteredAccounts.length > visibleAccounts.length && (
              <Text style={styles.summaryHint}>
                {filteredAccounts.length} accounts match your filters — showing top {visibleAccounts.length}.
                Change "Rows to show" in filters to see more.
              </Text>
            )}
          </View>
        </View>
      )}


      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color="#D4A574" />
          <Text style={styles.loadingText}>Loading accounts...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerFill}>
          <Ionicons name="alert-circle-outline" size={40} color="#A39A85" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadData} activeOpacity={0.8}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={visibleAccounts}
          keyExtractor={(item, idx) => `${item.code}-${idx}`}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D4A574" />}
          ListEmptyComponent={
            <View style={styles.centerFill}>
              <Ionicons name="folder-open-outline" size={40} color="#A39A85" />
              <Text style={styles.emptyText}>No accounts match your filters</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={resetFilters} activeOpacity={0.8}>
                <Text style={styles.retryBtnText}>Reset filters</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.accountCard}>
              <View style={styles.accountTextContainer}>
                <View style={styles.accountTopRow}>
                  <Text style={styles.accountCode}>{item.code}</Text>
                  {!!item.department && (
                    <View style={styles.deptBadge}>
                      <Text style={styles.deptBadgeText}>{getDeptName(item.department)}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.accountName} numberOfLines={1}>
                  {item.name}
                </Text>
                {!!(item.place || item.phone) && (
                  <Text style={styles.accountSub} numberOfLines={1}>
                    {[item.place, item.phone].filter(Boolean).join('  •  ')}
                  </Text>
                )}
                <Text style={[styles.accountBalance, item.balance >= 0 ? styles.debitColor : styles.creditColor]}>
                  {formatCurrency(Math.abs(item.balance))}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.viewBtn}
                onPress={() => handleViewLedger(item)}
                activeOpacity={0.8}
              >
                <Text style={styles.viewBtnText}>View</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      <Modal
        visible={filtersVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFiltersVisible(false)}
      >
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={() => setFiltersVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.sheetContainer} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetTitleRow}>
              <Text style={styles.sheetTitle}>Filters</Text>
              <TouchableOpacity onPress={resetFilters}>
                <Text style={styles.sheetResetText}>Reset</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sheetSectionLabel}>Balance</Text>
            <View style={styles.segmentRow}>
              <TouchableOpacity
                style={[styles.segmentBtn, hideZeroBalance && styles.segmentBtnActive]}
                onPress={() => setHideZeroBalance(true)}
                activeOpacity={0.8}
              >
                <Text style={[styles.segmentBtnText, hideZeroBalance && styles.segmentBtnTextActive]}>
                  Non-zero only
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentBtn, !hideZeroBalance && styles.segmentBtnActive]}
                onPress={() => setHideZeroBalance(false)}
                activeOpacity={0.8}
              >
                <Text style={[styles.segmentBtnText, !hideZeroBalance && styles.segmentBtnTextActive]}>
                  Show all (incl. ₹0)
                </Text>
              </TouchableOpacity>
            </View>

            {departments.length > 0 && (
              <>
                <Text style={styles.sheetSectionLabel}>Department</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  <TouchableOpacity
                    style={[styles.chip, !selectedDept && styles.chipActive]}
                    onPress={() => setSelectedDept('')}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, !selectedDept && styles.chipTextActive]}>All Dept</Text>
                  </TouchableOpacity>
                  {departments.map((d) => (
                    <TouchableOpacity
                      key={d.code}
                      style={[styles.chip, selectedDept === d.code && styles.chipActive]}
                      onPress={() => setSelectedDept(d.code)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.chipText, selectedDept === d.code && styles.chipTextActive]}>
                        {d.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            <Text style={styles.sheetSectionLabel}>Rows to show</Text>
            <View style={styles.chipRow}>
              {ROWS_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={String(opt)}
                  style={[styles.chip, rowsLimit === opt && styles.chipActive]}
                  onPress={() => setRowsLimit(opt)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, rowsLimit === opt && styles.chipTextActive]}>
                    {opt === 'all' ? 'All' : opt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.sheetDoneBtn}
              onPress={() => setFiltersVisible(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.sheetDoneBtnText}>Done</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={!!selectedAccount} animationType="slide" onRequestClose={closeModal}>
        <SafeAreaProvider>
        <SafeAreaView style={styles.modalRoot} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                Ledger — {selectedAccount?.name}
              </Text>
              <Text style={styles.modalSubtitle}>Code: {selectedAccount?.code}</Text>
            </View>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={closeModal} activeOpacity={0.7}>
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {ledgerLoading ? (
            <View style={styles.centerFill}>
              <ActivityIndicator size="large" color="#D4A574" />
              <Text style={styles.loadingText}>Loading ledger...</Text>
            </View>
          ) : ledgerError ? (
            <View style={styles.centerFill}>
              <Ionicons name="alert-circle-outline" size={40} color="#A39A85" />
              <Text style={styles.errorText}>{ledgerError}</Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => selectedAccount && handleViewLedger(selectedAccount)}
                activeOpacity={0.8}
              >
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <ScrollView contentContainerStyle={styles.ledgerListContent}>
                {ledgerRows.length === 0 ? (
                  <View style={styles.centerFill}>
                    <Ionicons name="document-text-outline" size={40} color="#A39A85" />
                    <Text style={styles.emptyText}>No ledger entries found</Text>
                  </View>
                ) : (
                  ledgerRows.map((entry, idx) => (
                    <View key={idx} style={styles.entryCard}>
                      <View style={styles.entryTopRow}>
                        <Text style={styles.entryDate}>{entry.date}</Text>
                        {!!entry.entry_mode && (
                          <View style={styles.entryModeBadge}>
                            <Text style={styles.entryModeText}>{entry.entry_mode}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.entryParticulars}>{entry.particulars || '—'}</Text>
                      {!!entry.narration && <Text style={styles.entryNarration}>{entry.narration}</Text>}
                      <View style={styles.entryBottomRow}>
                        <Text style={styles.entryVoucher}>
                          {entry.voucher_no ? `Voucher #${entry.voucher_no}` : ''}
                        </Text>
                        <View style={styles.entryAmounts}>
                          {entry.debit != null && (
                            <Text style={styles.debitText}>+{formatCurrency(entry.debit)}</Text>
                          )}
                          {entry.credit != null && (
                            <Text style={styles.creditText}>-{formatCurrency(entry.credit)}</Text>
                          )}
                        </View>
                      </View>
                      <View style={styles.entryBalanceRow}>
                        <Text style={styles.entryBalanceLabel}>Balance</Text>
                        <Text style={styles.entryBalanceValue}>{formatCurrency(entry.balance)}</Text>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>

              {ledgerRows.length > 0 && (
                <View style={styles.totalsBar}>
                  <View style={styles.totalsCol}>
                    <Text style={styles.totalsLabel}>Debit</Text>
                    <Text style={styles.totalsDebit}>{formatCurrency(ledgerTotals.totalDebit)}</Text>
                  </View>
                  <View style={styles.totalsCol}>
                    <Text style={styles.totalsLabel}>Credit</Text>
                    <Text style={styles.totalsCredit}>{formatCurrency(ledgerTotals.totalCredit)}</Text>
                  </View>
                  <View style={styles.totalsCol}>
                    <Text style={styles.totalsLabel}>Closing</Text>
                    <Text style={styles.totalsBalance}>{formatCurrency(ledgerTotals.closingBalance)}</Text>
                  </View>
                </View>
              )}
            </>
          )}
        </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </SafeAreaView>
  );
}


const ORANGE = '#C2410C';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF9F6' },
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
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: '#1C1B17', marginHorizontal: 8 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 12,
    gap: 10,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 50,
    borderWidth: 1.5,
    borderColor: '#E8E3D9',
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1C1B17', padding: 0 },
  filterIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E8E3D9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterActiveDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ORANGE,
  },
  summaryBar: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  summaryAccent: { width: 4, backgroundColor: ORANGE },
  summaryTextCol: { flex: 1, paddingVertical: 14, paddingHorizontal: 16 },
  summaryTextRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 12, fontWeight: '600', color: '#7E7767' },
  summaryValue: { fontSize: 13, fontWeight: '800', color: '#1C1B17' },
  summaryHint: { fontSize: 11, fontWeight: '500', color: '#A39A85', marginTop: 6 },
  listContent: { paddingHorizontal: 20, paddingBottom: 32 },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  accountTextContainer: { flex: 1, marginRight: 12 },
  accountTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  accountCode: { fontSize: 11, fontWeight: '700', color: ORANGE, letterSpacing: 0.3 },
  deptBadge: { backgroundColor: '#F0EAD8', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  deptBadgeText: { fontSize: 10, fontWeight: '700', color: '#7E7767' },
  accountName: { fontSize: 15, fontWeight: '700', color: '#1C1B17', marginBottom: 2 },
  accountSub: { fontSize: 12, color: '#A39A85', fontWeight: '500', marginBottom: 6 },
  accountBalance: { fontSize: 14, fontWeight: '800' },
  debitColor: { color: '#DC2626' },
  creditColor: { color: '#16A34A' },
  viewBtn: {
    backgroundColor: '#1C1B17',
    borderRadius: 50,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  viewBtnText: { color: '#F5C451', fontWeight: '700', fontSize: 12 },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(28,27,23,0.4)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FAF9F6',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E8E3D9',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: '#1C1B17' },
  sheetResetText: { fontSize: 13, fontWeight: '700', color: ORANGE },
  sheetSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A39A85',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
  },
  segmentRow: { flexDirection: 'row', gap: 10 },
  segmentBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E8E3D9',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  segmentBtnActive: { backgroundColor: '#1C1B17', borderColor: '#1C1B17' },
  segmentBtnText: { fontSize: 12, fontWeight: '700', color: '#7E7767' },
  segmentBtnTextActive: { color: '#F5C451' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 50,
    borderWidth: 1.5,
    borderColor: '#E8E3D9',
    backgroundColor: '#FFFFFF',
  },
  chipActive: { backgroundColor: '#1C1B17', borderColor: '#1C1B17' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#7E7767' },
  chipTextActive: { color: '#F5C451' },
  sheetDoneBtn: {
    marginTop: 22,
    backgroundColor: '#1C1B17',
    borderRadius: 50,
    paddingVertical: 15,
    alignItems: 'center',
  },
  sheetDoneBtnText: { color: '#F5C451', fontWeight: '800', fontSize: 14 },
  modalRoot: { flex: 1, backgroundColor: '#FAF9F6' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: ORANGE,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#FFFFFF', marginBottom: 4 },
  modalSubtitle: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  ledgerListContent: { padding: 20, paddingBottom: 32 },
  entryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  entryTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  entryDate: { fontSize: 12, fontWeight: '700', color: '#7E7767' },
  entryModeBadge: { backgroundColor: '#FBF0DA', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  entryModeText: { fontSize: 10, fontWeight: '800', color: '#B45309', letterSpacing: 0.5 },
  entryParticulars: { fontSize: 14, fontWeight: '700', color: '#1C1B17', marginBottom: 2 },
  entryNarration: { fontSize: 12, color: '#A39A85', fontWeight: '500', marginBottom: 8 },
  entryBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  entryVoucher: { fontSize: 11, color: '#A39A85', fontWeight: '600' },
  entryAmounts: { flexDirection: 'row', gap: 10 },
  debitText: { fontSize: 13, fontWeight: '800', color: '#DC2626' },
  creditText: { fontSize: 13, fontWeight: '800', color: '#16A34A' },
  entryBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0EAD8',
  },
  entryBalanceLabel: { fontSize: 11, fontWeight: '600', color: '#A39A85' },
  entryBalanceValue: { fontSize: 13, fontWeight: '800', color: '#1C1B17' },
  totalsBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F0EAD8',
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  totalsCol: { alignItems: 'center' },
  totalsLabel: { fontSize: 11, fontWeight: '600', color: '#A39A85', marginBottom: 3 },
  totalsDebit: { fontSize: 14, fontWeight: '800', color: '#DC2626' },
  totalsCredit: { fontSize: 14, fontWeight: '800', color: '#16A34A' },
  totalsBalance: { fontSize: 14, fontWeight: '800', color: '#1C1B17' },
});