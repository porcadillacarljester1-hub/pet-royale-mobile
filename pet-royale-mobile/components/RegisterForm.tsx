import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { Eye, EyeOff, Check } from 'lucide-react-native';
import FloatField from './FloatField';
import { BUTTON_H, type AuthCtx } from './AuthShell';
import { colors, status, text, fonts, space, radius, shadow } from '../constants/theme';
import { PhoneInput } from './PhoneInput';
import { DEFAULT_ISO, getCountry, isValidMobile, toE164 } from '../lib/phone';

const TOTAL_STEPS = 4;
const PASSWORD_MAX = 72;

/* A symbol is an ASCII punctuation character. The old test (anything
   that isn't a letter, digit or space) counted accented letters like é
   and ñ as symbols, so "Pañuelo1234" passed without a real symbol. */
const SYMBOL_RE = /[!-\/:-@\[-`{-~]/;

/* Checked live as the person types, and again at submit. 12 to 72
   characters with an uppercase letter, a lowercase letter, a number and
   a symbol. A space is not a symbol, and the 72 limit is the most the
   auth system actually uses — anything past it is silently ignored. */
const PASSWORD_RULES: { id: string; label: string; test: (v: string) => boolean }[] = [
  { id: 'length', label: 'At least 12 characters', test: (v) => v.length >= 12 && v.length <= PASSWORD_MAX },
  { id: 'upper', label: 'One uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { id: 'lower', label: 'One lowercase letter', test: (v) => /[a-z]/.test(v) },
  { id: 'number', label: 'One number', test: (v) => /[0-9]/.test(v) },
  { id: 'special', label: 'One symbol, like ! or @', test: (v) => SYMBOL_RE.test(v) },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* A name: at least 2 characters, at least one of them a letter, and no
   digits or symbols. Hyphens, apostrophes, periods and spaces are fine
   (Anne-Marie, O'Brien, Jr.). Letters of any script pass. */
const NAME_BAD_RE = /[0-9_!@#$%^&*()+=\[\]{}<>\/\\|~`?,;:"]/;
const NAME_HAS_LETTER_RE = /[^\s0-9.'\u2019-]/;

function isValidName(value: string): boolean {
  const v = value.trim();
  return v.length >= 2 && !NAME_BAD_RE.test(v) && NAME_HAS_LETTER_RE.test(v);
}

const tidy = (value: string) => value.trim().replace(/\s+/g, ' ');

const STEP_HELP = [
  'The name you\u2019d like the clinic to see on your appointments.',
  'We\u2019ll send a confirmation link here, and you\u2019ll sign in with this address.',
  'A mobile number, so the clinic can reach you about your appointments.',
  'You\u2019ll sign in with this. Use one you don\u2019t use anywhere else.',
];

const PROMPTS = [
  'What should we call you?',
  'What\u2019s your email?',
  'Best number to reach you?',
  'Set a password',
];

function ProgressBar({ step, compact }: { step: number; compact?: boolean }) {
  return (
    <View
      style={[styles.progressRow, compact && styles.progressRowCompact]}
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step + 1} of ${TOTAL_STEPS}`}
    >
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.progressSegment,
            i < step && styles.progressDone,
            i === step && styles.progressCurrent,
          ]}
        />
      ))}
    </View>
  );
}

export default function RegisterForm({
  auth,
  onCheckEmail,
  editEmailNonce,
}: {
  auth: AuthCtx;
  /** Sign-up worked and a confirmation email was sent. The screen shows
      the "Check your email" page over this form. */
  onCheckEmail: (email: string) => void;
  /** Goes up by one each time the person taps "Use a different email" on
      that page; this form then returns to the email step, keeping the rest. */
  editEmailNonce: number;
}) {
  const insets = useSafeAreaInsets();
  const kbOpen = auth.kbOpen;
  const { setBackHandler, switchTo } = auth;
  const [step, setStep] = useState(0);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [countryIso, setCountryIso] = useState(DEFAULT_ISO);
  const [national, setNational] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  /* Which field has focus. Each floating-label field needs to know
     whether it is the focused one, and the hints below only need to
     know whether any field is. */
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const fieldFocused = focusedField !== null;

  /* Only one step is ever on screen at a time, so a single ref covers
     whichever field is currently the main one. The last-name field
     has its own, so Enter on first name can move to it. */
  const inputRef = useRef<TextInput>(null);
  const lastNameRef = useRef<TextInput>(null);

  const country = getCountry(countryIso);

  const [fadeIn] = useState(() => new Animated.Value(1));
  const [slideIn] = useState(() => new Animated.Value(0));
  const [errorShake] = useState(() => new Animated.Value(0));
  const [btnScale] = useState(() => new Animated.Value(1));

  /* ── Step changes ── */
  // Set once the person has moved between steps. Until then, arriving on
  // step 1 should not pop the keyboard open (see the focus effect).
  const moved = useRef(false);

  /* The step's entrance replays when the step changes. It does not play
     when this form first appears: the shell's fade already covers that,
     and a second, slower fade on top of it is what made the switch from
     Sign in noticeable. */
  const shownStep = useRef(step);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    fadeIn.setValue(0);
    slideIn.setValue(16);
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(slideIn, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [step, fadeIn, slideIn]);

  /* If the keyboard was already up when this form appeared (the person
     switched from Sign in while typing), keep it up. */
  const [startFocused] = useState(auth.kbOpen);

  /* Focus the field on every step. The delay roughly clears the step's
     own entrance animation so focus doesn't fight it.

     On the very first step this is skipped unless the keyboard was already
     open. Opening the keyboard on arrival collapses the hero card, which is
     a second visible jump right after switching from Sign in. */
  useEffect(() => {
    if (step === 0 && !startFocused && !moved.current) return;
    const t = setTimeout(() => inputRef.current?.focus(), step === 0 ? 80 : 260);
    return () => clearTimeout(t);
  }, [step, startFocused]);

  /* "Use a different email" on the Check your email page: back to the
     email step with everything else kept. */
  useEffect(() => {
    if (editEmailNonce === 0) return;
    moved.current = true;
    setError('');
    setStep(1);
  }, [editEmailNonce]);

  /* The back button lives in the shell. On steps after the first it should
     go to the previous step rather than leave the screen. */
  const stepBack = useCallback((): boolean => {
    if (step === 0) return false;
    moved.current = true;
    setError('');
    setStep((s) => s - 1);
    return true;
  }, [step]);

  useEffect(() => {
    setBackHandler(stepBack);
    return () => setBackHandler(null);
  }, [setBackHandler, stepBack]);

  const shake = () => {
    errorShake.setValue(0);
    Animated.sequence([
      Animated.timing(errorShake, { toValue: 1, duration: 55, useNativeDriver: true }),
      Animated.timing(errorShake, { toValue: -1, duration: 55, useNativeDriver: true }),
      Animated.timing(errorShake, { toValue: 1, duration: 55, useNativeDriver: true }),
      Animated.timing(errorShake, { toValue: 0, duration: 55, useNativeDriver: true }),
    ]).start();
  };

  const pressIn = () =>
    Animated.spring(btnScale, { toValue: 0.97, useNativeDriver: true, speed: 40 }).start();
  const pressOut = () =>
    Animated.spring(btnScale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();

  const clear =
    (setter: (value: string) => void) =>
    (value: string) => {
      setter(value);
      if (error) setError('');
    };

  /* Both names are required and both must look like a name. */
  const namesOk = isValidName(firstName) && isValidName(lastName);
  const phoneOk = isValidMobile(country, national);

  /* Whether the field on the CURRENT step is fillable — gates the
     Next / Create account button. */
  const stepValid = [
    namesOk,
    EMAIL_RE.test(email.trim()),
    phoneOk,
    PASSWORD_RULES.every((rule) => rule.test(password)),
  ][step];

  /* Said only once the person has typed something and left the field —
     nagging while they're still typing is worse than saying nothing. */
  let hint = '';
  if (!fieldFocused) {
    if (step === 0 && (firstName.trim() !== '' || lastName.trim() !== '') && !namesOk) {
      const badFirst = firstName.trim() !== '' && !isValidName(firstName);
      const badLast = lastName.trim() !== '' && !isValidName(lastName);
      hint =
        badFirst || badLast
          ? 'Use at least 2 letters, with no numbers or symbols.'
          : 'Enter both your first and last name.';
    } else if (step === 1 && email.length > 0 && !EMAIL_RE.test(email.trim())) {
      hint = 'Enter a valid email address.';
    } else if (step === 2 && national.length > 0 && !phoneOk) {
      hint = `Enter a valid mobile number for ${country.name}.`;
    }
  }

  const goNext = () => {
    if (!stepValid || isLoading) return;
    if (step < TOTAL_STEPS - 1) {
      moved.current = true;
      setError('');
      setStep((s) => s + 1);
    } else {
      handleRegister();
    }
  };

  /* ─────────────────────────────────────────────
     Registration
  ───────────────────────────────────────────── */
  const handleRegister = async () => {
    const first = tidy(firstName);
    const last = tidy(lastName);
    // Defense in depth — stepValid already blocks reaching this with
    // anything missing, but a real signup shouldn't rely solely on a
    // button's disabled state having stayed in sync.
    if (!isValidName(first) || !isValidName(last) || !email.trim() || !phoneOk || !password) {
      setError('Please fill in all fields.');
      shake();
      return;
    }
    if (!PASSWORD_RULES.every((rule) => rule.test(password))) {
      setError('Password does not meet the requirements below.');
      shake();
      return;
    }
    setIsLoading(true);
    setError('');
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: [first, last].filter(Boolean).join(' '),
          first_name: first,
          last_name: last,
          phone: toE164(country, national),
        },
      },
    });
    setIsLoading(false);
    if (signUpError) {
      setError(
        signUpError.message.toLowerCase().includes('already registered')
          ? 'An account already exists for that email. Try signing in instead.'
          : signUpError.message
      );
      shake();
      return;
    }
    /* With email confirmation on, Supabase does not return an error for
       an address that is already registered (that would reveal which
       emails have accounts). It returns a user with no identities and
       no session. Without this check that case fell through to "Check
       your email" for a message that was never sent. */
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setError('An account already exists for that email. Try signing in instead.');
      shake();
      return;
    }
    if (data.session) {
      // signUp() hands back an active session immediately whenever this
      // Supabase project has email confirmation turned off — left as
      // it was, that sent every new account straight into Home instead
      // of sign-in. Signing back out here is what makes registration
      // land on sign-in either way, matching the check-your-email path
      // below for projects where confirmation IS required.
      await supabase.auth.signOut();
      switchTo('signin');
    } else {
      onCheckEmail(email.trim());
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
      {!kbOpen && <Text style={styles.stepLabel}>{`Step ${step + 1} of ${TOTAL_STEPS}`}</Text>}
      <ProgressBar step={step} compact={kbOpen} />

      <Animated.View
        style={[
          styles.stepContent,
          { opacity: fadeIn, transform: [{ translateY: slideIn }] },
        ]}
      >
        <Text style={styles.stepPrompt}>{PROMPTS[step]}</Text>
        <Text style={[styles.stepHelp, kbOpen && styles.stepHelpCompact]}>{STEP_HELP[step]}</Text>

        {step === 0 && (
          <View style={styles.fields}>
            <FloatField
              label="First name"
              value={firstName}
              focused={focusedField === 'first'}
              inputRef={inputRef}
              onChangeText={clear(setFirstName)}
              onFocus={() => setFocusedField('first')}
              onBlur={() => setFocusedField(null)}
              autoCapitalize="words"
              autoComplete="name-given"
              textContentType="givenName"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => lastNameRef.current?.focus()}
            />
            <FloatField
              label="Last name"
              value={lastName}
              focused={focusedField === 'last'}
              inputRef={lastNameRef}
              onChangeText={clear(setLastName)}
              onFocus={() => { setFocusedField('last'); auth.scrollToBottomSoon(); }}
              onBlur={() => setFocusedField(null)}
              autoCapitalize="words"
              autoComplete="name-family"
              textContentType="familyName"
              returnKeyType="next"
              onSubmitEditing={goNext}
            />
          </View>
        )}

        {step === 1 && (
          <FloatField
            label="Email address"
            value={email}
            focused={focusedField === 'email'}
            inputRef={inputRef}
            onChangeText={clear(setEmail)}
            onFocus={() => setFocusedField('email')}
            onBlur={() => setFocusedField(null)}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            onSubmitEditing={goNext}
          />
        )}

        {step === 2 && (
          <PhoneInput
            iso={countryIso}
            national={national}
            onChangeIso={(iso) => {
              setCountryIso(iso);
              if (error) setError('');
            }}
            onChangeNational={(digits) => {
              setNational(digits);
              if (error) setError('');
            }}
            inputRef={inputRef}
            onFocus={() => setFocusedField('phone')}
            onBlur={() => setFocusedField(null)}
            onSubmitEditing={goNext}
          />
        )}

        {step === 3 && (
          <>
            <FloatField
              label="Password"
              value={password}
              focused={focusedField === 'password'}
              inputRef={inputRef}
              onChangeText={clear(setPassword)}
              onFocus={() => { setFocusedField('password'); auth.scrollToBottomSoon(); }}
              onBlur={() => setFocusedField(null)}
              secureTextEntry={!showPassword}
              maxLength={PASSWORD_MAX}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={goNext}
              right={
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowPassword((value) => !value)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff size={20} color={colors.mutedFg} />
                  ) : (
                    <Eye size={20} color={colors.mutedFg} />
                  )}
                </TouchableOpacity>
              }
            />
            <View style={[styles.passwordRules, kbOpen && styles.passwordRulesCompact]}>
              {PASSWORD_RULES.map((rule) => {
                const met = rule.test(password);
                return (
                  <View key={rule.id} style={styles.passwordRuleRow}>
                    {met ? (
                      <Check size={13} color={status.success.fg} strokeWidth={3} />
                    ) : (
                      <View style={styles.passwordRuleDot} />
                    )}
                    <Text style={[styles.passwordRuleText, met && styles.passwordRuleTextOn]}>
                      {rule.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* A fixed-height slot, so a hint appearing doesn't push the
            button down under someone's thumb. */}
        <View style={styles.hintSlot}>
          {hint ? (
            <Text style={styles.hintText} accessibilityLiveRegion="polite">
              {hint}
            </Text>
          ) : null}
        </View>
      </Animated.View>

      {error ? (
        <Animated.View
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
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
        >
          <Text style={styles.errorText}>{error}</Text>
        </Animated.View>
      ) : null}

      <Animated.View style={{ transform: [{ scale: btnScale }] }}>
        <TouchableOpacity
          style={[
            styles.btnPrimary,
            !stepValid && styles.btnPrimaryDisabled,
            isLoading && styles.btnPrimaryLoading,
          ]}
          onPress={goNext}
          onPressIn={pressIn}
          onPressOut={pressOut}
          disabled={!stepValid || isLoading}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={step < TOTAL_STEPS - 1 ? 'Continue' : 'Create account'}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.primaryFg} />
          ) : (
            <Text style={[styles.btnPrimaryLabel, !stepValid && styles.btnPrimaryLabelDisabled]}>
              {step < TOTAL_STEPS - 1 ? 'Continue' : 'Create account'}
            </Text>
          )}
        </TouchableOpacity>
      </Animated.View>

      {!kbOpen && (
        <Text style={styles.fine}>
          By continuing you agree to the clinic&apos;s terms and privacy policy.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  /* ── Body ── */
  body: {
    flex: 1,
    paddingHorizontal: space.xxl,
    paddingTop: space.xxl,
  },
  bodyCompact: { paddingTop: space.lg, paddingBottom: space.lg },

  stepLabel: {
    ...text.eyebrow,
    color: colors.mutedFg,
    marginBottom: space.sm,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: space.xxl,
  },
  progressRowCompact: { marginBottom: space.lg },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.muted,
  },
  // Steps behind you are navy; the one you're on is gold — the same
  // "you are here" the admin's active tab underline uses.
  progressDone: { backgroundColor: colors.primary },
  progressCurrent: { backgroundColor: colors.accent },

  // No flex: 1 here. The body fills the screen, so a flexing step
  // would stretch to fill it and push the button to the very bottom,
  // far from the field and against the keyboard.
  stepContent: {},
  stepPrompt: {
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
    color: colors.foreground,
  },
  stepHelp: {
    ...text.body,
    color: colors.mutedFg,
    marginTop: space.sm,
    marginBottom: space.xl,
  },
  stepHelpCompact: { marginBottom: space.md },

  fields: { gap: space.md },

  eyeBtn: {
    width: BUTTON_H,
    height: BUTTON_H,
    alignItems: 'center',
    justifyContent: 'center',
  },

  hintSlot: {
    minHeight: 22,
    marginTop: space.sm,
    paddingHorizontal: space.sm,
  },
  hintText: { ...text.small, color: colors.destructive },

  passwordRules: {
    marginTop: space.xl,
    paddingHorizontal: space.sm,
    gap: 7,
  },
  passwordRulesCompact: { marginTop: space.md, gap: 5 },
  passwordRuleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  passwordRuleDot: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.mutedFg,
  },
  passwordRuleText: {
    ...text.caption,
    color: colors.mutedFg,
  },
  passwordRuleTextOn: {
    color: colors.foreground,
  },

  errorBox: {
    marginTop: space.lg,
    borderWidth: 1,
    borderColor: colors.destructive,
    backgroundColor: colors.destructiveBg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
  },
  errorText: {
    ...text.small,
    color: colors.destructive,
  },

  /* ── Button: 48px, fully rounded, like sign in ── */
  btnPrimary: {
    height: BUTTON_H,
    borderRadius: BUTTON_H / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.lg,
    ...shadow.primary,
  },
  btnPrimaryDisabled: {
    backgroundColor: colors.muted,
    shadowOpacity: 0,
    elevation: 0,
  },
  btnPrimaryLoading: {
    backgroundColor: colors.primaryDark,
  },
  btnPrimaryLabel: {
    ...text.bodyBold,
    color: colors.primaryFg,
  },
  // Cream on the muted fill is 1.17:1 — the label vanished. This is the
  // muted-foreground colour instead.
  btnPrimaryLabelDisabled: {
    color: colors.mutedFg,
  },

  fine: {
    ...text.caption,
    color: colors.mutedFg,
    textAlign: 'center',
    marginTop: space.xl,
    paddingHorizontal: space.md,
  },
});
