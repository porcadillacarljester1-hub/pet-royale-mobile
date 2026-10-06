import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { colors } from '@/constants/theme';

const TEAL = colors.primary;
const TEAL_LIGHT = colors.secondary;
const BORDER = colors.border;
const SUB = colors.mutedFg;
const INK = colors.foreground;
const BG = colors.background;

const NOTIF_KEY = '@pet_royale_push_enabled';
const UNIT_KEY = '@pet_royale_weight_unit';

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailUpdates, setEmailUpdates] = useState(true);
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('kg');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
  let active = true;

  (async () => {
    try {
      const push = await AsyncStorage.getItem(NOTIF_KEY);
      const unit = await AsyncStorage.getItem(UNIT_KEY);
      if (!active) return;
      if (push !== null) setPushEnabled(push === 'true');
      if (unit === 'lbs' || unit === 'kg') setWeightUnit(unit);
    } finally {
      if (active) setLoaded(true);
    }
  })();

  return () => { active = false; };
}, []);

  const togglePush = async (value: boolean) => {
    setPushEnabled(value);
    await AsyncStorage.setItem(NOTIF_KEY, String(value));
  };

  const toggleUnit = async () => {
    const next = weightUnit === 'kg' ? 'lbs' : 'kg';
    setWeightUnit(next);
    await AsyncStorage.setItem(UNIT_KEY, next);
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear Local Data',
      'This clears saved preferences on this device only — your account, pets, and appointments are safe and stored online.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.multiRemove([NOTIF_KEY, UNIT_KEY]);
            setPushEnabled(true);
            setWeightUnit('kg');
            Alert.alert('Done', 'Local preferences have been reset.');
          },
        },
      ]
    );
  };

  const appVersion = Constants.expoConfig?.version || '1.0.0';

  if (!loaded) return null;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={INK} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>App Settings</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* ── Notifications ── */}
          <Text style={styles.sectionTitle}>Notifications</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={styles.rowIconWrap}>
                  <Ionicons name="notifications-outline" size={17} color={TEAL} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>Push Notifications</Text>
                  <Text style={styles.rowSub}>Appointment reminders & updates</Text>
                </View>
              </View>
              <Switch
                value={pushEnabled}
                onValueChange={togglePush}
                trackColor={{ false: BORDER, true: TEAL_LIGHT }}
                thumbColor={pushEnabled ? TEAL : '#fff'}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={styles.rowIconWrap}>
                  <Ionicons name="mail-outline" size={17} color={TEAL} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>Email Updates</Text>
                  <Text style={styles.rowSub}>Clinic news and promotions</Text>
                </View>
              </View>
              <Switch
                value={emailUpdates}
                onValueChange={setEmailUpdates}
                trackColor={{ false: BORDER, true: TEAL_LIGHT }}
                thumbColor={emailUpdates ? TEAL : '#fff'}
              />
            </View>
          </View>

          {/* ── Preferences ── */}
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.row} onPress={toggleUnit} activeOpacity={0.7}>
              <View style={styles.rowLeft}>
                <View style={styles.rowIconWrap}>
                  <Ionicons name="scale-outline" size={17} color={TEAL} />
                </View>
                <Text style={styles.rowLabel}>Weight Unit</Text>
              </View>
              <View style={styles.unitToggle}>
                <Text style={styles.unitToggleText}>{weightUnit === 'kg' ? 'Kilograms' : 'Pounds'}</Text>
                <Ionicons name="swap-horizontal" size={15} color={TEAL} />
              </View>
            </TouchableOpacity>
          </View>

          {/* ── Storage ── */}
          <Text style={styles.sectionTitle}>Storage</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.row} onPress={handleClearCache} activeOpacity={0.7}>
              <View style={styles.rowLeft}>
                <View style={styles.rowIconWrap}>
                  <Ionicons name="trash-outline" size={17} color={TEAL} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>Clear Local Data</Text>
                  <Text style={styles.rowSub}>Reset saved preferences on this device</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
            </TouchableOpacity>
          </View>

          {/* ── App Info ── */}
          <Text style={styles.sectionTitle}>App Info</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push('/(tabs)/about' as any)}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <View style={styles.rowIconWrap}>
                  <Ionicons name="document-text-outline" size={17} color={TEAL} />
                </View>
                <Text style={styles.rowLabel}>Privacy Policy</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
            </TouchableOpacity>

            <View style={styles.divider} />

            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={styles.rowIconWrap}>
                  <Ionicons name="phone-portrait-outline" size={17} color={TEAL} />
                </View>
                <Text style={styles.rowLabel}>App Version</Text>
              </View>
              <Text style={styles.versionText}>{appVersion}</Text>
            </View>
          </View>

          <View style={{ height: 32 }} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 12, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: BG, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: INK },

  content: { padding: 16 },

  sectionTitle: {
    fontSize: 12.5, fontWeight: '800', color: SUB,
    letterSpacing: 0.5, textTransform: 'uppercase',
    marginBottom: 8, marginTop: 18,
  },

  card: {
    backgroundColor: '#fff', borderRadius: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 5, elevation: 1,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 13,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowIconWrap: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: TEAL_LIGHT, alignItems: 'center', justifyContent: 'center',
  },
  rowLabel: { fontSize: 13.5, fontWeight: '600', color: INK },
  rowSub: { fontSize: 11, color: SUB, marginTop: 2 },
  divider: { height: 1, backgroundColor: BORDER, marginLeft: 58 },

  unitToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  unitToggleText: { fontSize: 12.5, color: TEAL, fontWeight: '700' },

  versionText: { fontSize: 12.5, color: SUB, fontWeight: '600' },
});