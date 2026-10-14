import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Modal, Image,
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

/* Where a tapped appointment notification goes: the Visits screen, with
   the appointment id and which tab to open. If the Visits file is not
   called appointments.tsx, change this one line. */
const VISITS_ROUTE = '/(tabs)/appointments';

/* Appointments with these statuses live in Visits > History.
   Everything else lives in Visits > Upcoming. The check is "contains", so
   "Completed", "completed" and "complete" all count. Adjust to match your
   appointments.status values. */
const HISTORY_STATUS_WORDS = ['complet', 'cancel', 'no_show', 'no-show', 'noshow', 'declin', 'done', 'finish'];

const isHistoryStatus = (status: unknown) => {
  const s = String(status ?? '').toLowerCase();
  return HISTORY_STATUS_WORDS.some(w => s.includes(w));
};

type TabKey = 'all' | 'unread';
type Kind = 'completed' | 'confirmed' | 'cancelled' | 'other';

/* What the notification is about, read from its own title and message.
   Used for the icon, and as the fallback for which Visits tab to open
   when the appointment itself can't be looked up. */
function kindOf(n: AppNotification): Kind {
  const t = `${n.title ?? ''} ${n.message ?? ''}`.toLowerCase();
  if (t.includes('complet')) return 'completed';
  if (t.includes('cancel') || t.includes('declin')) return 'cancelled';
  if (t.includes('confirm')) return 'confirmed';
  return 'other';
}

/* created_at is "timestamp without time zone", so Supabase returns it with
   no zone marker and JS would read it as local time. Treat it as UTC.
   If times look wrong by hours, remove the 'Z' handling here. */
function parseDate(value: string): Date {
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value);
  return new Date(hasZone ? value : value.replace(' ', 'T') + 'Z');
}

