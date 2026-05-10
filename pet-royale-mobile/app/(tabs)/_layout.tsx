import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Modal, Pressable } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

const NAV = '#1a237e';
const GOLD = '#f5c518';

const ADMIN_ONLY_TITLES = ['New Appointment Request'];

function TabIcon({ name, emoji, color, size = 24 }: { name: any, emoji: string, color: string, size?: number }) {
  if (Platform.OS === 'web') return <Text style={{ fontSize: size * 0.8 }}>{emoji}</Text>;
  return <Ionicons name={name} size={size} color={color} />;
}

function BellButton({ unreadCount, onPress }: { unreadCount: number, onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.bellWrap} onPress={onPress}>
      <Ionicons
        name={unreadCount > 0 ? 'notifications' : 'notifications-outline'}
        size={24}
        color={GOLD}
      />
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function TabLayout() {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userName, setUserName] = useState('');
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserName(user.user_metadata?.full_name || user.email || 'Pet Owner');
    });
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 18) setGreeting('Good afternoon');
    else setGreeting('Good evening');
  }, []);

  const fetchUnreadCount = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const clientName = user.user_metadata?.full_name || user.email;
    const { data } = await (supabase as any)
      .from('notifications')
      .select('id, title, is_read')
      .or(`message.ilike.%${clientName}%,type.eq.general`)
      .eq('is_read', false);
    if (data) {
      setUnreadCount(data.filter((n: any) => !ADMIN_ONLY_TITLES.includes(n.title)).length);
    }
  };

  useEffect(() => {
    fetchUnreadCount();
    const channel = (supabase as any)
      .channel('mobile-notifications-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' },
        () => fetchUnreadCount()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleSignOut = async () => {
    setDrawerOpen(false);
    await supabase.auth.signOut();
    router.replace('/');
  };

  const drawerNav = (route: string) => {
    setDrawerOpen(false);
    router.push(route as any);
  };

  return (
    <>
      {/* ── Side Drawer ── */}
      <Modal visible={drawerOpen} transparent animationType="fade" onRequestClose={() => setDrawerOpen(false)}>
        <Pressable style={styles.drawerOverlay} onPress={() => setDrawerOpen(false)}>
          <Pressable style={styles.drawer} onPress={() => {}}>
            <View style={styles.drawerHeader}>
              <View style={styles.drawerCrownBox}>
                <Ionicons name="trophy" size={18} color={GOLD} />
              </View>
              <View>
                <Text style={styles.drawerBrandName}>Pet Royale'</Text>
                <Text style={styles.drawerBrandSub}>CLINIC & VETERINARY</Text>
              </View>
            </View>

            <View style={styles.drawerDivider} />

            {[
              { icon: 'information-circle-outline' as const, label: 'About & Clinic Info', route: '/(tabs)/about' },
              { icon: 'settings-outline'           as const, label: 'Settings',             route: '/(tabs)/settings' },
            ].map((item) => (
              <TouchableOpacity key={item.label} style={styles.drawerItem} onPress={() => drawerNav(item.route)} activeOpacity={0.7}>
                <Ionicons name={item.icon} size={20} color={NAV} />
                <Text style={styles.drawerItemText}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={15} color="#c8d0e4" style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>
            ))}

            <View style={styles.drawerDivider} />

            <TouchableOpacity style={styles.drawerSignOut} onPress={handleSignOut} activeOpacity={0.8}>
              <Ionicons name="log-out-outline" size={20} color="#c0392b" />
              <Text style={styles.drawerSignOutText}>Sign Out</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Tabs
        screenOptions={{
          headerShown: true,
          headerStyle: { backgroundColor: NAV },
        headerTitleContainerStyle: { marginTop: -30 },
        headerLeftContainerStyle: { marginTop: -30 },
        headerRightContainerStyle: { marginTop: -30 },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '800', color: '#fff', fontSize: 20, letterSpacing: -0.3 },
          tabBarActiveTintColor: NAV,
          tabBarInactiveTintColor: '#6b7280',
          tabBarStyle: { paddingBottom: 4 },
          headerRight: () => (
            <BellButton
              unreadCount={unreadCount}
              onPress={() => router.push('/(tabs)/notifications' as any)}
            />
          ),
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            headerTitle: () => (
              <View>
                <Text style={styles.headerGreeting}>{greeting} 👋</Text>
                <Text style={styles.headerUserName} numberOfLines={1}>{userName}</Text>
              </View>
            ),
            tabBarIcon: ({ color }) => <TabIcon name="home" emoji="🏠" color={color} />,
            headerLeft: () => (
              <TouchableOpacity
                style={styles.menuBtn}
                onPress={() => setDrawerOpen(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="menu" size={22} color="#fff" />
              </TouchableOpacity>
            ),
          }}
        />
        <Tabs.Screen
          name="book"
          options={{
            title: 'Book',
            tabBarIcon: ({ color }) => <TabIcon name="calendar" emoji="📅" color={color} />,
          }}
        />
        <Tabs.Screen
          name="appointments"
          options={{
            title: 'Appointments',
            tabBarIcon: ({ color }) => <TabIcon name="list" emoji="📋" color={color} />,
          }}
        />
        <Tabs.Screen
          name="pets"
          options={{
            title: 'My Pets',
            tabBarIcon: ({ color }) => <TabIcon name="paw" emoji="🐾" color={color} />,
          }}
        />
        <Tabs.Screen
          name="products"
          options={{
            title: 'Products',
            tabBarIcon: ({ color }) => <TabIcon name="bag" emoji="🛍️" color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color }) => <TabIcon name="person" emoji="👤" color={color} />,
          }}
        />
        <Tabs.Screen
          name="notifications"
          options={{
            href: null,
            title: 'Notifications',
            headerShown: false,
          }}
        />
        <Tabs.Screen name="about"    options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  bellWrap: {
    marginRight: 16,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4, right: -4,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 18, height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  menuBtn: {
    marginLeft: 12,
    width: 34, height: 34,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerGreeting: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
  },
  headerUserName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    maxWidth: 180,
  },

  /* ── Drawer ── */
  drawerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  drawer: {
    width: '72%',
    backgroundColor: '#fff',
    paddingTop: 52,
    paddingBottom: 32,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 16,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  drawerCrownBox: {
    width: 36, height: 36,
    borderRadius: 9,
    backgroundColor: NAV,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerBrandName: {
    color: NAV,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 17,
  },
  drawerBrandSub: {
    color: '#8a97b0',
    fontSize: 8.5,
    fontWeight: '600',
    letterSpacing: 1.2,
    marginTop: 2,
  },
  drawerDivider: {
    height: 1,
    backgroundColor: '#eef1f8',
    marginVertical: 10,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
  },
  drawerItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: NAV,
  },
  drawerSignOut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    marginTop: 4,
  },
  drawerSignOutText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#c0392b',
  },
});
