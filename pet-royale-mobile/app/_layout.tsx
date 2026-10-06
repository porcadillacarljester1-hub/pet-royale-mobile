import { useEffect, useRef, useState } from 'react';
import { LogBox, Platform, StyleSheet, View } from 'react-native';
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
]);

/* If working out where to send the person takes longer than this (no
   signal, a hung request), let the splash go anyway rather than hold it
   forever. */
const SPLASH_TIMEOUT_MS = 8000;

export default function RootLayout() {
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const navigationReady = !!navigationState?.key;

  const [session, setSession] = useState<any>(null);
  // True once the first destination has been chosen and navigated to.
  const [routed, setRouted] = useState(false);
  const startedRouting = useRef(false);

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
     layout renders nothing until fonts are ready, so on a cold start
     the navigator doesn't exist yet).

     The splash stays up until this finishes, so the first thing shown
     after it is the right screen — not the welcome page for a moment
     followed by a jump to home. */
  useEffect(() => {
    if (!navigationReady || startedRouting.current) return;
    startedRouting.current = true;

    const timeout = setTimeout(() => setRouted(true), SPLASH_TIMEOUT_MS);

    (async () => {
      let destination = '/';

      try {
        const { data: { session: current } } = await supabase.auth.getSession();
        setSession(current);

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
        }
      } catch {
        // A stale/corrupt session must not leave the app on a blank screen.
        await supabase.auth.signOut().catch(() => undefined);
        setSession(null);
        destination = '/';
      }

      router.replace(destination as any);
      clearTimeout(timeout);
      setRouted(true);
    })();

    return () => clearTimeout(timeout);
  }, [navigationReady, router]);

  useEffect(() => {
    if (fontsReady && routed) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsReady, routed]);

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

  if (!fontsReady) return null;

  return (
    <KeyboardProvider>
      <View style={styles.root}>
        <Stack
          screenOptions={{
            headerShown: false,
            // Cream behind every screen, so a transition never flashes white.
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="signin" />
          <Stack.Screen name="forgot-password" />
          <Stack.Screen name="register" />
          <Stack.Screen name="complete-profile" />
          <Stack.Screen name="services" />
          <Stack.Screen name="profile-photo" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </View>
    </KeyboardProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});
