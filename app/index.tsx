import { useEffect, useRef, useState } from 'react';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bookmark,
  BookOpen,
  Check,
  Clock3,
  ExternalLink,
  House,
  Tv,
  MessageCircle,
  Search,
  Sparkles,
  UserRound,
  RotateCcw,
  X,
} from 'lucide-react-native';
import { BOOKS, PILLARS, type Book, type Pillar } from '@/lib/books';
import { linkCurrentUserEmail, resendCurrentUserEmailChange, signInWithEmail } from '@/lib/auth';
import AccountSheet from '@/components/AccountSheet';
import Pressable from '@/components/MotionPressable';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { deleteUserSwipe, getOrCreateAnonymousUser, loadUserSwipes, saveQuipEnabled, saveUserSwipe } from '@/lib/swipes';
import { getBookOnRamp } from '@/lib/onramp';
import TrendReplySheet from '@/components/TrendReplySheet';
import { generateTrendReply } from '@/lib/trendInterceptor';
import { EMPTY_CHART_DATA, loadCatalog, loadChartData, loadPillars, type ChartData } from '@/lib/catalog';
import { colors, radii, spacing, type } from '@/constants/theme';

type Screen = 'discover' | 'tbr' | 'read' | 'snoozed';
type Section = 'home' | 'book' | 'quip';
type Action = 'tbr' | 'read' | 'freeze';
type SyncStatus = 'local' | 'loading' | 'connected' | 'error';

const ACTIONS: { id: Action; label: string; hint: string; color: string; icon: typeof ArrowRight }[] = [
  { id: 'tbr', label: 'Save to TBR', hint: 'Right', color: colors.saveAction, icon: Bookmark },
  { id: 'read', label: 'Already read', hint: 'Up', color: colors.readAction, icon: Check },
  { id: 'freeze', label: 'Snooze 90 days', hint: 'Left', color: colors.snoozeAction, icon: Clock3 },
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
      <Icon color={active ? colors.forestSelected : colors.quiet} size={18} strokeWidth={1.8} />
      <Text style={[styles.navLabel, compact && styles.navLabelCompact, active && styles.navLabelActive]}>{label}</Text>
      {count !== undefined && <Text style={[styles.navCount, active && styles.navLabelActive]}>{count}</Text>}
    </Pressable>
  );
}

