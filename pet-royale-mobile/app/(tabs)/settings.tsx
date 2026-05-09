import { View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

const NAV = '#1a237e';
const GOLD = '#f5c518';

export default function SettingsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState(true);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/signIn');
  };

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <View style={styles.crownBox}>
            <Ionicons name="trophy" size={18} color={GOLD} />
          </View>
          <View>
            <Text style={styles.brandName}>Settings</Text>
            <Text style={styles.brandSub}>PET ROYALE' CLINIC</Text>
          </View>
        </View>
      </View>

      {/* Settings List */}
      <View style={styles.group}>
        <Text style={styles.groupLabel}>PREFERENCES</Text>

        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <View style={styles.rowIcon}>
              <Ionicons name="notifications-outline" size={18} color={GOLD} />
            </View>
            <Text style={styles.rowText}>Push Notifications</Text>
          </View>
          <Switch
            value={notifications}
            onValueChange={setNotifications}
            trackColor={{ false: '#dde3ef', true: NAV }}
            thumbColor={notifications ? GOLD : '#fff'}
          />
        </View>
      </View>

      <View style={styles.group}>
        <Text style={styles.groupLabel}>ACCOUNT</Text>

        {[
          { icon: 'person-outline' as const,      label: 'Edit Profile',    onPress: () => router.push('/(tabs)/profile' as any) },
          { icon: 'lock-closed-outline' as const,  label: 'Change Password', onPress: () => {} },
          { icon: 'shield-outline' as const,       label: 'Privacy Policy',  onPress: () => {} },
          { icon: 'information-circle-outline' as const, label: 'About App', onPress: () => router.push('/(tabs)/about' as any) },
        ].map((item, i) => (
          <TouchableOpacity key={i} style={styles.row} onPress={item.onPress} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <View style={styles.rowIcon}>
                <Ionicons name={item.icon} size={18} color={GOLD} />
              </View>
              <Text style={styles.rowText}>{item.label}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#c8d0e4" />
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.group}>
        <TouchableOpacity style={styles.signOutRow} onPress={handleSignOut} activeOpacity={0.8}>
          <View style={[styles.rowIcon, { backgroundColor: '#fdecea' }]}>
            <Ionicons name="log-out-outline" size={18} color="#c0392b" />
          </View>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f8',
  },
  header: {
    backgroundColor: NAV,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  crownBox: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 17,
  },
  brandSub: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 8.5,
    fontWeight: '600',
    letterSpacing: 1.2,
    marginTop: 1,
  },
  group: {
    marginTop: 20,
    paddingHorizontal: 14,
  },
  groupLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8a97b0',
    letterSpacing: 1.3,
    marginBottom: 8,
    marginLeft: 2,
  },
  row: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: NAV,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: NAV,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: NAV,
  },
  signOutRow: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
    shadowColor: NAV,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  signOutText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#c0392b',
  },
});
