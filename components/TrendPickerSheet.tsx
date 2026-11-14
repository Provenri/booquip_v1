import { useEffect, useState } from 'react';
import { FlashList } from '@shopify/flash-list';
import { TrendingUp, X } from 'lucide-react-native';
import { Modal, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Pressable from '@/components/MotionPressable';
import { loadQuipTrendTopics, type QuipTrendTopic } from '@/lib/quipTrends';
import { colors, radii, spacing, type } from '@/constants/theme';

type TrendPickerSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (topic: QuipTrendTopic) => void;
};

export default function TrendPickerSheet({ visible, onClose, onSelect }: TrendPickerSheetProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isCompact = width < 700;
  const [trendTopics, setTrendTopics] = useState<QuipTrendTopic[]>([]);
  const [topicCountry, setTopicCountry] = useState<'ALL' | 'US' | 'UK'>('ALL');
  const [topicsStatus, setTopicsStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const visibleTopics = trendTopics
    .filter((topic) => topicCountry === 'ALL' || topic.countryCode === topicCountry);
  const displayedTopics = topicCountry === 'ALL'
    ? (['US', 'UK'] as const)
      .flatMap((country) => visibleTopics.filter((topic) => topic.countryCode === country).slice(0, 8))
      .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
    : visibleTopics.slice(0, 16);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setTopicCountry('ALL');
    setTopicsStatus('loading');
    void loadQuipTrendTopics()
      .then((topics) => {
        if (!active) return;
        setTrendTopics(topics);
        setTopicsStatus('ready');
      })
      .catch(() => {
        if (!active) return;
        setTrendTopics([]);
        setTopicsStatus('error');
      });
    return () => { active = false; };
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType={isCompact ? 'slide' : 'fade'} onRequestClose={onClose}>
      <View style={[styles.overlay, isCompact && styles.overlayMobile]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close trend picker" onPress={onClose} style={styles.backdrop} />
        <View accessibilityViewIsModal style={[styles.sheet, isCompact && styles.sheetMobile, isCompact && { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <View style={styles.header}>
            <View style={styles.headerIcon}><TrendingUp color={colors.brand} size={18} /></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close trend picker" onPress={onClose} style={styles.closeButton}>
              <X color={colors.secondary} size={18} />
            </Pressable>
          </View>

          <Text style={styles.eyebrow}>GOOGLE TRENDS</Text>
          <Text style={styles.title}>Choose a trend</Text>
          <Text style={styles.description}>Pick a trending topic to reply to. Related headlines are added to your reply context automatically.</Text>

          <View accessibilityRole="tablist" style={styles.countryFilter}>
            {(['ALL', 'US', 'UK'] as const).map((country) => (
              <Pressable
                key={country}
                accessibilityRole="tab"
                accessibilityState={{ selected: topicCountry === country }}
                onPress={() => setTopicCountry(country)}
                style={[styles.countryTab, topicCountry === country && styles.countryTabSelected]}
              >
                <Text style={[styles.countryTabLabel, topicCountry === country && styles.countryTabLabelSelected]}>
                  {country === 'ALL' ? 'All' : country}
                </Text>
              </Pressable>
            ))}
          </View>

          {topicsStatus === 'loading' ? (
            <Text style={styles.hint}>Loading recent topics…</Text>
          ) : topicsStatus === 'error' ? (
            <Text style={styles.hint}>Trend suggestions are unavailable right now. Close this and write the topic instead.</Text>
          ) : displayedTopics.length > 0 ? (
            <FlashList
              style={styles.topicScroll}
              contentContainerStyle={styles.topicList}
              data={displayedTopics}
              keyExtractor={(topic) => topic.id}
              renderItem={({ item: topic }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${topic.countryCode} trend: ${topic.topic}`}
                  onPress={() => onSelect(topic)}
                  style={({ pressed }) => [styles.topicCard, pressed && styles.pressed]}
                >
                  <View style={styles.topicRow}>
                    <Text style={styles.topicText}>{topic.topic}</Text>
                    <View style={styles.topicBadges}>
                      {topic.approxTraffic ? <Text style={styles.topicTraffic}>≈ {topic.approxTraffic}</Text> : null}
                      <Text style={styles.topicCountry}>{topic.countryCode}</Text>
                    </View>
                  </View>
                  {topic.summary ? <Text style={styles.topicSummary}>{topic.summary}</Text> : null}
                </Pressable>
              )}
              ListFooterComponent={<Text style={styles.topicAttribution}>Google Trends · recent searches</Text>}
            />
          ) : (
            <Text style={styles.hint}>No recent topics for this filter.</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, backgroundColor: 'rgba(24, 39, 33, 0.42)' },
  overlayMobile: { justifyContent: 'flex-end', paddingHorizontal: 0 },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { width: '100%', maxWidth: 520, maxHeight: '88%', borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.lg, shadowColor: colors.shadow, shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  sheetMobile: { maxWidth: '100%', maxHeight: '92%', marginTop: 'auto', padding: 20, paddingBottom: 28, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderTopLeftRadius: 26, borderTopRightRadius: 26 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  headerIcon: { width: 42, height: 42, borderRadius: radii.md, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  closeButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: colors.surfaceMuted },
  eyebrow: { color: colors.secondary, fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: colors.ink, fontSize: type.title, lineHeight: 34, fontWeight: '700', marginTop: 6 },
  description: { color: colors.secondary, fontSize: type.body, lineHeight: 21, marginTop: 7 },
  countryFilter: { flexDirection: 'row', alignSelf: 'flex-start', gap: spacing.xxs, padding: spacing.xxs, marginTop: 14, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.md, backgroundColor: colors.surfaceMuted },
  countryTab: { minWidth: 58, minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderRadius: 11 },
  countryTabSelected: { backgroundColor: colors.brandStrong },
  countryTabLabel: { color: colors.secondary, fontSize: 11, fontWeight: '700' },
  countryTabLabelSelected: { color: colors.brandContrast },
  hint: { color: colors.muted, fontSize: 10, marginTop: 10 },
  topicScroll: { marginTop: 10 },
  topicList: { gap: 8, paddingTop: 6, paddingBottom: 12 },
  topicCard: { minHeight: 66, justifyContent: 'center', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topicText: { flex: 1, color: colors.body, fontSize: type.body, lineHeight: 19, fontWeight: '700' },
  topicBadges: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  topicTraffic: { color: colors.muted, fontSize: 8, lineHeight: 12 },
  topicCountry: { minWidth: 27, color: colors.muted, fontSize: 8, fontWeight: '800', textAlign: 'center' },
  topicSummary: { color: colors.secondary, fontSize: type.footnote, lineHeight: 17, marginTop: 5 },
  topicAttribution: { color: colors.muted, fontSize: 10, marginTop: 8, textAlign: 'center' },
  pressed: { opacity: 0.85 },
});
