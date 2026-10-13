import { useState, useCallback, useRef, useEffect, useDeferredValue } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  RefreshControl, Animated, useWindowDimensions,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, ShoppingBag, AlertCircle } from 'lucide-react-native';
import { colors, text, fonts, space, radius, common, hitSlop, status } from '../../constants/theme';
import { TAB_BAR_CLEARANCE } from './_layout';
import FloatField from '../../components/FloatField';
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

/* Two columns on phones, three on small tablets, four on large ones.
   The card width comes from the real screen width, so the grid fills
   the row on any device. */
function useGridLayout() {
  const { width } = useWindowDimensions();
  const cols = width >= 900 ? 4 : width >= 600 ? 3 : 2;
  const cardWidth = Math.floor((width - space.xxl * 2 - space.md * (cols - 1)) / cols);
  return { cardWidth };
}

export default function ProductsScreen() {
  const insets = useSafeAreaInsets();
  const { cardWidth } = useGridLayout();

  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<TextInput>(null);
  // The field updates instantly; the list filters a beat later, so typing
  // never waits on re-rendering the product grid.
  const deferredSearch = useDeferredValue(search);
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

  const query = deferredSearch.trim().toLowerCase();
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
      <View style={[styles.header, { paddingTop: insets.top + space.xs }]}>
        <Text style={styles.title} accessibilityRole="header">Pet Essentials</Text>
        <Text style={styles.headerSub}>
          {resultCountLabel || 'Browse available products from the clinic'}
        </Text>
      </View>

      {/* ── Search ── floating-label field, same as sign-in */}
      <View style={styles.searchWrap}>
        <FloatField
          label="Search products"
          value={search}
          focused={searchFocused}
          inputRef={searchRef}
          onChangeText={setSearch}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          autoCorrect={false}
          returnKeyType="search"
          right={
            search.length > 0 ? (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => setSearch('')}
                hitSlop={hitSlop}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <X size={20} color={colors.mutedFg} strokeWidth={2} />
              </TouchableOpacity>
            ) : undefined
          }
        />
      </View>

      {/* ── Category tabs ── segmented pill like the sign-in toggle.
             The outer View keeps the row at the height of its chips
             (flexGrow/flexShrink 0), since a horizontal ScrollView
             otherwise stretches or gets squeezed beside the product list.
             keyboardShouldPersistTaps lets the first tap select a tab
             instead of only dismissing the keyboard. */}
      {isLoading ? (
        <View style={[styles.segment, styles.segmentRow]}>
          <Skeleton width={56} height={44} radius={radius.pill} />
          <Skeleton width={112} height={44} radius={radius.pill} />
          <Skeleton width={96} height={44} radius={radius.pill} />
        </View>
      ) : categories.length > 0 && (
        <View style={styles.segment}>
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.segmentRow}
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
        </View>
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
          <ProductGridSkeleton cardWidth={cardWidth} />
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
                    <ProductCard key={p.id} product={p} style={{ width: cardWidth }} />
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

  /* Same side margin (space.xxl) and title style as Profile. */
  header: {
    paddingHorizontal: space.xxl,
    paddingBottom: space.md,
  },
  title: { ...text.screenTitle, color: colors.foreground },
  headerSub: { ...text.caption, color: colors.mutedFg, marginTop: 3 },

  /* The shared FloatField draws its own box, so this is only spacing. */
  searchWrap: { marginHorizontal: space.xxl, marginBottom: space.md },
  clearBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },

  /* Segmented pill, like the Sign in / Create account toggle.
     flexShrink: 0 stops the vertical ScrollView beside it from
     squeezing the row and clipping the tabs. */
  segment: {
    flexGrow: 0, flexShrink: 0,
    marginHorizontal: space.xxl, marginBottom: space.lg,
    backgroundColor: colors.card, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.cardBorder,
    padding: 4, overflow: 'hidden',
  },
  segmentRow: { flexDirection: 'row', flexWrap: 'nowrap', gap: 4 },

  productList: { flex: 1 },

  categoryChip: {
    flexShrink: 0, flexGrow: 0,
    minHeight: 44, justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: 'transparent',
  },
  categoryChipActive: { backgroundColor: colors.primary },
  // Swap text.smallBold for the exact text style the Add Pet chips use,
  // so the tab font size matches.
  categoryChipText: { ...text.smallBold, color: colors.mutedFg },
  categoryChipTextActive: { color: colors.primaryFg },

  loadErrorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: status.danger.bg, borderRadius: radius.sm, padding: space.md,
    marginHorizontal: space.xxl, marginBottom: space.md,
  },
  loadErrorText: { flex: 1, fontSize: 12.5, color: status.danger.fg, fontFamily: fonts.body },
  loadErrorRetry: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: status.danger.fg, textDecorationLine: 'underline' },

  scrollContent: { paddingHorizontal: space.xxl },

  empty: { alignItems: 'center', paddingTop: 60, gap: space.sm },
  emptyIconWrap: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { ...text.heading, color: colors.foreground },
  emptyText: { ...text.small, color: colors.mutedFg, textAlign: 'center', paddingHorizontal: space.xl },

  categorySection: { marginBottom: space.xxl },
  categoryTitle: { ...text.section, color: colors.foreground, marginBottom: space.md },

  // Cards have a fixed width worked out from the screen, with a gap
  // between them, so a last row with fewer cards stays on the left.
  productGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: space.md,
  },
});

/* ── Loading state ──
   Same grid as the real list, so the page doesn't jump when the
   products arrive. */
function ProductGridSkeleton({ cardWidth }: { cardWidth: number }) {
  return (
    <View accessibilityLabel="Loading products" accessibilityLiveRegion="polite">
      <Skeleton width={130} height={18} style={{ marginBottom: space.md }} />
      <View style={styles.productGrid}>
        {[0, 1, 2, 3].map((i) => (
          <ProductCardSkeleton key={i} style={{ width: cardWidth }} />
        ))}
      </View>
    </View>
  );
}
