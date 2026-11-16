import { useEffect, useRef, useState } from 'react';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bookmark,
  Book as BookIcon,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock3,
  Tv,
  MessageCircle,
  Search,
  Sparkles,
  UserRound,
  RotateCcw,
  X,
} from 'lucide-react-native';
import { BOOKS, PILLARS, type Book, type Pillar } from '@/lib/books';
import { findNextBook } from '@/lib/bookQueue';
import { getSwipeAction, type BookAction } from '@/lib/bookGesture';
import { linkCurrentUserEmail, resendCurrentUserEmailChange, signInWithEmail } from '@/lib/auth';
import AccountSheet from '@/components/AccountSheet';
import BookListCard from '@/components/BookListCard';
import ShelfSwipeCard from '@/components/ShelfSwipeCard';
import Pressable from '@/components/MotionPressable';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { deleteUserSwipe, getOrCreateAnonymousUser, loadUserSwipes, saveUserSwipe } from '@/lib/swipes';
import { getBookOnRamp } from '@/lib/onramp';
import QuipWorkspace from '@/components/QuipWorkspace';
import { generateTrendReply } from '@/lib/trendInterceptor';
import { EMPTY_CHART_DATA, loadCatalog, loadChartData, loadPillars, type ChartData } from '@/lib/catalog';
import { colors, pageLayout, radii, spacing, type } from '@/constants/theme';

type Screen = 'discover' | 'tbr' | 'read' | 'snoozed';
type Section = 'home' | 'book' | 'quip';
type Action = BookAction;
type SyncStatus = 'local' | 'loading' | 'connected' | 'error';

function actionFeedback(action: Action) {
  if (Platform.OS === 'web') return;
  const style = action === 'next' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium;
  void Haptics.impactAsync(style).catch((error: unknown) => {
    console.warn('Haptic feedback unavailable:', error);
  });
}

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
  count,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon: typeof BookOpen;
  count?: number;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={count === undefined ? label : `${label}, ${count} ${count === 1 ? 'book' : 'books'}`}
      accessibilityState={{ selected: active }}
      aria-selected={active}
      onPress={onPress}
      style={styles.bottomTab}
    >
      <View>
        <Icon color={active ? colors.brandDeep : colors.muted} size={22} strokeWidth={active ? 2.2 : 1.8} />
        {count !== undefined && (
          <View style={[styles.tabBadge, active && styles.tabBadgeActive]}>
            <Text style={[styles.tabBadgeText, active && styles.tabBadgeTextActive]}>{count}</Text>
          </View>
        )}
      </View>
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

function ShelfBookSeparator() {
  return <View style={{ height: spacing.sm }} />;
}

