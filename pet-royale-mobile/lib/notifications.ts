import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

const isExpoGo = Constants.executionEnvironment === 'storeClient';

let notificationsModule: NotificationsModule | null = null;
let handlerConfigured = false;

async function getNotifications(): Promise<NotificationsModule | null> {
  if (Platform.OS === 'web' || isExpoGo) return null;

  if (!notificationsModule) {
    notificationsModule = await import('expo-notifications');
  }

  if (!handlerConfigured) {
    notificationsModule.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    handlerConfigured = true;
  }

  return notificationsModule;
}

export async function registerForPushNotifications(): Promise<string | null> {
  const Notifications = await getNotifications();
  if (!Notifications) {
    if (isExpoGo) console.log('Push notifications require a development build.');
    return null;
  }

  if (!Device.isDevice) {
    console.log('Must use physical device for push notifications');
    return null;
  }

  // Android 13+: the channel must exist BEFORE asking for permission,
  // or the permission prompt may never appear.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Pet Royale Notifications',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#f5c518',
      enableVibrate: true,
      showBadge: true,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.log('Permission not granted for notifications');
    return null;
  }

    const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
      console.log('PUSH TOKEN:', token);
      return token;
    } catch (e) {
      console.log(`PUSH ERROR (attempt ${attempt}):`, e);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
  return null;
}

export async function sendLocalNotification(title: string, body: string) {
  const Notifications = await getNotifications();
  if (!Notifications) return null;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      priority: Notifications.AndroidNotificationPriority.MAX,
      vibrate: [0, 250, 250, 250],
    },
    trigger: null,
  });
}