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
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bookmark,
  BookOpen,
  Check,
  Clock3,
  RotateCcw,
  Sparkles,
  UserRound,
} from 'lucide-react-native';
import { BOOKS, PILLARS, SUBCATEGORIES, type Book, type Pillar, type SubcategoryId } from '@/lib/books';
import { linkCurrentUserEmail, resendCurrentUserEmailChange, signInWithEmail } from '@/lib/auth';
import AccountSheet from '@/components/AccountSheet';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { getOrCreateAnonymousUser, loadUserSwipes, saveUserSwipe } from '@/lib/swipes';
import CategoryRoulette from '@/components/CategoryRoulette';

type Screen = 'discover' | 'tbr' | 'read';
type Action = 'tbr' | 'read' | 'freeze' | 'next';
type SyncStatus = 'local' | 'loading' | 'connected' | 'error';

const ACTIONS: { id: Action; label: string; hint: string; color: string; icon: typeof ArrowRight }[] = [
  { id: 'tbr', label: 'Save to TBR', hint: 'Right', color: '#337e69', icon: Bookmark },
  { id: 'read', label: 'Already read', hint: 'Up', color: '#476da1', icon: Check },
  { id: 'freeze', label: 'Snooze 90 days', hint: 'Left', color: '#8a6e46', icon: Clock3 },
  { id: 'next', label: 'Next book', hint: 'Down', color: '#626b65', icon: ArrowDown },
];

function NavItem({
  label,
  count,
  active,
  disabled = false,
  onPress,
  icon: Icon,
}: {
  label: string;
  count?: number;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
  icon: typeof BookOpen;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.navItem, disabled && styles.navItemDisabled, active && styles.navItemActive]}
    >
      <Icon color={active ? '#243b35' : '#9da9a1'} size={18} strokeWidth={1.8} />
      <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
      {count !== undefined && <Text style={[styles.navCount, active && styles.navLabelActive]}>{count}</Text>}
    </Pressable>
  );
}

