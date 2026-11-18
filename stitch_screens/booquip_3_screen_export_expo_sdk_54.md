# Booquip Mobile Screens Export (React Native / Expo SDK 54)

Repository: `Provenri/booquip_v1`  
Design System: **Botanical Editorial**  
Target Screens:
1. **Book Discovery** (`Screen 1` / `Booquip - Dynamic Category Discovery`): 60px header with Search, Category Filter Pills (`Screen`, `Charts`, `Classics`, `✨ Surprise`), Gestures banner, Centered Book Cover Art, Tagline Quote, Keywords, On Screen Film Adaptation card, and full-width `Snooze` & `30S READ` action buttons.
2. **Quip Studio / Craft a Quip** (`Screen 2` / `Booquip - Quip (Single-Book Workflow)`): Selected Book card with `Finished shelf` badge, Sub-navigation toggle (`Explore ready-made` vs `Craft a Quip`), Thought Seed input area with 280-char counter, Compact Inline Dropdown Pills (`STANCE: Neutral`, `STYLE: Neutral`), Collapsible OpenAI Consent agreement, and primary `Generate Quip` CTA.
3. **Explore Ready-made Quips** (`Screen 3` / `Booquip - Explore Ready-made Quips`): Active book indicator, Sub-navigation toggle, Compact Inline Dropdown Pills (`STANCE: Neutral`, `STYLE: Neutral`), Ready-made quote draft preview card with 280-char counter, and dark-container action group with `Refine in Craft` and `Copy as-is`.

Shared Chrome across all 3 screens:
- **Top Header**: Fixed 60px height, Botanical squircle logo container (36x36px with rounded-xl), open-book glyph, Newsreader serif brand title.
- **Bottom Tab Navigation Bar**: Fixed 4-tab bar (`Book`, `Quip` with active indicator/badge, `Shelf`, `Account`).

---

## 1. Directory Structure

```text
├── app/
│   ├── (tabs)/
│   │   ├── _layout.tsx              # 4-tab navigation layout
│   │   ├── index.tsx                # Book Discovery Screen
│   │   └── quip/
│   │       ├── index.tsx            # Quip Studio / Craft Screen
│   │       └── explore.tsx          # Explore Ready-made Screen
│   ├── shelf.tsx                    # Shelf overview
│   └── account.tsx                  # Account & Sync
├── components/
│   ├── Header.tsx                   # Standardized 60px Top Header
│   ├── CategoryPills.tsx            # Category Filter Row (Screen, Charts, Classics, Surprise)
│   ├── BookDiscoveryCard.tsx        # Centered Cover + Quote + Movie card + Snooze/30s Read
│   ├── SelectedBookBanner.tsx       # Selected book indicator with "Change book" action
│   ├── SubNavToggle.tsx             # "Explore ready-made" vs "Craft a Quip" segmented control
│   ├── StanceStylePills.tsx         # Inline dropdown pills for Stance & Style
│   ├── QuipDraftCard.tsx            # Ready-made quote preview card
│   └── ConsentCard.tsx              # Collapsible OpenAI consent disclosure
├── constants/
│   └── theme.ts                     # Botanical Editorial Design Tokens
└── types/
    └── booquip.ts                   # TypeScript interfaces
```

---

## 2. Design Tokens (`constants/theme.ts`)

```typescript
export const BotanicalTheme = {
  colors: {
    // Surface & Backgrounds
    background: '#fbf9f4',
    surface: '#ffffff',
    surfaceContainerLow: '#f7f4ee',
    surfaceContainer: '#f2ede4',
    surfaceContainerHigh: '#e9e3d8',
    surfaceDim: '#e2dcd0',

    // Primary & Forest Accents
    primary: '#1e4738',         // Deep botanical green
    primaryDark: '#143327',
    primaryContainer: '#ecfef0',
    primaryContainerSubtle: '#dff6e6',
    primaryBorder: '#ccebd5',

    // Category Accents
    accentScreen: '#e07a5f',    // Coral / Terracotta
    accentCharts: '#3d5a80',    // Indigo slate
    accentClassics: '#34755e',  // Botanical emerald

    // Neutral Text & Borders
    textPrimary: '#1a1f1b',
    textSecondary: '#5f6861',
    textMuted: '#8b948d',
    borderLight: '#ede8de',
    borderMedium: '#ded7c8',
    borderDivider: '#e9e5dc',
  },
  typography: {
    serif: 'Newsreader_600SemiBold',
    serifItalic: 'Newsreader_400Regular_Italic',
    sans: 'PlusJakartaSans_400Regular',
    sansMedium: 'PlusJakartaSans_500Medium',
    sansSemiBold: 'PlusJakartaSans_600SemiBold',
    sansBold: 'PlusJakartaSans_700Bold',
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    full: 9999,
  },
};
```

