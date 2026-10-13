import type { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { colors, text, space, radius, hitSlop, sz } from '../constants/theme';

/* The one header for every sub-screen: back button on the left, centred
   title, and an optional action on the right.

   Tab-root screens (Home, Profile, Visits, Book, Shop) keep their large
   serif titles and don't use this.

   The left and right slots are the same width so the title stays truly
   centred. The right slot is empty (invisible) unless you pass `right`.

   `large` is the Profile-style variant: a large title at the top of the
   screen, exactly where tab-screen titles sit, with the back chevron at
   the left of the same row (no circle behind it), an optional action at
   the right end, and no bottom line. It is opt-in, so every screen that
   doesn't pass it looks exactly as before. */

const SIDE = 44;

export function ScreenHeader({
  title,
  onBack,
  right,
  bordered = true,
  large = false,
}: {
  title: string;
  onBack: () => void;
  right?: ReactNode;
  /** Set false when something (like a tab row) sits directly under the
   *  header and draws its own bottom line. Ignored when `large`. */
  bordered?: boolean;
  /** Large title at the top like the Profile screen; the back chevron
   *  sits at the left of that row, with no circle behind it. */
  large?: boolean;
}) {
  const insets = useSafeAreaInsets();

  const backButton = (plain: boolean) => (
    <TouchableOpacity
      style={[styles.backBtn, plain && styles.backBtnPlain]}
      onPress={onBack}
      activeOpacity={0.7}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel="Go back"
    >
      <ChevronLeft size={sz(plain ? 26 : 22)} color={colors.foreground} strokeWidth={2.2} />
    </TouchableOpacity>
  );

  if (large) {
    return (
      <View style={[styles.largeHeader, { paddingTop: insets.top + space.xs }]}>
        {backButton(true)}
        <Text style={styles.largeTitle} numberOfLines={2} accessibilityRole="header">
          {title}
        </Text>
        {right ? <View style={styles.side}>{right}</View> : null}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.header,
        { paddingTop: insets.top + space.md },
        !bordered && styles.headerBorderless,
      ]}
    >
      {backButton(false)}

      <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>

      <View style={styles.side}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.xl,
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerBorderless: { borderBottomWidth: 0 },
  backBtn: {
    width: SIDE,
    height: SIDE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.muted,
  },
  /* Large header: just the chevron, no circle. The 44pt box stays for
     the touch target. */
  backBtnPlain: { backgroundColor: 'transparent' },
  title: {
    ...text.heading,
    flex: 1,
    textAlign: 'center',
    color: colors.foreground,
    paddingHorizontal: space.sm,
  },
  side: {
    width: SIDE,
    height: SIDE,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },

  /* Chevron at the left, title beside it. Less padding on the left so
     the chevron's own 11pt of inner space still lines up with the
     screen's side margin. */
  largeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingLeft: space.sm,
    paddingRight: space.xl,
    paddingBottom: space.md,
  },
  largeTitle: {
    ...text.screenTitle,
    flex: 1,
    color: colors.foreground,
  },
});
