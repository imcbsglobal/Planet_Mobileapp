/* eslint-disable prettier/prettier */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    View,
    Animated,
    Pressable,
} from 'react-native';

interface FeederOption {
  id: string;
  title: string;
  description: string;
  icon: string;
  route: string;
}

export default function Feeder() {
  const navigation = useNavigation();
  const [loadingTab, setLoadingTab] = useState<string | null>(null);

  const feederOptions: FeederOption[] = [
    {
      id: '1',
      title: 'Add Feeder',
      description: 'Add new feeder entry',
      icon: 'add-circle-outline',
      route: 'add-feeder',
    }
  ];

  const handleOptionPress = async (route: string) => {
    if (loadingTab) return;
    setLoadingTab(route);
    await new Promise((res) => setTimeout(res, 300));
    
    const routeMap: { [key: string]: string } = {
      'add-feeder': 'AddFeeder',
    };
    
    navigation.navigate(routeMap[route] || route);
    setLoadingTab(null);
  };

  return (
    <View style={styles.container}>
      {loadingTab && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#D4A574" />
        </View>
      )}

      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1C1B17" />
        </Pressable>
        <Text style={styles.headerTitle}>Feeder</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleSection}>
          <Text style={styles.pageTitle}>Feeder Management</Text>
          <Text style={styles.pageSubtitle}>
            Add and manage your feeder entries
          </Text>
        </View>

        <View style={styles.optionsContainer}>
          {feederOptions.map((option) => {
            const scaleAnim = new Animated.Value(1);
            
            const handlePressIn = () => {
              Animated.timing(scaleAnim, {
                toValue: 0.97,
                duration: 150,
                useNativeDriver: true,
              }).start();
            };
            
            const handlePressOut = () => {
              Animated.timing(scaleAnim, {
                toValue: 1,
                duration: 150,
                useNativeDriver: true,
              }).start();
            };
            
            return (
              <Pressable
                key={option.id}
                style={styles.optionWrapper}
                onPress={() => handleOptionPress(option.route)}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
              >
                <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                  <View style={styles.optionItem}>
                    <View style={styles.optionIconContainer}>
                      <Ionicons name={option.icon as any} size={48} color="#D4A574" />
                    </View>
                    <Text style={styles.optionItemTitle}>{option.title}</Text>
                    <Text style={styles.optionItemDescription}>{option.description}</Text>
                  </View>
                </Animated.View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 999,
    justifyContent: 'center',
    alignItems: 'center',
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
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1B17',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 30,
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 40,
    paddingVertical: 20,
  },
  pageTitle: {
    fontSize: 28,
    color: '#1C1B17',
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  pageSubtitle: {
    fontSize: 16,
    color: '#7E7767',
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '500',
  },
  optionsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionWrapper: {
    width: '100%',
    maxWidth: 400,
    marginBottom: 20,
  },
  optionItem: {
    borderRadius: 32,
    padding: 40,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.06,
    shadowRadius: 40,
    elevation: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  optionIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#FEF8E7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  optionItemTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1C1B17',
    marginBottom: 8,
    textAlign: 'center',
  },
  optionItemDescription: {
    fontSize: 16,
    color: '#7E7767',
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '500',
  },
});
