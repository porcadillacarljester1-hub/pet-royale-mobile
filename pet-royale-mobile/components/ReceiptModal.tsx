import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { X } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { colors, text, fonts, space, radius, hitSlop, status, sz } from '../constants/theme';
import { peso, fmtPastDate } from '../lib/format';

/* ══════════════════ Receipt ══════════════════
   The same document language as the admin's own invoice screen — a
   real letterhead, an itemised table, honest totals — not just the
   total the card already shows.

   No curved stamp text here. react-native-svg's support for text on a
   path is inconsistent across iOS and Android, so "Paid" is a plain
   rotated badge.

   The stamp and "Total paid" are unconditional: every invoice reaching
   this view is fully paid the moment it exists, and payments render as
   one plain list. Every payment happens in person at the clinic, so
   there's only ever one kind. */
export function ReceiptModal({
  visit, invoice, onClose,
}: {
  visit: any;
  invoice?: { id: string; total: number; created_at: string };
  onClose: () => void;
}) {
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
  /* The date on the stamp is the real settlement date — the most
     recent payment actually received — rather than invoice.created_at
     (when it was raised, which can be days before it's paid). */
  const settledDate = payments.length > 0
    ? payments.reduce((latest, p) => (p.paid_at > latest ? p.paid_at : latest), payments[0].paid_at)
    : invoice.created_at;
  const clinicName = clinic?.clinic_name?.trim() || 'Pet Royale Clinic and Veterinary Services';

  return (
    <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <View style={rStyles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityLabel="Close receipt"
        />
        <View style={rStyles.sheet}>
          <ScrollView
            style={rStyles.paper}
            contentContainerStyle={rStyles.paperContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={rStyles.stamp}>
              <Text style={rStyles.stampText}>PAID</Text>
              <Text style={rStyles.stampDate}>{fmtPastDate(settledDate)}</Text>
            </View>

            <View style={rStyles.letterhead}>
              <Text style={rStyles.clinicName}>{clinicName}</Text>
              {(clinic?.address || clinic?.phone_number || clinic?.email) && (
                <Text style={rStyles.clinicMeta}>
                  {[clinic?.address, clinic?.phone_number, clinic?.email].filter(Boolean).join(' · ')}
                </Text>
              )}
            </View>

            <View style={rStyles.rule} />

            <View style={rStyles.metaRow}>
              <View style={{ flex: 1 }}>
                <Text style={rStyles.metaLabel}>Pet</Text>
                <Text style={rStyles.metaValue}>{visit.pet_name}</Text>
                <Text style={rStyles.metaSub}>{visit.service}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={rStyles.metaLabel}>Invoice</Text>
                <Text style={[rStyles.metaValue, rStyles.figure]}>{invoiceNo}</Text>
                <Text style={rStyles.metaSub}>{fmtPastDate(invoice.created_at)}</Text>
              </View>
            </View>

            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: space.xxl }} />
            ) : (
              <>
                <View style={rStyles.table}>
                  <View style={rStyles.tableHeadRow}>
                    <Text style={[rStyles.th, { flex: 1.6 }]}>Service</Text>
                    <Text style={[rStyles.th, rStyles.tRight]}>Qty</Text>
                    <Text style={[rStyles.th, rStyles.tRight, { flex: 1 }]}>Amount</Text>
                  </View>
                  {items.length === 0 ? (
                    <Text style={rStyles.noItems}>No line items on this invoice.</Text>
                  ) : (
                    items.map((it) => (
                      <View key={it.id} style={rStyles.tableRow}>
                        <Text style={[rStyles.td, { flex: 1.6 }]}>{it.service_name}</Text>
                        <Text style={[rStyles.td, rStyles.tRight, rStyles.figure]}>{it.quantity}</Text>
                        <Text style={[rStyles.tdBold, rStyles.tRight, rStyles.figure, { flex: 1 }]}>
                          {peso(Number(it.subtotal))}
                        </Text>
                      </View>
                    ))
                  )}
                </View>

                <View style={rStyles.totals}>
                  <View style={rStyles.totalRow}>
                    <Text style={rStyles.totalLabel}>Subtotal</Text>
                    <Text style={[rStyles.totalValue, rStyles.figure]}>{peso(invoice.total)}</Text>
                  </View>
                  <View style={rStyles.grandRow}>
                    <Text style={rStyles.grandLabel}>Total paid</Text>
                    <Text style={[rStyles.grandValue, rStyles.figure]}>{peso(invoice.total)}</Text>
                  </View>
                </View>

                {payments.length > 0 && (
                  <View style={rStyles.payments}>
                    <Text style={rStyles.metaLabel}>Payments received</Text>
                    {payments.map((p) => (
                      <View key={p.id} style={rStyles.paymentRow}>
                        <Text style={rStyles.paymentLine} numberOfLines={1}>
                          {fmtPastDate(p.paid_at)} — Paid at the clinic
                          {p.method ? ` (${p.method})` : ''}
                        </Text>
                        <Text style={[rStyles.paymentAmount, rStyles.figure]}>{peso(Number(p.amount))}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </ScrollView>

          {/* Outside the ScrollView so it stays put while the receipt
              scrolls underneath it. */}
          <TouchableOpacity
            style={rStyles.closeBtn}
            onPress={onClose}
            hitSlop={hitSlop}
            accessibilityRole="button"
            accessibilityLabel="Close receipt"
          >
            <X size={sz(16)} color={colors.mutedFg} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/* ── Receipt styles ──
   A separate sheet, kept apart from the card-list styles above the
   same way InvoiceDetail's styling was its own thing in the admin —
   this is meant to read as a document, not another app screen.

   Every text style here carries a font from the theme. A style with a
   fontSize but no fontFamily silently falls back to the system font,
   which is what made the receipt look like a different app. Figures
   use tabular numerals so amounts line up in their column. */
const rStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
    backgroundColor: colors.overlay,
  },
  sheet: {
    width: '100%',
    maxWidth: sz(420),
    maxHeight: '86%',
  },
  paper: {
    backgroundColor: colors.white,
    borderRadius: radius.sm,
  },
  paperContent: {
    padding: space.xl,
    paddingTop: space.xxl,
  },
  closeBtn: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    width: sz(30),
    height: sz(30),
    borderRadius: 15,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  figure: { fontVariant: ['tabular-nums'] },

  stamp: {
    alignSelf: 'center',
    marginBottom: space.md,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderWidth: 3,
    borderColor: status.success.fg,
    borderRadius: 4,
    opacity: 0.8,
    transform: [{ rotate: '-8deg' }],
  },
  stampText: {
    fontFamily: fonts.bodyBold,
    fontSize: sz(20),
    lineHeight: sz(24),
    letterSpacing: 3,
    color: status.success.fg,
    textAlign: 'center',
  },
  stampDate: {
    ...text.caption,
    marginTop: 2,
    letterSpacing: 1,
    color: status.success.fg,
    textAlign: 'center',
  },

  letterhead: { alignItems: 'center' },
  clinicName: {
    ...text.title,
    fontSize: sz(18),
    lineHeight: sz(23),
    letterSpacing: -0.3,
    color: colors.foreground,
    textAlign: 'center',
  },
  clinicMeta: {
    ...text.caption,
    marginTop: 4,
    color: colors.mutedFg,
    textAlign: 'center',
  },
  rule: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: space.lg,
  },

  metaRow: { flexDirection: 'row', marginTop: space.lg },
  metaLabel: { ...text.eyebrow, color: colors.mutedFg },
  metaValue: { ...text.smallBold, marginTop: 4, color: colors.foreground },
  metaSub: { ...text.caption, marginTop: 2, color: colors.mutedFg },

  table: { marginTop: space.xl },
  tableHeadRow: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    borderBottomColor: colors.foreground,
    paddingBottom: 7,
  },
  th: { ...text.eyebrow, color: colors.mutedFg, flex: 0.6 },
  tRight: { textAlign: 'right' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 9,
  },
  td: { ...text.small, color: colors.foreground, flex: 0.6 },
  tdBold: { ...text.smallBold, color: colors.foreground, flex: 0.6 },
  noItems: {
    ...text.caption,
    paddingVertical: space.xl,
    textAlign: 'center',
    color: colors.mutedFg,
  },

  totals: { marginTop: space.md, gap: 6 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  totalLabel: { ...text.small, color: colors.mutedFg },
  totalValue: { ...text.small, color: colors.foreground },
  grandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1.5,
    borderTopColor: colors.foreground,
    paddingTop: 8,
    marginTop: 4,
  },
  grandLabel: { ...text.bodyBold, color: colors.foreground },
  grandValue: { ...text.bodyBold, fontSize: sz(18), lineHeight: sz(24), color: colors.foreground },

  payments: {
    marginTop: space.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.md,
    gap: 6,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.md,
  },
  paymentLine: { ...text.caption, color: colors.mutedFg, flex: 1 },
  paymentAmount: { ...text.caption, fontFamily: fonts.bodyBold, color: colors.foreground },
});
