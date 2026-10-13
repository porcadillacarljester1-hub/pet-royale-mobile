import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Linking,
  Alert,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  MapPin, Phone, Mail, Clock, Globe, AlertTriangle,
  Stethoscope, Scissors, ExternalLink,
} from 'lucide-react-native';
import { colors, text, space, radius, common } from '../../constants/theme';
import { TAB_BAR_CLEARANCE } from './_layout';
import { Skeleton, SkeletonRow } from '../../components/Skeleton';
import { ScreenHeader } from '../../components/ScreenHeader';
import { fmtTime, openDays, closingTime } from '../../lib/format';

/* The clinic's bio. The admin's Clinic details can set a short
   description; until it does, this line is shown. */
const ABOUT_US =
  'Pet Royale Clinic and Veterinary Services provides excellent healthcare of all companion animals.';

const GOLD = '#F5C518';
const DANGER = '#9A3B2B';
const DANGER_TILE = '#F3E1DB';

const initialsOf = (name?: string | null) =>
  (name || 'Pet Royale')
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

export default function AboutScreen() {
  const router = useRouter();

  const [clinic, setClinic] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile' as any);
  };

  const loadData = useCallback(async () => {
    const [settingsRes, categoryRes] = await Promise.all([
      (supabase as any).from('clinic_settings').select('*').limit(1).maybeSingle(),
      (supabase as any)
        .from('booking_categories')
        .select('name, opening_time, last_slot, closed_day')
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
    ]);

    setClinic(settingsRes.data || null);
    setCategories(categoryRes.data || []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  /* Realtime, so an address or phone number changed in the admin lands
     here without the client reopening the screen. useFocusEffect already
     refetches on every open, so this only matters while someone is
     looking at the screen. Both tables are tiny, so a change on either
     just refetches everything rather than patching state. */
  useEffect(() => {
    const channel = supabase
      .channel('clinic-details')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clinic_settings' },
        () => loadData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'booking_categories' },
        () => loadData()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  /* Categories sharing a schedule collapse into one line. The clinic
     runs Mon–Sat and grooming Tue–Sun, so listing all five separately
     would repeat the same hours four times. */
  const schedules = categories.reduce((acc: any[], c: any) => {
    const key = `${c.opening_time}-${c.last_slot}-${c.closed_day}`;
    const found = acc.find((s) => s.key === key);
    if (found) {
      found.names.push(c.name);
    } else {
      acc.push({
        key,
        names: [c.name],
        isGrooming: c.name === 'Grooming',
        days: openDays(c.closed_day),
        from: fmtTime(c.opening_time),
        to: closingTime(c.last_slot),
      });
    }
    return acc;
  }, []);

  /* canOpenURL is unreliable for web links on Android 11+ (it says no
     unless the app declares package visibility), so try to open the link
     and only complain if that really fails. */
  const open = (url: string, label: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert('Not available', `Couldn't open ${label} on this device.`);
    });
  };

  /* The admin can paste an exact Google Maps link. Without one, the
     address is searched on the map, as before. */
  const mapsUrl: string | null = clinic?.map_link
    ? clinic.map_link
    : clinic?.address
      ? `https://maps.google.com/?q=${encodeURIComponent(clinic.address)}`
      : null;

  const facebookUrl: string | null = clinic?.facebook_url
    ? (/^https?:\/\//i.test(clinic.facebook_url) ? clinic.facebook_url : `https://${clinic.facebook_url}`)
    : null;

  const hasContact = !!(
    clinic?.address || clinic?.phone_number || clinic?.emergency_phone ||
    clinic?.email || facebookUrl
  );

  /* Rows only draw a divider above themselves when something is above. */
  let shown = 0;
  const rowStyle = () => [styles.row, shown++ > 0 && styles.rowBordered];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <ScreenHeader title="About Pet Royale" onBack={handleBack} large />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: TAB_BAR_CLEARANCE }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Who we are ── */}
        <View style={styles.hero}>
          {clinic?.logo_url ? (
            <Image
              source={{ uri: clinic.logo_url }}
              style={styles.logo}
              accessibilityLabel="Clinic logo"
            />
          ) : (
            <View style={[styles.logo, styles.logoFallback]}>
              <Text style={styles.logoInitials}>{initialsOf(clinic?.clinic_name)}</Text>
            </View>
          )}

          <Text style={styles.clinicName}>{clinic?.clinic_name || 'Pet Royale'}</Text>
          <Text style={styles.clinicTag}>Clinic and Veterinary Services</Text>

          {loading ? (
            <View style={styles.heroSkeleton}>
              <Skeleton width="100%" height={13} />
              <Skeleton width="70%" height={13} />
            </View>
          ) : (
            <Text style={styles.heroText}>{clinic?.description?.trim() || ABOUT_US}</Text>
          )}
        </View>

        {/* ── Quick actions: call and directions ── */}
        {!loading && (clinic?.phone_number || mapsUrl) ? (
          <View style={styles.actions}>
            {clinic?.phone_number ? (
              <TouchableOpacity
                style={[styles.action, styles.actionPrimary]}
                onPress={() => open(`tel:${clinic.phone_number}`, 'the phone app')}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Call the clinic"
              >
                <Phone size={17} color="#FFFFFF" strokeWidth={2} />
                <Text style={styles.actionPrimaryText}>Call</Text>
              </TouchableOpacity>
            ) : null}
            {mapsUrl ? (
              <TouchableOpacity
                style={[styles.action, styles.actionOutline]}
                onPress={() => open(mapsUrl, 'Maps')}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Get directions to the clinic"
              >
                <MapPin size={17} color={colors.primary} strokeWidth={2} />
                <Text style={styles.actionOutlineText}>Directions</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* ── Clinic information ──
               Every row acts: the address opens maps, the phone dials,
               the email composes. A number you have to copy out by hand
               is a number nobody rings. */}
        <View style={styles.section}>
          <View style={styles.card}>
            {loading && [0, 1, 2].map((i) => (
              <SkeletonRow key={i} tile={40} style={[styles.row, i > 0 && styles.rowBordered]} />
            ))}

            {clinic?.address ? (
              <TouchableOpacity
                style={rowStyle()}
                onPress={() => open(mapsUrl as string, 'Maps')}
                activeOpacity={0.7}
                accessibilityRole="link"
                accessibilityLabel={`Address: ${clinic.address}. Opens in maps.`}
              >
                <View style={styles.rowIcon}>
                  <MapPin size={18} color={colors.primary} strokeWidth={1.9} />
                </View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowLabel}>Address</Text>
                  <Text style={styles.rowValue}>{clinic.address}</Text>
                </View>
                <ExternalLink size={14} color={colors.mutedFg} />
              </TouchableOpacity>
            ) : null}

            {clinic?.phone_number ? (
              <TouchableOpacity
                style={rowStyle()}
                onPress={() => open(`tel:${clinic.phone_number}`, 'the phone app')}
                activeOpacity={0.7}
                accessibilityRole="link"
                accessibilityLabel={`Phone: ${clinic.phone_number}. Calls the clinic.`}
              >
                <View style={styles.rowIcon}>
                  <Phone size={18} color={colors.primary} strokeWidth={1.9} />
                </View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowLabel}>Phone</Text>
                  <Text style={styles.rowValue}>{clinic.phone_number}</Text>
                </View>
                <ExternalLink size={14} color={colors.mutedFg} />
              </TouchableOpacity>
            ) : null}

            {clinic?.emergency_phone ? (
              <TouchableOpacity
                style={rowStyle()}
                onPress={() => open(`tel:${clinic.emergency_phone}`, 'the phone app')}
                activeOpacity={0.7}
                accessibilityRole="link"
                accessibilityLabel={`After hours or emergency: ${clinic.emergency_phone}. Calls the clinic.`}
              >
                <View style={[styles.rowIcon, { backgroundColor: DANGER_TILE }]}>
                  <AlertTriangle size={18} color={DANGER} strokeWidth={1.9} />
                </View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowLabel}>After hours or emergency</Text>
                  <Text style={styles.rowValue}>{clinic.emergency_phone}</Text>
                </View>
                <ExternalLink size={14} color={colors.mutedFg} />
              </TouchableOpacity>
            ) : null}

            {clinic?.email ? (
              <TouchableOpacity
                style={rowStyle()}
                onPress={() => open(`mailto:${clinic.email}`, 'your mail app')}
                activeOpacity={0.7}
                accessibilityRole="link"
                accessibilityLabel={`Email: ${clinic.email}. Opens your mail app.`}
              >
                <View style={styles.rowIcon}>
                  <Mail size={18} color={colors.primary} strokeWidth={1.9} />
                </View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowLabel}>Email</Text>
                  {/* One line that shrinks to fit, so the address never
                      splits mid-word at large display/font sizes. */}
                  <Text
                    style={styles.rowValue}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {clinic.email}
                  </Text>
                </View>
                <ExternalLink size={14} color={colors.mutedFg} />
              </TouchableOpacity>
            ) : null}

            {facebookUrl ? (
              <TouchableOpacity
                style={rowStyle()}
                onPress={() => open(facebookUrl, 'Facebook')}
                activeOpacity={0.7}
                accessibilityRole="link"
                accessibilityLabel="Facebook page. Opens in Facebook or your browser."
              >
                <View style={styles.rowIcon}>
                  <Globe size={18} color={colors.primary} strokeWidth={1.9} />
                </View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowLabel}>Facebook</Text>
                  <Text style={styles.rowValue} numberOfLines={1}>
                    {facebookUrl.replace(/^https?:\/\/(www\.)?/i, '')}
                  </Text>
                </View>
                <ExternalLink size={14} color={colors.mutedFg} />
              </TouchableOpacity>
            ) : null}

            {!loading && !hasContact && (
              <View style={styles.row}>
                <View style={styles.rowIcon}>
                  <MapPin size={18} color={colors.mutedFg} strokeWidth={1.9} />
                </View>
                <Text style={styles.rowEmpty}>
                  Contact details haven&apos;t been added yet.
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Hours ── */}
        <View style={styles.section}>
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Clock size={17} color={colors.primary} strokeWidth={2} />
              <Text style={styles.cardHeadText}>Opening hours</Text>
            </View>

            {loading ? (
              [0, 1].map((i) => (
                <SkeletonRow key={i} tile={40} style={[styles.row, styles.rowBordered]} />
              ))
            ) : schedules.length === 0 ? (
              <View style={[styles.row, styles.rowBordered]}>
                <View style={styles.rowIcon}>
                  <Clock size={18} color={colors.mutedFg} strokeWidth={1.9} />
                </View>
                <Text style={styles.rowEmpty}>Hours haven&apos;t been set yet.</Text>
              </View>
            ) : (
              schedules.map((s: any) => (
                <View key={s.key} style={[styles.row, styles.rowBordered]}>
                  <View style={styles.rowIcon}>
                    {s.isGrooming
                      ? <Scissors size={18} color={colors.primary} strokeWidth={1.9} />
                      : <Stethoscope size={18} color={colors.primary} strokeWidth={1.9} />}
                  </View>
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowLabel}>
                      {s.isGrooming ? 'Grooming' : 'Clinic'}
                    </Text>
                    <Text style={styles.rowValue}>
                      {s.days}: {s.from} – {s.to}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>

          <Text style={styles.note}>
            These are the hours you can book. For an emergency outside them,
            call the clinic.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { ...common.screen },

  scroll: { paddingBottom: space.xxxl },

  hero: {
    alignItems: 'center',
    paddingHorizontal: space.xl,
    paddingTop: space.xl,
  },
  logo: { width: 84, height: 84, borderRadius: 24 },
  logoFallback: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInitials: { fontSize: 30, fontWeight: '700', fontStyle: 'italic', color: GOLD },
  clinicName: {
    ...text.section,
    fontSize: 24,
    fontWeight: '700',
    color: colors.foreground,
    textAlign: 'center',
    marginTop: space.lg,
  },
  clinicTag: {
    ...text.small,
    color: colors.mutedFg,
    textAlign: 'center',
    marginTop: 2,
  },
  heroText: {
    ...text.small,
    color: colors.foreground,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: space.md,
  },
  heroSkeleton: { alignSelf: 'stretch', gap: space.sm, marginTop: space.md },

  actions: {
    flexDirection: 'row',
    gap: space.md,
    paddingHorizontal: space.xl,
    marginTop: space.xl,
  },
  action: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionPrimary: { backgroundColor: colors.primary },
  actionPrimaryText: { ...text.bodyBold, color: '#FFFFFF' },
  actionOutline: { borderWidth: 1.5, borderColor: colors.primary },
  actionOutlineText: { ...text.bodyBold, color: colors.primary },

  section: { paddingHorizontal: space.xl, marginTop: space.xl },

  card: { ...common.card, padding: 0, overflow: 'hidden' },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xs,
  },
  cardHeadText: { ...text.bodyBold, color: colors.foreground },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
  },
  rowBordered: { borderTopWidth: 1, borderTopColor: colors.border },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* minWidth: 0 lets the text column actually shrink beside the icons. */
  rowCopy: { flex: 1, minWidth: 0 },
  rowLabel: { ...text.caption, color: colors.mutedFg },
  rowValue: { ...text.body, color: colors.foreground, marginTop: 2 },
  rowEmpty: { ...text.body, color: colors.mutedFg, flex: 1 },

  note: {
    ...text.caption,
    color: colors.mutedFg,
    marginTop: space.md,
    paddingHorizontal: space.xs,
  },
});
