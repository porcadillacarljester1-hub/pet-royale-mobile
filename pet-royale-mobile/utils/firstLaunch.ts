import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'petroyale.introSeen';

export async function hasSeenIntro(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === '1';
  } catch {
    return true; // if storage fails, never trap the user in the intro
  }
}

export async function markIntroSeen() {
  try {
    await AsyncStorage.setItem(KEY, '1');
  } catch {}
}
