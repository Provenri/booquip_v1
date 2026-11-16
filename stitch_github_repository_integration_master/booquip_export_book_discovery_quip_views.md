# Booquip Mobile Export: Book Discovery, Quip (Craft), & Explore Ready-made
**Target Repository:** `Provenri/booquip_v1`  
**Stack:** React Native, Expo SDK 54, Expo Router, TypeScript, NativeWind / Tailwind CSS, Lucide / Material Icons

---

## 1. Architecture & File Placement

Place or update these files inside your repository:

```
├── app/
│   ├── (tabs)/
│   │   ├── _layout.tsx           # 5-tab bottom navigation (Book, Quip, To read, Finished, Snoozed)
│   │   ├── index.tsx             # Redirects or Book Discovery Screen
│   │   ├── book.tsx              # Screen 1: Book Discovery (Tinder-style swipe, TMDB movie pill, Tagline)
│   │   └── quip.tsx              # Screen 2 & 3: Quip Workflow (Toggle between Craft & Explore Ready-made)
├── components/
│   ├── Header.tsx                # Unified top bar (BooQuip logo, Guest Link Shelf pill, Profile avatar)
│   ├── StanceStyleSelectors.tsx  # Shared compact inline dropdown pills for Stance & Style
│   ├── BookDiscoveryCard.tsx     # Centered book card with tagline, film adaptation details, snooze/read actions
│   ├── ExploreReadyMadeView.tsx  # Ready-made quote preview, 3x3 matrix logic, Refine & Copy action bar
│   └── CraftQuipView.tsx         # Thought/seed textarea, OpenAI disclosure expander, Generate CTA
└── constants/
    └── theme.ts                  # Botanical Editorial design tokens & color constants
```

---

## 2. Design Tokens & Theme Constants (`constants/theme.ts`)

```typescript
export const THEME = {
  colors: {
    primary: '#1c4a38',          // Deep Botanical Green
    primaryHover: '#14382a',
    primaryLight: '#ecfef0',
    surface: '#fbf9f4',          // Warm Botanical Ivory
    surfaceDim: '#f0ece1',
    surfaceContainer: '#f4efe6',  // Secondary control wrapper
    surfaceContainerLowest: '#ffffff',
    textMain: '#1c2420',
    textMuted: '#68776f',
    border: '#e4ded4',
    borderFocus: '#285e49',
    accentGold: '#d4a359',
    tagBg: '#e6f4ed',
    tagText: '#1c4a38',
  },
  typography: {
    serif: 'Newsreader, Georgia, serif',
    sans: 'System, -apple-system, Roboto, sans-serif',
  },
  radii: {
    sm: 8,
    md: 12,
    lg: 16,
    pill: 9999,
  }
};
```

---

## 3. Shared Header Component (`components/Header.tsx`)

Identical top chrome across Book Discovery and Quip:

```tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BookOpen, User, ChevronRight } from 'lucide-react-native';
import { THEME } from '../constants/theme';

interface HeaderProps {
  isGuest?: boolean;
  onLinkShelfPress?: () => void;
  onProfilePress?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isGuest = true,
  onLinkShelfPress,
  onProfilePress,
}) => {
  return (
    <View style={styles.header}>
      {/* Brand Logo */}
      <View style={styles.logoGroup}>
        <View style={styles.logoBadge}>
          <BookOpen size={18} color="#ffffff" strokeWidth={2.2} />
        </View>
        <Text style={styles.brandTitle}>BooQuip</Text>
      </View>

      {/* Right Controls */}
      <View style={styles.actionsGroup}>
        <TouchableOpacity 
          style={styles.guestPill} 
          onPress={onLinkShelfPress}
          activeOpacity={0.75}
        >
          <View style={styles.statusDot} />
          <Text style={styles.guestText}>Guest · Link shelf</Text>
          <ChevronRight size={14} color={THEME.colors.primary} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.avatarButton} 
          onPress={onProfilePress}
          activeOpacity={0.8}
        >
          <User size={18} color="#ffffff" strokeWidth={2.2} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: THEME.colors.surface,
  },
  logoGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: THEME.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: THEME.colors.primary,
    fontFamily: THEME.typography.serif,
  },
  actionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  guestPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surfaceContainer,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: THEME.radii.pill,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  guestText: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.textMain,
  },
  avatarButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: THEME.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
```

