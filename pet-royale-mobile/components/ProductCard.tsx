import { View, Text, Image, TouchableOpacity, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { ShoppingBag } from 'lucide-react-native';
import { colors, text, fonts, space, radius, status, sz, common } from '../constants/theme';
import { Skeleton } from './Skeleton';
import { pesoWhole } from '../lib/format';

/* The one product card, used by Shop (a grid) and Home (a strip), so a
   product looks the same wherever it shows up.

   Stock is shown as a plain word, not a count: customers only need to
   know whether they can get it. The exact number stays with the clinic.
   A product with no stock figure at all shows nothing. */

/** At or below this many units a product reads "Low stock". */
export const LOW_STOCK_THRESHOLD = 5;

/** Height of the photo area in the compact (Home) card. */
const COMPACT_IMAGE_HEIGHT = 84;

/** Width over height of the photo area in the Shop card (was square). */
const SHOP_IMAGE_RATIO = 1.3;

export interface ProductCardData {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  stock: number | null;
}

/* The stock figure is the clinic's own count, so what shows here is what
   the clinic has on the shelf. `label` is for the Shop card's pill and
   for screen readers; `short` is the few characters that fit beside the
   price on the compact Home card. */
export function stockInfo(stock: number | null | undefined) {
  if (stock == null) return null;
  if (stock <= 0) {
    return { label: 'Out of stock', short: 'Sold out', tone: status.danger, healthy: false };
  }
  if (stock <= LOW_STOCK_THRESHOLD) {
    return { label: `Only ${stock} left`, short: `${stock} left`, tone: status.warning, healthy: false };
  }
  return { label: `${stock} in stock`, short: `${stock} left`, tone: status.success, healthy: true };
}

export function ProductCard({
  product,
  onPress,
  style,
  hideHealthyStock = false,
  compact = false,
}: {
  product: ProductCardData;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Kept for existing callers; the compact card now shows the count beside the price instead. */
  hideHealthyStock?: boolean;
  /** Home strip: flat card, short photo, price and stock count on one line. */
  compact?: boolean;
}) {
  const info = stockInfo(product.stock);
  // The compact card puts the count on the price line, so it never adds a pill row.
  const showPill = info && !compact && !(hideHealthyStock && info.healthy);

  return (
    <TouchableOpacity
      style={[styles.card, compact && styles.cardCompact, style]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.85 : 1}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${product.name}, ${pesoWhole(product.price)}${info ? `, ${info.label}` : ''}`}
    >
      <View style={[styles.imageWrap, compact ? styles.imageWrapCompact : styles.imageWrapSquare]}>
        {product.image_url ? (
          <Image
            source={{ uri: product.image_url }}
            style={styles.image}
            resizeMode="contain"
          />
        ) : (
          <ShoppingBag size={sz(22)} color={colors.mutedFg} strokeWidth={1.8} />
        )}
      </View>
      <Text style={[styles.name, compact && styles.nameCompact]} numberOfLines={2}>{product.name}</Text>
      <Text style={[styles.price, compact && styles.priceCompact]} numberOfLines={1}>
        {pesoWhole(product.price)}
        {compact && info ? (
          <Text style={{ color: info.healthy ? colors.mutedFg : info.tone.fg }}>
            {` · ${info.short}`}
          </Text>
        ) : null}
      </Text>
      {showPill && info && (
        <View style={[styles.pill, { backgroundColor: info.tone.bg }]}>
          <Text style={[styles.pillText, { color: info.tone.fg }]} numberOfLines={1}>
            {info.label}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

/* Loading placeholder with the same shape, so nothing jumps. */
export function ProductCardSkeleton({ style, compact = false }: { style?: StyleProp<ViewStyle>; compact?: boolean }) {
  return (
    <View style={[styles.card, compact && styles.cardCompact, style]}>
      <Skeleton
        width="100%"
        radius={radius.md}
        style={compact ? { height: sz(COMPACT_IMAGE_HEIGHT), marginBottom: space.sm } : { aspectRatio: SHOP_IMAGE_RATIO, marginBottom: space.sm }}
      />
      <View style={{ minHeight: sz(compact ? 38 : 36), gap: 5 }}>
        <Skeleton width="85%" height={13} />
        <Skeleton width="60%" height={13} />
      </View>
      <Skeleton width="40%" height={compact ? 12 : 15} style={{ marginTop: compact ? 4 : 2 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  /* Same card as Profile's tiles (radius, border, shadow) so a product
     reads as part of the same product. Padding is tighter than the
     default because the card sits in a two-column grid. */
  card: {
    ...common.card,
    padding: space.md,
  },
  /* Home strip: flat (no shadow), 1.5 border, 14 padding. */
  cardCompact: {
    borderWidth: 1.5,
    padding: 14,
    shadowOpacity: 0,
    elevation: 0,
  },
  imageWrap: {
    width: '100%',
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  imageWrapSquare: { aspectRatio: SHOP_IMAGE_RATIO },
  imageWrapCompact: { height: sz(COMPACT_IMAGE_HEIGHT) },
  image: { width: '100%', height: '100%' },
  name: {
    ...text.smallBold,
    fontSize: sz(13),
    lineHeight: sz(18),
    color: colors.foreground,
    minHeight: sz(36), // always two lines tall, so cards in a row line up
  },
  nameCompact: {
    fontSize: sz(14),
    lineHeight: sz(19),
    minHeight: sz(38),
  },
  price: {
    ...text.bodyBold,
    fontSize: sz(15),
    lineHeight: sz(20),
    color: colors.primary,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  priceCompact: {
    ...text.caption,
    color: colors.mutedFg,
    marginTop: 4,
  },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: space.xs + 2,
  },
  pillText: { fontFamily: fonts.bodyBold, fontSize: sz(11) },
});
