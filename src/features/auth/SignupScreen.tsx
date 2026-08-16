import { BackButton } from '@/components/ui';
import { syncAuthAccessToken } from '@/lib/auth';
import { insforge } from '@/lib/insforge';
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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SignupScreen() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [firstNameError, setFirstNameError] = useState<string | null>(null);
  const [lastNameError, setLastNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setAuthed = useAuthStore((state) => state.setAuthed);

  const handleCreateAccount = async () => {
    let hasError = false;

    if (!firstName.trim()) {
      setFirstNameError('Please enter your first name');
      hasError = true;
    } else {
      setFirstNameError(null);
    }

    if (!lastName.trim()) {
      setLastNameError('Please enter your last name');
      hasError = true;
    } else {
      setLastNameError(null);
    }

    if (!email.trim()) {
      setEmailError('Please enter your email');
      hasError = true;
    } else if (!EMAIL_REGEX.test(email.trim())) {
      setEmailError('Please enter a valid email address');
      hasError = true;
    } else {
      setEmailError(null);
    }

    if (!phone.trim()) {
      setPhoneError('Please enter your phone number');
      hasError = true;
    } else {
      setPhoneError(null);
    }

    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      hasError = true;
    } else {
      setPasswordError(null);
    }

    if (confirmPassword !== password) {
      setConfirmError('Passwords do not match');
      hasError = true;
    } else {
      setConfirmError(null);
    }

    if (hasError) return;

    setSubmitting(true);

    // Backend verification: block signup on a pre-existing customers row,
    // independent of whatever InsForge auth itself reports.
    const { data: existingEmail, error: emailLookupError } = await insforge.database
      .from('customers')
      .select('id')
      .eq('email', email.trim())
      .maybeSingle();

    if (emailLookupError) {
      setSubmitting(false);
      Alert.alert('Something went wrong', emailLookupError.message);
      return;
    }

    if (existingEmail) {
      setSubmitting(false);
      setEmailError('Email already exists.');
      return;
    }

    const { data: existingPhone, error: phoneLookupError } = await insforge.database
      .from('customers')
      .select('id')
      .eq('phone_number', phone.trim())
      .maybeSingle();

    if (phoneLookupError) {
      setSubmitting(false);
      Alert.alert('Something went wrong', phoneLookupError.message);
      return;
    }

    if (existingPhone) {
      setSubmitting(false);
      setPhoneError('Phone number already exists.');
      return;
    }

    const { data, error } = await insforge.auth.signUp({
      email: email.trim(),
      password,
      name: `${firstName.trim()} ${lastName.trim()}`.trim(),
    });
    setSubmitting(false);

    if (error) {
      Alert.alert('Could not create account', error.message);
      return;
    }

    if (data?.requireEmailVerification) {
      router.push({
        pathname: '/otp',
        params: {
          email: email.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
        },
      });
    } else if (data?.accessToken) {
      syncAuthAccessToken(data.accessToken);

      const { error: insertError } = await insforge.database.from('customers').insert([
        {
          auth_id: data?.user?.id,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          phone_number: phone.trim(),
          email_verified: true,
        },
      ]);

      if (insertError) {
        Alert.alert('Could not finish setting up your account', insertError.message);
        return;
      }

      await setAuthed(true, data?.refreshToken, data?.user?.id);
      router.replace('/(customer)/discover');
    }
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
            paddingBottom: Math.max(insets.bottom + 80, 100),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <BackButton onPress={() => router.back()} style={styles.backBtn} />

        {/* Headline — left-aligned */}
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>Enter your details below</Text>

        {/* Form */}
        <View style={styles.form}>
          {/* First / Last Name */}
          <View style={styles.row}>
            <View style={styles.rowItem}>
              <View style={styles.inputBox}>
                <Ionicons name="person-outline" size={20} color="#7B8387" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  placeholder="First Name"
                  placeholderTextColor="#A0ABBB"
                  autoCapitalize="words"
                  value={firstName}
                  onChangeText={(t) => {
                    setFirstName(t);
                    setFirstNameError(null);
                  }}
                />
              </View>
              {firstNameError ? <Text style={styles.errorText}>{firstNameError}</Text> : null}
            </View>

            <View style={styles.rowItem}>
              <View style={styles.inputBox}>
                <Ionicons name="person-outline" size={20} color="#7B8387" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  placeholder="Last Name"
                  placeholderTextColor="#A0ABBB"
                  autoCapitalize="words"
                  value={lastName}
                  onChangeText={(t) => {
                    setLastName(t);
                    setLastNameError(null);
                  }}
                />
              </View>
              {lastNameError ? <Text style={styles.errorText}>{lastNameError}</Text> : null}
            </View>
          </View>

          {/* Email */}
          <View>
            <View style={styles.inputBox}>
              <Ionicons name="mail-outline" size={20} color="#7B8387" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="Email"
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

          {/* Phone Number */}
          <View>
            <View style={styles.inputBox}>
              <Ionicons name="call-outline" size={20} color="#7B8387" style={styles.inputIcon} />
              <View style={styles.countryChip}>
                <Text style={styles.countryCode}>+260</Text>
              </View>
              <TextInput
                style={[styles.textInput, { marginLeft: 10 }]}
                placeholder="Phone Number"
                placeholderTextColor="#A0ABBB"
                keyboardType="number-pad"
                value={phone}
                onChangeText={(t) => {
                  setPhone(t);
                  setPhoneError(null);
                }}
                maxLength={10}
              />
            </View>
            {phoneError ? <Text style={styles.errorText}>{phoneError}</Text> : null}
          </View>

          {/* Password */}
          <View>
            <View style={styles.inputBox}>
              <Ionicons name="lock-closed-outline" size={20} color="#7B8387" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="Password"
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
            {passwordError ? (
              <Text style={styles.errorText}>{passwordError}</Text>
            ) : (
              <Text style={styles.hint}>At least 8 characters</Text>
            )}
          </View>

          {/* Confirm Password */}
          <View>
            <View style={styles.inputBox}>
              <Ionicons name="lock-closed-outline" size={20} color="#7B8387" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="Confirm Password"
                placeholderTextColor="#A0ABBB"
                secureTextEntry={!showConfirm}
                value={confirmPassword}
                onChangeText={(t) => {
                  setConfirmPassword(t);
                  setConfirmError(null);
                }}
              />
              <TouchableOpacity
                onPress={() => setShowConfirm((v) => !v)}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                  size={22}
                  color="#7B8387"
                />
              </TouchableOpacity>
            </View>
            {confirmError ? <Text style={styles.errorText}>{confirmError}</Text> : null}
          </View>
        </View>

        {/* Create Account button */}
        <TouchableOpacity
          style={[styles.createBtn, submitting && styles.createBtnDisabled]}
          onPress={handleCreateAccount}
          activeOpacity={0.85}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.createBtnText}>Create Account</Text>
          )}
        </TouchableOpacity>

        {/* Sign In link */}
        <View style={styles.signInRow}>
          <Text style={styles.signInText}>Continue With? </Text>
          <TouchableOpacity onPress={() => router.replace('/auth')} activeOpacity={0.7}>
            <Text style={styles.signInLink}>Sign In</Text>
          </TouchableOpacity>
        </View>

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
      </ScrollView>

      {/* Wave decoration at bottom */}
      <View style={styles.wave} pointerEvents="none" />
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

  // Back button — white circle with shadow
  backBtn: {
    alignSelf: 'flex-start',
    marginBottom: 28,
  },

  // Headline — left-aligned
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#26344F',
    marginBottom: 6,
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 15,
    color: '#7B8387',
    marginBottom: 32,
  },

  // Form
  form: {
    gap: 14,
    marginBottom: 28,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  rowItem: {
    flex: 1,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E4EDF4',
    paddingHorizontal: 16,
    height: 58,
  },
  inputIcon: {
    marginRight: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: '#26344F',
  },

  // Country chip for phone field
  countryChip: {
    backgroundColor: '#E0E8F0',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  countryCode: {
    fontSize: 14,
    fontWeight: '600',
    color: '#26344F',
  },

  // Password hint
  hint: {
    fontSize: 12,
    color: '#7B8387',
    marginTop: 6,
    marginLeft: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '500',
    marginTop: 6,
    marginLeft: 4,
  },

  // Create Account button
  createBtn: {
    backgroundColor: '#FE5035',
    paddingVertical: 18,
    borderRadius: 32,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#FE5035',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  createBtnDisabled: {
    opacity: 0.7,
  },
  createBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Sign In link
  signInRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  signInText: {
    fontSize: 15,
    color: '#7B8387',
  },
  signInLink: {
    fontSize: 15,
    fontWeight: '600',
    color: '#26344F',
  },

  // Social buttons — compact pill, not full-width
  socialRow: {
    flexDirection: 'row',
    gap: 12,
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: '#E0E8F0',
    paddingVertical: 13,
    paddingHorizontal: 24,
  },
  socialBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#26344F',
  },

  // Wave decoration — approximated with a large rounded rectangle
  wave: {
    position: 'absolute',
    bottom: -50,
    left: -30,
    right: -30,
    height: 90,
    backgroundColor: '#C8D5DE',
    borderTopLeftRadius: 60,
    borderTopRightRadius: 60,
  },
});
