import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const supabaseUrl = 'https://nsgxclmupdgccrcttugg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zZ3hjbG11cGRnY2NyY3R0dWdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2Nzc5MTgsImV4cCI6MjA5MDI1MzkxOH0.QQujBpy6G4efxn5nqsHiSF99bqsxsolqLSPc5VkTYbk';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});