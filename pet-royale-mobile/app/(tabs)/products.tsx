import { useState, useCallback, useRef, useEffect, useDeferredValue } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  RefreshControl, Animated, useWindowDimensions, Keyboard, Platform,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Search, ShoppingBag, AlertCircle } from 'lucide-react-native';
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

/* Layout limits. Every width on this screen is worked out from the real
   window, so nothing is hard-coded to one phone size. */
const GUTTER = space.xxl;        // side margin of the whole screen
const GRID_GAP = space.md;       // gap between product cards
const MIN_CARD_WIDTH = 150;      // a card never gets narrower than this
const MAX_CONTENT_WIDTH = 1100;  // keeps tablets and landscape readable

/* True while the on-screen keyboard is up. The tab bar hides itself then
   (see _layout.tsx), so the list drops the space it keeps for the bar
   and doesn't leave a gap above the keyboard. */
function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return visible;
}

/* The column count and card width come from the usable width: the
   window minus the notch/rounded-corner insets, capped on very wide
   screens. Always at least two columns, at most four. Card width is
   floored so a row can never overflow by a rounding pixel. */
function useGridLayout() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sideInset = Math.max(insets.left, insets.right);
  const innerWidth = Math.min(width - sideInset * 2, MAX_CONTENT_WIDTH);
  const available = innerWidth - GUTTER * 2;
  const cols = Math.min(4, Math.max(2, Math.floor((available + GRID_GAP) / (MIN_CARD_WIDTH + GRID_GAP))));
  const cardWidth = Math.floor((available - GRID_GAP * (cols - 1)) / cols);
  return { cols, cardWidth, sideInset };
}

