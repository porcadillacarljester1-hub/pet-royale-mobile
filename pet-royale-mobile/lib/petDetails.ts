import { supabase } from './supabase';

export async function fetchPetVaccinations(petId: string) {
  const { data, error } = await (supabase as any)
    .from('pet_vaccinations')
    .select('*')
    .eq('pet_id', petId)
    .order('date_administered', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchPetHealthNotes(petId: string) {
  const { data, error } = await (supabase as any)
    .from('pet_health_notes')
    .select('*')
    .eq('pet_id', petId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchPetReminders(petId: string) {
  const { data, error } = await (supabase as any)
    .from('pet_reminders')
    .select('*')
    .eq('pet_id', petId)
    .order('due_date', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function addClientReminder(petId: string, ownerId: string, title: string, dueDate: string) {
  const { error } = await (supabase as any)
    .from('pet_reminders')
    .insert([{ pet_id: petId, owner_id: ownerId, title, due_date: dueDate, source: 'client' }]);
  if (error) throw error;
}

export async function toggleReminderDone(reminderId: string, isDone: boolean) {
  const { error } = await (supabase as any)
    .from('pet_reminders')
    .update({ is_done: isDone })
    .eq('id', reminderId);
  if (error) throw error;
}

export async function deleteReminder(reminderId: string) {
  const { error } = await (supabase as any).from('pet_reminders').delete().eq('id', reminderId);
  if (error) throw error;
}