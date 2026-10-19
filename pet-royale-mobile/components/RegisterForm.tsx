import { useEffect, useRef, useState, type ComponentProps, type RefObject } from 'react';
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
import { BUTTON_H, type AuthCtx } from './AuthShell';
import { colors, status, text, fonts, space, radius, shadow } from '../constants/theme';
import { PhoneInput } from './PhoneInput';
import { DEFAULT_ISO, getCountry, isValidMobile, toE164 } from '../lib/phone';

const TOTAL_STEPS = 6;
const PASSWORD_MAX = 72;

/* A symbol is an ASCII punctuation character. Accented letters such as é
   and ñ do not count as symbols. */
const SYMBOL_RE = /[!-\/:-@\[-`{-~]/;

const PASSWORD_RULES: { id: string; label: string; test: (v: string) => boolean }[] = [
  { id: 'length', label: 'At least 12 characters', test: (v) => v.length >= 12 && v.length <= PASSWORD_MAX },
  { id: 'upper', label: 'One uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { id: 'lower', label: 'One lowercase letter', test: (v) => /[a-z]/.test(v) },
  { id: 'number', label: 'One number', test: (v) => /[0-9]/.test(v) },
  { id: 'special', label: 'One symbol, like ! or @', test: (v) => SYMBOL_RE.test(v) },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* A name: at least 2 characters, at least one letter, and no digits or
   symbols. Hyphens, apostrophes, periods and spaces are fine. */
const NAME_BAD_RE = /[0-9_!@#$%^&*()+=\[\]{}<>\/\\|~`?,;:"]/;
const NAME_HAS_LETTER_RE = /[^\s0-9.'\u2019-]/;

function isValidName(value: string): boolean {
  const v = value.trim();
  return v.length >= 2 && !NAME_BAD_RE.test(v) && NAME_HAS_LETTER_RE.test(v);
}

/* Address: at least 8 characters including a letter (street, barangay, city). */
const isValidAddress = (value: string) => value.trim().length >= 8 && /[A-Za-z]/.test(value);

/* Messenger: the clinic's way to reach the owner, so it is required. */
const isValidMessenger = (value: string) => value.trim().length >= 2;

const tidy = (value: string) => value.trim().replace(/\s+/g, ' ');

const STEP_HELP = [
  'The name you\u2019d like the clinic to see on your appointments.',
  'We\u2019ll send a confirmation link here, and you\u2019ll sign in with this address.',
  'A mobile number, so the clinic can reach you about your appointments.',
  'Your street, barangay and city. We use it for records and pet pick-up.',
  'The name or link we can message you on, so the clinic can contact you.',
  'You\u2019ll sign in with this. Use one you don\u2019t use anywhere else.',
];

const PROMPTS = [
  'What should we call you?',
  'What\u2019s your email?',
  'Best number to reach you?',
  'Where do you live?',
  'Your Facebook Messenger?',
  'Set a password',
];

/* A plain text field. No floating label: the question above it says what
   it is, and the placeholder says what to type. */
type InputProps = ComponentProps<typeof TextInput> & {
  inputRef?: RefObject<TextInput | null>;
  focused: boolean;
  /** Title shown above the box. The placeholder is the hint inside it. */
  label?: string;
};
function Input({ inputRef, focused, label, style, ...rest }: InputProps) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        ref={inputRef}
        placeholderTextColor={colors.mutedFg}
        style={[styles.input, focused && styles.inputFocused, style]}
        {...rest}
      />
    </View>
  );
}

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
  /** Sign-up worked and a confirmation email was sent. */
  onCheckEmail: (email: string) => void;
  /** Goes up by one when the person taps "Use a different email" on the
      Check your email page; the form returns to the email step. */
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
  const [address, setAddress] = useState('');
  const [messenger, setMessenger] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  /* Which field has focus, so the focused field can be highlighted and
     hints wait until the person leaves the field. */
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const fieldFocused = focusedField !== null;

  const inputRef = useRef<TextInput>(null);
  const lastNameRef = useRef<TextInput>(null);

  const country = getCountry(countryIso);

  const [fadeIn] = useState(() => new Animated.Value(1));
  const [slideIn] = useState(() => new Animated.Value(0));
  const [errorShake] = useState(() => new Animated.Value(0));
  const [btnScale] = useState(() => new Animated.Value(1));

  const [moved, setMoved] = useState(false);

  /* The step's entrance replays when the step changes. */
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

  /* If the keyboard was already up when this form appeared, keep it up. */
  const [startFocused] = useState(auth.kbOpen);

  /* Focus the field on each step. On the first step, skip this unless the
     keyboard was already open, so arriving does not collapse the hero. */
  useEffect(() => {
    if (step === 0 && !startFocused && !moved) return;
    const t = setTimeout(() => inputRef.current?.focus(), step === 0 ? 80 : 260);
    return () => clearTimeout(t);
  }, [step, startFocused, moved]);

  /* "Use a different email" on the Check your email page. The nonce is
     compared during render and the state is updated there, which avoids
     calling setState inside an effect. */
  const [seenNonce, setSeenNonce] = useState(editEmailNonce);
  if (editEmailNonce !== seenNonce) {
    setSeenNonce(editEmailNonce);
    if (editEmailNonce !== 0) {
      setMoved(true);
      setError('');
      setStep(1);
    }
  }

  /* The back button lives in the shell. On later steps it goes back a step.
     Defined inside the effect, so no memoised callback is needed. */
  useEffect(() => {
    setBackHandler(() => {
      if (step === 0) return false;
      setMoved(true);
      setError('');
      setStep((s) => s - 1);
      return true;
    });
    return () => setBackHandler(null);
  }, [setBackHandler, step]);

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

  const namesOk = isValidName(firstName) && isValidName(lastName);
  const phoneOk = isValidMobile(country, national);
  const addressOk = isValidAddress(address);
  const messengerOk = isValidMessenger(messenger);

  /* Whether the field on the current step is complete. Gates the button. */
  const stepValid = [
    namesOk,
    EMAIL_RE.test(email.trim()),
    phoneOk,
    addressOk,
    messengerOk,
    PASSWORD_RULES.every((rule) => rule.test(password)),
  ][step];

  /* Hints appear only after the person leaves the field. */
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
    } else if (step === 3 && address.length > 0 && !addressOk) {
      hint = 'Include your street, barangay and city.';
    } else if (step === 4 && messenger.length > 0 && !messengerOk) {
      hint = 'Enter your Messenger name or link.';
    }
  }

  const goNext = () => {
    if (!stepValid || isLoading) return;
    if (step < TOTAL_STEPS - 1) {
      setMoved(true);
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
    // stepValid already blocks this; the check stays in case the button
    // and the step ever fall out of sync.
    if (
      !isValidName(first) || !isValidName(last) || !email.trim() || !phoneOk ||
      !addressOk || !messengerOk || !password
    ) {
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
          address: tidy(address),
          fb_messenger: messenger.trim(),
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
    /* An address that is already registered returns a user with no
       identities and no session, without an error. */
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setError('An account already exists for that email. Try signing in instead.');
      shake();
      return;
    }
    if (data.session) {
      // Email confirmation is off for this project. Sign out so that
      // registration still lands on sign-in.
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
        style={[styles.stepContent, { opacity: fadeIn, transform: [{ translateY: slideIn }] }]}
      >
        <Text style={styles.stepPrompt}>{PROMPTS[step]}</Text>
        <Text style={[styles.stepHelp, kbOpen && styles.stepHelpCompact]}>{STEP_HELP[step]}</Text>

        {step === 0 && (
          <View style={styles.fields}>
            <Input
              inputRef={inputRef}
              focused={focusedField === 'first'}
              label="First name"
              placeholder="e.g. Juan"
              value={firstName}
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
            <Input
              inputRef={lastNameRef}
              focused={focusedField === 'last'}
              label="Last name"
              placeholder="e.g. Dela Cruz"
              value={lastName}
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
          <Input
            inputRef={inputRef}
            focused={focusedField === 'email'}
              label="Email address"
            placeholder="you@example.com"
            value={email}
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
          <View style={styles.field}>
          <Text style={styles.fieldLabel}>Mobile number</Text>
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
          </View>
        )}

        {step === 3 && (
          <Input
            inputRef={inputRef}
            focused={focusedField === 'address'}
              label="Address"
            placeholder="Street, barangay, city"
            value={address}
            onChangeText={clear(setAddress)}
            onFocus={() => { setFocusedField('address'); auth.scrollToBottomSoon(); }}
            onBlur={() => setFocusedField(null)}
            autoCapitalize="words"
            autoComplete="street-address"
            textContentType="fullStreetAddress"
            returnKeyType="next"
            onSubmitEditing={goNext}
          />
        )}

        {step === 4 && (
          <Input
            inputRef={inputRef}
            focused={focusedField === 'messenger'}
              label="Messenger"
            placeholder="Name or link"
            value={messenger}
            onChangeText={clear(setMessenger)}
            onFocus={() => { setFocusedField('messenger'); auth.scrollToBottomSoon(); }}
            onBlur={() => setFocusedField(null)}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={goNext}
          />
        )}

        {step === 5 && (
          <>
            <Text style={styles.fieldLabel}>Password</Text>
            <View style={styles.pwRow}>
              <Input
                inputRef={inputRef}
                focused={focusedField === 'password'}
                placeholder="At least 12 characters"
                value={password}
                onChangeText={clear(setPassword)}
                onFocus={() => { setFocusedField('password'); auth.scrollToBottomSoon(); }}
                onBlur={() => setFocusedField(null)}
                secureTextEntry={!showPassword}
                maxLength={PASSWORD_MAX}
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="go"
                onSubmitEditing={goNext}
                style={styles.pwInput}
              />
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
            </View>
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

        {/* Fixed height, so a hint appearing does not move the button. */}
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
  progressDone: { backgroundColor: colors.primary },
  progressCurrent: { backgroundColor: colors.accent },

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

  /* A field is a title above a filled box. The placeholder is the hint. */
  field: {},
  fieldLabel: {
    ...text.small,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 8,
  },
  input: {
    ...text.body,
    height: 58,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: colors.muted,
    paddingHorizontal: 20,
    color: colors.foreground,
  },
  inputFocused: {
    borderColor: colors.primary,
    backgroundColor: '#ffffff',
  },

  pwRow: { position: 'relative' },
  pwInput: { paddingRight: 56 },
  eyeBtn: {
    position: 'absolute',
    right: 14,
    top: 0,
    height: 58,
    width: 44,
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
