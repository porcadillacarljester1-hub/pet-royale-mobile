import { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import Svg, { Path } from 'react-native-svg';
import { supabase } from '../lib/supabase';
import { Mail, Lock, Eye, EyeOff, ArrowLeft } from 'lucide-react-native';
import { BrandWordmark } from '../constants/brand';
import { colors, text, fonts, space, radius, shadow, hitSlop } from '../constants/theme';
WebBrowser.maybeCompleteAuthSession();

/* Primary at 12% would vanish on the navy header, so the back button
   uses the cream text colour instead. */
const HEADER_CHIP = 'rgba(246, 245, 238, 0.12)';

function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityElementsHidden importantForAccessibility="no">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
}

function signInMessage(error: { message?: string; status?: number; code?: string }): string {
  const code = error.code ?? '';
  const message = (error.message ?? '').toLowerCase();
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return 'Please confirm your email first. Check your inbox for the link we sent when you registered.';
  }
  if (error.status === 429 || code === 'over_request_rate_limit') {
    return 'Too many attempts. Wait a minute and try again.';
  }
  if (!error.status) return "Couldn't reach the server. Check your connection and try again.";
  if (error.status >= 500) return 'Something went wrong on our side. Please try again in a moment.';
  return 'Those details didn\u2019t match an account.';
}

type Busy = 'password' | 'google' | null;

