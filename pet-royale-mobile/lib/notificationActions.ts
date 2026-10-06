import { supabase } from './supabase';
import { colors } from '@/constants/theme';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  category: string | null;
  related_type: string | null;
  related_id: string | null;
  is_read: boolean;
  created_at: string;
}

// ── Appointment actions ──
export async function cancelAppointment(appointmentId: string) {
  const { error } = await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', appointmentId);
  if (error) throw error;
}

export async function rescheduleAppointment(appointmentId: string, newDate: string, newTime: string) {
  const { error } = await (supabase as any)
    .from('appointments')
    .update({ requested_date: newDate, scheduled_time: newTime, status: 'incoming' })
    .eq('id', appointmentId);
  if (error) throw error;
}

export async function fetchAppointmentById(appointmentId: string) {
  const { data, error } = await (supabase as any)
    .from('appointments')
    .select('*')
    .eq('id', appointmentId)
    .single();
  if (error) throw error;
  return data;
}

// ── Medication actions ──
export async function fetchMedicationById(medicationId: string) {
  const { data, error } = await (supabase as any)
    .from('pet_medications')
    .select('*, pets(name, photo_url)')
    .eq('id', medicationId)
    .single();
  if (error) throw error;
  return data;
}

export async function markMedicationGiven(medicationId: string) {
  const { error } = await (supabase as any)
    .from('pet_medication_logs')
    .insert([{ medication_id: medicationId }]);
  if (error) throw error;
}

// ── Reminder actions ──
export async function snoozeReminder(reminderId: string, hours: number = 24) {
  const snoozedUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  const { error } = await (supabase as any)
    .from('pet_reminders')
    .update({ snoozed_until: snoozedUntil })
    .eq('id', reminderId);
  if (error) throw error;
}

export async function dismissReminder(reminderId: string) {
  const { error } = await (supabase as any).from('pet_reminders').delete().eq('id', reminderId);
  if (error) throw error;
}

export async function fetchReminderById(reminderId: string) {
  const { data, error } = await (supabase as any)
    .from('pet_reminders')
    .select('*')
    .eq('id', reminderId)
    .single();
  if (error) throw error;
  return data;
}

// ── Notification helpers ──
export async function markNotificationRead(id: string) {
  const { error } = await (supabase as any).from('notifications').update({ is_read: true }).eq('id', id);
  if (error) throw error;
}

export async function deleteNotification(id: string) {
  const { error } = await (supabase as any).from('notifications').delete().eq('id', id);
  if (error) throw error;
}

// ── Action definitions per category — the "only show what makes sense" logic ──
export type NotificationAction = {
  key: string;
  label: string;
  sublabel: string;
  icon: string;
  color: string;
  bg: string;
};

export function getActionsForCategory(category: string | null): NotificationAction[] {
  switch (category) {
    case 'appointment_upcoming':
      return [
        { key: 'view_appointment', label: 'View Appointment', sublabel: 'See full appointment details', icon: 'calendar', color: colors.primary, bg: colors.secondary },
        { key: 'reschedule', label: 'Reschedule', sublabel: 'Change the date or time', icon: 'time', color: '#7C3AED', bg: '#EDE9FE' },
        { key: 'cancel', label: 'Cancel Appointment', sublabel: 'Cancel this appointment', icon: 'close-circle', color: colors.destructive, bg: colors.destructiveBg },
      ];
    case 'appointment_confirmed':
      return [
        { key: 'view_appointment', label: 'View Appointment', sublabel: 'See full appointment details', icon: 'calendar', color: colors.primary, bg: colors.secondary },
        { key: 'directions', label: 'Get Directions', sublabel: 'Navigate to the clinic', icon: 'navigate', color: '#2563EB', bg: '#DBEAFE' },
      ];
    case 'medication_reminder':
      return [
        { key: 'mark_given', label: 'Mark as Given', sublabel: 'Log this dose as completed', icon: 'checkmark-circle', color: colors.primary, bg: colors.secondary },
        { key: 'snooze', label: 'Snooze Reminder', sublabel: 'Remind me again later', icon: 'alarm', color: '#F97316', bg: '#FFEDD5' },
        { key: 'view_pet', label: 'View Pet', sublabel: "See this pet's profile", icon: 'paw', color: '#7C3AED', bg: '#EDE9FE' },
      ];
    case 'grooming_reminder':
      return [
        { key: 'book_grooming', label: 'Book Grooming', sublabel: 'Schedule a grooming session', icon: 'cut', color: colors.primary, bg: colors.secondary },
        { key: 'view_pet', label: 'View Pet', sublabel: "See this pet's profile", icon: 'paw', color: '#7C3AED', bg: '#EDE9FE' },
        { key: 'snooze', label: 'Snooze Reminder', sublabel: 'Remind me again later', icon: 'alarm', color: '#F97316', bg: '#FFEDD5' },
      ];
    case 'stock_reminder':
      return [
        { key: 'shop', label: 'Shop Essentials', sublabel: 'Browse pet essentials', icon: 'bag-handle', color: colors.primary, bg: colors.secondary },
        { key: 'view_pet', label: 'View Pet', sublabel: "See this pet's profile", icon: 'paw', color: '#7C3AED', bg: '#EDE9FE' },
        { key: 'dismiss', label: 'Dismiss', sublabel: 'Remove this notification', icon: 'close', color: '#6B7280', bg: '#F3F4F6' },
      ];
    case 'vaccination_due':
      return [
        { key: 'view_pet', label: 'View Pet', sublabel: "See this pet's profile", icon: 'paw', color: '#7C3AED', bg: '#EDE9FE' },
        { key: 'view_vaccination', label: 'View Vaccination Record', sublabel: 'See vaccination history', icon: 'shield-checkmark', color: colors.primary, bg: colors.secondary },
        { key: 'book_appointment', label: 'Book Appointment', sublabel: 'Schedule a vaccination visit', icon: 'calendar', color: '#F97316', bg: '#FFEDD5' },
      ];
    default:
      return [];
  }
}