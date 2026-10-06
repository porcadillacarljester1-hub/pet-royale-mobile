import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Linking,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  MapPin, Phone, Mail, Clock,
  Stethoscope, Scissors, ExternalLink,
} from 'lucide-react-native';
import { colors, text, space, radius, shadow, common } from '../../constants/theme';
import { TAB_BAR_CLEARANCE } from './_layout';
import { BrandWordmark } from '../../constants/brand';
import { Skeleton, SkeletonRow } from '../../components/Skeleton';
import { ScreenHeader } from '../../components/ScreenHeader';
import { ServiceIcon } from '../../lib/serviceIcons';
import { fmtTime, openDays, closingTime } from '../../lib/format';

/* The clinic's bio. Write or change the text here: this is the only
   place it lives. It isn't read from the database. */
const ABOUT_US =
  'Pet Royale Clinic and Veterinary Services provides excellent healthcare of all companion animals.';

const WORDMARK_ASPECT = 1300 / 230;
const WORDMARK_MAX_HEIGHT = 56;

export default function AboutScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  const [clinic, setClinic] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  /* Panel margins (space.xl × 2) plus its inner padding (space.xxl × 2)
     come off the screen width; whatever is left is the most the
     wordmark may occupy. */
  const wordmarkHeight = Math.min(
    WORDMARK_MAX_HEIGHT,
    (width - space.xl * 2 - space.xxl * 2) / WORDMARK_ASPECT
  );

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

  const open = (url: string, label: string) => {
    Linking.canOpenURL(url).then((can) => {
      if (can) Linking.openURL(url);
      else Alert.alert('Not available', `Couldn't open ${label} on this device.`);
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <ScreenHeader title="About Pet Royale" onBack={handleBack} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: TAB_BAR_CLEARANCE }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Brand ──
               The wordmark is gold-on-navy by design, so it sits on a
               navy panel rather than the cream canvas. */}
        <View style={styles.brand}>
          <BrandWordmark height={wordmarkHeight} color={colors.accent} />
          <Text style={styles.brandTag}>We care for you and your pets</Text>
        </View>

        {/* ── About us ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About us</Text>
          <View style={styles.card}>
            {loading ? (
              <View style={styles.aboutSkeleton}>
                <Skeleton width="100%" height={13} />
                <Skeleton width="92%" height={13} />
                <Skeleton width="60%" height={13} />
              </View>
            ) : (
              <View style={styles.aboutBody}>
                <Text style={styles.aboutText}>{ABOUT_US}</Text>

                {categories.length > 0 && (
                  <View>
                    <Text style={styles.aboutLabel}>What we offer</Text>
                    <View style={styles.serviceWrap}>
                      {categories.map((c: any) => (
                        <View key={c.name} style={styles.servicePill}>
                          <ServiceIcon
                            name={c.name}
                            size={13}
                            color={colors.primary}
                            strokeWidth={2}
                          />
                          <Text style={styles.servicePillText}>{c.name}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

        {/* ── Clinic information ──
               Every row acts: the address opens maps, the phone dials,
               the email composes. A number you have to copy out by hand
               is a number nobody rings. */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Clinic information</Text>

          <View style={styles.card}>
            {loading && [0, 1, 2].map((i) => (
              <SkeletonRow key={i} tile={38} style={[styles.row, i > 0 && styles.rowBordered]} />
            ))}

            {clinic?.address ? (
              <TouchableOpacity
                style={styles.row}
                onPress={() => open(
                  `https://maps.google.com/?q=${encodeURIComponent(clinic.address)}`,
                  'Maps'
                )}
                activeOpacity={0.7}
                accessibilityRole="link"
                accessibilityLabel={`Address: ${clinic.address}. Opens in maps.`}
              >
                <View style={styles.rowIcon}>
                  <MapPin size={17} color={colors.primary} strokeWidth={1.9} />
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
                style={[styles.row, styles.rowBordered]}
                onPress={() => open(`tel:${clinic.phone_number}`, 'the phone app')}
                activeOpacity={0.7}
                accessibilityRole="link"
                accessibilityLabel={`Phone: ${clinic.phone_number}. Calls the clinic.`}
              >
                <View style={styles.rowIcon}>
                  <Phone size={17} color={colors.primary} strokeWidth={1.9} />
                </View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowLabel}>Phone</Text>
                  <Text style={styles.rowValue}>{clinic.phone_number}</Text>
                </View>
                <ExternalLink size={14} color={colors.mutedFg} />
              </TouchableOpacity>
            ) : null}

            {clinic?.email ? (
              <TouchableOpacity
                style={[styles.row, styles.rowBordered]}
                onPress={() => open(`mailto:${clinic.email}`, 'your mail app')}
                activeOpacity={0.7}
                accessibilityRole="link"
                accessibilityLabel={`Email: ${clinic.email}. Opens your mail app.`}
              >
                <View style={styles.rowIcon}>
                  <Mail size={17} color={colors.primary} strokeWidth={1.9} />
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

            {!loading && !clinic?.address && !clinic?.phone_number && !clinic?.email && (
              <View style={styles.row}>
                <View style={styles.rowIcon}>
                  <MapPin size={17} color={colors.mutedFg} strokeWidth={1.9} />
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
          <Text style={styles.sectionTitle}>Opening hours</Text>

          <View style={styles.card}>
            {loading ? (
              [0, 1].map((i) => (
                <SkeletonRow key={i} tile={38} style={[styles.row, i > 0 && styles.rowBordered]} />
              ))
            ) : schedules.length === 0 ? (
              <View style={styles.row}>
                <View style={styles.rowIcon}>
                  <Clock size={17} color={colors.mutedFg} strokeWidth={1.9} />
                </View>
                <Text style={styles.rowEmpty}>Hours haven&apos;t been set yet.</Text>
              </View>
            ) : (
              schedules.map((s: any, i: number) => (
                <View key={s.key} style={[styles.row, i > 0 && styles.rowBordered]}>
                  <View style={styles.rowIcon}>
                    {s.isGrooming
                      ? <Scissors size={17} color={colors.primary} strokeWidth={1.9} />
                      : <Stethoscope size={17} color={colors.primary} strokeWidth={1.9} />}
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

  /* Navy panel: the crest colours, gold lettering on navy. */
  brand: {
    alignItems: 'center',
    marginHorizontal: space.xl,
    marginTop: space.xl,
    marginBottom: space.xxl,
    paddingVertical: space.xxxl,
    paddingHorizontal: space.xxl,
    borderRadius: radius.card,
    backgroundColor: colors.primary,
    ...shadow.primary,
  },
  brandTag: {
    ...text.displayRegular,
    color: colors.primaryFg,
    opacity: 0.78,
    marginTop: space.lg,
    textAlign: 'center',
  },

  section: { paddingHorizontal: space.xl, marginBottom: space.xxl },
  /* Same heading style as the other screens. */
  sectionTitle: {
    ...text.section,
    color: colors.foreground,
    marginBottom: space.md,
  },

  card: { ...common.card, padding: 0, overflow: 'hidden' },

  aboutSkeleton: { padding: space.lg, gap: space.sm },
  aboutBody: { padding: space.lg, gap: space.lg },
  aboutText: {
    ...text.small,
    color: colors.foreground,
    lineHeight: 21,
  },
  aboutLabel: {
    ...text.caption,
    color: colors.mutedFg,
    marginBottom: space.sm,
  },
  serviceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  servicePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.secondary,
    /* Never wider than the card's content area. */
    maxWidth: '100%',
  },
  servicePillText: {
    ...text.caption,
    fontFamily: text.bodyBold.fontFamily,
    color: colors.secondaryFg,
    /* Lets the label wrap inside the pill instead of pushing it past
       the card edge. */
    flexShrink: 1,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
  },
  rowBordered: { borderTopWidth: 1, borderTopColor: colors.border },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* minWidth: 0 lets the text column actually shrink beside the icons. */
  rowCopy: { flex: 1, minWidth: 0 },
  rowLabel: { ...text.caption, color: colors.mutedFg },
  rowValue: { ...text.small, color: colors.foreground, marginTop: 2 },
  rowEmpty: { ...text.small, color: colors.mutedFg, flex: 1 },

  note: {
    ...text.caption,
    color: colors.mutedFg,
    marginTop: space.md,
    paddingHorizontal: space.xs,
  },
});
