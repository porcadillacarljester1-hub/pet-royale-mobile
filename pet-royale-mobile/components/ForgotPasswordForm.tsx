import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { Eye, EyeOff, Check, ShieldCheck, ArrowRight } from 'lucide-react-native';
import AuthInput from './AuthInput';
import { BUTTON_H, type AuthCtx } from './AuthShell';
import { colors, text, fonts, space, radius, shadow, hitSlop } from '../constants/theme';

const FIELD_H = 56;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_SECONDS = 60;

/* Same rule as the clinic web app's password policy (12 to 72 characters;
   uppercase, lowercase, number, symbol). Staff and pet owners share one
   login system, so a weaker rule here would let a staff account be reset to
   a password the staff screens would never accept. */
const RULES = [
  { key: 'len', label: 'At least 12 characters', test: (p: string) => p.length >= 12 },
  { key: 'up', label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { key: 'lo', label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { key: 'num', label: 'One number', test: (p: string) => /[0-9]/.test(p) },
  { key: 'sym', label: 'One symbol, like ! or @', test: (p: string) => /[^A-Za-z0-9\s]/.test(p) },
];

function passwordProblem(pw: string): string | null {
  if (pw.length < 12) return 'Password must be at least 12 characters.';
  if (pw.length > 72) return "Password can't be longer than 72 characters.";
  const missing: string[] = [];
  if (!/[A-Z]/.test(pw)) missing.push('an uppercase letter');
  if (!/[a-z]/.test(pw)) missing.push('a lowercase letter');
  if (!/[0-9]/.test(pw)) missing.push('a number');
  if (!/[^A-Za-z0-9\s]/.test(pw)) missing.push('a symbol (like ! or @)');
  if (!missing.length) return null;
  const last = missing.pop() as string;
  return `Password needs ${missing.length ? missing.join(', ') + ' and ' : ''}${last}.`;
}

/* "No account with that email" is deliberately treated as sent, so this
   screen can't be used to find out which emails have accounts. Only trouble
   that isn't about the email itself is reported. */
function sendFailure(error: { status?: number } | null | undefined): string | null {
  if (!error) return null;
  const status = error.status;
  if (!status) return "Couldn't reach the server. Check your connection and try again.";
  if (status === 429) return 'Too many attempts. Wait a minute and try again.';
  if (status >= 500) return 'Something went wrong on our side. Please try again in a moment.';
  return null;
}

/* Blinking line shown in the box that will receive the next digit. */
function BlinkCaret() {
  const [o] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(o, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [o]);
  return <Animated.View style={[styles.caret, { opacity: o }]} />;
}

type Step = 'email' | 'code' | 'password' | 'done';
type Field = 'email' | 'code' | 'password' | 'confirm' | null;
const STEPS = ['email', 'code', 'password'] as const;
const STEP_LABELS = ['Email', 'Code', 'Password'];

/* The progress pill the shell shows in place of the Sign in / Create
   account switch. The indicator is sized and placed as a share of its own
   track, so it's right on the first frame wherever the pill is drawn. */
export function StepPill({ index, style }: { index: number; style: object }) {
  const [slide] = useState(() => new Animated.Value(index));
  useEffect(() => {
    Animated.timing(slide, { toValue: index, duration: 220, useNativeDriver: false }).start();
  }, [index, slide]);

  return (
    <View style={style} accessibilityRole="progressbar" accessibilityLabel={`Step ${index + 1} of 3`}>
      <View style={styles.pillTrack}>
        <Animated.View
          pointerEvents="none"
          style={[styles.pillIndicator, {
            left: slide.interpolate({ inputRange: [0, 1, 2], outputRange: ['0%', '33.3333%', '66.6667%'] }),
          }]}
        />
        {STEP_LABELS.map((label, i) => (
          <View key={label} style={styles.pillTab}>
            <Text style={[styles.pillText, i === index && styles.pillTextOn, i < index && styles.pillTextDone]}>
              {label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function ForgotPasswordForm({
  auth,
  onStep,
}: {
  auth: AuthCtx;
  /** Tells the screen which step we're on, for the progress pill. */
  onStep: (index: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const kbOpen = auth.kbOpen;
  const { setBackHandler, switchTo, holdLayout, scrollToBottomSoon } = auth;

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [focused, setFocused] = useState<Field>(null);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const codeRef = useRef<TextInput>(null);
  // Read at unmount time, so they're refs rather than state.
  const verifiedRef = useRef(false);
  const doneRef = useRef(false);

  const [errorShake] = useState(() => new Animated.Value(0));
  const [btnScale] = useState(() => new Animated.Value(1));
  const cleanEmail = email.trim().toLowerCase();

  const stepIndex = step === 'done' ? STEPS.length - 1 : STEPS.indexOf(step);
  useEffect(() => {
    onStep(stepIndex);
  }, [stepIndex, onStep]);

  /* ── Moving between steps ──
     The title, text and fields fade out, the step changes, and they fade
     back in. The hero card and the progress pill stay where they are. */
  const [contentOpacity] = useState(() => new Animated.Value(1));
  // Lets a newer step change take over if one is already fading.
  const fadeToken = useRef(0);

  const goToStep = useCallback(
    (next: Step) => {
      const token = ++fadeToken.current;
      // Removing the focused input makes the keyboard blink; the shell must
      // not collapse and re-open the hero for that.
      holdLayout();
      Animated.timing(contentOpacity, { toValue: 0, duration: 90, useNativeDriver: true }).start(() => {
        if (token !== fadeToken.current) return;
        setStep(next);
        Animated.timing(contentOpacity, { toValue: 1, duration: 140, useNativeDriver: true }).start();
      });
    },
    [contentOpacity, holdLayout]
  );

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // Leaving after the code was accepted but before the password was set
  // would otherwise leave a live session behind.
  useEffect(() => {
    return () => {
      if (verifiedRef.current && !doneRef.current) {
        void supabase.auth.signOut({ scope: 'local' });
      }
    };
  }, []);

  /* If the keyboard was already up when this form appeared (the person
     tapped "Forgot password?" while typing), keep it up by focusing the
     email field. Otherwise leave it alone so the hero doesn't collapse. */
  const [startFocused] = useState(auth.kbOpen);

  /* autoFocus is unreliable on Android when the input mounts during a step
     change, so focus explicitly once the new step has rendered. The first
     time the email step shows, don't focus unless the keyboard is already
     up; coming back to the email step from a later step does focus it. */
  const leftFirstStep = useRef(false);
  useEffect(() => {
    if (step === 'done') return;
    if (step !== 'email') leftFirstStep.current = true;
    else if (!leftFirstStep.current && !startFocused) return;
    const t = setTimeout(() => {
      if (step === 'email') emailRef.current?.focus();
      else if (step === 'code') { setFocused('code'); codeRef.current?.focus(); }
      else passwordRef.current?.focus();
    }, step === 'email' && !leftFirstStep.current ? 80 : 150);
    return () => clearTimeout(t);
  }, [step, startFocused]);

  /* The back chevron lives in the shell. Earlier steps go back one step;
     the first step (and the done page) return to Sign in. */
  const handleBack = useCallback((): boolean => {
    setError('');
    if (step === 'code') {
      goToStep('email');
      return true;
    }
    if (step === 'password') {
      // The code is used up and the session it opened ends here, so going
      // back means starting again with a fresh code.
      if (verifiedRef.current) {
        verifiedRef.current = false;
        void supabase.auth.signOut({ scope: 'local' });
      }
      goToStep('email');
      return true;
    }
    switchTo('signin');
    return true;
  }, [step, goToStep, switchTo]);

  useEffect(() => {
    setBackHandler(handleBack);
    return () => setBackHandler(null);
  }, [setBackHandler, handleBack]);

  // Tapping the code boxes always brings the keyboard back.
  const openCodeKeyboard = () => {
    codeRef.current?.blur();
    setFocused('code');
    setTimeout(() => codeRef.current?.focus(), 50);
  };

  const shake = () => {
    errorShake.setValue(0);
    Animated.sequence([
      Animated.timing(errorShake, { toValue: 1, duration: 55, useNativeDriver: true }),
      Animated.timing(errorShake, { toValue: -1, duration: 55, useNativeDriver: true }),
      Animated.timing(errorShake, { toValue: 1, duration: 55, useNativeDriver: true }),
      Animated.timing(errorShake, { toValue: 0, duration: 55, useNativeDriver: true }),
    ]).start();
  };
  const fail = (message: string) => { setError(message); shake(); };
  const pressIn = () => Animated.spring(btnScale, { toValue: 0.97, useNativeDriver: true, speed: 40 }).start();
  const pressOut = () => Animated.spring(btnScale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();

  /* ── Step 1 (and "resend"): send the code ── */
  const sendCode = async (): Promise<boolean> => {
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: { shouldCreateUser: false },
    });
    const problem = sendFailure(sendError as { status?: number } | null);
    if (problem) { fail(problem); return false; }
    return true;
  };

  const handleSendCode = async () => {
    if (isLoading) return;
    if (!EMAIL_RE.test(cleanEmail)) { fail('Enter a valid email address.'); return; }
    setIsLoading(true);
    setError('');
    const sent = await sendCode();
    setIsLoading(false);
    if (!sent) return;
    setCode('');
    setResendIn(RESEND_SECONDS);
    goToStep('code');
  };

  const handleResend = async () => {
    if (resendIn > 0 || isLoading) return;
    setIsLoading(true);
    setError('');
    const sent = await sendCode();
    setIsLoading(false);
    if (sent) { setCode(''); setResendIn(RESEND_SECONDS); }
  };

  /* ── Step 2: check the code ── */
  const handleVerify = async (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length !== 6 || isLoading) return;
    setIsLoading(true);
    setError('');
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: cleanEmail, token: digits, type: 'email',
    });
    setIsLoading(false);
    if (verifyError) {
      fail("That code didn't work. It may have expired — request a new one.");
      return;
    }
    verifiedRef.current = true;
    setPassword('');
    setConfirmPassword('');
    goToStep('password');
  };

  /* ── Step 3: choose the new password ── */
  const handleSetPassword = async () => {
    if (isLoading) return;
    if (!password || !confirmPassword) { fail('Please fill in both fields.'); return; }
    const problem = passwordProblem(password);
    if (problem) { fail(problem); return; }
    if (password !== confirmPassword) { fail('Those passwords don\u2019t match.'); return; }

    setIsLoading(true);
    setError('');
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) { setIsLoading(false); fail(updateError.message); return; }

    // Signed back out so they sign in with the new password, rather than
    // being carried in by the code.
    doneRef.current = true;
    await supabase.auth.signOut({ scope: 'local' });
    setIsLoading(false);
    holdLayout();
    setStep('done');
  };

  const mmss = `${Math.floor(resendIn / 60)}:${String(resendIn % 60).padStart(2, '0')}`;

  /* ── Done ── */
  if (step === 'done') {
    return (
      <View style={[styles.body, styles.doneBody, { paddingBottom: space.xxl + insets.bottom }]}>
        <View style={styles.confirmIcon}>
          <ShieldCheck size={30} color={colors.primary} />
        </View>
        <Text style={styles.confirmTitle}>Password updated</Text>
        <Text style={styles.confirmBody}>
          Your password has been changed. Sign in with your new password to continue.
        </Text>
        <TouchableOpacity
          style={styles.confirmBtn}
          onPress={() => switchTo('signin')}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="Go to sign in"
        >
          <Text style={styles.btnPrimaryLabel}>Go to sign in</Text>
          <ArrowRight size={18} color={colors.primaryFg} />
        </TouchableOpacity>
      </View>
    );
  }

  const titles = {
    email: { title: 'Forgot password?', sub: 'Enter the email you signed up with and we\u2019ll send you a 6-digit code.' },
    code: { title: 'Enter your code', sub: 'We sent a 6-digit code to' },
    password: { title: 'Set a new password', sub: 'Choose a strong password you haven\u2019t used before.' },
  } as const;
  const buttonLabel = step === 'email' ? 'Send code' : step === 'code' ? 'Verify code' : 'Update password';
  const onPrimary = step === 'email' ? handleSendCode : step === 'code' ? () => handleVerify(code) : handleSetPassword;

  const eye = (shown: boolean, toggle: () => void) => (
    <TouchableOpacity
      style={styles.eyeBtn}
      onPress={toggle}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={shown ? 'Hide password' : 'Show password'}
    >
      {shown ? <EyeOff size={20} color={colors.mutedFg} /> : <Eye size={20} color={colors.mutedFg} />}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.body, { paddingBottom: space.xxl + insets.bottom }, kbOpen && styles.bodyCompact]}>
      {!kbOpen && (
        <>
          <Text style={styles.eyebrow}>STEP {stepIndex + 1} OF 3</Text>
          <View style={styles.bars}>
            {STEPS.map((s, i) => (
              <View key={s} style={[styles.bar, i < stepIndex && styles.barDone, i === stepIndex && styles.barCurrent]} />
            ))}
          </View>
        </>
      )}

      {/* Everything below fades when the step changes. */}
      <Animated.View style={{ opacity: contentOpacity }}>
        <Text style={styles.title}>{titles[step].title}</Text>
        {kbOpen && step === 'password' ? (
          <View style={{ height: space.lg }} />
        ) : (
          <Text style={styles.titleSub}>
            {titles[step].sub}
            {step === 'code' ? <Text style={styles.titleSubEmail}> {cleanEmail}</Text> : null}
            {step === 'code' ? '. It can take a minute to arrive — check your spam folder too.' : ''}
          </Text>
        )}

        {error ? (
          <Animated.View
            style={[styles.errorBox, {
              transform: [{ translateX: errorShake.interpolate({ inputRange: [-1, 1], outputRange: [-6, 6] }) }],
            }]}
            accessibilityLiveRegion="polite"
          >
            <Text style={styles.errorText}>{error}</Text>
          </Animated.View>
        ) : null}

        <View style={styles.form}>
          {step === 'email' && (
            <AuthInput
              label="Email address"
              placeholder="you@example.com"
              value={email}
              focused={focused === 'email'}
              inputRef={emailRef}
              onChangeText={(v) => { setEmail(v); if (error) setError(''); }}
              onFocus={() => setFocused('email')}
              onBlur={() => setFocused(null)}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="go"
              onSubmitEditing={handleSendCode}
            />
          )}

          {step === 'code' && (
            <>
              {/* Six boxes for show; one invisible input on top takes the
                  typing, paste and SMS/email autofill. */}
              <Pressable onPress={openCodeKeyboard} style={styles.codeWrap}>
                <View style={styles.codeRow} pointerEvents="none">
                  {Array.from({ length: 6 }).map((_, i) => {
                    const active = focused === 'code' && i === Math.min(code.length, 5);
                    return (
                      <View key={i} style={[styles.codeBox, (active || code[i]) && styles.codeBoxOn,
                        !!error && styles.codeBoxError]}>
                        {active && !code[i] ? <BlinkCaret /> : <Text style={styles.codeDigit}>{code[i] ?? ''}</Text>}
                      </View>
                    );
                  })}
                </View>
                <TextInput
                  ref={codeRef}
                  pointerEvents="none"
                  style={styles.codeHidden}
                  value={code}
                  onChangeText={(v) => {
                    const digits = v.replace(/\D/g, '').slice(0, 6);
                    setCode(digits);
                    if (error) setError('');
                    if (digits.length === 6) void handleVerify(digits);
                  }}
                  onFocus={() => setFocused('code')}
                  onBlur={() => setFocused(null)}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  caretHidden
                  accessibilityLabel="6-digit code"
                />
              </Pressable>

              <View style={styles.resendRow}>
                <Text style={styles.resendText}>Didn&apos;t get it? </Text>
                {resendIn > 0 ? (
                  <Text style={styles.resendText}>Resend in {mmss}</Text>
                ) : (
                  <TouchableOpacity onPress={handleResend} hitSlop={hitSlop} disabled={isLoading} accessibilityRole="button">
                    <Text style={styles.resendLink}>Resend code</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}

          {step === 'password' && (
            <>
              <AuthInput
                label="New password"
                placeholder="At least 12 characters"
                value={password}
                focused={focused === 'password'}
                inputRef={passwordRef}
                onChangeText={(v) => { setPassword(v); if (error) setError(''); }}
                onFocus={() => { setFocused('password'); scrollToBottomSoon(); }}
                onBlur={() => setFocused(null)}
                secureTextEntry={!showPassword}
                maxLength={72}
                autoComplete="new-password"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => confirmRef.current?.focus()}
                right={eye(showPassword, () => setShowPassword((v) => !v))}
              />

              {/* Live checklist, same as Create account → Set a password. */}
              <View style={styles.rules}>
                {RULES.map((r) => {
                  const ok = r.test(password);
                  return (
                    <View key={r.key} style={styles.ruleRow}>
                      <View style={[styles.ruleDot, ok && styles.ruleDotOk]}>
                        {ok ? <Check size={13} color={colors.primaryFg} strokeWidth={3} /> : null}
                      </View>
                      <Text style={[styles.ruleText, ok && styles.ruleTextOk]}>{r.label}</Text>
                    </View>
                  );
                })}
              </View>

              <AuthInput
                label="Confirm new password"
                placeholder="Re-enter your new password"
                value={confirmPassword}
                focused={focused === 'confirm'}
                inputRef={confirmRef}
                onChangeText={(v) => { setConfirmPassword(v); if (error) setError(''); }}
                onFocus={() => { setFocused('confirm'); scrollToBottomSoon(); }}
                onBlur={() => setFocused(null)}
                secureTextEntry={!showConfirm}
                maxLength={72}
                autoComplete="new-password"
                returnKeyType="go"
                onSubmitEditing={handleSetPassword}
                right={eye(showConfirm, () => setShowConfirm((v) => !v))}
              />
            </>
          )}

          <Animated.View style={{ transform: [{ scale: btnScale }] }}>
            <TouchableOpacity
              style={[styles.btnPrimary, isLoading && styles.btnPrimaryLoading]}
              onPress={onPrimary}
              onPressIn={pressIn}
              onPressOut={pressOut}
              disabled={isLoading}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel={buttonLabel}
            >
              {isLoading
                ? <ActivityIndicator color={colors.primaryFg} />
                : <Text style={styles.btnPrimaryLabel}>{buttonLabel}</Text>}
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: space.xxl, paddingTop: space.xxl },
  bodyCompact: { paddingTop: space.lg, paddingBottom: space.lg },

  /* Step pill (drawn by the shell in place of the Sign in / Create account switch) */
  pillTrack: { flex: 1, flexDirection: 'row' },
  pillTab: { flex: 1, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  pillIndicator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '33.3333%',
    borderRadius: 22,
    backgroundColor: colors.primary,
  },
  pillText: { ...text.smallBold, color: colors.mutedFg },
  pillTextOn: { color: colors.primaryFg },
  pillTextDone: { color: colors.primary },

  eyebrow: { ...text.smallBold, color: colors.mutedFg, letterSpacing: 1.8 },
  bars: { flexDirection: 'row', gap: 10, marginTop: space.sm, marginBottom: space.xl },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.muted },
  barDone: { backgroundColor: colors.primary },
  barCurrent: { backgroundColor: colors.accent },

  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, letterSpacing: -0.5, color: colors.foreground },
  titleSub: { ...text.body, color: colors.mutedFg, marginTop: space.sm, marginBottom: space.xl },
  titleSubEmail: { color: colors.foreground, fontFamily: fonts.bodyMedium },

  form: { gap: space.md },
  eyeBtn: { width: BUTTON_H, height: BUTTON_H, alignItems: 'center', justifyContent: 'center' },

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

  /* Code boxes: same height, radius and focus look as the fields. */
  codeWrap: { height: FIELD_H },
  codeRow: { flexDirection: 'row', gap: space.sm, height: FIELD_H },
  codeBox: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: colors.muted,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeBoxOn: { borderColor: colors.primary, backgroundColor: colors.card },
  codeBoxError: { borderColor: colors.destructive },
  caret: { width: 2, height: 26, borderRadius: 1, backgroundColor: colors.primary },
  codeDigit: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.foreground },
  // Invisible, but covers the boxes so a tap anywhere focuses it.
  codeHidden: { ...StyleSheet.absoluteFill, opacity: 0.02, color: 'transparent' },

  resendRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', minHeight: 32 },
  resendText: { ...text.small, color: colors.mutedFg },
  resendLink: { ...text.smallBold, color: colors.primary },

  /* Password checklist */
  rules: { paddingHorizontal: space.sm, paddingVertical: space.xs },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 3 },
  ruleDot: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: colors.mutedFg,
    alignItems: 'center', justifyContent: 'center',
  },
  ruleDotOk: { backgroundColor: colors.primary, borderColor: colors.primary },
  ruleText: { ...text.small, color: colors.mutedFg },
  ruleTextOk: { color: colors.foreground },

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

  /* Done */
  doneBody: { alignItems: 'center' },
  confirmIcon: {
    width: 72, height: 72, borderRadius: 24,
    backgroundColor: colors.secondary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: space.xxl,
  },
  confirmTitle: {
    fontFamily: fonts.display, fontSize: 28, lineHeight: 34, letterSpacing: -0.5,
    color: colors.foreground, textAlign: 'center',
  },
  confirmBody: { ...text.body, color: colors.mutedFg, marginTop: space.md, textAlign: 'center' },
  confirmBtn: {
    alignSelf: 'stretch',
    height: BUTTON_H,
    borderRadius: BUTTON_H / 2,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    marginTop: space.xxl,
    ...shadow.primary,
  },
});
