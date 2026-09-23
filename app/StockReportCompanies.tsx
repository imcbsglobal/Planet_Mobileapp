import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getUserScope, hasMenuKey } from './authScope';
import { findCompanyAccess } from './companyAccess';

interface Company {
  id: string;
  name: string;
  clientId: string;
}

const COMPANIES: Company[] = [
  { id: '1', name: 'Sysmac Computers', clientId: 'GW9Q6NQQ5ONRU' },
  { id: '2', name: 'Sysmac Info', clientId: '69ZHSXOIMFA6T' },
  { id: '3', name: 'IMCB LLP', clientId: 'G9SYCSM54HR3E' },
];
export default function StockReportCompanies() {
  const navigation = useNavigation<any>();
  const [visibleCompanies, setVisibleCompanies] = useState<Company[]>([]);

  useEffect(() => {
    (async () => {
      const scope = await getUserScope();
      if (scope.isAdmin) {
        setVisibleCompanies(COMPANIES);
        return;
      }
      // Show this screen's company only if the user's menu_keys grant the
      // stock-report-<company> key for it — same source of truth the
      // backend used to build their menu.
      setVisibleCompanies(
        COMPANIES.filter((c) => {
          const access = findCompanyAccess(c.name);
          return access ? hasMenuKey(scope, access.stockReportKey) : false;
        })
      );
    })();
  }, []);

  const handleSelectCompany = (company: Company) => {
    navigation.navigate('StockReportProducts', {
      clientId: company.clientId,
      companyName: company.name,
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color="#1C1B17" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Stock Report</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>SELECT COMPANY</Text>

        <View style={styles.companyList}>
          {visibleCompanies.map((company) => (
            <TouchableOpacity
              key={company.id}
              style={styles.companyCard}
              onPress={() => handleSelectCompany(company)}
              activeOpacity={0.7}
            >
              <View style={styles.companyIconContainer}>
                <Ionicons name="business-outline" size={22} color="#B5854A" />
              </View>
              <View style={styles.companyTextContainer}>
                <Text style={styles.companyName}>{company.name}</Text>
                <Text style={styles.companyClientId}>{company.clientId}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#C2BBA8" />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
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
    paddingTop: 12,
    paddingBottom: 16,
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
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1C1B17' },
  headerSpacer: { width: 40 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 32 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A39A85',
    letterSpacing: 1,
    marginBottom: 14,
    marginTop: 4,
  },
  companyList: { gap: 12 },
  companyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 16,
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
  companyClientId: { fontSize: 11, fontWeight: '500', color: '#A39A85' },
});