import { useEffect, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Check, CheckSquare, Copy, MessageCircle, PenLine, Square, TrendingUp, X } from 'lucide-react-native';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import type { Book } from '@/lib/books';
import { extractScreenshotTopic } from '@/lib/screenshotTopic';
import type { QuipTrendTopic } from '@/lib/quipTrends';
import TrendPickerSheet from '@/components/TrendPickerSheet';

type TopicSource = 'write' | 'screenshot' | 'trend';

type TrendReplySheetProps = {
  visible: boolean;
  books: Book[];
  onClose: () => void;
  onGenerate: (trendText: string, trendTopicId: string | null, bookIds: string[]) => Promise<string>;
};

const TOPIC_SOURCES: { id: TopicSource; label: string; icon: typeof PenLine }[] = [
  { id: 'write', label: 'Write', icon: PenLine },
  { id: 'screenshot', label: 'Screenshot', icon: Camera },
  { id: 'trend', label: 'Trend', icon: TrendingUp },
];

const SCREENSHOT_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_SCREENSHOT_BASE64_LENGTH = 5_600_000;

export default function TrendReplySheet({ visible, books, onClose, onGenerate }: TrendReplySheetProps) {
  const { width } = useWindowDimensions();
  const isCompact = width < 700;
  const [topicSource, setTopicSource] = useState<TopicSource>('write');
  const [trendText, setTrendText] = useState('');
  const [selectedTrendTopic, setSelectedTrendTopic] = useState<QuipTrendTopic | null>(null);
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [hasExtractedText, setHasExtractedText] = useState(false);
  const [selectedBookIds, setSelectedBookIds] = useState<string[]>([]);
  const [reply, setReply] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const replyLimit = 600;

  const allSelected = books.length > 0 && selectedBookIds.length === books.length;
  const canGenerate = selectedBookIds.length > 0 && Boolean(trendText.trim()) && !isGenerating && !isExtracting;

  useEffect(() => {
    if (!visible) return;
    setTopicSource('write');
    setTrendText('');
    setSelectedTrendTopic(null);
    setIsPickerVisible(false);
    setIsExtracting(false);
    setHasExtractedText(false);
    setSelectedBookIds(books.map((item) => item.id));
    setReply('');
    setErrorMessage('');
    setIsCopied(false);
    // Reset per open; the Quip-enabled shelf is fixed while the sheet shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const resetDraft = () => {
    setReply('');
    setErrorMessage('');
    setIsCopied(false);
  };

  const switchTopicSource = (source: TopicSource) => {
    if (source === topicSource) return;
    setTopicSource(source);
    setTrendText('');
    setSelectedTrendTopic(null);
    setHasExtractedText(false);
    resetDraft();
  };

  const updateTrendText = (text: string) => {
    setTrendText(text);
    resetDraft();
  };

  const selectTrendTopic = (topic: QuipTrendTopic) => {
    setSelectedTrendTopic(topic);
    setTrendText(topic.topic);
    setIsPickerVisible(false);
    resetDraft();
  };

  const toggleAllBooks = () => {
    setSelectedBookIds(allSelected ? [] : books.map((item) => item.id));
    resetDraft();
  };

  const toggleBook = (bookId: string) => {
    setSelectedBookIds((current) =>
      current.includes(bookId) ? current.filter((id) => id !== bookId) : [...current, bookId],
    );
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
    } catch {
      setErrorMessage('Could not open the image library on this device.');
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
      const text = await extractScreenshotTopic(base64, mimeType);
      setTrendText(text);
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
      const trendTopicId = topicSource === 'trend' && selectedTrendTopic ? selectedTrendTopic.id : null;
      setReply(await onGenerate(trendText.trim(), trendTopicId, selectedBookIds));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not draft a trend reply.');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyReply = async () => {
    if (!reply) return;
    try {
      await Clipboard.setStringAsync(reply);
      setIsCopied(true);
    } catch {
      setErrorMessage('Could not copy the reply on this device.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType={isCompact ? 'slide' : 'fade'} onRequestClose={onClose}>
      <View style={[styles.overlay, isCompact && styles.overlayMobile]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close trend reply" onPress={onClose} style={styles.backdrop} />
        <View accessibilityViewIsModal style={[styles.sheet, isCompact && styles.sheetMobile]}>
          <View style={styles.header}>
            <View style={styles.headerIcon}><MessageCircle color="#2e6d58" size={18} /></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close trend reply" onPress={onClose} style={styles.closeButton}>
              <X color="#65736a" size={18} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <Text style={styles.eyebrow}>FROM YOUR READ SHELF</Text>
            <Text style={styles.title}>Reply</Text>
            <Text style={styles.description}>
              Your reply will draw on {selectedBookIds.length} of {books.length} Quip-enabled Read {books.length === 1 ? 'book' : 'books'}.
            </Text>

            <Text style={styles.fieldLabel}>TOPIC</Text>
            <Text style={styles.fieldHint}>Write the topic, upload a screenshot of a post, or pick a trending topic.</Text>
            <View accessibilityRole="tablist" style={styles.sourceFilter}>
              {TOPIC_SOURCES.map(({ id, label, icon: Icon }) => (
                <Pressable
                  key={id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: topicSource === id }}
                  onPress={() => switchTopicSource(id)}
                  style={[styles.sourceTab, topicSource === id && styles.sourceTabSelected]}
                >
                  <Icon color={topicSource === id ? '#fffaf6' : '#526259'} size={12} strokeWidth={2} />
                  <Text style={[styles.sourceTabLabel, topicSource === id && styles.sourceTabLabelSelected]}>{label}</Text>
                </Pressable>
              ))}
            </View>

            {topicSource === 'write' ? (
              <>
                <TextInput
                  accessibilityLabel="Paste a trend post or topic"
                  autoCorrect
                  maxLength={2000}
                  multiline
                  onChangeText={updateTrendText}
                  placeholder="Paste the post or describe the topic…"
                  style={styles.trendInput}
                  textAlignVertical="top"
                  value={trendText}
                />
                <Text style={styles.characterCount}>{trendText.length} / 2000</Text>
              </>
            ) : topicSource === 'screenshot' ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  disabled={isExtracting}
                  onPress={() => void pickScreenshot()}
                  style={({ pressed }) => [styles.uploadButton, isExtracting && styles.disabled, pressed && styles.pressed]}
                >
                  <Camera color="#34755e" size={14} />
                  <Text style={styles.uploadLabel}>
                    {isExtracting ? 'READING SCREENSHOT…' : hasExtractedText ? 'REPLACE SCREENSHOT' : 'UPLOAD SCREENSHOT'}
                  </Text>
                </Pressable>
                {hasExtractedText ? (
                  <>
                    <Text style={styles.fieldHint}>Review and edit the text we read from your screenshot.</Text>
                    <TextInput
                      accessibilityLabel="Extracted screenshot text"
                      autoCorrect
                      maxLength={2000}
                      multiline
                      onChangeText={updateTrendText}
                      style={styles.trendInput}
                      textAlignVertical="top"
                      value={trendText}
                    />
                    <Text style={styles.characterCount}>{trendText.length} / 2000</Text>
                  </>
                ) : (
                  <Text style={styles.fieldHint}>PNG, JPEG, or WebP up to 4 MB. We extract the post text for you to review.</Text>
                )}
              </>
            ) : (
              <>
                {selectedTrendTopic ? (
                  <View style={styles.trendChip}>
                    <View style={styles.trendChipCopy}>
                      <View style={styles.trendChipRow}>
                        <Text style={styles.trendChipTopic}>{selectedTrendTopic.topic}</Text>
                        <Text style={styles.trendChipCountry}>{selectedTrendTopic.countryCode}</Text>
                      </View>
                      {selectedTrendTopic.summary ? <Text style={styles.trendChipSummary}>{selectedTrendTopic.summary}</Text> : null}
                    </View>
                    <Pressable accessibilityRole="button" onPress={() => setIsPickerVisible(true)} style={styles.trendChangeButton}>
                      <Text style={styles.trendChangeLabel}>CHANGE</Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setIsPickerVisible(true)}
                      style={({ pressed }) => [styles.uploadButton, pressed && styles.pressed]}
                    >
                      <TrendingUp color="#34755e" size={14} />
                      <Text style={styles.uploadLabel}>CHOOSE A TREND</Text>
                    </Pressable>
                    <Text style={styles.fieldHint}>Pick from recent Google Trends topics. Related headlines are added to your reply context.</Text>
                  </>
                )}
              </>
            )}

            <View style={styles.booksHeader}>
              <Text style={[styles.fieldLabel, styles.booksHeaderLabel]}>BOOKS IN THIS REPLY</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ checked: allSelected }}
                onPress={toggleAllBooks}
                style={({ pressed }) => [styles.selectAllButton, pressed && styles.pressed]}
              >
                <Text style={styles.selectAllLabel}>{allSelected ? 'DESELECT ALL' : 'SELECT ALL'}</Text>
                {allSelected
                  ? <CheckSquare color="#34755e" size={15} strokeWidth={2} />
                  : <Square color="#8d998f" size={15} strokeWidth={2} />}
              </Pressable>
            </View>
            <View style={styles.bookList}>
              {books.map((item) => {
                const checked = selectedBookIds.includes(item.id);
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    accessibilityLabel={`Include ${item.title} in this reply`}
                    onPress={() => toggleBook(item.id)}
                    style={({ pressed }) => [styles.bookRow, pressed && styles.pressed]}
                  >
                    <View style={styles.bookRowCopy}>
                      <Text numberOfLines={1} style={styles.bookRowTitle}>{item.title}</Text>
                      <Text numberOfLines={1} style={styles.bookRowAuthor}>{item.author}</Text>
                    </View>
                    {checked
                      ? <CheckSquare color="#34755e" size={16} strokeWidth={2} />
                      : <Square color="#8d998f" size={16} strokeWidth={2} />}
                  </Pressable>
                );
              })}
            </View>
            {selectedBookIds.length === 0 ? (
              <Text style={styles.fieldHint}>Select at least one book to draft a reply.</Text>
            ) : null}

            {reply ? (
              <>
                <Text style={styles.fieldLabel}>EDIT YOUR REPLY</Text>
                <TextInput
                  accessibilityLabel="Editable reply draft"
                  autoCorrect
                  maxLength={replyLimit}
                  multiline
                  onChangeText={(text) => { setReply(text); setIsCopied(false); }}
                  style={styles.replyInput}
                  textAlignVertical="top"
                  value={reply}
                />
                <Text style={styles.characterCount}>{reply.length} / {replyLimit}</Text>
              </>
            ) : null}

            {errorMessage ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text> : null}

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                disabled={!canGenerate}
                onPress={() => void generate()}
                style={({ pressed }) => [styles.generateButton, !canGenerate && styles.disabled, pressed && styles.pressed]}
              >
                <Text style={styles.generateLabel}>{isGenerating ? 'DRAFTING…' : 'REPLY'}</Text>
              </Pressable>
              {reply ? (
                <Pressable accessibilityRole="button" onPress={() => void copyReply()} style={styles.copyButton}>
                  {isCopied ? <Check color="#34755e" size={16} /> : <Copy color="#34755e" size={16} />}
                  <Text style={styles.copyLabel}>{isCopied ? 'COPIED' : 'COPY'}</Text>
                </Pressable>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </View>

      <TrendPickerSheet
        visible={isPickerVisible}
        onClose={() => setIsPickerVisible(false)}
        onSelect={selectTrendTopic}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, backgroundColor: 'rgba(24, 39, 33, 0.42)' },
  overlayMobile: { justifyContent: 'flex-end', paddingHorizontal: 0 },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { width: '100%', maxWidth: 520, maxHeight: '90%', borderRadius: 20, borderWidth: 1, borderColor: '#eee9df', backgroundColor: '#fffefa', padding: 22, shadowColor: '#13241c', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  sheetMobile: { maxWidth: '100%', maxHeight: '92%', marginTop: 'auto', padding: 20, paddingBottom: 28, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderTopLeftRadius: 26, borderTopRightRadius: 26 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  headerIcon: { width: 42, height: 42, borderRadius: 16, backgroundColor: '#e7f1e6', alignItems: 'center', justifyContent: 'center' },
  closeButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#f1f1ea' },
  content: { paddingBottom: 6 },
  eyebrow: { color: '#6f8175', fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: '#29382f', fontSize: 28, lineHeight: 34, fontWeight: '700', marginTop: 6 },
  description: { color: '#68766d', fontSize: 14, lineHeight: 21, marginTop: 7 },
  sourceFilter: { flexDirection: 'row', alignSelf: 'stretch', gap: 4, padding: 4, marginTop: 12, borderWidth: 1, borderColor: '#e5e4d9', borderRadius: 14, backgroundColor: '#f5f4ed' },
  sourceTab: { flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8, borderRadius: 11 },
  sourceTabSelected: { backgroundColor: '#2f725b' },
  sourceTabLabel: { color: '#526259', fontSize: 11, fontWeight: '700' },
  sourceTabLabelSelected: { color: '#fffaf6' },
  trendInput: { minHeight: 100, maxHeight: 160, borderWidth: 1, borderColor: '#e5e4d9', borderRadius: 14, padding: 14, marginTop: 10, color: '#29382f', backgroundColor: '#fff', fontSize: 15, lineHeight: 22 },
  uploadButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'stretch', paddingHorizontal: 14, borderRadius: 14, marginTop: 10, backgroundColor: '#e7f1e6' },
  uploadLabel: { color: '#2f725b', fontSize: 11, fontWeight: '700' },
  trendChip: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: '#dbe6d9', borderRadius: 14, backgroundColor: '#f5f7f1', padding: 12, marginTop: 10 },
  trendChipCopy: { flex: 1, minWidth: 0 },
  trendChipRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  trendChipTopic: { flex: 1, color: '#29382f', fontSize: 14, fontWeight: '700' },
  trendChipCountry: { color: '#78887d', fontSize: 8, fontWeight: '800' },
  trendChipSummary: { color: '#68766d', fontSize: 10, lineHeight: 14, marginTop: 3 },
  trendChangeButton: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 8 },
  trendChangeLabel: { color: '#34755e', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  booksHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 },
  booksHeaderLabel: { marginTop: 0 },
  selectAllButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 8, borderRadius: 12, backgroundColor: '#edf2e9' },
  selectAllLabel: { color: '#34755e', fontSize: 10, fontWeight: '700' },
  bookList: { gap: 7, marginTop: 8 },
  bookRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#eee9df', borderRadius: 13, backgroundColor: '#fffefa' },
  bookRowCopy: { flex: 1, minWidth: 0 },
  bookRowTitle: { color: '#35433b', fontSize: 13, fontWeight: '700' },
  bookRowAuthor: { color: '#78857d', fontSize: 11, marginTop: 3 },
  fieldHint: { color: '#879188', fontSize: 12, lineHeight: 17, marginTop: 8 },
  fieldLabel: { color: '#78887d', fontSize: 10, fontWeight: '700', letterSpacing: 0.6, marginTop: 18 },
  replyInput: { minHeight: 120, maxHeight: 240, borderWidth: 1, borderColor: '#e5e4d9', borderRadius: 14, padding: 14, marginTop: 8, color: '#29382f', backgroundColor: '#fff', fontSize: 15, lineHeight: 22 },
  characterCount: { color: '#879188', fontSize: 9, textAlign: 'right', marginTop: 4 },
  error: { color: '#a9443d', fontSize: 11, lineHeight: 16, marginTop: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 9, marginTop: 18 },
  generateButton: { minHeight: 50, flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, borderRadius: 15, backgroundColor: '#2f725b' },
  generateLabel: { color: '#fffaf6', fontSize: 12, fontWeight: '700' },
  copyButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 16, borderRadius: 15, backgroundColor: '#e7f1e6' },
  copyLabel: { color: '#2f725b', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
