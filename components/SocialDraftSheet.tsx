import { useEffect, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Check, Copy, Share2, X } from 'lucide-react-native';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Book } from '@/lib/books';
import type { SocialPlatform } from '@/lib/socialGhostwriter';

type SocialDraftSheetProps = {
  visible: boolean;
  book: Book | null;
  onClose: () => void;
  onGenerate: (bookId: string, platform: SocialPlatform) => Promise<string>;
};

export default function SocialDraftSheet({ visible, book, onClose, onGenerate }: SocialDraftSheetProps) {
  const [platform, setPlatform] = useState<SocialPlatform>('linkedin');
  const [draft, setDraft] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const characterLimit = platform === 'x' ? 280 : 3000;

  useEffect(() => {
    if (!visible) return;
    setPlatform('linkedin');
    setDraft('');
    setErrorMessage('');
    setIsCopied(false);
  }, [visible, book?.id]);

  const choosePlatform = (nextPlatform: SocialPlatform) => {
    setPlatform(nextPlatform);
    setDraft('');
    setErrorMessage('');
    setIsCopied(false);
  };

  const generate = async () => {
    if (!book || isGenerating) return;
    setIsGenerating(true);
    setErrorMessage('');
    setIsCopied(false);
    try {
      setDraft(await onGenerate(book.id, platform));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not draft a social post.');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyDraft = async () => {
    if (!draft) return;
    try {
      await Clipboard.setStringAsync(draft);
      setIsCopied(true);
    } catch {
      setErrorMessage('Could not copy the draft on this device.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close social draft" onPress={onClose} style={styles.backdrop} />
        <View accessibilityViewIsModal style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerIcon}><Share2 color="#2e6d58" size={18} /></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close social draft" onPress={onClose} style={styles.closeButton}>
              <X color="#65736a" size={18} />
            </Pressable>
          </View>

          <Text style={styles.eyebrow}>FROM YOUR READ SHELF</Text>
          <Text style={styles.title}>Draft a post</Text>
          <Text style={styles.bookLine}>{book?.title} · {book?.author}</Text>

          <View accessibilityRole="tablist" style={styles.platformControl}>
            {(['linkedin', 'x'] as const).map((item) => (
              <Pressable
                key={item}
                accessibilityRole="tab"
                accessibilityState={{ selected: platform === item }}
                onPress={() => choosePlatform(item)}
                style={[styles.platformTab, platform === item && styles.platformTabSelected]}
              >
                <Text style={[styles.platformLabel, platform === item && styles.platformLabelSelected]}>{item === 'linkedin' ? 'LinkedIn' : 'X'}</Text>
              </Pressable>
            ))}
          </View>

          {draft ? (
            <TextInput
              accessibilityLabel={`Editable ${platform === 'x' ? 'X' : 'LinkedIn'} post draft`}
              autoCorrect
              maxLength={characterLimit}
              multiline
              onChangeText={(text) => { setDraft(text); setIsCopied(false); }}
              placeholder="Your draft will appear here."
              style={styles.draftInput}
              textAlignVertical="top"
              value={draft}
            />
          ) : (
            <Text style={styles.description}>Generate an original draft, edit it here, then copy it wherever you want to share.</Text>
          )}

          {draft ? <Text style={styles.characterCount}>{draft.length} / {characterLimit}</Text> : null}
          {errorMessage ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text> : null}

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={!book || isGenerating}
              onPress={() => void generate()}
              style={({ pressed }) => [styles.generateButton, (!book || isGenerating) && styles.disabled, pressed && styles.pressed]}
            >
              <Text style={styles.generateLabel}>{isGenerating ? 'DRAFTING…' : draft ? 'REGENERATE' : 'GENERATE DRAFT'}</Text>
            </Pressable>
            {draft ? (
              <Pressable accessibilityRole="button" onPress={() => void copyDraft()} style={styles.copyButton}>
                {isCopied ? <Check color="#34755e" size={16} /> : <Copy color="#34755e" size={16} />}
                <Text style={styles.copyLabel}>{isCopied ? 'COPIED' : 'COPY'}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, backgroundColor: 'rgba(24, 39, 33, 0.42)' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { width: '100%', maxWidth: 520, borderRadius: 7, borderWidth: 1, borderColor: '#dde4dc', backgroundColor: '#fbfcf8', padding: 26, shadowColor: '#13241c', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 },
  headerIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#e5f1e8', alignItems: 'center', justifyContent: 'center' },
  closeButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#6f8175', fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: '#29382f', fontSize: 25, lineHeight: 31, fontWeight: '600', marginTop: 6 },
  bookLine: { color: '#68766d', fontSize: 13, lineHeight: 20, marginTop: 8 },
  platformControl: { flexDirection: 'row', padding: 3, marginTop: 20, borderWidth: 1, borderColor: '#d8e0d7', borderRadius: 5, backgroundColor: '#f0f3ee' },
  platformTab: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 3 },
  platformTabSelected: { backgroundColor: '#34755e' },
  platformLabel: { color: '#526259', fontSize: 12, fontWeight: '600' },
  platformLabelSelected: { color: '#fffaf6' },
  description: { color: '#68766d', fontSize: 13, lineHeight: 20, marginTop: 16 },
  draftInput: { minHeight: 180, maxHeight: 320, borderWidth: 1, borderColor: '#d8e0d7', borderRadius: 4, padding: 13, marginTop: 14, color: '#29382f', backgroundColor: '#fff', fontSize: 14, lineHeight: 21 },
  characterCount: { color: '#879188', fontSize: 10, textAlign: 'right', marginTop: 6 },
  error: { color: '#a9443d', fontSize: 12, lineHeight: 18, marginTop: 10 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  generateButton: { minHeight: 42, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, borderRadius: 4, backgroundColor: '#34755e' },
  generateLabel: { color: '#fffaf6', fontSize: 9, fontWeight: '800', letterSpacing: 0.65 },
  copyButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 14, borderRadius: 4, backgroundColor: '#e5f1e8' },
  copyLabel: { color: '#2f725b', fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});