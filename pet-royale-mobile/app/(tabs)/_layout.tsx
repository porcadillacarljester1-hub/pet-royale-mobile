import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const TEAL = '#0D9488';

function TabIcon({ name, color, size = 24 }: { name: any, color: string, size?: number }) {
  return <Ionicons name={name} size={size} color={color} />;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: TEAL,
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: { paddingBottom: 4 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarIcon: ({ color }) => <TabIcon name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="appointments"
        options={{
          title: 'Appointments',
          tabBarIcon: ({ color }) => <TabIcon name="list" color={color} />,
        }}
      />
      <Tabs.Screen
        name="pets"
        options={{
          title: 'My Pets',
          tabBarIcon: ({ color }) => <TabIcon name="paw" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <TabIcon name="person" color={color} />,
        }}
      />

      {/* Kept in the file, hidden from the tab bar */}
      <Tabs.Screen name="products" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="notifications" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="help" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="about" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="security" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="payment-history" options={{ href: null, headerShown: false }} />
    </Tabs>
  );
}