---

## 4. Shared Stance & Style Dropdown Selectors (`components/StanceStyleSelectors.tsx`)

Compact inline dropdown pills matching both Craft and Explore Ready-made:

```tsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { ChevronDown, Check } from 'lucide-react-native';
import { THEME } from '../constants/theme';

export type StanceOption = 'Neutral' | 'Pro' | 'Cons';
export type StyleOption = 'Neutral' | 'Curious' | 'Witty';

interface StanceStyleSelectorsProps {
  stance: StanceOption;
  styleMode: StyleOption;
  onStanceChange: (val: StanceOption) => void;
  onStyleChange: (val: StyleOption) => void;
}

export const StanceStyleSelectors: React.FC<StanceStyleSelectorsProps> = ({
  stance,
  styleMode,
  onStanceChange,
  onStyleChange,
}) => {
  const [activeMenu, setActiveMenu] = useState<'stance' | 'style' | null>(null);

  const stances: StanceOption[] = ['Neutral', 'Pro', 'Cons'];
  const stylesList: StyleOption[] = ['Neutral', 'Curious', 'Witty'];

  return (
    <View style={styles.container}>
      {/* Stance Pill */}
      <TouchableOpacity 
        style={styles.pill} 
        onPress={() => setActiveMenu('stance')}
        activeOpacity={0.8}
      >
        <Text style={styles.label}>STANCE:</Text>
        <Text style={styles.value}>{stance}</Text>
        <ChevronDown size={14} color={THEME.colors.textMuted} />
      </TouchableOpacity>

      {/* Style Pill */}
      <TouchableOpacity 
        style={styles.pill} 
        onPress={() => setActiveMenu('style')}
        activeOpacity={0.8}
      >
        <Text style={styles.label}>STYLE:</Text>
        <Text style={styles.value}>{styleMode}</Text>
        <ChevronDown size={14} color={THEME.colors.textMuted} />
      </TouchableOpacity>

      {/* Modal / Dropdown Picker */}
      <Modal visible={activeMenu !== null} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setActiveMenu(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.menuContainer}>
              <Text style={styles.menuTitle}>
                Select {activeMenu === 'stance' ? 'Stance' : 'Style'}
              </Text>
              {(activeMenu === 'stance' ? stances : stylesList).map((option) => {
                const isSelected = activeMenu === 'stance' ? stance === option : styleMode === option;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[styles.menuItem, isSelected && styles.menuItemSelected]}
                    onPress={() => {
                      if (activeMenu === 'stance') onStanceChange(option as StanceOption);
                      else onStyleChange(option as StyleOption);
                      setActiveMenu(null);
                    }}
                  >
                    <Text style={[styles.menuItemText, isSelected && styles.menuItemTextSelected]}>
                      {option}
                    </Text>
                    {isSelected && <Check size={16} color={THEME.colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 12,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: THEME.colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.radii.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.textMuted,
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.colors.primary,
    flex: 1,
    marginLeft: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  menuContainer: {
    width: '100%',
    maxWidth: 280,
    backgroundColor: THEME.colors.surfaceContainerLowest,
    borderRadius: THEME.radii.lg,
    padding: 16,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: THEME.radii.sm,
  },
  menuItemSelected: {
    backgroundColor: THEME.colors.primaryLight,
  },
  menuItemText: {
    fontSize: 14,
    color: THEME.colors.textMain,
    fontWeight: '500',
  },
  menuItemTextSelected: {
    color: THEME.colors.primary,
    fontWeight: '700',
  },
});
```

---

