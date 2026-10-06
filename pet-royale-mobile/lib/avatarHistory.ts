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
    .limit(50);
  if (error) throw error;

  // Re-selecting an older photo inserts a new row with the same URL.
  // Keep only the newest row per URL so Recent Photos has no duplicates.
  const seen = new Set<string>();
  const unique: AvatarHistoryItem[] = [];
  for (const row of (data || []) as AvatarHistoryItem[]) {
    if (seen.has(row.photo_url)) continue;
    seen.add(row.photo_url);
    unique.push(row);
    if (unique.length >= limit) break;
  }
  return unique;
}

export async function addAvatarHistoryEntry(userId: string, photoUrl: string) {
  const { error } = await (supabase as any)
    .from('user_avatar_history')
    .insert([{ user_id: userId, photo_url: photoUrl }]);
  if (error) throw error;
}

/**
 * Google accounts expose their profile photo through Auth metadata rather
 * than the clients table. Mirror it into the same history used by custom
 * photos so the clinic dashboard can verify the owner visually.
 */
export async function syncProviderAvatar(user: any) {
  const providerUrl = user?.user_metadata?.picture || user?.user_metadata?.avatar_url;
  if (!user?.id || !providerUrl) return;

  const { data: existing, error: fetchError } = await (supabase as any)
    .from('user_avatar_history')
    .select('id')
    .eq('user_id', user.id)
    .limit(1);
  if (fetchError || existing?.length) return;

  await addAvatarHistoryEntry(user.id, providerUrl);
}