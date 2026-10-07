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

   `large` is the Profile-style variant: the title in the top-left corner
   exactly where tab-screen titles sit, the back button at the right end
   of the same row, and no bottom line. It is opt-in, so every screen that
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
  /** Large title at the top-left like the Profile screen; the back
   *  button moves to the right end of that row. */
  large?: boolean;
}) {
  const insets = useSafeAreaInsets();

  const backButton = (
    <TouchableOpacity
      style={styles.backBtn}
      onPress={onBack}
      activeOpacity={0.7}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel="Go back"
    >
      <ChevronLeft size={sz(22)} color={colors.foreground} strokeWidth={2.2} />
    </TouchableOpacity>
  );

  if (large) {
    return (
      <View style={[styles.largeHeader, { paddingTop: insets.top + space.xs }]}>
        <Text style={styles.largeTitle} numberOfLines={2} accessibilityRole="header">
          {title}
        </Text>
        {right ? <View style={styles.side}>{right}</View> : null}
        <View style={styles.largeBack}>{backButton}</View>
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
      {backButton}

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

  largeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingBottom: space.md,
  },
  /* The title takes the top-left spot, right under the status bar, where
     "Profile" sits on the tab screens. */
  largeTitle: {
    ...text.screenTitle,
    flex: 1,
    color: colors.foreground,
  },
  /* Pulled up so the button's centre lines up with the title's. */
  largeBack: { marginTop: -space.xs },
});
