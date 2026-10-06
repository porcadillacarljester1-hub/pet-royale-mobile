import { supabase } from "./supabase";

/* fetchInvoiceForAppointment below references a status enum
   ("draft" | "pending_payment" | "paid" | "cancelled") and a
   checkout_url column that don't match anything else in this project
   — every other screen treats an invoice as simply existing-or-not,
   paid the moment it's raised. This looks like leftover code from an
   earlier, different payment architecture. Whether anything still
   calls it wasn't something I could confirm, so it's fixed rather
   than removed — but it's worth checking whether this function is
   actually used anywhere before relying on it. */
export interface MobileInvoice {
  id: string;
  total_amount: number;
}

export async function fetchInvoiceForAppointment(
  appointmentId: string
): Promise<MobileInvoice | null> {
  const { data, error } = await (supabase as any)
    .from("invoices")
    .select("id, total_amount")
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch invoice:", error);
    return null;
  }
  return data;
}

export interface PaymentHistoryItem {
  id: string;
  total_amount: number;
  /** When the payment was recorded. Kept for the receipt. */
  paid_at: string | null;
  /** The day of the visit itself, the same date the Visits screen shows.
   *  The list displays this one, so the two screens can't disagree about
   *  which day a visit was (a visit on Oct 2 paid late at night used to
   *  read Oct 1 here). */
  visit_date: string | null;
  service: string;
  pet_name: string;
}

export async function fetchPaymentHistory(clientId: string): Promise<PaymentHistoryItem[]> {
  const { data: appts, error: apptErr } = await (supabase as any)
    .from('appointments')
    .select('id, service, pet_name, requested_date')
    .eq('client_id', clientId.toString());
  if (apptErr) throw apptErr;
  if (!appts || appts.length === 0) return [];

  const apptMap = new Map(appts.map((a: any) => [a.id, a]));
  const apptIds = appts.map((a: any) => a.id);

  /* status dropped from this select — it was named here but never
     actually read anywhere below; the function already correctly
     determines "paid" from the real payments table via
     paidByInvoice.has(inv.id), not from this column. Naming a
     column invoices no longer has was what broke this whole query:
     Postgrest throws on an unknown column, this throw propagated up,
     and the screen's own try/catch silently showed "No Payments Yet"
     instead of surfacing the real error. */
  const { data: invoices, error: invErr } = await (supabase as any)
    .from('invoices')
    .select('id, appointment_id, total_amount, paid_at')
    .in('appointment_id', apptIds)
    .order('created_at', { ascending: false });
  if (invErr) throw invErr;

  if (!invoices?.length) return [];

  // Billing records payments separately from the invoice itself. Use the
  // actual payment rows so clinic-recorded payments appear on mobile
  // regardless of anything the invoice record alone would say.
  const invoiceIds = invoices.map((invoice: any) => invoice.id);
  const { data: payments, error: paymentErr } = await (supabase as any)
    .from('payments')
    .select('invoice_id, amount, paid_at')
    .in('invoice_id', invoiceIds)
    .order('paid_at', { ascending: false });
  if (paymentErr) throw paymentErr;

  const paidByInvoice = new Map<string, { amount: number; paidAt: string | null }>();
  (payments || []).forEach((payment: any) => {
    const current = paidByInvoice.get(payment.invoice_id) || { amount: 0, paidAt: null };
    current.amount += Number(payment.amount || 0);
    if (!current.paidAt && payment.paid_at) current.paidAt = payment.paid_at;
    paidByInvoice.set(payment.invoice_id, current);
  });

  const items = invoices.filter((inv: any) => paidByInvoice.has(inv.id)).map((inv: any) => {
    const appt = apptMap.get(inv.appointment_id) as any;
    const payment = paidByInvoice.get(inv.id)!;
    return {
      id: inv.id,
      total_amount: payment.amount,
      paid_at: payment.paidAt || inv.paid_at,
      visit_date: appt?.requested_date ?? null,
      service: appt?.service || 'Service',
      pet_name: appt?.pet_name || 'Pet',
    };
  });

  // Newest visit first, the same order History uses on the Visits
  // screen. Payment time breaks a tie between visits on the same day.
  return items.sort(
    (a: PaymentHistoryItem, b: PaymentHistoryItem) =>
      (b.visit_date || '').localeCompare(a.visit_date || '') ||
      (b.paid_at || '').localeCompare(a.paid_at || '')
  );
}