import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Image, TextInput, RefreshControl, FlatList, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

const NAV = '#1a237e';
const GOLD = '#f5c518';
const BG = '#f0f2f8';

export default function ProductsScreen() {
  const [products, setProducts] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [categories, setCategories] = useState<string[]>(['All']);

  useEffect(() => {
    fetchProducts();

    const channel = supabase
      .channel('inventory-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setProducts(prev => [...prev, payload.new as any]);
          } else if (payload.eventType === 'UPDATE') {
            setProducts(prev => prev.map(p => p.id === (payload.new as any).id ? payload.new as any : p));
          } else if (payload.eventType === 'DELETE') {
            setProducts(prev => prev.filter(p => p.id !== (payload.old as any).id));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => { filterProducts(); }, [search, selectedCategory, products]);

  useEffect(() => {
    const cats = ['All', ...new Set(products.map((p: any) => p.category))] as string[];
    setCategories(cats);
  }, [products]);

  const fetchProducts = async () => {
    const { data, error } = await (supabase as any)
      .from('inventory').select('*').order('name', { ascending: true });
    if (!error && data) setProducts(data);
    setIsLoading(false);
    setRefreshing(false);
  };

  const filterProducts = () => {
    let result = products;
    if (selectedCategory !== 'All') result = result.filter(p => p.category === selectedCategory);
    if (search) result = result.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    setFiltered(result);
  };

  const onRefresh = () => { setRefreshing(true); fetchProducts(); };

  const getStockStatus = (stock: number) => {
    if (stock === 0) return { label: 'Out of Stock', color: '#c0392b', bg: '#fdecea' };
    if (stock <= 5)  return { label: 'Low Stock',    color: '#e65100', bg: '#fff3e0' };
    return               { label: 'In Stock',       color: '#2e7d32', bg: '#e8f5e9' };
  };

  const renderProduct = ({ item }: { item: any }) => {
    const status = getStockStatus(item.stock);
    return (
      <View style={styles.productCard}>
        {item.image_key ? (
          <Image source={{ uri: item.image_key }} style={styles.productImage} resizeMode="cover" />
        ) : (
          <View style={styles.productImagePlaceholder}>
            <Ionicons name="bag" size={36} color="#c8d0e4" />
          </View>
        )}
        {/* Stock badge overlaid on image */}
        <View style={[styles.stockBadge, { backgroundColor: status.bg }]}>
          <Text style={[styles.stockBadgeText, { color: status.color }]}>{status.label}</Text>
        </View>
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
          <Text style={styles.productCategory}>{item.category}</Text>
          <View style={styles.stockRow}>
            <Ionicons name="cube-outline" size={11} color="#8a97b0" />
            <Text style={styles.stockCount}>{item.stock} {item.stock === 1 ? 'pc' : 'pcs'} available</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <View style={styles.crownBox}>
            <Ionicons name="trophy" size={18} color={GOLD} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Products</Text>
            <Text style={styles.headerSub}>AVAILABLE PET SUPPLIES</Text>
          </View>
        </View>
      </View>

      {/* ── Search ── */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color="#8a97b0" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search products…"
          placeholderTextColor="#bcc5d8"
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color="#8a97b0" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* ── Categories ── */}
      <View style={styles.catsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catsContent}>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.catChip, selectedCategory === cat && styles.catChipActive]}
              onPress={() => setSelectedCategory(cat)}
              activeOpacity={0.8}
            >
              <Text style={[styles.catText, selectedCategory === cat && styles.catTextActive]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── Products ── */}
      {isLoading ? (
        <ActivityIndicator size="large" color={NAV} style={{ marginTop: 48 }} />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="bag-outline" size={32} color={GOLD} />
          </View>
          <Text style={styles.emptyTitle}>No Products Found</Text>
          <Text style={styles.emptyText}>Try a different search or category</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderProduct}
          keyExtractor={(item) => item.id.toString()}
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.columnWrap}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={NAV} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  /* ── Header ── */
  header: {
    backgroundColor: NAV,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14,
  },
  headerBrand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  crownBox: {
    width: 36, height: 36, borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: -0.2, lineHeight: 18 },
  headerSub: { color: 'rgba(255,255,255,0.35)', fontSize: 8.5, fontWeight: '600', letterSpacing: 1.2, marginTop: 1 },

  /* ── Search ── */
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', marginHorizontal: 14, marginTop: 12,
    borderRadius: 10, borderWidth: 1.5, borderColor: '#dde3ef',
    paddingHorizontal: 13, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: NAV },

  /* ── Categories ── */
  catsWrap: { marginTop: 10, marginBottom: 2 },
  catsContent: { paddingHorizontal: 14, gap: 7 },
  catChip: {
    borderWidth: 1.5, borderColor: '#dde3ef',
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: '#fff',
  },
  catChipActive: { backgroundColor: NAV, borderColor: NAV },
  catText: { fontSize: 12.5, color: '#4a5568', fontWeight: '500' },
  catTextActive: { color: '#fff', fontWeight: '700' },

  /* ── Empty ── */
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: NAV, alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: NAV, letterSpacing: -0.2 },
  emptyText: { fontSize: 13, color: '#8a97b0' },

  /* ── Grid ── */
  grid: { padding: 14, paddingBottom: 24 },
  columnWrap: { justifyContent: 'space-between', marginBottom: 11 },

  /* ── Product Card ── */
  productCard: {
    backgroundColor: '#fff', borderRadius: 12,
    width: '48%', overflow: 'hidden',
    shadowColor: NAV, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 6, elevation: 3,
    position: 'relative',
  },
  productImage: { width: '100%', height: 130 },
  productImagePlaceholder: {
    width: '100%', height: 130,
    backgroundColor: '#eef1f8',
    alignItems: 'center', justifyContent: 'center',
  },
  stockBadge: {
    position: 'absolute', top: 8, right: 8,
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
  },
  stockBadgeText: { fontSize: 9, fontWeight: '700' },
  productInfo: { padding: 10 },
  productName: { fontSize: 12.5, fontWeight: '800', color: NAV, marginBottom: 3, lineHeight: 17 },
  productCategory: {
    fontSize: 10.5, color: '#8a97b0',
    fontWeight: '500', marginBottom: 5,
  },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stockCount: { fontSize: 10.5, color: '#8a97b0' },
});
