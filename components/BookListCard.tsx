import { useState, type ReactNode } from 'react';
import { BookOpen } from 'lucide-react-native';
import { Image, StyleSheet, Text, View } from 'react-native';
import { PILLARS, type Book } from '@/lib/books';
import { colors, radii, spacing, type } from '@/constants/theme';

export default function BookListCard({
  book,
  selected = false,
  children,
}: {
  book: Book;
  selected?: boolean;
  children?: ReactNode;
}) {
  const [coverFailed, setCoverFailed] = useState(false);
  const coverUri = book.coverUrl ?? (book.isbn ? `https://covers.openlibrary.org/b/isbn/${book.isbn}-M.jpg` : null);
  const pillarLabel = PILLARS.find((pillar) => pillar.id === book.pillar)?.label ?? book.pillar;

  return (
    <View style={[styles.card, selected && styles.cardSelected]}>
      <View style={[styles.cover, { backgroundColor: book.color }]}>
        <BookOpen color={colors.white} size={19} />
        {!coverFailed && coverUri ? (
          <Image
            accessibilityLabel={`Cover of ${book.title}`}
            onError={() => setCoverFailed(true)}
            resizeMode="cover"
            source={{ uri: coverUri }}
            style={styles.coverImage}
          />
        ) : null}
      </View>
      <View style={styles.bookCopy}>
        <View style={styles.bookMetaRow}>
          <Text style={styles.bookPillar}>{pillarLabel.toUpperCase()}</Text>
          {book.year ? <Text style={styles.bookYear}>{book.year}</Text> : null}
        </View>
        <Text numberOfLines={1} style={styles.bookTitle}>{book.title}</Text>
        <Text numberOfLines={1} style={styles.bookAuthor}>{book.author}</Text>
        <Text numberOfLines={1} style={styles.bookNote}>{book.note}</Text>
      </View>
      {children ? <View style={styles.accessory}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 100, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surface },
  cardSelected: { borderColor: '#bdd8ca' },
  cover: { width: 52, height: 74, position: 'relative', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  coverImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  bookCopy: { flex: 1, minWidth: 0 },
  bookMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 2 },
  bookPillar: { color: colors.brandDeep, fontSize: type.label, fontWeight: '700', letterSpacing: 0.5 },
  bookYear: { color: colors.secondary, fontSize: type.bodySmall },
  bookTitle: { color: colors.inkStrong, fontSize: type.subtitle, fontFamily: 'Newsreader_700Bold' },
  bookAuthor: { color: colors.body, fontSize: type.bodySmall, marginTop: 2 },
  bookNote: { color: colors.secondary, fontSize: type.label, marginTop: 3 },
  accessory: { alignItems: 'flex-end', justifyContent: 'center', gap: spacing.xs },
});
