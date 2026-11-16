import { useEffect, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { ArrowRight, Camera, Check, ChevronDown, ChevronUp, Copy, MessageCircle, PenLine, Sparkles, TrendingUp } from 'lucide-react-native';
import { ActivityIndicator, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Pressable from '@/components/MotionPressable';
import QuipBookPicker from '@/components/QuipBookPicker';
import TrendPickerSheet from '@/components/TrendPickerSheet';
import ScreenshotPrivacyReview from '@/components/ScreenshotPrivacyReview';
import type { Book } from '@/lib/books';
import { extractScreenshotTopic } from '@/lib/screenshotTopic';
import type { QuipGenerationOptions } from '@/lib/trendInterceptor';
import type { QuipTrendTopic } from '@/lib/quipTrends';
import { quipInputsMatch, type QuipDraftInputs } from '@/lib/quipSelection';
import { suggestQuipBook, type QuipBookSuggestion } from '@/lib/quipSuggestion';
import {
  QUIP_REPLY_LIMIT, QUIP_IDEA_LIMIT, QUIP_STANCES, SINGLE_BOOK_QUIP_STYLES,
  type QuipStance, type SingleBookQuipStyle,
} from '@/supabase/functions/_shared/quip';
import { colors, pageLayout, radii, spacing, type } from '@/constants/theme';

type TopicSource = 'write' | 'idea' | 'screenshot' | 'trend';
type PendingScreenshot = { uri: string; base64: string; mimeType: string };

type QuipWorkspaceProps = {
  sourceBooks: Book[];
  isSaving: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  refreshError: string;
  onGenerate: (trendText: string, trendTopicId: string | null, bookIds: string[], options: QuipGenerationOptions) => Promise<{ reply: string }>;
  onGenerateIdea: (bookIds: string[], signal?: AbortSignal) => Promise<string>;
};

const TOPIC_SOURCES: { id: TopicSource; label: string; icon: typeof PenLine }[] = [
  { id: 'write', label: 'Write', icon: PenLine },
  { id: 'idea', label: 'Idea', icon: Sparkles },
  { id: 'trend', label: 'Trends', icon: TrendingUp },
  { id: 'screenshot', label: 'Screenshot', icon: Camera },
];

const SCREENSHOT_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_SCREENSHOT_BASE64_LENGTH = 5_600_000;
const TOPIC_LIMIT = 2000;

export default function QuipWorkspace({
  sourceBooks,
  isSaving,
  refreshing,
  onRefresh,
  refreshError,
  onGenerate,
  onGenerateIdea,
}: QuipWorkspaceProps) {
  const [topicSource, setTopicSource] = useState<TopicSource>('write');
  const [topicText, setTopicText] = useState('');
  const [selectedTrendTopic, setSelectedTrendTopic] = useState<QuipTrendTopic | null>(null);
  const [isTrendPickerVisible, setIsTrendPickerVisible] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isPickingScreenshot, setIsPickingScreenshot] = useState(false);
  const [pendingScreenshot, setPendingScreenshot] = useState<PendingScreenshot | null>(null);
  const [hasExtractedText, setHasExtractedText] = useState(false);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [isBookPickerVisible, setIsBookPickerVisible] = useState(false);
  const [suggestion, setSuggestion] = useState<QuipBookSuggestion | null>(null);
  const [hasSuggested, setHasSuggested] = useState(false);
  const [isMoreExpanded, setIsMoreExpanded] = useState(false);
  const [confirmSeedReplacement, setConfirmSeedReplacement] = useState(false);
  const [isPreferencesExpanded, setIsPreferencesExpanded] = useState(false);
  const [reply, setReply] = useState('');
  const [stance, setStance] = useState<QuipStance>('neutral');
  const [quipStyle, setQuipStyle] = useState<SingleBookQuipStyle>('natural');
  const [generatedInputs, setGeneratedInputs] = useState<QuipDraftInputs | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingIdea, setIsGeneratingIdea] = useState(false);
  const [aiConsent, setAiConsent] = useState(false);
  const [isPrivacyExpanded, setIsPrivacyExpanded] = useState(false);
  const [wideSourceTabs, setWideSourceTabs] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isReplyExpanded, setIsReplyExpanded] = useState(false);
  const [replyRevision, setReplyRevision] = useState(0);
  const quipScrollRef = useRef<ScrollView>(null);
  const quipViewportRef = useRef<View>(null);
  const replyCardRef = useRef<View>(null);
  const quipScrollOffset = useRef(0);
  const shouldScrollToReply = useRef(false);
  const generationController = useRef<AbortController | null>(null);
  const screenshotController = useRef<AbortController | null>(null);
  const pickerOpen = useRef(false);
  const mounted = useRef(true);
  const selectedBook = sourceBooks.find((book) => book.id === selectedBookId);
  const activeBookIds = selectedBook ? [selectedBook.id] : [];
  const suggestedBook = sourceBooks.find((book) => book.id === suggestion?.bookId);
  const currentInputs: QuipDraftInputs = {
    seed: topicText.trim(),
    trendTopicId: topicSource === 'trend' ? selectedTrendTopic?.id ?? null : null,
    bookIds: activeBookIds,
    stance,
    style: quipStyle,
  };
  const latestInputs = useRef(currentInputs);
  latestInputs.current = currentInputs;
  const draftIsCurrent = quipInputsMatch(generatedInputs, currentInputs);
  const replyLimit = QUIP_REPLY_LIMIT;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generationController.current?.abort();
      screenshotController.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (selectedBookId && !sourceBooks.some((book) => book.id === selectedBookId)) {
      setSelectedBookId(null);
      setErrorMessage('Your selected book is no longer available for Quip. Choose another book.');
      setConfirmSeedReplacement(false);
    }
    setSuggestion(null);
    setHasSuggested(false);
  }, [sourceBooks, selectedBookId]);

  const inputsLocked = isGenerating || isGeneratingIdea || isExtracting || isPickingScreenshot || pendingScreenshot !== null;
  const shelfBusy = isSaving || refreshing;
  const generationBusy = isGenerating || isGeneratingIdea || isExtracting || isPickingScreenshot || shelfBusy;
  const generationLabel = isGenerating ? 'Generating…'
    : isGeneratingIdea ? 'Generating seed…'
      : isExtracting ? 'Reading screenshot…'
        : isPickingScreenshot ? 'Choosing screenshot…'
          : shelfBusy ? 'Syncing shelf…' : 'Generate Quip';
  const canGenerateIdea = activeBookIds.length > 0 && aiConsent && !inputsLocked && !shelfBusy;
  const canGenerate = canGenerateIdea && Boolean(topicText.trim());
  const ideaDisabledReason = shelfBusy
    ? 'Waiting for your shelf to finish syncing.'
    : isGeneratingIdea
      ? 'Wait for your idea to finish generating.'
      : isExtracting
        ? 'Wait for the screenshot text to finish reading.'
        : isPickingScreenshot || pendingScreenshot !== null
          ? 'Finish reviewing your screenshot before generating.'
          : activeBookIds.length === 0
            ? sourceBooks.length === 0
              ? 'Turn Quip on for at least one book in Finished.'
              : 'Choose one book before generating.'
            : !aiConsent
              ? 'Check the AI processing consent box to enable generation.'
              : null;
  const generateDisabledReason = ideaDisabledReason ?? (!topicText.trim() ? 'Add a Quip seed to enable generation.' : null);

  const clearInputFeedback = () => {
    setErrorMessage('');
    setIsCopied(false);
    setSuggestion(null);
    setHasSuggested(false);
    setConfirmSeedReplacement(false);
  };

  const switchTopicSource = (source: TopicSource) => {
    if (source === topicSource) return;
    setTopicSource(source);
    if (!((source === 'write' && topicSource === 'idea') || source === 'idea')) setTopicText('');
    setSelectedTrendTopic(null);
    setHasExtractedText(false);
    setPendingScreenshot(null);
    clearInputFeedback();
  };

  const updateTopicText = (text: string) => {
    setTopicText(text);
    clearInputFeedback();
  };

  const selectTrendTopic = (topic: QuipTrendTopic) => {
    setSelectedTrendTopic(topic);
    setTopicText(topic.topic);
    setIsTrendPickerVisible(false);
    clearInputFeedback();
  };

  const pickScreenshot = async (crop: boolean) => {
    if (pickerOpen.current || screenshotController.current || generationController.current) return;
    pickerOpen.current = true;
    setIsPickingScreenshot(true);
    setErrorMessage('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], base64: true, quality: 0.8,
        allowsEditing: crop && Platform.OS !== 'web',
      });
      if (!mounted.current || result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
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
      if (!base64) throw new Error('Could not read that image. Try a different screenshot.');
      if (base64.length > MAX_SCREENSHOT_BASE64_LENGTH) throw new Error('Choose a screenshot under 4 MB.');
      setPendingScreenshot({ uri: asset.uri, base64, mimeType });
    } catch (error) {
      if (mounted.current) setErrorMessage(error instanceof Error ? error.message : 'Could not open the image library on this device.');
    } finally {
      pickerOpen.current = false;
      if (mounted.current) setIsPickingScreenshot(false);
    }
  };

  const readReviewedScreenshot = async () => {
    if (!pendingScreenshot || screenshotController.current || generationController.current) return;
    const screenshot = pendingScreenshot;
    const controller = new AbortController();
    screenshotController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    setPendingScreenshot(null);
    setIsExtracting(true);
    setErrorMessage('');
    try {
      const extractedText = await extractScreenshotTopic(screenshot.base64, screenshot.mimeType, controller.signal);
      if (!mounted.current) return;
      setTopicText(extractedText);
      setHasExtractedText(true);
      clearInputFeedback();
    } catch (error) {
      if (mounted.current) setErrorMessage(controller.signal.aborted
        ? 'Screenshot reading timed out. Review the image and try again.'
        : error instanceof Error ? error.message : 'Could not read the screenshot.');
    } finally {
      clearTimeout(timeout);
      screenshotController.current = null;
      if (mounted.current) setIsExtracting(false);
    }
  };

  const generateIdea = async () => {
    if (!canGenerateIdea || generationController.current) return;
    const controller = new AbortController();
    generationController.current = controller;
    const inputs = { ...currentInputs, trendTopicId: null };
    setConfirmSeedReplacement(false);
    setIsGeneratingIdea(true);
    setErrorMessage('');
    try {
      const idea = await onGenerateIdea([...inputs.bookIds], controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      if (!quipInputsMatch(inputs, { ...latestInputs.current, trendTopicId: null })) {
        setErrorMessage('Your Quip inputs changed while finding an idea. Please try again.');
        return;
      }
      setTopicText(idea);
      setSelectedTrendTopic(null);
      clearInputFeedback();
    } catch (error) {
      if (mounted.current) {
        const message = error instanceof Error ? error.message : 'Could not suggest a Quip idea.';
        setErrorMessage(message === 'These books need more descriptive summaries before an idea can be suggested.'
          ? 'The selected book needs a more descriptive summary. Choose another book, retry, or write your own seed.'
          : message);
      }
    } finally {
      generationController.current = null;
      if (mounted.current) setIsGeneratingIdea(false);
    }
  };

  const generate = async () => {
    if (!canGenerate || generationController.current) return;
    const controller = new AbortController();
    generationController.current = controller;
    const inputs = currentInputs;
    setIsGenerating(true);
    setErrorMessage('');
    setIsCopied(false);
    try {
      const result = await onGenerate(inputs.seed, inputs.trendTopicId, [...inputs.bookIds], {
        stance, style: quipStyle, signal: controller.signal,
      });
      if (!mounted.current || controller.signal.aborted) return;
      if (!quipInputsMatch(inputs, latestInputs.current)) {
        setErrorMessage('Your Quip inputs changed while generating. Please generate again.');
        return;
      }
      shouldScrollToReply.current = true;
      setReply(result.reply);
      setGeneratedInputs(inputs);
      setIsReplyExpanded(true);
      setReplyRevision((revision) => revision + 1);
    } catch (error) {
      if (mounted.current) setErrorMessage(error instanceof Error ? error.message : 'Could not draft a quip.');
    } finally {
      generationController.current = null;
      if (mounted.current) setIsGenerating(false);
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

  const chooseBook = (bookId: string) => {
    setSelectedBookId(bookId);
    setIsBookPickerVisible(false);
    setConfirmSeedReplacement(false);
    setErrorMessage('');
  };

  const bookContext = (
    <View style={styles.bookContext}>
      <Pressable
        accessibilityRole="button"
        disabled={inputsLocked || shelfBusy}
        onPress={() => setIsBookPickerVisible(true)}
        style={styles.seedSourceCard}
      >
        <MessageCircle color={colors.brand} size={18} />
        <Text style={styles.bookContextText}>{selectedBook ? `Inspired by: ${selectedBook.title}` : 'Choose a book'}</Text>
        <Text style={styles.selectAllText}>{selectedBook ? 'Change' : 'Choose'}</Text>
      </Pressable>
      {topicSource !== 'idea' ? (
        <Pressable
          accessibilityRole="button"
          disabled={inputsLocked || shelfBusy || !topicText.trim() || sourceBooks.length === 0}
          onPress={() => {
            setSuggestion(suggestQuipBook(topicText, sourceBooks));
            setHasSuggested(true);
          }}
          style={styles.disclosureButton}
        >
          <Text style={styles.selectAllText}>Suggest a book</Text>
        </Pressable>
      ) : null}
      {hasSuggested ? (
        <View accessibilityLiveRegion="polite">
          {suggestedBook && suggestion ? (
            <>
              <Text style={styles.privacyHint}>{suggestedBook.title} — Matching topics: {suggestion.matchingTopics.join(', ')}. Suggested from catalog details, not a full-text analysis.</Text>
              <Pressable accessibilityRole="button" disabled={inputsLocked || shelfBusy} onPress={() => chooseBook(suggestedBook.id)} style={styles.selectAllButton}>
                <Text style={styles.selectAllText}>Use this book</Text>
              </Pressable>
            </>
          ) : <Text style={styles.privacyHint}>No clear match—choose a book.</Text>}
        </View>
      ) : null}
      {sourceBooks.length === 0 ? <Text style={styles.privacyHint}>Turn Quip on for a book in Finished, then return here.</Text> : null}
    </View>
  );

  const listHeader = (
    <>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>QUIP</Text>
        <Text style={styles.title}>Shape a thought</Text>
        <Text style={styles.description}>One book. One thought. Up to 280 characters.</Text>
      </View>
      {refreshError ? <Text accessibilityRole="alert" style={styles.error}>{refreshError}</Text> : null}

      <View style={styles.seedSection}>
        <View style={styles.seedHeading}>
          <View style={styles.seedDot} />
          <Text style={styles.seedTitle}>QUIP SEED</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: isMoreExpanded }}
          onPress={() => setIsMoreExpanded((expanded) => !expanded)}
          style={styles.replySourcesToggle}
        >
          <Text style={styles.replySourcesLabel}>More ways to start{topicSource !== 'write' ? ` · ${TOPIC_SOURCES.find((source) => source.id === topicSource)?.label}` : ''}</Text>
          {isMoreExpanded ? <ChevronUp color={colors.brandDeep} size={17} /> : <ChevronDown color={colors.brandDeep} size={17} />}
        </Pressable>
        {isMoreExpanded ? <View accessibilityRole="tablist" onLayout={(event) => setWideSourceTabs(event.nativeEvent.layout.width >= 500)} style={styles.topicTabs}>
          {TOPIC_SOURCES.map(({ id, label, icon: Icon }) => (
            <Pressable
              key={id}
              accessibilityRole="tab"
              accessibilityState={{ selected: topicSource === id, disabled: inputsLocked }}
              aria-selected={topicSource === id}
              aria-busy={id === 'idea' && isGeneratingIdea}
              disabled={inputsLocked}
              onPress={() => {
                switchTopicSource(id);
              }}
              style={[styles.topicTab, wideSourceTabs && styles.topicTabWide, topicSource === id && styles.topicTabSelected, inputsLocked && styles.disabled]}
            >
              {id === 'idea' && isGeneratingIdea ? <ActivityIndicator size="small" color={colors.brandDeep} /> : <Icon color={topicSource === id ? colors.brandDeep : colors.secondary} size={15} />}
              <Text style={[styles.topicTabText, topicSource === id && styles.topicTabTextSelected]}>{label}</Text>
            </Pressable>
          ))}
        </View> : null}

        {topicSource === 'write' || topicSource === 'idea' ? (
          <>
            {topicSource === 'idea' ? (
              <>
                {bookContext}
                <Text style={styles.privacyHint}>Choose a book, then generate an editable seed from its summary. Generated seeds are at most {QUIP_IDEA_LIMIT} characters.</Text>
              </>
            ) : null}
            <TextInput
              accessibilityLabel="Quip seed"
              editable={!inputsLocked}
              autoCorrect
              maxLength={TOPIC_LIMIT}
              multiline
              onChangeText={updateTopicText}
              placeholder={topicSource === 'idea' ? 'Your generated seed will appear here. You can also write your own.' : 'Write a thought or paste a post to reply to...'}
              placeholderTextColor={colors.secondary}
              style={styles.seedInput}
              textAlignVertical="top"
              value={topicText}
            />
          </>
        ) : topicSource === 'screenshot' ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: inputsLocked, busy: isPickingScreenshot || isExtracting }}
              aria-busy={isPickingScreenshot || isExtracting}
              disabled={inputsLocked}
              onPress={() => void pickScreenshot(false)}
              style={({ pressed }) => [styles.seedSourceCard, inputsLocked && styles.disabled, pressed && styles.pressed]}
            >
              {isPickingScreenshot || isExtracting ? <ActivityIndicator color={colors.brand} /> : <Camera color={colors.brand} size={20} />}
              <View style={styles.seedSourceCopy}>
                <Text style={styles.seedSourceTitle}>{isExtracting ? 'Reading screenshot…' : isPickingScreenshot ? 'Choosing screenshot…' : hasExtractedText ? 'Replace screenshot' : 'Choose a screenshot'}</Text>
                <Text style={styles.seedSourceHint}>PNG, JPEG, or WebP up to 4 MB</Text>
              </View>
              <ArrowRight color={colors.brandDeep} size={17} />
            </Pressable>
            <Text style={styles.privacyHint}>Review the image locally before choosing whether to send it to OpenAI for text extraction.</Text>
            {Platform.OS !== 'web' ? (
              <Pressable accessibilityRole="button" disabled={inputsLocked} onPress={() => void pickScreenshot(true)} style={styles.selectAllButton}>
                <Text style={styles.selectAllText}>Choose &amp; crop</Text>
              </Pressable>
            ) : null}
            {hasExtractedText ? (
              <TextInput
                accessibilityLabel="Review extracted screenshot text"
                editable={!inputsLocked}
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
            <Pressable accessibilityRole="button" disabled={inputsLocked} onPress={() => setIsTrendPickerVisible(true)} style={styles.changeTrend}>
              <Text style={styles.changeTrendLabel}>CHANGE</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            disabled={inputsLocked}
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

        {topicSource !== 'idea' ? bookContext : null}

        <View style={styles.consentRow}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: aiConsent, disabled: inputsLocked }}
            aria-checked={aiConsent}
            disabled={inputsLocked}
            onPress={() => setAiConsent((accepted) => !accepted)}
            style={styles.consentCheckbox}
          >
            <View style={[styles.replyCheckbox, aiConsent && styles.replyCheckboxSelected]}>
              {aiConsent ? <Check color={colors.white} size={14} /> : null}
            </View>
            <Text style={styles.consentLabel}>I agree to send Quip inputs to OpenAI.</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: isPrivacyExpanded }} aria-expanded={isPrivacyExpanded} onPress={() => setIsPrivacyExpanded((expanded) => !expanded)} style={styles.disclosureButton}>
            <Text style={styles.selectAllText}>{isPrivacyExpanded ? 'Read less' : 'Read more…'}</Text>
          </Pressable>
        </View>
        {isPrivacyExpanded ? (
          <Text style={styles.privacyNotice}>
            AI processing: Generating a Quip sends your seed, one selected book's details, and any selected trend context to OpenAI via Supabase. Generating a seed sends only that book's details, not your existing seed. Suggest a book matches catalog details on your device without an AI request. The AI uses available metadata and short summaries, not full books, and can make mistakes. Book choices may reveal personal interests. Remove names, contact details, and private or sensitive information you do not want to share. Nothing is automatically anonymized. Screenshots require a separate image review and explicit Send to OpenAI confirmation. This consent does not change provider retention settings.
          </Text>
        ) : null}
        {topicSource === 'idea' ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canGenerateIdea, busy: isGeneratingIdea }}
              disabled={!canGenerateIdea}
              onPress={() => {
                if (topicText.trim()) setConfirmSeedReplacement(true);
                else void generateIdea();
              }}
              style={[styles.generateButton, !canGenerateIdea && styles.disabled]}
            >
              {isGeneratingIdea ? <ActivityIndicator color={colors.brandContrast} /> : <Sparkles color={colors.brandContrast} size={18} />}
              <Text style={styles.generateLabel}>{isGeneratingIdea ? 'Generating seed…' : 'Generate Quip Seed'}</Text>
            </Pressable>
            {confirmSeedReplacement ? (
              <View accessibilityLiveRegion="polite">
                <Text style={styles.privacyHint}>Replace your current seed with a generated one? Your current seed stays if generation fails.</Text>
                <View style={styles.preferenceOptions}>
                  <Pressable accessibilityRole="button" disabled={!canGenerateIdea} onPress={() => void generateIdea()} style={styles.selectAllButton}>
                    <Text style={styles.selectAllText}>Replace seed</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => setConfirmSeedReplacement(false)} style={styles.selectAllButton}>
                    <Text style={styles.selectAllText}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </>
        ) : null}
        {topicSource === 'idea' && !canGenerateIdea && !isGeneratingIdea && ideaDisabledReason ? (
          <Text accessibilityLiveRegion="polite" style={styles.generateHint}>{ideaDisabledReason}</Text>
        ) : null}
        {topicSource === 'idea' && errorMessage ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text> : null}

      </View>
    </>
  );

  const listFooter = (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Customize"
        accessibilityState={{ expanded: isPreferencesExpanded }}
        aria-expanded={isPreferencesExpanded}
        onPress={() => setIsPreferencesExpanded((expanded) => !expanded)}
        style={styles.replySourcesToggle}
      >
        <Text style={styles.replySourcesLabel}>CUSTOMIZE</Text>
        {isPreferencesExpanded ? <ChevronUp color={colors.brandDeep} size={17} /> : <ChevronDown color={colors.brandDeep} size={17} />}
      </Pressable>
      {isPreferencesExpanded ? (
        <>
          <View style={styles.preferenceSection}>
            <Text style={styles.preferenceLabel}>STANCE</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel="Stance" style={styles.preferenceOptions}>
              {QUIP_STANCES.map((option) => (
                <Pressable
                  key={option.id}
                  accessibilityRole="radio"
                  accessibilityLabel={`${option.label} stance`}
                  accessibilityState={{ checked: stance === option.id, disabled: inputsLocked }}
                  aria-checked={stance === option.id}
                  disabled={inputsLocked}
                  onPress={() => setStance(option.id)}
                  style={[styles.preferenceButton, stance === option.id && styles.preferenceSelected]}
                >
                  <Text style={[styles.preferenceText, stance === option.id && styles.preferenceTextSelected]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.preferenceSection}>
            <Text style={styles.preferenceLabel}>STYLE</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel="Style" style={styles.preferenceOptions}>
              {SINGLE_BOOK_QUIP_STYLES.map((option) => (
                <Pressable
                  key={option.id}
                  accessibilityRole="radio"
                  accessibilityLabel={`${option.label} style`}
                  accessibilityState={{ checked: quipStyle === option.id, disabled: inputsLocked }}
                  aria-checked={quipStyle === option.id}
                  disabled={inputsLocked}
                  onPress={() => setQuipStyle(option.id)}
                  style={[styles.preferenceButton, quipStyle === option.id && styles.preferenceSelected]}
                >
                  <Text style={[styles.preferenceText, quipStyle === option.id && styles.preferenceTextSelected]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </>
      ) : null}

      {topicSource !== 'idea' && errorMessage ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !canGenerate, busy: generationBusy }}
        aria-busy={generationBusy}
        accessibilityHint={canGenerate ? 'Sends your seed, one selected book, and any selected trend context to OpenAI to draft a Quip of at most 280 characters.' : generateDisabledReason ?? 'Quip generation is in progress.'}
        disabled={!canGenerate}
        onPress={() => void generate()}
        style={({ pressed }) => [styles.generateButton, !canGenerate && styles.disabled, pressed && styles.pressed]}
      >
        {generationBusy ? <ActivityIndicator color={colors.brandContrast} /> : <Sparkles color={colors.brandContrast} size={20} />}
        <Text style={styles.generateLabel}>{generationLabel}</Text>
      </Pressable>
      {!canGenerate && !isGenerating && generateDisabledReason ? (
        <Text style={styles.generateHint}>{generateDisabledReason}</Text>
      ) : null}

      {reply ? (
        <View ref={replyCardRef} style={styles.replyCard}>
          <View style={styles.replyHeader}>
            <Text style={styles.replyHeading}>YOUR QUIP</Text>
            <Text style={styles.characterCount}>{reply.length} / {replyLimit}</Text>
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
          {!draftIsCurrent ? (
            <Text accessibilityLiveRegion="polite" style={styles.generateHint}>Inputs changed. Generate again to update this Quip.</Text>
          ) : null}
          {isReplyExpanded ? (
            <TextInput
              accessibilityLabel="Editable quip"
              editable={!inputsLocked}
              autoCorrect
              maxLength={replyLimit}
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
  );

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
          alwaysBounceVertical
          refreshControl={<RefreshControl refreshing={refreshing} enabled={!inputsLocked} onRefresh={inputsLocked ? undefined : onRefresh} tintColor={colors.brand} colors={[colors.brand]} />}
        >
          {listHeader}
          {listFooter}
        </ScrollView>
      </View>

      {isBookPickerVisible ? (
        <QuipBookPicker books={sourceBooks} selectedId={selectedBookId} onSelect={chooseBook} onClose={() => setIsBookPickerVisible(false)} />
      ) : null}
      {isTrendPickerVisible ? <TrendPickerSheet
        visible={isTrendPickerVisible}
        onClose={() => setIsTrendPickerVisible(false)}
        onSelect={selectTrendTopic}
      /> : null}
      {pendingScreenshot ? (
        <ScreenshotPrivacyReview
          imageUri={pendingScreenshot.uri}
          onCancel={() => setPendingScreenshot(null)}
          onConfirm={() => void readReviewedScreenshot()}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  scrollViewport: { flex: 1, minHeight: 0 },
  scroll: { flex: 1, minHeight: 0 },
  content: pageLayout.content,
  hero: pageLayout.heading,
  eyebrow: pageLayout.eyebrow,
  title: pageLayout.title,
  description: { color: colors.body, fontSize: type.body, lineHeight: 21, marginTop: spacing.xs },
  seedSection: { marginTop: spacing.md },
  bookContext: { marginTop: spacing.sm },
  bookContextText: { flex: 1, color: colors.inkStrong, fontSize: type.bodySmall },
  seedHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  seedDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand },
  seedTitle: { color: colors.inkStrong, fontSize: type.bodySmall, fontWeight: '700', letterSpacing: 0.65 },
  topicTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 3, marginBottom: spacing.sm, borderRadius: radii.md, backgroundColor: colors.brandPale },
  topicTab: { width: '48%', flexGrow: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: spacing.sm, borderRadius: radii.md },
  topicTabWide: { width: 'auto', flexBasis: 0 },
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
  selectAllButton: { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: spacing.sm, borderRadius: radii.pill, backgroundColor: colors.brandPale },
  selectAllText: { color: colors.brandDeep, fontSize: type.caption, fontWeight: '600' },
  replyCheckbox: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 6 },
  replyCheckboxSelected: { borderColor: colors.brand, backgroundColor: colors.brand },
  privacyHint: { color: colors.secondary, fontSize: type.caption, lineHeight: 17, marginVertical: spacing.xs },
  privacyNotice: { color: colors.body, fontSize: type.caption, lineHeight: 18, marginTop: spacing.sm, padding: spacing.sm, borderRadius: radii.md, backgroundColor: colors.surfaceWarm },
  consentRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.xs, marginTop: spacing.sm },
  consentCheckbox: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1, minHeight: 44 },
  consentLabel: { color: colors.body, fontSize: type.caption, flexShrink: 1 },
  disclosureButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs },
  preferenceSection: { marginTop: spacing.sm },
  preferenceLabel: { color: colors.secondary, fontSize: type.caption, fontWeight: '700', letterSpacing: 0.5, marginBottom: spacing.xs },
  preferenceOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  preferenceButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill },
  preferenceSelected: { borderColor: colors.brand, backgroundColor: colors.brandPale },
  preferenceText: { color: colors.secondary, fontSize: type.caption, fontWeight: '600' },
  preferenceTextSelected: { color: colors.brandDeep },
  error: { color: colors.danger, fontSize: type.bodySmall, lineHeight: 17, marginTop: spacing.xs },
  generateButton: { minHeight: 44, alignSelf: 'flex-start', paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.sm, borderRadius: radii.md, backgroundColor: colors.brandStrong },
  generateLabel: { color: colors.brandContrast, fontSize: type.bodySmall, fontWeight: '700', letterSpacing: 0.5 },
  generateHint: { color: colors.secondary, fontSize: type.caption, lineHeight: 16, marginTop: spacing.xs, textAlign: 'center' },
  replyCard: { padding: spacing.md, marginTop: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surfaceWarm },
  replyHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  replyHeading: { color: colors.brandDeep, fontSize: type.bodySmall, fontWeight: '700', letterSpacing: 0.7 },
  expandReplyButton: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: spacing.xs, marginLeft: 'auto', borderRadius: radii.pill, backgroundColor: colors.brandPale },
  expandReplyLabel: { color: colors.brandDeep, fontSize: type.label, fontWeight: '700' },
  replyPreview: { height: 154, overflow: 'hidden', padding: spacing.sm, marginTop: spacing.xs, borderRadius: radii.md, backgroundColor: colors.surface },
  replyPreviewText: { color: colors.body, fontSize: type.body, lineHeight: 22 },
  replyPreviewHint: { color: colors.brandDeep, fontSize: type.caption, fontWeight: '700', marginTop: 'auto', paddingTop: spacing.xs },
  replyInput: { minHeight: 130, maxHeight: 210, padding: spacing.sm, marginTop: spacing.xs, borderRadius: radii.md, backgroundColor: colors.surface, color: colors.body, fontSize: type.body, lineHeight: 22 },
  copyButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, alignSelf: 'flex-end', paddingHorizontal: spacing.sm, marginTop: spacing.xs, borderRadius: radii.pill, backgroundColor: colors.brandPale },
  copyLabel: { color: colors.brandDeep, fontSize: type.caption, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.82 },
});
