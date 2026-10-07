import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Animated,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { ChevronLeft } from 'lucide-react-native';
import { BrandWordmark } from '../constants/brand';
import AuthSwitch, { type AuthMode } from './AuthSwitch';
import { colors, text, space, shadow, hitSlop } from '../constants/theme';

export type { AuthMode };

/* The two ways in, plus the forgot-password flow. All three live inside
   this one shell so the hero never redraws between them. */
export type ShellMode = AuthMode | 'forgot';

/* Every button on the auth screens is the same height. */
export const BUTTON_H = 48;

/* What the shell hands to whichever form is showing. */
export type AuthCtx = {
  /** The keyboard is up (the hero is collapsed). */
  kbOpen: boolean;
  scrollToBottomSoon: (ms?: number) => void;
  /** Switch forms with the same fade the switch uses. */
  switchTo: (to: ShellMode) => void;
  /** Call just before a form swaps one focused input for another, so the
      keyboard blinking doesn't collapse and re-open the hero. */
  holdLayout: (ms?: number) => void;
  /** Let a form handle the back button first (the register steps do).
      Return true if it was handled. Pass null to clear. */
  setBackHandler: (handler: (() => boolean) | null) => void;
};

const FADE_OUT = 90;
const FADE_IN = 140;
// If the new form hasn't reported in by now, fade in anyway.
const FADE_IN_FALLBACK = 300;

/* Going to or from Forgot password changes what the pill is (step progress
   vs. the Sign in / Create account switch). Sign in <-> Create account keeps
   the same switch, whose indicator slides, so that one must not fade. */
const crossesForgot = (from: ShellMode, to: ShellMode) =>
  (from === 'forgot') !== (to === 'forgot');

/* Gold rings in the corner of the hero card. They echo the ring around
   pet photos elsewhere in the app. */
function HeroRings() {
  return (
    <Svg
      width={240}
      height={240}
      viewBox="0 0 240 240"
      style={styles.rings}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Circle cx="120" cy="120" r="110" stroke={colors.accent} strokeOpacity={0.35} strokeWidth={2} fill="none" />
      <Circle cx="120" cy="120" r="82" stroke={colors.accent} strokeOpacity={0.5} strokeWidth={2} fill="none" />
      <Circle cx="120" cy="120" r="54" stroke={colors.accent} strokeOpacity={0.75} strokeWidth={2} fill="none" />
    </Svg>
  );
}

/* Everything the sign in and register screens have in common: the hero
   card, the Sign in / Create account switch, and the keyboard handling.

   Switching between the two used to navigate to another route, which
   rebuilt all of this and showed up as a flash. Now this stays mounted and
   only the form below it is swapped, behind a short fade. The hero and the
   switch never move. */
