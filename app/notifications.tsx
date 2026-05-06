/* eslint-disable prettier/prettier */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';

interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  type: 'info' | 'success' | 'warning' | 'error';
}

export default function Notifications() {
  const navigation = useNavigation();
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const formatTime = (timeString: string) => {
    try {
      const date = new Date(timeString);
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return timeString;
    }
  };

  const checkTimeAndAddNotifications = async () => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentTime = hours * 60 + minutes;
    const punchInTime = 9 * 60 + 30;
    const punchOutTime = 18 * 60;
    const newNotifications: Notification[] = [];

    const userId = await SecureStore.getItemAsync('userId');
    const password = await SecureStore.getItemAsync('password');
    let punchData = null;

    if (userId && password) {
      try {
        const month = new Date().getMonth() + 1;
        const year = new Date().getFullYear();
        const todayDate = new Date().toISOString().split('T')[0];
        const response = await fetch(
          `https://myimc.in/flutter/attendance/monthly/?userid=${userId}&password=${password}&month=${month}&year=${year}`
        );
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            const todayRecord = data.attendance_records.find((r: any) => r.date === todayDate);
            if (todayRecord) punchData = { punchIn: todayRecord.punch_in, punchOut: todayRecord.punch_out };
          }
        }
      } catch (error) {
        console.error('Error fetching punch data:', error);
      }
    }

    const currentTimestamp = now.getTime();
    const twentyFourHoursAgo = currentTimestamp - (24 * 60 * 60 * 1000);

    if (punchData?.punchIn) {
      const punchInTime = new Date(punchData.punchIn).getTime();
      if (punchInTime > twentyFourHoursAgo) {
        newNotifications.push({
          id: 'punch-in-success',
          title: 'Punch In Successful',
          message: `Good! You punched in at ${formatTime(punchData.punchIn)}`,
          time: punchData.punchIn,
          read: false,
          type: 'success',
        });
      }
    } else if (currentTime < punchInTime) {
      newNotifications.push({
        id: 'punch-in-reminder',
        title: 'Punch In Reminder',
        message: "Don't forget to punch in at 9:30 AM",
        time: new Date().toISOString(),
        read: false,
        type: 'warning',
      });
    } else {
      newNotifications.push({
        id: 'punch-in-alert',
        title: 'Punch In Alert',
        message: "It's past 9:30 AM! Please punch in now.",
        time: new Date().toISOString(),
        read: false,
        type: 'error',
      });
      Alert.alert('Punch In Alert', "It's past 9:30 AM! Don't forget to punch in.", [{ text: 'OK' }]);
    }

    if (punchData?.punchOut) {
      const punchOutTime = new Date(punchData.punchOut).getTime();
      if (punchOutTime > twentyFourHoursAgo) {
        newNotifications.push({
          id: 'punch-out-success',
          title: 'Punch Out Successful',
          message: `Good! You punched out at ${formatTime(punchData.punchOut)}`,
          time: punchData.punchOut,
          read: false,
          type: 'success',
        });
      }
    } else if (currentTime < punchOutTime) {
      newNotifications.push({
        id: 'punch-out-reminder',
        title: 'Punch Out Reminder',
        message: "Don't forget to punch out at 6:00 PM",
        time: new Date().toISOString(),
        read: false,
        type: 'warning',
      });
    } else {
      newNotifications.push({
        id: 'punch-out-alert',
        title: 'Punch Out Alert',
        message: "It's past 6:00 PM! Please punch out now.",
        time: new Date().toISOString(),
        read: false,
        type: 'error',
      });
      Alert.alert('Punch Out Alert', "It's past 6:00 PM! Don't forget to punch out.", [{ text: 'OK' }]);
    }

    setNotifications(newNotifications);
  };

  useEffect(() => {
    checkTimeAndAddNotifications();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise((res) => setTimeout(res, 1000));
    setRefreshing(false);
  };

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((notif) => (notif.id === id ? { ...notif, read: true } : notif))
    );
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((notif) => ({ ...notif, read: true })));
  };

  const getIconName = (type: string) => {
    switch (type) {
      case 'success': return 'checkmark-circle';
      case 'warning': return 'alert-circle';
      case 'error': return 'close-circle';
      default: return 'information-circle';
    }
  };

  const getIconColor = (type: string) => {
    switch (type) {
      case 'success': return '#4CAF50';
      case 'warning': return '#F4C84A';
      case 'error': return '#F44336';
      default: return '#87847b';
    }
  };

  const getIconBgColor = (type: string) => {
    switch (type) {
      case 'success': return 'rgba(76, 175, 80, 0.1)';
      case 'warning': return 'rgba(244, 200, 74, 0.15)';
      case 'error': return 'rgba(244, 67, 54, 0.1)';
      default: return 'rgba(135, 132, 123, 0.1)';
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1C1B17" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Notifications</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F4C84A" />
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {notifications.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconContainer}>
              <Ionicons name="notifications-off-outline" size={64} color="#87847b" />
            </View>
            <Text style={styles.emptyTitle}>No notifications</Text>
            <Text style={styles.emptySubtitle}>You're all caught up!</Text>
          </View>
        ) : (
          <>
            {unreadCount > 0 && (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>New</Text>
              </View>
            )}
            {notifications
              .filter((n) => !n.read)
              .map((notification) => (
                <TouchableOpacity
                  key={notification.id}
                  style={styles.notificationCard}
                  onPress={() => markAsRead(notification.id)}
                  activeOpacity={0.7}
                >
                  <LinearGradient
                    colors={['rgba(255, 255, 255, 0.98)', 'rgba(246, 241, 232, 0.95)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.cardGradient}
                  >
                    <View style={[styles.notificationIcon, { backgroundColor: getIconBgColor(notification.type) }]}>
                      <Ionicons
                        name={getIconName(notification.type) as any}
                        size={28}
                        color={getIconColor(notification.type)}
                      />
                    </View>
                    <View style={styles.notificationContent}>
                      <View style={styles.notificationHeader}>
                        <Text style={styles.notificationTitle}>{notification.title}</Text>
                        <View style={styles.unreadDot} />
                      </View>
                      <Text style={styles.notificationMessage}>{notification.message}</Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              ))}
            {notifications.filter((n) => n.read).length > 0 && (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Earlier</Text>
              </View>
            )}
            {notifications
              .filter((n) => n.read)
              .map((notification) => (
                <TouchableOpacity
                  key={notification.id}
                  style={styles.notificationCard}
                  activeOpacity={0.7}
                >
                  <View style={styles.cardRead}>
                    <View style={[styles.notificationIcon, { backgroundColor: getIconBgColor(notification.type) }]}>
                      <Ionicons
                        name={getIconName(notification.type) as any}
                        size={28}
                        color={getIconColor(notification.type)}
                      />
                    </View>
                    <View style={styles.notificationContent}>
                      <Text style={styles.notificationTitleRead}>{notification.title}</Text>
                      <Text style={styles.notificationMessageRead}>{notification.message}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
          </>
        )}
      </ScrollView>
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
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1B17',
  },
  headerBadge: {
    backgroundColor: '#F44336',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  headerBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  markAllButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  placeholder: {
    width: 44,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 30,
  },
  sectionHeader: {
    marginTop: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7E7767',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  notificationCard: {
    marginBottom: 16,
    borderRadius: 32,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.06,
    shadowRadius: 40,
    elevation: 6,
  },
  cardGradient: {
    flexDirection: 'row',
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
  },
  cardRead: {
    flexDirection: 'row',
    padding: 20,
    backgroundColor: '#FFFFFF',
    opacity: 0.7,
  },
  notificationIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  notificationContent: {
    flex: 1,
    justifyContent: 'center',
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1B17',
    flex: 1,
  },
  notificationTitleRead: {
    fontSize: 16,
    fontWeight: '600',
    color: '#7E7767',
    marginBottom: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D4A574',
    marginLeft: 8,
  },
  notificationMessage: {
    fontSize: 14,
    color: '#1C1B17',
    fontWeight: '500',
    marginBottom: 8,
    lineHeight: 20,
  },
  notificationMessageRead: {
    fontSize: 14,
    color: '#7E7767',
    fontWeight: '500',
    marginBottom: 8,
    lineHeight: 20,
  },
  notificationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notificationTime: {
    fontSize: 13,
    color: '#87847b',
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 120,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FEF8E7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 4,
  },
  emptyTitle: {
    fontSize: 20,
    color: '#1C1B17',
    fontWeight: '800',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#7E7767',
    fontWeight: '500',
  },
});