## 5. Screen 1: Book Discovery (`app/(tabs)/book.tsx`)

Implements the centered book presentation, tagline quote (without redundant double quotation marks), keyword tags, TMDb adaptation card, and lower action buttons (`Snooze`, `30s read`, `Read`):

```tsx
import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Clock, CheckCircle, Sparkles, Film, ArrowRight, Search } from 'lucide-react-native';
import { Header } from '../../components/Header';
import { THEME } from '../../constants/theme';

export default function BookDiscoveryScreen() {
  const [category, setCategory] = useState<'screen' | 'charts' | 'classics'>('screen');

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Header />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Section Heading */}
        <View style={styles.titleSection}>
          <Text style={styles.categoryEyebrow}>BOOK</Text>
          <Text style={styles.mainHeading}>Find your next read.</Text>
        </View>

        {/* Search Bar + Surprise Me */}
        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <Search size={18} color={THEME.colors.textMuted} />
            <Text style={styles.searchPlaceholder}>Find a title or author...</Text>
          </View>
          <TouchableOpacity style={styles.surprisePill} activeOpacity={0.8}>
            <Sparkles size={14} color="#b45309" />
            <Text style={styles.surpriseText}>SURPRISE</Text>
          </TouchableOpacity>
        </View>

        {/* Categories Bar */}
        <View style={styles.categoriesBar}>
          <TouchableOpacity 
            style={[styles.catPill, category === 'screen' && styles.catPillActive]}
            onPress={() => setCategory('screen')}
          >
            <View style={[styles.catDot, { backgroundColor: '#10b981' }]} />
            <Text style={[styles.catText, category === 'screen' && styles.catTextActive]}>Screen 29</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.catPill, category === 'charts' && styles.catPillActive]}
            onPress={() => setCategory('charts')}
          >
            <View style={[styles.catDot, { backgroundColor: '#6366f1' }]} />
            <Text style={[styles.catText, category === 'charts' && styles.catTextActive]}>Charts 55</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.catPill, category === 'classics' && styles.catPillActive]}
            onPress={() => setCategory('classics')}
          >
            <View style={[styles.catDot, { backgroundColor: '#14b8a6' }]} />
            <Text style={[styles.catText, category === 'classics' && styles.catTextActive]}>Classics 23</Text>
          </TouchableOpacity>
          <Text style={styles.totalBadge}>110 TOTAL</Text>
        </View>

        {/* Centered Book Cover Card */}
        <View style={styles.bookContainer}>
          <View style={styles.coverWrapper}>
            <Image 
              source={{ uri: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&q=80&w=600' }} 
              style={styles.coverImage}
              resizeMode="cover"
            />
            <View style={styles.pickBadge}>
              <Text style={styles.pickBadgeText}>• A BOOQUIP PICK</Text>
            </View>
          </View>

          <Text style={styles.bookMeta}>BOOK · 1982</Text>
          <Text style={styles.bookTitle}>Schindler's Ark</Text>
          <Text style={styles.bookAuthor}>Thomas Keneally · Screen Edition</Text>

          {/* Tagline Card (Clean without quotation marks) */}
          <View style={styles.taglineCard}>
            <Text style={styles.quoteGlyph}>99</Text>
            <Text style={styles.taglineText}>
              Compassion transformed into an industrial sanctuary.
            </Text>
            <View style={styles.tagsRow}>
              <View style={styles.tagPill}><Text style={styles.tagLabel}>#Courage</Text></View>
              <View style={styles.tagPill}><Text style={styles.tagLabel}>#History</Text></View>
              <View style={styles.tagPill}><Text style={styles.tagLabel}>#MoralChoice</Text></View>
            </View>
          </View>

          {/* On Screen Adaptation Box */}
          <View style={styles.onScreenBox}>
            <View style={styles.onScreenHeader}>
              <View style={styles.onScreenTitleRow}>
                <Film size={16} color={THEME.colors.primary} />
                <Text style={styles.onScreenTitle}>ON SCREEN</Text>
              </View>
              <Text style={styles.tmdbBadge}>TMDB</Text>
            </View>
            <Text style={styles.filmTitle}>Schindler's List <Text style={styles.filmMeta}>FILM · 1993</Text></Text>
            <Text style={styles.castText}>Cast: Liam Neeson, Ben Kingsley, Ralph Fiennes</Text>
            <Text style={styles.tmdbDisclaimer}>This product uses TMDb data but is not endorsed or certified.</Text>
          </View>

          {/* Action Buttons Row */}
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.snoozeButton}>
              <Clock size={16} color={THEME.colors.textMain} />
              <Text style={styles.actionBtnText}>Snooze</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.read30sButton}>
              <Sparkles size={16} color="#ffffff" />
              <Text style={styles.read30sText}>30S READ</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.readButton}>
              <CheckCircle size={16} color={THEME.colors.textMain} />
              <Text style={styles.actionBtnText}>Read</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: THEME.colors.surface },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 32 },
  titleSection: { marginTop: 8, marginBottom: 12 },
  categoryEyebrow: { fontSize: 11, fontWeight: '700', color: THEME.colors.primary, letterSpacing: 1 },
  mainHeading: { fontSize: 28, fontWeight: '800', color: THEME.colors.textMain, fontFamily: THEME.typography.serif, marginTop: 2 },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: THEME.colors.surfaceContainerLowest, borderRadius: THEME.radii.pill, paddingHorizontal: 14, height: 42, gap: 8, borderWidth: 1, borderColor: THEME.colors.border },
  searchPlaceholder: { color: THEME.colors.textMuted, fontSize: 13 },
  surprisePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fef3c7', paddingHorizontal: 12, borderRadius: THEME.radii.pill, gap: 4, height: 42 },
  surpriseText: { fontSize: 11, fontWeight: '700', color: '#92400e' },
  categoriesBar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  catPill: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderRadius: THEME.radii.pill, backgroundColor: THEME.colors.surfaceContainerLowest, borderWidth: 1, borderColor: THEME.colors.border, gap: 4 },
  catPillActive: { backgroundColor: THEME.colors.primary, borderColor: THEME.colors.primary },
  catDot: { width: 6, height: 6, borderRadius: 3 },
  catText: { fontSize: 12, fontWeight: '600', color: THEME.colors.textMain },
  catTextActive: { color: '#ffffff' },
  totalBadge: { fontSize: 10, fontWeight: '700', color: THEME.colors.textMuted, marginLeft: 'auto' },
  bookContainer: { backgroundColor: THEME.colors.surfaceContainerLowest, borderRadius: THEME.radii.lg, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: THEME.colors.border },
  coverWrapper: { width: 170, height: 230, borderRadius: THEME.radii.md, overflow: 'hidden', elevation: 6, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, marginBottom: 12 },
  coverImage: { width: '100%', height: '100%' },
  pickBadge: { position: 'absolute', bottom: 8, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: THEME.radii.pill },
  pickBadgeText: { color: '#ffffff', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  bookMeta: { fontSize: 11, fontWeight: '700', color: THEME.colors.primary, letterSpacing: 0.5 },
  bookTitle: { fontSize: 24, fontWeight: '800', color: THEME.colors.textMain, fontFamily: THEME.typography.serif, marginTop: 2 },
  bookAuthor: { fontSize: 13, color: THEME.colors.textMuted, marginTop: 2, marginBottom: 12 },
  taglineCard: { width: '100%', backgroundColor: THEME.colors.surface, borderRadius: THEME.radii.md, padding: 14, borderWidth: 1, borderColor: THEME.colors.border, marginBottom: 12 },
  quoteGlyph: { fontSize: 18, color: THEME.colors.primary, fontWeight: '800' },
  taglineText: { fontSize: 15, fontStyle: 'italic', color: THEME.colors.textMain, marginVertical: 6, lineHeight: 22, fontFamily: THEME.typography.serif },
  tagsRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  tagPill: { backgroundColor: THEME.colors.tagBg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: THEME.radii.sm },
  tagLabel: { color: THEME.colors.tagText, fontSize: 11, fontWeight: '600' },
  onScreenBox: { width: '100%', backgroundColor: THEME.colors.surfaceContainerLowest, borderRadius: THEME.radii.md, padding: 12, borderWidth: 1, borderColor: THEME.colors.border, marginBottom: 16 },
  onScreenHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  onScreenTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  onScreenTitle: { fontSize: 11, fontWeight: '700', color: THEME.colors.primary },
  tmdbBadge: { fontSize: 10, fontWeight: '700', color: THEME.colors.textMuted },
  filmTitle: { fontSize: 14, fontWeight: '700', color: THEME.colors.textMain },
  filmMeta: { fontSize: 11, color: THEME.colors.textMuted, fontWeight: '500' },
  castText: { fontSize: 12, color: THEME.colors.textMuted, marginTop: 2 },
  tmdbDisclaimer: { fontSize: 9, color: '#9ca3af', marginTop: 4 },
  actionsRow: { flexDirection: 'row', gap: 8, width: '100%' },
  snoozeButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, backgroundColor: THEME.colors.surfaceContainer, borderRadius: THEME.radii.pill, gap: 6 },
  read30sButton: { flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, backgroundColor: THEME.colors.primary, borderRadius: THEME.radii.pill, gap: 6 },
  readButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, backgroundColor: THEME.colors.surfaceContainer, borderRadius: THEME.radii.pill, gap: 6 },
  actionBtnText: { fontSize: 12, fontWeight: '600', color: THEME.colors.textMain },
  read30sText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
});
```

