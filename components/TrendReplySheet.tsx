import { useEffect, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Check, Copy, MessageCircle, X } from 'lucide-react-native';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Book } from '@/lib/books';

type TrendReplySheetProps = {
  visible: boolean;
  books: Book[];
  onClose: () => void;
  onGenerate: (trendText: string) => Promise<string>;
};

export default function TrendReplySheet({ visible, books, onClose, onGenerate }: TrendReplySheetProps) {
  const [trendText, setTrendText] = useState('');
  const [reply, setReply] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const replyLimit = 600;

  useEffect(() => {
    if (!visible) return;
    setTrendText('');
    setReply('');
    setErrorMessage('');
    setIsCopied(false);
  }, [visible]);

  const generate = async () => {
    if (books.length === 0 || !trendText.trim() || isGenerating) return;
    setIsGenerating(true);
    setErrorMessage('');
    setIsCopied(false);
    try {
      setReply(await onGenerate(trendText.trim()));
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close trend reply" onPress={onClose} style={styles.backdrop} />
        <View accessibilityViewIsModal style={styles.sheet}>
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
              Your reply will draw on all {books.length} Quip-enabled Read {books.length === 1 ? 'book' : 'books'}.
            </Text>

            <Text style={styles.fieldLabel}>POST OR TOPIC</Text>
            <TextInput
              accessibilityLabel="Paste a trend post or topic"
              autoCorrect
              maxLength={2000}
              multiline
              onChangeText={(text) => { setTrendText(text); setReply(''); setIsCopied(false); }}
              placeholder="Paste the post or describe the topic…"
              style={styles.trendInput}
              textAlignVertical="top"
              value={trendText}
            />
            <Text style={styles.characterCount}>{trendText.length} / 2000</Text>

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
                disabled={books.length === 0 || !trendText.trim() || isGenerating}
                onPress={() => void generate()}
                style={({ pressed }) => [styles.generateButton, (books.length === 0 || !trendText.trim() || isGenerating) && styles.disabled, pressed && styles.pressed]}
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, backgroundColor: 'rgba(24, 39, 33, 0.42)' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { width: '100%', maxWidth: 520, maxHeight: '90%', borderRadius: 7, borderWidth: 1, borderColor: '#dde4dc', backgroundColor: '#fbfcf8', padding: 22, shadowColor: '#13241c', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  headerIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#e5f1e8', alignItems: 'center', justifyContent: 'center' },
  closeButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: 6 },
  eyebrow: { color: '#6f8175', fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: '#29382f', fontSize: 25, lineHeight: 31, fontWeight: '600', marginTop: 6 },
  description: { color: '#68766d', fontSize: 13, lineHeight: 19, marginTop: 7 },
  bookSearch: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: '#d8e0d7', borderRadius: 4, paddingHorizontal: 11, marginTop: 17, backgroundColor: '#fff' },
  bookSearchInput: { flex: 1, minWidth: 0, height: 40, color: '#29382f', fontSize: 12 },
  bookResults: { borderWidth: 1, borderColor: '#d8e0d7', borderTopWidth: 0, maxHeight: 190, overflow: 'hidden' },
  bookResult: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 11, borderTopWidth: 1, borderTopColor: '#e8ece6' },
  bookResultText: { flex: 1, minWidth: 0 },
  bookSwatch: { width: 4, height: 30, borderRadius: 2 },
  selectedBookRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: 1, borderBottomColor: '#dfe4dc', marginTop: 12 },
  selectedBookText: { flex: 1, minWidth: 0 },
  selectedBookTitle: { color: '#29382f', fontSize: 12, fontWeight: '600' },
  selectedBookAuthor: { color: '#78857d', fontSize: 10, marginTop: 3 },
  changeBookButton: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 9 },
  changeBookLabel: { color: '#34755e', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  noBooks: { color: '#78857d', fontSize: 11, lineHeight: 16, marginTop: 10 },
  fieldHint: { color: '#879188', fontSize: 10, marginTop: 7 },
  fieldLabel: { color: '#78887d', fontSize: 8, fontWeight: '700', letterSpacing: 0.9, marginTop: 16 },
  platformControl: { flexDirection: 'row', padding: 3, marginTop: 7, borderWidth: 1, borderColor: '#d8e0d7', borderRadius: 5, backgroundColor: '#f0f3ee' },
  platformTab: { flex: 1, minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 3 },
  platformTabSelected: { backgroundColor: '#34755e' },
  platformLabel: { color: '#526259', fontSize: 11, fontWeight: '600' },
  platformLabelSelected: { color: '#fffaf6' },
  trendInput: { minHeight: 84, maxHeight: 150, borderWidth: 1, borderColor: '#d8e0d7', borderRadius: 4, padding: 10, marginTop: 7, color: '#29382f', backgroundColor: '#fff', fontSize: 12, lineHeight: 18 },
  replyInput: { minHeight: 100, maxHeight: 220, borderWidth: 1, borderColor: '#d8e0d7', borderRadius: 4, padding: 10, marginTop: 7, color: '#29382f', backgroundColor: '#fff', fontSize: 13, lineHeight: 19 },
  characterCount: { color: '#879188', fontSize: 9, textAlign: 'right', marginTop: 4 },
  error: { color: '#a9443d', fontSize: 11, lineHeight: 16, marginTop: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 9, marginTop: 16 },
  generateButton: { minHeight: 40, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14, borderRadius: 4, backgroundColor: '#34755e' },
  generateLabel: { color: '#fffaf6', fontSize: 8, fontWeight: '800', letterSpacing: 0.6 },
  copyButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12, borderRadius: 4, backgroundColor: '#e5f1e8' },
  copyLabel: { color: '#2f725b', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});