export default function ProductsScreen() {
  const insets = useSafeAreaInsets();
  const { cols, cardWidth, sideInset } = useGridLayout();
  const keyboardVisible = useKeyboardVisible();

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
    <View style={[styles.container, { paddingLeft: sideInset, paddingRight: sideInset }]}>
      <View style={styles.inner}>
        {/* ── Header ── Shop is a tab, so it's headed like the other tabs
            (Visits, Profile): a large title and no back button. */}
        <View style={[styles.header, { paddingTop: insets.top + space.xs }]}>
          <Text style={styles.title} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit>
            Pet Essentials
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {resultCountLabel || 'Browse available products from the clinic'}
          </Text>
        </View>

        {/* ── Search ── a plain search bar: icon, placeholder, clear button.
            Tapping anywhere on it focuses the input. */}
        <View style={styles.searchWrap}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => searchRef.current?.focus()}
            style={[styles.searchBar, searchFocused && styles.searchBarFocused]}
            accessible={false}
          >
            <Search size={20} color={searchFocused ? colors.primary : colors.mutedFg} strokeWidth={2} />
            <TextInput
              ref={searchRef}
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search products"
              placeholderTextColor={colors.mutedFg}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              accessibilityLabel="Search products"
            />
            {search.length > 0 && (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => setSearch('')}
                hitSlop={hitSlop}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <X size={18} color={colors.mutedFg} strokeWidth={2} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Category chips ── a row of separate pills that scrolls
               sideways and bleeds to the screen edges, so any number of
               categories fits any width. The wrapper keeps the row at the
               height of its chips (flexGrow/flexShrink 0), since a
               horizontal ScrollView otherwise stretches or gets squeezed
               beside the product list. keyboardShouldPersistTaps lets the
               first tap select a chip instead of only dismissing the
               keyboard. */}
        {isLoading ? (
          <View style={styles.chipsWrap}>
            <View style={styles.chipsRow}>
              <Skeleton width={56} height={44} radius={radius.pill} />
              <Skeleton width={112} height={44} radius={radius.pill} />
              <Skeleton width={96} height={44} radius={radius.pill} />
            </View>
          </View>
        ) : categories.length > 0 && (
          <View style={styles.chipsWrap}>
            <ScrollView
              horizontal
              keyboardShouldPersistTaps="handled"
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
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
            <ProductGridSkeleton cardWidth={cardWidth} cols={cols} />
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
                  <View style={styles.sectionHeader}>
                    <Text style={styles.categoryTitle} numberOfLines={1}>{category}</Text>
                    <Text style={styles.sectionCount}>
                      {items.length} item{items.length === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <View style={styles.productGrid}>
                    {items.map((p) => (
                      <ProductCard key={p.id} product={p} style={{ width: cardWidth }} />
                    ))}
                  </View>
                </View>
              ))}
            </Animated.View>
          )}
          {/* Room for the tab bar, except while the keyboard is open: the
              bar is hidden then, so that room would be an empty gap. */}
          <View style={{ height: keyboardVisible ? space.lg : TAB_BAR_CLEARANCE }} />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { ...common.screen },

  /* Centers the content and caps its width on tablets / landscape. */
  inner: { flex: 1, width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },

  /* Same side margin (GUTTER = space.xxl) and title style as Profile. */
  header: {
    paddingHorizontal: GUTTER,
    paddingBottom: space.md,
  },
  title: { ...text.screenTitle, color: colors.foreground },
  headerSub: { ...text.caption, color: colors.mutedFg, marginTop: 3 },

  searchWrap: { marginHorizontal: GUTTER, marginBottom: space.md },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    minHeight: 52, paddingLeft: space.lg, paddingRight: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.cardBorder,
  },
  searchBarFocused: { borderColor: colors.primary, borderWidth: 1.5 },
  searchInput: {
    flex: 1, minWidth: 0,
    paddingVertical: 12,
    fontFamily: fonts.body, fontSize: 16,
    color: colors.foreground,
  },
  clearBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  /* Chip row. flexShrink: 0 stops the vertical ScrollView beside it from
     squeezing the row and clipping the chips. The row itself has the
     gutter as padding, so chips scroll under the screen edge. */
  chipsWrap: { flexGrow: 0, flexShrink: 0, marginBottom: space.lg },
  chipsRow: {
    flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center',
    gap: space.sm, paddingHorizontal: GUTTER,
  },

  productList: { flex: 1 },

  categoryChip: {
    flexShrink: 0, flexGrow: 0,
    minHeight: 44, justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.cardBorder,
  },
  categoryChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  // Swap text.smallBold for the exact text style the Add Pet chips use,
  // so the chip font size matches.
  categoryChipText: { ...text.smallBold, color: colors.foreground },
  categoryChipTextActive: { color: colors.primaryFg },

  loadErrorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: status.danger.bg, borderRadius: radius.sm, padding: space.md,
    marginHorizontal: GUTTER, marginBottom: space.md,
  },
  loadErrorText: { flex: 1, fontSize: 12.5, color: status.danger.fg, fontFamily: fonts.body },
  loadErrorRetry: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: status.danger.fg, textDecorationLine: 'underline' },

  scrollContent: { paddingHorizontal: GUTTER },

  empty: { alignItems: 'center', paddingTop: 60, gap: space.sm },
  emptyIconWrap: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { ...text.heading, color: colors.foreground },
  emptyText: { ...text.small, color: colors.mutedFg, textAlign: 'center', paddingHorizontal: space.xl },

  categorySection: { marginBottom: space.xxl },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    gap: space.md, marginBottom: space.md,
  },
  categoryTitle: { ...text.section, color: colors.foreground, flexShrink: 1 },
  sectionCount: { ...text.caption, color: colors.mutedFg, flexShrink: 0 },

  // Cards have a fixed width worked out from the screen, with a gap
  // between them, so a last row with fewer cards stays on the left.
  productGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP,
  },
});

/* ── Loading state ──
   Mirrors the real list: a section title row, then two rows of cards on
   the same grid, so nothing jumps when the products arrive. The card
   count follows the column count, so every screen size shows full rows. */
function ProductGridSkeleton({ cardWidth, cols }: { cardWidth: number; cols: number }) {
  return (
    <View accessibilityLabel="Loading products" accessibilityLiveRegion="polite">
      <View style={styles.sectionHeader}>
        <Skeleton width={130} height={20} />
        <Skeleton width={52} height={14} />
      </View>
      <View style={styles.productGrid}>
        {Array.from({ length: cols * 2 }, (_, i) => (
          <ProductCardSkeleton key={i} style={{ width: cardWidth }} />
        ))}
      </View>
    </View>
  );
}
