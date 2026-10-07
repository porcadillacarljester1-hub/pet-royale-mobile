import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  StatusBar,
  InteractionManager,
} from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, Clock, PawPrint } from 'lucide-react-native';
import { colors, text, space, radius, common, hitSlop } from '../constants/theme';
import { Skeleton } from '../components/Skeleton';
import { SERVICES } from '../constants/services';

export default function ServicesScreen() {
  /* useState with a lazy initializer keeps each Animated.Value stable
     across renders without reading a ref during render (which the
     React Compiler lint rule flags). */
  const [scrollY] = useState(() => new Animated.Value(0));
  const [fadeContent] = useState(() => new Animated.Value(0));

  /* The list is bundled with the app, so there is nothing to download.
     Rendering it is deferred until the screen's opening transition has
     finished, and the skeleton fills that moment. If the services ever
     move to Supabase, replace `ready` with that fetch's loading state
     and the rest stays as it is. */
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setReady(true));
    return () => task.cancel();
  }, []);

  useEffect(() => {
    if (ready) {
      Animated.timing(fadeContent, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    }
  }, [ready]);

  /* The header border only appears once you've scrolled, so the screen
     opens clean and gains structure as you move down it. */
  const headerBorder = scrollY.interpolate({
    inputRange: [0, 40],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <Animated.View style={[styles.header, { borderBottomWidth: headerBorder }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={17} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Services</Text>
        {/* Balances the back button so the title sits centred. */}
        <View style={styles.headerSpacer} />
      </Animated.View>

      <Animated.ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        {!ready ? (
          <ServicesSkeleton />
        ) : (
          <Animated.View style={{ opacity: fadeContent }}>
            {SERVICES.map(({ id, title, Icon, blurb, points, note }, i) => (
              <View
                key={id}
                style={[styles.service, i === SERVICES.length - 1 && styles.serviceLast]}
              >
                <View style={styles.serviceHead}>
                  <View style={styles.iconTile}>
                    <Icon size={19} color={colors.primary} strokeWidth={1.9} />
                  </View>
                  <Text style={styles.serviceTitle}>{title}</Text>
                </View>

                <View style={styles.body}>
                  <Text style={styles.blurb}>{blurb}</Text>

                  {points && points.length > 0 && (
                    <View style={styles.points}>
                      {points.map((line) => (
                        <View key={line} style={styles.pointRow}>
                          <View style={styles.pointDot} />
                          <Text style={styles.pointText}>{line}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {note && (
                  <View style={styles.noteRow}>
                    <Clock size={13} color={colors.mutedFg} />
                    <Text style={styles.noteText}>{note}</Text>
                  </View>
                )}
              </View>
            ))}

            <View style={styles.footMark}>
              <PawPrint size={14} color={colors.border} />
            </View>
          </Animated.View>
        )}
      </Animated.ScrollView>
    </View>
  );
}

/* ── Loading state ──
   Same rows as the real list (icon tile and title, a two-line blurb, a
   couple of short points), so nothing jumps when the content appears. */
function ServicesSkeleton() {
  return (
    <View accessibilityLabel="Loading services" accessibilityLiveRegion="polite">
      {[0, 1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={[styles.service, i === 4 && styles.serviceLast]}
        >
          <View style={styles.serviceHead}>
            <Skeleton width={38} height={38} radius={radius.md} />
            <Skeleton width="55%" height={18} />
          </View>
          <View style={styles.body}>
            <Skeleton width="100%" height={13} />
            <Skeleton width="80%" height={13} style={{ marginTop: 6 }} />
            <Skeleton width="60%" height={13} style={{ marginTop: space.lg }} />
            <Skeleton width="50%" height={13} style={{ marginTop: space.md }} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { ...common.screen },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingTop: space.xxl,
    paddingBottom: space.md,
    backgroundColor: colors.background,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  headerTitle: {
    ...text.heading,
    color: colors.foreground,
  },
  headerSpacer: { width: 40 },

  scroll: {
    paddingTop: space.md,
    paddingBottom: space.xxxl * 2,
  },

  service: {
    marginHorizontal: space.xxl,
    paddingVertical: space.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  serviceLast: {
    borderBottomWidth: 0,
  },
  serviceHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  iconTile: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceTitle: {
    fontFamily: text.display.fontFamily,
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: -0.6,
    color: colors.foreground,
    flex: 1,
  },

  /* Indented to line up under the title, not the icon tile. */
  body: {
    marginTop: space.lg,
    marginLeft: 38 + space.md,
  },
  blurb: {
    ...text.small,
    color: colors.foreground,
  },
  points: {
    marginTop: space.lg,
    gap: space.sm,
  },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
  },
  pointDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
    marginTop: 8,
  },
  pointText: {
    ...text.small,
    color: colors.mutedFg,
    flex: 1,
  },

  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    marginTop: space.xl,
    paddingTop: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  noteText: {
    ...text.caption,
    color: colors.mutedFg,
    flex: 1,
  },

  footMark: {
    alignItems: 'center',
    marginTop: space.xxxl,
  },
});
