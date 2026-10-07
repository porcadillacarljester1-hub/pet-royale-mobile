import type { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, text, fonts, space, radius, sz } from '../constants/theme';

/* The one tab style for the app: filled pills with a small count badge.
   Used by Visits and Notifications.

   A count of 0 is hidden, so "Unread" doesn't carry a pointless 0.
   `trailing` is for an action on the right of the row, like
   "Mark all read". */

export function PillTabs<K extends string>({
  tabs,
  value,
  onChange,
  trailing,
}: {
  tabs: { key: K; label: string; count?: number }[];
  value: K;
  onChange: (key: K) => void;
  trailing?: ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.tabs} accessibilityRole="tablist">
        {tabs.map(({ key, label, count }) => {
          const on = value === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => onChange(key)}
              style={[styles.tab, on && styles.tabOn]}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={count ? `${label}, ${count}` : label}
            >
              <Text style={[styles.label, on && styles.labelOn]}>{label}</Text>
              {count ? (
                <View style={[styles.count, on && styles.countOn]}>
                  <Text style={[styles.countText, on && styles.countTextOn]}>{count}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  tabs: { flexDirection: 'row', gap: space.sm },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.muted,
  },
  tabOn: { backgroundColor: colors.primary },
  label: { ...text.smallBold, color: colors.mutedFg },
  labelOn: { color: colors.primaryFg },
  count: {
    minWidth: sz(20),
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  countOn: { backgroundColor: 'rgba(246, 245, 238, 0.24)' },
  countText: { ...text.caption, fontFamily: fonts.bodyBold, fontSize: sz(11), color: colors.mutedFg },
  countTextOn: { color: colors.primaryFg },
});
