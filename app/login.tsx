import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

export default function LoginScreen() {
  const navigation = useNavigation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const userId = await SecureStore.getItemAsync("userId");
        const password = await SecureStore.getItemAsync("password");

        if (userId && password) {
          navigation.replace('HomeNew');
        } else {
          setIsCheckingAuth(false);
        }
      } catch (error) {
        console.error('Error checking auth:', error);
        setIsCheckingAuth(false);
      }
    };
    
    checkAuth();
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please enter both userid and password.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("https://planet.imcbs.com/api/usermanagement/login/", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: email, password }),
});

if (response.ok) {
  const data = await response.json();
  console.log('Login API response:', JSON.stringify(data));
  if (data.token) {
    const name = data.username || "User";

 
    let departmentArr: string[] = [];
    try {
      const parsed = typeof data.department === 'string' ? JSON.parse(data.department) : data.department;
      departmentArr = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    } catch {
      departmentArr = [];
    }
    const branchesArr: string[] = Array.isArray(data.branches) ? data.branches : [];
    const menuKeysArr: string[] = Array.isArray(data.menu_keys) ? data.menu_keys : [];

    try {
      await SecureStore.setItemAsync('userId', email);
      await SecureStore.setItemAsync('password', password);
      await SecureStore.setItemAsync('username', name);
      await SecureStore.setItemAsync('token', data.token);
      await SecureStore.setItemAsync('loginId', String(data.id ?? ''));
      await SecureStore.setItemAsync('role', data.role || '');
      await SecureStore.setItemAsync('branches', JSON.stringify(branchesArr));
      await SecureStore.setItemAsync('company', data.company || '');
      await SecureStore.setItemAsync('department', JSON.stringify(departmentArr));
      await SecureStore.setItemAsync('menuKeys', JSON.stringify(menuKeysArr));
      console.log('Credentials saved successfully');
    } catch (error) {
      console.error('Error saving credentials:', error);
      Alert.alert('Warning', 'Login successful but failed to save credentials locally');
    }

    navigation.replace('HomeNew', { username: name });

  } else {
    Alert.alert("Login Failed", "Your account is not active.");
  }
} else {
  const errorData = await response.text();
  console.log('Login failed - status:', response.status, 'body:', errorData);
  Alert.alert("Login Failed", `Status ${response.status}: ${errorData}`);
}
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Network or server issue.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#F5C451" />
        <Text style={{ color: '#2C2924', marginTop: 10, fontSize: 16, fontWeight: '600' }}>Checking authentication...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
   
      <View style={styles.decorativeBackground}>
        <View style={styles.decorativeCircle1} />
        <View style={styles.decorativeCircle2} />
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
       
          <View style={styles.header}>
            <Image 
              source={require('../assets/images/logo_blk.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.brandName}>MY IMC</Text>
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.subtitle}>Please enter your details to sign in</Text>
          </View>

          {/* Form Section */}
          <View style={styles.formSection}>
            {/* Email Field */}
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>EMAIL ADDRESS</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={20} color="#6E695F" style={styles.inputIcon} />
                <TextInput
                  placeholder="name@company.com"
                  placeholderTextColor="rgba(110, 105, 95, 0.4)"
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  editable={!isLoading}
                  returnKeyType="next"
                  keyboardType="email-address"
                />
              </View>
            </View>

            {/* Password Field */}
            <View style={styles.fieldContainer}>
              <View style={styles.labelRow}>
                <Text style={styles.labelInRow}>PASSWORD</Text>
                <TouchableOpacity>
                  <Text style={styles.forgotText}>Forgot?</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={20} color="#6E695F" style={styles.inputIcon} />
                <TextInput
                  placeholder="••••••••"
                  placeholderTextColor="rgba(110, 105, 95, 0.4)"
                  style={styles.passwordInput}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  editable={!isLoading}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                  <Ionicons 
                    name={showPassword ? "eye-outline" : "eye-off-outline"} 
                    size={20} 
                    color="#6E695F" 
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Login Button */}
            <TouchableOpacity
              style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#1A1A1A" />
              ) : (
                <>
                  <Text style={styles.loginButtonText}>Log In</Text>
                  <Ionicons name="arrow-forward" size={20} color="#1A1A1A" />
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Don't have an account?{' '}
              <Text style={styles.footerLink}>Contact Admin</Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FDFCF8',
  },
  decorativeBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    zIndex: -1,
  },
  decorativeCircle1: {
    position: 'absolute',
    top: '5%',
    right: '10%',
    width: 500,
    height: 500,
    borderRadius: 250,
    backgroundColor: 'rgba(245, 196, 81, 0.05)',
  },
  decorativeCircle2: {
    position: 'absolute',
    bottom: '5%',
    left: '5%',
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: 'rgba(245, 196, 81, 0.03)',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoImage: {
    width: 120,
    height: 120,
    marginBottom: 24,
  },
  brandName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#2C2924',
    letterSpacing: 2,
    marginBottom: 8,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#2C2924',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#6E695F',
    fontWeight: '500',
  },
  formSection: {
    marginBottom: 32,
  },
  fieldContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5C584F',
    letterSpacing: 1.6,
    marginBottom: 8,
    paddingLeft: 20,
  },
  labelInRow: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5C584F',
    letterSpacing: 1.6,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingLeft: 20,
    paddingRight: 20,
  },
  forgotText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#5C584F',
    letterSpacing: 0.5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F5EE',
    borderRadius: 50,
    paddingHorizontal: 20,
    height: 56,
    borderWidth: 0,
  },
  inputIcon: {
    marginRight: 12,
    opacity: 0.6,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#2C2924',
    fontWeight: '500',
  },
  passwordInput: {
    flex: 1,
    fontSize: 16,
    color: '#2C2924',
    fontWeight: '500',
  },
  eyeIcon: {
    padding: 8,
    opacity: 0.6,
  },
  loginButton: {
    backgroundColor: '#F5C451',
    borderRadius: 50,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    shadowColor: '#F5C451',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 8,
  },
  loginButtonDisabled: {
    opacity: 0.6,
    shadowOpacity: 0.2,
  },
  loginButtonText: {
    color: '#1A1A1A',
    fontSize: 16,
    fontWeight: '800',
    marginRight: 8,
  },
  footer: {
    alignItems: 'center',
    marginTop: 16,
  },
  footerText: {
    fontSize: 14,
    color: '#6E695F',
    fontWeight: '500',
  },
  footerLink: {
    color: '#2C2924',
    fontWeight: '700',
  },
});