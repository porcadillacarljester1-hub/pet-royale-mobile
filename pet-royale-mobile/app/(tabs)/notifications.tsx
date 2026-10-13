import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Modal,
} from 'react-native';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, text, space, radius, fonts, hitSlop } from '@/constants/theme';
import { Skeleton } from '@/components/Skeleton';
import { ScreenHeader } from '@/components/ScreenHeader';
import { PillTabs } from '@/components/PillTabs';
import { TAB_BAR_CLEARANCE } from './_layout';
import {
  type AppNotification,
  markNotificationRead,
  deleteNotification,
  fetchAppointmentById,
} from '@/lib/notificationActions';

const BORDER = colors.border;
const SUB = colors.mutedFg;
const INK = colors.foreground;
const BG = colors.background;
const RED = '#ef4444';
const UNDO_MS = 4000;

/* Appointments with these statuses live in Visits > History.
   Everything else lives in Visits > Upcoming.
   Adjust to match your appointments.status values. */
const HISTORY_STATUSES = ['completed', 'cancelled', 'canceled', 'no_show', 'declined'];

type TabKey = 'all' | 'unread';

/* created_at is "timestamp without time zone", so Supabase returns it with
   no zone marker and JS would read it as local time. Treat it as UTC.
   If times look wrong by hours, remove the 'Z' handling here. */
function parseDate(value: string): Date {
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value);
  return new Date(hasZone ? value : value.replace(' ', 'T') + 'Z');
}

