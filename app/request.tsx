import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MoreMenu from '../components/MoreMenu';

const Request = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [loadingRequest, setLoadingRequest] = useState<string | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const handleRequestNavigation = async (requestType: string) => {
    if (loadingRequest) return;
    setLoadingRequest(requestType);
    await new Promise((res) => setTimeout(res, 300));
    switch (requestType) {
      case 'leave':
        navigation.navigate('LeaveRequest');
        break;
      case 'late':
        navigation.navigate('LateRequest');
        break;
      case 'early':
        navigation.navigate('EarlyRequest');
        break;
    }
    setLoadingRequest(null);
  };

  const handleViewRequests = async (requestType: string) => {
    if (loadingRequest) return;
    setLoadingRequest(`view-${requestType}`);
    await new Promise((res) => setTimeout(res, 300));
    switch (requestType) {
      case 'leave':
        navigation.navigate('ViewLeaveRequests');
        break;
      case 'late':
        navigation.navigate('ViewLateRequests');
        break;
      case 'early':
        navigation.navigate('ViewEarlyRequests');
        break;
    }
    setLoadingRequest(null);
  };

  const requestTypes = [
    {
      id: 'leave',
      title: 'Leave Request',
      viewTitle: 'View Leave',
      icon: 'calendar-outline',
      color: '#10B981',
      bgColor: '#D1FAE5',
    },
    {
      id: 'late',
      title: 'Late Request',
      viewTitle: 'View Late',
      icon: 'time-outline',
      color: '#F59E0B',
      bgColor: '#FEF3C7',
    },
    {
      id: 'early',
      title: 'Early Request',
      viewTitle: 'View Early',
      icon: 'exit-outline',
      color: '#EF4444',
      bgColor: '#FEE2E2',
    },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#2D2A26" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Requests</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Page Title Section */}
        <View style={styles.titleSection}>
          <Text style={styles.pageLabel}>MANAGE YOUR</Text>
          <Text style={styles.pageTitle}>Work Requests</Text>
          <Text style={styles.pageSubtitle}>
            Submit and track your leave, late arrival, and early departure requests
          </Text>
        </View>

        {/* Request Cards */}
        {requestTypes.map((request) => {

          return (
            <View key={request.id}>
              <View style={[styles.requestCard, styles.cardShadow]}>
                <View style={styles.requestCardHeader}>
                  <View style={styles.requestCardLeft}>
                    <View style={[styles.requestIcon, { backgroundColor: request.bgColor }]}>
                      <Ionicons name={request.icon as any} size={28} color={request.color} />
                    </View>
                    <View>
                      <Text style={styles.requestTitle}>{request.title}</Text>
                      <Text style={styles.requestSubtitle}>Submit new request</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.requestActions}>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.primaryAction]}
                    onPress={() => handleRequestNavigation(request.id)}
                    disabled={loadingRequest !== null}
                  >
                    {loadingRequest === request.id ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
                        <Text style={styles.primaryActionText}>New Request</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionButton, styles.secondaryAction]}
                    onPress={() => handleViewRequests(request.id)}
                    disabled={loadingRequest !== null}
                  >
                    {loadingRequest === `view-${request.id}` ? (
                      <ActivityIndicator size="small" color="#2D2A26" />
                    ) : (
                      <>
                        <Ionicons name="list-outline" size={20} color="#2D2A26" />
                        <Text style={styles.secondaryActionText}>{request.viewTitle}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigation.navigate('HomeNew')}
        >
          <Ionicons name="home-outline" size={24} color="#7E7767" />
          <Text style={styles.navLabel}>HOME</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigation.navigate('PunchRedesign')}
        >
          <Ionicons name="finger-print-outline" size={24} color="#7E7767" />
          <Text style={styles.navLabel}>PUNCH</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItemActive}>
          <Ionicons name="time" size={24} color="#D4A574" />
          <Text style={styles.navLabelActive}>REQUESTS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setShowMoreMenu(true)}>
          <Ionicons name="ellipsis-vertical" size={24} color="#7E7767" />
          <Text style={styles.navLabel}>MORE</Text>
        </TouchableOpacity>
      </View>

      <MoreMenu visible={showMoreMenu} onClose={() => setShowMoreMenu(false)} />
    </View>
  );
};

export default Request;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF7F2',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: 'rgba(250, 247, 242, 0.8)',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2D2A26',
    letterSpacing: -0.5,
  },
  headerRight: {
    width: 40,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 120,
  },
  titleSection: {
    marginTop: 24,
    marginBottom: 32,
  },
  pageLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#78716C',
    letterSpacing: 3.2,
    marginBottom: 8,
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#2D2A26',
    letterSpacing: -1,
    marginBottom: 12,
  },
  pageSubtitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#78716C',
    lineHeight: 22,
  },
  requestCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#F3EDE2',
  },
  requestCardHeader: {
    marginBottom: 20,
  },
  requestCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  requestIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  requestTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D2A26',
    marginBottom: 4,
  },
  requestSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#78716C',
  },
  requestActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 16,
    gap: 8,
  },
  primaryAction: {
    backgroundColor: '#78350F',
  },
  secondaryAction: {
    backgroundColor: '#F3EDE2',
  },
  primaryActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2D2A26',
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: 'rgba(250, 247, 242, 0.9)',
    borderTopLeftRadius: 48,
    borderTopRightRadius: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.06,
    shadowRadius: 40,
    elevation: 8,
  },
  navItem: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  navItemActive: {
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 50,
  },
  navLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#7E7767',
    marginTop: 4,
    letterSpacing: 1.2,
  },
  navLabelActive: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D4A574',
    marginTop: 4,
    letterSpacing: 1.2,
  },
  cardShadow: {
    shadowColor: '#78716C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
});
