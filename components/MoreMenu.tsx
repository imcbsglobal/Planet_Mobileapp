import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as SecureStore from '../lib/secureStore';
import React from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface MoreMenuProps {
  visible: boolean;
  onClose: () => void;
}

export default function MoreMenu({ visible, onClose }: MoreMenuProps) {
  const navigation = useNavigation();

  const handleMenuOption = (route: string) => {
    onClose();
    setTimeout(() => {
      const routeMap: { [key: string]: string } = {
        'profile': 'Profile',
        'leads': 'Leads',
      };
      navigation.navigate(routeMap[route] || route);
    }, 200);
  };

  const handleLogout = () => {
    onClose();
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await SecureStore.deleteItemAsync('userId');
            await SecureStore.deleteItemAsync('password');
            await SecureStore.deleteItemAsync('username');
            navigation.replace('Login');
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View style={styles.moreMenuContainer}>
          <View style={styles.moreMenuHeader}>
            <Text style={styles.moreMenuTitle}>More Options</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close-circle" size={24} color="#7E7767" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.moreMenuItem}
            onPress={() => handleMenuOption('profile')}
          >
            <View style={styles.moreMenuIconContainer}>
              <Ionicons name="person-circle-outline" size={24} color="#D4A574" />
            </View>
            <View style={styles.moreMenuTextContainer}>
              <Text style={styles.moreMenuItemTitle}>Profile</Text>
              <Text style={styles.moreMenuItemSubtitle}>View and edit profile</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#7E7767" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.moreMenuItem}
            onPress={() => handleMenuOption('leads')}
          >
            <View style={styles.moreMenuIconContainer}>
              <Ionicons name="people-outline" size={24} color="#D4A574" />
            </View>
            <View style={styles.moreMenuTextContainer}>
              <Text style={styles.moreMenuItemTitle}>Leads</Text>
              <Text style={styles.moreMenuItemSubtitle}>Manage your leads</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#7E7767" />
          </TouchableOpacity>

          <View style={styles.menuDivider} />

          <TouchableOpacity
            style={[styles.moreMenuItem, styles.logoutItem]}
            onPress={handleLogout}
          >
            <View style={[styles.moreMenuIconContainer, styles.logoutIconContainer]}>
              <Ionicons name="log-out-outline" size={24} color="#EF4444" />
            </View>
            <View style={styles.moreMenuTextContainer}>
              <Text style={[styles.moreMenuItemTitle, styles.logoutText]}>Logout</Text>
              <Text style={styles.moreMenuItemSubtitle}>Sign out of your account</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  moreMenuContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 12,
  },
  moreMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  moreMenuTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1B17',
  },
  moreMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#FAF9F6',
    borderRadius: 16,
    marginBottom: 12,
  },
  moreMenuIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FEF8E7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  moreMenuTextContainer: {
    flex: 1,
  },
  moreMenuItemTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1B17',
    marginBottom: 2,
  },
  moreMenuItemSubtitle: {
    fontSize: 12,
    color: '#7E7767',
    fontWeight: '500',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 12,
  },
  logoutItem: {
    backgroundColor: '#FEF2F2',
  },
  logoutIconContainer: {
    backgroundColor: '#FEE2E2',
  },
  logoutText: {
    color: '#EF4444',
  },
});
