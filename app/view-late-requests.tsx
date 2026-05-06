/* eslint-disable prettier/prettier */
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

const ViewLateRequests = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const params = route.params || {}; 
  
  // State management
  const [loadingTab, setLoadingTab] = useState(null);
  const [lateRequests, setLateRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  interface UserCredentials {
    userid: string;
    password: string;
  }

  // Filter options
  const filterOptions = ['All', 'Pending', 'Approved', 'Rejected'];
  
  // User credentials state
  const [userCredentials, setUserCredentials] = useState<UserCredentials>({
    userid: '',
    password: ''
  });
  const [isLoadingCredentials, setIsLoadingCredentials] = useState(true);

  // Load user credentials on component mount
  useEffect(() => {
    const loadUserCredentials = async () => {
      try {
        // Method 1: Try to get from route parameters first
        if (params.userid && params.password) {
          setUserCredentials({
            userid: params.userid as string,
            password: params.password as string
          });
          setIsLoadingCredentials(false);
          return;
        }

        // Method 2: Try to get from secure storage
        const storedUserid = await SecureStore.getItemAsync('userId');
        const storedPassword = await SecureStore.getItemAsync('password');
        
        if (storedUserid && storedPassword) {
          setUserCredentials({
            userid: storedUserid,
            password: storedPassword
          });
        } else {
          // Method 3: Fallback - show alert and go back
          Alert.alert(
            'Authentication Error',
            'User credentials not found. Please login again.',
            [
              {
                text: 'OK',
                onPress: () => navigation.replace('Login')
              }
            ]
          );
          return;
        }
      } catch (error) {
        console.error('Error loading user credentials:', error);
        Alert.alert(
          'Error',
          'Failed to load user credentials. Please try again.',
          [
            {
              text: 'OK',
              onPress: () => navigation.replace('Login')
            }
          ]
        );
        return;
      } finally {
        setIsLoadingCredentials(false);
      }
    };

    loadUserCredentials();
  }, [params.userid, params.password]);

  // Fetch late requests from API with status filter
  const fetchLateRequests = async (showLoader = true, statusFilter = null) => {
    // Don't fetch if credentials are not loaded yet
    if (isLoadingCredentials || !userCredentials.userid || !userCredentials.password) {
      console.log('Credentials not ready yet, skipping fetch');
      return;
    }

    try {
      if (showLoader) {
        setLoading(true);
      }
      
      console.log('Fetching late requests for user:', userCredentials.userid);
      
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), 15000)
      );

      // Build URL with user credentials
      let url = `https://myimc.in/flutter/late/list/?userid=${userCredentials.userid}&password=${userCredentials.password}`;
      
      // Add status filter if specified and not 'All'
      if (statusFilter && statusFilter !== 'All') {
        url += `&status=${statusFilter.toLowerCase()}`;
      }
      
      console.log('API URL:', url);

      const fetchPromise = fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      const response = await Promise.race([fetchPromise, timeoutPromise]);

      console.log('Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log('Error response:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText || 'Failed to fetch late requests'}`);
      }

      const data = await response.json();
      console.log('API Response:', data);
      
      // Handle different response formats
      let requestsArray = [];
      
      if (Array.isArray(data)) {
        requestsArray = data;
      } else if (data.success && data.data && Array.isArray(data.data)) {
        requestsArray = data.data;
      } else if (data.late_requests && Array.isArray(data.late_requests)) {
        requestsArray = data.late_requests;
      } else if (data.requests && Array.isArray(data.requests)) {
        requestsArray = data.requests;
      } else if (data.success && Array.isArray(data.result)) {
        requestsArray = data.result;
      } else {
        console.warn('Unexpected API response format:', data);
        requestsArray = [];
      }

      // Format the data to match our component structure
      const formattedData = requestsArray.map((request, index) => {
        // Handle different field naming conventions
        const id = request.id || request.request_id || request.late_id || index;
        const date = request.date || request.created_at?.split(' ')[0] || new Date().toISOString().split('T')[0];
        const reason = request.reason || request.comments || request.description || 'No reason provided';
        const status = (request.status || request.approval_status || 'pending').toLowerCase();
        const requestedOn = request.created_date || request.created_at || request.requestedOn || request.submitted_date || new Date().toISOString().split('T')[0];
        const timeIn = request.time_in || request.delay_time || request.actual_time || 'N/A';
        const lateMinutes = request.late_minutes || request.delay_minutes || extractMinutesFromDelayTime(request.delay_time) || 0;
        const userId = request.user_id || request.userid || request.employee_id;

        return {
          id,
          date,
          reason,
          status,
          requestedOn,
          timeIn,
          lateMinutes,
          userId,
          originalData: request,
        };
      });

      console.log('Formatted data:', formattedData);
      setLateRequests(formattedData);

    } catch (error) {
      console.error('Error fetching late requests:', error);
      
      let errorMessage = 'Failed to fetch late requests. Please try again.';
      
      if (error instanceof Error) {
        if (error.message === 'Request timeout') {
          errorMessage = 'Request timed out. Please check your internet connection and try again.';
        } else if (error.message.includes('Network request failed')) {
          errorMessage = 'Network connection failed. Please check your internet connection and try again.';
        } else if (error.message.includes('HTTP 401')) {
          errorMessage = 'Authentication failed. Please check your credentials.';
        } else if (error.message.includes('HTTP 403')) {
          errorMessage = 'Access denied. You may not have permission to view late requests.';
        } else if (error.message.includes('HTTP 404')) {
          errorMessage = 'API endpoint not found. Please contact support.';
        } else if (error.message.includes('HTTP 5')) {
          errorMessage = 'Server error. Please try again later.';
        }
      }
      
      Alert.alert(
        'Error',
        errorMessage,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Retry', onPress: () => fetchLateRequests(showLoader, statusFilter) },
        ]
      );
    } finally {
      if (showLoader) {
        setLoading(false);
      }
      setRefreshing(false);
    }
  };

  // Helper function to extract minutes from delay time string
  const extractMinutesFromDelayTime = (delayTime) => {
    if (!delayTime) return 0;
    
    const timeStr = delayTime.toString().toLowerCase();
    
    // Extract numbers from the string
    const numbers = timeStr.match(/\d+/g);
    if (!numbers) return 0;
    
    const number = parseInt(numbers[0]);
    
    // Check if it contains 'hour' or 'h'
    if (timeStr.includes('hour') || timeStr.includes('h')) {
      return number * 60; // Convert hours to minutes
    }
    
    // Default to minutes
    return number;
  };

  // Fetch data when credentials are loaded
  useEffect(() => {
    if (!isLoadingCredentials && userCredentials.userid && userCredentials.password) {
      fetchLateRequests();
    }
  }, [isLoadingCredentials, userCredentials.userid, userCredentials.password]);

  // Handle filter change - fetch data with status filter
  const handleFilterChange = (filter) => {
    setActiveFilter(filter);
    setCurrentPage(1);
    // Fetch data with the new filter
    fetchLateRequests(true, filter);
  };

  // Handle refresh
  const onRefresh = async () => {
    setRefreshing(true);
    await fetchLateRequests(false, activeFilter);
  };

  // Filter requests based on status (client-side filtering as fallback)
  const getFilteredRequests = () => {
    if (activeFilter === 'All') {
      return lateRequests;
    }
    return lateRequests.filter(request => 
      request.status.toLowerCase() === activeFilter.toLowerCase()
    );
  };

  // Get status config
  const getStatusConfig = (status) => {
    switch (status.toLowerCase()) {
      case 'approved': return { bg: '#D1FAE5', text: '#065F46', dot: '#10B981' };
      case 'rejected': return { bg: '#FEE2E2', text: '#991B1B', dot: '#EF4444' };
      case 'pending':  return { bg: '#FEF8E7', text: '#92400E', dot: '#F5C451' };
      default:         return { bg: '#F2F0E9', text: '#7E7767', dot: '#B5B0A4' };
    }
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status.toLowerCase()) {
      case 'approved':
        return '#28a745';
      case 'rejected':
        return '#dc3545';
      case 'pending':
        return '#ffc107';
      default:
        return '#6c757d';
    }
  };

  // Handle tab navigation
  const handleTabNavigation = async (route) => {
    if (loadingTab) return;
    setLoadingTab(route);
    await new Promise((res) => setTimeout(res, 300));
    navigation.navigate(route);
    setLoadingTab(null);
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    
    try {
      const date = new Date(dateString);
      // Check if date is valid
      if (isNaN(date.getTime())) {
        return 'Invalid Date';
      }
      
      return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'N/A';
    }
  };

  // Format late duration
  const formatLateDuration = (minutes) => {
    if (minutes < 60) {
      return `${minutes} min`;
    } else {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      if (remainingMinutes === 0) {
        return `${hours}h`;
      }
      return `${hours}h ${remainingMinutes}m`;
    }
  };

  // Get request count for each status
  const getStatusCount = (status) => {
    if (status === 'All') {
      return lateRequests.length;
    }
    return lateRequests.filter(request => 
      request.status.toLowerCase() === status.toLowerCase()
    ).length;
  };

  // Show loading while credentials are being loaded
  if (isLoadingCredentials) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#F5C451" />
          <Text style={styles.loadingText}>Loading user credentials...</Text>
        </View>
      </View>
    );
  }

  const filteredRequests = getFilteredRequests();
  const totalPages = Math.ceil(filteredRequests.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentRequests = filteredRequests.slice(startIndex, endIndex);

  return (
    <View style={styles.container}>
      {/* Loading Overlay */}
      {loadingTab && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#F5C451" />
          <Text style={styles.loadingOverlayTxt}>Loading…</Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color="#1C1B17" />
        </TouchableOpacity>
        <View>
          <Text style={styles.pageLabelSmall}>RECORDS</Text>
          <Text style={styles.pageTitle}>Late Requests</Text>
        </View>
        <TouchableOpacity style={styles.refreshIconButton} onPress={onRefresh}>
          <Ionicons name="refresh" size={20} color="#D4A574" />
        </TouchableOpacity>
      </View>

      {/* Hero Summary Banner */}
      <View style={styles.heroBanner}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroLabel}>OVERVIEW</Text>
          <Text style={styles.heroTitle}>
            {lateRequests.length} Request{lateRequests.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={styles.heroStats}>
          <View style={styles.heroStatItem}>
            <View style={[styles.heroStatDot, { backgroundColor: '#F5C451' }]} />
            <Text style={styles.heroStatText}>{getStatusCount('Pending')} Pending</Text>
          </View>
          <View style={styles.heroStatItem}>
            <View style={[styles.heroStatDot, { backgroundColor: '#10B981' }]} />
            <Text style={styles.heroStatText}>{getStatusCount('Approved')} Approved</Text>
          </View>
          <View style={styles.heroStatItem}>
            <View style={[styles.heroStatDot, { backgroundColor: '#EF4444' }]} />
            <Text style={styles.heroStatText}>{getStatusCount('Rejected')} Rejected</Text>
          </View>
        </View>
        <View style={styles.heroDecoration} />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {filterOptions.map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[styles.filterTab, activeFilter === filter && styles.filterTabActive]}
              onPress={() => handleFilterChange(filter)}
            >
              <Text style={[styles.filterTabText, activeFilter === filter && styles.filterTabTextActive]}>
                {filter}
              </Text>
              <View style={[styles.filterBadge, activeFilter === filter && styles.filterBadgeActive]}>
                <Text style={[styles.filterBadgeText, activeFilter === filter && styles.filterBadgeTextActive]}>
                  {getStatusCount(filter)}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F5C451" />
        }
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color="#F5C451" />
            <Text style={styles.stateText}>Loading late requests...</Text>
          </View>
        ) : currentRequests.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="time-outline" size={32} color="#D4A574" />
            </View>
            <Text style={styles.emptyTitle}>No requests found</Text>
            <Text style={styles.emptySubtext}>
              {activeFilter === 'All'
                ? "You haven't submitted any late requests yet."
                : `No ${activeFilter.toLowerCase()} late requests found.`}
            </Text>
            <TouchableOpacity
              style={styles.newRequestButton}
              onPress={() => navigation.navigate('LateRequest')}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={18} color="#453714" />
              <Text style={styles.newRequestButtonText}>New Late Request</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {currentRequests.map((request, index) => {
              const statusCfg = getStatusConfig(request.status);
              return (
                <View key={request.id || index} style={styles.requestCard}>
                  {/* Card top row */}
                  <View style={styles.cardTopRow}>
                    <View style={styles.cardDateWrap}>
                      <View style={styles.cardIconWrap}>
                        <Ionicons name="calendar-outline" size={16} color="#D4A574" />
                      </View>
                      <Text style={styles.cardDate}>{formatDate(request.date)}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
                      <View style={[styles.statusDot, { backgroundColor: statusCfg.dot }]} />
                      <Text style={[styles.statusText, { color: statusCfg.text }]}>
                        {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                      </Text>
                    </View>
                  </View>

                  {/* Time and Duration row */}
                  <View style={styles.cardInfoRow}>
                    <View style={styles.cardInfoItem}>
                      <Text style={styles.cardInfoLabel}>TIME IN</Text>
                      <Text style={styles.cardInfoValue}>{request.timeIn}</Text>
                    </View>
                    <View style={styles.cardInfoDivider} />
                    <View style={styles.cardInfoItem}>
                      <Text style={styles.cardInfoLabel}>LATE DURATION</Text>
                      <Text style={styles.cardInfoValue}>{formatLateDuration(request.lateMinutes)}</Text>
                    </View>
                  </View>

                  {/* Reason */}
                  <View style={styles.cardReasonRow}>
                    <Ionicons name="document-text-outline" size={14} color="#B5B0A4" />
                    <Text style={styles.cardReason} numberOfLines={2}>{request.reason}</Text>
                  </View>

                  {/* Requested On */}
                  <View style={styles.cardFooter}>
                    <Ionicons name="time-outline" size={12} color="#B5B0A4" />
                    <Text style={styles.cardFooterText}>Requested on {formatDate(request.requestedOn)}</Text>
                  </View>
                </View>
              );
            })}

            {/* Pagination */}
            {totalPages > 1 && (
              <View style={styles.pagination}>
                <TouchableOpacity
                  style={[styles.pageButton, currentPage === 1 && styles.pageButtonDisabled]}
                  onPress={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <Ionicons name="chevron-back" size={16} color={currentPage === 1 ? '#B5B0A4' : '#1C1B17'} />
                </TouchableOpacity>
                <Text style={styles.pageText}>{currentPage} / {totalPages}</Text>
                <TouchableOpacity
                  style={[styles.pageButton, currentPage === totalPages && styles.pageButtonDisabled]}
                  onPress={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <Ionicons name="chevron-forward" size={16} color={currentPage === totalPages ? '#B5B0A4' : '#1C1B17'} />
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('LateRequest')}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={24} color="#453714" />
      </TouchableOpacity>
    </View>
  );
};

export default ViewLateRequests;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  loadingScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAF9F6',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6E6E6E',
    fontWeight: '600',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(250, 249, 246, 0.92)',
    zIndex: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingOverlayTxt: {
    color: '#1C1B17',
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
  },

  // Header
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F2F0E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageLabelSmall: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7E7767',
    letterSpacing: 1.4,
    marginBottom: 2,
    textAlign: 'center',
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1B17',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  refreshIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FEF8E7',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Hero Banner
  heroBanner: {
    backgroundColor: '#1C1B17',
    borderRadius: 40,
    padding: 32,
    marginHorizontal: 24,
    marginBottom: 16,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.08,
    shadowRadius: 40,
    elevation: 8,
  },
  heroLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#F5C451',
    letterSpacing: 3.2,
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroStats: {
    gap: 8,
    alignItems: 'flex-end',
  },
  heroStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 90,
  },
  heroStatDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  heroStatText: {
    fontSize: 13,
    color: '#D1CEC4',
    fontWeight: '600',
  },
  heroDecoration: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(245, 196, 81, 0.05)',
  },

  // Filter Tabs
  filterRow: {
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  filterScroll: {
    gap: 8,
    paddingVertical: 4,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 50,
    backgroundColor: '#F2F0E9',
  },
  filterTabActive: {
    backgroundColor: '#1C1B17',
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7E7767',
  },
  filterTabTextActive: {
    color: '#FFFFFF',
  },
  filterBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E5E0D4',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  filterBadgeActive: {
    backgroundColor: '#F5C451',
  },
  filterBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7E7767',
  },
  filterBadgeTextActive: {
    color: '#453714',
  },

  // Content
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingBottom: 100,
  },

  // States
  centerState: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: 12,
  },
  stateText: {
    fontSize: 15,
    color: '#7E7767',
    fontWeight: '500',
  },
  emptyState: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FEF8E7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1B17',
    marginBottom: 6,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#7E7767',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  newRequestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F5C451',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 50,
    shadowColor: '#F5C451',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  newRequestButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#453714',
  },

  // Request Card
  requestCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
    elevation: 4,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardDateWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FEF8E7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardDate: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1B17',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 50,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAF9F6',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  cardInfoItem: {
    flex: 1,
    alignItems: 'center',
  },
  cardInfoDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#E5E0D4',
    marginHorizontal: 8,
  },
  cardInfoLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#B5B0A4',
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  cardInfoValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1B17',
  },
  cardReasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 12,
  },
  cardReason: {
    flex: 1,
    fontSize: 13,
    color: '#7E7767',
    fontWeight: '500',
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F2F0E9',
  },
  cardFooterText: {
    fontSize: 11,
    color: '#B5B0A4',
    fontWeight: '500',
  },

  // Pagination
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 20,
  },
  pageButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  pageButtonDisabled: {
    backgroundColor: '#F2F0E9',
    shadowOpacity: 0,
    elevation: 0,
  },
  pageText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1B17',
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F5C451',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F5C451',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
});