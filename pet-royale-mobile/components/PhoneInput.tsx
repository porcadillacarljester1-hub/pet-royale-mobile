import { useMemo, useState, type Ref } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, Search, X, Check } from 'lucide-react-native';
import { colors, text, space, radius, hitSlop, common, sz } from '../constants/theme';
import {
  COUNTRIES,
  getCountry,
  flagOf,
  maxNationalLength,
  sanitizeNational,
} from '../lib/phone';

type Props = {
  iso: string;
  national: string;
  onChangeIso: (iso: string) => void;
  onChangeNational: (digits: string) => void;
  /** 'pill' = the register screen's rounded field; 'field' = the white form field. */
  variant?: 'pill' | 'field';
  error?: boolean;
  inputRef?: Ref<TextInput>;
  onFocus?: () => void;
  onBlur?: () => void;
  onSubmitEditing?: () => void;
  editable?: boolean;
};

/**
 * Country code + mobile number in one field. The country button opens a
 * searchable sheet. Shared by the register and Personal information
 * screens so the picker and its sanitising live in one place.
 */
export function PhoneInput({
  iso,
  national,
  onChangeIso,
  onChangeNational,
  variant = 'pill',
  error = false,
  inputRef,
  onFocus,
  onBlur,
  onSubmitEditing,
  editable = true,
}: Props) {
  const insets = useSafeAreaInsets();
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const country = getCountry(iso);
  const isPill = variant === 'pill';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^\+/, '');
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.dial.startsWith(q));
  }, [query]);

  const openSheet = () => {
    setQuery('');
    setOpen(true);
  };

  const choose = (nextIso: string) => {
    onChangeIso(nextIso);
    onChangeNational(national.slice(0, maxNationalLength(nextIso)));
    setOpen(false);
  };

  return (
    <>
      <View
        style={[
          styles.box,
          isPill ? styles.boxPill : styles.boxField,
          focused && (isPill ? styles.boxPillFocused : styles.boxFieldFocused),
          error && styles.boxError,
        ]}
      >
        <TouchableOpacity
          style={styles.countryBtn}
          onPress={openSheet}
          disabled={!editable}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Country code, ${country.name} plus ${country.dial}. Tap to change.`}
        >
          <Text style={styles.flag}>{flagOf(country.iso)}</Text>
          <Text style={styles.dial}>+{country.dial}</Text>
          <ChevronDown size={sz(16)} color={colors.mutedFg} />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TextInput
          ref={inputRef}
          style={styles.input}
          value={national}
          onChangeText={(v) => onChangeNational(sanitizeNational(v, iso))}
          onFocus={() => {
            setFocused(true);
            onFocus?.();
          }}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          placeholder={iso === 'PH' ? '9XX XXX XXXX' : 'Mobile number'}
          placeholderTextColor={colors.mutedFg}
          keyboardType="phone-pad"
          autoComplete="tel-national"
          returnKeyType="next"
          onSubmitEditing={onSubmitEditing}
          editable={editable}
        />
      </View>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
            accessibilityLabel="Close country list"
          />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select country</Text>
              <TouchableOpacity
                onPress={() => setOpen(false)}
                hitSlop={hitSlop}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={sz(22)} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchWrap}>
              <Search size={sz(16)} color={colors.mutedFg} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search country or code"
                placeholderTextColor={colors.mutedFg}
                autoCorrect={false}
              />
            </View>

            <FlatList
              data={filtered}
              keyExtractor={(c) => c.iso}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={common.divider} />}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No country matches “{query}”.</Text>
              }
              renderItem={({ item }) => {
                const selected = item.iso === iso;
                return (
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => choose(item.iso)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text style={styles.rowFlag}>{flagOf(item.iso)}</Text>
                    <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.rowDial}>+{item.dial}</Text>
                    {selected && <Check size={sz(16)} color={colors.primary} strokeWidth={3} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
  },
  boxPill: {
    height: sz(54),
    backgroundColor: colors.muted,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  boxPillFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.card,
  },
  boxField: {
    height: sz(52),
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.input,
  },
  boxFieldFocused: {
    borderColor: colors.primary,
  },
  boxError: {
    borderColor: colors.destructive,
  },

  countryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: '100%',
    paddingRight: space.md,
  },
  flag: { fontSize: sz(18) },
  dial: { ...text.body, color: colors.foreground },
  divider: {
    width: 1,
    height: sz(24),
    backgroundColor: colors.border,
    marginRight: space.md,
  },
  input: {
    flex: 1,
    ...text.body,
    color: colors.foreground,
    padding: 0,
  },

  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  sheet: {
    height: '75%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.xxl,
    paddingTop: space.xl,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.lg,
  },
  sheetTitle: { ...text.section, color: colors.foreground },
  searchWrap: {
    position: 'relative',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  searchIcon: { position: 'absolute', left: space.lg, zIndex: 1 },
  searchInput: {
    ...common.input,
    paddingLeft: 44,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: sz(52),
  },
  rowFlag: { fontSize: sz(22) },
  rowName: { ...text.body, color: colors.foreground, flex: 1 },
  rowDial: { ...text.small, color: colors.mutedFg },
  emptyText: {
    ...text.small,
    color: colors.mutedFg,
    textAlign: 'center',
    paddingVertical: space.xxl,
  },
});