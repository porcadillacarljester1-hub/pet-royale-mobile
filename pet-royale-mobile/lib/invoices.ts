import { supabase } from "./supabase";

export interface MobileInvoice {
  id: string;
  status: "draft" | "pending_payment" | "paid" | "cancelled";
  total_amount: number;
  checkout_url: string | null;
}

export async function fetchInvoiceForAppointment(
  appointmentId: string
): Promise<MobileInvoice | null> {
  const { data, error } = await (supabase as any)
    .from("invoices")
    .select("id, status, total_amount, checkout_url")
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
  paid_at: string | null;
  service: string;
  pet_name: string;
}

export async function fetchPaymentHistory(clientId: string): Promise<PaymentHistoryItem[]> {
  const { data: appts, error: apptErr } = await (supabase as any)
    .from('appointments')
    .select('id, service, pet_name')
    .eq('client_id', clientId.toString());
  if (apptErr) throw apptErr;
  if (!appts || appts.length === 0) return [];

  const apptMap = new Map(appts.map((a: any) => [a.id, a]));
  const apptIds = appts.map((a: any) => a.id);

  const { data: invoices, error: invErr } = await (supabase as any)
    .from('invoices')
    .select('id, appointment_id, total_amount, paid_at, status')
    .in('appointment_id', apptIds)
    .eq('status', 'paid')
    .order('paid_at', { ascending: false });
  if (invErr) throw invErr;

  return (invoices || []).map((inv: any) => {
    const appt = apptMap.get(inv.appointment_id) as any;
    return {
      id: inv.id,
      total_amount: Number(inv.total_amount),
      paid_at: inv.paid_at,
      service: appt?.service || 'Service',
      pet_name: appt?.pet_name || 'Pet',
    };
  });
}