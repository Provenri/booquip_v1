import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bookmark,
  BookOpen,
  Check,
  Clock3,
  Tv,
  MessageCircle,
  Share2,
  Search,
  Sparkles,
  UserRound,
  RotateCcw,
  X,
} from 'lucide-react-native';
import { BOOKS, PILLARS, type Book, type Pillar } from '@/lib/books';
import { linkCurrentUserEmail, resendCurrentUserEmailChange, signInWithEmail } from '@/lib/auth';
import AccountSheet from '@/components/AccountSheet';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { deleteUserSwipe, getOrCreateAnonymousUser, loadUserSwipes, saveUserSwipe } from '@/lib/swipes';
import { getBookOnRamp } from '@/lib/onramp';
import { generateSocialDraft } from '@/lib/socialGhostwriter';
import SocialDraftSheet from '@/components/SocialDraftSheet';
import TrendReplySheet from '@/components/TrendReplySheet';
import { generateTrendReply } from '@/lib/trendInterceptor';
import { loadCatalog, loadPillars } from '@/lib/catalog';

type Screen = 'discover' | 'tbr' | 'read' | 'snoozed';
type Section = 'home' | 'book' | 'quip';
type Action = 'tbr' | 'read' | 'freeze';
type SyncStatus = 'local' | 'loading' | 'connected' | 'error';

const ACTIONS: { id: Action; label: string; hint: string; color: string; icon: typeof ArrowRight }[] = [
  { id: 'tbr', label: 'Save to TBR', hint: 'Right', color: '#337e69', icon: Bookmark },
  { id: 'read', label: 'Already read', hint: 'Up', color: '#476da1', icon: Check },
  { id: 'freeze', label: 'Snooze 90 days', hint: 'Left', color: '#8a6e46', icon: Clock3 },
];

function NavItem({
  label,
  count,
  active,
  disabled = false,
  onPress,
  icon: Icon,
  compact = false,
}: {
  label: string;
  count?: number;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
  icon: typeof BookOpen;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.navItem, compact && styles.navItemCompact, disabled && styles.navItemDisabled, active && styles.navItemActive]}
    >
      <Icon color={active ? '#243b35' : '#9da9a1'} size={18} strokeWidth={1.8} />
      <Text style={[styles.navLabel, compact && styles.navLabelCompact, active && styles.navLabelActive]}>{label}</Text>
      {count !== undefined && <Text style={[styles.navCount, active && styles.navLabelActive]}>{count}</Text>}
    </Pressable>
  );
}