---

## 3. Top Header Component (`components/Header.tsx`)

Standardized 60px height across all 3 screens.

```tsx
import React from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { BotanicalTheme } from '../constants/theme';

interface HeaderProps {
  variant: 'search' | 'title';
  title?: string;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (text: string) => void;
  onSearchSubmit?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  variant,
  title = 'Quip',
  searchPlaceholder = 'Search 110 books...',
  searchValue,
  onSearchChange,
  onSearchSubmit,
}) => {
  return (
    <View style={styles.container}>
      {/* Brand Squircle Logo */}
      <View style={styles.logoRow}>
        <View style={styles.logoBox}>
          <Feather name="book-open" size={17} color="#ffffff" />
        </View>
        <Text style={styles.brandTitle}>{title}</Text>
      </View>

      {/* Right Slot: Either Search Bar or Editorial Subtitle */}
      {variant === 'search' ? (
        <View style={styles.searchBox}>
          <Feather name="search" size={15} color={BotanicalTheme.colors.textMuted} style={styles.searchIcon} />
          <TextInput
            value={searchValue}
            onChangeText={onSearchChange}
            onSubmitEditing={onSearchSubmit}
            placeholder={searchPlaceholder}
            placeholderTextColor={BotanicalTheme.colors.textMuted}
            style={styles.searchInput}
            returnKeyType="search"
          />
        </View>
      ) : (
        <Text style={styles.headerSubtitle}>Shape a thought</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 60,
    maxHeight: 60,
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: BotanicalTheme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: BotanicalTheme.colors.borderDivider,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: BotanicalTheme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontFamily: BotanicalTheme.typography.serif,
    fontSize: 22,
    color: BotanicalTheme.colors.textPrimary,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontFamily: BotanicalTheme.typography.serif,
    fontSize: 18,
    color: BotanicalTheme.colors.textPrimary,
    letterSpacing: -0.2,
  },
  searchBox: {
    flex: 1,
    maxWidth: 210,
    height: 38,
    backgroundColor: BotanicalTheme.colors.surface,
    borderWidth: 1,
    borderColor: BotanicalTheme.colors.borderMedium,
    borderRadius: BotanicalTheme.radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    marginLeft: 8,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: BotanicalTheme.colors.textPrimary,
    fontFamily: BotanicalTheme.typography.sans,
    paddingVertical: 0,
  },
});
```

---

## 4. Screen 1: Book Discovery (`app/(tabs)/index.tsx`)

Features Category Filtering, Gestures instructional banner, Centered authentic book cover art, Tagline Quote, Keywords, Movie adaptation card, and full-width `Snooze` & `30S READ` buttons.

```tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { BotanicalTheme } from '../../constants/theme';

interface BookItem {
  id: string;
  category: 'screen' | 'charts' | 'classics';
  categoryLabel: string;
  categoryIndex: string;
  title: string;
  author: string;
  year: string;
  coverUrl: string;
  quote: string;
  tags: string[];
  film?: {
    title: string;
    year: string;
    cast: string;
    notice: string;
  };
}

const BOOKS: Record<string, BookItem> = {
  screen: {
    id: 'schindlers-ark',
    category: 'screen',
    categoryLabel: 'SCREEN',
    categoryIndex: '1 OF 29',
    title: "Schindler's Ark",
    author: 'Thomas Keneally',
    year: '1982',
    coverUrl: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=700&q=80',
    quote: 'Compassion transformed into an industrial sanctuary.',
    tags: ['#Courage', '#History', '#MoralChoice'],
    film: {
      title: "Schindler's List",
      year: '1993',
      cast: 'Liam Neeson, Ben Kingsley, Ralph Fiennes',
      notice: 'This product uses TMDb data but is not endorsed or certified.',
    },
  },
  charts: {
    id: 'dune',
    category: 'charts',
    categoryLabel: 'CHARTS',
    categoryIndex: '1 OF 55',
    title: 'Dune',
    author: 'Frank Herbert',
    year: '1965',
    coverUrl: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=700&q=80',
    quote: 'Fear is the mind-killer. Fear is the little-death that brings total obliteration.',
    tags: ['#SciFi', '#Empire', '#Destiny'],
    film: {
      title: 'Dune: Part One',
      year: '2021',
      cast: 'Timothée Chalamet, Rebecca Ferguson, Oscar Isaac',
      notice: 'This product uses TMDb data but is not endorsed or certified.',
    },
  },
  classics: {
    id: 'gatsby',
    category: 'classics',
    categoryLabel: 'CLASSICS',
    categoryIndex: '1 OF 23',
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    year: '1925',
    coverUrl: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&w=700&q=80',
    quote: 'So we beat on, boats against the current, borne back ceaselessly into the past.',
    tags: ['#AmericanDream', '#JazzAge', '#Obsession'],
    film: {
      title: 'The Great Gatsby',
      year: '2013',
      cast: 'Leonardo DiCaprio, Tobey Maguire, Carey Mulligan',
      notice: 'This product uses TMDb data but is not endorsed or certified.',
    },
  },
};

export default function BookDiscoveryScreen() {
  const [activeCategory, setActiveCategory] = useState<'screen' | 'charts' | 'classics'>('screen');
  const book = BOOKS[activeCategory];

  const handleSurprise = () => {
    const keys: ('screen' | 'charts' | 'classics')[] = ['screen', 'charts', 'classics'];
    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    setActiveCategory(randomKey);
  };

  return (
    <View style={styles.container}>
      <Header variant="search" title="Discover" />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Category Filter Pills Row */}
        <View style={styles.pillRow}>
          <TouchableOpacity
            style={[styles.catPill, activeCategory === 'screen' && styles.catPillActive]}
            onPress={() => setActiveCategory('screen')}
          >
            <Feather
              name="tv"
              size={14}
              color={activeCategory === 'screen' ? '#ffffff' : BotanicalTheme.colors.primary}
            />
            <Text style={[styles.catPillText, activeCategory === 'screen' && styles.catPillTextActive]}>
              Screen
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.catPill, activeCategory === 'charts' && styles.catPillActive]}
            onPress={() => setActiveCategory('charts')}
          >
            <Feather
              name="bar-chart-2"
              size={14}
              color={activeCategory === 'charts' ? '#ffffff' : BotanicalTheme.colors.primary}
            />
            <Text style={[styles.catPillText, activeCategory === 'charts' && styles.catPillTextActive]}>
              Charts
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.catPill, activeCategory === 'classics' && styles.catPillActive]}
            onPress={() => setActiveCategory('classics')}
          >
            <Feather
              name="book-open"
              size={14}
              color={activeCategory === 'classics' ? '#ffffff' : BotanicalTheme.colors.primary}
            />
            <Text style={[styles.catPillText, activeCategory === 'classics' && styles.catPillTextActive]}>
              Classics
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.surprisePill} onPress={handleSurprise}>
            <MaterialCommunityIcons name="creation" size={16} color={BotanicalTheme.colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Gestures Instructional Banner */}
        <View style={styles.gestureBanner}>
          <View style={styles.gestureItem}>
            <MaterialCommunityIcons name="gesture-swipe-left" size={15} color="#8a7566" />
            <Text style={styles.gestureText}>Swipe left for next</Text>
          </View>
          <View style={styles.gestureItem}>
            <Feather name="bookmark" size={14} color={BotanicalTheme.colors.primary} />
            <Text style={styles.gestureText}>Swipe right to save</Text>
          </View>
          <View style={styles.gestureItem}>
            <MaterialCommunityIcons name="gesture-double-tap" size={15} color="#5f6861" />
            <Text style={styles.gestureText}>2× tap finished</Text>
          </View>
        </View>

        {/* Position Indicator Eyebrow */}
        <Text style={styles.eyebrow}>
          {book.categoryLabel} · {book.categoryIndex}
        </Text>

        {/* Book Card Container */}
        <View style={styles.card}>
          {/* Centered Book Cover Art */}
          <View style={styles.coverWrapper}>
            <Image source={{ uri: book.coverUrl }} style={styles.coverImage} resizeMode="cover" />
          </View>

          {/* Book Title & Author/Year Line */}
          <Text style={styles.bookTitle}>{book.title}</Text>
          <Text style={styles.bookMeta}>
            {book.author} · {book.year}
          </Text>

          {/* Tagline Quote Container */}
          <View style={styles.quoteCard}>
            <Text style={styles.quoteMark}>99</Text>
            <Text style={styles.quoteText}>{book.quote}</Text>
            <View style={styles.tagRow}>
              {book.tags.map((t) => (
                <View key={t} style={styles.tagPill}>
                  <Text style={styles.tagText}>{t}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* On Screen Film Adaptation Card */}
          {book.film && (
            <View style={styles.filmCard}>
              <View style={styles.filmHeaderRow}>
                <View style={styles.filmTitleRow}>
                  <Feather name="film" size={14} color={BotanicalTheme.colors.primary} style={{ marginRight: 6 }} />
                  <Text style={styles.filmTitle}>{book.film.title}</Text>
                </View>
                <Text style={styles.filmYear}>FILM · {book.film.year}</Text>
              </View>
              <Text style={styles.filmCast}>Cast: {book.film.cast}</Text>
              <Text style={styles.filmNotice}>{book.film.notice}</Text>
            </View>
          )}

          {/* Full-Width Actions: Snooze & 30S READ */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.snoozeBtn}>
              <Ionicons name="alarm-outline" size={17} color={BotanicalTheme.colors.textPrimary} style={{ marginRight: 6 }} />
              <Text style={styles.snoozeBtnText}>Snooze</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.readBtn}>
              <MaterialCommunityIcons name="creation" size={17} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.readBtnText}>30S READ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BotanicalTheme.colors.background,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  catPill: {
    flex: 1,
    height: 38,
    borderRadius: BotanicalTheme.radius.full,
    backgroundColor: BotanicalTheme.colors.surface,
    borderWidth: 1,
    borderColor: BotanicalTheme.colors.borderMedium,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  catPillActive: {
    backgroundColor: BotanicalTheme.colors.primary,
    borderColor: BotanicalTheme.colors.primaryDark,
  },
  catPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: BotanicalTheme.colors.textPrimary,
  },
  catPillTextActive: {
    color: '#ffffff',
  },
  surprisePill: {
    width: 38,
    height: 38,
    borderRadius: BotanicalTheme.radius.full,
    backgroundColor: BotanicalTheme.colors.surface,
    borderWidth: 1,
    borderColor: BotanicalTheme.colors.borderMedium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gestureBanner: {
    backgroundColor: '#f3efe8',
    borderRadius: BotanicalTheme.radius.md,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  gestureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  gestureText: {
    fontSize: 11,
    color: BotanicalTheme.colors.textSecondary,
    fontWeight: '500',
  },
  eyebrow: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: BotanicalTheme.colors.primary,
    marginBottom: 12,
  },
  card: {
    backgroundColor: BotanicalTheme.colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BotanicalTheme.colors.borderMedium,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  coverWrapper: {
    width: 200,
    height: 270,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 6,
    marginBottom: 14,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  bookTitle: {
    fontFamily: BotanicalTheme.typography.serif,
    fontSize: 24,
    fontWeight: '700',
    color: BotanicalTheme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: 2,
  },
  bookMeta: {
    fontSize: 13,
    color: BotanicalTheme.colors.textSecondary,
    marginBottom: 14,
  },
  quoteCard: {
    width: '100%',
    backgroundColor: '#faf7f2',
    borderLeftWidth: 3,
    borderLeftColor: '#b46538',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  quoteMark: {
    fontFamily: BotanicalTheme.typography.serif,
    fontSize: 18,
    color: '#b46538',
    fontWeight: '700',
  },
  quoteText: {
    fontFamily: BotanicalTheme.typography.serifItalic,
    fontSize: 14,
    color: BotanicalTheme.colors.textPrimary,
    lineHeight: 20,
    marginBottom: 8,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagPill: {
    backgroundColor: '#e3f3e9',
    borderRadius: BotanicalTheme.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    fontSize: 11,
    color: BotanicalTheme.colors.primary,
    fontWeight: '600',
  },
  filmCard: {
    width: '100%',
    backgroundColor: BotanicalTheme.colors.surface,
    borderWidth: 1,
    borderColor: BotanicalTheme.colors.borderMedium,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  filmHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  filmTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filmTitle: {
    fontWeight: '700',
    fontSize: 13,
    color: BotanicalTheme.colors.textPrimary,
  },
  filmYear: {
    fontSize: 10,
    fontWeight: '600',
    color: BotanicalTheme.colors.textMuted,
  },
  filmCast: {
    fontSize: 11,
    color: BotanicalTheme.colors.textSecondary,
    marginBottom: 4,
  },
  filmNotice: {
    fontSize: 9,
    color: BotanicalTheme.colors.textMuted,
  },
  actionRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 12,
  },
  snoozeBtn: {
    flex: 1,
    height: 44,
    borderRadius: BotanicalTheme.radius.full,
    backgroundColor: '#f3efe8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  snoozeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: BotanicalTheme.colors.textPrimary,
  },
  readBtn: {
    flex: 1,
    height: 44,
    borderRadius: BotanicalTheme.radius.full,
    backgroundColor: BotanicalTheme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  readBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
});
```

