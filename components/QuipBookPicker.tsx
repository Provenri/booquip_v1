import { FlashList } from '@shopify/flash-list';
import { Check, X } from 'lucide-react-native';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BookListCard from '@/components/BookListCard';
import Pressable from '@/components/MotionPressable';
import type { Book } from '@/lib/books';
import { colors, radii, spacing, type } from '@/constants/theme';

export default function QuipBookPicker({ books, readBookIds, selectedId, onSelect, onClose }: {
  books: Book[];
  readBookIds: string[];
  selectedId: string | null;
  onSelect: (bookId: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close book picker" onPress={onClose} style={styles.backdrop} />
        <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Choose a book</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close book picker" onPress={onClose} style={styles.close}>
              <X color={colors.secondary} size={20} />
            </Pressable>
          </View>
          <Text style={styles.hint}>Choose from To read or Finished.</Text>
          <FlashList
            data={books}
            keyExtractor={(book) => book.id}
            extraData={[selectedId, readBookIds]}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: item.id === selectedId }}
                accessibilityLabel={`Use ${item.title} by ${item.author}`}
                onPress={() => onSelect(item.id)}
                style={styles.row}
              >
                <BookListCard book={item} selected={item.id === selectedId}
                  annotation={<Text style={styles.shelf}>{readBookIds.includes(item.id) ? 'Finished' : 'To read'}</Text>}>
                  {item.id === selectedId ? <Check color={colors.brand} size={20} /> : null}
                </BookListCard>
              </Pressable>
            )}
            ListEmptyComponent={<Text style={styles.hint}>Save a book to To read or Finished to start a Quip.</Text>}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { width: '100%', maxWidth: 650, height: '75%', padding: spacing.md, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.inkStrong, fontSize: type.body, fontWeight: '700' },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  hint: { color: colors.secondary, fontSize: type.caption, lineHeight: 18, marginBottom: spacing.sm },
  row: { marginBottom: spacing.xs },
  shelf: { color: colors.brandDeep, fontSize: type.caption, marginTop: 4 },
});
