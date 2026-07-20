import { BackButton } from '@/components/ui';
import { syncAuthAccessToken } from '@/lib/auth';
import { insforge } from '@/lib/insforge';
import { useAuthStore } from '@/state/authStore';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TextInput,
  TextInputKeyPressEventData,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const OTP_LENGTH = 6;
const RESEND_SECONDS = 44;

export function OtpScreen() {
  const { email, firstName, lastName, phone } = useLocalSearchParams<{
    email?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  }>();
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const inputRefs = useRef<Array<TextInput | null>>(Array(OTP_LENGTH).fill(null));
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setAuthed = useAuthStore((state) => state.setAuthed);

  const displayEmail = email || '';

  // Auto-focus first box on mount
  useEffect(() => {
    const t = setTimeout(() => inputRefs.current[0]?.focus(), 150);
    return () => clearTimeout(t);
  }, []);

  // Countdown timer
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const interval = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(interval);
  }, [secondsLeft]);

  const allFilled = digits.every((d) => d !== '');

  const handleChange = (text: string, index: number) => {
    const digit = text.replace(/[^0-9]/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
    if (digit && newDigits.every((d) => d !== '')) {
      handleVerify(newDigits);
    }
  };

  const handleKeyPress = (
    e: NativeSyntheticEvent<TextInputKeyPressEventData>,
    index: number,
  ) => {
    if (e.nativeEvent.key === 'Backspace') {
      if (digits[index]) {
        const newDigits = [...digits];
        newDigits[index] = '';
        setDigits(newDigits);
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    }
  };

  const handleResend = async () => {
    if (!displayEmail || resending) return;
    setResending(true);
    const { error } = await insforge.auth.resendVerificationEmail({ email: displayEmail });
    setResending(false);

    if (error) {
      Alert.alert('Could not resend code', error.message);
      return;
    }

    Alert.alert('Code sent', `A new code was sent to ${displayEmail}`);
    setDigits(Array(OTP_LENGTH).fill(''));
    setSecondsLeft(RESEND_SECONDS);
    setTimeout(() => inputRefs.current[0]?.focus(), 50);
  };

  const handleVerify = async (currentDigits: string[] = digits) => {
    if (!currentDigits.every((d) => d !== '') || !displayEmail || verifying) return;

    setVerifying(true);
    const { data, error } = await insforge.auth.verifyEmail({
      email: displayEmail,
      otp: currentDigits.join(''),
    });

    if (error) {
      setVerifying(false);
      Alert.alert('Invalid code', 'That code is incorrect or has expired. Please try again.');
      setDigits(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
      return;
    }

    syncAuthAccessToken(data?.accessToken ?? null);

    // Only now that the code is verified do we create the customer profile.
    const { error: insertError } = await insforge.database.from('customers').insert([
      {
        auth_id: data?.user?.id,
        first_name: firstName || null,
        last_name: lastName || null,
        email: displayEmail,
        phone_number: phone || null,
        email_verified: true,
      },
    ]);
    setVerifying(false);

    if (insertError) {
      Alert.alert('Could not finish setting up your account', insertError.message);
      return;
    }

    await setAuthed(true, data?.refreshToken, data?.user?.id);
    router.replace('/discover');
  };

  const formatCountdown = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <View
      style={[
        styles.container,
        { paddingTop: Math.max(insets.top + 8, 24) },
      ]}
    >
      {/* Top content */}
      <View style={styles.topContent}>
        <BackButton onPress={() => router.back()} style={styles.backBtn} />

        <Text style={styles.title}>Verify your email</Text>
        <Text style={styles.subtitle}>
          {`Enter the ${OTP_LENGTH}-digit code sent to `}
          <Text style={styles.emailHighlight}>{displayEmail}</Text>
        </Text>

        {/* OTP boxes */}
        <View style={styles.boxesRow}>
          {Array.from({ length: OTP_LENGTH }).map((_, i) => (
            <TextInput
              key={i}
              ref={(ref) => {
                inputRefs.current[i] = ref;
              }}
              style={[
                styles.box,
                focusedIndex === i ? styles.boxActive : styles.boxIdle,
              ]}
              value={digits[i]}
              onChangeText={(text) => handleChange(text, i)}
              onKeyPress={(e) => handleKeyPress(e, i)}
              onFocus={() => setFocusedIndex(i)}
              onBlur={() => setFocusedIndex(-1)}
              keyboardType="number-pad"
              maxLength={1}
              caretHidden
              selectTextOnFocus
              editable={!verifying}
            />
          ))}
        </View>

        {/* Resend */}
        <Text style={styles.resendText}>
          {"Didn't receive a code?  "}
          {secondsLeft > 0 ? (
            <Text>
              <Text style={styles.resendLabel}>{'Resend in '}</Text>
              <Text style={styles.resendCountdown}>{formatCountdown(secondsLeft)}</Text>
            </Text>
          ) : resending ? (
            <ActivityIndicator size="small" color="#FE5035" />
          ) : (
            <Text style={styles.resendLink} onPress={handleResend}>
              Resend code
            </Text>
          )}
        </Text>
      </View>

      {/* Wave decoration — rendered before footer so footer sits on top */}
      <View style={styles.wave} pointerEvents="none" />

      {/* Footer — Verify button fixed at bottom */}
      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom + 24, 40) },
        ]}
      >
        <TouchableOpacity
          style={[styles.verifyBtn, (!allFilled || verifying) && styles.verifyBtnDisabled]}
          onPress={() => handleVerify()}
          activeOpacity={0.85}
          disabled={!allFilled || verifying}
        >
          {verifying ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.verifyBtnText}>Verify</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E7F1F9',
    justifyContent: 'space-between',
  },
  topContent: {
    paddingHorizontal: 24,
  },
  backBtn: {
    alignSelf: 'flex-start',
    marginBottom: 28,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#26344F',
    marginBottom: 10,
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 15,
    color: '#7B8387',
    lineHeight: 22,
    marginBottom: 40,
  },
  emailHighlight: {
    color: '#26344F',
    fontWeight: '600',
  },

  // OTP boxes
  boxesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  box: {
    width: 48,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    color: '#26344F',
    textAlign: 'center',
    borderWidth: 1.5,
  },
  boxIdle: {
    borderColor: '#E0E8F0',
  },
  boxActive: {
    borderColor: '#FE5035',
    borderWidth: 2,
  },

  // Resend
  resendText: {
    fontSize: 14,
    color: '#7B8387',
  },
  resendLabel: {
    fontSize: 14,
    color: '#7B8387',
  },
  resendCountdown: {
    fontSize: 14,
    fontWeight: '700',
    color: '#26344F',
  },
  resendLink: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FE5035',
  },

  // Verify button
  footer: {
    paddingHorizontal: 24,
  },
  verifyBtn: {
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
  verifyBtnDisabled: {
    opacity: 0.5,
  },
  verifyBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Wave decoration
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
