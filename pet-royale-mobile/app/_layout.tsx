import { useEffect, useState } from 'react';
import { LogBox, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { supabase } from '../lib/supabase';
import { registerForPushNotifications, sendLocalNotification } from '../lib/notifications';

LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications',
  '`expo-notifications` functionality is not fully supported in Expo Go',
  'Ionicons',
  'fontFamily',
  'Font',
]);

export default function RootLayout() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [fontsLoaded] = useFonts({
  'Ionicons': require('../assets/Ionicons.ttf'),
  });

  useEffect(() => {
    if (Platform.OS !== 'web') {
      registerForPushNotifications();
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) return;

    const clientName = session.user.user_metadata?.full_name || session.user.email;

    const channel = supabase
      .channel('appointment-notifications')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'appointments',
        },
        async (payload) => {
          const newData = payload.new as any;
          const oldData = payload.old as any;

          if (newData.client_name !== clientName) return;

          if (newData.status !== oldData.status && Platform.OS !== 'web') {
            if (newData.status === 'confirmed') {
              await sendLocalNotification(
                'Appointment Confirmed!',
                `Your appointment for ${newData.pet_name} (${newData.service}) has been confirmed by the clinic.`
              );
            } else if (newData.status === 'completed') {
              await sendLocalNotification(
                'Appointment Completed!',
                `Your appointment for ${newData.pet_name} (${newData.service}) has been marked as done.`
              );
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  if (!fontsLoaded || loading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="signin" />
      <Stack.Screen name="register" />
      <Stack.Screen name="services" />
      <Stack.Screen name="pet-detail" options={{ headerShown: false }} />
      <Stack.Screen name="profile-photo" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}