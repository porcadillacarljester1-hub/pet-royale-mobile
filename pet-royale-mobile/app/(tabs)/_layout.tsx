import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

// Cross-platform icon component
function TabIcon({ name, emoji, color, size = 24 }: { name: any, emoji: string, color: string, size?: number }) {
  if (Platform.OS === 'web') {
    return <Text style={{ fontSize: size * 0.8 }}>{emoji}</Text>;
  }
  return <Ionicons name={name} size={size} color={color} />;
}

// Cross-platform bell icon
function BellIcon({ unreadCount }: { unreadCount: number }) {
  if (Platform.OS === 'web') {
    return (
      <Text style={{ fontSize: 20 }}>
        {unreadCount > 0 ? '🔔' : '🔕'}
      </Text>
    );
  }
  return <Ionicons name={unreadCount > 0 ? 'notifications' : 'notifications-outline'} size={24} color="#f5c518" />;
}

// Cross-platform inline icons
function InlineIcon({ name, emoji, size = 16, color = '#333' }: { name: any, emoji: string, size?: number, color?: string }) {
  if (Platform.OS === 'web') {
    return <Text style={{ fontSize: size }}>{emoji}</Text>;
  }
  return <Ionicons name={name} size={size} color={color} />;
}

export default function TabLayout() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showBell, setShowBell] = useState(false);
  const unreadCount = notifications.filter(n => !n.is_read).length;

  useEffect(() => {
    const init = async () => {
      await fetchNotifications();
    };
    init();

    const channel = (supabase as any)
      .channel('mobile-notifications')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        () => fetchNotifications()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchNotifications = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const clientName = user.user_metadata?.full_name || user.email;

    const { data } = await (supabase as any)
      .from('notifications')
      .select('*')
      .or(`message.ilike.%${clientName}%,type.eq.general`)
      .order('created_at', { ascending: false })
      .limit(20);

    if (data) setNotifications(data);
  };

  const handleMarkAsRead = async (id: string) => {
    await (supabase as any)
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const handleMarkAllAsRead = async () => {
    await (supabase as any)
      .from('notifications')
      .update({ is_read: true })
      .eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const handleDelete = async (id: string) => {
    await (supabase as any)
      .from('notifications')
      .delete()
      .eq('id', id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'appointment': return '#2196F3';
      case 'inventory': return '#FF9800';
      case 'client': return '#4CAF50';
      default: return '#6b7280';
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: true,
          headerStyle: { backgroundColor: '#1a237e' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold', color: '#f5c518' },
          tabBarActiveTintColor: '#1a237e',
          tabBarInactiveTintColor: '#6b7280',
          tabBarStyle: { paddingBottom: 4 },
          headerRight: () => (
            <TouchableOpacity
              style={{ marginRight: 16, position: 'relative' }}
              onPress={() => setShowBell(true)}
            >
              <BellIcon unreadCount={unreadCount} />
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ),
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: 'Home',
            tabBarIcon: ({ color }) => <TabIcon name="home" emoji="🏠" color={color} />,
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
        {/* Hidden from tab bar — navigable via drawer */}
        <Tabs.Screen name="about" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
      </Tabs>

      {/* Notification Modal */}
      <Modal visible={showBell} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Notifications {unreadCount > 0 && `(${unreadCount} unread)`}
              </Text>
              <View style={styles.modalActions}>
                {unreadCount > 0 && (
                  <TouchableOpacity onPress={handleMarkAllAsRead} style={styles.actionBtn}>
                    <InlineIcon name="checkmark-done" emoji="✅" size={20} color="#2196F3" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setShowBell(false)} style={styles.actionBtn}>
                  <InlineIcon name="close" emoji="✖️" size={24} color="#333" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {notifications.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={{ fontSize: 48 }}>🔕</Text>
                  <Text style={styles.emptyText}>No notifications yet</Text>
                </View>
              ) : (
                notifications.map((notification) => (
                  <View
                    key={notification.id}
                    style={[
                      styles.notificationItem,
                      { borderLeftColor: getTypeColor(notification.type) },
                      !notification.is_read && styles.unreadItem,
                    ]}
                  >
                    <TouchableOpacity
                      style={styles.notificationContent}
                      onPress={() => !notification.is_read && handleMarkAsRead(notification.id)}
                    >
                      <View style={styles.notificationHeader}>
                        <View style={[styles.typeBadge, { backgroundColor: getTypeColor(notification.type) + '20' }]}>
                          <Text style={[styles.typeBadgeText, { color: getTypeColor(notification.type) }]}>
                            {notification.type}
                          </Text>
                        </View>
                        {!notification.is_read && (
                          <View style={styles.unreadDot} />
                        )}
                        <Text style={styles.timeText}>{formatTime(notification.created_at)}</Text>
                      </View>
                      <Text style={styles.notificationTitle}>{notification.title}</Text>
                      <Text style={styles.notificationMessage}>{notification.message}</Text>
                    </TouchableOpacity>

                    <View style={styles.itemActions}>
                      {!notification.is_read && (
                        <TouchableOpacity
                          onPress={() => handleMarkAsRead(notification.id)}
                          style={styles.itemActionBtn}
                        >
                          <InlineIcon name="checkmark" emoji="✔️" size={16} color="#2196F3" />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        onPress={() => handleDelete(notification.id)}
                        style={styles.itemActionBtn}
                      >
                        <InlineIcon name="trash-outline" emoji="🗑️" size={16} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a237e',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    padding: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderLeftWidth: 4,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    overflow: 'hidden',
  },
  unreadItem: {
    backgroundColor: '#eff6ff',
  },
  notificationContent: {
    flex: 1,
    padding: 12,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'capitalize',
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2196F3',
  },
  timeText: {
    fontSize: 10,
    color: '#9ca3af',
    marginLeft: 'auto',
  },
  notificationTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1a237e',
    marginBottom: 2,
  },
  notificationMessage: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 16,
  },
  itemActions: {
    flexDirection: 'column',
    padding: 8,
    gap: 4,
  },
  itemActionBtn: {
    padding: 4,
  },
});
