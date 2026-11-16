import { useEffect, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Check, Copy, MessageCircle, Sparkles } from 'lucide-react-native';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Pressable from '@/components/MotionPressable';
import QuipBookPicker from '@/components/QuipBookPicker';
import type { Book } from '@/lib/books';
import type { QuipGenerationOptions } from '@/lib/trendInterceptor';
import { quipInputsMatch, type QuipDraftInputs } from '@/lib/quipSelection';
import { loadQuipBookDrafts } from '@/lib/quipCache';
import {
  QUIP_REPLY_LIMIT, QUIP_STANCES, SINGLE_BOOK_QUIP_STYLES,
  type QuipStance, type SingleBookQuipStyle,
} from '@/supabase/functions/_shared/quip';
import type { StoredQuipCacheVariant } from '@/supabase/functions/_shared/quipCache';
import { colors, pageLayout, radii, spacing, type } from '@/constants/theme';

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

type ReplySource = { kind: 'custom' | 'ready-made'; bookTitle: string; topic?: string };

export default function QuipWorkspace({
  sourceBooks, readBookIds, selectedBookId, onSelectBook, isSaving, refreshing, onRefresh, refreshError, onGenerate,
}: QuipWorkspaceProps) {
  const [path, setPath] = useState<'ready-made' | 'craft' | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pendingBookId, setPendingBookId] = useState<string | null>(null);
  const [seed, setSeed] = useState('');
  const [stance, setStance] = useState<QuipStance>('neutral');
  const [style, setStyle] = useState<SingleBookQuipStyle>('natural');
  const [consent, setConsent] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [variants, setVariants] = useState<StoredQuipCacheVariant[]>([]);
  const [loading, setLoading] = useState(false);
  const [cacheError, setCacheError] = useState('');
  const [retry, setRetry] = useState(0);
  const [reply, setReply] = useState('');
  const [replySource, setReplySource] = useState<ReplySource | null>(null);
  const [generatedInputs, setGeneratedInputs] = useState<QuipDraftInputs | null>(null);
  const [pendingVariant, setPendingVariant] = useState<StoredQuipCacheVariant | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const generationController = useRef<AbortController | null>(null);
  const scroll = useRef<ScrollView>(null);
  const shouldScrollToReply = useRef(false);
  const [replyRevision, setReplyRevision] = useState(0);
  const cache = useRef(new Map<string, StoredQuipCacheVariant[]>());
  const selectedBook = sourceBooks.find((book) => book.id === selectedBookId);
  const canCraft = Boolean(selectedBook && readBookIds.includes(selectedBook.id));
  const busy = generating || isSaving || refreshing;
  const inputs: QuipDraftInputs = { seed: seed.trim(), trendTopicId: null, bookIds: selectedBook ? [selectedBook.id] : [], stance, style };
  const latest = useRef({ inputs, canCraft });
  latest.current = { inputs, canCraft };
  const cacheKey = selectedBook ? JSON.stringify([selectedBook.id, selectedBook.title, selectedBook.author, selectedBook.note]) : '';
  const refreshWasActive = useRef(false);

  useEffect(() => () => generationController.current?.abort(), []);

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
      setPath((current) => current === 'craft' ? null : current);
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
    setVariants([]);
    setCacheError('');
    setPendingVariant(null);
    setLoading(false);
    if (path !== 'ready-made' || !selectedBookId || !cacheKey || refreshing) return;
    const saved = cache.current.get(cacheKey);
    if (saved) {
      setVariants(saved);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    void loadQuipBookDrafts(selectedBookId, controller.signal).then((rows) => {
      if (controller.signal.aborted) return;
      cache.current.set(cacheKey, rows);
      setVariants(rows);
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setCacheError(failure instanceof Error ? failure.message : 'Could not load ready-made Quips.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [path, selectedBookId, cacheKey, retry, refreshing]);

  const selectBook = (bookId: string) => {
    onSelectBook(bookId);
    setPath(null);
    setPendingBookId(null);
    setPendingVariant(null);
    setPickerVisible(false);
    setError('');
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
    try {
      const result = await onGenerate(requestedInputs.seed, null, [...requestedInputs.bookIds], { stance, style, signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!latest.current.canCraft || !quipInputsMatch(requestedInputs, latest.current.inputs)) {
        setError('Your book or inputs changed. Please generate again.');
        return;
      }
      setReply(result.reply);
      setReplySource({ kind: 'custom', bookTitle: title });
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

  const useVariant = (variant: StoredQuipCacheVariant) => {
    if (!selectedBook || variant.book_id !== selectedBook.id) return;
    setReply(variant.reply);
    setReplySource({ kind: 'ready-made', bookTitle: selectedBook.title, topic: variant.topic });
    setGeneratedInputs(null);
    setPendingVariant(null);
    setCopied(false);
    setError('');
    shouldScrollToReply.current = true;
    setReplyRevision((revision) => revision + 1);
  };

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(reply);
      setCopied(true);
      setError('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not copy this Quip.');
    }
  };

  return (
    <>
      <ScrollView ref={scroll} style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} enabled={!generating} onRefresh={onRefresh} />}>
        <Text style={styles.eyebrow}>QUIP</Text>
        <Text style={styles.title}>A book. A new perspective.</Text>
        {refreshError ? <Text accessibilityRole="alert" style={styles.error}>{refreshError}</Text> : null}
        <View style={styles.card}>
          <Text style={styles.label}>YOUR BOOK</Text>
          <Text style={styles.bookTitle}>{selectedBook?.title ?? 'Choose a book to start'}</Text>
          {selectedBook ? <Text style={styles.hint}>{selectedBook.author} · {canCraft ? 'Finished' : 'To read'}</Text> : null}
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => setPickerVisible(true)} style={styles.secondaryButton}>
            <MessageCircle color={colors.brandDeep} size={16} />
            <Text style={styles.buttonText}>{selectedBook ? 'Change book' : 'Choose a book'}</Text>
          </Pressable>
        </View>
        {pendingBookId ? (
          <View style={styles.card}>
            <Text style={styles.body}>Change books? Your idea and current draft will be kept. Crafting is available only for Finished books.</Text>
            <View style={styles.row}>
              <Pressable accessibilityRole="button" onPress={() => selectBook(pendingBookId)} style={styles.secondaryButton}><Text style={styles.buttonText}>Change book</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => setPendingBookId(null)} style={styles.secondaryButton}><Text style={styles.buttonText}>Cancel</Text></Pressable>
            </View>
          </View>
        ) : null}
        {selectedBook ? (
          <>
            <View style={styles.row}>
              <Pressable accessibilityRole="button" accessibilityState={{ selected: path === 'ready-made' }} disabled={busy} onPress={() => setPath('ready-made')}
                style={[styles.pathButton, path === 'ready-made' && styles.selected]}>
                <Text style={styles.buttonText}>Explore ready-made Quips</Text>
              </Pressable>
              {canCraft ? (
                <Pressable accessibilityRole="button" accessibilityState={{ selected: path === 'craft' }} disabled={busy} onPress={() => setPath('craft')}
                  style={[styles.pathButton, path === 'craft' && styles.selected]}>
                  <Text style={styles.buttonText}>Craft a Quip</Text>
                </Pressable>
              ) : null}
            </View>
            {!canCraft ? <Text style={styles.hint}>Ready-made Quips are available for this To read book. Custom crafting is reserved for Finished books.</Text> : null}
          </>
        ) : <Text style={styles.hint}>Choose from To read or Finished, or open a book from either shelf using Quip.</Text>}

        {selectedBook && path === 'ready-made' ? (
          <View style={styles.section}>
            <Text style={styles.heading}>Ready-made Quips</Text>
            <Text style={styles.hint}>AI-generated from the book summary, not tailored to your idea. Choose a draft to edit and copy.</Text>
            {loading ? <ActivityIndicator accessibilityLabel="Loading ready-made Quips" color={colors.brand} /> : null}
            {cacheError ? <View><Text accessibilityRole="alert" style={styles.error}>{cacheError}</Text>
              <Pressable accessibilityRole="button" onPress={() => setRetry((value) => value + 1)} style={styles.secondaryButton}><Text style={styles.buttonText}>Try again</Text></Pressable>
            </View> : null}
            {!loading && !cacheError && variants.length === 0 ? <Text style={styles.body}>Ready-made Quips are not available for this book yet.</Text> : null}
            {variants[0] ? <View style={styles.card}><Text style={styles.label}>BOOK TOPIC</Text><Text style={styles.heading}>{variants[0].topic}</Text><Text style={styles.hint}>{variants[0].topic_reason}</Text></View> : null}
            {variants.map((variant, index) => (
              <View key={`${variant.stance}:${variant.style}`} style={styles.card}>
                <Text style={styles.label}>QUIP {index + 1}</Text>
                <Text style={styles.body}>{variant.reply}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`Use Quip ${index + 1}`} onPress={() => reply && reply !== variant.reply ? setPendingVariant(variant) : useVariant(variant)} style={styles.secondaryButton}>
                  <Text style={styles.buttonText}>Use this Quip</Text>
                </Pressable>
                {pendingVariant === variant ? <View>
                  <Text style={styles.hint}>Replace your current draft? Any edits to that draft will be lost.</Text>
                  <View style={styles.row}>
                    <Pressable accessibilityRole="button" onPress={() => useVariant(variant)} style={styles.secondaryButton}><Text style={styles.buttonText}>Replace draft</Text></Pressable>
                    <Pressable accessibilityRole="button" onPress={() => setPendingVariant(null)} style={styles.secondaryButton}><Text style={styles.buttonText}>Cancel</Text></Pressable>
                  </View>
                </View> : null}
              </View>
            ))}
          </View>
        ) : null}

        {selectedBook && path === 'craft' && canCraft ? (
          <View style={styles.section}>
            <Text style={styles.heading}>Craft a Quip</Text>
            <Text style={styles.hint}>Your idea · Inspired by {selectedBook.title}</Text>
            <TextInput accessibilityLabel="Your Quip idea" placeholder="Share a thought or paste a post. Bring this book’s perspective to the conversation."
              placeholderTextColor={colors.secondary} value={seed} onChangeText={setSeed} editable={!busy} multiline maxLength={2000}
              textAlignVertical="top" style={styles.input} />
            <Text style={styles.hint}>{seed.length}/2000</Text>
            <Text style={styles.label}>STANCE</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel="Stance" style={styles.row}>
              {QUIP_STANCES.map((option) => <Pressable key={option.id} accessibilityRole="radio" accessibilityLabel={`${option.label} stance`}
                accessibilityState={{ checked: stance === option.id }} disabled={busy} onPress={() => setStance(option.id)}
                style={[styles.option, stance === option.id && styles.selected]}><Text style={styles.buttonText}>{option.label}</Text></Pressable>)}
            </View>
            <Text style={styles.label}>STYLE</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel="Style" style={styles.row}>
              {SINGLE_BOOK_QUIP_STYLES.map((option) => <Pressable key={option.id} accessibilityRole="radio" accessibilityLabel={`${option.label} style`}
                accessibilityState={{ checked: style === option.id }} disabled={busy} onPress={() => setStyle(option.id)}
                style={[styles.option, style === option.id && styles.selected]}><Text style={styles.buttonText}>{option.label}</Text></Pressable>)}
            </View>
            <Text style={styles.hint}>Crafting sends your idea and this book's catalog details to OpenAI via Supabase, not the full book. Remove private or sensitive information. AI can make mistakes; nothing is published automatically.</Text>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: consent }} disabled={busy} onPress={() => setConsent((value) => !value)} style={styles.secondaryButton}>
              <View style={[styles.checkbox, consent && styles.selected]}>{consent ? <Check color={colors.brand} size={16} /> : null}</View>
              <Text style={styles.consentText}>I agree to send Quip inputs to OpenAI.</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ busy: generating, disabled: busy || !consent || !seed.trim() }}
              disabled={busy || !consent || !seed.trim()} onPress={() => void generate()} style={[styles.primaryButton, (busy || !consent || !seed.trim()) && styles.disabled]}>
              {generating ? <ActivityIndicator color={colors.white} /> : <Sparkles color={colors.white} size={18} />}
              <Text style={styles.primaryText}>{generating ? 'Crafting…' : 'Generate Quip'}</Text>
            </Pressable>
          </View>
        ) : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {reply && replySource ? (
          <View style={styles.card}>
            <Text style={styles.heading}>{replySource.kind === 'ready-made' ? 'Your ready-made Quip' : 'Your crafted Quip'}</Text>
            <Text style={styles.hint}>From {replySource.bookTitle}{replySource.topic ? ` · ${replySource.topic}. Not tailored to your idea.` : ''}</Text>
            {replySource.kind === 'custom' && !quipInputsMatch(generatedInputs, inputs) ? <Text style={styles.hint}>Inputs changed. Generate again to update this draft.</Text> : null}
            <TextInput accessibilityLabel="Editable quip" value={reply} onChangeText={(text) => { setReply(text); setCopied(false); }} editable={!generating} multiline
              maxLength={QUIP_REPLY_LIMIT} style={styles.input} textAlignVertical="top" />
            <Text style={styles.hint}>{reply.length}/{QUIP_REPLY_LIMIT}</Text>
            <Pressable accessibilityRole="button" onPress={() => void copy()} style={styles.secondaryButton}>
              {copied ? <Check color={colors.brand} size={16} /> : <Copy color={colors.brand} size={16} />}<Text style={styles.buttonText}>{copied ? 'Copied' : 'Copy Quip'}</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
      {pickerVisible ? <QuipBookPicker books={sourceBooks} readBookIds={readBookIds} selectedId={selectedBookId}
        onSelect={(id) => {
          setPickerVisible(false);
          if (id === selectedBookId) return;
          if (seed.trim() || reply) setPendingBookId(id);
          else selectBook(id);
        }} onClose={() => setPickerVisible(false)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: pageLayout.content,
  eyebrow: pageLayout.eyebrow,
  title: pageLayout.title,
  section: { marginTop: spacing.md },
  card: { padding: spacing.md, marginVertical: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface },
  bookTitle: { color: colors.inkStrong, fontSize: type.heading, fontFamily: 'Newsreader_700Bold', marginTop: spacing.xs },
  heading: { color: colors.inkStrong, fontSize: type.subtitle, fontWeight: '700', marginVertical: spacing.xs },
  label: { color: colors.brandDeep, fontSize: type.caption, fontWeight: '700', marginTop: spacing.xs },
  body: { color: colors.body, fontSize: type.body, lineHeight: 22 },
  hint: { color: colors.secondary, fontSize: type.footnote, lineHeight: 19, marginVertical: spacing.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginVertical: spacing.xs },
  pathButton: { flexGrow: 1, minHeight: 48, padding: spacing.sm, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderStrong },
  selected: { backgroundColor: colors.brandPale, borderColor: colors.brand },
  secondaryButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, alignSelf: 'flex-start' },
  buttonText: { color: colors.brandDeep, fontSize: type.body, fontWeight: '600' },
  option: { minHeight: 44, paddingHorizontal: spacing.md, justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.pill },
  input: { minHeight: 120, padding: spacing.sm, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.md, backgroundColor: colors.surfaceWarm, color: colors.ink, fontSize: type.body, lineHeight: 22 },
  checkbox: { width: 24, height: 24, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  consentText: { flexShrink: 1, color: colors.body, fontSize: type.footnote },
  primaryButton: { minHeight: 48, backgroundColor: colors.brand, borderRadius: radii.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, marginVertical: spacing.sm },
  primaryText: { color: colors.white, fontSize: type.body, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  error: { color: colors.danger, fontSize: type.footnote, lineHeight: 20, marginVertical: spacing.xs },
});