---

## 5. Screen 2: Quip Studio / Craft (`app/(tabs)/quip/index.tsx`)

Features Selected Book card, Sub-nav mode toggle (`Explore ready-made` vs `Craft a Quip`), Thought Seed input, Stance & Style compact dropdown pills, and collapsible OpenAI consent box.

```tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Header } from '../../../components/Header';
import { BotanicalTheme } from '../../../constants/theme';

export default function QuipCraftScreen() {
  const router = useRouter();
  const [thought, setThought] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [consentExpanded, setConsentExpanded] = useState(false);
  const [stance, setStance] = useState('Neutral');
  const [style, setStyle] = useState('Neutral');

  return (
    <View style={styles.container}>
      <Header variant="title" title="Quip" />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Selected Book Eyebrow & Card */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionEyebrow}>SELECTED BOOK</Text>
          <View style={styles.shelfBadge}>
            <Text style={styles.shelfBadgeText}>Finished shelf</Text>
          </View>
        </View>

        <View style={styles.bookCard}>
          <View style={styles.bookIconBox}>
            <Feather name="book-open" size={18} color={BotanicalTheme.colors.primary} />
          </View>
          <View style={styles.bookInfo}>
            <Text style={styles.bookTitle}>Schindler's Ark</Text>
            <Text style={styles.bookAuthor}>Thomas Keneally</Text>
          </View>
          <TouchableOpacity style={styles.changeBookBtn}>
            <Text style={styles.changeBookText}>Change book</Text>
            <Feather name="repeat" size={12} color={BotanicalTheme.colors.primary} style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        </View>

        {/* Sub-navigation Segmented Toggle */}
        <View style={styles.subnavContainer}>
          <TouchableOpacity
            style={styles.subnavBtn}
            onPress={() => router.push('/(tabs)/quip/explore')}
          >
            <Feather name="compass" size={14} color={BotanicalTheme.colors.primary} style={{ marginRight: 6 }} />
            <Text style={styles.subnavBtnText}>Explore ready-made</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.subnavBtn, styles.subnavBtnActive]}>
            <MaterialCommunityIcons name="feather" size={14} color={BotanicalTheme.colors.primary} style={{ marginRight: 6 }} />
            <Text style={[styles.subnavBtnText, styles.subnavBtnTextActive]}>Craft a Quip</Text>
          </TouchableOpacity>
        </View>

        {/* Thought Seed Input Box */}
        <Text style={styles.sectionEyebrow}>YOUR THOUGHT / SEED</Text>
        <View style={styles.thoughtBox}>
          <TextInput
            value={thought}
            onChangeText={setThought}
            maxLength={280}
            multiline
            placeholder="Share a thought or paste a post. Bring this book's perspective to the conversation."
            placeholderTextColor={BotanicalTheme.colors.textMuted}
            style={styles.thoughtInput}
          />
          <Text style={styles.charCounter}>{thought.length} / 280</Text>
        </View>

        {/* Inline Stance & Style Dropdown Pills */}
        <View style={styles.pillRow}>
          <TouchableOpacity style={styles.dropdownPill}>
            <Text style={styles.pillLabel}>STANCE: <Text style={styles.pillValue}>{stance}</Text></Text>
            <Feather name="chevron-down" size={13} color={BotanicalTheme.colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.dropdownPill}>
            <Text style={styles.pillLabel}>STYLE: <Text style={styles.pillValue}>{style}</Text></Text>
            <Feather name="chevron-down" size={13} color={BotanicalTheme.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Collapsible OpenAI Consent Box */}
        <View style={styles.consentCard}>
          <View style={styles.consentTopRow}>
            <TouchableOpacity
              style={[styles.checkbox, agreed && styles.checkboxActive]}
              onPress={() => setAgreed(!agreed)}
            >
              {agreed && <Feather name="check" size={12} color="#ffffff" />}
            </TouchableOpacity>

            <Text style={styles.consentTitle}>I agree to send Quip inputs to OpenAI</Text>

            <TouchableOpacity onPress={() => setConsentExpanded(!consentExpanded)}>
              <Text style={styles.readMoreText}>{consentExpanded ? 'Less' : 'Read more'}</Text>
            </TouchableOpacity>
          </View>

          {consentExpanded && (
            <Text style={styles.consentBody}>
              The idea and selected book's metadata/summary are sent via Supabase; the model does not read the full book. Remove private or sensitive information.
            </Text>
          )}
        </View>

        {/* Primary CTA */}
        <TouchableOpacity style={styles.generateBtn}>
          <MaterialCommunityIcons name="creation" size={16} color="#ffffff" style={{ marginRight: 6 }} />
          <Text style={styles.generateBtnText}>Generate Quip</Text>
          <MaterialCommunityIcons name="creation" size={16} color="#ffffff" style={{ marginLeft: 6 }} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BotanicalTheme.colors.background,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: BotanicalTheme.colors.textSecondary,
    letterSpacing: 0.8,
  },
  shelfBadge: {
    backgroundColor: '#dff6e6',
    borderRadius: BotanicalTheme.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  shelfBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: BotanicalTheme.colors.primary,
  },
  bookCard: {
    backgroundColor: BotanicalTheme.colors.surface,
    borderRadius: BotanicalTheme.radius.lg,
    borderWidth: 1,
    borderColor: BotanicalTheme.colors.borderMedium,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  bookIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#e6f4ea',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  bookInfo: {
    flex: 1,
  },
  bookTitle: {
    fontFamily: BotanicalTheme.typography.serif,
    fontSize: 15,
    fontWeight: '700',
    color: BotanicalTheme.colors.textPrimary,
  },
  bookAuthor: {
    fontSize: 12,
    color: BotanicalTheme.colors.textSecondary,
  },
  changeBookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  changeBookText: {
    fontSize: 12,
    fontWeight: '600',
    color: BotanicalTheme.colors.primary,
  },
  subnavContainer: {
    backgroundColor: '#eee8dd',
    borderRadius: BotanicalTheme.radius.lg,
    padding: 4,
    flexDirection: 'row',
    marginBottom: 16,
  },
  subnavBtn: {
    flex: 1,
    height: 38,
    borderRadius: BotanicalTheme.radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subnavBtnActive: {
    backgroundColor: BotanicalTheme.colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  subnavBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: BotanicalTheme.colors.textSecondary,
  },
  subnavBtnTextActive: {
    color: BotanicalTheme.colors.primary,
  },
  thoughtBox: {
    backgroundColor: BotanicalTheme.colors.surface,
    borderRadius: BotanicalTheme.radius.lg,
    borderWidth: 1,
    borderColor: BotanicalTheme.colors.borderMedium,
    padding: 14,
    marginTop: 8,
    marginBottom: 14,
    minHeight: 140,
    justifyContent: 'space-between',
  },
  thoughtInput: {
    fontSize: 14,
    color: BotanicalTheme.colors.textPrimary,
    lineHeight: 20,
    textAlignVertical: 'top',
    minHeight: 90,
  },
  charCounter: {
    fontSize: 11,
    color: BotanicalTheme.colors.textMuted,
    textAlign: 'right',
  },
  pillRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  dropdownPill: {
    flex: 1,
    height: 40,
    borderRadius: BotanicalTheme.radius.md,
    backgroundColor: BotanicalTheme.colors.surface,
    borderWidth: 1,
    borderColor: BotanicalTheme.colors.borderMedium,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  pillLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: BotanicalTheme.colors.textSecondary,
  },
  pillValue: {
    color: BotanicalTheme.colors.primary,
  },
  consentCard: {
    backgroundColor: BotanicalTheme.colors.surface,
    borderRadius: BotanicalTheme.radius.md,
    borderWidth: 1,
    borderColor: BotanicalTheme.colors.borderMedium,
    padding: 12,
    marginBottom: 18,
  },
  consentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: BotanicalTheme.colors.borderMedium,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  checkboxActive: {
    backgroundColor: BotanicalTheme.colors.primary,
    borderColor: BotanicalTheme.colors.primary,
  },
  consentTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: BotanicalTheme.colors.textPrimary,
  },
  readMoreText: {
    fontSize: 11,
    color: BotanicalTheme.colors.primary,
    fontWeight: '600',
  },
  consentBody: {
    fontSize: 11,
    color: BotanicalTheme.colors.textSecondary,
    lineHeight: 16,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: BotanicalTheme.colors.borderLight,
  },
  generateBtn: {
    height: 48,
    backgroundColor: BotanicalTheme.colors.primary,
    borderRadius: BotanicalTheme.radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
```

