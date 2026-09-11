import { supabase } from './supabase';

export interface AvatarHistoryItem {
  id: string;
  photo_url: string;
  created_at: string;
}

export async function fetchAvatarHistory(userId: string, limit = 5): Promise<AvatarHistoryItem[]> {
  const { data, error } = await (supabase as any)
    .from('user_avatar_history')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function addAvatarHistoryEntry(userId: string, photoUrl: string) {
  const { error } = await (supabase as any)
    .from('user_avatar_history')
    .insert([{ user_id: userId, photo_url: photoUrl }]);
  if (error) throw error;
}