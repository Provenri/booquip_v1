import { useEffect, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Pressable from '@/components/MotionPressable';
import Icon from '@/components/MaterialIcon';
import QuipBookPicker from '@/components/QuipBookPicker';
import type { Book } from '@/lib/books';
import type { QuipGenerationOptions } from '@/lib/trendInterceptor';
import { quipInputsMatch, quipRefinementStatus, type QuipDraftInputs } from '@/lib/quipSelection';
import { loadQuipBookDrafts } from '@/lib/quipCache';
import { formatQuipTopicReason } from '@/lib/quipTopic';
import {
  QUIP_REPLY_LIMIT, QUIP_SEED_LIMIT, QUIP_STANCES, SINGLE_BOOK_QUIP_STYLES,
  type QuipStance, type SingleBookQuipStyle,
} from '@/supabase/functions/_shared/quip';
import type { StoredQuipCacheVariant } from '@/supabase/functions/_shared/quipCache';
import { colors, radii, spacing } from '@/constants/theme';

function PreferenceSelector<T extends string>({ label, value, options, open, disabled, onToggle, onSelect }: {
  label: string;
  value: T;
  options: readonly { id: T; label: string }[];
  open: boolean;
  disabled: boolean;
  onToggle: () => void;
  onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.selectorContainer}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${options.find((option) => option.id === value)?.label}`}
        accessibilityState={{ expanded: open, disabled }} aria-expanded={open} disabled={disabled} onPress={onToggle} style={styles.selector}>
        <Text style={styles.selectorLabel}>{label.toUpperCase()}:</Text>
        <Text numberOfLines={1} style={styles.selectorValue}>{options.find((option) => option.id === value)?.label}</Text>
        <Icon name="down" size={18} color={colors.secondary} />
      </Pressable>
      {open ? (
        <View accessibilityRole="radiogroup" accessibilityLabel={`${label} options`} style={styles.selectorMenu}>
          {options.map((option) => (
            <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ checked: value === option.id }} aria-checked={value === option.id}
              onPress={() => onSelect(option.id)} style={[styles.selectorOption, value === option.id && styles.selectorOptionSelected]}>
              <Text style={[styles.selectorOptionText, value === option.id && styles.selectorOptionTextSelected]}>{option.label}</Text>
              {value === option.id ? <Icon name="check" size={18} /> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

type QuipWorkspaceProps = {
  sourceBooks: Book[];
  readBookIds: string[];
  selectedBookId: string | null;
  onSelectBook: (bookId: string | null) => void;
  isSaving: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  refreshError: string;
  onGenerate: (seed: string, trendTopicId: string | null, bookIds: string[], options: QuipGenerationOptions) => Promise<{ reply: string }>;
};

type ReplySource = {
  kind: 'custom' | 'ready-made';
  bookId: string;
  bookTitle: string;
};

export default function QuipWorkspace({
  sourceBooks, readBookIds, selectedBookId, onSelectBook, isSaving, refreshing, onRefresh, refreshError, onGenerate,
}: QuipWorkspaceProps) {
  const [path, setPath] = useState<'ready-made' | 'craft'>('ready-made');
  const [pickerVisible, setPickerVisible] = useState(false);
  const [seed, setSeed] = useState('');
  const [stance, setStance] = useState<QuipStance>('neutral');
  const [style, setStyle] = useState<SingleBookQuipStyle>('natural');
  const [consent, setConsent] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [variantData, setVariantData] = useState<{ cacheKey: string; variants: StoredQuipCacheVariant[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [cacheError, setCacheError] = useState('');
  const [retry, setRetry] = useState(0);
  const [reply, setReply] = useState('');
  const [replySource, setReplySource] = useState<ReplySource | null>(null);
  const [generatedInputs, setGeneratedInputs] = useState<QuipDraftInputs | null>(null);
  const [pendingVariant, setPendingVariant] = useState<StoredQuipCacheVariant | null>(null);
  const [openSelector, setOpenSelector] = useState<'stance' | 'style' | null>(null);
  const [privacyExpanded, setPrivacyExpanded] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [failedCoverUri, setFailedCoverUri] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedReadyMade, setCopiedReadyMade] = useState(false);
  const generationController = useRef<AbortController | null>(null);
  const scroll = useRef<ScrollView>(null);
  const seedInput = useRef<TextInput>(null);
  const shouldFocusSeed = useRef(false);
  const shouldScrollToReply = useRef(false);
  const [replyRevision, setReplyRevision] = useState(0);
  const cache = useRef(new Map<string, StoredQuipCacheVariant[]>());
  const selectedBook = sourceBooks.find((book) => book.id === selectedBookId);
  const coverUri = selectedBook?.coverUrl ?? (selectedBook?.isbn ? `https://covers.openlibrary.org/b/isbn/${selectedBook.isbn}-M.jpg` : null);
  const canCraft = Boolean(selectedBook);
  const cacheKey = selectedBook ? JSON.stringify([selectedBook.id, selectedBook.title, selectedBook.author, selectedBook.note]) : '';
  const variants = variantData?.cacheKey === cacheKey ? variantData.variants : [];
  const selectedVariant = variants.find((variant) => variant.stance === stance && variant.style === style);
  const busy = generating || isSaving || refreshing;
  const inputs: QuipDraftInputs = { seed: seed.trim(), trendTopicId: null, bookIds: selectedBook ? [selectedBook.id] : [], stance, style };
  const latest = useRef({ inputs, canCraft });
  latest.current = { inputs, canCraft };
  const refreshWasActive = useRef(false);
  const replyBookChanged = Boolean(replySource && replySource.bookId !== selectedBook?.id);
  const replyInputsChanged = replySource?.kind === 'custom' && !quipInputsMatch(generatedInputs, inputs);
  const replyIsStale = replyBookChanged || replyInputsChanged;

  useEffect(() => () => generationController.current?.abort(), []);

  useEffect(() => {
    setSummaryExpanded(false);
  }, [selectedBookId]);

  useEffect(() => {
    if (path !== 'craft' || !shouldFocusSeed.current) return;
    const frame = requestAnimationFrame(() => {
      seedInput.current?.focus();
      shouldFocusSeed.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [path]);

  useEffect(() => {
    if (!shouldScrollToReply.current) return;
    const frame = requestAnimationFrame(() => {
      scroll.current?.scrollToEnd({ animated: true });
      shouldScrollToReply.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [replyRevision]);

  useEffect(() => {
    if (!selectedBook && selectedBookId !== null) {
      onSelectBook(null);
      setError('This book is no longer on either shelf. Choose another book.');
    }
    if (!canCraft) {
      setPath((current) => current === 'craft' ? 'ready-made' : current);
      generationController.current?.abort();
    }
  }, [selectedBook, selectedBookId, canCraft, onSelectBook]);

  useEffect(() => {
    if (refreshing) {
      refreshWasActive.current = true;
      cache.current.clear();
    } else if (refreshWasActive.current) {
      refreshWasActive.current = false;
      setRetry((value) => value + 1);
    }
  }, [refreshing]);

  useEffect(() => {
    setVariantData(null);
    setCacheError('');
    setPendingVariant(null);
    setLoading(false);
    if (!selectedBookId || !cacheKey || refreshing) return;
    const saved = cache.current.get(cacheKey);
    if (saved) {
      setVariantData({ cacheKey, variants: saved });
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    void loadQuipBookDrafts(selectedBookId, controller.signal).then((rows) => {
      if (controller.signal.aborted) return;
      cache.current.set(cacheKey, rows);
      setVariantData({ cacheKey, variants: rows });
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setCacheError(failure instanceof Error ? failure.message : 'Could not load ready-made Quips.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [selectedBookId, cacheKey, retry, refreshing]);

  const selectBook = (bookId: string) => {
    onSelectBook(bookId);
    setPath('ready-made');
    setSeed('');
    setStance('neutral');
    setStyle('natural');
    setConsent(false);
    setReply('');
    setReplySource(null);
    setGeneratedInputs(null);
    setPendingVariant(null);
    setOpenSelector(null);
    setPrivacyExpanded(false);
    setPickerVisible(false);
    setError('');
    setCopied(false);
    setCopiedReadyMade(false);
    shouldScrollToReply.current = false;
    shouldFocusSeed.current = false;
    scroll.current?.scrollTo({ y: 0, animated: false });
  };

  const generate = async () => {
    if (!selectedBook || !canCraft || !seed.trim() || !consent || busy || generationController.current) return;
    const controller = new AbortController();
    generationController.current = controller;
    const requestedInputs = inputs;
    const title = selectedBook.title;
    setGenerating(true);
    setError('');
    setCopied(false);
    setCopiedReadyMade(false);
    try {
      const result = await onGenerate(requestedInputs.seed, null, [...requestedInputs.bookIds], { stance, style, signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!latest.current.canCraft || !quipInputsMatch(requestedInputs, latest.current.inputs)) {
        setError('Your book or inputs changed. Please generate again.');
        return;
      }
      setReply(result.reply);
      setReplySource({ kind: 'custom', bookId: selectedBook.id, bookTitle: title });
      setGeneratedInputs(requestedInputs);
      shouldScrollToReply.current = true;
      setReplyRevision((revision) => revision + 1);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not craft your Quip.');
    } finally {
      if (generationController.current === controller) generationController.current = null;
      if (!controller.signal.aborted) setGenerating(false);
    }
  };

  useEffect(() => {
    if (!canCraft) setGenerating(false);
  }, [canCraft]);

  const refineVariant = (variant: StoredQuipCacheVariant) => {
    if (quipRefinementStatus(seed, variant, selectedBook?.id ?? null, canCraft) === 'unavailable') {
      setPendingVariant(null);
      setError('This Quip cannot be refined for the selected book. Refresh and try again.');
      return;
    }
    setSeed(variant.reply);
    setStance(variant.stance);
    setStyle(variant.style);
    setConsent(false);
    shouldFocusSeed.current = true;
    setPath('craft');
    setPendingVariant(null);
    setOpenSelector(null);
    setError('');
  };

  const copyText = async (text: string, source: 'draft' | 'ready-made') => {
    try {
      await Clipboard.setStringAsync(text);
      if (source === 'draft') {
        setCopied(true);
        setCopiedReadyMade(false);
      } else {
        setCopied(false);
        setCopiedReadyMade(true);
      }
      setError('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not copy this Quip.');
    }
  };

  return (
    <>
      <ScrollView ref={scroll} style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} enabled={!generating} onRefresh={onRefresh} />}>
        {refreshError ? <Text accessibilityRole="alert" style={styles.error}>{refreshError}</Text> : null}
        <View style={styles.bookHeading}>
          <Text style={styles.label}>SELECTED BOOK</Text>
          {selectedBook ? <Text style={styles.shelfBadge}>{readBookIds.includes(selectedBook.id) ? 'Finished shelf' : 'To read shelf'}</Text> : null}
        </View>
        <Pressable accessibilityRole="button"
          accessibilityLabel={selectedBook ? `Change book, currently ${selectedBook.title} by ${selectedBook.author}` : 'Choose a book'}
          accessibilityHint="Opens the book picker"
          accessibilityState={{ disabled: busy }} disabled={busy}
          onPress={() => setPickerVisible(true)} style={styles.bookCard}>
          <View style={styles.bookCardHeading}>
            <View style={styles.bookIcon}>
              <Icon name="book" size={23} />
              {selectedBook && coverUri && failedCoverUri !== coverUri ? (
                <Image
                  accessibilityLabel={`Cover of ${selectedBook.title}`}
                  source={{ uri: coverUri }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={coverUri}
                  onError={() => setFailedCoverUri(coverUri)}
                  style={styles.bookCover}
                />
              ) : null}
            </View>
            <View style={styles.bookCardCopy}>
              <Text style={styles.bookTitle}>{selectedBook?.title ?? 'Choose a book to start'}</Text>
              {selectedBook ? <Text style={styles.bookAuthor}>{selectedBook.author}{selectedBook.year ? ` · ${selectedBook.year}` : ''}</Text> : null}
            </View>
          </View>
        </Pressable>
        {selectedBook && variants[0] ? (
          <View style={styles.bookTopic}>
            <Pressable accessibilityRole="button" accessibilityLabel="Book summary"
              accessibilityState={{ expanded: summaryExpanded }} aria-expanded={summaryExpanded}
              onPress={() => setSummaryExpanded((expanded) => !expanded)} style={styles.summaryToggle}>
              <Text style={styles.summaryLabel}>Book summary</Text>
              <Icon name={summaryExpanded ? 'up' : 'down'} size={18} />
            </Pressable>
            {summaryExpanded ? (
              <View>
                <Text style={styles.topicTitle}>{variants[0].topic.charAt(0).toUpperCase() + variants[0].topic.slice(1)}</Text>
                <Text style={styles.hint}>{formatQuipTopicReason(variants[0].topic_reason)}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {selectedBook ? (
          <>
            <View style={styles.pathTrack}>
              <Pressable accessibilityRole="tab" accessibilityState={{ selected: path === 'ready-made', disabled: busy }} aria-selected={path === 'ready-made'} disabled={busy}
                onPress={() => { setPendingVariant(null); setOpenSelector(null); setPath('ready-made'); }}
                style={[styles.pathButton, path === 'ready-made' && styles.pathSelected]}>
                <Icon name="explore" size={17} color={path === 'ready-made' ? colors.brandDeep : colors.secondary} />
                <Text style={[styles.pathText, path === 'ready-made' && styles.pathTextSelected]}>Explore ready-made</Text>
              </Pressable>
              <Pressable accessibilityRole="tab"
                accessibilityState={{ selected: path === 'craft', disabled: busy || !canCraft }} disabled={busy || !canCraft}
                aria-selected={path === 'craft'}
                onPress={() => { setPendingVariant(null); setOpenSelector(null); setPath('craft'); }}
                style={[styles.pathButton, path === 'craft' && styles.pathSelected, !canCraft && styles.disabled]}>
                <Icon name="edit" size={17} color={path === 'craft' ? colors.brandDeep : colors.secondary} />
                <Text style={[styles.pathText, path === 'craft' && styles.pathTextSelected]}>Craft a Quip</Text>
              </Pressable>
            </View>
          </>
        ) : <Text style={styles.hint}>Choose from To read or Finished, or open a book from either shelf using Quip.</Text>}

        {selectedBook && path === 'craft' && canCraft ? (
          <View style={styles.section}>
            <Text style={styles.label}>YOUR THOUGHT / SEED</Text>
            <View style={styles.composer}>
              <TextInput ref={seedInput} accessibilityLabel="Your Quip idea" placeholder="Share a thought or paste a post. Bring this book’s perspective to the conversation."
                placeholderTextColor={colors.muted} value={seed} onChangeText={setSeed} editable={!busy} multiline maxLength={QUIP_SEED_LIMIT}
                textAlignVertical="top" style={styles.seedInput} />
              <Text style={styles.counter}>{seed.length} / {QUIP_SEED_LIMIT}</Text>
            </View>
          </View>
        ) : null}
        {selectedBook && (path === 'craft' || variants.length > 0) ? (
          <View style={styles.selectorRow}>
            <PreferenceSelector label="Stance" value={stance} options={QUIP_STANCES} open={openSelector === 'stance'} disabled={busy}
              onToggle={() => setOpenSelector((current) => current === 'stance' ? null : 'stance')}
              onSelect={(value) => { setStance(value); setPendingVariant(null); setCopiedReadyMade(false); setOpenSelector(null); }} />
            <PreferenceSelector label="Style" value={style} options={SINGLE_BOOK_QUIP_STYLES} open={openSelector === 'style'} disabled={busy}
              onToggle={() => setOpenSelector((current) => current === 'style' ? null : 'style')}
              onSelect={(value) => { setStyle(value); setPendingVariant(null); setCopiedReadyMade(false); setOpenSelector(null); }} />
          </View>
        ) : null}
        {selectedBook && path === 'ready-made' ? (
          <View style={styles.section}>
            {loading ? <View style={styles.loadingRow}><ActivityIndicator accessibilityLabel="Loading ready-made Quips" color={colors.brand} size="small" /><Text style={styles.hint}>Loading ready-made Quips…</Text></View> : null}
            {cacheError ? <View><Text accessibilityRole="alert" style={styles.error}>{cacheError}</Text><Pressable accessibilityRole="button" onPress={() => setRetry((value) => value + 1)} style={styles.secondaryButton}><Text style={styles.buttonText}>Try again</Text></Pressable></View> : null}
            {!loading && !cacheError && variants.length === 0 ? <Text style={styles.hint}>Ready-made Quips are not available for this book yet.</Text> : null}
            {selectedVariant ? (
              <>
                <View style={styles.variantPreview}>
                  <View style={styles.quoteRow}><Icon name="quote" size={24} /><Text style={styles.variantReply}>“{selectedVariant.reply}”</Text></View>
                  <Text style={styles.counter}>{selectedVariant.reply.length} / {QUIP_REPLY_LIMIT}</Text>
                </View>
                <Text style={styles.hint}>Based on the book summary, not a custom idea.</Text>
                <View style={styles.actionTrack}>
                  <Pressable accessibilityRole="button" onPress={() => {
                    if (quipRefinementStatus(seed, selectedVariant, selectedBook.id, canCraft) === 'confirm') setPendingVariant(selectedVariant);
                    else refineVariant(selectedVariant);
                  }} style={styles.actionButton}>
                    <Icon name="edit" size={18} /><Text style={styles.actionText}>Refine in Craft</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => void copyText(selectedVariant.reply, 'ready-made')} style={styles.actionButton}>
                    <Icon name={copiedReadyMade ? 'check' : 'copy'} size={18} /><Text style={styles.actionText}>{copiedReadyMade ? 'Copied' : 'Copy as-is'}</Text>
                  </Pressable>
                </View>
              </>
            ) : variants.length > 0 ? <Text style={styles.hint}>This stance and style combination is not available yet.</Text> : null}
            {pendingVariant ? (
              <View accessibilityLiveRegion="polite" style={styles.replaceNotice}>
                <Text style={styles.hint}>Replace your current thought? Your edits to it will be lost.</Text>
                <View style={styles.row}>
                  <Pressable accessibilityRole="button" onPress={() => refineVariant(pendingVariant)} style={styles.secondaryButton}>
                    <Text style={styles.buttonText}>Replace thought</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => setPendingVariant(null)} style={styles.secondaryButton}><Text style={styles.buttonText}>Keep editing</Text></Pressable>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
        {selectedBook && path === 'craft' && canCraft ? (
          <View style={styles.section}>
            <View style={styles.consentCard}>
              <View style={styles.consentRow}>
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: consent, disabled: busy }} aria-checked={consent} disabled={busy} onPress={() => setConsent((value) => !value)} style={styles.consentControl}>
                  <View style={[styles.checkbox, consent && styles.checkboxSelected]}>{consent ? <Icon name="check" size={16} color={colors.white} /> : null}</View>
                  <Text style={styles.consentText}>I agree to send Quip inputs to OpenAI</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: privacyExpanded }} aria-expanded={privacyExpanded} onPress={() => setPrivacyExpanded((value) => !value)} style={styles.privacyToggle}>
                  <Text style={styles.buttonText}>{privacyExpanded ? 'Less' : 'Read more'}</Text><Icon name="down" size={16} />
                </Pressable>
              </View>
              {privacyExpanded ? <Text style={styles.privacyText}>Crafting sends your idea and this book&apos;s catalog details to OpenAI via Supabase, not the full book. Remove private or sensitive information. AI can make mistakes; nothing is published automatically.</Text> : null}
            </View>
            <Pressable accessibilityRole="button" accessibilityState={{ busy: generating, disabled: busy || !consent || !seed.trim() }}
              disabled={busy || !consent || !seed.trim()} onPress={() => void generate()} style={[styles.primaryButton, (busy || !consent || !seed.trim()) && styles.disabled]}>
              {generating ? <ActivityIndicator color={colors.white} /> : <Icon name="sparkle" color={colors.white} size={19} />}
              <Text style={styles.primaryText}>{generating ? 'Crafting…' : 'Generate Quip'}</Text>
              {!generating ? <Icon name="sparkle" color={colors.white} size={19} /> : null}
            </Pressable>
          </View>
        ) : null}
        {selectedBook && path === 'craft' && loading ? <View style={styles.loadingRow}><ActivityIndicator accessibilityLabel="Loading book theme" color={colors.brand} size="small" /><Text style={styles.hint}>Loading book theme…</Text></View> : null}
        {selectedBook && path === 'craft' && cacheError ? <View><Text accessibilityRole="alert" style={styles.error}>{cacheError}</Text><Pressable accessibilityRole="button" onPress={() => setRetry((value) => value + 1)} style={styles.secondaryButton}><Text style={styles.buttonText}>Try again</Text></Pressable></View> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {reply && replySource ? (
          <View style={styles.card}>
            <Text style={styles.heading}>
              {replyIsStale ? 'Previous Quip draft' : replySource.kind === 'ready-made' ? 'Your ready-made Quip' : 'Your crafted Quip'}
            </Text>
            <Text style={styles.hint}>
              From {replySource.bookTitle}
              {replySource.kind === 'ready-made' ? ' · Based on the catalog summary' : ''}
            </Text>
            {replyBookChanged ? (
              <Text style={styles.staleNotice}>
                This draft is still from {replySource.bookTitle}. It has been kept, but the selected book is now {selectedBook?.title ?? 'not selected'}.
                {selectedBook ? (replySource.kind === 'custom' ? ' Generate again to use the selected book.' : ' Explore ready-made Quips to choose a draft for this book.') : ' Choose a book to continue.'}
              </Text>
            ) : replyInputsChanged ? (
              <Text style={styles.staleNotice}>Your idea, stance, or style changed since this draft was generated. Generate again to update it.</Text>
            ) : null}
            <TextInput accessibilityLabel="Editable quip" value={reply} onChangeText={(text) => { setReply(text); setCopied(false); setCopiedReadyMade(false); }} editable={!generating} multiline
              maxLength={QUIP_REPLY_LIMIT} style={styles.input} textAlignVertical="top" />
            <Text style={styles.hint}>{reply.length}/{QUIP_REPLY_LIMIT}</Text>
            <Pressable accessibilityRole="button" onPress={() => void copyText(reply, 'draft')} style={styles.secondaryButton}>
              <Icon name={copied ? 'check' : 'copy'} size={16} /><Text style={styles.buttonText}>{copied ? 'Copied' : 'Copy Quip'}</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
      {pickerVisible ? <QuipBookPicker books={sourceBooks} readBookIds={readBookIds} selectedId={selectedBookId}
        onSelect={(id) => {
          setPickerVisible(false);
          if (id === selectedBookId) return;
          selectBook(id);
        }} onClose={() => setPickerVisible(false)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { width: '100%', maxWidth: 544, alignSelf: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  section: { marginTop: spacing.md },
  card: { padding: spacing.md, marginVertical: spacing.sm, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.lg, backgroundColor: colors.surface },
  bookHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs, marginBottom: spacing.xs },
  shelfBadge: { overflow: 'hidden', flexShrink: 0, color: colors.brandDeep, backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.brandHighlight, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4, fontFamily: 'PublicSans_600SemiBold', fontSize: 11, lineHeight: 16 },
  bookCard: { padding: 14, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 16, backgroundColor: colors.surface },
  bookCardHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  bookIcon: { width: 40, height: 56, flexShrink: 0, overflow: 'hidden', borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.borderStrong },
  bookCover: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  bookCardCopy: { flex: 1, minWidth: 90 },
  bookTitle: { color: colors.inkStrong, fontSize: 17, lineHeight: 22, fontFamily: 'Newsreader_700Bold' },
  bookAuthor: { color: colors.secondary, fontSize: 12, lineHeight: 18, fontFamily: 'PublicSans_400Regular' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  bookTopic: { paddingHorizontal: spacing.sm, marginTop: spacing.sm, borderRadius: radii.md, backgroundColor: colors.brandPale },
  summaryToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  summaryLabel: { flex: 1, color: colors.brandDeep, fontSize: 12, fontFamily: 'PublicSans_600SemiBold' },
  topicTitle: { color: colors.inkStrong, fontSize: 14, lineHeight: 20, fontFamily: 'PublicSans_700Bold' },
  heading: { color: colors.inkStrong, fontSize: 16, fontFamily: 'PublicSans_700Bold', marginVertical: spacing.xs },
  label: { color: colors.secondary, fontSize: 11, letterSpacing: 0.6, fontFamily: 'PublicSans_700Bold' },
  hint: { color: colors.secondary, fontSize: 12, lineHeight: 19, marginVertical: spacing.xs, fontFamily: 'PublicSans_400Regular' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginVertical: spacing.xs },
  pathTrack: { flexDirection: 'row', marginTop: spacing.lg, padding: 4, gap: 4, borderRadius: 12, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceControl },
  pathButton: { flex: 1, minHeight: 44, paddingHorizontal: 4, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  pathSelected: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong },
  pathText: { flexShrink: 1, textAlign: 'center', color: colors.secondary, fontSize: 12, fontFamily: 'PublicSans_600SemiBold' },
  pathTextSelected: { color: colors.brandDeep, fontFamily: 'PublicSans_700Bold' },
  secondaryButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: spacing.xs, paddingHorizontal: spacing.xs, alignSelf: 'flex-start' },
  buttonText: { color: colors.brandDeep, fontSize: 12, fontFamily: 'PublicSans_600SemiBold' },
  selectorRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.lg, zIndex: 5 },
  selectorContainer: { flex: 1, minWidth: 0, zIndex: 5 },
  selector: { minHeight: 44, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12, backgroundColor: colors.surface },
  selectorLabel: { color: colors.secondary, fontFamily: 'PublicSans_700Bold', fontSize: 10, letterSpacing: 0.4 },
  selectorValue: { flex: 1, color: colors.brandDeep, fontFamily: 'PublicSans_600SemiBold', fontSize: 12 },
  selectorMenu: { position: 'absolute', top: 48, left: 0, right: 0, padding: 4, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12, backgroundColor: colors.surface, elevation: 5, shadowColor: colors.shadow, shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  selectorOption: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, borderRadius: 8 },
  selectorOptionSelected: { backgroundColor: colors.brandSoft },
  selectorOptionText: { color: colors.ink, fontSize: 12, fontFamily: 'PublicSans_400Regular' },
  selectorOptionTextSelected: { color: colors.brandDeep, fontFamily: 'PublicSans_700Bold' },
  variantPreview: { padding: spacing.md, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 16, backgroundColor: colors.surface },
  quoteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  variantReply: { flex: 1, color: colors.ink, fontFamily: 'Newsreader_400Regular_Italic', fontSize: 17, lineHeight: 25 },
  counter: { textAlign: 'right', color: colors.muted, fontFamily: 'PublicSans_600SemiBold', fontSize: 11, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.xs, marginTop: spacing.sm },
  actionTrack: { flexDirection: 'row', gap: spacing.xs, padding: 6, borderRadius: 12, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceControl },
  actionButton: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 9, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  actionText: { flexShrink: 1, textAlign: 'center', color: colors.brandDeep, fontSize: 12, fontFamily: 'PublicSans_600SemiBold' },
  staleNotice: { padding: spacing.sm, marginVertical: spacing.xs, borderRadius: radii.md, backgroundColor: colors.surfaceWarm, color: colors.ink, fontSize: 12, lineHeight: 19 },
  replaceNotice: { padding: spacing.sm, marginTop: spacing.sm, borderRadius: radii.md, backgroundColor: colors.surfaceWarm },
  composer: { padding: 14, marginTop: spacing.xs, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 16, backgroundColor: colors.surface },
  seedInput: { minHeight: 72, padding: 0, color: colors.ink, fontFamily: 'PublicSans_400Regular', fontSize: 14, lineHeight: 22 },
  input: { minHeight: 120, padding: spacing.sm, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.md, backgroundColor: colors.surfaceWarm, color: colors.ink, fontFamily: 'PublicSans_400Regular', fontSize: 14, lineHeight: 22 },
  consentCard: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12, backgroundColor: colors.surface, paddingHorizontal: spacing.sm },
  consentRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  consentControl: { flexGrow: 1, flexBasis: 180, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  checkbox: { width: 18, height: 18, flexShrink: 0, borderWidth: 1, borderColor: colors.muted, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { backgroundColor: colors.brandDeep, borderColor: colors.brandDeep },
  consentText: { flex: 1, color: colors.ink, fontFamily: 'PublicSans_600SemiBold', fontSize: 12, lineHeight: 17 },
  privacyToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2 },
  privacyText: { color: colors.secondary, fontFamily: 'PublicSans_400Regular', fontSize: 11, lineHeight: 17, paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border },
  primaryButton: { minHeight: 56, backgroundColor: colors.brandDeep, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.lg },
  primaryText: { color: colors.white, fontSize: 14, fontFamily: 'PublicSans_700Bold' },
  disabled: { opacity: 0.5 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 20, marginVertical: spacing.xs },
});