function BottomTab({
  label,
  active,
  onPress,
  icon: Icon,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon: typeof BookOpen;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={styles.bottomTab}
    >
      <Icon color={active ? colors.brandDeep : colors.muted} size={21} strokeWidth={active ? 2.2 : 1.8} />
      <Text style={[styles.bottomTabLabel, active && styles.bottomTabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function formatSignalDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function DiscoverScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 820;
  const [section, setSection] = useState<Section>('home');
  const [screen, setScreen] = useState<Screen>('discover');
  const [tbrIds, setTbrIds] = useState<string[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [quipBookIds, setQuipBookIds] = useState<string[]>([]);
  const [books, setBooks] = useState<Book[]>(BOOKS);
  const [pillars, setPillars] = useState(PILLARS);
  const [chartData, setChartData] = useState<ChartData>(EMPTY_CHART_DATA);
  const [chartLoadError, setChartLoadError] = useState(false);
  const [isTrendReplyVisible, setIsTrendReplyVisible] = useState(false);
  const [frozenUntil, setFrozenUntil] = useState<Record<string, number>>({});
  const [selectedPillar, setSelectedPillar] = useState<Pillar | null>(null);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
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
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const actionRef = useRef<(action: Action) => void>(() => undefined);
  const onRampRequestId = useRef(0);
  const bookCardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragX.get() },
      { translateY: dragY.get() },
      { rotate: `${interpolate(dragX.get(), [-300, 0, 300], [-8, 0, 8], Extrapolation.CLAMP)}deg` },
    ],
  }));

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
  const chartSignals = book ? chartData.listings.filter((listing) => listing.bookId === book.id) : [];

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    setSyncStatus('loading');
    setSyncMessage('');

    const restoreShelf = async () => {
      try {
        const activeUser = await getOrCreateAnonymousUser();
        if (!activeUser) throw new Error('Supabase is not configured.');
        const [swipes, catalog, remotePillars, remoteChartData] = await Promise.all([
          loadUserSwipes(activeUser.id),
          loadCatalog().catch(() => [] as Book[]),
          loadPillars().catch(() => []),
          loadChartData()
            .then((data) => ({ data, failed: false }))
            .catch(() => ({ data: EMPTY_CHART_DATA, failed: true })),
        ]);
        if (!active) return;
        if (catalog.length > 0) setBooks(catalog);
        setChartData(remoteChartData.data);
        setChartLoadError(remoteChartData.failed);
        const hasCurrentPillars = remotePillars.length === PILLARS.length && PILLARS.every((pillar) => remotePillars.some((remotePillar) => remotePillar.id === pillar.id));
        if (hasCurrentPillars) setPillars(remotePillars);

        const restoredTbr: string[] = [];
        const restoredRead: string[] = [];
        const restoredQuip: string[] = [];
        const restoredFrozen: Record<string, number> = {};
        for (const swipe of swipes) {
          if (swipe.state === 'tbr') restoredTbr.push(swipe.book_id);
          if (swipe.state === 'read') {
            restoredRead.push(swipe.book_id);
            if (swipe.quip_enabled) restoredQuip.push(swipe.book_id);
          }
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
        setQuipBookIds(restoredQuip);
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

  const handleQuipToggle = (bookId: string) => {
    if (syncStatus === 'loading' || isSaving) return;
    const wasEnabled = quipBookIds.includes(bookId);
    const nextEnabled = !wasEnabled;
    setQuipBookIds((ids) => nextEnabled ? [...ids, bookId] : ids.filter((id) => id !== bookId));
    if (!userId || !isSupabaseConfigured) return;

    setIsSaving(true);
    void saveQuipEnabled(userId, bookId, nextEnabled)
      .then(() => {
        setSyncMessage('');
        setSyncStatus('connected');
      })
      .catch(() => {
        setQuipBookIds((ids) => wasEnabled
          ? ids.includes(bookId) ? ids : [...ids, bookId]
          : ids.filter((id) => id !== bookId));
        setSyncMessage('Could not update the Quip setting. The previous setting was restored.');
        setSyncStatus('error');
      })
      .finally(() => setIsSaving(false));
  };

  const resetCardPosition = (velocityX = 0, velocityY = 0) => {
    'worklet';
    dragX.set(withSpring(0, { duration: 400, dampingRatio: 0.8, velocity: velocityX }));
    dragY.set(withSpring(0, { duration: 400, dampingRatio: 0.8, velocity: velocityY }));
  };
  const cardGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .activeOffsetY([-10, 10])
    .onUpdate((event) => {
      dragX.set(event.translationX);
      dragY.set(event.translationY);
    })
    .onEnd((event) => {
      const horizontal = Math.abs(event.translationX) > Math.abs(event.translationY);
      const distance = horizontal ? event.translationX : event.translationY;
      if (Math.abs(distance) < 70 || (!horizontal && event.translationY > 0)) {
        resetCardPosition(event.velocityX, event.velocityY);
        return;
      }

      const action: Action = horizontal
        ? event.translationX > 0 ? 'tbr' : 'freeze'
        : 'read';
      const destinationX = horizontal ? Math.sign(event.translationX) * 460 : event.translationX;
      const destinationY = horizontal ? event.translationY : -460;
      dragY.set(withSpring(destinationY, { duration: 300, dampingRatio: 0.8, velocity: event.velocityY }));
      dragX.set(withSpring(destinationX, { duration: 300, dampingRatio: 0.8, velocity: event.velocityX }, (finished) => {
        if (finished) scheduleOnRN(handleAction, action);
        dragX.set(0);
        dragY.set(0);
      }));
    })
    .onFinalize((_event, success) => {
      if (!success) resetCardPosition();
    });

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
    const wasQuipEnabled = quipBookIds.includes(bookId);
    if (!shelfBook || (!wasInTbr && !wasRead) || isSaving) return;
    const returnToDiscovery = shelfBook.isActive !== false;
    if (isSupabaseConfigured && !userId) {
      setSyncMessage('Your shelf is not connected. Reconnect before returning this book to discovery.');
      setSyncStatus('error');
      return;
    }

    setTbrIds((ids) => ids.filter((id) => id !== bookId));
    setReadIds((ids) => ids.filter((id) => id !== bookId));
    setQuipBookIds((ids) => ids.filter((id) => id !== bookId));
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
        if (wasRead && wasQuipEnabled) setQuipBookIds((ids) => ids.includes(bookId) ? ids : [...ids, bookId]);
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
    setQuipBookIds([]);
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
    setQuipBookIds([]);
    setFrozenUntil({});
    setSelectedBookId(null);
    setSelectedPillar(null);
    setSearchQuery('');
    setScreen('discover');
    setSection('home');
    setIsAccountSheetVisible(false);
    setAuthRetryCount((count) => count + 1);
  };

  const readBooks = books.filter((item) => readIds.includes(item.id));
  const quipBooks = readBooks.filter((item) => quipBookIds.includes(item.id));
  const shelfBooks = screen === 'tbr'
    ? books.filter((item) => tbrIds.includes(item.id))
    : screen === 'read'
      ? readBooks
      : frozenBooks;
  const screenTitle = screen === 'discover' ? 'Find your next read' : screen === 'tbr' ? 'Your reading list' : screen === 'read' ? 'Books you’ve read' : 'Snoozed for later';
  const syncLabel = syncStatus === 'connected'
    ? isAnonymous ? 'Synced as guest' : `Synced to ${accountEmail ?? 'your account'}`
    : syncStatus === 'loading'
      ? 'Connecting to your shelf…'
      : syncStatus === 'error'
        ? `Couldn’t sync: ${syncMessage}`
        : 'Preview mode · changes stay on this device';
  const pageHeading = (
    <View style={styles.pageHeading}>
      <View>
        <Text style={styles.eyebrow}>{section === 'home' ? 'YOUR LIBRARY' : section === 'book' ? 'BOOK' : 'QUIP'}</Text>
        <Text style={styles.pageTitle}>{section === 'home' ? 'Your Library' : section === 'book' ? screenTitle : 'Your Quip library'}</Text>
      </View>
      {isWide && <Text style={styles.issueMark}>FIELD NOTES <Text style={styles.issueDot}>·</Text> 2026</Text>}
    </View>
  );
  const syncStatusIndicator = (
    <View style={styles.syncStatusRow}>
      <View style={[styles.syncDot, syncStatus === 'connected' && styles.syncDotConnected, syncStatus === 'error' && styles.syncDotError]} />
      <Text numberOfLines={1} style={styles.syncStatusText}>{syncLabel}</Text>
    </View>
  );
  const pageFooter = isWide ? (
    <View style={styles.pageFooter}>
      <Text style={styles.footerCopy}>A GOOD BOOK IS A CHANGE OF PERSPECTIVE.</Text>
      <Text style={styles.footerCopy}>BOOQUIP <Text style={styles.issueDot}>·</Text> FIELD NOTES</Text>
    </View>
  ) : null;
  const shelfListHeader = (
    <View>
      {pageHeading}
      {syncStatusIndicator}
      <View style={styles.pillarHeader}>
        <Text style={styles.sectionLabel}>{screen === 'tbr' ? 'SAVED FOR LATER' : screen === 'read' ? 'MARKED AS READ' : 'SNOOZED FOR LATER'}</Text>
        <Text style={styles.stackCount}>{String(shelfBooks.length).padStart(2, '0')} BOOKS</Text>
      </View>
    </View>
  );
  const quipListHeader = (
    <View>
      {pageHeading}
      {syncStatusIndicator}
      <View style={styles.quipSection}>
        <View style={styles.quipHeader}>
          <View style={styles.quipIntro}>
            <Text style={styles.quipCount}>{quipBooks.length} {quipBooks.length === 1 ? 'BOOK' : 'BOOKS'} IN QUIP</Text>
            <Text style={styles.quipDescription}>Read books you switch on are collected here.</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={quipBooks.length === 0 || syncStatus === 'loading'}
            onPress={() => setIsTrendReplyVisible(true)}
            style={({ pressed }) => [styles.quipButton, (quipBooks.length === 0 || syncStatus === 'loading') && styles.actionDisabled, pressed && styles.actionPressed]}
          >
            <MessageCircle color={colors.brandContrast} size={16} />
            <Text style={styles.quipButtonText}>REPLY TO TREND</Text>
          </Pressable>
        </View>
        {quipBooks.length > 0 && (
          <View style={styles.quipShelfHeading}>
            <Text style={styles.sectionLabel}>SWITCHED ON FOR QUIP</Text>
            <Text style={styles.stackCount}>{quipBooks.length} {quipBooks.length === 1 ? 'BOOK' : 'BOOKS'}</Text>
          </View>
        )}
      </View>
    </View>
  );
  const renderQuipBook = ({ item }: ListRenderItemInfo<Book>) => (
    <View style={styles.quipBookRow}>
      <View style={[styles.quipBookCover, { backgroundColor: item.color }]}>
        <BookOpen color={colors.white} size={18} strokeWidth={1.6} />
      </View>
      <View style={styles.quipBookCopy}>
        <Text style={styles.quipBookTitle}>{item.title}</Text>
        <Text style={styles.quipBookAuthor}>{item.author}{item.year ? ` · ${item.year}` : ''}</Text>
      </View>
      <Text style={styles.quipEnabledLabel}>QUIP ON</Text>
    </View>
  );
  const renderShelfBook = ({ item, index }: ListRenderItemInfo<Book>) => (
    <View style={[styles.shelfRow, screen === 'snoozed' ? styles.snoozedShelfRow : styles.returnShelfRow]}>
      <Text style={styles.shelfIndex}>{String(index + 1).padStart(2, '0')}</Text>
      <View style={[styles.shelfSwatch, { backgroundColor: item.color }]} />
      <View style={styles.shelfText}>
        <Text style={styles.shelfTitle}>{item.title}</Text>
        <Text style={styles.shelfAuthor}>{item.author}{item.year ? ` · ${item.year}` : ''}</Text>
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
          <RotateCcw color={colors.gold} size={15} />
          <Text style={styles.wakeButtonText}>WAKE</Text>
        </Pressable>
      )}
      {screen === 'read' && (
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{
            checked: quipBookIds.includes(item.id),
            disabled: isSaving || syncStatus === 'loading',
          }}
          accessibilityLabel={`${quipBookIds.includes(item.id) ? 'Quip on for' : 'Quip off for'} ${item.title}`}
          disabled={isSaving || syncStatus === 'loading'}
          onPress={() => handleQuipToggle(item.id)}
          style={({ pressed }) => [
            styles.quipToggle,
            quipBookIds.includes(item.id) && styles.quipToggleEnabled,
            (isSaving || syncStatus === 'loading') && styles.actionDisabled,
            pressed && styles.actionPressed,
          ]}
        >
          <MessageCircle color={quipBookIds.includes(item.id) ? colors.brand : colors.secondary} size={14} />
          <Text style={[styles.quipToggleLabel, quipBookIds.includes(item.id) && styles.quipToggleLabelEnabled]}>
            {quipBookIds.includes(item.id) ? 'QUIP ON' : 'QUIP OFF'}
          </Text>
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
          <RotateCcw color={colors.brand} size={14} />
          <Text style={styles.returnBookButtonText}>{item.isActive === false ? 'REMOVE' : 'RETURN'}</Text>
        </Pressable>
      )}
    </View>
  );
  const emptyShelfState = (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}><BookOpen color={colors.brandMuted} size={24} /></View>
      <Text style={styles.emptyTitle}>{screen === 'snoozed' ? 'Nothing on snooze.' : 'A shelf with room to grow.'}</Text>
      <Text style={styles.emptyCopy}>{screen === 'snoozed' ? 'Books you snooze will return to discovery after their 90-day break.' : 'Books you sort in discovery will appear here.'}</Text>
      <Pressable onPress={() => setScreen('discover')} style={styles.resetButton}>
        <Sparkles color={colors.brandDeep} size={16} />
        <Text style={styles.resetButtonText}>Discover books</Text>
      </Pressable>
    </View>
  );
  const emptyQuipState = (
    <View style={styles.quipEmptyState}>
      <View style={styles.emptyIcon}><BookOpen color={colors.brandMuted} size={22} /></View>
      <View style={styles.quipEmptyCopy}>
        <Text style={styles.emptyTitle}>{readBooks.length ? 'Quip is off for all Read books.' : 'Your Read shelf is empty.'}</Text>
        <Text style={styles.emptyCopy}>{readBooks.length ? 'Turn Quip on for a book from your Read shelf to add it here.' : 'Mark a book as read, then switch Quip on to add it here.'}</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={() => {
        setSection('book');
        setScreen(readBooks.length ? 'read' : 'discover');
        setSelectedPillar(null);
        setSelectedBookId(null);
      }} style={styles.resetButton}>
        <Sparkles color={colors.brandDeep} size={16} />
        <Text style={styles.resetButtonText}>{readBooks.length ? 'OPEN READ SHELF' : 'FIND A BOOK'}</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.appShell}>
        {isWide && (
          <View style={styles.sidebar}>
            <View style={styles.brandLockup}>
              <View style={styles.brandMark}><BookOpen color={colors.forest} size={20} strokeWidth={2} /></View>
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
              <View style={styles.brandMark}><BookOpen color={colors.forest} size={18} strokeWidth={2} /></View>
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
              <UserRound color={colors.brandMuted} size={16} />
              <Text style={styles.accountButtonText}>{isAnonymous ? 'Link shelf' : 'Account'}</Text>
            </Pressable>
          </View>

          {section === 'book' && !isWide && (
            <View style={[styles.mobileNav, styles.bookShelfNav]}>
              <NavItem compact label="Discover" active={screen === 'discover'} onPress={() => setScreen('discover')} icon={Sparkles} />
              <NavItem compact label="TBR" count={tbrIds.length} active={screen === 'tbr'} onPress={() => setScreen('tbr')} icon={Bookmark} />
              <NavItem compact label="Read" count={readIds.length} active={screen === 'read'} onPress={() => setScreen('read')} icon={Check} />
              <NavItem compact label="Snoozed" count={frozenBooks.length} active={screen === 'snoozed'} onPress={() => setScreen('snoozed')} icon={Clock3} />
            </View>
          )}

          {section === 'quip' ? (
            <FlashList
              style={styles.contentList}
              contentContainerStyle={[styles.content, !isWide && styles.contentMobile]}
              data={quipBooks}
              keyExtractor={(item) => item.id}
              renderItem={renderQuipBook}
              ListHeaderComponent={quipListHeader}
              ListEmptyComponent={emptyQuipState}
              ListFooterComponent={pageFooter}
            />
          ) : section === 'book' && screen !== 'discover' ? (
            <FlashList
              style={styles.contentList}
              contentContainerStyle={[styles.content, !isWide && styles.contentMobile]}
              data={shelfBooks}
              keyExtractor={(item) => item.id}
              renderItem={renderShelfBook}
              extraData={[screen, quipBookIds, frozenUntil, isSaving, syncStatus]}
              ListHeaderComponent={shelfListHeader}
              ListEmptyComponent={emptyShelfState}
              ListFooterComponent={pageFooter}
            />
          ) : (
          <ScrollView contentContainerStyle={[styles.content, !isWide && styles.contentMobile]}>
            {pageHeading}
            {syncStatusIndicator}

            {section === 'home' ? (
              <View style={styles.hubSections}>
                <Pressable accessibilityRole="button" onPress={() => { setSection('book'); setScreen('discover'); }}
                  style={({ pressed }) => [styles.hubSection, pressed && styles.hubSectionPressed]}>
                  <View style={styles.hubSectionIcon}><BookOpen color={colors.brand} size={21} /></View>
                  <View style={styles.hubSectionCopy}>
                    <Text style={styles.hubSectionEyebrow}>DISCOVER AND COLLECT</Text>
                    <Text style={styles.hubSectionTitle}>Book</Text>
                    <Text style={styles.hubSectionDescription}>Find a book, save it, mark it read, or snooze it for later.</Text>
                  </View>
                  <ArrowRight color={colors.secondary} size={18} />
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => setSection('quip')}
                  style={({ pressed }) => [styles.hubSection, pressed && styles.hubSectionPressed]}>
                  <View style={styles.hubSectionIcon}><MessageCircle color={colors.brandMuted} size={21} /></View>
                  <View style={styles.hubSectionCopy}>
                    <Text style={styles.hubSectionEyebrow}>WRITE FROM WHAT YOU READ</Text>
                    <Text style={styles.hubSectionTitle}>Quip</Text>
                    <Text style={styles.hubSectionDescription}>{quipBooks.length ? `${quipBooks.length} Read ${quipBooks.length === 1 ? 'book is' : 'books are'} switched on for Quip.` : 'Choose which Read books to keep in your Quip library.'}</Text>
                  </View>
                  <ArrowRight color={colors.secondary} size={18} />
                </Pressable>
              </View>
            ) : screen === 'discover' ? (
              <>
                <View style={styles.searchSection}>
                  <View style={styles.searchInputWrap}>
                    <Search color={colors.secondary} size={17} />
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
                      placeholderTextColor={colors.muted}
                      returnKeyType="search"
                      style={styles.searchInput}
                      value={searchQuery}
                    />
                    {searchQuery.length > 0 && (
                      <Pressable accessibilityRole="button" accessibilityLabel="Clear book search" onPress={() => setSearchQuery('')} style={styles.searchClear}>
                        <X color={colors.secondary} size={16} />
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
                            <Text style={styles.searchResultAuthor}>{result.author}{result.year ? ` · ${result.year}` : ''}</Text>
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
                    <Sparkles color={colors.brandContrast} size={14} />
                    <Text style={styles.surpriseText}>SURPRISE ME</Text>
                  </Pressable>
                </View>

                <View style={[styles.categoryRow, !isWide && styles.categoryRowMobile]}>
                  {pillars.map((pillar) => {
                    const count = availableBooks.filter((availableBook) => availableBook.pillar === pillar.id).length;
                    const selected = selectedPillar === pillar.id;
                    return <Pressable key={pillar.id} accessibilityRole="button" accessibilityState={{ selected }}
                      disabled={syncStatus === 'loading'} onPress={() => selectPillar(pillar.id)}
                      style={({ pressed }) => [styles.categoryButton, !isWide && styles.categoryButtonMobile, selected && styles.categoryButtonSelected, syncStatus === 'loading' && styles.actionDisabled, pressed && styles.actionPressed]}>
                      <View style={[styles.categoryDot, { backgroundColor: pillar.color }]} />
                      <View style={styles.categoryButtonCopy}>
                        <Text style={[styles.categoryButtonTitle, selected && styles.categoryButtonTitleSelected]}>{pillar.label}</Text>
                        <Text style={[styles.categoryButtonCount, selected && styles.categoryButtonCountSelected]}>
                          {count} available
                        </Text>
                      </View>
                    </Pressable>;
                  })}
                </View>

                <View style={styles.cardMetaRow}>
                  <Text style={styles.sectionLabel}>
                    {currentPillar?.label.toUpperCase() ?? 'CHOOSE A CATEGORY'}
                  </Text>
                  <Text style={styles.cardPosition}>
                    {book ? 'YOUR NEXT READ' : selectedPillar ? 'CATEGORY EMPTY · CHOOSE AGAIN' : 'READY WHEN YOU ARE'}
                  </Text>
                </View>

                {book ? (
                  <GestureDetector gesture={cardGesture}>
                    <Animated.View style={[styles.bookCard, !isWide && styles.bookCardMobile, bookCardStyle]}>
                    <View style={[styles.coverFrame, !isWide && styles.coverFrameMobile, { backgroundColor: book.color }]}>
                      <View style={styles.coverFallback}>
                        <BookOpen color={colors.white} size={32} strokeWidth={1.5} />
                        <Text style={styles.coverFallbackTitle}>{book.title}</Text>
                        <Text style={styles.coverFallbackAuthor}>{book.author}</Text>
                      </View>
                      {!coverFailed && (book.coverUrl || book.isbn) && (
                        <Image
                          accessibilityLabel={`Cover of ${book.title}`}
                          onError={() => setCoverFailed(true)}
                          source={{ uri: book.coverUrl ?? `https://covers.openlibrary.org/b/isbn/${book.isbn}-L.jpg` }}
                          style={styles.coverImage}
                          resizeMode="cover"
                        />
                      )}
                      <View style={styles.coverCaption}><Text style={styles.coverCaptionText}>A BOOQUIP PICK</Text></View>
                    </View>
                    <View style={[styles.bookInfo, !isWide && styles.bookInfoMobile]}>
                      <View style={[styles.pillarTag, { borderColor: currentPillar?.color ?? colors.brandMuted }]}>
                        <View style={[styles.pillarDot, { backgroundColor: currentPillar?.color ?? colors.brandMuted }]} />
                        <Text style={styles.pillarTagText}>{currentPillar?.label.toUpperCase()}</Text>
                      </View>
                      {chartSignals.length > 0 && (
                        <View style={styles.bookChartSignals}>
                          {chartSignals.map((signal) => (
                            <View key={signal.id} style={styles.bookChartSignal}>
                              <View style={styles.bookChartSignalCopy}>
                                <Text style={[styles.bookChartSignalType, signal.chartKind === 'reader_trend' && styles.bookChartSignalTrend]}>
                                  {signal.chartKind === 'reader_trend'
                                    ? 'READER TREND'
                                    : signal.chartKind === 'audio_bestseller' ? 'AUDIO BESTSELLER' : 'RANKED BESTSELLER'}
                                </Text>
                                <Text style={styles.bookChartSignalMeta}>
                                  {signal.marketCode} · {signal.listName} · #{signal.rank} · {formatSignalDate(signal.chartDate)}
                                </Text>
                              </View>
                              {signal.chartKind === 'reader_trend' ? (
                                <Pressable
                                  accessibilityRole="link"
                                  accessibilityLabel={`View ${book.title} on Open Library`}
                                  onPress={() => void Linking.openURL(signal.sourceUrl)}
                                  style={styles.chartSourceLink}
                                >
                                  <ExternalLink color={colors.brandMuted} size={15} />
                                </Pressable>
                              ) : null}
                            </View>
                          ))}
                        </View>
                      )}
                      <Text style={styles.bookTitle}>{book.title}</Text>
                      <Text style={styles.bookAuthor}>{book.author}{book.year ? <> <Text style={styles.authorDivider}>/</Text> {book.year}</> : ''}</Text>
                      <View style={styles.infoRule} />
                      <Text style={styles.noteLabel}>THE SHORT TAKE</Text>
                      <Text style={styles.bookNote}>{book.note}</Text>
                      <View style={styles.adaptationSection}>
                        <View style={styles.adaptationHeader}>
                          <Tv color={colors.secondary} size={14} />
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
                            <Sparkles color={colors.brand} size={14} />
                            <Text style={styles.onRampButtonText}>{isOnRampLoading ? 'THINKING…' : onRampText ? 'TRY AGAIN' : 'GET ON-RAMP'}</Text>
                          </Pressable>
                        </View>
                        {onRampText ? <Text accessibilityLiveRegion="polite" style={styles.onRampText}>{onRampText}</Text> : null}
                        {onRampError ? <Text accessibilityRole="alert" style={styles.onRampError}>{onRampError}</Text> : null}
                      </View>
                      <View style={styles.cardFooter}>
                        <Text style={styles.catalogId}>BQ · {book.id.toUpperCase()}</Text>
                        <BookOpen color={colors.quiet} size={17} strokeWidth={1.6} />
                      </View>
                    </View>
                    </Animated.View>
                  </GestureDetector>
                ) : selectedPillar ? (
                  <View style={styles.emptyState}>
                    <View style={styles.emptyIcon}><BookOpen color={colors.brandMuted} size={24} /></View>
                    <Text style={styles.emptyTitle}>No available books in {currentPillar?.label}.</Text>
                    <Text style={styles.emptyCopy}>
                      {selectedPillar === 'charts' && chartLoadError
                        ? 'Chart signals could not be refreshed.'
                        : 'Choose another category or use Surprise Me across the available books.'}
                    </Text>
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
            ) : null}

            {isWide && (
              <View style={styles.pageFooter}>
                <Text style={styles.footerCopy}>A GOOD BOOK IS A CHANGE OF PERSPECTIVE.</Text>
                <Text style={styles.footerCopy}>BOOQUIP <Text style={styles.issueDot}>·</Text> FIELD NOTES</Text>
              </View>
            )}
          </ScrollView>
          )}
          {!isWide && (
            <View style={styles.bottomBar}>
              <BottomTab label="Home" active={section === 'home'} onPress={() => setSection('home')} icon={House} />
              <BottomTab
                label="Books"
                active={section === 'book'}
                onPress={() => { setSection('book'); setScreen('discover'); }}
                icon={BookOpen}
              />
              <BottomTab label="Quip" active={section === 'quip'} onPress={() => setSection('quip')} icon={MessageCircle} />
            </View>
          )}
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
      <TrendReplySheet
        visible={isTrendReplyVisible}
        books={quipBooks}
        onClose={() => setIsTrendReplyVisible(false)}
        onGenerate={generateTrendReply}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.page },
  appShell: { flex: 1, flexDirection: 'row', backgroundColor: colors.page },
  sidebar: { width: 238, backgroundColor: colors.forest, paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, paddingBottom: 22 },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.brandHighlight, alignItems: 'center', justifyContent: 'center' },
  brandName: { color: colors.surfaceWarm, fontSize: type.brand, fontWeight: '700', letterSpacing: -0.5 },
  sidebarEyebrow: { color: colors.navMuted, fontSize: type.caption, fontWeight: '700', letterSpacing: 1.4, marginTop: 56, marginBottom: 15 },
  navItem: { height: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radii.md, marginBottom: 5 },
  navItemCompact: { flex: 1, justifyContent: 'center', gap: 5, paddingHorizontal: spacing.xxs, marginBottom: 0, borderRadius: 14 },
  navItemActive: { backgroundColor: colors.brandSoft },
  navItemDisabled: { opacity: 0.5 },
  navLabel: { flex: 1, color: colors.navText, fontSize: type.bodyMedium, fontWeight: '500' },
  navLabelCompact: { flex: 0, fontSize: 10 },
  navLabelActive: { color: colors.forestSelected, fontWeight: '700' },
  navCount: { color: colors.quiet, fontSize: type.footnote, fontVariant: ['tabular-nums'] },
  sidebarFooter: { marginTop: 'auto', borderTopWidth: 1, borderTopColor: colors.forestLine, paddingTop: 17 },
  sidebarFooterLabel: { color: colors.navMuted, fontSize: type.label, fontWeight: '700', letterSpacing: 1.1 },
  sidebarFooterText: { color: colors.borderStrong, fontSize: type.footnote, lineHeight: 18, marginTop: spacing.xs, maxWidth: 170 },
  mainArea: { flex: 1, minWidth: 0 },
  mobileHeader: { minHeight: 66, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, backgroundColor: colors.surfaceWarm },
  mobileEdition: { color: colors.secondary, fontSize: type.label, fontWeight: '700', letterSpacing: 1.1 },
  accountButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: 13, borderRadius: 22, backgroundColor: colors.brandPale },
  accountButtonText: { color: colors.brandMuted, fontSize: type.caption, fontWeight: '700' },
  mobileNav: { flexDirection: 'row', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, backgroundColor: colors.page },
  bookShelfNav: { borderBottomWidth: 1, borderBottomColor: colors.border },
  bottomBar: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  bottomTab: { minWidth: 78, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: spacing.xxs, borderRadius: 15 },
  bottomTabLabel: { color: colors.muted, fontSize: type.caption, fontWeight: '600' },
  bottomTabLabelActive: { color: colors.brandDeep, fontWeight: '700' },
  hubSections: { maxWidth: 860, width: '100%', alignSelf: 'center', gap: 14 },
  hubSection: { minHeight: 132, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: 18, paddingVertical: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.surface, shadowColor: colors.forest, shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  hubSectionPressed: { backgroundColor: colors.surfaceMuted, transform: [{ scale: 0.99 }] },
  hubSectionIcon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.brandSoft },
  hubSectionCopy: { flex: 1, minWidth: 0 },
  hubSectionEyebrow: { color: colors.secondary, fontSize: type.caption, fontWeight: '700' },
  hubSectionTitle: { color: colors.ink, fontSize: type.sectionTitle, lineHeight: 30, fontWeight: '700', marginTop: 4 },
  hubSectionDescription: { color: colors.secondary, fontSize: type.bodyMedium, lineHeight: 19, marginTop: 5, maxWidth: 450 },
  quipSection: { maxWidth: 860, width: '100%', alignSelf: 'center', padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.surface },
  quipHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm, marginBottom: 22 },
  quipIntro: { flex: 1, minWidth: 220 },
  quipCount: { color: colors.secondary, fontSize: type.bodySmall, fontWeight: '700' },
  quipDescription: { maxWidth: 470, color: colors.body, fontSize: type.subtitle, lineHeight: 24, marginTop: spacing.xs, marginBottom: 14 },
  quipButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: 16, backgroundColor: colors.brandStrong },
  quipButtonText: { color: colors.brandContrast, fontSize: type.bodySmall, fontWeight: '700' },
  quipEmptyState: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 14, padding: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surfaceMuted },
  quipEmptyCopy: { flex: 1, minWidth: 200 },
  quipShelf: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  quipShelfHeading: { minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  quipBookRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 13, marginTop: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface },
  quipBookCover: { width: 44, height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  quipBookCopy: { flex: 1, minWidth: 0 },
  quipBookTitle: { color: colors.ink, fontSize: type.body, lineHeight: 19, fontWeight: '700' },
  quipBookAuthor: { color: colors.muted, fontSize: type.bodySmall, lineHeight: 16, marginTop: 3 },
  quipEnabledLabel: { color: colors.brand, fontSize: type.caption, fontWeight: '700', paddingHorizontal: 8 },
  contentList: { flex: 1 },
  content: { width: '100%', maxWidth: 1050, alignSelf: 'center', paddingHorizontal: 56, paddingTop: 43, paddingBottom: 24 },
  contentMobile: { paddingHorizontal: 18, paddingTop: spacing.xl, paddingBottom: 28 },
  pageHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 22 },
  syncStatusRow: { minHeight: 34, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', marginTop: -10, marginBottom: 22, paddingHorizontal: 11, borderRadius: 18, backgroundColor: colors.brandPale },
  syncDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.quiet },
  syncDotConnected: { backgroundColor: colors.brand },
  syncDotError: { backgroundColor: colors.danger },
  syncStatusText: { flexShrink: 1, color: colors.brandMuted, fontSize: type.bodySmall, fontWeight: '600' },
  eyebrow: { color: colors.secondary, fontSize: type.bodySmall, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  pageTitle: { color: colors.inkStrong, fontSize: type.display, lineHeight: 39, fontWeight: '700', letterSpacing: -0.5 },
  issueMark: { color: colors.muted, fontSize: type.caption, fontWeight: '700', letterSpacing: 1, paddingBottom: 5 },
  issueDot: { color: colors.warm },
  pillarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 },
  sectionLabel: { color: colors.secondary, fontSize: type.caption, fontWeight: '700', letterSpacing: 0.65 },
  stackCount: { color: colors.quiet, fontSize: type.label, fontWeight: '700', letterSpacing: 0.8 },
  categoryRow: { maxWidth: 860, width: '100%', alignSelf: 'center', flexDirection: 'row', gap: spacing.xs, marginBottom: 22 },
  categoryButton: { flex: 1, minWidth: 0, minHeight: 72, justifyContent: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: spacing.xs, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.md, backgroundColor: colors.surface },
  categoryButtonMobile: { flexBasis: '47%', minHeight: 76, paddingHorizontal: 14 },
  categoryRowMobile: { flexWrap: 'wrap' },
  categoryButtonSelected: { borderColor: colors.brandStrong, backgroundColor: colors.brandStrong },
  categoryDot: { width: 7, height: 7, borderRadius: 4 },
  categoryButtonCopy: { minWidth: 0 },
  categoryButtonTitle: { color: colors.body, fontSize: type.footnote, lineHeight: 16, fontWeight: '700' },
  categoryButtonTitleSelected: { color: colors.brandContrast },
  categoryButtonCount: { color: colors.muted, fontSize: type.label, marginTop: 2 },
  categoryButtonCountSelected: { color: colors.brandSoft },
  searchSection: { maxWidth: 860, width: '100%', alignSelf: 'center', marginBottom: 22, zIndex: 2 },
  searchInputWrap: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 16, backgroundColor: colors.surface, paddingHorizontal: 15 },
  searchInput: { flex: 1, minWidth: 0, height: 50, color: colors.ink, fontSize: 15 },
  searchClear: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  searchResults: { borderWidth: 1, borderColor: colors.borderStrong, borderTopWidth: 0, borderBottomLeftRadius: 5, borderBottomRightRadius: 5, backgroundColor: colors.surface, overflow: 'hidden' },
  searchResult: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: 13, borderTopWidth: 1, borderTopColor: colors.border },
  searchResultPressed: { backgroundColor: colors.surfaceMuted },
  searchSwatch: { width: 4, height: 34, borderRadius: 2 },
  searchResultText: { flex: 1, minWidth: 0 },
  searchResultTitle: { color: colors.ink, fontSize: type.footnote, fontWeight: '600' },
  searchResultAuthor: { color: colors.muted, fontSize: type.caption, marginTop: 3 },
  searchResultShelf: { color: colors.muted, fontSize: type.tiny, fontWeight: '700', letterSpacing: 0.5 },
  searchEmpty: { color: colors.secondary, fontSize: type.footnote, paddingHorizontal: 14, paddingVertical: 16 },
  surpriseButtonPressed: { backgroundColor: colors.brandDeep },
  pillarRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: 27 },
  pillarButton: { minHeight: 39, paddingHorizontal: spacing.md, borderRadius: 5, borderWidth: 1, borderColor: colors.borderStrong, justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  pillarButtonDisabled: { opacity: 0.62 },
  pillarButtonText: { color: colors.body, fontSize: type.footnote, fontWeight: '600' },
  pillarButtonTextActive: { color: colors.brandContrast },
  surpriseButton: { minHeight: 39, paddingHorizontal: 13, borderRadius: 5, borderWidth: 1, borderColor: colors.brandSoft, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.brandSoft },
  surpriseButtonActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  surpriseText: { color: colors.brandMuted, fontSize: type.footnote, fontWeight: '700' },
  cardMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  cardPosition: { color: colors.quiet, fontSize: type.label, fontWeight: '700', letterSpacing: 0.8 },
  bookChartSignals: { gap: 7, marginTop: 13 },
  bookChartSignal: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.xs, paddingVertical: 5, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 4, backgroundColor: colors.blueSoft },
  bookChartSignalCopy: { flex: 1, minWidth: 0 },
  bookChartSignalType: { color: colors.blueMuted, fontSize: type.tiny, lineHeight: 12, fontWeight: '800' },
  bookChartSignalTrend: { color: colors.brand },
  bookChartSignalMeta: { color: colors.muted, fontSize: type.tiny, lineHeight: 12, marginTop: 1 },
  chartSourceLink: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  bookCard: { minHeight: 382, maxWidth: 860, width: '100%', alignSelf: 'center', flexDirection: 'row', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 22, overflow: 'hidden', shadowColor: colors.forest, shadowOpacity: 0.07, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  bookCardMobile: { flexDirection: 'column', minHeight: 0 },
  coverFrame: { width: '37%', minHeight: 382, position: 'relative', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  coverFrameMobile: { width: '100%', height: 250, minHeight: 250 },
  coverFallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, gap: 12 },
  coverFallbackTitle: { color: colors.white, fontSize: type.sectionTitle, fontWeight: '700', textAlign: 'center', lineHeight: 28 },
  coverFallbackAuthor: { color: colors.white, fontSize: type.bodySmall, textAlign: 'center' },
  coverImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  coverCaption: { position: 'absolute', bottom: 12, left: 12, backgroundColor: 'rgba(27,42,37,0.82)', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 3 },
  coverCaptionText: { color: colors.brandSoft, fontSize: type.tiny, fontWeight: '700', letterSpacing: 1 },
  bookInfo: { flex: 1, minWidth: 0, paddingHorizontal: 31, paddingTop: 30, paddingBottom: 19 },
  bookInfoMobile: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 18 },
  pillarTag: { alignSelf: 'flex-start', height: 24, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 3, paddingHorizontal: 8 },
  pillarDot: { width: 6, height: 6, borderRadius: 3 },
  pillarTagText: { color: colors.body, fontSize: type.tiny, fontWeight: '700', letterSpacing: 0.9 },
  bookTitle: { color: colors.inkStrong, fontSize: type.bookTitle, lineHeight: 35, fontWeight: '700', marginTop: 15 },
  bookAuthor: { color: colors.secondary, fontSize: type.bodyMedium, marginTop: 7 },
  authorDivider: { color: colors.warm },
  infoRule: { height: 1, backgroundColor: colors.border, marginVertical: 22 },
  noteLabel: { color: colors.muted, fontSize: type.label, fontWeight: '700', letterSpacing: 1.1 },
  bookNote: { color: colors.body, fontSize: type.bodyLarge, lineHeight: 23, marginTop: 9, maxWidth: 420 },
  adaptationSection: { marginTop: 17, paddingTop: 11, borderTopWidth: 1, borderTopColor: colors.border },
  adaptationHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  adaptationRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 },
  adaptationCopy: { flex: 1, minWidth: 0 },
  adaptationTitle: { color: colors.body, fontSize: type.footnote, lineHeight: 17, fontWeight: '600' },
  adaptationMeta: { color: colors.muted, fontSize: type.label, lineHeight: 14, marginTop: 2 },
  adaptationCast: { color: colors.secondary, fontSize: type.label, lineHeight: 14, marginTop: 3 },
  adaptationEmpty: { color: colors.muted, fontSize: type.caption, lineHeight: 15 },
  tmdbLink: { minHeight: 28, justifyContent: 'center', paddingHorizontal: 6 },
  tmdbLinkText: { color: colors.brandMuted, fontSize: type.tiny, fontWeight: '800', letterSpacing: 0.4 },
  tmdbAttribution: { color: colors.quiet, fontSize: type.micro, lineHeight: 10, marginTop: 8 },
  onRampSection: { marginTop: spacing.lg, paddingTop: 13, borderTopWidth: 1, borderTopColor: colors.border },
  onRampHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs, flexWrap: 'wrap' },
  onRampButton: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 9, borderRadius: 4, backgroundColor: colors.brandSoft },
  onRampButtonText: { color: colors.brandStrong, fontSize: type.tiny, fontWeight: '800', letterSpacing: 0.45 },
  onRampText: { color: colors.body, fontSize: type.bodyMedium, lineHeight: 20, marginTop: 10 },
  onRampError: { color: colors.danger, fontSize: type.bodySmall, lineHeight: 16, marginTop: 8 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 17 },
  catalogId: { color: colors.quiet, fontSize: type.label, fontWeight: '700', letterSpacing: 0.7 },
  actionRow: { maxWidth: 860, width: '100%', alignSelf: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, gap: 7 },
  actionRowMobile: { flexWrap: 'wrap' },
  actionButton: { flex: 1, minWidth: 0, minHeight: 65, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  actionButtonMobile: { flexBasis: '31%', minHeight: 88, flexDirection: 'column', justifyContent: 'center', gap: 7, paddingHorizontal: 4 },
  actionDisabled: { opacity: 0.55 },
  actionPressed: { backgroundColor: colors.brandSoft, transform: [{ scale: 0.98 }] },
  actionIcon: { width: 38, height: 38, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { color: colors.body, fontSize: type.bodySmall, fontWeight: '600', flexShrink: 1 },
  actionLabelMobile: { fontSize: type.bodySmall, textAlign: 'center' },
  actionHint: { color: colors.muted, fontSize: type.micro, fontWeight: '700', letterSpacing: 0.4 },
  emptyState: { maxWidth: 860, width: '100%', minHeight: 300, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', padding: 30, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surface },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { color: colors.inkStrong, fontSize: type.heading, fontWeight: '600', textAlign: 'center' },
  emptyCopy: { color: colors.secondary, fontSize: type.bodyMedium, lineHeight: 20, textAlign: 'center', maxWidth: 330, marginTop: 7 },
  resetButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 42, borderRadius: 5, backgroundColor: colors.brandSoft, paddingHorizontal: 14, marginTop: 17 },
  resetButtonText: { color: colors.brandDeep, fontSize: type.footnote, fontWeight: '700' },
  shelfView: { minHeight: 350 },
  shelfList: { gap: 8 },
  shelfRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface, paddingHorizontal: spacing.sm, gap: 14 },
  snoozedShelfRow: { gap: 8 },
  returnShelfRow: { gap: 8 },
  shelfIndex: { color: colors.quiet, fontSize: type.caption, fontWeight: '700', width: 22 },
  shelfSwatch: { width: 4, height: 42, borderRadius: 2 },
  shelfText: { flex: 1 },
  shelfTitle: { color: colors.ink, fontSize: type.bodyLarge, fontWeight: '600' },
  shelfAuthor: { color: colors.muted, fontSize: type.bodySmall, marginTop: 4 },
  shelfPillar: { color: colors.muted, fontSize: type.tiny, fontWeight: '700', letterSpacing: 0.8 },
  archivedLabel: { color: colors.muted, fontSize: type.tiny, fontWeight: '800', letterSpacing: 0.5 },
  shelfReturn: { color: colors.gold, fontSize: 7 },
  wakeButton: { minWidth: 54, height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xxs, paddingHorizontal: 6, borderRadius: 4, backgroundColor: colors.goldSoft },
  wakeButtonText: { color: colors.goldDark, fontSize: type.tiny, fontWeight: '800', letterSpacing: 0.4 },
  returnBookButton: { minWidth: 58, height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xxs, paddingHorizontal: 6, borderRadius: 4, backgroundColor: colors.brandSoft },
  returnBookButtonText: { color: colors.brandStrong, fontSize: type.tiny, fontWeight: '800', letterSpacing: 0.4 },
  quipToggle: { minWidth: 82, height: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 7, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 4, backgroundColor: colors.surfaceMuted },
  quipToggleEnabled: { borderColor: colors.brandSoft, backgroundColor: colors.brandSoft },
  quipToggleLabel: { color: colors.secondary, fontSize: type.tiny, fontWeight: '800', letterSpacing: 0.35 },
  quipToggleLabelEnabled: { color: colors.brand },
  pageFooter: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14, marginTop: 28, flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  footerCopy: { color: colors.quiet, fontSize: type.tiny, fontWeight: '700', letterSpacing: 0.8 },
});