---

## 6. Screen 3: Explore Ready-made Quips (`app/(tabs)/quip/explore.tsx`)

Features Stance & Style dropdown pills, Ready-made quote draft preview card, and dark-container action group with `Refine in Craft` and `Copy as-is`.

```tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Header } from '../../../components/Header';
import { BotanicalTheme } from '../../../constants/theme';

export default function ExploreReadyMadeScreen() {
  const router = useRouter();
  const [stance, setStance] = useState('Neutral');
  const [style, setStyle] = useState('Neutral');

  const quoteDraft =
    '"Individual courage within a broken system isn\'t just moral defiance—it is practical logistics. Schindler turned bureaucracy into a weapon of rescue."';

  const handleCopy = () => {
    Alert.alert('Copied', 'Quip copied to clipboard ready to share!');
  };

  return (
    <View style={styles.container}>
      <Header variant="title" title="Quip" />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Selected Book Eyebrow & Card */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionEyebrow}>SELECTED BOOK</Text>
          <View style={styles.shelfBadge}>
            <Text style={styles.shelfBadgeText}>Finished shelf</Text>
          </View>
        </View>

        <View style={styles.bookCard}>
          <View style={styles.bookIconBox}>
            <Feather name="book-open" size={18} color={BotanicalTheme.colors.primary} />
          </View>
          <View style={styles.bookInfo}>
            <Text style={styles.bookTitle}>Schindler's Ark</Text>
            <Text style={styles.bookAuthor}>Thomas Keneally</Text>
          </View>
          <TouchableOpacity style={styles.changeBookBtn}>
            <Text style={styles.changeBookText}>Change book</Text>
            <Feather name="repeat" size={12} color={BotanicalTheme.colors.primary} style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        </View>

        {/* Sub-navigation Segmented Toggle */}
        <View style={styles.subnavContainer}>
          <TouchableOpacity style={[styles.subnavBtn, styles.subnavBtnActive]}>
            <Feather name="compass" size={14} color={BotanicalTheme.colors.primary} style={{ marginRight: 6 }} />
            <Text style={[styles.subnavBtnText, styles.subnavBtnTextActive]}>Explore ready-made</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.subnavBtn}
            onPress={() => router.push('/(tabs)/quip')}
          >
            <MaterialCommunityIcons name="feather" size={14} color={BotanicalTheme.colors.primary} style={{ marginRight: 6 }} />
            <Text style={styles.subnavBtnText}>Craft a Quip</Text>
          </TouchableOpacity>
        </View>

        {/* Inline Stance & Style Dropdown Pills */}
        <View style={styles.pillRow}>
          <TouchableOpacity style={styles.dropdownPill}>
            <Text style={styles.pillLabel}>STANCE: <Text style={styles.pillValue}>{stance}</Text></Text>
            <Feather name="chevron-down" size={13} color={BotanicalTheme.colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.dropdownPill}>
            <Text style={styles.pillLabel}>STYLE: <Text style={styles.pillValue}>{style}</Text></Text>
            <Feather name="chevron-down" size={13} color={BotanicalTheme.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Ready-made Quote Preview Card */}
        <View style={styles.quoteCard}>
          <Text style={styles.quoteMark}>99</Text>
          <Text style={styles.quoteText}>{quoteDraft}</Text>
          <Text style={styles.charCounter}>162 / 280</Text>
        </View>

        {/* Dark Container Action Group: Refine & Copy */}
        <View style={styles.darkActionGroup}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push('/(tabs)/quip')}
          >
            <Feather name="edit-3" size={14} color={BotanicalTheme.colors.primary} style={{ marginRight: 6 }} />
            <Text style={styles.actionBtnText}>Refine in Craft</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn} onPress={handleCopy}>
            <Feather name="copy" size={14} color={BotanicalTheme.colors.primary} style={{ marginRight: 6 }} />
            <Text style={styles.actionBtnText}>Copy as-is</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BotanicalTheme.colors.background,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: BotanicalTheme.colors.textSecondary,
    letterSpacing: 0.8,
  },
  shelfBadge: {
    backgroundColor: '#dff6e6',
    borderRadius: BotanicalTheme.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  shelfBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: BotanicalTheme.colors.primary,
  },
  bookCard: {
    backgroundColor: BotanicalTheme.colors.surface,
    borderRadius: BotanicalTheme.radius.lg,
    borderWidth: 1,
    borderColor: BotanicalTheme.colors.borderMedium,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  bookIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#e6f4ea',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  bookInfo: {
    flex: 1,
  },
  bookTitle: {
    fontFamily: BotanicalTheme.typography.serif,
    fontSize: 15,
    fontWeight: '700',
    color: BotanicalTheme.colors.textPrimary,
  },
  bookAuthor: {
    fontSize: 12,
    color: BotanicalTheme.colors.textSecondary,
  },
  changeBookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  changeBookText: {
    fontSize: 12,
    fontWeight: '600',
    color: BotanicalTheme.colors.primary,
  },
  subnavContainer: {
    backgroundColor: '#eee8dd',
    borderRadius: BotanicalTheme.radius.lg,
    padding: 4,
    flexDirection: 'row',
    marginBottom: 16,
  },
  subnavBtn: {
    flex: 1,
    height: 38,
    borderRadius: BotanicalTheme.radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subnavBtnActive: {
    backgroundColor: BotanicalTheme.colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  subnavBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: BotanicalTheme.colors.textSecondary,
  },
  subnavBtnTextActive: {
    color: BotanicalTheme.colors.primary,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  dropdownPill: {
    flex: 1,
    height: 40,
    borderRadius: BotanicalTheme.radius.md,
    backgroundColor: BotanicalTheme.colors.surface,
    borderWidth: 1,
    borderColor: BotanicalTheme.colors.borderMedium,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  pillLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: BotanicalTheme.colors.textSecondary,
  },
  pillValue: {
    color: BotanicalTheme.colors.primary,
  },
  quoteCard: {
    backgroundColor: BotanicalTheme.colors.surface,
    borderRadius: BotanicalTheme.radius.lg,
    borderWidth: 1,
    borderColor: BotanicalTheme.colors.borderMedium,
    padding: 16,
    marginBottom: 16,
  },
  quoteMark: {
    fontFamily: BotanicalTheme.typography.serif,
    fontSize: 22,
    fontWeight: '700',
    color: BotanicalTheme.colors.primary,
    marginBottom: 4,
  },
  quoteText: {
    fontFamily: BotanicalTheme.typography.serifItalic,
    fontSize: 16,
    color: BotanicalTheme.colors.textPrimary,
    lineHeight: 24,
    marginBottom: 12,
  },
  charCounter: {
    fontSize: 11,
    color: BotanicalTheme.colors.textMuted,
    textAlign: 'right',
  },
  darkActionGroup: {
    backgroundColor: '#eee8dd',
    borderRadius: BotanicalTheme.radius.lg,
    padding: 6,
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    height: 42,
    borderRadius: BotanicalTheme.radius.md,
    backgroundColor: BotanicalTheme.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: BotanicalTheme.colors.primary,
  },
});
```

---

## 7. App Tab Bar Layout (`app/(tabs)/_layout.tsx`)

Configures the 4 bottom tabs with active green state and pill indicators.

```tsx
import React from 'react';
import { Tabs } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { View, StyleSheet } from 'react-native';
import { BotanicalTheme } from '../../constants/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          height: 64,
          backgroundColor: BotanicalTheme.colors.background,
          borderTopWidth: 1,
          borderTopColor: BotanicalTheme.colors.borderDivider,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: BotanicalTheme.colors.primary,
        tabBarInactiveTintColor: BotanicalTheme.colors.textSecondary,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Book',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabIconWrapper, focused && styles.tabActivePill]}>
              <Feather name="book-open" size={18} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="quip"
        options={{
          title: 'Quip',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabIconWrapper, focused && styles.tabActivePill]}>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="shelf"
        options={{
          title: 'Shelf',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabIconWrapper, focused && styles.tabActivePill]}>
              <Feather name="archive" size={18} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabIconWrapper, focused && styles.tabActivePill]}>
              <Feather name="user" size={18} color={color} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIconWrapper: {
    width: 44,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActivePill: {
    backgroundColor: '#dff6e6',
  },
});
```
