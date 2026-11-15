import { useEffect, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { ArrowRight, Camera, Check, ChevronDown, ChevronUp, Copy, MessageCircle, PenLine, Sparkles, TrendingUp } from 'lucide-react-native';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Pressable from '@/components/MotionPressable';
import BookListCard from '@/components/BookListCard';
import TrendPickerSheet from '@/components/TrendPickerSheet';
import type { Book } from '@/lib/books';
import { extractScreenshotTopic } from '@/lib/screenshotTopic';
import type { QuipTrendTopic } from '@/lib/quipTrends';
import { colors, radii, spacing, type } from '@/constants/theme';

type TopicSource = 'write' | 'screenshot' | 'trend';

type QuipWorkspaceProps = {
  sourceBooks: Book[];
  isSaving: boolean;
  onGenerate: (trendText: string, trendTopicId: string | null, bookIds: string[]) => Promise<string>;
};

const TOPIC_SOURCES: { id: TopicSource; label: string; icon: typeof PenLine }[] = [
  { id: 'write', label: 'Write', icon: PenLine },
  { id: 'trend', label: 'Trends', icon: TrendingUp },
  { id: 'screenshot', label: 'Screenshot', icon: Camera },
];

const SCREENSHOT_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_SCREENSHOT_BASE64_LENGTH = 5_600_000;
const TOPIC_LIMIT = 2000;
const REPLY_LIMIT = 600;

export default function QuipWorkspace({
  sourceBooks,
  isSaving,
  onGenerate,
}: QuipWorkspaceProps) {
  const [topicSource, setTopicSource] = useState<TopicSource>('write');
  const [topicText, setTopicText] = useState('');
  const [selectedTrendTopic, setSelectedTrendTopic] = useState<QuipTrendTopic | null>(null);
  const [isTrendPickerVisible, setIsTrendPickerVisible] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [hasExtractedText, setHasExtractedText] = useState(false);
  const [replyBookIds, setReplyBookIds] = useState<string[]>(sourceBooks.map((book) => book.id));
  const [isReplySourcesExpanded, setIsReplySourcesExpanded] = useState(false);
  const [reply, setReply] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isReplyExpanded, setIsReplyExpanded] = useState(false);
  const [replyRevision, setReplyRevision] = useState(0);
  const quipScrollRef = useRef<ScrollView>(null);
  const quipViewportRef = useRef<View>(null);
  const replyCardRef = useRef<View>(null);
  const quipScrollOffset = useRef(0);
  const shouldScrollToReply = useRef(false);

  const allReplyBooksSelected = sourceBooks.length > 0 && replyBookIds.length === sourceBooks.length;
  const canGenerate = replyBookIds.length > 0 && Boolean(topicText.trim()) && !isGenerating && !isExtracting && !isSaving;
  const generateDisabledReason = isSaving
    ? 'Waiting for your shelf to finish syncing.'
    : isExtracting
      ? 'Wait for the screenshot text to finish reading.'
      : replyBookIds.length === 0
        ? 'Select at least one source book to generate a Quip.'
        : !topicText.trim()
          ? 'Add a thought seed to enable generation.'
          : null;

  const resetDraft = () => {
    setReply('');
    setErrorMessage('');
    setIsCopied(false);
    setIsReplyExpanded(false);
  };

  const switchTopicSource = (source: TopicSource) => {
    if (source === topicSource) return;
    setTopicSource(source);
    setTopicText('');
    setSelectedTrendTopic(null);
    setHasExtractedText(false);
    resetDraft();
  };

  const updateTopicText = (text: string) => {
    setTopicText(text);
    resetDraft();
  };

  const selectTrendTopic = (topic: QuipTrendTopic) => {
    setSelectedTrendTopic(topic);
    setTopicText(topic.topic);
    setIsTrendPickerVisible(false);
    resetDraft();
  };

  const pickScreenshot = async () => {
    if (isExtracting) return;
    setErrorMessage('');
    let asset: ImagePicker.ImagePickerAsset | null = null;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.8 });
      if (result.canceled || !result.assets?.[0]) return;
      asset = result.assets[0];
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not open the image library on this device.');
      return;
    }

    let base64 = asset.base64 ?? '';
    let mimeType = asset.mimeType ?? '';
    if (!base64 && asset.uri.startsWith('data:')) {
      const match = asset.uri.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = mimeType || match[1];
        base64 = match[2];
      }
    }
    if (!SCREENSHOT_MIME_TYPES.has(mimeType)) mimeType = 'image/jpeg';
    if (!base64) {
      setErrorMessage('Could not read that image. Try a different screenshot.');
      return;
    }
    if (base64.length > MAX_SCREENSHOT_BASE64_LENGTH) {
      setErrorMessage('Choose a screenshot under 4 MB.');
      return;
    }

    setIsExtracting(true);
    try {
      const extractedText = await extractScreenshotTopic(base64, mimeType);
      setTopicText(extractedText);
      setHasExtractedText(true);
      resetDraft();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not read the screenshot.');
    } finally {
      setIsExtracting(false);
    }
  };

  const generate = async () => {
    if (!canGenerate) return;
    setIsGenerating(true);
    setErrorMessage('');
    setIsCopied(false);
    try {
      const topicId = topicSource === 'trend' && selectedTrendTopic ? selectedTrendTopic.id : null;
      const generatedReply = await onGenerate(topicText.trim(), topicId, replyBookIds);
      shouldScrollToReply.current = true;
      setReply(generatedReply);
      setIsReplyExpanded(false);
      setReplyRevision((revision) => revision + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not draft a quip.');
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (!shouldScrollToReply.current) return;
    const frame = requestAnimationFrame(() => {
      replyCardRef.current?.measureInWindow((_x, y) => {
        quipViewportRef.current?.measureInWindow((_viewportX, viewportY) => {
          if (!shouldScrollToReply.current) return;
          shouldScrollToReply.current = false;
          quipScrollRef.current?.scrollTo({
            y: Math.max(0, quipScrollOffset.current + y - viewportY - 12),
            animated: true,
          });
        });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [replyRevision]);

  const copyReply = async () => {
    if (!reply) return;
    try {
      await Clipboard.setStringAsync(reply);
      setIsCopied(true);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not copy the quip on this device.');
    }
  };

  return (
    <>
      <View ref={quipViewportRef} style={styles.scrollViewport}>
        <ScrollView
          ref={quipScrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          onScroll={(event) => { quipScrollOffset.current = event.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>QUIP · SOCIAL GHOSTWRITER</Text>
          <Text style={styles.title}>Shape a thought.</Text>
          <Text style={styles.description}>Draft book-informed quips from your Read shelf.</Text>
        </View>

        <View style={styles.seedCard}>
          <View style={styles.seedHeading}>
            <View style={styles.seedDot} />
            <Text style={styles.seedTitle}>THOUGHT SEED</Text>
          </View>

          <View accessibilityRole="tablist" style={styles.topicTabs}>
            {TOPIC_SOURCES.map(({ id, label, icon: Icon }) => (
              <Pressable
                key={id}
                accessibilityRole="tab"
                accessibilityState={{ selected: topicSource === id }}
                onPress={() => switchTopicSource(id)}
                style={[styles.topicTab, topicSource === id && styles.topicTabSelected]}
              >
                <Icon color={topicSource === id ? colors.brandDeep : colors.secondary} size={15} />
                <Text style={[styles.topicTabText, topicSource === id && styles.topicTabTextSelected]}>{label}</Text>
              </Pressable>
            ))}
          </View>

          {topicSource === 'write' ? (
            <TextInput
              accessibilityLabel="Thought seed"
              autoCorrect
              maxLength={TOPIC_LIMIT}
              multiline
              onChangeText={updateTopicText}
              placeholder="Paste an X/LinkedIn debate, article headline, or provocation..."
              placeholderTextColor={colors.secondary}
              style={styles.seedInput}
              textAlignVertical="top"
              value={topicText}
            />
          ) : topicSource === 'screenshot' ? (
            <>
              <Pressable
                accessibilityRole="button"
                disabled={isExtracting}
                onPress={() => void pickScreenshot()}
                style={({ pressed }) => [styles.seedSourceCard, isExtracting && styles.disabled, pressed && styles.pressed]}
              >
                {isExtracting ? <ActivityIndicator color={colors.brand} /> : <Camera color={colors.brand} size={20} />}
                <View style={styles.seedSourceCopy}>
                  <Text style={styles.seedSourceTitle}>{isExtracting ? 'Reading screenshot…' : hasExtractedText ? 'Replace screenshot' : 'Choose a screenshot'}</Text>
                  <Text style={styles.seedSourceHint}>PNG, JPEG, or WebP up to 4 MB</Text>
                </View>
                <ArrowRight color={colors.brandDeep} size={17} />
              </Pressable>
              {hasExtractedText ? (
                <TextInput
                  accessibilityLabel="Review extracted screenshot text"
                  autoCorrect
                  maxLength={TOPIC_LIMIT}
                  multiline
                  onChangeText={updateTopicText}
                  style={[styles.seedInput, styles.extractedInput]}
                  textAlignVertical="top"
                  value={topicText}
                />
              ) : null}
            </>
          ) : selectedTrendTopic ? (
            <View style={styles.selectedTrend}>
              <View style={styles.selectedTrendCopy}>
                <View style={styles.selectedTrendMeta}>
                  <Text style={styles.selectedTrendTitle}>{selectedTrendTopic.topic}</Text>
                  <Text style={styles.selectedTrendCountry}>{selectedTrendTopic.countryCode}</Text>
                </View>
                {selectedTrendTopic.summary ? <Text style={styles.selectedTrendSummary}>{selectedTrendTopic.summary}</Text> : null}
              </View>
              <Pressable accessibilityRole="button" onPress={() => setIsTrendPickerVisible(true)} style={styles.changeTrend}>
                <Text style={styles.changeTrendLabel}>CHANGE</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsTrendPickerVisible(true)}
              style={({ pressed }) => [styles.seedSourceCard, pressed && styles.pressed]}
            >
              <View style={styles.seedSourceIcon}><TrendingUp color={colors.brand} size={20} /></View>
              <View style={styles.seedSourceCopy}>
                <Text style={styles.seedSourceTitle}>Select from Google Trends</Text>
                <Text numberOfLines={1} style={styles.seedSourceHint}>Browse current topics and related headlines</Text>
              </View>
              <ArrowRight color={colors.brandDeep} size={17} />
            </Pressable>
          )}

          {topicSource !== 'trend' || !selectedTrendTopic ? (
            <Text style={styles.characterCount}>{topicText.length} / {TOPIC_LIMIT}</Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: isReplySourcesExpanded }}
            onPress={() => setIsReplySourcesExpanded((expanded) => !expanded)}
            style={styles.replySourcesToggle}
          >
            <Text style={styles.replySourcesLabel}>BOOKS IN THIS QUIP · {replyBookIds.length} OF {sourceBooks.length}</Text>
            {isReplySourcesExpanded ? <ChevronUp color={colors.brandDeep} size={17} /> : <ChevronDown color={colors.brandDeep} size={17} />}
          </Pressable>
          {isReplySourcesExpanded ? (
            <View style={styles.replyBookList}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: allReplyBooksSelected }}
                onPress={() => setReplyBookIds(allReplyBooksSelected ? [] : sourceBooks.map((book) => book.id))}
                style={styles.selectAllButton}
              >
                <Text style={styles.selectAllText}>{allReplyBooksSelected ? 'Deselect all' : 'Use all selected sources'}</Text>
              </Pressable>
              {sourceBooks.map((book) => {
                const checked = replyBookIds.includes(book.id);
                return (
                  <Pressable
                    key={book.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    accessibilityLabel={`Include ${book.title} in this quip`}
                    onPress={() => setReplyBookIds((ids) => checked ? ids.filter((id) => id !== book.id) : [...ids, book.id])}
                    style={styles.replyBookCard}
                  >
                    <BookListCard book={book} selected={checked}>
                      <View style={[styles.replyCheckbox, checked && styles.replyCheckboxSelected]}>
                        {checked ? <Check color={colors.white} size={14} /> : null}
                      </View>
                    </BookListCard>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {errorMessage ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text> : null}

          <Pressable
            accessibilityRole="button"
            accessibilityHint={canGenerate ? 'Draft a reply using the selected Read books.' : generateDisabledReason ?? 'Quip generation is in progress.'}
            disabled={!canGenerate}
            onPress={() => void generate()}
            style={({ pressed }) => [styles.generateButton, !canGenerate && styles.disabled, pressed && styles.pressed]}
          >
            {isGenerating ? <ActivityIndicator color={colors.brandContrast} /> : <Sparkles color={colors.brandContrast} size={20} />}
            <Text style={styles.generateLabel}>{isGenerating ? 'GENERATING…' : 'GENERATE QUIP'}</Text>
            {!isGenerating ? <Sparkles color={colors.brandContrast} size={17} /> : null}
          </Pressable>
          {!canGenerate && !isGenerating && generateDisabledReason ? (
            <Text style={styles.generateHint}>{generateDisabledReason}</Text>
          ) : null}

          {reply ? (
            <View ref={replyCardRef} style={styles.replyCard}>
              <View style={styles.replyHeader}>
                <Text style={styles.replyHeading}>YOUR QUIP</Text>
                <Text style={styles.characterCount}>{reply.length} / {REPLY_LIMIT}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={isReplyExpanded ? 'Collapse quip' : 'Expand quip'}
                  accessibilityState={{ expanded: isReplyExpanded }}
                  onPress={() => setIsReplyExpanded((expanded) => !expanded)}
                  style={styles.expandReplyButton}
                >
                  {isReplyExpanded ? <ChevronUp color={colors.brandDeep} size={16} /> : <ChevronDown color={colors.brandDeep} size={16} />}
                  <Text style={styles.expandReplyLabel}>{isReplyExpanded ? 'COLLAPSE' : 'EXPAND'}</Text>
                </Pressable>
              </View>
              {isReplyExpanded ? (
                <TextInput
                  accessibilityLabel="Editable quip"
                  autoCorrect
                  maxLength={REPLY_LIMIT}
                  multiline
                  onChangeText={(text) => { setReply(text); setIsCopied(false); }}
                  style={styles.replyInput}
                  textAlignVertical="top"
                  value={reply}
                />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Expand quip to read and edit"
                  onPress={() => setIsReplyExpanded(true)}
                  style={styles.replyPreview}
                >
                  <Text numberOfLines={5} style={styles.replyPreviewText}>{reply}</Text>
                  <Text style={styles.replyPreviewHint}>Tap to expand and edit</Text>
                </Pressable>
              )}
              <Pressable accessibilityRole="button" onPress={() => void copyReply()} style={styles.copyButton}>
                {isCopied ? <Check color={colors.brandDeep} size={16} /> : <Copy color={colors.brandDeep} size={16} />}
                <Text style={styles.copyLabel}>{isCopied ? 'COPIED' : 'COPY QUIP'}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
        </ScrollView>
      </View>

      <TrendPickerSheet
        visible={isTrendPickerVisible}
        onClose={() => setIsTrendPickerVisible(false)}
        onSelect={selectTrendTopic}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scrollViewport: { flex: 1, minHeight: 0 },
  scroll: { flex: 1, minHeight: 0 },
  content: { width: '100%', maxWidth: 860, alignSelf: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  hero: { marginBottom: spacing.md },
  eyebrow: { color: colors.brand, fontSize: type.caption, fontWeight: '700', letterSpacing: 1.1 },
  title: { color: colors.inkStrong, fontSize: 32, lineHeight: 40, fontFamily: 'Newsreader_700Bold', marginTop: 3 },
  description: { color: colors.body, fontSize: type.body, lineHeight: 21, marginTop: spacing.xs },
  seedCard: { padding: spacing.md, marginTop: spacing.lg, borderRadius: radii.sheet, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  seedHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  seedDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand },
  seedTitle: { color: colors.inkStrong, fontSize: type.bodySmall, fontWeight: '700', letterSpacing: 0.65 },
  topicTabs: { flexDirection: 'row', alignSelf: 'flex-start', gap: 3, padding: 3, marginBottom: spacing.sm, borderRadius: radii.pill, backgroundColor: colors.brandPale },
  topicTab: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: spacing.sm, borderRadius: radii.pill },
  topicTabSelected: { backgroundColor: colors.surface },
  topicTabText: { color: colors.secondary, fontSize: type.caption, fontWeight: '600' },
  topicTabTextSelected: { color: colors.brandDeep },
  seedInput: { minHeight: 112, maxHeight: 190, borderRadius: radii.lg, padding: spacing.sm, color: colors.ink, backgroundColor: '#e6f7eb', fontSize: type.body, lineHeight: 23 },
  extractedInput: { marginTop: spacing.sm, backgroundColor: colors.surfaceWarm },
  seedSourceCard: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radii.md, backgroundColor: '#e4f8eb' },
  seedSourceIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.surface },
  seedSourceCopy: { flex: 1, minWidth: 0 },
  seedSourceTitle: { color: colors.inkStrong, fontSize: type.bodySmall, fontWeight: '600' },
  seedSourceHint: { color: colors.secondary, fontSize: type.caption, marginTop: 3 },
  selectedTrend: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surfaceWarm },
  selectedTrendCopy: { flex: 1, minWidth: 0 },
  selectedTrendMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  selectedTrendTitle: { flex: 1, color: colors.inkStrong, fontSize: type.bodySmall, fontWeight: '700' },
  selectedTrendCountry: { color: colors.secondary, fontSize: type.label, fontWeight: '700' },
  selectedTrendSummary: { color: colors.secondary, fontSize: type.caption, lineHeight: 16, marginTop: 3 },
  changeTrend: { minHeight: 34, justifyContent: 'center', paddingHorizontal: spacing.xs },
  changeTrendLabel: { color: colors.brand, fontSize: type.label, fontWeight: '800', letterSpacing: 0.5 },
  characterCount: { color: colors.secondary, fontSize: type.label, fontWeight: '600', textAlign: 'right', marginTop: spacing.xs },
  replySourcesToggle: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  replySourcesLabel: { color: colors.secondary, fontSize: type.caption, fontWeight: '700', letterSpacing: 0.4 },
  replyBookList: { gap: spacing.xs, paddingBottom: spacing.sm },
  selectAllButton: { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: spacing.sm, borderRadius: radii.pill, backgroundColor: colors.brandPale },
  selectAllText: { color: colors.brandDeep, fontSize: type.caption, fontWeight: '600' },
  replyBookCard: { borderRadius: radii.lg },
  replyCheckbox: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 6 },
  replyCheckboxSelected: { borderColor: colors.brand, backgroundColor: colors.brand },
  error: { color: colors.danger, fontSize: type.bodySmall, lineHeight: 17, marginTop: spacing.xs },
  generateButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.sm, borderRadius: radii.md, backgroundColor: colors.brandStrong, shadowColor: colors.shadow, shadowOpacity: 0.08, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  generateLabel: { color: colors.brandContrast, fontSize: type.body, fontWeight: '700', letterSpacing: 0.5 },
  generateHint: { color: colors.secondary, fontSize: type.caption, lineHeight: 16, marginTop: spacing.xs, textAlign: 'center' },
  replyCard: { padding: spacing.md, marginTop: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surfaceWarm },
  replyHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  replyHeading: { color: colors.brandDeep, fontSize: type.bodySmall, fontWeight: '700', letterSpacing: 0.7 },
  expandReplyButton: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: spacing.xs, marginLeft: 'auto', borderRadius: radii.pill, backgroundColor: colors.brandPale },
  expandReplyLabel: { color: colors.brandDeep, fontSize: type.label, fontWeight: '700' },
  replyPreview: { height: 154, overflow: 'hidden', padding: spacing.sm, marginTop: spacing.xs, borderRadius: radii.md, backgroundColor: colors.surface },
  replyPreviewText: { color: colors.body, fontSize: type.body, lineHeight: 22 },
  replyPreviewHint: { color: colors.brandDeep, fontSize: type.caption, fontWeight: '700', marginTop: 'auto', paddingTop: spacing.xs },
  replyInput: { height: 320, padding: spacing.sm, marginTop: spacing.xs, borderRadius: radii.md, backgroundColor: colors.surface, color: colors.body, fontSize: type.body, lineHeight: 22 },
  copyButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, alignSelf: 'flex-end', paddingHorizontal: spacing.sm, marginTop: spacing.xs, borderRadius: radii.pill, backgroundColor: colors.brandPale },
  copyLabel: { color: colors.brandDeep, fontSize: type.caption, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.82 },
});