/* Short social-style time: now, 5m, 11h, 3d, Oct 7 */
function shortTime(value: string): string {
  const mins = Math.round((Date.now() - parseDate(value).getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  const days = Math.round(mins / 1440);
  if (days < 7) return `${days}d`;
  return parseDate(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDateGroupLabel(value: string): string {
  const date = parseDate(value);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86400000);

  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays <= 7) return 'This Week';
  return 'Earlier';
}

const GROUP_ORDER = ['Today', 'Yesterday', 'This Week', 'Earlier'];

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [menuItem, setMenuItem] = useState<AppNotification | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<TabKey>('all');
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [showUndo, setShowUndo] = useState(false);

  /* A deleted row is hidden at once but only removed from the database
     after UNDO_MS, so Undo can bring it back. */
  const pending = useRef<{ item: AppNotification; timer: ReturnType<typeof setTimeout> } | null>(null);

  // Finishes a waiting delete right away (used by a second delete and on leaving).
  const commitPending = () => {
    if (!pending.current) return;
    clearTimeout(pending.current.timer);
    deleteNotification(pending.current.item.id);
    pending.current = null;
  };

  const fetchNotifications = async () => {
    // getSession reads the login saved on the phone. getUser() asks the
    // server every time, which added a full round trip before the list
    // was even requested.
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    const { data } = await (supabase as any)
      .from('notifications')
      .select('*')
      .eq('client_user_id', user.id)
      .eq('type', 'appointment')
      .order('created_at', { ascending: false })
      .limit(50);

    if (data) {
      const hiddenId = pending.current?.item.id;
      setNotifications(hiddenId ? data.filter((n: AppNotification) => n.id !== hiddenId) : data);
    }
    setIsLoading(false);
    setRefreshing(false);
  };

  useFocusEffect(useCallback(() => { fetchNotifications(); }, []));

  /* One change from the server, applied to the list straight away.
     The event already carries the whole row, so there is nothing to
     fetch: a new notification shows up the moment it arrives. */
  const applyChange = (payload: any) => {
    if (payload.eventType === 'DELETE') {
      const id = payload.old?.id;
      if (id) setNotifications(prev => prev.filter(n => n.id !== id));
      return;
    }

    const row = payload.new as AppNotification | undefined;
    if (!row) return;
    if (row.id === pending.current?.item.id) return; // waiting to be deleted
    if ((row as any).type !== 'appointment') return; // this screen lists visit updates only

    setNotifications(prev => {
      const exists = prev.some(n => n.id === row.id);
      const next = exists
        ? prev.map(n => (n.id === row.id ? { ...n, ...row } : n))
        : [row, ...prev];
      return next.sort(
        (a, b) => parseDate(b.created_at).getTime() - parseDate(a.created_at).getTime(),
      );
    });
  };

  // Live updates for this client's notifications.
  useEffect(() => {
    let active = true;
    let channel: any;
    let firstConnect = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user || !active) return;
      channel = (supabase as any)
        .channel(`notifications-${user.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'notifications', filter: `client_user_id=eq.${user.id}` },
          applyChange,
        )
        .subscribe((status: string) => {
          if (status !== 'SUBSCRIBED') return;
          // After a dropped connection, catch up on anything missed.
          // The first connect needs no fetch: the screen just loaded.
          if (!firstConnect) fetchNotifications();
          firstConnect = false;
        });
    })();
    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  // Leaving the screen finishes any delete that is still waiting.
  useEffect(() => () => commitPending(), []);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/home' as any);
  };

  const handleMarkAsRead = async (id: string) => {
    await markNotificationRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const handleMarkAllRead = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await (supabase as any)
      .from('notifications')
      .update({ is_read: true })
      .eq('client_user_id', user.id)
      .eq('type', 'appointment')
      .eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  // ── Delete with undo ──
  const handleDelete = (item: AppNotification) => {
    commitPending(); // a second delete finishes the first
    setNotifications(prev => prev.filter(n => n.id !== item.id));
    const timer = setTimeout(() => {
      deleteNotification(item.id);
      pending.current = null;
      setShowUndo(false);
    }, UNDO_MS);
    pending.current = { item, timer };
    setShowUndo(true);
  };

  const handleUndo = () => {
    if (!pending.current) return;
    const { item, timer } = pending.current;
    clearTimeout(timer);
    pending.current = null;
    setNotifications(prev =>
      [...prev, item].sort((a, b) => parseDate(b.created_at).getTime() - parseDate(a.created_at).getTime()),
    );
    setShowUndo(false);
  };

  const handleMore = (item: AppNotification) => setMenuItem(item);

  // ── Open the appointment where it lives (History or Upcoming) ──
  const openAppointment = async (item: AppNotification) => {
    if (openingId) return;
    if (!item.is_read) handleMarkAsRead(item.id);

    if (item.related_type !== 'appointment' || !item.related_id) {
      router.push('/(tabs)/appointments' as any);
      return;
    }

    setOpeningId(item.id);
    let visitsTab: 'upcoming' | 'history' = 'upcoming';
    try {
      const appt = await fetchAppointmentById(item.related_id);
      if (appt && HISTORY_STATUSES.includes(String(appt.status ?? '').toLowerCase())) {
        visitsTab = 'history';
      }
    } catch {
      /* fall back to Upcoming */
    }
    setOpeningId(null);

    router.push({
      pathname: '/(tabs)/appointments',
      params: { appointmentId: item.related_id, tab: visitsTab },
    } as any);
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const visible = tab === 'unread' ? notifications.filter(n => !n.is_read) : notifications;

  const grouped = GROUP_ORDER.map(group => ({
    group,
    items: visible.filter(n => getDateGroupLabel(n.created_at) === group),
  })).filter(g => g.items.length > 0);

  return (
    <GestureHandlerRootView style={styles.container}>
      <ScreenHeader title="Notifications" onBack={handleBack} large />

      <View style={styles.tabRow}>
        <PillTabs
          tabs={[
            { key: 'all', label: 'Show all', count: notifications.length },
            { key: 'unread', label: 'Unread', count: unreadCount },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      {isLoading ? (
        <NotificationsSkeleton />
      ) : (
        <ScrollView
          contentContainerStyle={grouped.length === 0 ? styles.emptyContainer : styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchNotifications(); }}
              tintColor={INK}
            />
          }
        >
          {grouped.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="calendar-outline" size={28} color={SUB} />
              </View>
              <Text style={styles.emptyTitle}>
                {tab === 'unread' ? 'Nothing unread' : 'No visit updates yet'}
              </Text>
              <Text style={styles.emptyText}>
                {tab === 'unread'
                  ? 'You have read every update.'
                  : 'When the clinic confirms or completes a booking, it will show up here.'}
              </Text>
            </View>
          ) : (
            grouped.map(({ group, items }, groupIndex) => (
              <View key={group} style={styles.dateSection}>
                <View style={styles.dateHeader}>
                  <Text style={styles.dateTitle}>{group}</Text>
                  <View style={styles.countPill}>
                    <Text style={styles.countText}>{items.length}</Text>
                  </View>
                  {groupIndex === 0 && unreadCount > 0 && (
                    <TouchableOpacity
                      onPress={handleMarkAllRead}
                      activeOpacity={0.7}
                      hitSlop={hitSlop}
                      style={styles.markAllRow}
                      accessibilityRole="button"
                    >
                      <Text style={styles.markAllText}>Mark all read</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {items.map(item => (
                  <NotificationRow
                    key={item.id}
                    item={item}
                    onOpen={openAppointment}
                    onDelete={handleDelete}
                    onMore={handleMore}
                  />
                ))}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* ── ⋯ menu ── */}
      <Modal visible={!!menuItem} transparent animationType="slide" onRequestClose={() => setMenuItem(null)}>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setMenuItem(null)} />
          <View style={[styles.sheet, { paddingBottom: 8 + insets.bottom }]}>
            <View style={styles.sheetHandle} />
            {menuItem && (
              <>
                <Text style={styles.sheetTitle} numberOfLines={1}>{menuItem.title}</Text>
                {!menuItem.is_read && (
                  <TouchableOpacity
                    style={styles.sheetRow}
                    activeOpacity={0.7}
                    onPress={() => { handleMarkAsRead(menuItem.id); setMenuItem(null); }}
                  >
                    <Ionicons name="checkmark-done-outline" size={20} color={INK} />
                    <Text style={styles.sheetRowText}>Mark as read</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.sheetRow}
                  activeOpacity={0.7}
                  onPress={() => { const n = menuItem; setMenuItem(null); handleDelete(n); }}
                >
                  <Ionicons name="trash-outline" size={20} color={RED} />
                  <Text style={[styles.sheetRowText, { color: RED }]}>Delete notification</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetCancel} activeOpacity={0.7} onPress={() => setMenuItem(null)}>
                  <Text style={styles.sheetCancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {showUndo && (
        <View style={styles.toast} accessibilityLiveRegion="polite">
          <Text style={styles.toastText}>Notification deleted</Text>
          <TouchableOpacity onPress={handleUndo} hitSlop={hitSlop} accessibilityRole="button">
            <Text style={styles.toastUndo}>Undo</Text>
          </TouchableOpacity>
        </View>
      )}
    </GestureHandlerRootView>
  );
}

/* One compact row: a bold title with an unread dot, the message
   with a short time at its end, a dot when unread, and a ⋯ menu.
   Swipe left to reveal Delete. */
function NotificationRow({
  item, onOpen, onDelete, onMore,
}: {
  item: AppNotification;
  onOpen: (n: AppNotification) => void;
  onDelete: (n: AppNotification) => void;
  onMore: (n: AppNotification) => void;
}) {
  const swipeRef = useRef<Swipeable>(null);
  const isUnread = !item.is_read;

  return (
    <Swipeable
      ref={swipeRef}
      overshootRight={false}
      renderRightActions={() => (
        <TouchableOpacity
          style={styles.swipeDelete}
          onPress={() => { swipeRef.current?.close(); onDelete(item); }}
          accessibilityRole="button"
          accessibilityLabel="Delete notification"
        >
          <Ionicons name="trash-outline" size={20} color="#fff" />
          <Text style={styles.swipeDeleteText}>Delete</Text>
        </TouchableOpacity>
      )}
    >
      <TouchableOpacity
        style={[styles.row, isUnread && styles.rowUnread]}
        onPress={() => onOpen(item)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`${isUnread ? 'Unread. ' : ''}${item.title}. ${item.message}`}
        accessibilityActions={[{ name: 'delete', label: 'Delete notification' }]}
        onAccessibilityAction={e => { if (e.nativeEvent.actionName === 'delete') onDelete(item); }}
      >
        <View style={styles.rowBody}>
          <View style={styles.titleRow}>
            {isUnread && <View style={styles.unreadDot} />}
            <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
          </View>
          <Text style={styles.rowMessage} numberOfLines={3}>
            {item.message} <Text style={styles.rowTime}>{shortTime(item.created_at)}</Text>
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => onMore(item)}
          hitSlop={hitSlop}
          style={styles.moreBtn}
          accessibilityRole="button"
          accessibilityLabel="More options"
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={SUB} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Swipeable>
  );
}

/* Loading state: mirrors the real rows so nothing jumps on arrival. */
function NotificationsSkeleton() {
  return (
    <View
      style={styles.scrollContent}
      accessibilityLabel="Loading notifications"
      accessibilityLiveRegion="polite"
    >
      {[3, 2].map((count, g) => (
        <View key={g} style={styles.dateSection}>
          <View style={styles.dateHeader}>
            <Skeleton width={72} height={14} />
            <Skeleton width={22} height={22} radius={11} />
          </View>

          {Array.from({ length: count }).map((_, i) => (
            <View key={i} style={styles.row}>
              <View style={[styles.rowBody, { gap: 6 }]}>
                <Skeleton width="45%" height={14} />
                <Skeleton width="90%" height={13} />
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  tabRow: {
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: BG,
  },
  markAllText: { ...text.smallBold, color: INK },
  markAllRow: { marginLeft: 'auto' },

  countPill: {
    minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11,
    backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center',
  },
  countText: { ...text.caption, fontSize: 12, color: INK },

  /* list: rows run edge to edge; section headers carry the side padding */
  scrollContent: { paddingTop: space.sm, paddingBottom: TAB_BAR_CLEARANCE },
  dateSection: { marginBottom: space.md },
  dateHeader: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.sm,
  },
  dateTitle: { ...text.bodyBold, fontSize: 14, color: SUB },

  /* row */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingLeft: space.xl,
    paddingRight: space.md,
    paddingVertical: space.md,
    backgroundColor: BG,
  },
  rowUnread: { backgroundColor: colors.white },
  rowBody: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rowTitle: { fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 20, color: INK },
  rowMessage: { ...text.body, fontSize: 14, lineHeight: 19, color: INK },
  rowTime: { color: SUB },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  moreBtn: { padding: 6 },

  /* ⋯ menu sheet */
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: space.xl, paddingTop: 10,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: BORDER, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { ...text.caption, color: SUB, marginBottom: 6 },
  sheetRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 16, borderTopWidth: 1, borderTopColor: BORDER,
  },
  sheetRowText: { ...text.bodyBold, fontSize: 15, color: INK },
  sheetCancel: {
    alignItems: 'center', paddingVertical: 14, marginTop: 4,
    borderTopWidth: 1, borderTopColor: BORDER,
  },
  sheetCancelText: { ...text.bodyBold, fontSize: 15, color: SUB },

  /* swipe action */
  swipeDelete: {
    width: 88, backgroundColor: RED,
    alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  swipeDeleteText: { ...text.smallBold, color: '#fff' },

  /* undo toast */
  toast: {
    position: 'absolute',
    left: space.xl, right: space.xl, bottom: TAB_BAR_CLEARANCE,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: INK, borderRadius: radius.lg,
    paddingHorizontal: space.lg, paddingVertical: space.md,
  },
  toastText: { ...text.body, fontSize: 14, color: BG },
  toastUndo: { ...text.bodyBold, fontSize: 14, color: colors.white },

  /* empty */
  emptyContainer: { flex: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: 32, gap: 10 },
  emptyIconWrap: {
    width: 64, height: 64, borderRadius: radius.lg,
    backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { ...text.heading, fontSize: 16, color: INK },
  emptyText: { ...text.body, fontSize: 13, color: SUB, textAlign: 'center', lineHeight: 19 },
});
