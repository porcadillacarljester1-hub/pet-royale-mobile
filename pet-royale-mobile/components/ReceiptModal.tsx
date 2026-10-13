import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Check } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { colors, text, fonts, space, radius, hitSlop, status, sz } from '../constants/theme';
import { peso, fmtPastDate, fmtTime } from '../lib/format';
import { Skeleton } from './Skeleton';

/* ══════════════════ Receipt ══════════════════
   A bottom sheet, the way a phone shows a receipt: it slides up, the
   amount comes first, the details sit below it, and a Done button stays
   pinned at the bottom while the receipt scrolls.

   The amount and the Paid badge come from the invoice the card already
   has, so they show at once while the line items load.

   "Paid" and "Total paid" are unconditional: every invoice reaching
   this view is fully paid the moment it exists. Every payment happens
   in person at the clinic, so there's only ever one kind.

   A row with nothing to show (for example a visit with no date) is left
   out instead of printing "No date". */
export function ReceiptModal({
  visit, invoice, onClose,
}: {
  visit: any;
  invoice?: { id: string; total: number; created_at: string };
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [clinic, setClinic] = useState<any>(null);

  /* useEffect, not useFocusEffect: this modal mounts when it opens and
     should load exactly once for its invoice, not depend on the
     screen's focus. */
  useEffect(() => {
    let active = true;
    (async () => {
      if (!invoice?.id) { setLoading(false); return; }
      try {
        const [itemsRes, paymentsRes, clinicRes] = await Promise.all([
          (supabase as any).from('invoice_items').select('*').eq('invoice_id', invoice.id),
          (supabase as any)
            .from('payments').select('*').eq('invoice_id', invoice.id).order('paid_at', { ascending: true }),
          (supabase as any).from('clinic_settings').select('*').limit(1).maybeSingle(),
        ]);
        if (!active) return;
        setItems(itemsRes.data || []);
        setPayments(paymentsRes.data || []);
        setClinic(clinicRes.data || null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [invoice?.id]);

  if (!invoice) return null;

  const invoiceNo = `INV-${invoice.id.slice(0, 6).toUpperCase()}`;
  /* The date on the badge is the real settlement date — the most
     recent payment actually received — rather than invoice.created_at
     (when it was raised, which can be days before it's paid). */
  const settledDate = payments.length > 0
    ? payments.reduce((latest, p) => (p.paid_at > latest ? p.paid_at : latest), payments[0].paid_at)
    : invoice.created_at;
  const paidLabel = settledDate ? `Paid on ${fmtPastDate(settledDate)}` : 'Paid';
  const clinicName = clinic?.clinic_name?.trim() || 'Pet Royale Clinic and Veterinary Services';

  const visitWhen = visit.requested_date
    ? [fmtPastDate(visit.requested_date), fmtTime(visit.scheduled_time)].filter(Boolean).join(' \u00b7 ')
    : '';

  const details = ([
    ['Invoice no.', invoiceNo],
    ['Date issued', invoice.created_at ? fmtPastDate(invoice.created_at) : ''],
    ['Visit', visitWhen],
    ['Pet', visit.pet_name],
    ['Service', visit.service],
  ] as [string, string][]).filter(([, value]) => !!value);

  const meta = [clinic?.address, clinic?.phone_number, clinic?.email].filter(Boolean);

  return (
    <Modal visible transparent statusBarTranslucent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* Tapping the dimmed area closes the sheet. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close receipt"
        />

        <View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.lg) }]}
          accessibilityViewIsModal
        >
          <View style={styles.handle} />

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Right padding keeps the name clear of the close button. */}
            <View style={styles.letterhead}>
              <Text style={styles.clinicName}>{clinicName}</Text>
              {meta.length > 0 && <Text style={styles.clinicMeta}>{meta.join(' \u00b7 ')}</Text>}
            </View>

            <Text style={styles.amountLabel}>Amount paid</Text>
            <Text
              style={styles.amount}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              accessibilityLabel={`Total paid ${peso(invoice.total)}`}
            >
              {peso(invoice.total)}
            </Text>

            <View style={styles.paidBadge}>
              <Check size={14} color={status.success.fg} strokeWidth={2.4} />
              <Text style={styles.paidBadgeText}>{paidLabel}</Text>
            </View>

            <View style={styles.rule} />

            <View>
              {details.map(([label, value]) => (
                <View key={label} style={styles.kvRow}>
                  <Text style={styles.kvLabel}>{label}</Text>
                  <Text style={[styles.kvValue, label === 'Invoice no.' && styles.figure]}>{value}</Text>
                </View>
              ))}
            </View>

            <View style={styles.panel}>
              <View style={styles.tableHeadRow}>
                <Text style={[styles.th, styles.colItem]}>Item</Text>
                <Text style={[styles.th, styles.colQty]}>Qty</Text>
                <Text style={[styles.th, styles.colAmount]}>Amount</Text>
              </View>

              {loading ? (
                <View style={styles.loadingBlock} accessibilityLabel="Loading receipt items" accessibilityLiveRegion="polite">
                  <Skeleton width="70%" height={16} style={{ marginBottom: space.md }} />
                  <Skeleton width="45%" height={16} />
                </View>
              ) : items.length === 0 ? (
                <Text style={styles.noItems}>No line items on this invoice.</Text>
              ) : (
                items.map((it) => (
                  <View key={it.id} style={styles.tableRow}>
                    <Text style={[styles.td, styles.colItem]}>{it.service_name}</Text>
                    <Text style={[styles.td, styles.colQty, styles.figure]}>{it.quantity}</Text>
                    <Text style={[styles.tdBold, styles.colAmount, styles.figure]}>
                      {peso(Number(it.subtotal))}
                    </Text>
                  </View>
                ))
              )}

              <View style={styles.grandRow}>
                <Text style={styles.grandLabel}>Total paid</Text>
                <Text style={[styles.grandValue, styles.figure]}>{peso(invoice.total)}</Text>
              </View>
            </View>
          </ScrollView>

          {/* Outside the ScrollView so they stay put while the receipt
              scrolls underneath. */}
          <Pressable
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={hitSlop}
            accessibilityRole="button"
            accessibilityLabel="Close receipt"
          >
            <X size={sz(18)} color={colors.foreground} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.doneBtn, pressed && styles.doneBtnPressed]}
            onPress={onClose}
            accessibilityRole="button"
          >
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/* ── Receipt styles ──
   Every text style carries a font from the theme. A style with a
   fontSize but no fontFamily silently falls back to the system font.
   Figures use tabular numerals so amounts line up in their column.

   The sheet is capped in width, so on a tablet it stays a readable
   column in the centre; on a phone it fills the width. Its height is
   capped at 92% of the screen and only the middle scrolls, which keeps
   the Done button reachable on a small phone or with large text. */
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  sheet: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '92%',
    alignSelf: 'center',
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.cardBorder,
    paddingTop: space.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.input,
  },
  scroll: { flexShrink: 1 },
  scrollContent: {
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    paddingBottom: space.lg,
  },
  closeBtn: {
    position: 'absolute',
    top: space.md,
    right: space.lg,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  figure: { fontVariant: ['tabular-nums'] },

  letterhead: { paddingRight: 52 },
  clinicName: {
    ...text.heading,
    fontSize: sz(16),
    lineHeight: sz(21),
    color: colors.foreground,
  },
  clinicMeta: { ...text.caption, marginTop: 4, color: colors.mutedFg },

  amountLabel: { ...text.small, color: colors.mutedFg, marginTop: space.xl },
  amount: {
    fontFamily: fonts.bodyBold,
    fontSize: sz(40),
    lineHeight: sz(46),
    letterSpacing: -0.8,
    color: colors.foreground,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  paidBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: space.sm,
    backgroundColor: status.success.bg,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  paidBadgeText: { fontFamily: fonts.bodyBold, fontSize: sz(13), lineHeight: sz(18), color: status.success.fg },

  rule: { height: 1, backgroundColor: colors.border, marginTop: space.lg, marginBottom: space.xs },

  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.lg,
    paddingVertical: 7,
  },
  kvLabel: { ...text.small, color: colors.mutedFg, flexShrink: 0 },
  kvValue: { ...text.smallBold, color: colors.foreground, flexShrink: 1, textAlign: 'right' },

  /* The items sit in an inset panel, so they read as the "document"
     part of the receipt. */
  panel: {
    marginTop: space.lg,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingBottom: space.xs,
  },
  tableHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  th: { ...text.caption, fontFamily: fonts.bodyBold, color: colors.mutedFg },
  colItem: { flex: 1, minWidth: 0 },
  colQty: { width: sz(32), textAlign: 'center' },
  colAmount: { minWidth: sz(76), textAlign: 'right' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  td: { ...text.small, color: colors.foreground },
  tdBold: { ...text.smallBold, color: colors.foreground },
  loadingBlock: { paddingVertical: space.lg },
  noItems: {
    ...text.caption,
    paddingVertical: space.xl,
    textAlign: 'center',
    color: colors.mutedFg,
  },

  grandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: space.md,
  },
  grandLabel: { ...text.bodyBold, color: colors.foreground },
  grandValue: { ...text.bodyBold, fontSize: sz(18), lineHeight: sz(24), color: colors.foreground },

  doneBtn: {
    ...{
      height: sz(52),
      borderRadius: radius.lg,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    marginHorizontal: space.xl,
    marginTop: space.sm,
  },
  doneBtnPressed: { backgroundColor: colors.primaryDark },
  doneText: { ...text.bodyBold, color: colors.primaryFg },
});