export default function DiscoverScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 820;
  const [section, setSection] = useState<Section>('book');
  const [screen, setScreen] = useState<Screen>('discover');
  const [tbrIds, setTbrIds] = useState<string[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [quipBookIds, setQuipBookIds] = useState<string[]>([]);
  const [quipSelectedBookId, setQuipSelectedBookId] = useState<string | null>(null);
  const [returnedBook, setReturnedBook] = useState<{ bookId: string; shelf: 'tbr' | 'read'; quipEnabled: boolean } | null>(null);
  const [books, setBooks] = useState<Book[]>(BOOKS);
  const [pillars, setPillars] = useState(PILLARS);
  const [chartData, setChartData] = useState<ChartData>(EMPTY_CHART_DATA);
  const [chartLoadError, setChartLoadError] = useState(false);
  const [frozenUntil, setFrozenUntil] = useState<Record<string, number>>({});
  const [selectedPillar, setSelectedPillar] = useState<Pillar | null>(null);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [onRampText, setOnRampText] = useState('');
  const [onRampError, setOnRampError] = useState('');
  const [isOnRampLoading, setIsOnRampLoading] = useState(false);
  const [isOnRampVisible, setIsOnRampVisible] = useState(false);
  const [failedCoverUri, setFailedCoverUri] = useState<string | null>(null);
  const [adaptationsExpanded, setAdaptationsExpanded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshRequested = useRef(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [isAccountSheetVisible, setIsAccountSheetVisible] = useState(false);
  const [authRetryCount, setAuthRetryCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(isSupabaseConfigured ? 'loading' : 'local');
  const [syncMessage, setSyncMessage] = useState('');
  const [isActionSaving, setIsSaving] = useState(false);
  const [pendingBookAction, setPendingBookAction] = useState<'read' | 'freeze' | null>(null);
  const isSaving = isActionSaving || isRefreshing;
  const [isTransitioning, setIsTransitioning] = useState(false);
  const reducedMotion = useReducedMotion();
  const dragX = useSharedValue(0);
  const indicatorsVisible = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const contentOpacity = useSharedValue(1);
  const bookOpacity = useSharedValue(1);
  const transitioningRef = useRef(false);
  const mountedRef = useRef(true);
  const bookCardRef = useRef<View>(null);
  const webCardHeldRef = useRef(false);
  const discoveryScrollRef = useRef<ScrollView>(null);
  const discoveryViewportRef = useRef<View>(null);
  const onRampRef = useRef<View>(null);
  const discoveryScrollY = useRef(0);
  const shouldScrollToOnRamp = useRef(false);
  const actionRef = useRef<(action: Action) => Promise<void>>(async () => undefined);
  const selectedBookIdRef = useRef(selectedBookId);
  selectedBookIdRef.current = selectedBookId;
  const onRampRequestId = useRef(0);
  const onRampController = useRef<AbortController | null>(null);
  const bookCardStyle = useAnimatedStyle(() => ({
    opacity: bookOpacity.get(),
    transform: [
      { translateX: dragX.get() },
      { rotate: `${reducedMotion ? 0 : interpolate(dragX.get(), [-300, 0, 300], [-8, 0, 8], Extrapolation.CLAMP)}deg` },
    ],
  }));
  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: indicatorsVisible.get(),
  }));
  const contentStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.get() }));

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
  const tagline = book?.tagline || (book?.pillar === 'charts' ? 'Your next read could start here.' : undefined);
  const coverUri = book?.coverUrl ?? (book?.isbn ? `https://covers.openlibrary.org/b/isbn/${book.isbn}-L.jpg` : null);
  const nextBook = book ? findNextBook(categoryBooks, book.id) : undefined;
  const nextCoverUri = nextBook?.coverUrl ?? (nextBook?.isbn ? `https://covers.openlibrary.org/b/isbn/${nextBook.isbn}-L.jpg` : null);
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
    if (section !== 'book' || screen !== 'discover' || !nextCoverUri) return;
    void Image.prefetch(nextCoverUri, { cachePolicy: 'memory-disk' })
      .then((loaded) => {
        if (!loaded) console.warn('Could not preload the next book cover.');
      })
      .catch((error: unknown) => {
        console.warn('Could not preload the next book cover:', error);
      });
  }, [nextCoverUri, screen, section]);

  useEffect(() => {
    if (section !== 'book' || screen !== 'discover' || selectedPillar !== null || syncStatus === 'loading') return;
    const candidates = books.filter((item) =>
      item.pillar === 'screen' &&
      item.isActive !== false &&
      !tbrIds.includes(item.id) &&
      !readIds.includes(item.id) &&
      (!frozenUntil[item.id] || frozenUntil[item.id] <= Date.now()),
    );
    setSelectedPillar('screen');
    setSelectedBookId(candidates.length ? candidates[Math.floor(Math.random() * candidates.length)].id : null);
  }, [section, screen, selectedPillar, syncStatus, books, tbrIds, readIds, frozenUntil]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    if (!refreshRequested.current) setSyncStatus('loading');
    setSyncMessage('');

    const restoreShelf = async () => {
      try {
        const activeUser = await getOrCreateAnonymousUser();
        if (!activeUser) throw new Error('Supabase is not configured.');
        const [swipes, catalog, remotePillars, remoteChartData] = await Promise.all([
          loadUserSwipes(activeUser.id),
          loadCatalog(),
          loadPillars(),
          loadChartData()
            .then((data) => ({ data, failed: false }))
            .catch(() => ({ data: EMPTY_CHART_DATA, failed: true })),
        ]);
        if (!active) return;
        setBooks(catalog);
        if (!remoteChartData.failed) setChartData(remoteChartData.data);
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
        setSelectedBookId((current) => {
          if (!current) return current;
          const isAvailable = (item: Book) => item.isActive !== false &&
            !restoredTbr.includes(item.id) && !restoredRead.includes(item.id) && !restoredFrozen[item.id];
          const selected = catalog.find((item) => item.id === current);
          if (selected && isAvailable(selected)) return current;
          const pillar = selected?.pillar ?? books.find((item) => item.id === current)?.pillar;
          return catalog.find((item) => item.pillar === pillar && isAvailable(item))?.id ?? null;
        });

        setUserId(activeUser.id);
        setAccountEmail(activeUser.email ?? null);
        setPendingEmail(activeUser.new_email ?? null);
        setIsAnonymous(activeUser.is_anonymous !== false || !activeUser.email_confirmed_at);
        setTbrIds(restoredTbr);
        setReadIds(restoredRead);
        setQuipBookIds(restoredQuip);
        setReturnedBook((previous) => previous && swipes.some((swipe) => swipe.book_id === previous.bookId) ? null : previous);
        setFrozenUntil(restoredFrozen);
        setSyncMessage(remoteChartData.failed ? 'Chart rankings could not refresh. Pull down to try again.' : '');
        setSyncStatus(remoteChartData.failed ? 'error' : 'connected');
      } catch (error) {
        if (!active) return;
        setSyncMessage(error instanceof Error ? error.message : 'Could not create or restore the guest session.');
        setSyncStatus('error');
      } finally {
        if (active) {
          refreshRequested.current = false;
          setIsRefreshing(false);
        }
      }
    };

    void restoreShelf();
    return () => { active = false; };
  }, [authRetryCount]);

  const handleRefresh = () => {
    if (refreshRequested.current || isSaving || transitioningRef.current || syncStatus === 'loading') return;
    if (!isSupabaseConfigured) {
      setFrozenUntil((items) => ({ ...items }));
      return;
    }
    refreshRequested.current = true;
    setIsRefreshing(true);
    setAuthRetryCount((count) => count + 1);
  };

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
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      onRampController.current?.abort();
    };
  }, []);

  useEffect(() => {
    dragX.set(0);
    indicatorsVisible.set(0);
    setFailedCoverUri(null);
    setAdaptationsExpanded(false);
    shouldScrollToOnRamp.current = false;
    onRampRequestId.current += 1;
    onRampController.current?.abort();
    onRampController.current = null;
    setOnRampText('');
    setOnRampError('');
    setIsOnRampLoading(false);
    setIsOnRampVisible(false);
    contentOpacity.set(reducedMotion ? 1 : 0);
    bookOpacity.set(reducedMotion ? 1 : 0);
    if (!reducedMotion) {
      contentOpacity.set(withTiming(1, { duration: 160 }));
      bookOpacity.set(withTiming(1, { duration: 160 }));
    }
  }, [book?.id, book?.title, book?.author, book?.year, book?.note, bookOpacity, contentOpacity, dragX, indicatorsVisible, reducedMotion]);

  useEffect(() => {
    if (!onRampText || !isOnRampVisible || !shouldScrollToOnRamp.current) return;
    const frame = requestAnimationFrame(() => {
      onRampRef.current?.measureInWindow((_x, y) => {
        discoveryViewportRef.current?.measureInWindow((_scrollX, scrollY) => {
          if (!shouldScrollToOnRamp.current) return;
          shouldScrollToOnRamp.current = false;
          discoveryScrollRef.current?.scrollTo({ y: Math.max(0, discoveryScrollY.current + y - scrollY - 12), animated: true });
        });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [onRampText, isOnRampVisible]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !(bookCardRef.current instanceof HTMLElement)) return;
    const card = bookCardRef.current;
    const preventScrollWhileDragging = (event: TouchEvent) => {
      if (isDragging.get()) event.preventDefault();
    };
    const resetHeld = () => { webCardHeldRef.current = false; };
    const preventHeldClick = (event: MouseEvent) => {
      if (webCardHeldRef.current && event.detail > 0) {
        event.preventDefault();
        event.stopPropagation();
        webCardHeldRef.current = false;
      }
    };
    card.addEventListener('touchmove', preventScrollWhileDragging, { passive: false });
    card.addEventListener('pointerdown', resetHeld, true);
    card.addEventListener('click', preventHeldClick, true);
    return () => {
      card.removeEventListener('touchmove', preventScrollWhileDragging);
      card.removeEventListener('pointerdown', resetHeld, true);
      card.removeEventListener('click', preventHeldClick, true);
    };
  }, [book?.id, isDragging, screen, section]);

  const handleGetOnRamp = async () => {
    if (!book || onRampController.current || syncStatus === 'loading' || isSaving || isTransitioning) return;
    const requestId = ++onRampRequestId.current;
    const controller = new AbortController();
    onRampController.current = controller;
    setIsOnRampLoading(true);
    setOnRampError('');
    setOnRampText('');
    try {
      const result = await getBookOnRamp(book, controller.signal);
      if (mountedRef.current && requestId === onRampRequestId.current) {
        if (result === null) {
          setOnRampError('A 30-second read is not available for this book yet.');
          return;
        }
        shouldScrollToOnRamp.current = true;
        setOnRampText(result);
        setIsOnRampVisible(true);
      }
    } catch (error) {
      if (mountedRef.current && requestId === onRampRequestId.current) {
        setOnRampError(error instanceof Error ? error.message : 'Could not load the 30-second read.');
      }
    } finally {
      if (onRampController.current === controller) onRampController.current = null;
      if (mountedRef.current && requestId === onRampRequestId.current) setIsOnRampLoading(false);
    }
  };

  const handleOnRampToggle = () => {
    if (!onRampText) {
      void handleGetOnRamp();
      return;
    }
    if (!isOnRampVisible) shouldScrollToOnRamp.current = true;
    setIsOnRampVisible((visible) => !visible);
  };

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      if (section !== 'book' || screen !== 'discover' || !book || syncStatus === 'loading' || isSaving || transitioningRef.current || isAccountSheetVisible) return;
      const actionByKey: Record<string, Action> = {
        ArrowRight: 'tbr',
        ArrowUp: 'read',
        ArrowLeft: 'next',
      };
      const action = actionByKey[event.key];
      if (action && (action !== 'next' || nextBook)) {
        event.preventDefault();
        actionRef.current(action);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [section, screen, book, syncStatus, isSaving, isAccountSheetVisible, nextBook]);

  const handleAction = async (action: Action) => {
    if (!book || section !== 'book' || screen !== 'discover' || syncStatus === 'loading' || isSaving || refreshRequested.current || transitioningRef.current) return;
    const selectedBook = book;
    if (action === 'next' && !nextBook) return;
    actionFeedback(action);
    if (action !== 'next' && isSupabaseConfigured && !userId) {
      setSyncMessage('Your shelf is not connected. Reconnect before sorting this book.');
      setSyncStatus('error');
      return;
    }
    if (action !== 'next' && userId && isSupabaseConfigured) {
      setIsSaving(true);
      if (action === 'read' || action === 'freeze') setPendingBookAction(action);
      try {
        const state = action === 'tbr' ? 'tbr' : action === 'read' ? 'read' : 'frozen';
        const freezeUntil = action === 'freeze'
          ? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
          : null;
        await saveUserSwipe(userId, selectedBook.id, state, freezeUntil);
        setSyncMessage('');
        setSyncStatus('connected');
      } catch {
        setSyncMessage('Could not save this action. The book remains in discovery; try again.');
        setSyncStatus('error');
        setIsSaving(false);
        setPendingBookAction(null);
        return;
      }
      setIsSaving(false);
      setPendingBookAction(null);
    }
    transitioningRef.current = true;
    setIsTransitioning(true);
    if (!mountedRef.current) return;
    if (selectedBookIdRef.current === selectedBook.id) {
      bookOpacity.set(reducedMotion ? 1 : 0);
      contentOpacity.set(reducedMotion ? 1 : 0);
      setSelectedBookId(nextBook?.id ?? null);
    }
    if (action !== 'next') setReturnedBook((previous) => previous?.bookId === selectedBook.id ? null : previous);
    if (action === 'tbr') setTbrIds((ids) => [...ids, selectedBook.id]);
    if (action === 'read') setReadIds((ids) => [...ids, selectedBook.id]);
    if (action === 'freeze') {
      setFrozenUntil((items) => ({ ...items, [selectedBook.id]: Date.now() + 90 * 24 * 60 * 60 * 1000 }));
    }
    transitioningRef.current = false;
    setIsTransitioning(false);
  };
  actionRef.current = handleAction;
  const finishSwipe = (action: Action, bookId: string | undefined) => {
    if (!bookId || selectedBookIdRef.current !== bookId) {
      dragX.set(0);
      indicatorsVisible.set(0);
      return;
    }
    void actionRef.current(action).finally(() => {
      dragX.set(0);
      indicatorsVisible.set(0);
    });
  };

  const resetCardPosition = (velocityX = 0) => {
    'worklet';
    dragX.set(reducedMotion ? 0 : withSpring(0, { duration: 400, dampingRatio: 0.8, velocity: velocityX }));
  };
  const canGoNext = Boolean(nextBook);
  const swipeBookId = book?.id;
  const isWeb = Platform.OS === 'web';
  const markCardHeld = () => { webCardHeldRef.current = true; };
  const markBookAsRead = () => { void actionRef.current('read'); };
  const cardGesture = Gesture.Pan()
    .enabled(Boolean(book) && syncStatus !== 'loading' && !isSaving && !isRefreshing && !isTransitioning)
    .activeOffsetX([-12, 12])
    .failOffsetY([-12, 12])
    .onTouchesDown(() => {
      indicatorsVisible.set(withTiming(1, { duration: reducedMotion ? 0 : 140 }));
    })
    .onStart(() => {
      isDragging.set(true);
      if (isWeb) scheduleOnRN(markCardHeld);
    })
    .onUpdate((event) => {
      dragX.set(event.translationX);
    })
    .onEnd((event, success) => {
      if (!success) return;
      const action = getSwipeAction(event.translationX, event.translationY, event.velocityX, event.velocityY, canGoNext);
      if (!action) {
        indicatorsVisible.set(withTiming(0, { duration: reducedMotion ? 0 : 180 }));
        resetCardPosition(event.velocityX);
        return;
      }

      if (reducedMotion) {
        dragX.set(0);
        scheduleOnRN(finishSwipe, action, swipeBookId);
        return;
      }
      const destinationX = Math.sign(event.translationX) * 460;
      dragX.set(withTiming(destinationX, { duration: 150 }, (finished) => {
        if (finished) scheduleOnRN(finishSwipe, action, swipeBookId);
      }));
    })
    .onFinalize((_event, success) => {
      isDragging.set(false);
      if (!success) {
        indicatorsVisible.set(withTiming(0, { duration: reducedMotion ? 0 : 180 }));
        resetCardPosition();
      }
    });
  const readDoubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((_event, success) => {
      if (success) scheduleOnRN(markBookAsRead);
    });
  const bookGesture = Gesture.Simultaneous(cardGesture, readDoubleTapGesture);

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
    const otherAvailableBooks = availableBooks.filter((availableBook) => availableBook.id !== selectedBookId);
    const booksToChooseFrom = otherAvailableBooks.length > 0 ? otherAvailableBooks : availableBooks;
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
    if (!shelfBook || (!wasInTbr && !wasRead) || isSaving || syncStatus === 'loading') return;
    const undo = { bookId, shelf: wasRead ? 'read' as const : 'tbr' as const, quipEnabled: wasQuipEnabled };
    const returnToDiscovery = shelfBook.isActive !== false;
    if (isSupabaseConfigured && !userId) {
      setSyncMessage('Your shelf is not connected. Reconnect before returning this book to discovery.');
      setSyncStatus('error');
      return;
    }

    setTbrIds((ids) => ids.filter((id) => id !== bookId));
    setReturnedBook(null);
    setReadIds((ids) => ids.filter((id) => id !== bookId));
    setQuipBookIds((ids) => ids.filter((id) => id !== bookId));
    setSelectedPillar(returnToDiscovery ? shelfBook.pillar : null);
    setSelectedBookId(returnToDiscovery ? shelfBook.id : null);
    setSearchQuery('');
    setSection('book');
    setScreen(returnToDiscovery ? 'discover' : sourceScreen);

    if (!userId || !isSupabaseConfigured) {
      setReturnedBook(undo);
      if (!returnToDiscovery) setSyncMessage('Archived book removed from your shelf; it remains out of discovery.');
      return;
    }
    setIsSaving(true);
    void deleteUserSwipe(userId, bookId)
      .then(() => {
        setReturnedBook(undo);
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

  const handleUndoReturn = async () => {
    if (!returnedBook || isSaving || syncStatus === 'loading') return;
    const restore = returnedBook;
    setIsSaving(true);
    try {
      if (isSupabaseConfigured) {
        if (!userId) throw new Error('Reconnect before restoring your book.');
        await saveUserSwipe(userId, restore.bookId, restore.shelf, null, restore.quipEnabled);
      }
      if (restore.shelf === 'read') {
        setReadIds((ids) => ids.includes(restore.bookId) ? ids : [...ids, restore.bookId]);
        if (restore.quipEnabled) setQuipBookIds((ids) => ids.includes(restore.bookId) ? ids : [...ids, restore.bookId]);
      } else setTbrIds((ids) => ids.includes(restore.bookId) ? ids : [...ids, restore.bookId]);
      setReturnedBook(null);
      setSelectedBookId(null);
      setSection('book');
      setScreen(restore.shelf);
      setSyncMessage('');
      setSyncStatus(isSupabaseConfigured ? 'connected' : 'local');
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Could not restore the book. Try Undo again.');
      setSyncStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const openShelfQuip = (bookId: string) => {
    if (isSaving || syncStatus === 'loading') return;
    setQuipSelectedBookId(bookId);
    setSection('quip');
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
    setQuipSelectedBookId(null);
    setReturnedBook(null);
    setAccountEmail(null);
    setPendingEmail(null);
    setIsAnonymous(true);
    setTbrIds([]);
    setReadIds([]);
    setQuipBookIds([]);
    setFrozenUntil({});
    setSelectedBookId(null);
    setSelectedPillar(null);
    setSection('book');
    setScreen('discover');
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
    setQuipSelectedBookId(null);
    setReturnedBook(null);
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
    setSection('book');
    setIsAccountSheetVisible(false);
    setAuthRetryCount((count) => count + 1);
  };

  const readBooks = books.filter((item) => readIds.includes(item.id));
  const quipBooks = books.filter((item) => readIds.includes(item.id) || tbrIds.includes(item.id));
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
      <View style={styles.headingCopy}>
        <View style={styles.headingEyebrowRow}>
          <Text style={styles.eyebrow}>{section === 'home' ? 'YOUR LIBRARY' : section === 'book' ? 'BOOK' : 'QUIP'}</Text>
        </View>
        <Text style={styles.pageTitle}>{section === 'home' ? 'Your Library' : section === 'book' ? screenTitle : 'Your Quip library'}</Text>
      </View>
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
      <Text style={styles.footerCopy}>BOOQUIP</Text>
    </View>
  ) : null;
  const shelfListHeader = (
    <View>
      {pageHeading}
      {syncStatus === 'error' ? syncStatusIndicator : null}
      <View style={styles.pillarHeader}>
        <Text style={styles.sectionLabel}>{screen === 'tbr' ? 'SAVED FOR LATER' : screen === 'read' ? 'MARKED AS READ' : 'SNOOZED FOR LATER'}</Text>
        <Text style={styles.stackCount}>{String(shelfBooks.length).padStart(2, '0')} BOOKS</Text>
      </View>
    </View>
  );
  const renderShelfBookContent = (item: Book) => (
    <BookListCard book={item}>
      {(screen === 'read' || screen === 'tbr') && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open Quips for ${item.title}`}
          disabled={isSaving || syncStatus === 'loading'}
          onPress={() => openShelfQuip(item.id)}
          style={({ pressed }) => [
            styles.quipToggle,
            styles.finishedBookAction,
            styles.quipToggleEnabled,
            (isSaving || syncStatus === 'loading') && styles.actionDisabled,
            pressed && styles.actionPressed,
          ]}
        >
          <MessageCircle color={colors.brand} size={14} />
          <Text style={[styles.quipToggleLabel, styles.quipToggleLabelEnabled]}>
            QUIP
          </Text>
        </Pressable>
      )}
      {screen === 'snoozed' && (
        <>
          {item.isActive === false ? (
            <Text style={styles.archivedLabel}>ARCHIVED</Text>
          ) : (
            <>
              <Text style={[styles.shelfReturn, styles.shelfReturnLabel]}>
                {`RETURNS ${new Date(frozenUntil[item.id]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase()}`}
              </Text>
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
            </>
          )}
        </>
      )}
      {screen !== 'snoozed' && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={item.isActive === false ? `Remove archived ${item.title} from this shelf` : `Remove ${item.title} from this shelf and return it to discovery`}
          disabled={isSaving || syncStatus === 'loading'}
          onPress={() => handleRemoveFromShelf(item.id)}
          style={({ pressed }) => [styles.returnBookButton, screen === 'read' && styles.finishedBookAction, isSaving && styles.actionDisabled, pressed && styles.actionPressed]}
        >
          <RotateCcw color={colors.brand} size={14} />
          <Text style={styles.returnBookButtonText}>{item.isActive === false ? 'REMOVE' : 'RETURN'}</Text>
        </Pressable>
      )}
    </BookListCard>
  );
  const renderShelfBook = ({ item }: ListRenderItemInfo<Book>) => screen === 'read' || screen === 'tbr' ? (
    <ShelfSwipeCard bookId={item.id} disabled={isSaving || syncStatus === 'loading'}
      onQuip={() => openShelfQuip(item.id)} onReturn={() => handleRemoveFromShelf(item.id)}>
      {renderShelfBookContent(item)}
    </ShelfSwipeCard>
  ) : renderShelfBookContent(item);
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
          <View style={[styles.mobileHeader, width < 360 && styles.mobileHeaderNarrow]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Open your library" onPress={() => setSection('home')} style={styles.brandLockup}>
              <View style={[styles.brandMark, styles.mobileBrandMark]}><BookIcon color={colors.brandHighlight} size={20} strokeWidth={2} /></View>
              <Text style={[styles.brandName, styles.mobileBrandName, width < 360 && styles.mobileBrandNameNarrow]}>booquip</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isAnonymous ? 'Guest, Link shelf' : 'Account settings'}
              accessibilityHint={syncLabel}
              accessibilityState={{ disabled: syncStatus === 'loading' }}
              disabled={syncStatus === 'loading'}
              onPress={() => setIsAccountSheetVisible(true)}
              style={[styles.accountButton, width < 360 && styles.accountButtonNarrow, syncStatus === 'loading' && styles.navItemDisabled]}
            >
              <View style={[styles.syncDot, syncStatus === 'connected' && styles.syncDotConnected, syncStatus === 'error' && styles.syncDotError]} />
              {isAnonymous ? (
                <>
                  <Text style={[styles.accountGuestText, width < 360 && styles.accountTextNarrow]}>Guest</Text>
                  <Text style={styles.accountDivider}>·</Text>
                  <Text style={[styles.accountButtonText, width < 360 && styles.accountTextNarrow]}>Link shelf</Text>
                </>
              ) : <Text style={styles.accountButtonText}>Account</Text>}
              <ChevronRight color={colors.brandMuted} size={14} />
            </Pressable>
          </View>

          {returnedBook ? (
            <View accessibilityLiveRegion="polite" style={styles.undoReturn}>
              <Text style={styles.undoReturnText}>{books.find((item) => item.id === returnedBook.bookId)?.title ?? 'Book'} returned from your shelf.</Text>
              <Pressable accessibilityRole="button" disabled={isSaving || syncStatus === 'loading'} onPress={() => void handleUndoReturn()} style={styles.returnBookButton}>
                <Text style={styles.returnBookButtonText}>UNDO</Text>
              </Pressable>
            </View>
          ) : null}
          {section === 'quip' ? (
            <QuipWorkspace
              sourceBooks={quipBooks}
              readBookIds={readIds}
              selectedBookId={quipSelectedBookId}
              onSelectBook={setQuipSelectedBookId}
              isSaving={isSaving || syncStatus === 'loading'}
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              refreshError={syncStatus === 'error' ? syncMessage : ''}
              onGenerate={generateTrendReply}
            />
          ) : section === 'book' && screen !== 'discover' ? (
            <FlashList
              style={styles.contentList}
              contentContainerStyle={styles.content}
              data={shelfBooks}
              keyExtractor={(item) => item.id}
              renderItem={renderShelfBook}
              ItemSeparatorComponent={ShelfBookSeparator}
              extraData={[screen, frozenUntil, isSaving, syncStatus]}
              ListHeaderComponent={shelfListHeader}
              ListEmptyComponent={emptyShelfState}
              ListFooterComponent={pageFooter}
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              alwaysBounceVertical
            />
          ) : (
          <View ref={discoveryViewportRef} style={styles.discoveryViewport}>
          <ScrollView
            ref={discoveryScrollRef}
            onScroll={(event) => { discoveryScrollY.current = event.nativeEvent.contentOffset.y; }}
            scrollEventThrottle={16}
            contentContainerStyle={styles.content}
            alwaysBounceVertical
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.brand} colors={[colors.brand]} />}
          >
            {pageHeading}
            {(section !== 'book' || syncStatus === 'error' || syncStatus === 'loading') && syncStatusIndicator}

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
                    <Text style={styles.hubSectionDescription}>Explore ready-made Quips from To read and Finished, or craft your own with a Finished book.</Text>
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
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Surprise me with a book from any category"
                      disabled={syncStatus === 'loading' || availableBooks.length === 0}
                      onPress={handleSurpriseMe}
                      style={({ pressed }) => [styles.searchSurprise, (syncStatus === 'loading' || availableBooks.length === 0) && styles.actionDisabled, pressed && styles.actionPressed]}
                    >
                      <Sparkles color={colors.brandDeep} size={16} />
                      <Text style={styles.searchSurpriseText}>Surprise me</Text>
                    </Pressable>
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

                <View style={[styles.categoryRow, !isWide && styles.categoryRowMobile]}>
                  {pillars.map((pillar) => {
                    const count = availableBooks.filter((availableBook) => availableBook.pillar === pillar.id).length;
                    const selected = selectedPillar === pillar.id;
                    const CategoryIcon = pillar.id === 'screen' ? Tv : pillar.id === 'charts' ? BarChart3 : BookOpen;
                    return <Pressable key={pillar.id} accessibilityRole="button" accessibilityState={{ selected }}
                      disabled={syncStatus === 'loading'} onPress={() => selectPillar(pillar.id)}
                      style={({ pressed }) => [styles.categoryButton, !isWide && styles.categoryButtonMobile, width < 360 && styles.categoryButtonNarrow, selected && styles.categoryButtonSelected, syncStatus === 'loading' && styles.actionDisabled, pressed && styles.actionPressed]}>
                      <View style={[styles.categoryIcon, { backgroundColor: `${pillar.color}15` }]}><CategoryIcon color={pillar.color} size={18} /></View>
                      <View style={styles.categoryButtonCopy}>
                        <Text style={[styles.categoryButtonTitle, selected && styles.categoryButtonTitleSelected]}>{pillar.label}</Text>
                        <Text style={[styles.categoryButtonCount, selected && styles.categoryButtonCountSelected]}>
                          {count} avail.
                        </Text>
                      </View>
                    </Pressable>;
                  })}
                </View>
                <Animated.View pointerEvents="none" style={[styles.doubleTapHintRow, indicatorStyle]}>
                  <Text numberOfLines={1} style={styles.doubleTapHintText}>Double tap if you&apos;ve read this book</Text>
                </Animated.View>

                {book ? (
                  <View style={styles.bookFeature}>
                    <View style={styles.bookGestureArea}>
                      <GestureDetector gesture={bookGesture} touchAction="pan-y">
                        <Animated.View
                          ref={bookCardRef}
                          style={[styles.bookHeader, bookCardStyle]}
                          accessible
                          accessibilityRole="adjustable"
                          accessibilityLabel={`${book.title} by ${book.author}`}
                          accessibilityHint="Double-tap to mark this book as already read. Swipe left for the next book or right to move this book to your reading shelf."
                          accessibilityActions={[
                            ...(canGoNext ? [{ name: 'next', label: 'Next book' }] : []),
                            { name: 'tbr', label: 'Move to shelf' },
                            { name: 'read', label: 'Already read' },
                          ]}
                          onAccessibilityAction={(event) => {
                            const action = event.nativeEvent.actionName;
                            if (action === 'next' || action === 'tbr' || action === 'read') void handleAction(action);
                          }}
                        >
                          <View style={styles.coverRow}>
                            <View style={styles.coverShadow}>
                              <View style={[styles.coverFrame, { backgroundColor: book.color }]}>
                                <View style={styles.coverFallback}>
                                  <BookOpen color={colors.white} size={24} strokeWidth={1.5} />
                                  <Text style={styles.coverFallbackTitle}>{book.title}</Text>
                                  <Text style={styles.coverFallbackAuthor}>{book.author}</Text>
                                </View>
                                {coverUri && failedCoverUri !== coverUri && (
                                  <Image
                                    accessibilityLabel={`Cover of ${book.title}`}
                                    cachePolicy="memory-disk"
                                    recyclingKey={coverUri}
                                    onError={() => setFailedCoverUri(coverUri)}
                                    source={{ uri: coverUri }}
                                    style={styles.coverImage}
                                    contentFit="cover"
                                  />
                                )}
                              </View>
                            </View>
                            <Animated.View
                              pointerEvents="none"
                              accessible={false}
                              accessibilityElementsHidden
                              importantForAccessibility="no-hide-descendants"
                              aria-hidden
                              style={[styles.indicatorOverlay, indicatorStyle]}
                            >
                              <View style={[styles.directionIndicator, !canGoNext && styles.actionDisabled]}>
                                <ArrowLeft color={colors.brandMuted} size={16} />
                                <Text style={styles.indicatorText}>Next book</Text>
                              </View>
                              <View style={styles.directionIndicator}>
                                <ArrowRight color={colors.brandMuted} size={16} />
                                <Text style={styles.indicatorText}>Move to shelf</Text>
                              </View>
                            </Animated.View>
                          </View>
                          <View style={styles.bookHeaderText}>
                            <Text style={styles.bookTitle}>{book.title}</Text>
                            <Text style={styles.bookAuthor}>By {book.author}</Text>
                          </View>
                        </Animated.View>
                      </GestureDetector>
                    </View>
                    <View style={styles.bookInfo}>
                      <Animated.View style={contentStyle}>
                          {tagline ? <Text style={styles.bookTagline}>“{tagline}”</Text> : null}
                          {book.keywords?.length ? (
                            <View style={styles.keywordRow}>
                              {book.keywords.map((keyword) => <Text key={keyword} style={styles.keyword}>#{keyword.replace(/\s+/g, '')}</Text>)}
                            </View>
                          ) : <Text style={styles.keywordPending}>Keywords are not available yet.</Text>}
                          {onRampText && isOnRampVisible ? (
                            <View ref={onRampRef} style={styles.onRampSection}>
                              <Text style={styles.noteLabel}>30-SECOND READ · AI-GENERATED FROM THE SUMMARY</Text>
                              <Text accessibilityLiveRegion="polite" style={styles.onRampText}>{onRampText}</Text>
                            </View>
                          ) : null}
                          {onRampError ? <Text accessibilityRole="alert" style={styles.onRampError}>{onRampError}</Text> : null}
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
                                </View>
                              ))}
                            </View>
                          )}
                          {book.pillar === 'screen' ? <View style={styles.adaptationSection}>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityState={{ expanded: adaptationsExpanded }}
                              accessibilityLabel={adaptationsExpanded ? 'Hide screen adaptations' : 'Show screen adaptations'}
                              onPress={() => setAdaptationsExpanded((expanded) => !expanded)}
                              style={styles.adaptationHeader}
                            >
                              <Tv color={colors.secondary} size={14} />
                              <Text style={styles.noteLabel}>{book.adaptations?.[0]?.format.toUpperCase() ?? 'ON SCREEN'}</Text>
                              <Text style={styles.adaptationSummary} numberOfLines={1}>
                                {book.adaptations?.length
                                  ? `${book.adaptations[0].title}${book.adaptations[0].releaseYear ? ` (${book.adaptations[0].releaseYear})` : ''}`
                                  : 'No details yet'}
                              </Text>
                              {book.adaptations?.[0]?.tmdbId ? <Text style={styles.tmdbBadge}>TMDb</Text> : null}
                              {adaptationsExpanded ? <ChevronUp color={colors.brandDeep} size={16} /> : <ChevronDown color={colors.brandDeep} size={16} />}
                            </Pressable>
                            {adaptationsExpanded && (book.adaptations?.length ? book.adaptations.map((adaptation) => (
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
                            ))}
                            {adaptationsExpanded && book.adaptations?.some((adaptation) => adaptation.tmdbId) ? (
                              <Text style={styles.tmdbAttribution}>This product uses the TMDB API but is not endorsed or certified by TMDB.</Text>
                            ) : null}
                          </View> : null}
                      </Animated.View>
                          <View style={styles.bookActionButtons}>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={pendingBookAction === 'freeze' ? 'Waiting to snooze this book' : 'Snooze'}
                              accessibilityState={{ busy: pendingBookAction === 'freeze', disabled: syncStatus === 'loading' || isSaving || isTransitioning }}
                              disabled={syncStatus === 'loading' || isSaving || isTransitioning}
                              onPress={() => void handleAction('freeze')}
                              style={({ pressed }) => [styles.snoozeActionButton, (syncStatus === 'loading' || isSaving || isTransitioning) && styles.actionDisabled, pressed && styles.actionPressed]}
                            >
                              {pendingBookAction === 'freeze'
                                ? <ActivityIndicator size="small" color={colors.brandMuted} />
                                : <Clock3 color={colors.brandMuted} size={16} />}
                              <Text style={styles.snoozeActionButtonText}>{pendingBookAction === 'freeze' ? 'Waiting…' : 'Snooze'}</Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={isOnRampLoading
                                ? 'Loading a 30-second read'
                                : onRampText
                                  ? isOnRampVisible ? 'Hide 30-second read' : 'Show 30-second read'
                                  : 'Load a 30-second read'}
                              accessibilityState={{ expanded: isOnRampVisible, busy: isOnRampLoading, disabled: isOnRampLoading || syncStatus === 'loading' || isSaving || isTransitioning }}
                              aria-busy={isOnRampLoading}
                              disabled={isOnRampLoading || syncStatus === 'loading' || isSaving || isTransitioning}
                              onPress={handleOnRampToggle}
                              style={({ pressed }) => [styles.onRampButton, (isOnRampLoading || syncStatus === 'loading' || isSaving || isTransitioning) && styles.actionDisabled, pressed && styles.actionPressed]}
                            >
                              {isOnRampLoading
                                ? <ActivityIndicator size="small" color={colors.brandContrast} />
                                : <Sparkles color={colors.brandContrast} size={14} />}
                              <Text style={styles.onRampButtonText}>{isOnRampLoading ? 'Loading…' : '30s read'}</Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={pendingBookAction === 'read' ? 'Waiting to mark this book as read' : 'Already read'}
                              accessibilityState={{ busy: pendingBookAction === 'read', disabled: syncStatus === 'loading' || isSaving || isTransitioning }}
                              disabled={syncStatus === 'loading' || isSaving || isTransitioning}
                              onPress={() => void handleAction('read')}
                              style={({ pressed }) => [styles.readActionButton, (syncStatus === 'loading' || isSaving || isTransitioning) && styles.actionDisabled, pressed && styles.actionPressed]}
                            >
                              {pendingBookAction === 'read'
                                ? <ActivityIndicator size="small" color={colors.brand} />
                                : <Check color={colors.brand} size={16} />}
                              <Text style={styles.readActionButtonText}>{pendingBookAction === 'read' ? 'Waiting…' : 'Already read'}</Text>
                            </Pressable>
                          </View>
                    </View>
                  </View>
                ) : selectedPillar ? (
                  <View style={styles.emptyState}>
                    <View style={styles.emptyIcon}><BookOpen color={colors.brandMuted} size={24} /></View>
                    <Text style={styles.emptyTitle}>No available books in {currentPillar?.label}.</Text>
                    <Text style={styles.emptyCopy}>
                      {selectedPillar === 'charts' && chartLoadError
                        ? 'Chart signals could not be refreshed.'
                        : 'Choose another category to find an available book.'}
                    </Text>
                  </View>
                ) : null}

              </>
            ) : null}

            {isWide && (
              <View style={styles.pageFooter}>
                <Text style={styles.footerCopy}>A GOOD BOOK IS A CHANGE OF PERSPECTIVE.</Text>
                <Text style={styles.footerCopy}>BOOQUIP</Text>
              </View>
            )}
          </ScrollView>
          </View>
          )}
          {!isWide && (
            <View style={styles.bottomBar} accessibilityRole="tablist">
              <BottomTab
                label="Book"
                active={section === 'book' && screen === 'discover'}
                onPress={() => { setSection('book'); setScreen('discover'); }}
                icon={BookIcon}
              />
              <BottomTab label="Quip" active={section === 'quip'} onPress={() => setSection('quip')} icon={MessageCircle} />
              <BottomTab label="To read" count={tbrIds.length} active={section === 'book' && screen === 'tbr'} onPress={() => { setSection('book'); setScreen('tbr'); }} icon={Bookmark} />
              <BottomTab label="Finished" count={readIds.length} active={section === 'book' && screen === 'read'} onPress={() => { setSection('book'); setScreen('read'); }} icon={Check} />
              <BottomTab label="Snoozed" count={frozenBooks.length} active={section === 'book' && screen === 'snoozed'} onPress={() => { setSection('book'); setScreen('snoozed'); }} icon={Clock3} />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  undoReturn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, backgroundColor: colors.brandPale },
  undoReturnText: { flex: 1, color: colors.body, fontSize: type.footnote },
  safeArea: { flex: 1, backgroundColor: colors.page },
  appShell: { flex: 1, flexDirection: 'row', backgroundColor: colors.page },
  sidebar: { width: 238, backgroundColor: colors.forest, paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, paddingBottom: 22 },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.brandHighlight, alignItems: 'center', justifyContent: 'center' },
  brandName: { color: colors.surfaceWarm, fontSize: type.brand, fontWeight: '700', letterSpacing: -0.5 },
  mobileBrandMark: { backgroundColor: colors.forest },
  mobileBrandName: { color: colors.inkStrong },
  mobileBrandNameNarrow: { fontSize: 18 },
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
  discoveryViewport: { flex: 1, minHeight: 0 },
  mobileHeader: { minHeight: 76, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, backgroundColor: colors.page },
  mobileHeaderNarrow: { paddingHorizontal: spacing.md },
  accountButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, borderWidth: 1, borderColor: '#cbded5', borderRadius: 22, backgroundColor: colors.surfaceWarm, shadowColor: colors.shadow, shadowOpacity: 0.06, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  accountGuestText: { color: colors.inkStrong, fontSize: type.bodySmall, fontWeight: '600' },
  accountDivider: { color: colors.brandMuted, fontSize: type.bodySmall },
  accountButtonText: { color: colors.brandDeep, fontSize: type.bodySmall, fontWeight: '600' },
  accountButtonNarrow: { gap: 3, paddingHorizontal: 6 },
  accountTextNarrow: { fontSize: type.caption },
  bottomBar: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: colors.borderStrong, backgroundColor: colors.surfaceWarm },
  bottomTab: { flex: 1, minWidth: 0, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: spacing.xxs, borderRadius: 15 },
  bottomTabLabel: { color: colors.muted, fontSize: type.caption, fontWeight: '600' },
  bottomTabLabelActive: { color: colors.brandDeep, fontWeight: '700' },
  tabBadge: { position: 'absolute', right: -9, top: -6, minWidth: 15, height: 15, paddingHorizontal: 3, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.border },
  tabBadgeActive: { backgroundColor: colors.brand },
  tabBadgeText: { color: colors.brandDeep, fontSize: type.label, fontWeight: '700' },
  tabBadgeTextActive: { color: colors.white },
  hubSections: { maxWidth: 860, width: '100%', alignSelf: 'center', gap: 14 },
  hubSection: { minHeight: 132, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: 18, paddingVertical: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.surface, shadowColor: colors.forest, shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  hubSectionPressed: { backgroundColor: colors.surfaceMuted, transform: [{ scale: 0.99 }] },
  hubSectionIcon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.brandSoft },
  hubSectionCopy: { flex: 1, minWidth: 0 },
  hubSectionEyebrow: { color: colors.secondary, fontSize: type.caption, fontWeight: '700' },
  hubSectionTitle: { color: colors.ink, fontSize: type.sectionTitle, lineHeight: 30, fontWeight: '700', marginTop: 4 },
  hubSectionDescription: { color: colors.secondary, fontSize: type.bodyMedium, lineHeight: 19, marginTop: 5, maxWidth: 450 },
  contentList: { flex: 1 },
  content: pageLayout.content,
  pageHeading: pageLayout.heading,
  headingCopy: { minWidth: 0, width: '100%' },
  headingEyebrowRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  syncStatusRow: { minHeight: 34, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', marginTop: -10, marginBottom: 22, paddingHorizontal: 11, borderRadius: 18, backgroundColor: colors.brandPale },
  syncDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.quiet },
  syncDotConnected: { backgroundColor: colors.brand },
  syncDotError: { backgroundColor: colors.danger },
  syncStatusText: { flexShrink: 1, color: colors.brandMuted, fontSize: type.bodySmall, fontWeight: '600' },
  eyebrow: pageLayout.eyebrow,
  pageTitle: pageLayout.title,
  pillarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 },
  sectionLabel: { color: colors.secondary, fontSize: type.caption, fontWeight: '700', letterSpacing: 0.65 },
  stackCount: { color: colors.quiet, fontSize: type.label, fontWeight: '700', letterSpacing: 0.8 },
  categoryRow: { maxWidth: 860, width: '100%', alignSelf: 'center', flexDirection: 'row', gap: spacing.xs, marginBottom: 4 },
  categoryButton: { flex: 1, minWidth: 0, minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: spacing.xs, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.lg, backgroundColor: colors.surfaceWarm },
  categoryButtonMobile: { minHeight: 54, paddingHorizontal: 6 },
  categoryRowMobile: { flexWrap: 'nowrap' },
  categoryButtonNarrow: { flexDirection: 'column', gap: 4 },
  categoryButtonSelected: { borderWidth: 2, borderColor: '#abcbbd', shadowColor: colors.shadow, shadowOpacity: 0.05, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  categoryIcon: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  categoryButtonCopy: { minWidth: 0, flexShrink: 1 },
  categoryButtonTitle: { color: colors.body, fontSize: type.footnote, lineHeight: 16, fontWeight: '700' },
  categoryButtonTitleSelected: { color: colors.inkStrong },
  categoryButtonCount: { color: colors.secondary, fontSize: type.caption, fontWeight: '600', marginTop: 2 },
  categoryButtonCountSelected: { color: colors.brand },
  searchSection: { maxWidth: 860, width: '100%', alignSelf: 'center', marginBottom: 22, zIndex: 2 },
  searchInputWrap: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderWidth: 1, borderColor: colors.secondary, borderRadius: 30, backgroundColor: colors.white, paddingLeft: 15, paddingRight: 5, shadowColor: colors.shadow, shadowOpacity: 0.04, shadowRadius: 2, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  searchSurprise: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 10, borderWidth: 1, borderColor: '#4bdfa6', borderRadius: 24, backgroundColor: '#d6fbed' },
  searchSurpriseText: { color: colors.brandDeep, fontSize: type.bodySmall, fontWeight: '700' },
  searchInput: { flex: 1, minWidth: 0, height: 44, color: colors.ink, fontSize: 14 },
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
  bookChartSignals: { gap: 7, marginTop: 13 },
  bookChartSignal: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.xs, paddingVertical: 5, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 4, backgroundColor: colors.blueSoft },
  bookChartSignalCopy: { flex: 1, minWidth: 0 },
  bookChartSignalType: { color: colors.blueMuted, fontSize: type.tiny, lineHeight: 12, fontWeight: '800' },
  bookChartSignalTrend: { color: colors.brand },
  bookChartSignalMeta: { color: colors.muted, fontSize: type.tiny, lineHeight: 12, marginTop: 1 },
  bookFeature: { maxWidth: 560, width: '100%', alignSelf: 'center' },
  doubleTapHintRow: { height: 16, alignItems: 'center', justifyContent: 'center' },
  doubleTapHintText: { color: colors.brandMuted, fontSize: type.caption, fontWeight: '700' },
  bookGestureArea: { position: 'relative' },
  bookHeader: { width: '100%', alignSelf: 'center', alignItems: 'center', paddingTop: spacing.md, paddingBottom: spacing.xs },
  bookHeaderText: { alignItems: 'center', width: '75%', maxWidth: 360 },
  coverRow: { width: '100%', alignItems: 'center' },
  coverShadow: { width: '60%', maxWidth: 240, shadowColor: colors.shadow, shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  coverFrame: { width: '100%', aspectRatio: 2 / 3, position: 'relative', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderRadius: radii.md },
  coverFallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, gap: 6 },
  coverFallbackTitle: { color: colors.white, fontSize: type.footnote, fontWeight: '700', textAlign: 'center', lineHeight: 16 },
  coverFallbackAuthor: { color: colors.white, fontSize: type.label, textAlign: 'center' },
  coverImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  bookInfo: { minWidth: 0, paddingBottom: spacing.md },
  bookTitle: { color: colors.inkStrong, fontFamily: 'Newsreader_700Bold', fontSize: 26, lineHeight: 30, marginTop: spacing.md, textAlign: 'center' },
  bookAuthor: { color: colors.brandMuted, fontSize: type.bodyMedium, fontWeight: '600', marginTop: 5, textAlign: 'center' },
  noteLabel: { color: colors.muted, fontSize: type.label, fontWeight: '700', letterSpacing: 1.1 },
  bookTagline: { color: colors.inkStrong, fontFamily: 'Newsreader_700Bold', fontSize: type.bodyLarge, fontStyle: 'italic', fontWeight: '700', lineHeight: 22, textAlign: 'center', marginTop: spacing.xs },
  keywordRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.xs },
  keyword: { color: colors.brandMuted, fontSize: type.caption, fontWeight: '700', paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, borderRadius: radii.pill, backgroundColor: colors.goldSoft },
  keywordPending: { color: colors.secondary, fontSize: type.caption, marginTop: spacing.xs, textAlign: 'center' },
  bookActionButtons: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md },
  readActionButton: { minHeight: 48, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xxs, paddingHorizontal: spacing.xxs, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.md, backgroundColor: colors.surfaceWarm },
  readActionButtonText: { color: colors.brandDeep, fontSize: type.bodySmall, fontWeight: '700' },
  snoozeActionButton: { minHeight: 48, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xxs, paddingHorizontal: spacing.xxs, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.md, backgroundColor: colors.surfaceWarm },
  snoozeActionButtonText: { color: colors.brandDeep, fontSize: type.bodySmall, fontWeight: '700' },
  adaptationSection: { marginTop: spacing.md, paddingHorizontal: spacing.sm, paddingVertical: 4, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.md, backgroundColor: colors.page },
  adaptationHeader: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  adaptationSummary: { flex: 1, color: colors.inkStrong, fontSize: type.bodyMedium, fontWeight: '600' },
  adaptationRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 },
  adaptationCopy: { flex: 1, minWidth: 0 },
  adaptationTitle: { color: colors.body, fontSize: type.footnote, lineHeight: 17, fontWeight: '600' },
  adaptationMeta: { color: colors.muted, fontSize: type.label, lineHeight: 14, marginTop: 2 },
  adaptationCast: { color: colors.secondary, fontSize: type.label, lineHeight: 14, marginTop: 3 },
  adaptationEmpty: { color: colors.muted, fontSize: type.caption, lineHeight: 15 },
  tmdbLink: { minHeight: 28, justifyContent: 'center', paddingHorizontal: 6 },
  tmdbLinkText: { color: colors.brandMuted, fontSize: type.tiny, fontWeight: '800', letterSpacing: 0.4 },
  tmdbBadge: { color: colors.brandDeep, fontSize: type.caption, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, backgroundColor: colors.brandSoft },
  tmdbAttribution: { color: colors.quiet, fontSize: type.micro, lineHeight: 10, marginTop: 8 },
  onRampSection: { marginTop: spacing.lg, paddingTop: 13, borderTopWidth: 1, borderTopColor: colors.border },
  onRampButton: { minHeight: 48, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xxs, paddingHorizontal: spacing.xxs, borderRadius: radii.md, backgroundColor: colors.brandStrong },
  onRampButtonText: { color: colors.brandContrast, fontSize: type.bodySmall, fontWeight: '700' },
  onRampText: { color: colors.body, fontSize: type.bodyMedium, lineHeight: 20, marginTop: 10 },
  onRampError: { color: colors.danger, fontSize: type.bodySmall, lineHeight: 16, marginTop: 8 },
  actionDisabled: { opacity: 0.55 },
  actionPressed: { backgroundColor: colors.brandSoft, transform: [{ scale: 0.98 }] },
  indicatorOverlay: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  directionIndicator: { width: '18%', maxWidth: 120, minHeight: 36, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: spacing.xxs, paddingVertical: spacing.xs, borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceWarm },
  indicatorText: { color: colors.body, fontSize: type.bodySmall, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  emptyState: { maxWidth: 860, width: '100%', minHeight: 300, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', padding: 30, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surface },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { color: colors.inkStrong, fontSize: type.heading, fontWeight: '600', textAlign: 'center' },
  emptyCopy: { color: colors.secondary, fontSize: type.bodyMedium, lineHeight: 20, textAlign: 'center', maxWidth: 330, marginTop: 7 },
  resetButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 42, borderRadius: 5, backgroundColor: colors.brandSoft, paddingHorizontal: 14, marginTop: 17 },
  resetButtonText: { color: colors.brandDeep, fontSize: type.footnote, fontWeight: '700' },
  archivedLabel: { color: colors.muted, fontSize: type.tiny, fontWeight: '800', letterSpacing: 0.5 },
  shelfReturn: { color: colors.goldDark, fontSize: type.label, fontWeight: '700', letterSpacing: 0.2, textAlign: 'right' },
  shelfReturnLabel: { maxWidth: 90 },
  wakeButton: { minWidth: 54, height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xxs, paddingHorizontal: 6, borderRadius: 4, backgroundColor: colors.goldSoft },
  wakeButtonText: { color: colors.goldDark, fontSize: type.tiny, fontWeight: '800', letterSpacing: 0.4 },
  returnBookButton: { minWidth: 58, height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xxs, paddingHorizontal: 6, borderRadius: 4, backgroundColor: colors.brandSoft },
  returnBookButtonText: { color: colors.brandStrong, fontSize: type.tiny, fontWeight: '800', letterSpacing: 0.4 },
  finishedBookAction: { alignSelf: 'stretch' },
  quipToggle: { minWidth: 82, height: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 7, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 4, backgroundColor: colors.surfaceMuted },
  quipToggleEnabled: { borderColor: colors.brandSoft, backgroundColor: colors.brandSoft },
  quipToggleLabel: { color: colors.secondary, fontSize: type.tiny, fontWeight: '800', letterSpacing: 0.35 },
  quipToggleLabelEnabled: { color: colors.brand },
  pageFooter: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14, marginTop: 28, flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  footerCopy: { color: colors.quiet, fontSize: type.tiny, fontWeight: '700', letterSpacing: 0.8 },
});