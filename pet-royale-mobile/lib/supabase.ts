import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const supabaseUrl = 'https://nsgxclmupdgccrcttugg.supabase.co';
const supabaseAnonKey = 'sb_publishable_8hVlmz3Ixgvh7vvYowsR2A_TiIc6PiU';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});