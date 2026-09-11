import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TEAL = '#0D9488';
const TEAL_LIGHT = '#CCFBF1';
const BORDER = '#E5E7EB';
const SUB = '#6B7280';
const INK = '#111827';
const BG = '#F4F7FB';

interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string | null;
  image_url: string | null;
}

export default function ProductsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const fetchProducts = async () => {
    setIsLoading(true);
    const { data, error } = await (supabase as any)
      .from('products')
      .select('*')
      .eq('is_available', true)
      .order('category', { ascending: true });
    if (!error) setProducts(data || []);
    setIsLoading(false);
  };

  useFocusEffect(useCallback(() => { fetchProducts(); }, []));

  const categories = [...new Set(products.map((p) => p.category))];

  const filtered = products.filter((p) => {
    const matchesSearch = !search.trim() || p.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !activeCategory || p.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const grouped = categories
    .map((cat) => ({ category: cat, items: filtered.filter((p) => p.category === cat) }))
    .filter((g) => g.items.length > 0);

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={INK} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Pet Essentials</Text>
          <Text style={styles.headerSub}>Browse available products from the clinic</Text>
        </View>
      </View>

      {/* ── Search ── */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={SUB} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search products..."
          placeholderTextColor="#9CA3AF"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* ── Category filter chips ── */}
      {categories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
        >
          <TouchableOpacity
            style={[styles.categoryChip, !activeCategory && styles.categoryChipActive]}
            onPress={() => setActiveCategory(null)}
            activeOpacity={0.8}
          >
            <Text style={[styles.categoryChipText, !activeCategory && styles.categoryChipTextActive]}>All</Text>
          </TouchableOpacity>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.categoryChip, activeCategory === cat && styles.categoryChipActive]}
              onPress={() => setActiveCategory(activeCategory === cat ? null : cat)}
              activeOpacity={0.8}
            >
              <Text style={[styles.categoryChipText, activeCategory === cat && styles.categoryChipTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {isLoading ? (
          <ActivityIndicator size="large" color={TEAL} style={{ marginTop: 48 }} />
        ) : grouped.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="bag-handle-outline" size={28} color="#fff" />
            </View>
            <Text style={styles.emptyTitle}>{search || activeCategory ? 'No products found' : 'No products yet'}</Text>
            <Text style={styles.emptyText}>
              {search || activeCategory ? 'Try a different search or category' : "Check back soon — the clinic hasn't added any products yet."}
            </Text>
          </View>
        ) : (
          grouped.map(({ category, items }) => (
            <View key={category} style={styles.categorySection}>
              <Text style={styles.categoryTitle}>{category}</Text>
              <View style={styles.productGrid}>
                {items.map((p) => (
                  <View key={p.id} style={styles.productCard}>
                    <View style={styles.productImageWrap}>
                      {p.image_url ? (
                        <Image source={{ uri: p.image_url }} style={styles.productImage} />
                      ) : (
                        <View style={styles.productImageFallback}>
                          <Ionicons name="bag-handle-outline" size={26} color={TEAL} />
                        </View>
                      )}
                    </View>
                    <Text style={styles.productName} numberOfLines={2}>{p.name}</Text>
                    <Text style={styles.productPrice}>₱{p.price.toLocaleString()}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: BG, paddingHorizontal: 16, paddingBottom: 12,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  headerTitle: { fontSize: 21, fontWeight: '800', color: INK, letterSpacing: -0.3 },
  headerSub: { fontSize: 12, color: SUB, marginTop: 3 },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 24, paddingHorizontal: 14, paddingVertical: 11,
    marginHorizontal: 16, marginBottom: 12,
    borderWidth: 1, borderColor: BORDER,
  },
  searchInput: { flex: 1, fontSize: 13.5, color: INK },

  categoryRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 12 },
  categoryChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER,
  },
  categoryChipActive: { backgroundColor: TEAL, borderColor: TEAL },
  categoryChipText: { fontSize: 12.5, fontWeight: '600', color: SUB },
  categoryChipTextActive: { color: '#fff', fontWeight: '700' },

  scrollContent: { paddingHorizontal: 16 },

  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIconWrap: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: INK },
  emptyText: { fontSize: 13, color: SUB, textAlign: 'center', lineHeight: 19, paddingHorizontal: 20 },

  categorySection: { marginBottom: 22 },
  categoryTitle: { fontSize: 15, fontWeight: '800', color: INK, marginBottom: 10 },

  productGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  productCard: {
    width: '47%',
    backgroundColor: '#fff', borderRadius: 14, padding: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 5, elevation: 1,
  },
  productImageWrap: {
    width: '100%', aspectRatio: 1, borderRadius: 10, overflow: 'hidden',
    backgroundColor: BG, marginBottom: 8,
  },
  productImage: { width: '100%', height: '100%' },
  productImageFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  productName: { fontSize: 12.5, fontWeight: '700', color: INK, marginBottom: 4, lineHeight: 16, minHeight: 32 },
  productPrice: { fontSize: 14, fontWeight: '800', color: TEAL },
});