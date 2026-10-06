import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
  Modal, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, text, space, radius, shadow, fonts, hitSlop } from '@/constants/theme';
import { Skeleton } from '@/components/Skeleton';
import { ScreenHeader } from '@/components/ScreenHeader';
import { PillTabs } from '@/components/PillTabs';
import { TAB_BAR_CLEARANCE } from './_layout';
import {
  type AppNotification,
  getActionsForCategory,
  markNotificationRead,
  deleteNotification,
  cancelAppointment,
  fetchAppointmentById,
} from '@/lib/notificationActions';

const BORDER = colors.border;
const SUB = colors.mutedFg;
const INK = colors.foreground;
const BG = colors.background;
const CLINIC_ADDRESS = 'Calbayog City, Eastern Samar, Philippines';

type TabKey = 'all' | 'unread';

/* created_at is "timestamp without time zone", so Supabase returns it with
   no zone marker and JS would read it as local time. Treat it as UTC.
   If times look wrong by hours, remove the 'Z' handling here. */
function parseDate(value: string): Date {
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value);
  return new Date(hasZone ? value : value.replace(' ', 'T') + 'Z');
}

function timeAgo(value: string): string {
  const mins = Math.round((Date.now() - parseDate(value).getTime()) / 60000);
  if (mins < 1) return 'less than a minute ago';
  if (mins < 45) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  if (mins < 90) return 'about 1 hour ago';
  const hours = Math.round(mins / 60);
  if (mins < 1440) return `about ${hours} hours ago`;
  if (mins < 2520) return '1 day ago';
  const days = Math.round(mins / 1440);
  if (days < 30) return `${days} days ago`;
  return parseDate(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<TabKey>('all');

  const [selected, setSelected] = useState<AppNotification | null>(null);
  const [detailData, setDetailData] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchNotifications = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await (supabase as any)
      .from('notifications')
      .select('*')
      .eq('client_user_id', user.id)
      .eq('type', 'appointment')
      .order('created_at', { ascending: false })
      .limit(50);

    if (data) setNotifications(data);
    setIsLoading(false);
    setRefreshing(false);
  };

  useFocusEffect(useCallback(() => { fetchNotifications(); }, []));

  // Live updates: refetch whenever one of this client's rows changes.
  useEffect(() => {
    let active = true;
    let channel: any;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) return;
      channel = (supabase as any)
        .channel(`notifications-${user.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'notifications', filter: `client_user_id=eq.${user.id}` },
          () => fetchNotifications(),
        )
        .subscribe();
    })();
    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

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

  const handleDelete = (id: string) => {
    Alert.alert('Delete notification', 'Remove this notification?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await deleteNotification(id);
          setNotifications(prev => prev.filter(n => n.id !== id));
        },
      },
    ]);
  };

  // ── Detail sheet ──
  const openDetail = async (n: AppNotification) => {
    setSelected(n);
    setDetailData(null);
    if (!n.is_read) handleMarkAsRead(n.id);
    if (n.related_type !== 'appointment' || !n.related_id) return;

    setLoadingDetail(true);
    try {
      setDetailData(await fetchAppointmentById(n.related_id));
    } catch {
      setDetailData(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const closeDetail = () => {
    setSelected(null);
    setDetailData(null);
  };

  const handleAction = async (actionKey: string) => {
    if (!selected) return;
    setActionLoading(actionKey);
    try {
      switch (actionKey) {
        case 'view_appointment':
          closeDetail();
          router.push('/(tabs)/appointments' as any);
          break;

        case 'cancel':
          if (selected.related_id) {
            Alert.alert('Cancel visit', 'Are you sure you want to cancel this visit?', [
              { text: 'Keep it', style: 'cancel' },
              {
                text: 'Cancel visit', style: 'destructive',
                onPress: async () => {
                  try {
                    await cancelAppointment(selected.related_id!);
                    closeDetail();
                    Alert.alert('Cancelled', 'Your visit has been cancelled.');
                  } catch {
                    Alert.alert('Could not cancel', 'This visit can no longer be cancelled.');
                  }
                },
              },
            ]);
          }
          break;

        case 'reschedule':
          if (selected.related_id) {
            closeDetail();
            router.push({
              pathname: '/(tabs)/appointments',
              params: { reschedule: '1', appointmentId: selected.related_id },
            } as any);
          }
          break;

        case 'directions':
          Linking.openURL(
            `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(CLINIC_ADDRESS)}`,
          );
          break;

        case 'book_appointment':
          closeDetail();
          router.push({ pathname: '/(tabs)/appointments', params: { openBooking: '1' } } as any);
          break;
      }
    } catch {
      Alert.alert('Something went wrong', 'Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const visible = tab === 'unread' ? notifications.filter(n => !n.is_read) : notifications;

  const grouped = GROUP_ORDER.map(group => ({
    group,
    items: visible.filter(n => getDateGroupLabel(n.created_at) === group),
  })).filter(g => g.items.length > 0);

  const actions = selected ? getActionsForCategory(selected.category) : [];

  return (
    <View style={styles.container}>
      {/* ── Header ── The bell opens this, so it's called Notifications.
          "Visits" is the name of the bookings tab. */}
      <ScreenHeader title="Notifications" onBack={handleBack} bordered={false} />

      <View style={styles.tabRow}>
        <PillTabs
          tabs={[
            { key: 'all', label: 'Show all', count: notifications.length },
            { key: 'unread', label: 'Unread', count: unreadCount },
          ]}
          value={tab}
          onChange={setTab}
        />
        {unreadCount > 0 && (
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

      {/* ── List ── */}
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
            grouped.map(({ group, items }) => (
              <View key={group} style={styles.dateSection}>
                <View style={styles.dateHeader}>
                  <Text style={styles.dateTitle}>{group}</Text>
                  <View style={styles.countPill}>
                    <Text style={styles.countText}>{items.length}</Text>
                  </View>
                </View>

                {/* Tapping a card opens its details, with the "view
                    appointment" action inside, so cards don't need a
                    button of their own. Unread cards are lifted (white,
                    shadow, bold); read ones sit flat and quiet. */}
                {items.map(item => {
                  const isUnread = !item.is_read;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.card, isUnread && styles.cardUnread]}
                      onPress={() => openDetail(item)}
                      onLongPress={() => handleDelete(item.id)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={`${isUnread ? 'Unread. ' : ''}${item.title}. ${item.message}`}
                    >
                      <View style={styles.cardTop}>
                        <View style={styles.cardTitleRow}>
                          {isUnread && <View style={styles.unreadDot} />}
                          <Text
                            style={[styles.cardTitle, isUnread && styles.cardTitleUnread]}
                            numberOfLines={2}
                          >
                            {item.title}
                          </Text>
                        </View>
                        <Text style={styles.cardTime}>{timeAgo(item.created_at)}</Text>
                      </View>

                      <Text style={[styles.cardMessage, isUnread && styles.cardMessageUnread]}>
                        {item.message}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* ── Detail sheet ── */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={closeDetail}>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeDetail} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />

            {selected && (
              <>
                <View style={styles.sheetHeader}>
                  <View style={styles.sheetIconWrap}>
                    <Ionicons name="calendar-outline" size={22} color={INK} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetTitle}>{selected.title}</Text>
                    <Text style={styles.sheetSub}>{timeAgo(selected.created_at)}</Text>
                  </View>
                  <TouchableOpacity style={styles.sheetCloseBtn} onPress={closeDetail}>
                    <Ionicons name="close" size={20} color={SUB} />
                  </TouchableOpacity>
                </View>

                {loadingDetail ? (
                  <ActivityIndicator color={INK} style={{ marginVertical: 20 }} />
                ) : (
                  <View style={styles.detailBody}>
                    <Text style={styles.detailMessage}>{selected.message}</Text>
                    {detailData && (
                      <View style={styles.detailInfoCard}>
                        <View style={styles.detailInfoRow}>
                          <Ionicons name="calendar-outline" size={15} color={SUB} />
                          <Text style={styles.detailInfoText}>{detailData.requested_date}</Text>
                        </View>
                        {detailData.scheduled_time ? (
                          <View style={styles.detailInfoRow}>
                            <Ionicons name="time-outline" size={15} color={SUB} />
                            <Text style={styles.detailInfoText}>{detailData.scheduled_time}</Text>
                          </View>
                        ) : null}
                        <View style={styles.detailInfoRow}>
                          <Ionicons name="paw-outline" size={15} color={SUB} />
                          <Text style={styles.detailInfoText}>{detailData.service}</Text>
                        </View>
                      </View>
                    )}
                  </View>
                )}

                {actions.length > 0 && (
                  <View style={styles.actionsSection}>
                    <Text style={styles.actionsSectionTitle}>Actions</Text>
                    <View style={styles.actionsCard}>
                      {actions.map((a, i) => (
                        <View key={a.key}>
                          <TouchableOpacity
                            style={styles.actionRow}
                            onPress={() => handleAction(a.key)}
                            disabled={!!actionLoading}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.actionIconWrap, { backgroundColor: a.bg }]}>
                              {actionLoading === a.key ? (
                                <ActivityIndicator size="small" color={a.color} />
                              ) : (
                                <Ionicons name={a.icon as any} size={16} color={a.color} />
                              )}
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.actionLabel}>{a.label}</Text>
                              <Text style={styles.actionSublabel}>{a.sublabel}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={SUB} />
                          </TouchableOpacity>
                          {i < actions.length - 1 && <View style={styles.actionDivider} />}
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                <View style={{ height: 12 + insets.bottom }} />
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* Loading state: mirrors the real list (a date header, then cards with a
   title and time and a two-line message), using the same styles so
   nothing jumps when the content arrives. */
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
            <View key={i} style={styles.card}>
              <View style={styles.cardTop}>
                <Skeleton width="50%" height={15} />
                <Skeleton width={84} height={12} />
              </View>
              <Skeleton width="100%" height={13} />
              <Skeleton width="75%" height={13} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  /* tabs (sit directly under the shared header) */
  tabRow: {
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: BG,
  },
  markAllText: { ...text.smallBold, color: INK },
  markAllRow: { alignSelf: 'flex-end', marginTop: space.sm },

  countPill: {
    minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11,
    backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center',
  },
  countPillActive: { backgroundColor: colors.card, borderWidth: 1, borderColor: INK },
  countText: { ...text.caption, fontSize: 12, color: INK },

  /* list — clears the floating tab bar */
  scrollContent: { paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: TAB_BAR_CLEARANCE },
  dateSection: { marginBottom: space.lg },
  dateHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md },
  dateTitle: { ...text.bodyBold, fontSize: 14, color: SUB },

  /* Read cards recede: flat, same colour as the page, quieter text.
     Unread cards stand out: white, lifted, bold title, darker message. */
  card: {
    backgroundColor: BG,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: BORDER,
    padding: space.lg,
    marginBottom: space.md,
    gap: space.sm,
  },
  cardUnread: {
    backgroundColor: colors.white,
    borderColor: colors.input,
    ...shadow.card,
  },
  cardTop: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  columnGap: space.md,
  rowGap: 2,
  },
  cardTitleRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: space.sm,
  flexGrow: 1,
  flexShrink: 1,
  minWidth: 160,
  },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  cardTitle: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 22, color: SUB, flexShrink: 1 },
  cardTitleUnread: { fontFamily: fonts.bodyBold, color: INK },
  cardTime: { ...text.caption, color: SUB, flexShrink: 0 },
  cardMessage: { ...text.body, fontSize: 14, color: SUB, lineHeight: 20 },
  cardMessageUnread: { color: INK },

  /* empty */
  emptyContainer: { flex: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: 32, gap: 10 },
  emptyIconWrap: {
    width: 64, height: 64, borderRadius: radius.lg,
    backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { ...text.heading, fontSize: 16, color: INK },
  emptyText: { ...text.body, fontSize: 13, color: SUB, textAlign: 'center', lineHeight: 19 },

  /* detail sheet */
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 10, maxHeight: '85%',
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: BORDER, alignSelf: 'center', marginBottom: 14 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  sheetIconWrap: {
    width: 44, height: 44, borderRadius: radius.lg,
    backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center',
  },
  sheetTitle: { ...text.heading, fontSize: 16.5, color: INK },
  sheetSub: { ...text.caption, color: SUB, marginTop: 2 },
  sheetCloseBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: BG,
    alignItems: 'center', justifyContent: 'center',
  },

  detailBody: { marginBottom: 8 },
  detailMessage: { ...text.body, fontSize: 13.5, color: INK, lineHeight: 20, marginBottom: 14 },
  detailInfoCard: { backgroundColor: BG, borderRadius: 12, padding: 12, gap: 9 },
  detailInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailInfoText: { ...text.body, fontSize: 12.5, color: INK },

  actionsSection: { marginTop: 6 },
  actionsSectionTitle: { ...text.smallBold, color: SUB, marginBottom: 8 },
  actionsCard: {
    backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: BORDER,
    overflow: 'hidden',
  },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  actionIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { ...text.bodyBold, fontSize: 13.5, color: INK },
  actionSublabel: { ...text.caption, color: SUB, marginTop: 1 },
  actionDivider: { height: 1, backgroundColor: BORDER, marginLeft: 62 },
});
