import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { fetchPaymentHistory, type PaymentHistoryItem } from '@/lib/invoices';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TEAL = '#0D9488';
const TEAL_LIGHT = '#CCFBF1';
const BORDER = '#E5E7EB';
const SUB = '#6B7280';
const INK = '#111827';
const BG = '#F4F7FB';

export default function PaymentHistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [history, setHistory] = useState<PaymentHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadHistory = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIsLoading(false); return; }
    try {
      const data = await fetchPaymentHistory(user.id);
      setHistory(data);
    } catch {
      setHistory([]);
    }
    setIsLoading(false);
  };

  useFocusEffect(useCallback(() => { loadHistory(); }, []));

  const total = history.reduce((sum, h) => sum + h.total_amount, 0);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={INK} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment History</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {isLoading ? (
          <ActivityIndicator size="large" color={TEAL} style={{ marginTop: 48 }} />
        ) : history.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}><Ionicons name="receipt-outline" size={28} color="#fff" /></View>
            <Text style={styles.emptyTitle}>No Payments Yet</Text>
            <Text style={styles.emptyText}>Your paid invoices will show up here.</Text>
          </View>
        ) : (
          <>
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>Total Paid</Text>
              <Text style={styles.totalAmount}>₱{total.toLocaleString()}</Text>
            </View>

            {history.map((item) => (
              <View key={item.id} style={styles.row}>
                <View style={styles.rowIconWrap}>
                  <Ionicons name="checkmark-circle" size={18} color={TEAL} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{item.service}</Text>
                  <Text style={styles.rowSub}>
                    {item.pet_name}
                    {item.paid_at ? ` · ${new Date(item.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                  </Text>
                </View>
                <Text style={styles.rowAmount}>₱{item.total_amount.toLocaleString()}</Text>
              </View>
            ))}
          </>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 12, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: INK },
  scrollContent: { padding: 16 },

  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIconWrap: { width: 68, height: 68, borderRadius: 34, backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: INK },
  emptyText: { fontSize: 13, color: SUB, textAlign: 'center' },

  totalCard: {
    backgroundColor: TEAL_LIGHT, borderRadius: 16, padding: 16, marginBottom: 16, alignItems: 'center',
  },
  totalLabel: { fontSize: 12, fontWeight: '700', color: '#0F766E', marginBottom: 4 },
  totalAmount: { fontSize: 24, fontWeight: '800', color: TEAL },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 13, marginBottom: 9,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 5, elevation: 1,
  },
  rowIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: TEAL_LIGHT, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 13.5, fontWeight: '700', color: INK },
  rowSub: { fontSize: 11.5, color: SUB, marginTop: 2 },
  rowAmount: { fontSize: 14, fontWeight: '800', color: TEAL },
});