---

## 6. Screen 2 & 3: Quip Workflow (`app/(tabs)/quip.tsx`)

Combines **Craft a Quip** (Screen 2) and **Explore ready-made** (Screen 3) into an interactive tab toggle:

```tsx
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Compass, Edit3, BookOpen, ArrowRight, ChevronDown, Sparkles, Copy, Edit } from 'lucide-react-native';
import { Header } from '../../components/Header';
import { StanceStyleSelectors, StanceOption, StyleOption } from '../../components/StanceStyleSelectors';
import { THEME } from '../../constants/theme';

export default function QuipScreen() {
  const [tab, setTab] = useState<'explore' | 'craft'>('explore');
  const [stance, setStance] = useState<StanceOption>('Neutral');
  const [styleMode, setStyleMode] = useState<StyleOption>('Neutral');
  
  // Craft mode state
  const [promptText, setPromptText] = useState('');
  const [consentChecked, setConsentChecked] = useState(false);
  const [readMoreExpanded, setReadMoreExpanded] = useState(false);

  // 3x3 ready-made quip matrix
  const readyMadeMatrix: Record<string, string> = {
    'Neutral-Neutral': 'Individual courage within a broken system isn\'t just moral defiance—it is practical logistics. Schindler turned bureaucracy into a weapon of rescue.',
    'Neutral-Curious': 'What transforms an ordinary opportunist into a savior? In Schindler\'s Ark, the answer lies not in ideology, but in the stubborn ledger of human names.',
    'Neutral-Witty': 'Schindler proved that sometimes the best way to outsmart a tyrannical machine is to simply out-bribe its accountants.',
    'Pro-Neutral': 'Schindler\'s Ark demonstrates the extraordinary power of quiet resistance against industrial brutality.',
    'Cons-Neutral': 'A sobering reminder that individual heroics cannot mask the catastrophic systemic collapse around them.',
  };

  const currentQuote = readyMadeMatrix[`${stance}-${styleMode}`] || readyMadeMatrix['Neutral-Neutral'];

  const handleCopy = () => {
    Alert.alert('Copied to clipboard', 'Quip text ready to share!');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Header />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Title */}
        <View style={styles.titleSection}>
          <Text style={styles.eyebrow}>QUIP</Text>
          <Text style={styles.mainTitle}>Shape a thought.</Text>
          <Text style={styles.subtitle}>Bring perspective from your reading to the conversation.</Text>
        </View>

        {/* Selected Book Banner */}
        <View style={styles.selectedBookCard}>
          <View style={styles.bookHeaderRow}>
            <Text style={styles.selectedBookLabel}>SELECTED BOOK</Text>
            <View style={styles.shelfTag}>
              <Text style={styles.shelfTagText}>Finished shelf</Text>
            </View>
          </View>
          <View style={styles.bookInfoRow}>
            <View style={styles.bookIconBadge}>
              <BookOpen size={18} color={THEME.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bookTitle}>Schindler's Ark</Text>
              <Text style={styles.bookAuthor}>Thomas Keneally</Text>
            </View>
            <TouchableOpacity style={styles.changeBookBtn}>
              <Text style={styles.changeBookText}>Change book</Text>
              <ArrowRight size={13} color={THEME.colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Workflow Segmented Control */}
        <View style={styles.segmentContainer}>
          <TouchableOpacity 
            style={[styles.segmentBtn, tab === 'explore' && styles.segmentBtnActive]}
            onPress={() => setTab('explore')}
          >
            <Compass size={16} color={tab === 'explore' ? THEME.colors.primary : THEME.colors.textMuted} />
            <Text style={[styles.segmentText, tab === 'explore' && styles.segmentTextActive]}>
              Explore ready-made
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.segmentBtn, tab === 'craft' && styles.segmentBtnActive]}
            onPress={() => setTab('craft')}
          >
            <Edit3 size={16} color={tab === 'craft' ? THEME.colors.primary : THEME.colors.textMuted} />
            <Text style={[styles.segmentText, tab === 'craft' && styles.segmentTextActive]}>
              Craft a Quip
            </Text>
          </TouchableOpacity>
        </View>

        {/* TAB 1: EXPLORE READY-MADE */}
        {tab === 'explore' && (
          <View>
            {/* Inline Dropdown Pills */}
            <StanceStyleSelectors 
              stance={stance}
              styleMode={styleMode}
              onStanceChange={setStance}
              onStyleChange={setStyleMode}
            />

            {/* Quote Preview Card */}
            <View style={styles.quoteCard}>
              <Text style={styles.quoteMark}>99</Text>
              <Text style={styles.quoteBody}>"{currentQuote}"</Text>
              <Text style={styles.charCounter}>{currentQuote.length} / 280</Text>
            </View>

            {/* Darker Enclosing Container for Bottom Actions */}
            <View style={styles.actionButtonGroupContainer}>
              <TouchableOpacity 
                style={styles.actionPillButton}
                onPress={() => setTab('craft')}
              >
                <Edit size={16} color={THEME.colors.primary} />
                <Text style={styles.actionPillText}>Refine in Craft</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.actionPillButton}
                onPress={handleCopy}
              >
                <Copy size={16} color={THEME.colors.primary} />
                <Text style={styles.actionPillText}>Copy as-is</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* TAB 2: CRAFT A QUIP */}
        {tab === 'craft' && (
          <View>
            <Text style={styles.seedLabel}>YOUR THOUGHT / SEED</Text>
            <View style={styles.textareaContainer}>
              <TextInput
                style={styles.textInput}
                multiline
                placeholder="Share a thought or paste a post. Bring this book's perspective to the conversation."
                placeholderTextColor={THEME.colors.textMuted}
                value={promptText}
                onChangeText={setPromptText}
                maxLength={280}
              />
              <Text style={styles.inputCounter}>{promptText.length} / 280</Text>
            </View>

            {/* Inline Dropdown Pills for Crafting */}
            <StanceStyleSelectors 
              stance={stance}
              styleMode={styleMode}
              onStanceChange={setStance}
              onStyleChange={setStyleMode}
            />

            {/* Single-line Expandable OpenAI Disclosure */}
            <View style={styles.disclosureCard}>
              <View style={styles.disclosureRow}>
                <TouchableOpacity 
                  style={[styles.checkbox, consentChecked && styles.checkboxActive]}
                  onPress={() => setConsentChecked(!consentChecked)}
                >
                  {consentChecked && <View style={styles.checkboxInner} />}
                </TouchableOpacity>
                <Text style={styles.disclosureText}>I agree to send Quip inputs to OpenAI</Text>
                <TouchableOpacity 
                  style={styles.readMoreBtn} 
                  onPress={() => setReadMoreExpanded(!readMoreExpanded)}
                >
                  <Text style={styles.readMoreText}>{readMoreExpanded ? 'Less' : 'Read more'}</Text>
                  <ChevronDown size={14} color={THEME.colors.primary} style={readMoreExpanded && { transform: [{ rotate: '180deg' }] }} />
                </TouchableOpacity>
              </View>
              {readMoreExpanded && (
                <Text style={styles.disclosureExpanded}>
                  The idea and selected book's metadata/summary are sent via Supabase; the model does not read the full book. Remove private or sensitive information.
                </Text>
              )}
            </View>

            {/* Primary Action Button */}
            <TouchableOpacity 
              style={[styles.generateButton, !consentChecked && styles.generateButtonDisabled]}
              disabled={!consentChecked}
              onPress={() => Alert.alert('Generating Quip...', 'Connecting to synthesis pipeline.')}
            >
              <Sparkles size={18} color="#ffffff" />
              <Text style={styles.generateButtonText}>Generate Quip</Text>
              <Sparkles size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: THEME.colors.surface },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 32 },
  titleSection: { marginTop: 8, marginBottom: 14 },
  eyebrow: { fontSize: 11, fontWeight: '700', color: THEME.colors.primary, letterSpacing: 1 },
  mainTitle: { fontSize: 28, fontWeight: '800', color: THEME.colors.textMain, fontFamily: THEME.typography.serif, marginTop: 2 },
  subtitle: { fontSize: 14, color: THEME.colors.textMuted, marginTop: 4, lineHeight: 20 },
  selectedBookCard: { backgroundColor: THEME.colors.surfaceContainerLowest, borderRadius: THEME.radii.lg, padding: 14, borderWidth: 1, borderColor: THEME.colors.border, marginBottom: 14 },
  bookHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  selectedBookLabel: { fontSize: 10, fontWeight: '700', color: THEME.colors.textMuted, letterSpacing: 0.5 },
  shelfTag: { backgroundColor: THEME.colors.primaryLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: THEME.radii.pill },
  shelfTagText: { fontSize: 11, color: THEME.colors.primary, fontWeight: '600' },
  bookInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bookIconBadge: { width: 36, height: 36, borderRadius: THEME.radii.sm, backgroundColor: THEME.colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  bookTitle: { fontSize: 15, fontWeight: '700', color: THEME.colors.textMain },
  bookAuthor: { fontSize: 12, color: THEME.colors.textMuted },
  changeBookBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  changeBookText: { fontSize: 12, fontWeight: '600', color: THEME.colors.primary },
  segmentContainer: { flexDirection: 'row', backgroundColor: THEME.colors.surfaceContainer, borderRadius: THEME.radii.md, padding: 4, marginBottom: 8 },
  segmentBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: THEME.radii.sm, gap: 6 },
  segmentBtnActive: { backgroundColor: THEME.colors.surfaceContainerLowest, elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4 },
  segmentText: { fontSize: 13, fontWeight: '600', color: THEME.colors.textMuted },
  segmentTextActive: { color: THEME.colors.primary, fontWeight: '700' },
  quoteCard: { backgroundColor: THEME.colors.surfaceContainerLowest, borderRadius: THEME.radii.lg, padding: 18, borderWidth: 1, borderColor: THEME.colors.border, marginBottom: 14 },
  quoteMark: { fontSize: 24, fontWeight: '800', color: THEME.colors.primary },
  quoteBody: { fontSize: 16, fontStyle: 'italic', color: THEME.colors.textMain, lineHeight: 24, marginVertical: 8, fontFamily: THEME.typography.serif },
  charCounter: { fontSize: 11, color: THEME.colors.textMuted, textAlign: 'right', marginTop: 4 },
  actionButtonGroupContainer: { flexDirection: 'row', backgroundColor: THEME.colors.surfaceContainer, borderRadius: THEME.radii.lg, padding: 6, gap: 8 },
  actionPillButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.colors.surfaceContainerLowest, borderRadius: THEME.radii.md, paddingVertical: 12, gap: 6, borderWidth: 1, borderColor: THEME.colors.border },
  actionPillText: { fontSize: 13, fontWeight: '700', color: THEME.colors.primary },
  seedLabel: { fontSize: 11, fontWeight: '700', color: THEME.colors.textMuted, letterSpacing: 0.5, marginTop: 6, marginBottom: 6 },
  textareaContainer: { backgroundColor: THEME.colors.surfaceContainerLowest, borderRadius: THEME.radii.lg, padding: 14, borderWidth: 1, borderColor: THEME.colors.border },
  textInput: { minHeight: 90, textAlignVertical: 'top', fontSize: 14, color: THEME.colors.textMain, lineHeight: 20 },
  inputCounter: { fontSize: 11, color: THEME.colors.textMuted, textAlign: 'right' },
  disclosureCard: { backgroundColor: THEME.colors.surfaceContainerLowest, borderRadius: THEME.radii.md, padding: 12, borderWidth: 1, borderColor: THEME.colors.border, marginVertical: 12 },
  disclosureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: THEME.colors.borderFocus, alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: THEME.colors.primary, borderColor: THEME.colors.primary },
  checkboxInner: { width: 8, height: 8, backgroundColor: '#ffffff', borderRadius: 2 },
  disclosureText: { fontSize: 12, color: THEME.colors.textMain, flex: 1 },
  readMoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  readMoreText: { fontSize: 11, color: THEME.colors.primary, fontWeight: '600' },
  disclosureExpanded: { fontSize: 11, color: THEME.colors.textMuted, marginTop: 8, lineHeight: 16, borderTopWidth: 1, borderTopColor: THEME.colors.border, paddingTop: 8 },
  generateButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.colors.primary, borderRadius: THEME.radii.md, paddingVertical: 14, gap: 8, marginTop: 4 },
  generateButtonDisabled: { opacity: 0.5 },
  generateButtonText: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
});
```

