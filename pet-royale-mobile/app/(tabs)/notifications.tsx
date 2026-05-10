import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Animated, PanResponder, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useFocusEffect } from 'expo-router';

const NAV = '#1a237e';
const GOLD = '#f5c518';
const BG = '#f0f2f8';
const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = 60;
const ACTION_WIDTH = 140; // total width of revealed actions

const ADMIN_ONLY_TITLES = ['New Appointment Request'];

// ── Swipeable Row ──────────────────────────────────────────────────────────────
function SwipeableRow({
  children,
  onMarkRead,
  onDelete,
  isRead,
}: {
  children: React.ReactNode;
  onMarkRead: () => void;
  onDelete: () => void;
  isRead: boolean;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);

  const open = () => {
    Animated.spring(translateX, {
      toValue: -ACTION_WIDTH,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
    isOpen.current = true;
  };

  const close = () => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
    isOpen.current = false;
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 5 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => {
        const base = isOpen.current ? -ACTION_WIDTH : 0;
        const next = base + g.dx;
        if (next <= 0 && next >= -ACTION_WIDTH) {
          translateX.setValue(next);
        }
      },
      onPanResponderRelease: (_, g) => {
        const base = isOpen.current ? -ACTION_WIDTH : 0;
        const next = base + g.dx;
        if (next < -SWIPE_THRESHOLD) {
          open();
        } else {
          close();
        }
      },
    })
  ).current;

  return (
    <View style={{ overflow: 'hidden' }}>
      {/* Action buttons revealed behind */}
      <View style={styles.actions}>
        {!isRead && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionRead]}
            onPress={() => { close(); onMarkRead(); }}
          >
            <Ionicons name="checkmark-done" size={20} color="#fff" />
            <Text style={styles.actionText}>Mark{'\n'}Read</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionDelete, isRead && { width: ACTION_WIDTH }]}
          onPress={() => { close(); onDelete(); }}
        >
          <Ionicons name="trash" size={20} color="#fff" />
          <Text style={styles.actionText}>Delete</Text>
        </TouchableOpacity>
      </View>

      {/* Sliding foreground */}
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────
export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const fetchNotifications = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const clientName = user.user_metadata?.full_name || user.email;

    const { data } = await (supabase as any)
      .from('notifications')
      .select('*')
      .or(`message.ilike.%${clientName}%,type.eq.general`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (data) {
      setNotifications(
        data.filter((n: any) => !ADMIN_ONLY_TITLES.includes(n.title))
      );
    }
    setIsLoading(false);
    setRefreshing(false);
  };

  useFocusEffect(useCallback(() => { fetchNotifications(); }, []));

  useEffect(() => {
    const channel = (supabase as any)
      .channel('notifications-screen')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' },
        () => fetchNotifications()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleMarkAsRead = async (id: string) => {
    await (supabase as any).from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const handleMarkAllAsRead = async () => {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (!unreadIds.length) return;
    await (supabase as any).from('notifications').update({ is_read: true }).in('id', unreadIds);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Notification', 'Remove this notification?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await (supabase as any).from('notifications').delete().eq('id', id);
          setNotifications(prev => prev.filter(n => n.id !== id));
        },
      },
    ]);
  };

  const getTypeIcon = (type: string): any => {
    switch (type) {
      case 'appointment': return 'calendar';
      case 'inventory':   return 'cube';
      case 'client':      return 'person';
      default:            return 'notifications';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'appointment': return NAV;
      case 'inventory':   return '#e65100';
      case 'client':      return '#2e7d32';
      default:            return '#6b7280';
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours   = Math.floor(diff / 3600000);
    const days    = Math.floor(diff / 86400000);
    if (minutes < 1)  return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24)   return `${hours}h ago`;
    if (days === 1)   return 'Yesterday';
    return `${days}d ago`;
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const displayed   = filter === 'unread'
    ? notifications.filter(n => !n.is_read)
    : notifications;

  const renderItem = ({ item }: { item: any }) => {
    const color    = getTypeColor(item.type);
    const isUnread = !item.is_read;

    return (
      <SwipeableRow
        isRead={item.is_read}
        onMarkRead={() => handleMarkAsRead(item.id)}
        onDelete={() => handleDelete(item.id)}
      >
        <TouchableOpacity
          style={[styles.item, isUnread && styles.itemUnread]}
          onPress={() => isUnread && handleMarkAsRead(item.id)}
          activeOpacity={0.75}
        >
          {/* Icon bubble */}
          <View style={[styles.iconBubble, { backgroundColor: color }]}>
            <Ionicons name={getTypeIcon(item.type)} size={20} color="#fff" />
          </View>

          {/* Content */}
          <View style={styles.itemBody}>
            <View style={styles.itemTop}>
              <Text style={[styles.itemTitle, isUnread && styles.itemTitleUnread]} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.itemTime}>{formatTime(item.created_at)}</Text>
            </View>
            <Text style={styles.itemMessage} numberOfLines={2}>{item.message}</Text>
          </View>

          {/* Unread dot */}
          {isUnread && <View style={styles.unreadDot} />}
        </TouchableOpacity>
      </SwipeableRow>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <TouchableOpacity style={styles.markAllBtn} onPress={handleMarkAllAsRead}>
              <Ionicons name="checkmark-done" size={14} color={GOLD} />
              <Text style={styles.markAllText}>Mark all read</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Filter pills */}
        <View style={styles.filterRow}>
          {(['all', 'unread'] as const).map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.filterPill, filter === f && styles.filterPillActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterPillText, filter === f && styles.filterPillTextActive]}>
                {f === 'all'
                  ? `All${notifications.length > 0 ? ` (${notifications.length})` : ''}`
                  : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Hint */}
        <Text style={styles.swipeHint}>← Swipe left on a notification for actions</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={NAV} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchNotifications(); }}
              tintColor={NAV}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="notifications-off-outline" size={32} color={GOLD} />
              </View>
              <Text style={styles.emptyTitle}>
                {filter === 'unread' ? 'All caught up!' : 'No notifications yet'}
              </Text>
              <Text style={styles.emptyText}>
                {filter === 'unread'
                  ? 'You have no unread notifications.'
                  : 'Notifications about your appointments will appear here.'}
              </Text>
            </View>
          }
          contentContainerStyle={displayed.length === 0 ? styles.emptyContainer : undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  // Header
  header: {
    backgroundColor: NAV,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    gap: 10,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  markAllText: { color: GOLD, fontSize: 11, fontWeight: '600' },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  filterPillActive: { backgroundColor: GOLD },
  filterPillText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' },
  filterPillTextActive: { color: NAV },
  swipeHint: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.2,
  },

  // Swipe actions
  actions: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: ACTION_WIDTH,
    flexDirection: 'row',
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  actionRead: { backgroundColor: '#2196F3' },
  actionDelete: { backgroundColor: '#ef4444' },
  actionText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },

  // Notification item
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    gap: 12,
  },
  itemUnread: { backgroundColor: '#eef2ff' },
  iconBubble: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemBody: { flex: 1, gap: 3 },
  itemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemTitle: { fontSize: 13.5, fontWeight: '600', color: '#374151', flex: 1 },
  itemTitleUnread: { fontWeight: '800', color: NAV },
  itemTime: { fontSize: 11, color: '#9ca3af', flexShrink: 0 },
  itemMessage: { fontSize: 12.5, color: '#6b7280', lineHeight: 17 },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: NAV,
    flexShrink: 0,
  },
  separator: { height: 1, backgroundColor: '#f0f2f8' },

  // Empty
  emptyContainer: { flex: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: 32, gap: 10 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: NAV, alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: NAV, letterSpacing: -0.2 },
  emptyText: { fontSize: 13, color: '#8a97b0', textAlign: 'center', lineHeight: 19 },
});
