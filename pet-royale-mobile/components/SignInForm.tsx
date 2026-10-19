import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { Eye, EyeOff } from 'lucide-react-native';
import AuthInput from './AuthInput';
import { BUTTON_H, type AuthCtx } from './AuthShell';
import { colors, text, fonts, space, radius, shadow, hitSlop } from '../constants/theme';

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

type Busy = 'password' | null;

export default function SignInForm({ auth }: { auth: AuthCtx }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const kbOpen = auth.kbOpen;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // Whether the Sign in button is working.
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const isBusy = busy !== null;

  /* If the keyboard was already up when this form appeared (the person
     switched from Create account while typing), keep it up by focusing the
     first field. Otherwise leave it alone so the hero doesn't collapse. */
  const [startFocused] = useState(auth.kbOpen);
  useEffect(() => {
    if (!startFocused) return;
    const t = setTimeout(() => emailRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [startFocused]);

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

  return (
    <View
      style={[
        styles.body,
        { paddingBottom: space.xxl + insets.bottom },
        kbOpen && styles.bodyCompact,
      ]}
    >
      <Text style={[styles.title, kbOpen && styles.titleCompact]}>Welcome back</Text>
      {!kbOpen && (
        <Text style={styles.titleSub}>Sign in to manage your pets and appointments.</Text>
      )}

      {/* Beside the fields that caused it, so the message is where
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

      <View style={styles.form}>
        <AuthInput
          label="Email address"
          placeholder="you@example.com"
          value={email}
          focused={emailFocused}
          inputRef={emailRef}
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

        <AuthInput
          label="Password"
          placeholder="Enter your password"
          value={password}
          focused={passwordFocused}
          inputRef={passwordRef}
          onChangeText={(v) => { setPassword(v); if (error) setError(''); }}
          onFocus={() => { setPasswordFocused(true); auth.scrollToBottomSoon(); }}
          onBlur={() => setPasswordFocused(false)}
          secureTextEntry={!showPassword}
          autoComplete="password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={handleLogin}
          right={
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPassword((v) => !v)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword
                ? <EyeOff size={20} color={colors.mutedFg} />
                : <Eye size={20} color={colors.mutedFg} />}
            </TouchableOpacity>
          }
        />

        <TouchableOpacity
          onPress={() => auth.switchTo('forgot')}
          activeOpacity={0.7}
          style={styles.forgotRow}
          hitSlop={hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Forgot password?"
        >
          <Text style={styles.forgotText}>Forgot password?</Text>
        </TouchableOpacity>

        {/* Primary: the one solid navy button. */}
        <Animated.View style={{ transform: [{ scale: btnScale }] }}>
          <TouchableOpacity
            style={[styles.btnPrimary, busy === 'password' && styles.btnPrimaryLoading]}
            onPress={handleLogin}
            onPressIn={pressIn}
            onPressOut={pressOut}
            disabled={isBusy}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
          >
            {busy === 'password' ? (
              <ActivityIndicator color={colors.primaryFg} />
            ) : (
              <Text style={styles.btnPrimaryLabel}>Sign in</Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>

      {!kbOpen && (
        <Text style={styles.fine}>
          By continuing you agree to the clinic&apos;s terms and privacy policy.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: space.xxl,
    paddingTop: space.xxl,
  },
  bodyCompact: { paddingTop: space.lg, paddingBottom: space.lg },
  title: {
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
    color: colors.foreground,
  },
  titleCompact: { marginBottom: space.lg },
  titleSub: {
    ...text.body,
    color: colors.mutedFg,
    marginTop: space.sm,
    marginBottom: space.xl,
  },

  form: { gap: space.md },

  eyeBtn: {
    width: BUTTON_H,
    height: BUTTON_H,
    alignItems: 'center',
    justifyContent: 'center',
  },

  forgotRow: {
    alignSelf: 'flex-end',
    minHeight: 44,
    justifyContent: 'center',
    marginTop: -space.sm,
  },
  forgotText: { ...text.bodyBold, color: colors.primary },

  errorBox: {
    borderWidth: 1,
    borderColor: colors.destructive,
    backgroundColor: colors.destructiveBg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    marginBottom: space.lg,
  },
  errorText: { ...text.small, color: colors.destructive },

  /* ── Buttons: 48px, fully rounded ── */
  btnPrimary: {
    height: BUTTON_H,
    borderRadius: BUTTON_H / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.primary,
  },
  btnPrimaryLoading: { backgroundColor: colors.primaryDark },
  btnPrimaryLabel: { ...text.bodyBold, color: colors.primaryFg },

  fine: {
    ...text.caption,
    color: colors.mutedFg,
    textAlign: 'center',
    marginTop: space.xl,
    paddingHorizontal: space.md,
  },
});