export default function DiscoverScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 820;
  const [section, setSection] = useState<Section>('home');
  const [screen, setScreen] = useState<Screen>('discover');
  const [tbrIds, setTbrIds] = useState<string[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [books, setBooks] = useState<Book[]>(BOOKS);
  const [pillars, setPillars] = useState(PILLARS);
  const [frozenUntil, setFrozenUntil] = useState<Record<string, number>>({});
  const [selectedPillar, setSelectedPillar] = useState<Pillar | null>(null);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [socialDraftBook, setSocialDraftBook] = useState<Book | null>(null);
  const [isTrendReplyVisible, setIsTrendReplyVisible] = useState(false);
  const [onRampText, setOnRampText] = useState('');
  const [onRampError, setOnRampError] = useState('');
  const [isOnRampLoading, setIsOnRampLoading] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [isAccountSheetVisible, setIsAccountSheetVisible] = useState(false);
  const [authRetryCount, setAuthRetryCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(isSupabaseConfigured ? 'loading' : 'local');
  const [syncMessage, setSyncMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const drag = useRef(new Animated.ValueXY()).current;
  const actionRef = useRef<(action: Action) => void>(() => undefined);
  const onRampRequestId = useRef(0);

  const completedIds = new Set([...tbrIds, ...readIds]);
  const availableBooks = books.filter(
    (book) =>
      book.isActive !== false &&
      !completedIds.has(book.id) &&
      (!frozenUntil[book.id] || frozenUntil[book.id] <= Date.now()),
  );
  const categoryBooks = selectedPillar
    ? availableBooks.filter((availableBook) => availableBook.pillar === selectedPillar)
    : availableBooks;
  const frozenBooks = books
    .filter((item) => (frozenUntil[item.id] ?? 0) > Date.now())
    .sort((left, right) => frozenUntil[left.id] - frozenUntil[right.id]);
  const book = selectedBookId ? books.find((item) => item.id === selectedBookId) : undefined;
  const currentPillar = book
    ? pillars.find((pillar) => pillar.id === book.pillar)
    : pillars.find((pillar) => pillar.id === selectedPillar);
  const searchResults = searchQuery.trim()
    ? categoryBooks.filter((availableBook) =>
        `${availableBook.title} ${availableBook.author}`.toLowerCase().includes(searchQuery.trim().toLowerCase()),
      ).slice(0, 5)
    : [];

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    setSyncStatus('loading');
    setSyncMessage('');

    const restoreShelf = async () => {
      try {
        const activeUser = await getOrCreateAnonymousUser();
        if (!activeUser) throw new Error('Supabase is not configured.');
        const [swipes, catalog, remotePillars] = await Promise.all([
          loadUserSwipes(activeUser.id),
          loadCatalog().catch(() => [] as Book[]),
          loadPillars().catch(() => []),
        ]);
        if (!active) return;
        if (catalog.length > 0) setBooks(catalog);
        const hasCurrentPillars = remotePillars.length === PILLARS.length && PILLARS.every((pillar) => remotePillars.some((remotePillar) => remotePillar.id === pillar.id));
        if (hasCurrentPillars) setPillars(remotePillars);

        const restoredTbr: string[] = [];
        const restoredRead: string[] = [];
        const restoredFrozen: Record<string, number> = {};
        for (const swipe of swipes) {
          if (swipe.state === 'tbr') restoredTbr.push(swipe.book_id);
          if (swipe.state === 'read') restoredRead.push(swipe.book_id);
          if (swipe.state === 'frozen' && swipe.freeze_until) {
            const timestamp = Date.parse(swipe.freeze_until);
            if (timestamp > Date.now()) restoredFrozen[swipe.book_id] = timestamp;
          }
        }

        setUserId(activeUser.id);
        setAccountEmail(activeUser.email ?? null);
        setPendingEmail(activeUser.new_email ?? null);
        setIsAnonymous(activeUser.is_anonymous !== false || !activeUser.email_confirmed_at);
        setTbrIds(restoredTbr);
        setReadIds(restoredRead);
        setFrozenUntil(restoredFrozen);
        setSyncMessage('');
        setSyncStatus('connected');
      } catch (error) {
        if (!active) return;
        setSyncMessage(error instanceof Error ? error.message : 'Could not create or restore the guest session.');
        setSyncStatus('error');
      }
    };

    void restoreShelf();
    return () => { active = false; };
  }, [authRetryCount]);

  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user;
      if (!user) return;
      setUserId(user.id);
      setAccountEmail(user.email ?? null);
      setPendingEmail(user.new_email ?? null);
      setIsAnonymous(user.is_anonymous !== false || !user.email_confirmed_at);
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        setAuthRetryCount((count) => count + 1);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const client = supabase;
    if (Platform.OS === 'web' || !client) return;
    let active = true;
    const handleAuthUrl = async (url: string) => {
      const code = Linking.parse(url).queryParams?.code;
      if (typeof code !== 'string') return;
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!active || !error) return;
      setSyncMessage(error.message);
      setSyncStatus('error');
    };
    void Linking.getInitialURL().then((url) => {
      if (url) return handleAuthUrl(url);
    });
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleAuthUrl(url);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    setCoverFailed(false);
    onRampRequestId.current += 1;
    setOnRampText('');
    setOnRampError('');
    setIsOnRampLoading(false);
  }, [book?.id]);

  const handleGetOnRamp = async () => {
    if (!book || isOnRampLoading) return;
    const requestId = ++onRampRequestId.current;
    setIsOnRampLoading(true);
    setOnRampError('');
    try {
      const result = await getBookOnRamp(book);
      if (requestId === onRampRequestId.current) setOnRampText(result);
    } catch (error) {
      if (requestId === onRampRequestId.current) {
        setOnRampError(error instanceof Error ? error.message : 'Could not generate the book on-ramp.');
      }
    } finally {
      if (requestId === onRampRequestId.current) setIsOnRampLoading(false);
    }
  };

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const actionByKey: Record<string, Action> = {
        ArrowRight: 'tbr',
        ArrowUp: 'read',
        ArrowLeft: 'freeze',
      };
      const action = actionByKey[event.key];
      if (action) {
        event.preventDefault();
        actionRef.current(action);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleAction = (action: Action) => {
    if (!book || section !== 'book' || screen !== 'discover' || syncStatus === 'loading' || isSaving) return;
    const selectedBook = book;
    setSelectedBookId(null);
    if (action === 'tbr') setTbrIds((ids) => [...ids, selectedBook.id]);
    if (action === 'read') setReadIds((ids) => [...ids, selectedBook.id]);
    if (action === 'freeze') {
      setFrozenUntil((items) => ({ ...items, [selectedBook.id]: Date.now() + 90 * 24 * 60 * 60 * 1000 }));
    }
    if (!userId || !isSupabaseConfigured) return;

    const state = action === 'tbr' ? 'tbr' : action === 'read' ? 'read' : 'frozen';
    const freezeUntil = action === 'freeze'
      ? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
      : null;
    setIsSaving(true);
    void saveUserSwipe(userId, selectedBook.id, state, freezeUntil)
      .then(() => {
        setSyncMessage('');
        setSyncStatus('connected');
      })
      .catch(() => {
        setSyncMessage('Sync failed. This swipe is only kept until refresh.');
        setSyncStatus('error');
      })
      .finally(() => setIsSaving(false));
  };
  actionRef.current = handleAction;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        Math.abs(gesture.dx) > 10 || Math.abs(gesture.dy) > 10,
      onPanResponderMove: (_event, gesture) => drag.setValue({ x: gesture.dx, y: gesture.dy }),
      onPanResponderRelease: (_event, gesture) => {
        const horizontal = Math.abs(gesture.dx) > Math.abs(gesture.dy);
        const distance = horizontal ? gesture.dx : gesture.dy;
        if (Math.abs(distance) < 70) {
          Animated.spring(drag, { toValue: { x: 0, y: 0 }, useNativeDriver: false, friction: 7 }).start();
          return;
        }
        if (!horizontal && gesture.dy > 0) {
          Animated.spring(drag, { toValue: { x: 0, y: 0 }, useNativeDriver: false, friction: 7 }).start();
          return;
        }
        const action: Action = horizontal
          ? gesture.dx > 0 ? 'tbr' : 'freeze'
          : 'read';
        const destination = {
          x: horizontal ? Math.sign(gesture.dx) * 460 : gesture.dx,
          y: horizontal ? gesture.dy : -460,
        };
        Animated.timing(drag, { toValue: destination, duration: 150, useNativeDriver: false }).start(({ finished }) => {
          if (!finished) return;
          actionRef.current(action);
          drag.setValue({ x: 0, y: 0 });
        });
      },
      onPanResponderTerminate: () => {
        Animated.spring(drag, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      },
    }),
  ).current;

  const revealBook = (chosenBook: Book) => {
    setSection('book');
    setSelectedPillar(chosenBook.pillar);
    setSelectedBookId(chosenBook.id);
  };

  const selectPillar = (pillar: Pillar) => {
    setSelectedPillar(pillar);
    setSearchQuery('');
    const categoryBooks = availableBooks.filter((availableBook) => availableBook.pillar === pillar);
    if (categoryBooks.length === 0) {
      setSelectedBookId(null);
      return;
    }
    const chosenBook = categoryBooks[Math.floor(Math.random() * categoryBooks.length)];
    revealBook(chosenBook);
  };

  const handleSurpriseMe = () => {
    const otherAvailableBooks = categoryBooks.filter((availableBook) => availableBook.id !== selectedBookId);
    const booksToChooseFrom = otherAvailableBooks.length > 0 ? otherAvailableBooks : categoryBooks;
    const chosenBook = booksToChooseFrom[Math.floor(Math.random() * booksToChooseFrom.length)];
    if (!chosenBook) return;
    setSearchQuery('');
    revealBook(chosenBook);
  };

  const handleWakeBook = (bookId: string) => {
    const snoozedBook = books.find((item) => item.id === bookId);
    const previousFreezeUntil = frozenUntil[bookId];
    if (!snoozedBook || snoozedBook.isActive === false || previousFreezeUntil === undefined || isSaving) return;
    if (isSupabaseConfigured && !userId) {
      setSyncMessage('Your shelf is not connected. Reconnect before waking this book.');
      setSyncStatus('error');
      return;
    }

    const wakeTimestamp = new Date(Date.now() - 1000).toISOString();
    setFrozenUntil((items) => ({ ...items, [bookId]: Date.parse(wakeTimestamp) }));
    setSelectedPillar(snoozedBook.pillar);
    setSelectedBookId(snoozedBook.id);
    setSearchQuery('');
    setSection('book');
    setScreen('discover');

    if (!userId || !isSupabaseConfigured) return;
    setIsSaving(true);
    void saveUserSwipe(userId, bookId, 'frozen', wakeTimestamp)
      .then(() => {
        setSyncMessage('');
        setSyncStatus('connected');
      })
      .catch(() => {
        setFrozenUntil((items) => ({ ...items, [bookId]: previousFreezeUntil }));
        setSelectedBookId(null);
        setScreen('snoozed');
        setSyncMessage('Could not wake this book. The snooze is still active; try again.');
        setSyncStatus('error');
      })
      .finally(() => setIsSaving(false));
  };

  const handleRemoveFromShelf = (bookId: string) => {
    const shelfBook = books.find((item) => item.id === bookId);
    const sourceScreen = screen;
    const wasInTbr = tbrIds.includes(bookId);
    const wasRead = readIds.includes(bookId);
    if (!shelfBook || (!wasInTbr && !wasRead) || isSaving) return;
    const returnToDiscovery = shelfBook.isActive !== false;
    if (isSupabaseConfigured && !userId) {
      setSyncMessage('Your shelf is not connected. Reconnect before returning this book to discovery.');
      setSyncStatus('error');
      return;
    }

    setTbrIds((ids) => ids.filter((id) => id !== bookId));
    setReadIds((ids) => ids.filter((id) => id !== bookId));
    setSelectedPillar(returnToDiscovery ? shelfBook.pillar : null);
    setSelectedBookId(returnToDiscovery ? shelfBook.id : null);
    setSearchQuery('');
    setSection('book');
    setScreen(returnToDiscovery ? 'discover' : sourceScreen);

    if (!userId || !isSupabaseConfigured) {
      if (!returnToDiscovery) setSyncMessage('Archived book removed from your shelf; it remains out of discovery.');
      return;
    }
    setIsSaving(true);
    void deleteUserSwipe(userId, bookId)
      .then(() => {
        setSyncMessage(returnToDiscovery ? '' : 'Archived book removed from your shelf; it remains out of discovery.');
        setSyncStatus('connected');
      })
      .catch(() => {
        if (wasInTbr) setTbrIds((ids) => ids.includes(bookId) ? ids : [...ids, bookId]);
        if (wasRead) setReadIds((ids) => ids.includes(bookId) ? ids : [...ids, bookId]);
        setSelectedBookId(null);
        setScreen(sourceScreen);
        setSyncMessage('Could not return this book to discovery. It is still on your shelf; try again.');
        setSyncStatus('error');
      })
      .finally(() => setIsSaving(false));
  };

  const handleLinkEmail = async (email: string) => {
    if (!userId || syncStatus === 'loading') {
      throw new Error('Your guest shelf is still connecting. Wait for sync to finish and try again.');
    }
    await linkCurrentUserEmail(email, userId);
    setPendingEmail(email.trim());
  };

  const handleResendEmail = async (email: string) => {
    if (!userId || syncStatus === 'loading') {
      throw new Error('Your guest shelf is still connecting. Wait for sync to finish and try again.');
    }
    await resendCurrentUserEmailChange(email, userId);
  };

  const handleSignIn = async (email: string) => {
    await signInWithEmail(email);
  };

  const handleSignOut = async () => {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;

    setUserId(null);
    setAccountEmail(null);
    setPendingEmail(null);
    setIsAnonymous(true);
    setTbrIds([]);
    setReadIds([]);
    setFrozenUntil({});
    setSelectedBookId(null);
    setSelectedPillar(null);
    setSection('home');
    setIsAccountSheetVisible(false);
    setAuthRetryCount((count) => count + 1);
  };

  const handleDeleteAccount = async () => {
    if (!supabase || !userId || isAnonymous) throw new Error('Only a linked account can be deleted.');
    const { data, error } = await supabase.functions.invoke('delete-user-account');
    if (error) throw error;
    if (data?.success !== true) throw new Error('Account deletion could not be confirmed.');

    const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
    if (signOutError) throw signOutError;
    setUserId(null);
    setAccountEmail(null);
    setPendingEmail(null);
    setIsAnonymous(true);
    setTbrIds([]);
    setReadIds([]);
    setFrozenUntil({});
    setSelectedBookId(null);
    setSelectedPillar(null);
    setSearchQuery('');
    setSocialDraftBook(null);
    setIsTrendReplyVisible(false);
    setScreen('discover');
    setSection('home');
    setIsAccountSheetVisible(false);
    setAuthRetryCount((count) => count + 1);
  };

  const readBooks = books.filter((item) => readIds.includes(item.id));
  const shelfBooks = screen === 'tbr'
    ? books.filter((item) => tbrIds.includes(item.id))
    : screen === 'read'
      ? readBooks
      : frozenBooks;
  const screenTitle = screen === 'discover' ? 'Find your next read' : screen === 'tbr' ? 'Your reading list' : screen === 'read' ? 'Books you’ve read' : 'Snoozed for later';
  const syncLabel = syncStatus === 'connected'
    ? isAnonymous ? 'SHELF SYNC ON · GUEST' : `SHELF SYNC ON · ${accountEmail ?? 'LINKED ACCOUNT'}`
    : syncStatus === 'loading'
      ? 'CONNECTING TO YOUR SHELF'
      : syncStatus === 'error'
        ? syncMessage.toUpperCase()
        : 'LOCAL PREVIEW · SWIPES ARE NOT SAVED';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.appShell}>
        {isWide && (
          <View style={styles.sidebar}>
            <View style={styles.brandLockup}>
              <View style={styles.brandMark}><BookOpen color="#173b31" size={20} strokeWidth={2} /></View>
              <Text style={styles.brandName}>booquip</Text>
            </View>
            <Text style={styles.sidebarEyebrow}>YOUR LIBRARY</Text>
            <NavItem label="Book" active={section === 'book'} onPress={() => { setSection('book'); setScreen('discover'); }} icon={BookOpen} />
            <NavItem label="Quip" active={section === 'quip'} onPress={() => setSection('quip')} icon={MessageCircle} />
            {section === 'book' && <>
              <Text style={styles.sidebarEyebrow}>YOUR SHELVES</Text>
              <NavItem label="Discover" active={screen === 'discover'} onPress={() => setScreen('discover')} icon={Sparkles} />
              <NavItem label="To be read" count={tbrIds.length} active={screen === 'tbr'} onPress={() => setScreen('tbr')} icon={Bookmark} />
              <NavItem label="Already read" count={readIds.length} active={screen === 'read'} onPress={() => setScreen('read')} icon={Check} />
              <NavItem label="Snoozed" count={frozenBooks.length} active={screen === 'snoozed'} onPress={() => setScreen('snoozed')} icon={Clock3} />
            </>}
            <NavItem
              label={isAnonymous ? 'Link your shelf' : 'Account'}
              active={false}
              disabled={syncStatus === 'loading'}
              onPress={() => setIsAccountSheetVisible(true)}
              icon={UserRound}
            />
            <View style={styles.sidebarFooter}>
              <Text style={styles.sidebarFooterLabel}>A SMALL STACK, A GOOD START</Text>
                <Text style={styles.sidebarFooterText}>{books.filter((item) => item.isActive !== false).length} books across {pillars.length} categories.</Text>
            </View>
          </View>
        )}

        <View style={styles.mainArea}>
          <View style={styles.mobileHeader}>
            <View style={styles.brandLockup}>
              <View style={styles.brandMark}><BookOpen color="#173b31" size={18} strokeWidth={2} /></View>
              <Text style={styles.brandName}>booquip</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isAnonymous ? 'Link your shelf to an email' : 'Account settings'}
              accessibilityState={{ disabled: syncStatus === 'loading' }}
              disabled={syncStatus === 'loading'}
              onPress={() => setIsAccountSheetVisible(true)}
              style={[styles.accountButton, syncStatus === 'loading' && styles.navItemDisabled]}
            >
              <UserRound color="#547465" size={16} />
              <Text style={styles.accountButtonText}>{isAnonymous ? 'LINK SHELF' : 'ACCOUNT'}</Text>
            </Pressable>
          </View>

          {section !== 'home' && (
            <View style={styles.mobileNav}>
              <NavItem compact label="Book" active={section === 'book'} onPress={() => { setSection('book'); setScreen('discover'); }} icon={BookOpen} />
              <NavItem compact label="Quip" active={section === 'quip'} onPress={() => setSection('quip')} icon={MessageCircle} />
              <NavItem compact label="Your Library" active={false} onPress={() => setSection('home')} icon={ArrowLeft} />
            </View>
          )}

          {section === 'book' && !isWide && (
            <View style={[styles.mobileNav, styles.bookShelfNav]}>
              <NavItem compact label="Discover" active={screen === 'discover'} onPress={() => setScreen('discover')} icon={Sparkles} />
              <NavItem compact label="TBR" count={tbrIds.length} active={screen === 'tbr'} onPress={() => setScreen('tbr')} icon={Bookmark} />
              <NavItem compact label="Read" count={readIds.length} active={screen === 'read'} onPress={() => setScreen('read')} icon={Check} />
              <NavItem compact label="Snoozed" count={frozenBooks.length} active={screen === 'snoozed'} onPress={() => setScreen('snoozed')} icon={Clock3} />
            </View>
          )}

          <ScrollView contentContainerStyle={[styles.content, !isWide && styles.contentMobile]}>
            <View style={styles.pageHeading}>
              <View>
                <Text style={styles.eyebrow}>{section === 'home' ? 'YOUR LIBRARY' : section === 'book' ? 'BOOK' : 'QUIP'}</Text>
                <Text style={styles.pageTitle}>{section === 'home' ? 'Your Library' : section === 'book' ? screenTitle : 'Reply to a trend'}</Text>
              </View>
              <Text style={styles.issueMark}>NO. 001 <Text style={styles.issueDot}>/</Text> 2026</Text>
            </View>
            <View style={styles.syncStatusRow}>
              <View style={[styles.syncDot, syncStatus === 'connected' && styles.syncDotConnected, syncStatus === 'error' && styles.syncDotError]} />
              <Text style={styles.syncStatusText}>{syncLabel}</Text>
            </View>

            {section === 'home' ? (
              <View style={styles.hubSections}>
                <Pressable accessibilityRole="button" onPress={() => { setSection('book'); setScreen('discover'); }}
                  style={({ pressed }) => [styles.hubSection, pressed && styles.hubSectionPressed]}>
                  <View style={styles.hubSectionIcon}><BookOpen color="#34755e" size={21} /></View>
                  <View style={styles.hubSectionCopy}>
                    <Text style={styles.hubSectionEyebrow}>DISCOVER AND COLLECT</Text>
                    <Text style={styles.hubSectionTitle}>Book</Text>
                    <Text style={styles.hubSectionDescription}>Find a book, save it, mark it read, or snooze it for later.</Text>
                  </View>
                  <ArrowRight color="#728077" size={18} />
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => setSection('quip')}
                  style={({ pressed }) => [styles.hubSection, pressed && styles.hubSectionPressed]}>
                  <View style={styles.hubSectionIcon}><MessageCircle color="#477d6c" size={21} /></View>
                  <View style={styles.hubSectionCopy}>
                    <Text style={styles.hubSectionEyebrow}>WRITE FROM WHAT YOU READ</Text>
                    <Text style={styles.hubSectionTitle}>Quip</Text>
                    <Text style={styles.hubSectionDescription}>{readBooks.length ? 'Draft a book-informed reply to a current conversation.' : 'Mark a book as read to start a trend reply.'}</Text>
                  </View>
                  <ArrowRight color="#728077" size={18} />
                </Pressable>
                <View style={styles.hubStatus}>
                  <View style={[styles.syncDot, syncStatus === 'connected' && styles.syncDotConnected, syncStatus === 'error' && styles.syncDotError]} />
                  <Text style={styles.syncStatusText}>{syncLabel}</Text>
                </View>
              </View>
            ) : section === 'quip' ? (
              <View style={styles.quipSection}>
                <Text style={styles.quipCount}>{readBooks.length} READ {readBooks.length === 1 ? 'BOOK' : 'BOOKS'} AVAILABLE FOR CONTEXT</Text>
                <Text style={styles.quipDescription}>Use one book or your entire Read shelf to shape an editable reply to a post or topic.</Text>
                <Pressable accessibilityRole="button" disabled={readBooks.length === 0} onPress={() => setIsTrendReplyVisible(true)}
                  style={({ pressed }) => [styles.quipButton, readBooks.length === 0 && styles.actionDisabled, pressed && styles.actionPressed]}>
                  <MessageCircle color="#fffaf6" size={16} />
                  <Text style={styles.quipButtonText}>REPLY TO TREND</Text>
                </Pressable>
                {readBooks.length === 0 ? <Pressable accessibilityRole="button" onPress={() => { setSection('book'); setScreen('read'); }} style={styles.resetButton}>
                  <Check color="#285f4e" size={16} /><Text style={styles.resetButtonText}>VIEW READ SHELF</Text>
                </Pressable> : null}
              </View>
            ) : screen === 'discover' ? (
              <>
                <View style={styles.searchSection}>
                  <View style={styles.searchInputWrap}>
                    <Search color="#718077" size={17} />
                    <TextInput
                      accessibilityLabel="Search books by title or author"
                      autoCapitalize="none"
                      autoCorrect={false}
                      onChangeText={setSearchQuery}
                      onSubmitEditing={() => {
                        if (searchResults.length === 1) {
                          const result = searchResults[0];
                          setSelectedPillar(result.pillar);
                          setSelectedBookId(result.id);
                          setSearchQuery('');
                        }
                      }}
                      placeholder="Find a title or author"
                      placeholderTextColor="#8d9990"
                      returnKeyType="search"
                      style={styles.searchInput}
                      value={searchQuery}
                    />
                    {searchQuery.length > 0 && (
                      <Pressable accessibilityRole="button" accessibilityLabel="Clear book search" onPress={() => setSearchQuery('')} style={styles.searchClear}>
                        <X color="#718077" size={16} />
                      </Pressable>
                    )}
                  </View>
                  {searchQuery.trim().length > 0 && (
                    <View style={styles.searchResults}>
                      {searchResults.length > 0 ? searchResults.map((result) => (
                        <Pressable
                          key={result.id}
                          accessibilityRole="button"
                          disabled={syncStatus === 'loading'}
                          onPress={() => {
                            setSelectedPillar(result.pillar);
                            setSelectedBookId(result.id);
                            setSearchQuery('');
                          }}
                          style={({ pressed }) => [styles.searchResult, pressed && styles.searchResultPressed]}
                        >
                          <View style={[styles.searchSwatch, { backgroundColor: result.color }]} />
                          <View style={styles.searchResultText}>
                            <Text style={styles.searchResultTitle}>{result.title}</Text>
                            <Text style={styles.searchResultAuthor}>{result.author} · {result.year}</Text>
                          </View>
                          <Text style={styles.searchResultShelf}>{pillars.find((category) => category.id === result.pillar)?.label.toUpperCase()}</Text>
                        </Pressable>
                      )) : (
                        <Text style={styles.searchEmpty}>No available titles match that search.</Text>
                      )}
                    </View>
                  )}
                </View>

                <View style={styles.pillarHeader}>
                  <Text style={styles.sectionLabel}>BOOK CATEGORIES</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={selectedPillar ? `Surprise me with a ${pillars.find((item) => item.id === selectedPillar)?.label} book` : 'Surprise me with a book from any category'}
                    disabled={syncStatus === 'loading' || categoryBooks.length === 0}
                    onPress={handleSurpriseMe}
                    style={({ pressed }) => [styles.surpriseButton, styles.surpriseButtonActive, (syncStatus === 'loading' || categoryBooks.length === 0) && styles.actionDisabled, pressed && styles.surpriseButtonPressed]}
                  >
                    <Sparkles color="#fffaf6" size={14} />
                    <Text style={styles.surpriseText}>SURPRISE ME</Text>
                  </Pressable>
                </View>

                <View style={styles.categoryRow}>
                  {pillars.map((pillar) => {
                    const count = availableBooks.filter((availableBook) => availableBook.pillar === pillar.id).length;
                    const selected = selectedPillar === pillar.id;
                    return <Pressable key={pillar.id} accessibilityRole="button" accessibilityState={{ selected }}
                      disabled={syncStatus === 'loading'} onPress={() => selectPillar(pillar.id)}
                      style={({ pressed }) => [styles.categoryButton, selected && styles.categoryButtonSelected, syncStatus === 'loading' && styles.actionDisabled, pressed && styles.actionPressed]}>
                      <View style={[styles.categoryDot, { backgroundColor: pillar.color }]} />
                      <View style={styles.categoryButtonCopy}>
                        <Text style={[styles.categoryButtonTitle, selected && styles.categoryButtonTitleSelected]}>{pillar.label}</Text>
                        <Text style={[styles.categoryButtonCount, selected && styles.categoryButtonCountSelected]}>{count} available</Text>
                      </View>
                    </Pressable>;
                  })}
                </View>

                <View style={styles.cardMetaRow}>
                  <Text style={styles.sectionLabel}>
                    {currentPillar?.label.toUpperCase() ?? 'CHOOSE A CATEGORY'}
                  </Text>
                  <Text style={styles.cardPosition}>{book ? 'YOUR NEXT READ' : selectedPillar ? 'CATEGORY EMPTY · CHOOSE AGAIN' : 'READY WHEN YOU ARE'}</Text>
                </View>

                {book ? (
                  <Animated.View
                    {...panResponder.panHandlers}
                    style={[
                      styles.bookCard,
                      {
                        transform: [
                          ...drag.getTranslateTransform(),
                          { rotate: drag.x.interpolate({ inputRange: [-300, 0, 300], outputRange: ['-8deg', '0deg', '8deg'] }) },
                        ],
                      },
                    ]}
                  >
                    <View style={[styles.coverFrame, { backgroundColor: book.color }]}>
                      <View style={styles.coverFallback}>
                        <BookOpen color="#fffaf0" size={32} strokeWidth={1.5} />
                        <Text style={styles.coverFallbackTitle}>{book.title}</Text>
                        <Text style={styles.coverFallbackAuthor}>{book.author}</Text>
                      </View>
                      {!coverFailed && (
                        <Image
                          accessibilityLabel={`Cover of ${book.title}`}
                          onError={() => setCoverFailed(true)}
                          source={{ uri: `https://covers.openlibrary.org/b/isbn/${book.isbn}-L.jpg` }}
                          style={styles.coverImage}
                          resizeMode="cover"
                        />
                      )}
                      <View style={styles.coverCaption}><Text style={styles.coverCaptionText}>A BOOQUIP PICK</Text></View>
                    </View>
                    <View style={styles.bookInfo}>
                      <View style={[styles.pillarTag, { borderColor: currentPillar?.color ?? '#557b6f' }]}>
                        <View style={[styles.pillarDot, { backgroundColor: currentPillar?.color ?? '#557b6f' }]} />
                        <Text style={styles.pillarTagText}>{currentPillar?.label.toUpperCase()}</Text>
                      </View>
                      <Text style={styles.bookTitle}>{book.title}</Text>
                      <Text style={styles.bookAuthor}>{book.author} <Text style={styles.authorDivider}>/</Text> {book.year}</Text>
                      <View style={styles.infoRule} />
                      <Text style={styles.noteLabel}>THE SHORT TAKE</Text>
                      <Text style={styles.bookNote}>{book.note}</Text>
                      <View style={styles.adaptationSection}>
                        <View style={styles.adaptationHeader}>
                          <Tv color="#68786e" size={14} />
                          <Text style={styles.noteLabel}>ON SCREEN</Text>
                        </View>
                        {book.adaptations?.length ? book.adaptations.map((adaptation) => (
                          <View key={`${adaptation.title}-${adaptation.releaseYear}`} style={styles.adaptationRow}>
                            <View style={styles.adaptationCopy}>
                              <Text style={styles.adaptationTitle}>{adaptation.title}</Text>
                              <Text style={styles.adaptationMeta}>
                                {adaptation.format.toUpperCase()} · {adaptation.releaseYear}{adaptation.platform ? ` · ${adaptation.platform}` : ''}
                              </Text>
                              {adaptation.castMembers?.length ? (
                                <Text style={styles.adaptationCast}>CAST · {adaptation.castMembers.join(', ')}</Text>
                              ) : null}
                            </View>
                            {adaptation.tmdbId ? (
                              <Pressable
                                accessibilityRole="link"
                                accessibilityLabel={`View ${adaptation.title} on TMDb`}
                                onPress={() => void Linking.openURL(`https://www.themoviedb.org/${adaptation.format === 'film' ? 'movie' : 'tv'}/${adaptation.tmdbId}`)}
                                style={styles.tmdbLink}
                              >
                                <Text style={styles.tmdbLinkText}>TMDb</Text>
                              </Pressable>
                            ) : null}
                          </View>
                        )) : (
                          <Text style={styles.adaptationEmpty}>No adaptation details curated yet.</Text>
                        )}
                        {book.adaptations?.some((adaptation) => adaptation.tmdbId) ? (
                          <Text style={styles.tmdbAttribution}>This product uses the TMDB API but is not endorsed or certified by TMDB.</Text>
                        ) : null}
                      </View>
                      <View style={styles.onRampSection}>
                        <View style={styles.onRampHeader}>
                          <Text style={styles.noteLabel}>30-SECOND ON-RAMP</Text>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={onRampText ? 'Generate another book on-ramp' : 'Generate a 30-second book on-ramp'}
                            disabled={isOnRampLoading || syncStatus === 'loading'}
                            onPress={() => void handleGetOnRamp()}
                            style={({ pressed }) => [styles.onRampButton, (isOnRampLoading || syncStatus === 'loading') && styles.actionDisabled, pressed && styles.actionPressed]}
                          >
                            <Sparkles color="#34755e" size={14} />
                            <Text style={styles.onRampButtonText}>{isOnRampLoading ? 'THINKING…' : onRampText ? 'TRY AGAIN' : 'GET ON-RAMP'}</Text>
                          </Pressable>
                        </View>
                        {onRampText ? <Text accessibilityLiveRegion="polite" style={styles.onRampText}>{onRampText}</Text> : null}
                        {onRampError ? <Text accessibilityRole="alert" style={styles.onRampError}>{onRampError}</Text> : null}
                      </View>
                      <View style={styles.cardFooter}>
                        <Text style={styles.catalogId}>BQ · {book.id.toUpperCase()}</Text>
                        <BookOpen color="#95a19a" size={17} strokeWidth={1.6} />
                      </View>
                    </View>
                  </Animated.View>
                ) : selectedPillar ? (
                  <View style={styles.emptyState}>
                    <View style={styles.emptyIcon}><BookOpen color="#3d735f" size={24} /></View>
                    <Text style={styles.emptyTitle}>No available books in {currentPillar?.label}.</Text>
                    <Text style={styles.emptyCopy}>Choose another category or use Surprise Me across the available books.</Text>
                  </View>
                ) : null}

                {book && (
                  <View style={[styles.actionRow, !isWide && styles.actionRowMobile]}>
                    {ACTIONS.map(({ id, label, hint, color, icon: Icon }) => (
                      <Pressable
                        key={id}
                        accessibilityRole="button"
                        accessibilityLabel={`${label}, swipe ${hint.toLowerCase()}`}
                        disabled={syncStatus === 'loading' || isSaving}
                        onPress={() => handleAction(id)}
                        style={({ pressed }) => [styles.actionButton, !isWide && styles.actionButtonMobile, (syncStatus === 'loading' || isSaving) && styles.actionDisabled, pressed && styles.actionPressed]}
                      >
                        <View style={[styles.actionIcon, { backgroundColor: `${color}15` }]}>
                          {id === 'tbr' ? <ArrowRight color={color} size={19} /> : id === 'freeze' ? <ArrowLeft color={color} size={19} /> : <Icon color={color} size={19} />}
                        </View>
                        <Text style={[styles.actionLabel, !isWide && styles.actionLabelMobile]}>{label}</Text>
                        {isWide && <Text style={styles.actionHint}>SWIPE {hint.toUpperCase()}</Text>}
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
            ) : (
              <View style={styles.shelfView}>
                <View style={styles.pillarHeader}>
                  <Text style={styles.sectionLabel}>{screen === 'tbr' ? 'SAVED FOR LATER' : screen === 'read' ? 'MARKED AS READ' : 'SNOOZED FOR LATER'}</Text>
                  <Text style={styles.stackCount}>{String(shelfBooks.length).padStart(2, '0')} BOOKS</Text>
                </View>
                {screen === 'read' && readBooks.length > 0 && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setIsTrendReplyVisible(true)}
                    style={({ pressed }) => [styles.trendEntryButton, pressed && styles.actionPressed]}
                  >
                    <MessageCircle color="#477d6c" size={16} />
                    <Text style={styles.trendEntryLabel}>REPLY TO TREND</Text>
                  </Pressable>
                )}
                {shelfBooks.length === 0 ? (
                  <View style={styles.emptyState}>
                    <View style={styles.emptyIcon}><BookOpen color="#3d735f" size={24} /></View>
                    <Text style={styles.emptyTitle}>{screen === 'snoozed' ? 'Nothing on snooze.' : 'A shelf with room to grow.'}</Text>
                    <Text style={styles.emptyCopy}>{screen === 'snoozed' ? 'Books you snooze will return to discovery after their 90-day break.' : 'Books you sort in discovery will appear here.'}</Text>
                    <Pressable onPress={() => setScreen('discover')} style={styles.resetButton}>
                      <Sparkles color="#285f4e" size={16} />
                      <Text style={styles.resetButtonText}>Discover books</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.shelfList}>
                    {shelfBooks.map((item, index) => (
                      <View key={item.id} style={[styles.shelfRow, screen === 'snoozed' ? styles.snoozedShelfRow : styles.returnShelfRow]}>
                        <Text style={styles.shelfIndex}>{String(index + 1).padStart(2, '0')}</Text>
                        <View style={[styles.shelfSwatch, { backgroundColor: item.color }]} />
                        <View style={styles.shelfText}>
                          <Text style={styles.shelfTitle}>{item.title}</Text>
                          <Text style={styles.shelfAuthor}>{item.author} · {item.year}</Text>
                        </View>
                        {screen === 'snoozed' ? (
                          <Text style={[styles.shelfPillar, styles.shelfReturn]}>
                            {`RETURNS ${new Date(frozenUntil[item.id]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase()}`}
                          </Text>
                        ) : isWide ? (
                          <Text style={styles.shelfPillar}>{pillars.find((pillar) => pillar.id === item.pillar)?.label.toUpperCase()}</Text>
                        ) : null}
                        {screen === 'snoozed' && item.isActive === false && <Text style={styles.archivedLabel}>ARCHIVED</Text>}
                        {screen === 'snoozed' && item.isActive !== false && (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Wake ${item.title} and return it to discovery now`}
                            disabled={isSaving}
                            onPress={() => handleWakeBook(item.id)}
                            style={({ pressed }) => [styles.wakeButton, isSaving && styles.actionDisabled, pressed && styles.actionPressed]}
                          >
                            <RotateCcw color="#8a6e46" size={15} />
                            <Text style={styles.wakeButtonText}>WAKE</Text>
                          </Pressable>
                        )}
                        {screen === 'read' && (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Draft a social post about ${item.title}`}
                            onPress={() => setSocialDraftBook(item)}
                            style={({ pressed }) => [styles.draftPostButton, pressed && styles.actionPressed]}
                          >
                            <Share2 color="#477d6c" size={14} />
                            <Text style={styles.draftPostButtonText}>DRAFT</Text>
                          </Pressable>
                        )}
                        {screen !== 'snoozed' && (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={item.isActive === false ? `Remove archived ${item.title} from this shelf` : `Remove ${item.title} from this shelf and return it to discovery`}
                            disabled={isSaving || syncStatus === 'loading'}
                            onPress={() => handleRemoveFromShelf(item.id)}
                            style={({ pressed }) => [styles.returnBookButton, isSaving && styles.actionDisabled, pressed && styles.actionPressed]}
                          >
                            <RotateCcw color="#34755e" size={14} />
                            <Text style={styles.returnBookButtonText}>{item.isActive === false ? 'REMOVE' : 'RETURN'}</Text>
                          </Pressable>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            <View style={styles.pageFooter}>
              <Text style={styles.footerCopy}>A GOOD BOOK IS A CHANGE OF PERSPECTIVE.</Text>
              <Text style={styles.footerCopy}>BOOQUIP <Text style={styles.issueDot}>·</Text> FIELD TEST</Text>
            </View>
          </ScrollView>
        </View>
      </View>
      <AccountSheet
        visible={isAccountSheetVisible}
        email={accountEmail}
        pendingEmail={pendingEmail}
        isAnonymous={isAnonymous}
        sessionReady={Boolean(userId)}
        syncError={syncMessage}
        onClose={() => setIsAccountSheetVisible(false)}
        onLinkEmail={handleLinkEmail}
        onResendEmail={handleResendEmail}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        onDeleteAccount={handleDeleteAccount}
        onRetry={() => {
          setIsAccountSheetVisible(false);
          setAuthRetryCount((count) => count + 1);
        }}
      />
      <SocialDraftSheet
        visible={socialDraftBook !== null}
        book={socialDraftBook}
        onClose={() => setSocialDraftBook(null)}
        onGenerate={generateSocialDraft}
      />
      <TrendReplySheet
        visible={isTrendReplyVisible}
        books={readBooks}
        onClose={() => setIsTrendReplyVisible(false)}
        onGenerate={generateTrendReply}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f1f3ef' },
  appShell: { flex: 1, flexDirection: 'row', backgroundColor: '#f1f3ef' },
  sidebar: { width: 238, backgroundColor: '#1e302d', paddingHorizontal: 24, paddingTop: 32, paddingBottom: 22 },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 32, height: 32, borderRadius: 9, backgroundColor: '#8dd8b1', alignItems: 'center', justifyContent: 'center' },
  brandName: { color: '#f6f7f3', fontSize: 20, fontWeight: '700', letterSpacing: 0 },
  sidebarEyebrow: { color: '#8a9991', fontSize: 10, fontWeight: '700', letterSpacing: 1.4, marginTop: 56, marginBottom: 15 },
  navItem: { height: 46, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: 6, marginBottom: 5 },
  navItemCompact: { flex: 1, justifyContent: 'center', gap: 4, paddingHorizontal: 2, marginBottom: 0 },
  navItemActive: { backgroundColor: '#d8eee0' },
  navItemDisabled: { opacity: 0.5 },
  navLabel: { flex: 1, color: '#bdc8c0', fontSize: 13, fontWeight: '500' },
  navLabelCompact: { flex: 0, fontSize: 9 },
  navLabelActive: { color: '#243b35', fontWeight: '700' },
  navCount: { color: '#9eaaa3', fontSize: 12, fontVariant: ['tabular-nums'] },
  sidebarFooter: { marginTop: 'auto', borderTopWidth: 1, borderTopColor: '#3a4b46', paddingTop: 17 },
  sidebarFooterLabel: { color: '#8a9991', fontSize: 9, fontWeight: '700', letterSpacing: 1.1 },
  sidebarFooterText: { color: '#d7e0da', fontSize: 12, lineHeight: 18, marginTop: 8, maxWidth: 170 },
  mainArea: { flex: 1, minWidth: 0 },
  mobileHeader: { minHeight: 58, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#dfe4de' },
  mobileEdition: { color: '#728077', fontSize: 9, fontWeight: '700', letterSpacing: 1.1 },
  accountButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 8, borderRadius: 4, backgroundColor: '#e7efe8' },
  accountButtonText: { color: '#426450', fontSize: 8, fontWeight: '800', letterSpacing: 0.6 },
  mobileNav: { flexDirection: 'row', paddingHorizontal: 14, paddingTop: 7, borderBottomWidth: 1, borderBottomColor: '#dfe4de' },
  bookShelfNav: { backgroundColor: '#f7f8f4' },
  hubSections: { maxWidth: 860, width: '100%', alignSelf: 'center', borderTopWidth: 1, borderTopColor: '#dfe4dc' },
  hubSection: { minHeight: 140, flexDirection: 'row', alignItems: 'center', gap: 18, paddingHorizontal: 14, paddingVertical: 22, borderBottomWidth: 1, borderBottomColor: '#dfe4dc' },
  hubSectionPressed: { backgroundColor: '#eaf0e9' },
  hubSectionIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#e5f1e8' },
  hubSectionCopy: { flex: 1, minWidth: 0 },
  hubSectionEyebrow: { color: '#728077', fontSize: 9, fontWeight: '700' },
  hubSectionTitle: { color: '#29382f', fontSize: 22, lineHeight: 28, fontWeight: '600', marginTop: 3 },
  hubSectionDescription: { color: '#68766d', fontSize: 12, lineHeight: 18, marginTop: 4, maxWidth: 450 },
  hubStatus: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 17 },
  quipSection: { maxWidth: 860, width: '100%', alignSelf: 'center', minHeight: 280, justifyContent: 'center', alignItems: 'flex-start', paddingVertical: 35, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#dfe4dc' },
  quipCount: { color: '#688074', fontSize: 9, fontWeight: '700' },
  quipDescription: { maxWidth: 470, color: '#34433b', fontSize: 18, lineHeight: 27, marginTop: 10, marginBottom: 20 },
  quipButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderRadius: 4, backgroundColor: '#34755e' },
  quipButtonText: { color: '#fffaf6', fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  content: { width: '100%', maxWidth: 1050, alignSelf: 'center', paddingHorizontal: 56, paddingTop: 43, paddingBottom: 24 },
  contentMobile: { paddingHorizontal: 20, paddingTop: 25 },
  pageHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 33 },
  syncStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: -19, marginBottom: 23 },
  syncDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#aab4ac' },
  syncDotConnected: { backgroundColor: '#398466' },
  syncDotError: { backgroundColor: '#c45d4e' },
  syncStatusText: { color: '#819087', fontSize: 8, fontWeight: '700', letterSpacing: 0.75 },
  eyebrow: { color: '#638070', fontSize: 10, fontWeight: '700', letterSpacing: 1.4, marginBottom: 9 },
  pageTitle: { color: '#25332d', fontSize: 30, lineHeight: 37, fontWeight: '600', letterSpacing: 0 },
  issueMark: { color: '#829087', fontSize: 10, fontWeight: '700', letterSpacing: 1, paddingBottom: 5 },
  issueDot: { color: '#d7805b' },
  pillarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 },
  sectionLabel: { color: '#68786e', fontSize: 9, fontWeight: '700', letterSpacing: 1.1 },
  stackCount: { color: '#929d95', fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  categoryRow: { maxWidth: 860, width: '100%', alignSelf: 'center', flexDirection: 'row', gap: 8, marginBottom: 22 },
  categoryButton: { flex: 1, minWidth: 0, minHeight: 72, justifyContent: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#d2dad2', borderRadius: 5, backgroundColor: '#f8f9f6' },
  categoryButtonSelected: { borderColor: '#34755e', backgroundColor: '#34755e' },
  categoryDot: { width: 7, height: 7, borderRadius: 4 },
  categoryButtonCopy: { minWidth: 0 },
  categoryButtonTitle: { color: '#35433b', fontSize: 11, lineHeight: 14, fontWeight: '700' },
  categoryButtonTitleSelected: { color: '#fffaf6' },
  categoryButtonCount: { color: '#879188', fontSize: 9, marginTop: 2 },
  categoryButtonCountSelected: { color: '#e5eee7' },
  searchSection: { maxWidth: 860, width: '100%', alignSelf: 'center', marginBottom: 22, zIndex: 2 },
  searchInputWrap: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#d8e0d7', borderRadius: 5, backgroundColor: '#fffefa', paddingHorizontal: 13 },
  searchInput: { flex: 1, minWidth: 0, height: 44, color: '#29382f', fontSize: 13 },
  searchClear: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  searchResults: { borderWidth: 1, borderColor: '#d8e0d7', borderTopWidth: 0, borderBottomLeftRadius: 5, borderBottomRightRadius: 5, backgroundColor: '#fffefa', overflow: 'hidden' },
  searchResult: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 13, borderTopWidth: 1, borderTopColor: '#e8ece6' },
  searchResultPressed: { backgroundColor: '#f0f4ef' },
  searchSwatch: { width: 4, height: 34, borderRadius: 2 },
  searchResultText: { flex: 1, minWidth: 0 },
  searchResultTitle: { color: '#29382f', fontSize: 12, fontWeight: '600' },
  searchResultAuthor: { color: '#78857d', fontSize: 10, marginTop: 3 },
  searchResultShelf: { color: '#819087', fontSize: 8, fontWeight: '700', letterSpacing: 0.5 },
  searchEmpty: { color: '#718077', fontSize: 12, paddingHorizontal: 14, paddingVertical: 16 },
  trendEntryButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 7, marginBottom: 15, paddingHorizontal: 11, borderRadius: 4, backgroundColor: '#e7eef0' },
  trendEntryLabel: { color: '#3e6e60', fontSize: 8, fontWeight: '800', letterSpacing: 0.6 },
  surpriseButtonPressed: { backgroundColor: '#285e4c' },
  pillarRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 27 },
  pillarButton: { minHeight: 39, paddingHorizontal: 16, borderRadius: 5, borderWidth: 1, borderColor: '#d2dad2', justifyContent: 'center', backgroundColor: '#f8f9f6' },
  pillarButtonDisabled: { opacity: 0.62 },
  pillarButtonText: { color: '#516057', fontSize: 12, fontWeight: '600' },
  pillarButtonTextActive: { color: '#fffaf6' },
  surpriseButton: { minHeight: 39, paddingHorizontal: 13, borderRadius: 5, borderWidth: 1, borderColor: '#b9d1c4', flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#e7f0e9' },
  surpriseButtonActive: { backgroundColor: '#34755e', borderColor: '#34755e' },
  surpriseText: { color: '#346c5c', fontSize: 12, fontWeight: '700' },
  cardMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  cardPosition: { color: '#98a199', fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  bookCard: { minHeight: 382, maxWidth: 860, width: '100%', alignSelf: 'center', flexDirection: 'row', backgroundColor: '#fffefa', borderWidth: 1, borderColor: '#e1e4dc', borderRadius: 6, overflow: 'hidden', shadowColor: '#263b30', shadowOpacity: 0.07, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  coverFrame: { width: '37%', minHeight: 382, position: 'relative', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  coverFallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, gap: 12 },
  coverFallbackTitle: { color: '#fffaf0', fontSize: 24, fontWeight: '700', textAlign: 'center', lineHeight: 28 },
  coverFallbackAuthor: { color: '#fffaf0', fontSize: 11, textAlign: 'center' },
  coverImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  coverCaption: { position: 'absolute', bottom: 12, left: 12, backgroundColor: 'rgba(27,42,37,0.82)', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 3 },
  coverCaptionText: { color: '#eff5ee', fontSize: 8, fontWeight: '700', letterSpacing: 1 },
  bookInfo: { flex: 1, minWidth: 0, paddingHorizontal: 31, paddingTop: 30, paddingBottom: 19 },
  pillarTag: { alignSelf: 'flex-start', height: 24, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 3, paddingHorizontal: 8 },
  pillarDot: { width: 6, height: 6, borderRadius: 3 },
  pillarTagText: { color: '#58665d', fontSize: 8, fontWeight: '700', letterSpacing: 0.9 },
  bookTitle: { color: '#25332d', fontSize: 31, lineHeight: 36, fontWeight: '600', marginTop: 17 },
  bookAuthor: { color: '#65736a', fontSize: 13, marginTop: 7 },
  authorDivider: { color: '#d7805b' },
  infoRule: { height: 1, backgroundColor: '#e8e9e3', marginVertical: 22 },
  noteLabel: { color: '#78887d', fontSize: 9, fontWeight: '700', letterSpacing: 1.1 },
  bookNote: { color: '#39473f', fontSize: 15, lineHeight: 23, marginTop: 9, maxWidth: 420 },
  adaptationSection: { marginTop: 17, paddingTop: 11, borderTopWidth: 1, borderTopColor: '#e8e9e3' },
  adaptationHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  adaptationRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 },
  adaptationCopy: { flex: 1, minWidth: 0 },
  adaptationTitle: { color: '#35433b', fontSize: 12, lineHeight: 17, fontWeight: '600' },
  adaptationMeta: { color: '#78857d', fontSize: 9, lineHeight: 14, marginTop: 2 },
  adaptationCast: { color: '#63736a', fontSize: 9, lineHeight: 14, marginTop: 3 },
  adaptationEmpty: { color: '#879188', fontSize: 10, lineHeight: 15 },
  tmdbLink: { minHeight: 28, justifyContent: 'center', paddingHorizontal: 6 },
  tmdbLinkText: { color: '#477d6c', fontSize: 8, fontWeight: '800', letterSpacing: 0.4 },
  tmdbAttribution: { color: '#9aa49c', fontSize: 7, lineHeight: 10, marginTop: 8 },
  onRampSection: { marginTop: 20, paddingTop: 13, borderTopWidth: 1, borderTopColor: '#e8e9e3' },
  onRampHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  onRampButton: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 9, borderRadius: 4, backgroundColor: '#e7f0e9' },
  onRampButtonText: { color: '#2f725b', fontSize: 8, fontWeight: '800', letterSpacing: 0.45 },
  onRampText: { color: '#39473f', fontSize: 13, lineHeight: 20, marginTop: 10 },
  onRampError: { color: '#a9443d', fontSize: 11, lineHeight: 16, marginTop: 8 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 17 },
  catalogId: { color: '#a0a9a2', fontSize: 9, fontWeight: '700', letterSpacing: 0.7 },
  actionRow: { maxWidth: 860, width: '100%', alignSelf: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, gap: 7 },
  actionRowMobile: { flexWrap: 'wrap' },
  actionButton: { flex: 1, minWidth: 0, minHeight: 65, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, borderRadius: 5, borderWidth: 1, borderColor: '#e1e4dd', backgroundColor: '#f8f9f6' },
  actionButtonMobile: { flexBasis: '31%', minHeight: 75, flexDirection: 'column', justifyContent: 'center', gap: 5, paddingHorizontal: 4 },
  actionDisabled: { opacity: 0.55 },
  actionPressed: { backgroundColor: '#e8eee8', transform: [{ scale: 0.98 }] },
  actionIcon: { width: 34, height: 34, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { color: '#34433b', fontSize: 11, fontWeight: '600', flexShrink: 1 },
  actionLabelMobile: { fontSize: 10, textAlign: 'center' },
  actionHint: { color: '#89958c', fontSize: 7, fontWeight: '700', letterSpacing: 0.4 },
  emptyState: { maxWidth: 860, width: '100%', minHeight: 300, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', padding: 30, borderWidth: 1, borderColor: '#dfe4dc', borderStyle: 'dashed', borderRadius: 6, backgroundColor: '#f8f9f6' },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#e3efe6', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { color: '#2c3c33', fontSize: 19, fontWeight: '600', textAlign: 'center' },
  emptyCopy: { color: '#718077', fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 330, marginTop: 7 },
  resetButton: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 42, borderRadius: 5, backgroundColor: '#e2efe5', paddingHorizontal: 14, marginTop: 17 },
  resetButtonText: { color: '#285f4e', fontSize: 12, fontWeight: '700' },
  shelfView: { minHeight: 350 },
  shelfList: { borderTopWidth: 1, borderTopColor: '#dfe4dc' },
  shelfRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#dfe4dc', gap: 14 },
  snoozedShelfRow: { gap: 8 },
  returnShelfRow: { gap: 8 },
  shelfIndex: { color: '#9ca69e', fontSize: 10, fontWeight: '700', width: 22 },
  shelfSwatch: { width: 4, height: 42, borderRadius: 2 },
  shelfText: { flex: 1 },
  shelfTitle: { color: '#29382f', fontSize: 15, fontWeight: '600' },
  shelfAuthor: { color: '#78857d', fontSize: 11, marginTop: 4 },
  shelfPillar: { color: '#819087', fontSize: 8, fontWeight: '700', letterSpacing: 0.8 },
  archivedLabel: { color: '#879188', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  shelfReturn: { color: '#8a6e46', fontSize: 7 },
  wakeButton: { minWidth: 54, height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 6, borderRadius: 4, backgroundColor: '#f0ebe1' },
  wakeButtonText: { color: '#765d3b', fontSize: 8, fontWeight: '800', letterSpacing: 0.4 },
  returnBookButton: { minWidth: 58, height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 6, borderRadius: 4, backgroundColor: '#e5f1e8' },
  returnBookButtonText: { color: '#2f725b', fontSize: 8, fontWeight: '800', letterSpacing: 0.4 },
  draftPostButton: { minWidth: 58, height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 6, borderRadius: 4, backgroundColor: '#e7eef0' },
  draftPostButtonText: { color: '#3e6e60', fontSize: 8, fontWeight: '800', letterSpacing: 0.4 },
  pageFooter: { borderTopWidth: 1, borderTopColor: '#dfe4dc', paddingTop: 14, marginTop: 28, flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  footerCopy: { color: '#9aa49c', fontSize: 8, fontWeight: '700', letterSpacing: 0.8 },
});