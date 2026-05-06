/* eslint-disable prettier/prettier */
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Linking,
  Image,
} from 'react-native';

export default function About() {
  const navigation = useNavigation();

  const services = [
    {
      id: '1',
      icon: 'code-slash-outline',
      title: 'Business Software',
      description: 'Custom software solutions tailored to your business needs',
    },
    {
      id: '2',
      icon: 'phone-portrait-outline',
      title: 'Mobile Apps',
      description: 'Native and cross-platform mobile applications',
    },
    {
      id: '3',
      icon: 'globe-outline',
      title: 'Web Development',
      description: 'Responsive websites that drive real results',
    },
    {
      id: '4',
      icon: 'hardware-chip-outline',
      title: 'Hardware Solutions',
      description: 'Complete hardware setup and integration',
    },
    {
      id: '5',
      icon: 'construct-outline',
      title: 'IT Support',
      description: 'Reliable technical support and maintenance',
    },
    {
      id: '6',
      icon: 'briefcase-outline',
      title: 'IT Services',
      description: 'Comprehensive IT solutions for businesses',
    },
  ];

  const handleContactPress = () => {
    Linking.openURL('https://imcbs.com/');
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#805f00" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ABOUT</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Company Logo Section */}
        <View style={styles.logoSection}>
          <View style={styles.logoContainer}>
            <Image 
              source={require('../assets/images/logo-CZ_O9-fJ.png')} 
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.companyName}>IMC Business Solutions</Text>
          <Text style={styles.companyTagline}>Powering Your Success Since 2009</Text>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconContainer}>
              <Ionicons name="information-circle" size={24} color="#805f00" />
            </View>
            <Text style={styles.sectionTitle}>WHO WE ARE</Text>
          </View>
          <Text style={styles.paragraph}>
            <Text style={styles.boldText}>IMCB Solutions LLP</Text>, popularly known as{' '}
            <Text style={styles.boldText}>IMC Business Solutions</Text>, is a leading software 
            development company based in Wayanad. Since 2009, we've been delivering smart, 
            tailored software and IT services to help businesses grow and run efficiently.
          </Text>
          <Text style={styles.paragraph}>
            From business software and mobile apps to web development, hardware solutions, 
            and IT support—we provide everything needed to power your success.
          </Text>
        </View>

        {/* Mission Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconContainer}>
              <Ionicons name="rocket" size={24} color="#805f00" />
            </View>
            <Text style={styles.sectionTitle}>OUR MISSION</Text>
          </View>
          <Text style={styles.paragraph}>
            We specialize in creating custom websites that not only look great but also 
            drive real results. Your website is the face of your brand, and we're here 
            to make sure it leaves a lasting impression.
          </Text>
        </View>

        {/* Services Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconContainer}>
              <Ionicons name="grid" size={24} color="#805f00" />
            </View>
            <Text style={styles.sectionTitle}>OUR SERVICES</Text>
          </View>
          <View style={styles.servicesGrid}>
            {services.map((service) => (
              <View key={service.id} style={styles.serviceCard}>
                <View style={styles.serviceIconContainer}>
                  <Ionicons name={service.icon as any} size={28} color="#805f00" />
                </View>
                <Text style={styles.serviceTitle}>{service.title}</Text>
                <Text style={styles.serviceDescription}>{service.description}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Company Info Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconContainer}>
              <Ionicons name="business" size={24} color="#805f00" />
            </View>
            <Text style={styles.sectionTitle}>COMPANY DETAILS</Text>
          </View>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Ionicons name="document-text-outline" size={20} color="#666559" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Legal Name</Text>
                <Text style={styles.infoValue}>IMCB Solutions LLP</Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Ionicons name="storefront-outline" size={20} color="#666559" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Trading As</Text>
                <Text style={styles.infoValue}>IMC Business Solutions</Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={20} color="#666559" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Established</Text>
                <Text style={styles.infoValue}>2009</Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={20} color="#666559" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Location</Text>
                <Text style={styles.infoValue}>Wayanad, Kerala</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Contact Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconContainer}>
              <Ionicons name="mail" size={24} color="#805f00" />
            </View>
            <Text style={styles.sectionTitle}>GET IN TOUCH</Text>
          </View>
          <TouchableOpacity style={styles.contactButton} onPress={handleContactPress}>
            <Ionicons name="globe-outline" size={20} color="#ffffff" />
            <Text style={styles.contactButtonText}>Visit Our Website</Text>
            <Ionicons name="arrow-forward" size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Officially registered as IMCB Solutions LLP
          </Text>
          <Text style={styles.footerSubtext}>
            Widely recognized and trusted in the market as IMC Business Solutions
          </Text>
          <Text style={styles.copyright}>© 2009-2024 IMCB Solutions LLP</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fffbff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: 'rgba(255, 251, 255, 0.8)',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f7f4e7',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#805f00',
    letterSpacing: 3.2,
  },
  placeholder: {
    width: 44,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  logoSection: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  logoContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#805f00',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
    borderWidth: 3,
    borderColor: '#f7f4e7',
    padding: 20,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  companyName: {
    fontSize: 24,
    fontWeight: '900',
    color: '#39382e',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  companyTagline: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666559',
    textAlign: 'center',
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  sectionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fef8e7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#805f00',
    letterSpacing: 2.4,
  },
  paragraph: {
    fontSize: 16,
    lineHeight: 26,
    color: '#39382e',
    marginBottom: 16,
    fontWeight: '400',
  },
  boldText: {
    fontWeight: '700',
    color: '#805f00',
  },
  servicesGrid: {
    gap: 16,
  },
  serviceCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#39382e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#f7f4e7',
  },
  serviceIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fef8e7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  serviceTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#39382e',
    marginBottom: 8,
  },
  serviceDescription: {
    fontSize: 14,
    lineHeight: 22,
    color: '#666559',
    fontWeight: '400',
  },
  infoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#39382e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#f7f4e7',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666559',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#39382e',
  },
  divider: {
    height: 1,
    backgroundColor: '#f7f4e7',
    marginVertical: 4,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#805f00',
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 16,
    gap: 12,
    shadowColor: '#805f00',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  contactButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  footer: {
    alignItems: 'center',
    marginTop: 20,
    paddingTop: 32,
    borderTopWidth: 1,
    borderTopColor: '#f7f4e7',
  },
  footerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666559',
    textAlign: 'center',
    marginBottom: 8,
  },
  footerSubtext: {
    fontSize: 12,
    fontWeight: '400',
    color: '#bcb9ab',
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  copyright: {
    fontSize: 12,
    fontWeight: '600',
    color: '#bcb9ab',
    textAlign: 'center',
  },
});
