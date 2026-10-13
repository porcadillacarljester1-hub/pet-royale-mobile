import '../lib/ignoreDevWarnings';
import '../lib/reanimatedLogger';
import { useEffect, useRef, useState } from 'react';
import { LogBox, Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, useRouter, useRootNavigationState } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import {
  Fraunces_400Regular,
  Fraunces_600SemiBold,
} from '@expo-google-fonts/fraunces';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import { supabase } from '../lib/supabase';
import { registerForPushNotifications } from '../lib/notifications';
import { syncProviderAvatar } from '../lib/avatarHistory';
import { colors } from '../constants/theme';
import '../lib/capFontScale';
import { hasSeenIntro } from '../utils/firstLaunch';
import LoadingScreen from '../components/LoadingScreen';

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = 'html, body, #root { height: 100%; } #root { display: flex; }';
  document.head.appendChild(style);
}

SplashScreen.preventAutoHideAsync().catch(() => undefined);

LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications',
  '`expo-notifications` functionality is not fully supported in Expo Go',
  'Ionicons',
  'fontFamily',
  'Font',
  '[Reanimated] Reading from value during component render',
]);

/* If working out where to send the person takes longer than this (no
   signal, a hung request), let the splash go anyway rather than hold it
   forever. */
const SPLASH_TIMEOUT_MS = 8000;

/* Keep the loading screen up at least this long, even when everything is
   ready sooner, so the animation is actually seen. */
const MIN_LOADING_MS = 1500;

/* After this long still waiting, tell the person the connection is slow. */
const SLOW_MS = 5000;

export default function RootLayout() {
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const navigationReady = !!navigationState?.key;

  const [session, setSession] = useState<any>(null);
  // True once the first destination has been chosen and navigated to.
  const [routed, setRouted] = useState(false);
  const startedRouting = useRef(false);

  // True once the loading screen has been shown for its minimum time.
  const [minElapsed, setMinElapsed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), MIN_LOADING_MS);
    return () => clearTimeout(t);
  }, []);

  // Real startup progress: 0 = nothing yet, 1 = session checked,
  // 2 = account/profile checked.
  const [loadStep, setLoadStep] = useState(0);
  // Flips on if startup is taking a while (slow or no internet).
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(t);
  }, []);

  const [fontsLoaded, fontError] = useFonts({
    'Ionicons': require('../assets/Ionicons.ttf'),
    Fraunces_400Regular,
    Fraunces_600SemiBold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });
  // A font that fails to load shouldn't leave the app on the splash
  // forever — the system font is better than nothing.
  const fontsReady = fontsLoaded || !!fontError;

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  /* Decide where to start, once, as soon as the navigator exists.

     Navigating before the navigator has mounted throws, so this waits
     for the navigation state instead of firing on first render (the
     Stack only renders once fonts are ready, so on a cold start the
     navigator doesn't exist yet).

     The loading screen stays up until this finishes, so the first thing
     shown after it is the right screen — not the welcome page for a
     moment followed by a jump to home. */
  useEffect(() => {
    if (!navigationReady || startedRouting.current) return;
    startedRouting.current = true;

    const timeout = setTimeout(() => setRouted(true), SPLASH_TIMEOUT_MS);

    (async () => {
      let destination = '/';

      try {
        const { data: { session: current } } = await supabase.auth.getSession();
        setSession(current);
        setLoadStep((s) => Math.max(s, 1));

        if (current) {
          destination = '/(tabs)/home';

          const { data: client, error } = await supabase
            .from('clients')
            .select('phone')
            .eq('id', current.user.id)
            .maybeSingle();

          /* Only send someone to complete their profile when we
             actually know it's incomplete. If the lookup failed (no
             signal), we can't tell, and sending a finished account back
             to a form it already filled in is worse than letting it
             through. */
          if (!error && !client?.phone) destination = '/complete-profile';
        } else {
          /* Signed out: first launch goes through the intro pager once,
             after that straight to the welcome screen. */
          destination = (await hasSeenIntro()) ? '/' : '/intro';
        }
      } catch {
        // A stale/corrupt session must not leave the app on a blank screen.
        await supabase.auth.signOut().catch(() => undefined);
        setSession(null);
        destination = '/';
      }

      setLoadStep(2);
      router.replace(destination as any);
      clearTimeout(timeout);
      setRouted(true);
    })();

    return () => clearTimeout(timeout);
  }, [navigationReady, router]);

  const userId: string | undefined = session?.user?.id;

  useEffect(() => {
    if (!userId || Platform.OS === 'web') return;
    (async () => {
      const token = await registerForPushNotifications();
      if (!token) return;
      const { error } = await supabase.rpc('register_push_token', {
        p_token: token,
        p_platform: Platform.OS,
      });
      if (error) console.log('PUSH SAVE ERROR:', error.message);
    })();
  }, [userId]);

  /* Appointment confirmed/completed alerts come from the server: the
     notify-appointment-status Edge Function sends an Expo push when the
     status changes. The app must not also post its own local notification
     for the same change, or the phone shows two while the app is open. */
  useEffect(() => {
    if (!userId) return;

    syncProviderAvatar(session.user).catch(() => {
      // Avatar syncing is supplementary and must not block app startup.
    });
  }, [userId]);

  // What the loading screen shows, based on what the app is really waiting for.
  let progress = 0.1;
  let status = 'Loading fonts…';
  if (fontsReady) {
    progress = 0.35;
    status = 'Starting up…';
  }
  if (navigationReady) {
    progress = 0.5;
    status = 'Checking your account…';
  }
  if (loadStep >= 1) progress = 0.75;
  if (loadStep >= 2) {
    progress = 0.95;
    status = 'Almost there…';
  }
  if (routed) progress = 1;
  if (slow && !routed) status = 'Slow connection…';

  return (
    <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
      <GestureHandlerRootView style={styles.root}>
        {fontsReady && (
          <Stack
            screenOptions={{
              headerShown: false,
              // Cream behind every screen, so a transition never flashes white.
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="intro" />
            <Stack.Screen name="signin" />
            <Stack.Screen name="forgot-password" options={{ animation: 'none' }} />
            <Stack.Screen name="register" />
            <Stack.Screen name="complete-profile" />
            <Stack.Screen name="services" />
            <Stack.Screen name="profile-photo" />
            <Stack.Screen name="(tabs)" />
          </Stack>
        )}

        {/* Stays on top until fonts are ready, the first destination is
            chosen, AND the minimum display time has passed. */}
        {(!fontsReady || !routed || !minElapsed) && (
          <View
            style={StyleSheet.absoluteFill}
            onLayout={() => SplashScreen.hideAsync().catch(() => undefined)}
          >
            <LoadingScreen progress={progress} status={status} />
          </View>
        )}
      </GestureHandlerRootView>
    </KeyboardProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});