---

## 7. App Bottom Tab Layout (`app/(tabs)/_layout.tsx`)

5-tab layout matching the shared icons, active states, and labels:

```tsx
import React from 'react';
import { Tabs } from 'expo-router';
import { BookOpen, MessageSquareQuote, Bookmark, CheckCircle2, Clock } from 'lucide-react-native';
import { THEME } from '../../constants/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: THEME.colors.surface,
          borderTopColor: THEME.colors.border,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: THEME.colors.primary,
        tabBarInactiveTintColor: THEME.colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="book"
        options={{
          title: 'Book',
          tabBarIcon: ({ color, size }) => <BookOpen size={20} color={color} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="quip"
        options={{
          title: 'Quip',
          tabBarIcon: ({ color, size }) => <MessageSquareQuote size={20} color={color} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="toread"
        options={{
          title: 'To read (0)',
          tabBarIcon: ({ color, size }) => <Bookmark size={20} color={color} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="finished"
        options={{
          title: 'Finished (3)',
          tabBarIcon: ({ color, size }) => <CheckCircle2 size={20} color={color} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="snoozed"
        options={{
          title: 'Snoozed (0)',
          tabBarIcon: ({ color, size }) => <Clock size={20} color={color} strokeWidth={2} />,
        }}
      />
    </Tabs>
  );
}
```