export default function AuthShell({
  mode,
  onSwitch,
  onBack,
  pill,
  children,
}: {
  mode: ShellMode;
  onSwitch: (to: ShellMode) => void;
  /** Replaces the Sign in / Create account switch (the forgot-password
      flow shows its step progress there instead). */
  pill?: (style: object) => ReactNode;
  /** Leave the auth screens (the back button, when no form handles it). */
  onBack: () => void;
  children: (ctx: AuthCtx) => ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const statusBarHeight = Math.max(insets.top, StatusBar.currentHeight ?? 0);

  /* ── Keyboard handling ── */
  const rootRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  // While the keyboard is up the big hero card collapses, so the whole
  // form fits above the keyboard without scrolling.
  const [kbOpen, setKbOpen] = useState(false);
  const [kbPad, setKbPad] = useState(0);
  // Only let the screen scroll when the content really is taller than it.
  const [viewH, setViewH] = useState(0);
  const [contentH, setContentH] = useState(0);
  // True while one form is being swapped for the other. Removing the
  // focused input makes the keyboard blink; that must not collapse and
  // re-open the hero.
  const swapping = useRef(false);
  // Filled in by the keyboard effect below; run a moment after a swap.
  const settleRef = useRef<() => void>(() => undefined);

  const scrollToBottomSoon = useCallback((ms = 150) => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), ms);
  }, []);

  /* A form is about to swap its focused input for another. Treat the
     keyboard blinking as part of the swap, then settle once it's had time
     to come back. */
  const holdLayout = useCallback((ms = 700) => {
    swapping.current = true;
    setTimeout(() => settleRef.current(), ms);
  }, []);

  /* Only listen while this screen is the one showing. Keyboard events are
     global and a screen under another one in the stack stays mounted, so
     without this, opening the keyboard on (say) Forgot password collapsed
     this screen's hero behind it, and going back showed it collapsed and
     then jumping open. */
  useFocusEffect(
    useCallback(() => {
    // Coming back into view: if the keyboard is gone, don't show a
    // collapsed layout left over from before.
    if (!Keyboard.isVisible()) {
      setKbOpen(false);
      setKbPad(0);
    }

    /* On Android, dismissing the keyboard with Back leaves the input
       "focused", so tapping it again does nothing and the keyboard never
       returns. Drop focus whenever the keyboard hides. */
    const dropFocus = () => {
      const focused = TextInput.State.currentlyFocusedInput();
      if (focused) TextInput.State.blurTextInput(focused);
    };
    const collapse = () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKbOpen(false);
      setKbPad(0);
    };

    /* Keep the buttons above the keyboard. If the window already shrinks
       for the keyboard there's no overlap and nothing is added; if the
       keyboard floats over the screen (edge-to-edge Android), the overlap
       is added as bottom padding so the form can scroll clear of it. */
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKbOpen(true);
      rootRef.current?.measureInWindow((_x, y, _w, h) => {
        setKbPad(Math.max(0, y + h - e.endCoordinates.screenY));
        scrollToBottomSoon(80);
      });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      if (swapping.current) return;
      collapse();
      dropFocus();
    });

    /* Called a moment after a swap. If nothing took focus and the keyboard
       is not up, the swap closed it for good, so settle the layout. If an
       input has focus the keyboard is simply still opening; leave it. */
    settleRef.current = () => {
      swapping.current = false;
      if (!Keyboard.isVisible() && !TextInput.State.currentlyFocusedInput()) collapse();
    };

    return () => {
      show.remove();
      hide.remove();
    };
    }, [scrollToBottomSoon])
  );

  /* ── Switching forms ──
     The form fades out, the mode changes, and the form fades back in. Two
     things keep that from showing as a flicker:
       - The pill (step progress / Sign in switch) fades with the form
         whenever it changes kind, instead of cutting in a single frame.
       - The fade-in waits until the new mode has actually rendered, so the
         old form is never faded back in for a frame before it's replaced. */
  const [formOpacity] = useState(() => new Animated.Value(1));
  const [pillOpacity] = useState(() => new Animated.Value(1));
  const modeRef = useRef(mode);
  // The form the person last asked for. A second tap during the fade
  // changes this instead of starting another fade.
  const wanted = useRef(mode);
  const running = useRef(false);
  // True between asking the parent to change mode and fading back in.
  const pendingFadeIn = useRef(false);
  const fadeInTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Lets switchTo call itself after the fade without referencing its own
  // variable inside its definition.
  const switchToRef = useRef<(to: ShellMode) => void>(() => undefined);

  const fadeIn = useCallback(() => {
    pendingFadeIn.current = false;
    if (fadeInTimer.current) {
      clearTimeout(fadeInTimer.current);
      fadeInTimer.current = null;
    }
    Animated.parallel([
      Animated.timing(formOpacity, { toValue: 1, duration: FADE_IN, useNativeDriver: true }),
      Animated.timing(pillOpacity, { toValue: 1, duration: FADE_IN, useNativeDriver: true }),
    ]).start(() => {
      running.current = false;
      if (wanted.current !== modeRef.current) switchToRef.current(wanted.current);
    });
  }, [formOpacity, pillOpacity]);

  useEffect(() => {
    modeRef.current = mode;
    wanted.current = mode;
    if (!pendingFadeIn.current) return undefined;
    // One frame after the commit, so the new form has been laid out.
    const id = requestAnimationFrame(() => {
      if (pendingFadeIn.current) fadeIn();
    });
    return () => cancelAnimationFrame(id);
  }, [mode, fadeIn]);

  useEffect(() => {
    return () => {
      if (fadeInTimer.current) clearTimeout(fadeInTimer.current);
    };
  }, []);

  const switchTo = useCallback(
    (next: ShellMode) => {
      wanted.current = next;
      if (running.current || next === modeRef.current) return;
      running.current = true;

      const fadePill = crossesForgot(modeRef.current, next);
      const fadeOut = [Animated.timing(formOpacity, { toValue: 0, duration: FADE_OUT, useNativeDriver: true })];
      if (fadePill) {
        fadeOut.push(Animated.timing(pillOpacity, { toValue: 0, duration: FADE_OUT, useNativeDriver: true }));
      }

      Animated.parallel(fadeOut).start(() => {
        // Tapped back to where it already was: nothing to swap.
        if (wanted.current === modeRef.current) {
          fadeIn();
          return;
        }
        swapping.current = true;
        pendingFadeIn.current = true;
        onSwitch(wanted.current);
        setTimeout(() => settleRef.current(), 400);
        // The mode effect above starts the fade-in once the new form is in.
        // This is only a safety net in case it never does.
        fadeInTimer.current = setTimeout(() => {
          if (pendingFadeIn.current) fadeIn();
        }, FADE_IN_FALLBACK);
      });
    },
    [formOpacity, pillOpacity, onSwitch, fadeIn]
  );

  useEffect(() => {
    switchToRef.current = switchTo;
  }, [switchTo]);

  /* ── Back button ── */
  const backHandler = useRef<(() => boolean) | null>(null);
  const setBackHandler = useCallback((handler: (() => boolean) | null) => {
    backHandler.current = handler;
  }, []);
  const handleBack = () => {
    if (backHandler.current?.()) return;
    onBack();
  };

  /* The slot carries the margins and the opacity; the pill inside keeps
     the shadow and elevation, so the fade doesn't sit on the elevated view. */
  const renderSwitch = (slotStyle: object) => (
    <Animated.View style={[slotStyle, { opacity: pillOpacity }]}>
      {pill ? (
        pill(styles.switchPill)
      ) : (
        <AuthSwitch active={mode === 'forgot' ? 'signin' : mode} onSwitch={switchTo} style={styles.switchPill} />
      )}
    </Animated.View>
  );

  return (
    <View ref={rootRef} collapsable={false} style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      {/* No 'height' behaviour on Android: the screen measures how much the
          keyboard covers and pads the form itself (see the keyboard effect
          above), which works whether or not the window resizes. */}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.scroll, { paddingBottom: kbPad }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
          scrollEnabled={contentH > viewH + 1}
          onLayout={(e) => setViewH(e.nativeEvent.layout.height)}
          onContentSizeChange={(_, h) => setContentH(h)}
        >
          {kbOpen ? (
            /* Keyboard up: just the back button and the switch. */
            <View style={[styles.compactBar, { marginTop: statusBarHeight + space.sm }]}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={handleBack}
                activeOpacity={0.7}
                hitSlop={hitSlop}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <ChevronLeft size={28} color={colors.primary} strokeWidth={2.2} />
              </TouchableOpacity>
              {renderSwitch(styles.compactSlot)}
            </View>
          ) : (
            <>
              {/* ── Hero card: navy and gold, floating inside the screen ── */}
              <View style={[styles.hero, { marginTop: statusBarHeight + space.md }]}>
                <HeroRings />

                {/* Same back button as My Pets: a plain chevron, no circle. */}
                <TouchableOpacity
                  style={styles.backBtn}
                  onPress={handleBack}
                  activeOpacity={0.7}
                  hitSlop={hitSlop}
                  accessibilityRole="button"
                  accessibilityLabel="Go back"
                >
                  <ChevronLeft size={28} color={colors.primaryFg} strokeWidth={2.2} />
                </TouchableOpacity>

                <View style={styles.brandBlock}>
                  <BrandWordmark height={40} color={colors.accent} />
                  <Text style={styles.brandTag}>Clinic and Veterinary Services</Text>
                </View>
              </View>

              {/* ── Switch between the two ways in. It overlaps the hero. ── */}
              {renderSwitch(styles.switchSlot)}
            </>
          )}

          {/* ── Form: the only part that fades when switching ── */}
          <Animated.View style={[styles.flex, { opacity: formOpacity }]}>
            {/* eslint-disable-next-line react-hooks/refs -- these only touch refs from handlers, never during render */}
            {children({ kbOpen, scrollToBottomSoon, switchTo, holdLayout, setBackHandler })}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },

  /* ── Hero card ── */
  hero: {
    marginHorizontal: space.lg,
    backgroundColor: colors.primary,
    borderRadius: 32,
    overflow: 'hidden',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.xxxl + space.md,
  },
  rings: { position: 'absolute', right: -70, top: -60 },
  backBtn: {
    width: BUTTON_H,
    height: BUTTON_H,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  brandBlock: {
    alignItems: 'center',
    marginTop: space.sm,
  },
  brandTag: {
    ...text.small,
    color: colors.primaryFg,
    opacity: 0.78,
    letterSpacing: 0.4,
    marginTop: space.md,
  },

  /* ── Switch: overlaps the bottom of the hero ──
     The slot holds the position; the pill holds the look. */
  switchSlot: {
    marginHorizontal: space.xxl,
    marginTop: -26,
  },
  /* Keyboard up: back button and switch on one row. */
  compactBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginHorizontal: space.lg,
  },
  compactSlot: { flex: 1 },
  switchPill: {
    flexDirection: 'row',
    height: 52,
    padding: 4,
    borderRadius: 26,
    backgroundColor: colors.card,
    ...shadow.primary,
    elevation: 6,
  },
});
