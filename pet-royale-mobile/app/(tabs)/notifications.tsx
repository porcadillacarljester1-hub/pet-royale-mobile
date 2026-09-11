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
import {
  type AppNotification,
  getActionsForCategory,
  markNotificationRead,
  deleteNotification,
  cancelAppointment,
  fetchAppointmentById,
  fetchMedicationById,
  markMedicationGiven,
  snoozeReminder,
  dismissReminder,
} from '@/lib/notificationActions';

const TEAL = '#0D9488';
const TEAL_LIGHT = '#CCFBF1';
const ORANGE = '#F97316';
const ORANGE_LIGHT = '#FFEDD5';
const PURPLE = '#7C3AED';
const PURPLE_LIGHT = '#EDE9FE';
const BLUE = '#2563EB';
const BLUE_LIGHT = '#DBEAFE';
const GOLD = '#D97706';
const GOLD_LIGHT = '#FEF3C7';
const BORDER = '#E5E7EB';
const SUB = '#6B7280';
const INK = '#111827';
const BG = '#F4F7FB';

const ADMIN_ONLY_TITLES = ['New Appointment Request'];
const CLINIC_ADDRESS = 'Calbayog City, Eastern Samar, Philippines';

type FilterKey = 'all' | 'reminders' | 'appointments' | 'updates';

function getFilterGroup(category: string | null): FilterKey {
  if (category === 'appointment_upcoming' || category === 'appointment_confirmed') return 'appointments';
  if (category === 'medication_reminder' || category === 'grooming_reminder' || category === 'vaccination_due' || category === 'stock_reminder') return 'reminders';
  return 'updates';
}

function getCategoryVisual(category: string | null, type: string) {
  switch (category) {
    case 'appointment_upcoming': return { icon: 'notifications' as const, bg: ORANGE_LIGHT, fg: ORANGE };
    case 'appointment_confirmed': return { icon: 'checkmark-circle' as const, bg: BLUE_LIGHT, fg: BLUE };
    case 'medication_reminder': return { icon: 'medical' as const, bg: TEAL_LIGHT, fg: TEAL };
    case 'grooming_reminder': return { icon: 'cut' as const, bg: PURPLE_LIGHT, fg: PURPLE };
    case 'stock_reminder': return { icon: 'bag-handle' as const, bg: TEAL_LIGHT, fg: TEAL };
    case 'vaccination_due': return { icon: 'shield-checkmark' as const, bg: GOLD_LIGHT, fg: GOLD };
    default:
      if (type === 'appointment') return { icon: 'calendar' as const, bg: TEAL_LIGHT, fg: TEAL };
      if (type === 'inventory') return { icon: 'cube' as const, bg: ORANGE_LIGHT, fg: ORANGE };
      if (type === 'client') return { icon: 'person' as const, bg: PURPLE_LIGHT, fg: PURPLE };
      return { icon: 'notifications' as const, bg: '#F3F4F6', fg: SUB };
  }
}

function getDateGroupLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86400000);

  if (diffDays === 0) return 'Today';
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
  const [filter, setFilter] = useState<FilterKey>('all');

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
      .or(`client_user_id.eq.${user.id},type.eq.general`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (data) {
      setNotifications(data.filter((n: any) => !ADMIN_ONLY_TITLES.includes(n.title)));
    }
    setIsLoading(false);
    setRefreshing(false);
  };

  useFocusEffect(useCallback(() => { fetchNotifications(); }, []));

  useEffect(() => {
    const channel = (supabase as any)
      .channel('notifications-screen')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => fetchNotifications())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleMarkAsRead = async (id: string) => {
    await markNotificationRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Notification', 'Remove this notification?', [
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

  const formatItemTime = (dateStr: string, group: string) => {
    const date = new Date(dateStr);
    const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    if (group === 'Today') return time;
    if (group === 'Yesterday') return `Yesterday, ${time}`;
    return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`;
  };

  // ── Open detail sheet, load whatever related record it needs ──
  const openDetail = async (n: AppNotification) => {
    setSelected(n);
    setDetailData(null);
    if (!n.is_read) handleMarkAsRead(n.id);

    if (!n.related_type || !n.related_id) return;

    setLoadingDetail(true);
    try {
      if (n.related_type === 'appointment') {
        setDetailData(await fetchAppointmentById(n.related_id));
      } else if (n.related_type === 'medication') {
        setDetailData(await fetchMedicationById(n.related_id));
      } else if (n.related_type === 'reminder') {
        setDetailData({ id: n.related_id });
      } else if (n.related_type === 'pet') {
        const { data } = await (supabase as any).from('pets').select('*').eq('id', n.related_id).single();
        setDetailData(data);
      } else if (n.related_type === 'vaccination') {
        const { data } = await (supabase as any).from('pet_vaccinations').select('*, pets(name)').eq('id', n.related_id).single();
        setDetailData(data);
      }
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

  // ── Handle each action key — real behavior per action ──
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
            Alert.alert('Cancel Appointment', 'Are you sure you want to cancel this appointment?', [
              { text: 'Keep It', style: 'cancel' },
              {
                text: 'Cancel Appointment', style: 'destructive',
                onPress: async () => {
                  await cancelAppointment(selected.related_id!);
                  closeDetail();
                  Alert.alert('Cancelled', 'Your appointment has been cancelled.');
                },
              },
            ]);
          }
          break;

        case 'reschedule':
          if (selected.related_id) {
            closeDetail();
            router.push({ pathname: '/(tabs)/appointments', params: { reschedule: '1', appointmentId: selected.related_id } } as any);
          }
          break;

        case 'directions':
          Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(CLINIC_ADDRESS)}`);
          break;

        case 'mark_given':
          if (selected.related_id) {
            await markMedicationGiven(selected.related_id);
            closeDetail();
            Alert.alert('Logged', 'Dose marked as given.');
          }
          break;

        case 'snooze':
          if (selected.related_id) {
            await snoozeReminder(selected.related_id, 24);
            closeDetail();
            Alert.alert('Snoozed', "We'll remind you again in 24 hours.");
          }
          break;

        case 'dismiss':
          if (selected.related_id) {
            await dismissReminder(selected.related_id);
          }
          closeDetail();
          break;

        case 'view_pet': {
          const petId = detailData?.pet_id || detailData?.id || selected.related_id;
          closeDetail();
          if (petId) router.push({ pathname: '/pet-detail', params: { id: petId } } as any);
          break;
        }

        case 'view_vaccination': {
          const petId = detailData?.pet_id;
          closeDetail();
          if (petId) router.push({ pathname: '/pet-detail', params: { id: petId } } as any);
          break;
        }

        case 'book_grooming':
          closeDetail();
          router.push({ pathname: '/(tabs)/appointments', params: { openBooking: '1', service: 'Grooming' } } as any);
          break;

        case 'book_appointment':
          closeDetail();
          router.push({ pathname: '/(tabs)/appointments', params: { openBooking: '1' } } as any);
          break;

        case 'shop':
          closeDetail();
          router.push('/(tabs)/products' as any);
          break;
      }
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = filter === 'all' ? notifications : notifications.filter(n => getFilterGroup(n.category) === filter);

  // Group filtered notifications by date bucket, preserving GROUP_ORDER
  const grouped = GROUP_ORDER.map(group => ({
    group,
    items: filtered.filter(n => getDateGroupLabel(n.created_at) === group),
  })).filter(g => g.items.length > 0);

  const actions = selected ? getActionsForCategory(selected.category) : [];
  const selectedVisual = selected ? getCategoryVisual(selected.category, selected.type) : null;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>Notifications</Text>
          <TouchableOpacity style={styles.gearBtn} onPress={() => router.push('/(tabs)/settings' as any)} activeOpacity={0.7}>
            <Ionicons name="settings-outline" size={19} color={INK} />
          </TouchableOpacity>
        </View>

        <View style={styles.filterRow}>
          {([
            { key: 'all', label: 'All' },
            { key: 'reminders', label: 'Reminders' },
            { key: 'appointments', label: 'Appointments' },
            { key: 'updates', label: 'Updates' },
          ] as const).map(f => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterPill, filter === f.key && styles.filterPillActive]}
              onPress={() => setFilter(f.key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.filterPillText, filter === f.key && styles.filterPillTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={TEAL} style={{ marginTop: 48 }} />
      ) : (
        <ScrollView
          contentContainerStyle={grouped.length === 0 ? styles.emptyContainer : styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchNotifications(); }} tintColor={TEAL} />
          }
        >
          {grouped.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="notifications-off-outline" size={28} color="#fff" />
              </View>
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptyText}>Notifications about your appointments and pets will appear here.</Text>
            </View>
          ) : (
            grouped.map(({ group, items }) => (
              <View key={group} style={styles.dateSection}>
                <Text style={styles.dateSectionTitle}>{group}</Text>
                {items.map(item => {
                  const visual = getCategoryVisual(item.category, item.type);
                  const isUnread = !item.is_read;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.item}
                      onPress={() => openDetail(item)}
                      onLongPress={() => handleDelete(item.id)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.iconBubble, { backgroundColor: visual.bg }]}>
                        <Ionicons name={visual.icon} size={19} color={visual.fg} />
                      </View>

                      <View style={styles.itemBody}>
                        <View style={styles.itemTitleRow}>
                          <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                          {isUnread && <View style={styles.unreadDot} />}
                        </View>
                        <Text style={styles.itemMessage} numberOfLines={2}>{item.message}</Text>
                        <View style={styles.itemTimeRow}>
                          <Ionicons name="time-outline" size={11} color="#9CA3AF" />
                          <Text style={styles.itemTime}>{formatItemTime(item.created_at, group)}</Text>
                        </View>
                      </View>

                      <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* ── Dynamic detail bottom sheet ── */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={closeDetail}>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeDetail} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />

            {selected && selectedVisual && (
              <>
                <View style={styles.sheetHeader}>
                  <View style={[styles.sheetIconWrap, { backgroundColor: selectedVisual.bg }]}>
                    <Ionicons name={selectedVisual.icon} size={22} color={selectedVisual.fg} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetTitle}>{selected.title}</Text>
                    {detailData?.pet_name || detailData?.pets?.name ? (
                      <Text style={styles.sheetSub}>
                        {detailData.pet_name || detailData.pets?.name}
                        {selected.category === 'grooming_reminder' ? ' · Grooming' : ''}
                      </Text>
                    ) : null}
                  </View>
                  <TouchableOpacity style={styles.sheetCloseBtn} onPress={closeDetail}>
                    <Ionicons name="close" size={20} color={SUB} />
                  </TouchableOpacity>
                </View>

                <ScrollableDetailBody
                  loading={loadingDetail}
                  message={selected.message}
                  detailData={detailData}
                  category={selected.category}
                />

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
                            <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                          </TouchableOpacity>
                          {i < actions.length - 1 && <View style={styles.actionDivider} />}
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {!selected.is_read && (
                  <TouchableOpacity
                    style={styles.markReadBtn}
                    onPress={() => { handleMarkAsRead(selected.id); closeDetail(); }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="checkmark" size={16} color={TEAL} />
                    <Text style={styles.markReadBtnText}>Mark as read</Text>
                  </TouchableOpacity>
                )}

                <View style={{ height: 12 }} />
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ScrollableDetailBody({ loading, message, detailData, category }: any) {
  if (loading) {
    return <ActivityIndicator color={TEAL} style={{ marginVertical: 20 }} />;
  }

  return (
    <View style={styles.detailBody}>
      <Text style={styles.detailMessage}>{message}</Text>

      {category === 'appointment_upcoming' || category === 'appointment_confirmed' ? (
        detailData && (
          <View style={styles.detailInfoCard}>
            <View style={styles.detailInfoRow}>
              <Ionicons name="calendar-outline" size={15} color={SUB} />
              <Text style={styles.detailInfoText}>{detailData.requested_date}</Text>
            </View>
            {detailData.scheduled_time && (
              <View style={styles.detailInfoRow}>
                <Ionicons name="time-outline" size={15} color={SUB} />
                <Text style={styles.detailInfoText}>{detailData.scheduled_time}</Text>
              </View>
            )}
            <View style={styles.detailInfoRow}>
              <Ionicons name="paw-outline" size={15} color={SUB} />
              <Text style={styles.detailInfoText}>{detailData.service}</Text>
            </View>
          </View>
        )
      ) : null}

      {category === 'medication_reminder' && detailData && (
        <View style={styles.detailInfoCard}>
          <View style={styles.detailInfoRow}>
            <Ionicons name="medical-outline" size={15} color={SUB} />
            <Text style={styles.detailInfoText}>{detailData.name} {detailData.dosage ? `· ${detailData.dosage}` : ''}</Text>
          </View>
          {detailData.scheduled_time && (
            <View style={styles.detailInfoRow}>
              <Ionicons name="time-outline" size={15} color={SUB} />
              <Text style={styles.detailInfoText}>{detailData.scheduled_time}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 12,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: INK, fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  gearBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },

  filterRow: { flexDirection: 'row', gap: 8 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: BG },
  filterPillActive: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: TEAL },
  filterPillText: { color: SUB, fontSize: 12, fontWeight: '600' },
  filterPillTextActive: { color: TEAL, fontWeight: '700' },

  scrollContent: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 24 },

  dateSection: { marginBottom: 18 },
  dateSectionTitle: { fontSize: 13, fontWeight: '800', color: INK, marginBottom: 8 },

  item: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 9,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 5, elevation: 1,
  },
  iconBubble: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  itemBody: { flex: 1, gap: 3 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemTitle: { fontSize: 13.5, fontWeight: '800', color: INK, flexShrink: 1 },
  itemMessage: { fontSize: 12, color: SUB, lineHeight: 16.5 },
  itemTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  itemTime: { fontSize: 10.5, color: '#9CA3AF' },
  unreadDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: ORANGE },

  emptyContainer: { flex: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: 32, gap: 10 },
  emptyIconWrap: { width: 68, height: 68, borderRadius: 34, backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: INK },
  emptyText: { fontSize: 13, color: SUB, textAlign: 'center', lineHeight: 19 },

  /* ── Detail sheet ── */
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 10, maxHeight: '85%',
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: BORDER, alignSelf: 'center', marginBottom: 14 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  sheetIconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 16.5, fontWeight: '800', color: INK },
  sheetSub: { fontSize: 12.5, color: SUB, marginTop: 2 },
  sheetCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },

  detailBody: { marginBottom: 8 },
  detailMessage: { fontSize: 13.5, color: INK, lineHeight: 20, marginBottom: 14 },
  detailInfoCard: {
    backgroundColor: BG, borderRadius: 12, padding: 12, gap: 9,
  },
  detailInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailInfoText: { fontSize: 12.5, color: INK, fontWeight: '500' },

  actionsSection: { marginTop: 6 },
  actionsSectionTitle: {
    fontSize: 11, fontWeight: '700', color: SUB,
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8,
  },
  actionsCard: {
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: BORDER,
    overflow: 'hidden',
  },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  actionIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 13.5, fontWeight: '700', color: INK },
  actionSublabel: { fontSize: 11, color: SUB, marginTop: 1 },
  actionDivider: { height: 1, backgroundColor: BORDER, marginLeft: 62 },

  markReadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 14, paddingVertical: 12,
    backgroundColor: TEAL_LIGHT, borderRadius: 12,
  },
  markReadBtnText: { color: TEAL, fontSize: 13, fontWeight: '700' },
});