export default function SignInScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const statusBarHeight = Math.max(insets.top, StatusBar.currentHeight ?? 0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // Which button is working. Only that one spins; both are held while
  // either is.
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const isBusy = busy !== null;

  /* ── Micro-interactions ── */
  const [errorShake] = useState(() => new Animated.Value(0));
  const [btnScale] = useState(() => new Animated.Value(1));

  const shake = () => {
    errorShake.setValue(0);
    Animated.sequence([
      Animated.timing(errorShake, { toValue: 1, duration: 55, useNativeDriver: true }),
      Animated.timing(errorShake, { toValue: -1, duration: 55, useNativeDriver: true }),
      Animated.timing(errorShake, { toValue: 1, duration: 55, useNativeDriver: true }),
      Animated.timing(errorShake, { toValue: 0, duration: 55, useNativeDriver: true }),
    ]).start();
  };

  const fail = (message: string) => {
    setError(message);
    shake();
  };

  const pressIn = () =>
    Animated.spring(btnScale, { toValue: 0.97, useNativeDriver: true, speed: 40 }).start();
  const pressOut = () =>
    Animated.spring(btnScale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();

  const continueAfterAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Your session could not be loaded. Please sign in again.');

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('phone')
      .eq('id', user.id)
      .maybeSingle();

    if (clientError) throw clientError;

    router.replace(client?.phone ? '/(tabs)/home' as any : '/complete-profile' as any);
  };

  const handleLogin = async () => {
    if (isBusy) return;
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      fail('Please fill in both fields.');
      return;
    }

    setBusy('password');
    setError('');

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (signInError) {
        fail(signInMessage(signInError as { message?: string; status?: number; code?: string }));
        return;
      }

      await continueAfterAuth();
    } catch (e: any) {
      // Signed in fine, but loading the profile failed. Without this the
      // person was left on the sign-in screen with no message at all.
      fail(e?.message || "You're signed in, but we couldn't load your account. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const handleOAuth = async (provider: 'google') => {
    if (isBusy) return;
    setBusy('google');
    setError('');

    try {
      // Never derive this from the dev server URL. OAuth must return to the
      // installed app, otherwise Google sends the user to localhost.
      const redirectTo = 'petroyalemobile://auth/callback';

      const { data, error: oauthStartError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      });

      if (oauthStartError) throw oauthStartError;
      if (!data?.url) throw new Error('Google sign-in did not return an authorization URL.');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

      if (result.type !== 'success' || !result.url) {
        if (result.type !== 'dismiss' && result.type !== 'cancel') {
          throw new Error('Google sign-in was not completed.');
        }
        return;
      }

      const callbackUrl = new URL(result.url);
      const hashParams = new URLSearchParams(callbackUrl.hash.replace(/^#/, ''));
      const queryParams = callbackUrl.searchParams;

      const accessToken = hashParams.get('access_token') || queryParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token') || queryParams.get('refresh_token');
      const code = queryParams.get('code');

      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) throw sessionError;
      } else if (code) {
        const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
        if (sessionError) throw sessionError;
      } else {
        throw new Error('Google sign-in returned an incomplete session.');
      }

      await continueAfterAuth();
    } catch (oauthError: any) {
      fail(oauthError?.message || 'Unable to sign in with Google.');
    } finally {
      setBusy(null);
    }
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/' as any);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
        >
          {/* ── Header: the same navy and gold as the admin, and as register ── */}
          <View style={[styles.header, { paddingTop: statusBarHeight + space.md }]}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={goBack}
              activeOpacity={0.75}
              hitSlop={hitSlop}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <ArrowLeft size={20} color={colors.primaryFg} />
            </TouchableOpacity>

            <View style={styles.brandBlock}>
              <BrandWordmark height={34} color={colors.accent} />
              <Text style={styles.brandTag}>Clinic and Veterinary Services</Text>
            </View>
          </View>

          {/* ── Sheet ── */}
          <View style={[styles.sheet, { paddingBottom: space.xxxl + insets.bottom }]}>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.titleSub}>Sign in to manage your pets and appointments.</Text>

            <View style={styles.form}>
              <View>
                <Text style={styles.label}>Email address</Text>
                <View style={[styles.inputRow, emailFocused && styles.inputRowFocused]}>
                  <Mail size={18} color={colors.mutedFg} strokeWidth={2} />
                  <TextInput
                    style={styles.input}
                    placeholder="you@example.com"
                    placeholderTextColor={colors.mutedFg}
                    value={email}
                    onChangeText={(v) => { setEmail(v); if (error) setError(''); }}
                    onFocus={() => setEmailFocused(true)}
                    onBlur={() => setEmailFocused(false)}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => passwordRef.current?.focus()}
                  />
                </View>
              </View>

              <View>
                <Text style={styles.label}>Password</Text>
                <View style={[styles.inputRow, passwordFocused && styles.inputRowFocused]}>
                  <Lock size={18} color={colors.mutedFg} strokeWidth={2} />
                  <TextInput
                    ref={passwordRef}
                    style={styles.input}
                    placeholder="Password"
                    placeholderTextColor={colors.mutedFg}
                    value={password}
                    onChangeText={(v) => { setPassword(v); if (error) setError(''); }}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                    secureTextEntry={!showPassword}
                    autoComplete="password"
                    textContentType="password"
                    returnKeyType="go"
                    onSubmitEditing={handleLogin}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword((v) => !v)}
                    activeOpacity={0.7}
                    hitSlop={hitSlop}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword
                      ? <EyeOff size={18} color={colors.mutedFg} />
                      : <Eye size={18} color={colors.mutedFg} />}
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => router.push('/forgot-password' as any)}
                activeOpacity={0.7}
                style={styles.forgotRow}
                hitSlop={hitSlop}
                accessibilityRole="button"
                accessibilityLabel="Forgot password?"
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>

              {/* Beside the button that caused it, so the message is where
                  the eye already is. */}
              {error ? (
                <Animated.View
                  style={[
                    styles.errorBox,
                    {
                      transform: [
                        {
                          translateX: errorShake.interpolate({
                            inputRange: [-1, 1],
                            outputRange: [-6, 6],
                          }),
                        },
                      ],
                    },
                  ]}
                  accessibilityLiveRegion="polite"
                >
                  <Text style={styles.errorText}>{error}</Text>
                </Animated.View>
              ) : null}

              <Animated.View style={{ transform: [{ scale: btnScale }] }}>
                <TouchableOpacity
                  style={[styles.btnPrimary, busy === 'password' && styles.btnPrimaryLoading]}
                  onPress={handleLogin}
                  onPressIn={pressIn}
                  onPressOut={pressOut}
                  disabled={isBusy}
                  activeOpacity={0.9}
                  accessibilityRole="button"
                  accessibilityLabel="Sign In"
                >
                  {busy === 'password' ? (
                    <ActivityIndicator color={colors.primaryFg} />
                  ) : (
                    <Text style={styles.btnPrimaryLabel}>Sign In</Text>
                  )}
                </TouchableOpacity>
              </Animated.View>

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity
                style={[styles.googleBtn, isBusy && busy !== 'google' && styles.googleBtnHeld]}
                onPress={() => handleOAuth('google')}
                disabled={isBusy}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Continue with Google"
              >
                {busy === 'google' ? (
                  <ActivityIndicator color={colors.foreground} />
                ) : (
                  <>
                    <GoogleG size={18} />
                    <Text style={styles.googleBtnText}>Continue with Google</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.linkRow}
                onPress={() => router.replace('/register' as any)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Don't have an account? Register here"
              >
                <Text style={styles.linkText}>Don&apos;t have an account? </Text>
                <Text style={styles.linkHighlight}>Register here</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Fixed navy strip behind the status bar. At the top of the page
          it blends into the navy header; once the form scrolls, it stops
          the logo and the cream sheet from sliding under the clock and
          battery icons. */}
      <View
        pointerEvents="none"
        style={[styles.statusBarBackdrop, { height: statusBarHeight }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },

  statusBarBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.primary,
    zIndex: 20,
  },

  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: space.xl,
    // The sheet slides up over the bottom radius.card of this, so the
    // padding is that plus the space actually left showing.
    paddingBottom: space.xxl + radius.card,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: HEADER_CHIP,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandBlock: {
    alignItems: 'center',
    marginTop: space.md,
  },
  brandTag: {
    ...text.caption,
    color: colors.primaryFg,
    opacity: 0.7,
    letterSpacing: 0.4,
    marginTop: space.md,
  },

  sheet: {
    flex: 1,
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    marginTop: -radius.card,
    paddingTop: space.xxl,
    paddingBottom: space.xxxl,
    paddingHorizontal: space.xxl,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 26,
    letterSpacing: -0.7,
    color: colors.foreground,
  },
  titleSub: {
    ...text.body,
    color: colors.mutedFg,
    marginTop: space.sm,
    marginBottom: space.xxl,
  },

  form: { gap: space.lg },
  label: { ...text.smallBold, color: colors.foreground, marginBottom: space.sm },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 54,
    paddingVertical: 4,
    backgroundColor: colors.muted,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  inputRowFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.card,
  },
  input: {
    flex: 1,
    ...text.body,
    color: colors.foreground,
    padding: 0,
  },
  forgotRow: { alignSelf: 'flex-end', marginTop: -space.sm },
  forgotText: { ...text.smallBold, color: colors.primary },

  errorBox: {
    borderWidth: 1,
    borderColor: colors.destructive,
    backgroundColor: colors.destructiveBg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
  },
  errorText: { ...text.small, color: colors.destructive },

  btnPrimary: {
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.primary,
  },
  btnPrimaryLoading: { backgroundColor: colors.primaryDark },
  btnPrimaryLabel: { ...text.bodyBold, color: colors.primaryFg },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { ...text.caption, color: colors.mutedFg },

  googleBtn: {
    height: 54,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  googleBtnHeld: { opacity: 0.55 },
  googleBtnText: { ...text.bodyBold, color: colors.foreground },

  linkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    marginTop: space.sm,
  },
  linkText: { ...text.body, color: colors.mutedFg },
  linkHighlight: { ...text.bodyBold, color: colors.primary },
});
