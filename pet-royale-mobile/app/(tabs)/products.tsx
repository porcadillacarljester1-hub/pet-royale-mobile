import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  RefreshControl, Animated,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, X, ShoppingBag, AlertCircle } from 'lucide-react-native';
import { colors, text, fonts, space, radius, common, hitSlop, status } from '../../constants/theme';
import { TAB_BAR_CLEARANCE } from './_layout';
import { Skeleton } from '../../components/Skeleton';
import { ProductCard, ProductCardSkeleton } from '../../components/ProductCard';
import { useRealtimeRefresh } from '../../lib/useRealtimeRefresh';

interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string | null;
  image_url: string | null;
  stock: number | null;
}

export default function ProductsScreen() {
  const insets = useSafeAreaInsets();

  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const [fadeContent] = useState(() => new Animated.Value(0));
  // Only the very first load shows the full-screen spinner. Refetches on
  // focus happen quietly, so returning to the screen doesn't wipe the
  // list or lose the scroll position.
  const hasLoaded = useRef(false);

  const fetchProducts = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else if (!hasLoaded.current) setIsLoading(true);
    setLoadError('');

    try {
      const { data, error: fetchError } = await (supabase as any)
        .from('products')
        .select('*')
        .eq('is_available', true)
        .order('category', { ascending: true });

      if (fetchError) { setLoadError('Could not load products. Pull down to try again.'); return; }
      setProducts(data || []);
    } catch {
      setLoadError('Could not load products. Pull down to try again.');
    } finally {
      hasLoaded.current = true;
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  // Refetch every time this screen regains focus — e.g. after a purchase
  // elsewhere updates stock — not just once on first mount.
  useFocusEffect(useCallback(() => { fetchProducts(); }, []));

  useRealtimeRefresh('products', () => fetchProducts());

  useEffect(() => {
    if (!isLoading) {
      Animated.timing(fadeContent, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    }
  }, [isLoading, fadeContent]);

  const categories = [...new Set(products.map((p) => p.category))];

  const query = search.trim().toLowerCase();
  const filtered = products.filter((p) => {
    const matchesSearch = !query || p.name.toLowerCase().includes(query);
    const matchesCategory = !activeCategory || p.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const grouped = categories
    .map((cat) => ({ category: cat, items: filtered.filter((p) => p.category === cat) }))
    .filter((g) => g.items.length > 0);

  const resultCountLabel = !isLoading && products.length > 0
    ? `${filtered.length} product${filtered.length === 1 ? '' : 's'} available`
    : '';

  const isFiltering = !!query || !!activeCategory;

  return (
    <View style={styles.container}>
      {/* ── Header ── Shop is a tab, so it's headed like the other tabs
          (Visits, Profile): a large title and no back button. */}
      <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
        <Text style={styles.title}>Pet Essentials</Text>
        <Text style={styles.headerSub}>
          {resultCountLabel || 'Browse available products from the clinic'}
        </Text>
      </View>

      {/* ── Search ── */}
      <View style={styles.searchWrap}>
        <Search size={16} color={colors.mutedFg} strokeWidth={2} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search products..."
          placeholderTextColor={colors.mutedFg}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearch('')}
            hitSlop={hitSlop}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <X size={16} color={colors.mutedFg} strokeWidth={2} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Category filter chips ──
             flexGrow: 0 keeps the row at the height of its chips. A
             horizontal ScrollView otherwise stretches to fill the column,
             which pushes the product list down the screen.
             keyboardShouldPersistTaps lets the first tap select a chip
             instead of only dismissing the keyboard. */}
      {isLoading ? (
        <View style={styles.categoryRow}>
          <Skeleton width={56} height={38} radius={radius.pill} />
          <Skeleton width={112} height={38} radius={radius.pill} />
          <Skeleton width={96} height={38} radius={radius.pill} />
        </View>
      ) : categories.length > 0 && (
        <ScrollView
          horizontal
          style={styles.categoryScroll}
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
        >
          <TouchableOpacity
            style={[styles.categoryChip, !activeCategory && styles.categoryChipActive]}
            onPress={() => setActiveCategory(null)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected: !activeCategory }}
            accessibilityLabel="All categories"
          >
            <Text style={[styles.categoryChipText, !activeCategory && styles.categoryChipTextActive]} numberOfLines={1}>All</Text>
          </TouchableOpacity>
          {categories.map((cat) => {
            const selected = activeCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.categoryChip, selected && styles.categoryChipActive]}
                onPress={() => setActiveCategory(selected ? null : cat)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={cat}
              >
                <Text style={[styles.categoryChipText, selected && styles.categoryChipTextActive]} numberOfLines={1}>{cat}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* ── Load error ── */}
      {loadError ? (
        <View style={styles.loadErrorBox} accessibilityLiveRegion="polite">
          <AlertCircle size={15} color={status.danger.fg} strokeWidth={2} />
          <Text style={styles.loadErrorText}>{loadError}</Text>
          <TouchableOpacity onPress={() => fetchProducts()} hitSlop={hitSlop} accessibilityRole="button">
            <Text style={styles.loadErrorRetry}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <ScrollView
        style={styles.productList}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchProducts(true)} tintColor={colors.primary} colors={[colors.primary]} />
        }
      >
        {isLoading ? (
          <ProductGridSkeleton />
        ) : grouped.length === 0 ? (
          !loadError && (
            <View style={styles.empty}>
              <View style={styles.emptyIconWrap}>
                <ShoppingBag size={26} color={colors.primaryFg} strokeWidth={2} />
              </View>
              <Text style={styles.emptyTitle}>{isFiltering ? 'No products found' : 'No products yet'}</Text>
              <Text style={styles.emptyText}>
                {isFiltering ? 'Try a different search or category.' : "Check back soon — the clinic hasn't added any products yet."}
              </Text>
            </View>
          )
        ) : (
          <Animated.View style={{ opacity: fadeContent }}>
            {grouped.map(({ category, items }) => (
              <View key={category} style={styles.categorySection}>
                <Text style={styles.categoryTitle}>{category}</Text>
                <View style={styles.productGrid}>
                  {items.map((p) => (
                    <ProductCard key={p.id} product={p} style={styles.gridCard} />
                  ))}
                </View>
              </View>
            ))}
          </Animated.View>
        )}
        <View style={{ height: TAB_BAR_CLEARANCE }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { ...common.screen },

  header: {
    paddingHorizontal: space.xl,
    paddingBottom: space.md,
  },
  title: { ...text.display, color: colors.foreground },
  headerSub: { ...text.caption, color: colors.mutedFg, marginTop: 3 },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    backgroundColor: colors.muted, borderRadius: radius.pill,
    paddingHorizontal: space.md, paddingVertical: space.sm + 2,
    marginHorizontal: space.xl, marginBottom: space.md,
  },
  searchInput: { flex: 1, ...text.small, color: colors.foreground, padding: 0 },

  // React Native's ScrollView defaults to flexShrink: 1, so with a tall
  // vertical ScrollView beside it the chip row gets squeezed and clips
  // its chips. flexShrink: 0 makes it keep the height of its content.
  categoryScroll: { flexGrow: 0, flexShrink: 0 },
  productList: { flex: 1 },
  categoryRow: {
    flexDirection: 'row', flexWrap: 'nowrap',
    paddingHorizontal: space.xl, gap: space.sm, paddingBottom: space.lg,
  },
  categoryChip: {
    flexShrink: 0, flexGrow: 0,
    paddingHorizontal: space.lg, paddingVertical: space.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
  },
  categoryChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  categoryChipText: { ...text.smallBold, color: colors.foreground },
  categoryChipTextActive: { color: colors.primaryFg },

  loadErrorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: status.danger.bg, borderRadius: radius.sm, padding: space.md,
    marginHorizontal: space.xl, marginBottom: space.md,
  },
  loadErrorText: { flex: 1, fontSize: 12.5, color: status.danger.fg, fontFamily: fonts.body },
  loadErrorRetry: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: status.danger.fg, textDecorationLine: 'underline' },

  scrollContent: { paddingHorizontal: space.xl },

  empty: { alignItems: 'center', paddingTop: 60, gap: space.sm },
  emptyIconWrap: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { ...text.heading, color: colors.foreground },
  emptyText: { ...text.small, color: colors.mutedFg, textAlign: 'center', paddingHorizontal: space.xl },

  categorySection: { marginBottom: space.xxl },
  categoryTitle: { ...text.section, color: colors.foreground, marginBottom: space.md },

  // Two columns, each 48% wide with space-between, so a last row with
  // one product stays on the left instead of stretching across.
  productGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-between', rowGap: space.md,
  },
  gridCard: { width: '48%' },
});

/* ── Loading state ──
   Same two-column grid as the real list, so the page doesn't jump when
   the products arrive. */
function ProductGridSkeleton() {
  return (
    <View accessibilityLabel="Loading products" accessibilityLiveRegion="polite">
      <Skeleton width={130} height={18} style={{ marginBottom: space.md }} />
      <View style={styles.productGrid}>
        {[0, 1, 2, 3].map((i) => (
          <ProductCardSkeleton key={i} style={styles.gridCard} />
        ))}
      </View>
    </View>
  );
}
