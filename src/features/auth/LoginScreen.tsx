import { Divider } from '@/components/ui';
import { signInWithPasswordAndSyncAccessToken } from '@/lib/auth';
import { useAuthStore } from '@/state/authStore';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setAuthed = useAuthStore((state) => state.setAuthed);

  const handleLogin = async () => {
    let hasError = false;

    if (!email.trim()) {
      setEmailError('Please enter your email address');
      hasError = true;
    } else {
      setEmailError(null);
    }

    if (!password.trim()) {
      setPasswordError('Please enter your password');
      hasError = true;
    } else {
      setPasswordError(null);
    }

    if (hasError) return;

    setSubmitting(true);
    const { data, error } = await signInWithPasswordAndSyncAccessToken({
      email: email.trim(),
      password,
    });
    setSubmitting(false);

    if (error) {
      if (error.statusCode === 403) {
        router.push({ pathname: '/otp', params: { email: email.trim() } });
        return;
      }
      Alert.alert('Could not sign in', error.message);
      return;
    }

    const userId = data?.user?.id;
    if (!userId) {
      Alert.alert('Could not sign in', 'We could not confirm your account details. Please try again.');
      return;
    }

    await setAuthed(true, data?.refreshToken, userId);
    router.replace('/discover');
  };

  const handleForgotPress = () => {
    Alert.alert('Password reset coming soon');
  };

  const handleGooglePress = () => {
    Alert.alert('Google sign in coming soon');
  };

  const handleApplePress = () => {
    Alert.alert('Apple sign in coming soon');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.inner,
          {
            paddingTop: Math.max(insets.top + 8, 24),
            paddingBottom: Math.max(insets.bottom, 32),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Profile avatar placeholder */}
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={46} color="#26344F" />
          </View>
        </View>

        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to your account to continue</Text>

        {/* Email */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Email</Text>
          <View style={styles.inputBox}>
            <Ionicons name="mail-outline" size={20} color="#26344F" style={styles.inputIcon} />
            <TextInput
              style={styles.textInput}
              placeholder="you@example.com"
              placeholderTextColor="#A0ABBB"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                setEmailError(null);
              }}
            />
          </View>
          {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
        </View>

        {/* Password */}
        <View style={styles.fieldGroup}>
          <View style={styles.fieldLabelRow}>
            <Text style={styles.fieldLabel}>Password</Text>
            <TouchableOpacity onPress={handleForgotPress} activeOpacity={0.7}>
              <Text style={styles.forgotLink}>Forgot?</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.inputBox}>
            <Ionicons name="lock-closed-outline" size={20} color="#26344F" style={styles.inputIcon} />
            <TextInput
              style={styles.textInput}
              placeholder="Enter password"
              placeholderTextColor="#A0ABBB"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setPasswordError(null);
              }}
            />
            <TouchableOpacity
              onPress={() => setShowPassword((v) => !v)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={22}
                color="#7B8387"
              />
            </TouchableOpacity>
          </View>
          {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
        </View>

        {/* Login button */}
        <TouchableOpacity
          style={[styles.loginBtn, submitting && styles.loginBtnDisabled]}
          onPress={handleLogin}
          activeOpacity={0.85}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.loginBtnText}>Login</Text>
          )}
        </TouchableOpacity>

        {/* OR CONTINUE WITH divider */}
        <Divider label="OR CONTINUE WITH" spacing="lg" />

        {/* Social buttons */}
        <View style={styles.socialRow}>
          <TouchableOpacity style={styles.socialBtn} activeOpacity={0.8} onPress={handleGooglePress}>
            <Ionicons name="logo-google" size={20} color="#4285F4" />
            <Text style={styles.socialBtnText}>Google</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.socialBtn} activeOpacity={0.8} onPress={handleApplePress}>
            <Ionicons name="logo-apple" size={22} color="#000000" />
            <Text style={styles.socialBtnText}>Apple</Text>
          </TouchableOpacity>
        </View>

        {/* Sign up */}
        <View style={styles.signupRow}>
          <Text style={styles.signupText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => router.push('/signup')} activeOpacity={0.7}>
            <Text style={styles.signupLink}>Sign Up</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E7F1F9',
  },
  inner: {
    paddingHorizontal: 24,
  },
  avatarWrap: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#CDD5DC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#26344F',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#7B8387',
    textAlign: 'center',
    marginBottom: 36,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#26344F',
    marginBottom: 8,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  forgotLink: {
    fontSize: 14,
    fontWeight: '700',
    color: '#26344F',
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E0E8F0',
    paddingHorizontal: 14,
    height: 56,
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: '#26344F',
  },
  errorText: {
    marginTop: 8,
    fontSize: 13,
    color: '#EF4444',
    fontWeight: '500',
  },
  loginBtn: {
    backgroundColor: '#FE5035',
    paddingVertical: 18,
    borderRadius: 32,
    alignItems: 'center',
    shadowColor: '#FE5035',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  loginBtnDisabled: {
    opacity: 0.7,
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  socialBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E0E8F0',
    paddingVertical: 14,
  },
  socialBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#26344F',
  },
  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signupText: {
    fontSize: 15,
    color: '#7B8387',
  },
  signupLink: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FE5035',
  },
});