export default function DiscoverScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 820;
  const [screen, setScreen] = useState<Screen>('discover');
  const [tbrIds, setTbrIds] = useState<string[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [frozenUntil, setFrozenUntil] = useState<Record<string, number>>({});
  const [deferredIds, setDeferredIds] = useState<string[]>([]);
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<SubcategoryId | null>(null);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
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

  const completedIds = new Set([...tbrIds, ...readIds]);
  const availableBooks = BOOKS.filter(
    (book) =>
      !completedIds.has(book.id) &&
      !deferredIds.includes(book.id) &&
      (!frozenUntil[book.id] || frozenUntil[book.id] <= Date.now()),
  );
  const remainingCounts = Object.fromEntries(
    SUBCATEGORIES.map((category) => [
      category.id,
      availableBooks.filter((availableBook) => availableBook.subcategory === category.id).length,
    ]),
  ) as Record<SubcategoryId, number>;
  const book = selectedBookId ? BOOKS.find((item) => item.id === selectedBookId) : undefined;
  const currentSubcategory = selectedSubcategoryId
    ? SUBCATEGORIES.find((category) => category.id === selectedSubcategoryId)
    : undefined;
  const currentPillar = book
    ? PILLARS.find((pillar) => pillar.id === book.pillar)
    : currentSubcategory
      ? PILLARS.find((pillar) => pillar.id === currentSubcategory.pillar)
      : undefined;

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    setSyncStatus('loading');
    setSyncMessage('');

    const restoreShelf = async () => {
      try {
        const activeUser = await getOrCreateAnonymousUser();
        if (!activeUser) throw new Error('Supabase is not configured.');
        const swipes = await loadUserSwipes(activeUser.id);
        if (!active) return;

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
  }, [book?.id]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const actionByKey: Record<string, Action> = {
        ArrowRight: 'tbr',
        ArrowUp: 'read',
        ArrowLeft: 'freeze',
        ArrowDown: 'next',
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
    if (!book || screen !== 'discover' || syncStatus === 'loading' || isSaving) return;
    const selectedBook = book;
    setSelectedBookId(null);
    if (action === 'tbr') setTbrIds((ids) => [...ids, selectedBook.id]);
    if (action === 'read') setReadIds((ids) => [...ids, selectedBook.id]);
    if (action === 'freeze') {
      setFrozenUntil((items) => ({ ...items, [selectedBook.id]: Date.now() + 90 * 24 * 60 * 60 * 1000 }));
    }
    if (action === 'next') {
      setDeferredIds((ids) => [...ids, selectedBook.id]);
      return;
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
        const action: Action = horizontal
          ? gesture.dx > 0 ? 'tbr' : 'freeze'
          : gesture.dy < 0 ? 'read' : 'next';
        const destination = {
          x: horizontal ? Math.sign(gesture.dx) * 460 : gesture.dx,
          y: horizontal ? gesture.dy : Math.sign(gesture.dy) * 460,
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

  const selectSubcategory = (subcategoryId: SubcategoryId) => {
    const categoryBooks = availableBooks.filter((availableBook) => availableBook.subcategory === subcategoryId);
    setSelectedSubcategoryId(subcategoryId);
    if (categoryBooks.length === 0) {
      setSelectedBookId(null);
      return;
    }
    const chosenBook = categoryBooks[Math.floor(Math.random() * categoryBooks.length)];
    setSelectedBookId(chosenBook.id);
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
    setDeferredIds([]);
    setSelectedBookId(null);
    setSelectedSubcategoryId(null);
    setIsAccountSheetVisible(false);
    setAuthRetryCount((count) => count + 1);
  };

  const shelfBooks = screen === 'tbr'
    ? BOOKS.filter((item) => tbrIds.includes(item.id))
    : BOOKS.filter((item) => readIds.includes(item.id));
  const screenTitle = screen === 'discover' ? 'Find your next read' : screen === 'tbr' ? 'Your reading list' : 'Books you’ve read';
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
            <NavItem label="Discover" active={screen === 'discover'} onPress={() => setScreen('discover')} icon={Sparkles} />
            <NavItem label="To be read" count={tbrIds.length} active={screen === 'tbr'} onPress={() => setScreen('tbr')} icon={Bookmark} />
            <NavItem label="Already read" count={readIds.length} active={screen === 'read'} onPress={() => setScreen('read')} icon={Check} />
            <NavItem
              label={isAnonymous ? 'Link your shelf' : 'Account'}
              active={false}
              disabled={syncStatus === 'loading'}
              onPress={() => setIsAccountSheetVisible(true)}
              icon={UserRound}
            />
            <View style={styles.sidebarFooter}>
              <Text style={styles.sidebarFooterLabel}>A SMALL STACK, A GOOD START</Text>
              <Text style={styles.sidebarFooterText}>Twenty-four curated titles across eight shelves.</Text>
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

          {!isWide && (
            <View style={styles.mobileNav}>
              <NavItem label="Discover" active={screen === 'discover'} onPress={() => setScreen('discover')} icon={Sparkles} />
              <NavItem label="TBR" count={tbrIds.length} active={screen === 'tbr'} onPress={() => setScreen('tbr')} icon={Bookmark} />
              <NavItem label="Read" count={readIds.length} active={screen === 'read'} onPress={() => setScreen('read')} icon={Check} />
            </View>
          )}

          <ScrollView contentContainerStyle={[styles.content, !isWide && styles.contentMobile]}>
            <View style={styles.pageHeading}>
              <View>
                <Text style={styles.eyebrow}>{screen === 'discover' ? 'THE DISCOVERY DESK' : 'YOUR SHELVES'}</Text>
                <Text style={styles.pageTitle}>{screenTitle}</Text>
              </View>
              <Text style={styles.issueMark}>NO. 001 <Text style={styles.issueDot}>/</Text> 2026</Text>
            </View>
            <View style={styles.syncStatusRow}>
              <View style={[styles.syncDot, syncStatus === 'connected' && styles.syncDotConnected, syncStatus === 'error' && styles.syncDotError]} />
              <Text style={styles.syncStatusText}>{syncLabel}</Text>
            </View>

            {screen === 'discover' ? (
              <>
                <View style={styles.pillarHeader}>
                  <Text style={styles.sectionLabel}>THE EIGHT SHELVES</Text>
                  <Text style={styles.stackCount}>{String(availableBooks.length).padStart(2, '0')} BOOKS AVAILABLE</Text>
                </View>

                <CategoryRoulette
                  remainingCounts={remainingCounts}
                  selectedId={selectedSubcategoryId}
                  disabled={syncStatus === 'loading'}
                  onSelect={selectSubcategory}
                />

                <View style={styles.cardMetaRow}>
                  <Text style={styles.sectionLabel}>
                    {currentSubcategory?.label.toUpperCase() ?? currentPillar?.detail.toUpperCase() ?? 'A LITTLE OF EVERYTHING'}
                  </Text>
                  <Text style={styles.cardPosition}>{book ? 'YOUR NEXT READ' : selectedSubcategoryId ? 'SHELF EMPTY · SPIN AGAIN' : 'READY WHEN YOU ARE'}</Text>
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
                      <View style={styles.cardFooter}>
                        <Text style={styles.catalogId}>BQ · {book.id.toUpperCase()}</Text>
                        <BookOpen color="#95a19a" size={17} strokeWidth={1.6} />
                      </View>
                    </View>
                  </Animated.View>
                ) : selectedSubcategoryId ? (
                  <View style={styles.emptyState}>
                    <View style={styles.emptyIcon}><BookOpen color="#3d735f" size={24} /></View>
                    <Text style={styles.emptyTitle}>This shelf is between books.</Text>
                    <Text style={styles.emptyCopy}>The wheel landed on {currentSubcategory?.label}. Spin again to find another shelf.</Text>
                    {deferredIds.length > 0 && (
                      <Pressable onPress={() => setDeferredIds([])} style={styles.resetButton}>
                        <RotateCcw color="#285f4e" size={16} />
                        <Text style={styles.resetButtonText}>Reset this stack</Text>
                      </Pressable>
                    )}
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
                        <Text style={styles.actionLabel}>{label}</Text>
                        {isWide && <Text style={styles.actionHint}>SWIPE {hint.toUpperCase()}</Text>}
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
            ) : (
              <View style={styles.shelfView}>
                <View style={styles.pillarHeader}>
                  <Text style={styles.sectionLabel}>{screen === 'tbr' ? 'SAVED FOR LATER' : 'MARKED AS READ'}</Text>
                  <Text style={styles.stackCount}>{String(shelfBooks.length).padStart(2, '0')} BOOKS</Text>
                </View>
                {shelfBooks.length === 0 ? (
                  <View style={styles.emptyState}>
                    <View style={styles.emptyIcon}><BookOpen color="#3d735f" size={24} /></View>
                    <Text style={styles.emptyTitle}>A shelf with room to grow.</Text>
                    <Text style={styles.emptyCopy}>Books you sort in discovery will appear here.</Text>
                    <Pressable onPress={() => setScreen('discover')} style={styles.resetButton}>
                      <Sparkles color="#285f4e" size={16} />
                      <Text style={styles.resetButtonText}>Discover books</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.shelfList}>
                    {shelfBooks.map((item, index) => (
                      <View key={item.id} style={styles.shelfRow}>
                        <Text style={styles.shelfIndex}>{String(index + 1).padStart(2, '0')}</Text>
                        <View style={[styles.shelfSwatch, { backgroundColor: item.color }]} />
                        <View style={styles.shelfText}>
                          <Text style={styles.shelfTitle}>{item.title}</Text>
                          <Text style={styles.shelfAuthor}>{item.author} · {item.year}</Text>
                        </View>
                        <Text style={styles.shelfPillar}>{PILLARS.find((pillar) => pillar.id === item.pillar)?.label.toUpperCase()}</Text>
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
        onRetry={() => {
          setIsAccountSheetVisible(false);
          setAuthRetryCount((count) => count + 1);
        }}
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
  navItemActive: { backgroundColor: '#d8eee0' },
  navItemDisabled: { opacity: 0.5 },
  navLabel: { flex: 1, color: '#bdc8c0', fontSize: 13, fontWeight: '500' },
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
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 17 },
  catalogId: { color: '#a0a9a2', fontSize: 9, fontWeight: '700', letterSpacing: 0.7 },
  actionRow: { maxWidth: 860, width: '100%', alignSelf: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, gap: 7 },
  actionRowMobile: { flexWrap: 'wrap' },
  actionButton: { flex: 1, minWidth: 0, minHeight: 65, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, borderRadius: 5, borderWidth: 1, borderColor: '#e1e4dd', backgroundColor: '#f8f9f6' },
  actionButtonMobile: { flexBasis: '47%' },
  actionDisabled: { opacity: 0.55 },
  actionPressed: { backgroundColor: '#e8eee8', transform: [{ scale: 0.98 }] },
  actionIcon: { width: 34, height: 34, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { color: '#34433b', fontSize: 11, fontWeight: '600', flexShrink: 1 },
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
  shelfIndex: { color: '#9ca69e', fontSize: 10, fontWeight: '700', width: 22 },
  shelfSwatch: { width: 4, height: 42, borderRadius: 2 },
  shelfText: { flex: 1 },
  shelfTitle: { color: '#29382f', fontSize: 15, fontWeight: '600' },
  shelfAuthor: { color: '#78857d', fontSize: 11, marginTop: 4 },
  shelfPillar: { color: '#819087', fontSize: 8, fontWeight: '700', letterSpacing: 0.8 },
  pageFooter: { borderTopWidth: 1, borderTopColor: '#dfe4dc', paddingTop: 14, marginTop: 28, flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  footerCopy: { color: '#9aa49c', fontSize: 8, fontWeight: '700', letterSpacing: 0.8 },
});