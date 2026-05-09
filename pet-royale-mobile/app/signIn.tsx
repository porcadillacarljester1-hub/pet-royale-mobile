import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import Svg, { Path, Line, Circle } from 'react-native-svg';

const NAVY = '#12175e';
const GOLD = '#c9a227';
const WHITE = '#ffffff';
const WHITE_DIM = 'rgba(255,255,255,0.45)';
const WHITE_FAINT = 'rgba(255,255,255,0.07)';
const WHITE_BORDER = 'rgba(255,255,255,0.15)';

const EyeIcon = ({ open }: { open: boolean }) =>
  open ? (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <Path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <Line x1="1" y1="1" x2="23" y2="23" />
    </Svg>
  ) : (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <Circle cx="12" cy="12" r="3" />
    </Svg>
  );

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }
    setIsLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setIsLoading(false);
    if (error) {
      setError('Invalid email or password.');
      return;
    }
    router.replace('/(tabs)/home' as any);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />
      <View style={styles.stripe} />

      {/* Header pinned to top */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Text style={styles.backArrow}>←</Text>
          <Text style={styles.backLabel}>Back</Text>
        </TouchableOpacity>
        <View style={styles.crownBox}>
          <Text style={styles.crownChar}>♛</Text>
        </View>
      </View>

      {/* Centered content */}
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>Welcome back</Text>
          <Text style={styles.title}>
            Sign{' '}
            <Text style={styles.titleItalic}>In</Text>
          </Text>
          <View style={styles.rule} />
          <Text style={styles.titleSub}>Pet Royale' Clinic & Veterinary</Text>
        </View>

        {/* Error */}
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Fields */}
        <View style={styles.form}>
          <View style={styles.field}>
            <TextInput
              style={styles.input}
              placeholder="Email Address"
              placeholderTextColor={WHITE_DIM}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.field}>
            <View style={styles.inputWrap}>
              <TextInput
                style={[styles.input, styles.inputWithToggle]}
                placeholder="Password"
                placeholderTextColor={WHITE_DIM}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPassword(v => !v)}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <EyeIcon open={showPassword} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Sign In button */}
        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={handleLogin}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator color={NAVY} />
          ) : (
            <>
              <View>
                <Text style={styles.btnPrimaryLabel}>Sign In</Text>
                <Text style={styles.btnPrimaryHint}>Access your account</Text>
              </View>
              <View style={styles.btnArrowBox}>
                <Text style={styles.btnArrowText}>→</Text>
              </View>
            </>
          )}
        </TouchableOpacity>

        {/* Register link */}
        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => router.push('/register')}
          activeOpacity={0.7}
        >
          <Text style={styles.linkText}>Don't have an account? </Text>
          <View style={styles.linkUnderline}>
            <Text style={styles.linkHighlight}>Register here</Text>
          </View>
        </TouchableOpacity>

        {/* Bottom divider */}
        <View style={styles.bottomMark}>
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerCrown}>♛</Text>
            <View style={styles.dividerLine} />
          </View>
          <Text style={styles.bottomSub}>"We Care For You and Your Pets"</Text>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: NAVY,
  },
  stripe: {
    height: 5,
    backgroundColor: GOLD,
  },

  // Header pinned to top
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 12,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.4)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  backArrow: {
    fontSize: 14,
    color: GOLD,
    fontFamily: 'serif',
  },
  backLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: GOLD,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  crownBox: {
    width: 32,
    height: 32,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  crownChar: {
    fontSize: 15,
    color: NAVY,
  },

  // Scroll centered
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 48,
  },

  // Title
  titleBlock: {
    paddingHorizontal: 22,
    paddingTop: 0,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 3,
    color: 'rgba(255,255,255,0.3)',
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  title: {
    fontSize: 52,
    fontWeight: '700',
    color: WHITE,
    fontFamily: 'serif',
    lineHeight: 52,
  },
  titleItalic: {
    color: GOLD,
    fontStyle: 'italic',
    fontFamily: 'serif',
  },
  rule: {
    width: 32,
    height: 1,
    backgroundColor: GOLD,
    marginTop: 18,
    marginBottom: 14,
  },
  titleSub: {
    fontSize: 15,
    fontWeight: '300',
    color: 'rgba(255,255,255,0.35)',
  },

  // Error
  errorBox: {
    marginHorizontal: 22,
    marginTop: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.35)',
    backgroundColor: 'rgba(255,107,107,0.07)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  errorText: {
    fontSize: 13,
    color: '#ff6b6b',
  },

  // Form
  form: {
    paddingHorizontal: 22,
    paddingTop: 28,
    gap: 18,

  },
  field: {
    gap: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: WHITE_BORDER,
    backgroundColor: WHITE_FAINT,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: WHITE,
    borderRadius: 10,  
  },
  inputWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  inputWithToggle: {
    paddingRight: 48,
  },
  eyeBtn: {
    position: 'absolute',
    right: 14,
    padding: 2,
  },

  // Button
  btnPrimary: {
    marginHorizontal: 22,
    marginTop: 22,
    backgroundColor: GOLD,
    height: 56,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 25,
    borderRadius: 12,
  },
  btnPrimaryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: NAVY,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  btnPrimaryHint: {
    fontSize: 14,
    fontStyle: 'italic',
    color: 'rgba(13,16,64,0.45)',
    fontFamily: 'serif',
    marginTop: 1,
  },
  btnArrowBox: {
    width: 32,
    height: 32,
    borderWidth: 1.5,
    borderColor: 'rgba(13,16,64,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  btnArrowText: {
    fontSize: 18,
    color: NAVY,
    fontFamily: 'serif',
  },

  // Link
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    gap: 3,
  },
  linkText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.35)',
    fontWeight: '300',
  },
  linkUnderline: {
    borderBottomWidth: 1,
    borderBottomColor: GOLD,
  },
  linkHighlight: {
    fontSize: 15,
    fontWeight: '600',
    color: GOLD,
  },

  // Bottom
  bottomMark: {
    marginTop: 52,
    paddingHorizontal: 22,
    alignItems: 'center',
    gap: 12,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(201,162,39,0.18)',
  },
  dividerCrown: {
    color: 'rgba(201,162,39,0.28)',
    fontSize: 15,
  },
  bottomSub: {
    fontSize: 15,
    fontStyle: 'italic',
    color: 'rgba(255,255,255,0.15)',
    fontFamily: 'serif',
  },
});
