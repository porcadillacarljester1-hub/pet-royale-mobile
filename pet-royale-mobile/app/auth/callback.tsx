import { useEffect } from 'react';
import { View, ActivityIndicator, StatusBar, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, common } from '../../constants/theme';

/**
 * Landing route for the Google sign-in redirect (petroyalemobile://auth/callback).
 *
 * When Google sends the person back to the app, the OS opens that deep
 * link and expo-router tries to navigate to it as a screen. With no
 * file at app/auth/callback.tsx it shows "Unmatched Route" — which is
 * what appears for a moment before the sign-in screen finishes and
 * moves on to home.
 *
 * The tokens in the URL are handled by the sign-in screen
 * (WebBrowser.openAuthSessionAsync returns them, and it sets the
 * session and routes on), so this screen has nothing to process. It
 * just holds a spinner while that finishes; the sign-in screen's
 * router.replace takes over from here.
 *
 * The timeout is only a safety net: if nothing navigates away, someone
 * shouldn't be left on a spinner, so it returns to the start screen.
 */
export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => router.replace('/' as any), 8000);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { ...common.screen, alignItems: 'center', justifyContent: 'center' },
});