/* Readable time: Just now, 7 min ago, 17 hours ago, 3 days ago, Oct 7 */
function timeAgo(value: string): string {
  const mins = Math.round((Date.now() - parseDate(value).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (mins < 1440) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(mins / 1440);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
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

type PetInfo = { name?: string | null; photo_url?: string | null };

/* The pet behind each appointment notification, so the row can show its
   photo like the pet list does. Two small lookups for the whole list:
   appointments (to get each pet_id), then pets (name and photo).

   Assumes appointments has a pet_id column that points at pets.id. If
   your column is called something else, change 'pet_id' below. Any
   failure just returns nothing: the row then shows the status icon
   instead, and nothing else on the screen is affected. */
async function loadPetsForAppointments(ids: string[]): Promise<Record<string, PetInfo>> {
  const out: Record<string, PetInfo> = {};
  if (ids.length === 0) return out;
  try {
    const { data: appts } = await (supabase as any)
      .from('appointments').select('id, pet_id').in('id', ids);
    const petIds = Array.from(new Set((appts || []).map((a: any) => a.pet_id).filter(Boolean)));
    if (petIds.length === 0) return out;
    const { data: petRows } = await (supabase as any)
      .from('pets').select('id, name, photo_url').in('id', petIds);
    const byId: Record<string, any> = {};
    (petRows || []).forEach((p: any) => { byId[p.id] = p; });
    (appts || []).forEach((a: any) => {
      const p = byId[a.pet_id];
      if (p) out[a.id] = { name: p.name, photo_url: p.photo_url };
    });
  } catch {
    /* keep the status icon */
  }
  return out;
}

/* Fallback when the appointment lookup finds no pet (for example the
   appointment was moved or closed out, or the row can't be read): match
   one of the owner's own pets by the name written in the message, such as
   "...appointment for Marshall (Vaccination...) is complete". Longest
   names are tried first, so "Sky" can't win over "Skyler". */
function matchPetByName(message: string | null | undefined, pets: PetInfo[]): PetInfo | undefined {
  const m = (message ?? '').trim();
  if (!m) return undefined;
  const named = pets.filter(p => p.name && p.name.trim()).sort((a, b) => b.name!.length - a.name!.length);
  return named.find(p => {
    const escaped = p.name!.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu').test(m);
  });
}

const initialOf = (name?: string | null) => (name?.trim()?.[0] || '?').toUpperCase();

/* Round photo inside a navy ring, the same as on My Pets. Falls back to
   the pet's initial if the photo is missing or can't load. */
function PetAvatar({ uri, name, size }: { uri?: string | null; name?: string | null; size: number }) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const inner = size + 6;
  const outer = size + 12;
  return (
    <View
      style={{
        width: outer, height: outer, borderRadius: outer / 2,
        borderWidth: 3, borderColor: colors.primary,
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: inner, height: inner, borderRadius: inner / 2,
          borderWidth: 3, borderColor: colors.card,
          alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}
      >
        {uri && uri !== failedUri ? (
          <Image
            source={{ uri }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
            accessibilityLabel={`${name || 'Pet'} photo`}
            onError={() => setFailedUri(uri)}
          />
        ) : (
          <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
            <Text style={[styles.avatarInitial, { fontSize: size * 0.4 }]}>{initialOf(name)}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

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
  const [ownerPets, setOwnerPets] = useState<PetInfo[]>([]);
  const [petByAppt, setPetByAppt] = useState<Record<string, PetInfo>>({});
  const askedPets = useRef<Set<string>>(new Set());

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

  // Fetches pet photos for rows not looked up yet. Never blocks or breaks the list.
  const loadPetPhotos = async (rows: AppNotification[]) => {
    const ids = rows
      .map(n => n.related_id as string | null)
      .filter((id): id is string => !!id && !askedPets.current.has(id));
    if (ids.length === 0) return;
    ids.forEach(id => askedPets.current.add(id));
    const found = await loadPetsForAppointments(ids);
    if (Object.keys(found).length > 0) setPetByAppt(prev => ({ ...prev, ...found }));
    // Not found (offline, or not allowed): let the next refresh try again.
    ids.forEach(id => { if (!found[id]) askedPets.current.delete(id); });
  };

  const loadOwnerPets = async (userId: string) => {
    try {
      const { data } = await (supabase as any).from('pets').select('name, photo_url').eq('owner_id', userId);
      if (data) setOwnerPets(data);
    } catch {
      /* the name match is only a fallback */
    }
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
      loadPetPhotos(data);
      loadOwnerPets(user.id);
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
    loadPetPhotos([row]);

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

  /* ── Open the appointment where it lives ──
     Confirmed (or anything still ahead)  → Visits > Upcoming
     Completed / cancelled / no-show      → Visits > History

     The tab comes from the appointment's real status. If that can't be
     read (offline, or the appointment was deleted), it falls back to what
     the notification itself says, so a "completed" notification never
     lands on Upcoming just because the lookup failed.

     The appointment id is used whenever the notification has one, no
     matter what related_type says: this screen only lists appointment
     notifications. navigate (not push) is used because Visits is a tab:
     it opens that tab instead of stacking a second copy of it. */
  const openAppointment = async (item: AppNotification) => {
    if (openingId) return;
    if (!item.is_read) handleMarkAsRead(item.id);

    const kind = kindOf(item);
    const fallbackTab: 'upcoming' | 'history' =
      kind === 'completed' || kind === 'cancelled' ? 'history' : 'upcoming';

    if (!item.related_id) {
      router.navigate({ pathname: VISITS_ROUTE, params: { tab: fallbackTab } } as any);
      return;
    }

    setOpeningId(item.id);
    let visitsTab: 'upcoming' | 'history' = fallbackTab;
    try {
      const appt = await fetchAppointmentById(item.related_id);
      if (appt && appt.status != null) {
        visitsTab = isHistoryStatus(appt.status) ? 'history' : 'upcoming';
      }
    } catch {
      /* keep the fallback tab */
    }
    setOpeningId(null);

    router.navigate({
      pathname: VISITS_ROUTE,
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
                    <Text style={styles.countText} maxFontSizeMultiplier={1.3}>{items.length}</Text>
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

                {/* One rounded card per day; the rows inside are separated by hairlines. */}
                <View style={styles.group}>
                  {items.map((item, i) => (
                    <NotificationRow
                      key={item.id}
                      item={item}
                      first={i === 0}
                      opening={openingId === item.id}
                      pet={
                        (item.related_id ? petByAppt[item.related_id as string] : undefined)
                        ?? matchPetByName(item.message, ownerPets)
                      }
                      onOpen={openAppointment}
                      onDelete={handleDelete}
                      onMore={handleMore}
                    />
                  ))}
                </View>
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

/* One row: a status icon, the title and the full message (never cut off,
   they wrap to as many lines as they need), the time, and a ⋯ menu.
   Unread rows are tinted and show a dot before the time. Swipe left to
   reveal Delete. Tapping the row opens the appointment (see
   openAppointment). */
function NotificationRow({
  item, first, opening, pet, onOpen, onDelete, onMore,
}: {
  item: AppNotification;
  first: boolean;
  opening: boolean;
  pet?: PetInfo;
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
        style={[
          styles.row,
          isUnread ? styles.rowUnread : styles.rowRead,
          !first && styles.rowDivider,
          opening && styles.rowOpening,
        ]}
        onPress={() => onOpen(item)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`${isUnread ? 'Unread. ' : ''}${item.title}. ${item.message}. ${timeAgo(item.created_at)}`}
        accessibilityActions={[{ name: 'delete', label: 'Delete notification' }]}
        onAccessibilityAction={e => { if (e.nativeEvent.actionName === 'delete') onDelete(item); }}
      >
        <View style={styles.avatarWrap}>
          {/* The pet's photo; without one, its initial (or P for Pet Royale if the pet isn't known). */}
          <PetAvatar uri={pet?.photo_url} name={pet?.name ?? 'Pet Royale'} size={AVATAR - 12} />
        </View>

        <View style={styles.rowBody}>
          <Text style={[styles.rowTitle, !isUnread && styles.rowTitleRead]}>{item.title}</Text>
          <Text style={styles.rowMessage}>{item.message}</Text>
          <View style={styles.timeRow}>
            {isUnread && <View style={styles.unreadDot} />}
            <Text style={[styles.rowTime, isUnread && styles.rowTimeUnread]} maxFontSizeMultiplier={1.3}>
              {timeAgo(item.created_at)}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => onMore(item)}
          hitSlop={hitSlop}
          style={styles.moreBtn}
          accessibilityRole="button"
          accessibilityLabel="More options"
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={SUB} />
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

          <View style={styles.group}>
            {Array.from({ length: count }).map((_, i) => (
              <View key={i} style={[styles.row, styles.rowRead, i > 0 && styles.rowDivider]}>
                <Skeleton width={AVATAR} height={AVATAR} radius={AVATAR / 2} />
                <View style={[styles.rowBody, { gap: 6 }]}>
                  <Skeleton width="50%" height={14} />
                  <Skeleton width="90%" height={13} />
                  <Skeleton width="30%" height={11} />
                </View>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const AVATAR = 48;
const CONTROL_H = 44;

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
  markAllText: { ...text.smallBold, color: colors.primary },
  markAllRow: { marginLeft: 'auto', minHeight: CONTROL_H, justifyContent: 'center' },

  countPill: {
    minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11,
    backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center',
  },
  countText: { ...text.caption, fontSize: 12, color: INK },

  /* list: one rounded card per day, side margins match the header */
  scrollContent: { paddingTop: space.sm, paddingBottom: TAB_BAR_CLEARANCE },
  dateSection: { marginBottom: space.md },
  dateHeader: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.sm,
  },
  dateTitle: { ...text.bodyBold, fontSize: 16, color: INK },
  group: {
    marginHorizontal: space.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 24,
    overflow: 'hidden',
  },

  /* row: unread is white, read sits on the card colour, as on your other lists. */
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingLeft: space.md + 2,
    paddingRight: space.xs,
    paddingVertical: space.md,
  },
  rowUnread: { backgroundColor: colors.white },
  rowRead: { backgroundColor: colors.card },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.cardBorder },
  rowOpening: { opacity: 0.6 },
  avatarWrap: { width: AVATAR, height: AVATAR },
  avatarFallback: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontFamily: text.display.fontFamily, color: colors.accent },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 22, color: INK },
  rowTitleRead: { fontFamily: fonts.bodyMedium },
  rowMessage: { ...text.body, fontSize: 15, lineHeight: 21, color: INK, marginTop: 2 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  rowTime: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: SUB },
  rowTimeUnread: { fontFamily: fonts.bodyBold, color: colors.primary },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  moreBtn: {
    width: CONTROL_H, height: CONTROL_H, marginTop: -6,
    alignItems: 'center', justifyContent: 'center',
  },

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
