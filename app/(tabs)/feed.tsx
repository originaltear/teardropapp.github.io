import { useCallback, useRef, useState, useEffect, useMemo, memo } from 'react';
import { useTheme } from '../../lib/themes';
import {
  StyleSheet, View, Text, FlatList, TouchableOpacity,
  Alert, ActivityIndicator, RefreshControl, Animated,
} from 'react-native';
import { tapLight, selection } from '../../lib/haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useRouter } from 'expo-router';
import { emotionById, EMOTIONS } from '../../lib/emotions';
import { TearsBadge } from '../../components/TearsBadge';
import { Avatar } from '../../components/Avatar';
import { Drops } from '../../components/Drops';
import { ListSkeleton } from '../../components/Skeleton';
import { timeAgo } from '../../lib/format';
import { useAuth } from '../../lib/auth';
import { AuthGateModal } from '../../components/AuthGateModal';
import { getSocialFeed, getMineFeed, FEED_PAGE_SIZE, SocialCry } from '../../lib/social';
import { isQuickLogSocial } from '../../lib/quick-log';
import { TagPills } from '../../components/TagPills';
import { FeedBanner } from '../../components/FeedBanner';
import { maybeShowFeedInterstitial } from '../../lib/ads';
import { updateCriesVisibility, deleteCries } from '../../lib/storage';
import {
  BulkActionsBar, promptBulkVisibility, promptBulkDelete,
  visibilityLabel, type CryVisibility,
} from '../../components/BulkActionsBar';
import { success, warning } from '../../lib/haptics';

// ─── Feed item ────────────────────────────────────────────────────────────────

const FeedItem = memo(function FeedItem({ cry, onSelect, quickBadge, selectMode, checked, onLongPress, hideAuthor }: {
  cry: SocialCry;
  onSelect: (cry: SocialCry) => void;
  /** Shown on the Mine tab for cries that still have no details. */
  quickBadge?: boolean;
  /** Mine-tab bulk edit: render a check circle and highlight when checked. */
  selectMode?: boolean;
  checked?: boolean;
  onLongPress?: (cry: SocialCry) => void;
  /** Your own feed: every row would repeat your name and avatar, so drop both. */
  hideAuthor?: boolean;
}) {
  const emotion = emotionById(cry.emotion);
  const color = emotion?.color ?? '#6fe0e6';
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  }, [enter]);
  return (
    <Animated.View style={{
      opacity: enter,
      transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
    }}>
    <TouchableOpacity
      style={[
        styles.item,
        // The emotion colour is the app's whole vocabulary, but it only lived in
        // a small chip, so every row read the same while scrolling. This edge
        // makes a feed of ten cries look like ten different feelings.
        { borderLeftColor: color },
        selectMode && checked && styles.itemChecked,
      ]}
      onPress={() => onSelect(cry)}
      onLongPress={onLongPress ? () => onLongPress(cry) : undefined}
      delayLongPress={350}
      activeOpacity={0.75}
    >
      {selectMode && (
        <View style={[styles.checkCircle, checked && styles.checkCircleOn]}>
          {checked && <Text style={styles.checkMark}>✓</Text>}
        </View>
      )}
      {!hideAuthor && <Avatar uri={cry.profile.avatar_uri} size={44} />}
      <View style={[styles.itemContent, hideAuthor && styles.itemContentBare]}>
        <View style={styles.itemTop}>
          {hideAuthor ? (
            // Without the author line the chip moves up to head the row, and the
            // drops ride alongside it rather than taking a line of their own.
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[styles.emotionChip, { backgroundColor: color + '22' }]}>
                <Text style={styles.emotionChipEmoji}>{emotion?.emoji}</Text>
                <Text style={[styles.emotionChipLabel, { color }]}>{emotion?.label ?? cry.emotion}</Text>
              </View>
              <Drops intensity={cry.intensity} size={11} />
            </View>
          ) : (
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
              <Text style={styles.itemUser}>{cry.profile.display_name}</Text>
              <Text style={styles.itemHandle}>@{cry.profile.username}</Text>
              {cry.profile.selected_tears && cry.profile.selected_tears.length > 0 && (
                <TearsBadge tears={cry.profile.selected_tears} />
              )}
            </View>
          )}
          <Text style={styles.timeAgo}>{timeAgo(cry.created_at)}</Text>
        </View>
        {!hideAuthor && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <View style={[styles.emotionChip, { backgroundColor: color + '22' }]}>
              <Text style={styles.emotionChipEmoji}>{emotion?.emoji}</Text>
              <Text style={[styles.emotionChipLabel, { color }]}>{emotion?.label ?? cry.emotion}</Text>
            </View>
            <Drops intensity={cry.intensity} size={11} />
          </View>
        )}
        {cry.note ? <Text style={styles.noteSnippet} numberOfLines={2}>{cry.note}</Text> : null}
        {cry.tags && cry.tags.length > 0 && (
          <Text style={styles.itemTags} numberOfLines={1}>
            {cry.tags.map(t => `#${t}`).join('  ')}
          </Text>
        )}
        {quickBadge && (
          <Text style={styles.quickBadge}>✏️ no details yet · tap to add</Text>
        )}
        <View style={styles.itemMeta}>
          {(cry.photo_uri || cry.audio_uri) ? (
            <>
              {cry.photo_uri ? <Text style={styles.metaTag}>📷</Text> : null}
              {cry.audio_uri ? <Text style={styles.metaTag}>🎙</Text> : null}
            </>
          ) : null}
          {cry.like_count > 0 && <Text style={styles.metaTag}>💧 {cry.like_count}</Text>}
          {cry.hug_count > 0 && <Text style={styles.metaTag}>🫂 {cry.hug_count}</Text>}
          {cry.comment_count > 0 && <Text style={styles.metaTag}>💬 {cry.comment_count}</Text>}
        </View>
      </View>
    </TouchableOpacity>
    </Animated.View>
  );
});

// ─── Feed screen ──────────────────────────────────────────────────────────────

type FeedTab = 'mine' | 'following';

export default function FeedScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const { theme: { accent } } = useTheme();
  const [allCries, setAllCries] = useState<SocialCry[]>([]);
  // Opening a cry now leaves the tab, so coming back re-fires the focus effect.
  // Without this the feed interstitial would get a fresh chance every time
  // someone reads a cry and hits back — far more often than intended.
  const skipNextInterstitial = useRef(false);
  const [authGate, setAuthGate] = useState(false);
  const [tab, setTab] = useState<FeedTab>('following');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [endReached, setEndReached] = useState(false);
  // Mine tab filters
  const [mineEmotion, setMineEmotion] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [mineQuickOnly, setMineQuickOnly] = useState(false);
  // Mine tab bulk edit (visibility/delete)
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  async function loadFeed(isRefresh = false) {
    if (!session) return;
    // Only show the skeleton when there's nothing on screen yet — returning to
    // the tab refreshes silently instead of flashing the whole list away.
    if (isRefresh) setRefreshing(true);
    else if (allCries.length === 0) setLoading(true);
    try {
      const feed = tab === 'mine' ? await getMineFeed() : await getSocialFeed();
      setAllCries(feed);
      setEndReached(feed.length < FEED_PAGE_SIZE);
    } catch (e) {
      console.warn('[feed] loadFeed failed:', e);
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false);
    }
  }

  // Infinite scroll: fetch the page older than the last visible cry
  async function loadMore() {
    if (!session || loading || refreshing || loadingMore || endReached || allCries.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = allCries[allCries.length - 1].created_at;
      const more = tab === 'mine' ? await getMineFeed(oldest) : await getSocialFeed(oldest);
      if (more.length < FEED_PAGE_SIZE) setEndReached(true);
      setAllCries(prev => {
        const seen = new Set(prev.map(c => c.id));
        return [...prev, ...more.filter(c => !seen.has(c.id))];
      });
    } catch (e) {
      console.warn('[feed] loadMore failed:', e);
    } finally {
      setLoadingMore(false);
    }
  }

  // Switching tab or account = genuinely unknown data — clear so the skeleton
  // shows instead of stale rows (and a logged-out user never sees the previous
  // account's feed). Bulk-select mode never survives a tab/account switch.
  useEffect(() => {
    setAllCries([]);
    setEndReached(false);
    setSelectMode(false);
    setSelectedIds(new Set());
    if (session) setLoading(true);
  }, [tab, session?.user.id]);

  // ── Mine-tab bulk edit ─────────────────────────────────────────────────────

  function toggleBulkId(id: string) {
    selection();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  async function applyBulkVisibility(visibility: CryVisibility) {
    const ids = [...selectedIds];
    setApplying(true);
    const ok = await updateCriesVisibility(ids, visibility);
    setApplying(false);
    if (!ok) {
      warning();
      Alert.alert('Could not update', 'Something went wrong changing visibility. Please try again.');
      return;
    }
    success();
    const idSet = new Set(ids);
    setAllCries(prev => prev.map(c => (idSet.has(c.id) ? { ...c, visibility } : c)));
    exitSelectMode();
    Alert.alert('Visibility updated', `${ids.length} ${ids.length === 1 ? 'cry is' : 'cries are'} now visible to: ${visibilityLabel(visibility)}`);
  }

  async function applyBulkDelete() {
    const ids = [...selectedIds];
    setApplying(true);
    const ok = await deleteCries(ids);
    setApplying(false);
    if (!ok) {
      warning();
      Alert.alert('Could not delete', 'Something went wrong deleting. Please try again.');
      return;
    }
    success();
    const idSet = new Set(ids);
    setAllCries(prev => prev.filter(c => !idSet.has(c.id)));
    exitSelectMode();
  }

  useFocusEffect(useCallback(() => {
    loadFeed();
    // Light interstitial when the feed opens. Self-gated: skipped for Pro, for the
    // first ~90s after launch, and to at most once per 3 min. Never after a cry,
    // and never on the way back from reading one.
    if (skipNextInterstitial.current) skipNextInterstitial.current = false;
    else maybeShowFeedInterstitial();
  }, [session, tab]));

  // Filter mine tab by emotion and/or quick-log status
  const displayCries = tab === 'mine'
    ? allCries
        .filter(c => !mineEmotion || c.emotion === mineEmotion)
        .filter(c => !mineQuickOnly || isQuickLogSocial(c))
    : allCries;

  // Intersperse an ad row every AD_EVERY cries (feed monetization). FeedBanner
  // hides itself for Pro users, so those rows collapse to nothing for them. No ad
  // is placed as the very last row.
  type FeedRow = { kind: 'cry'; cry: SocialCry } | { kind: 'ad'; id: string };
  const AD_EVERY = 8;
  const feedRows = useMemo<FeedRow[]>(() => {
    const rows: FeedRow[] = [];
    displayCries.forEach((cry, i) => {
      rows.push({ kind: 'cry', cry });
      if ((i + 1) % AD_EVERY === 0 && i + 1 < displayCries.length) {
        rows.push({ kind: 'ad', id: `ad-${cry.id}` });
      }
    });
    return rows;
  }, [displayCries]);

  const selectedEmotion = mineEmotion ? EMOTIONS.find(e => e.id === mineEmotion) : null;

  // Row tap: toggles the checkbox in bulk-select mode, opens the cry otherwise.
  // Detail is a pushed screen rather than a sheet on purpose: an RN <Modal> is an
  // Android Dialog with its own window, and a dialog window's soft-input mode
  // can't be set from JS, so the comment field ended up under the keyboard.
  const handleSelect = useCallback((c: SocialCry) => {
    if (selectMode) { toggleBulkId(c.id); return; }
    skipNextInterstitial.current = true;
    router.push(`/cry-detail?id=${c.id}`);
  }, [selectMode]);

  const handleRowLongPress = useCallback((c: SocialCry) => {
    if (!selectMode) {
      selection();
      setSelectMode(true);
      setSelectedIds(new Set([c.id]));
    }
  }, [selectMode]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Feed</Text>
        <TouchableOpacity
          style={styles.addFriendsBtn}
          activeOpacity={0.7}
          onPress={() => session ? router.push('/friends') : setAuthGate(true)}
        >
          <Text style={[styles.addFriendsTxt, { color: accent }]}>👥 Friends</Text>
        </TouchableOpacity>
      </View>

      {/* Mine / Following tabs */}
      {session && (
        <View style={styles.tabRow}>
          {(['mine', 'following'] as FeedTab[]).map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.tabChip, tab === t && { backgroundColor: accent, borderColor: accent }]}
              onPress={() => { if (tab !== t) { selection(); setTab(t); } }}
            >
              <Text style={[styles.tabChipTxt, tab === t && styles.tabChipTxtActive]}>
                {t === 'mine' ? '👤 Mine' : '👥 Following'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Mine-tab filters: emotion dropdown + quick-log toggle */}
      {session && tab === 'mine' && (
        <View style={styles.filterWrap}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
          <TouchableOpacity
            style={[styles.filterBar, filterOpen && styles.filterBarOpen]}
            onPress={() => setFilterOpen(v => !v)}
            activeOpacity={0.8}
          >
            <Text style={styles.filterBarTxt}>
              {selectedEmotion
                ? `${selectedEmotion.emoji}  ${selectedEmotion.label}`
                : '💧  All emotions'}
            </Text>
            <Text style={styles.filterArrow}>{filterOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {filterOpen && (
            <View style={styles.dropdown}>
              <TouchableOpacity
                style={[styles.dropdownItem, !mineEmotion && { backgroundColor: accent + '10' }]}
                onPress={() => { setMineEmotion(null); setFilterOpen(false); }}
              >
                <Text style={[styles.dropdownTxt, !mineEmotion && { color: accent }]}>
                  💧  All emotions
                </Text>
                {!mineEmotion && <Text style={[styles.dropdownCheck, { color: accent }]}>✓</Text>}
              </TouchableOpacity>
              {EMOTIONS.map(e => (
                <TouchableOpacity
                  key={e.id}
                  style={[styles.dropdownItem, mineEmotion === e.id && { backgroundColor: accent + '10' }]}
                  onPress={() => { setMineEmotion(e.id); setFilterOpen(false); }}
                >
                  <Text style={[styles.dropdownTxt, mineEmotion === e.id && { color: e.color }]}>
                    {e.emoji}  {e.label}
                  </Text>
                  {mineEmotion === e.id && <Text style={[styles.dropdownCheck, { color: e.color }]}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
          )}
          </View>

          {/* Quick-log toggle — bare cries waiting for details */}
          <TouchableOpacity
            style={[styles.quickChip, mineQuickOnly && { borderColor: accent, backgroundColor: accent + '10' }]}
            onPress={() => { selection(); setMineQuickOnly(v => !v); }}
            accessibilityRole="button"
            accessibilityState={{ selected: mineQuickOnly }}
            accessibilityLabel="Show only quick logs"
          >
            <Text style={[styles.quickChipTxt, mineQuickOnly && { color: accent }]}>⚡</Text>
          </TouchableOpacity>

          {/* Bulk-select toggle (visibility/delete for several cries at once) */}
          <TouchableOpacity
            style={[styles.quickChip, selectMode && { borderColor: accent, backgroundColor: accent + '10' }]}
            onPress={() => { selection(); selectMode ? exitSelectMode() : setSelectMode(true); }}
            accessibilityRole="button"
            accessibilityState={{ selected: selectMode }}
            accessibilityLabel={selectMode ? 'Exit select mode' : 'Select multiple cries'}
          >
            <Text style={[styles.quickChipTxt, selectMode && { color: accent }]}>☑</Text>
          </TouchableOpacity>
          </View>
        </View>
      )}

      <AuthGateModal visible={authGate} onClose={() => setAuthGate(false)} />

      {loading ? (
        <ListSkeleton />
      ) : (
        <FlatList
          data={feedRows}
          keyExtractor={row => (row.kind === 'cry' ? row.cry.id : row.id)}
          style={{ flex: 1 }}
          renderItem={({ item }) =>
            item.kind === 'ad' ? (
              <FeedBanner />
            ) : (
              <FeedItem
                cry={item.cry}
                onSelect={handleSelect}
                quickBadge={tab === 'mine' && isQuickLogSocial(item.cry)}
                selectMode={tab === 'mine' && selectMode}
                checked={selectedIds.has(item.cry.id)}
                onLongPress={tab === 'mine' ? handleRowLongPress : undefined}
                hideAuthor={tab === 'mine'}
              />
            )
          }
          // The inset lines up with the avatar's right edge, so on the Mine tab
          // (which has no avatar) it has to pull back to the text instead.
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, tab === 'mine' && styles.separatorBare]} />
          )}
          contentContainerStyle={displayCries.length === 0 ? styles.emptyContainer : styles.listContent}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={accent} style={{ paddingVertical: 20 }} /> : null
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadFeed(true)}
              tintColor={accent}
              colors={[accent]}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>💧</Text>
              <Text style={styles.emptyTitle}>
                {!session
                  ? 'Log in to see the feed'
                  : tab === 'mine'
                    ? 'No cries match'
                    : 'No cries yet'}
              </Text>
              <Text style={styles.emptySub}>
                {!session
                  ? 'Create an account to follow friends and see their cries'
                  : tab === 'mine'
                    ? 'Try a different filter'
                    : 'Follow friends to see their cries here'}
              </Text>
              {session && tab === 'following' && (
                <TouchableOpacity
                  style={[styles.emptyBtn, { backgroundColor: accent }]}
                  onPress={() => router.push('/friends')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.emptyBtnTxt}>👥  Find Friends</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {/* Bulk action bar while selecting on the Mine tab. */}
      {selectMode && tab === 'mine' && (
        <BulkActionsBar
          count={selectedIds.size}
          applying={applying}
          onChangeVisibility={() => promptBulkVisibility(selectedIds.size, applyBulkVisibility)}
          onDelete={() => promptBulkDelete(selectedIds.size, applyBulkDelete)}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  headerTitle: { color: '#e2e8f0', fontSize: 26, fontWeight: '700' },
  addFriendsBtn: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, borderColor: '#1f2937',
  },
  addFriendsTxt: { color: '#6fe0e6', fontSize: 13, fontWeight: '600' },

  tabRow: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  filterWrap: {
    marginHorizontal: 16, marginTop: 10, marginBottom: 4, zIndex: 10,
  },
  filterBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#111827', borderRadius: 12,
    borderWidth: 1, borderColor: '#1f2937',
    paddingHorizontal: 16, paddingVertical: 13,
  },
  filterBarOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomColor: 'transparent' },
  filterBarTxt: { color: '#e2e8f0', fontSize: 14, fontWeight: '600' },
  filterArrow: { color: '#4a5568', fontSize: 11 },
  dropdown: {
    backgroundColor: '#111827',
    borderWidth: 1, borderTopWidth: 0, borderColor: '#1f2937',
    borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13,
    borderTopWidth: 1, borderTopColor: '#1f2937',
  },
  dropdownTxt: { color: '#94a3b8', fontSize: 14 },
  dropdownCheck: { color: '#6fe0e6', fontSize: 14, fontWeight: '700' },
  tabChip: {
    flex: 1, paddingVertical: 9, borderRadius: 20,
    borderWidth: 1, borderColor: '#1f2937', alignItems: 'center',
  },
  tabChipTxt: { color: '#4a5568', fontSize: 13, fontWeight: '600' },
  tabChipTxtActive: { color: '#0d1117' },

  listContent: { paddingVertical: 8 },
  separator: { height: 1, backgroundColor: '#1f2937', marginLeft: 68 },
  separatorBare: { marginLeft: 19 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 10, paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 48, opacity: 0.4 },
  emptyTitle: { color: '#4a5568', fontSize: 17, fontWeight: '600' },
  emptySub: { color: '#374151', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    marginTop: 8, backgroundColor: '#6fe0e6',
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20,
  },
  emptyBtnTxt: { color: '#0d1117', fontSize: 14, fontWeight: '700' },

  item: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingLeft: 13, paddingRight: 16, paddingVertical: 14,
    borderLeftWidth: 3,   // colour is set per row from the emotion
  },
  avatarFallback: { backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center' },
  itemContent: { flex: 1, gap: 4 },
  // The avatar used to supply the left indent; without it the text would sit
  // right on top of the emotion edge.
  itemContentBare: { paddingLeft: 6 },
  // The name block is flex:1, so without a gap it grows flush against the
  // timestamp and long handles end up touching the date.
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  itemUser: { color: '#e2e8f0', fontSize: 14, fontWeight: '600', flex: 1 },
  itemHandle: { color: '#4a5568', fontWeight: '400' },
  timeAgo: { color: '#374151', fontSize: 11, fontFamily: 'monospace', flexShrink: 0 },
  emotionChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  emotionChipEmoji: { fontSize: 12 },
  emotionChipLabel: { fontSize: 12, fontWeight: '600' },
  noteSnippet: { color: '#64748b', fontSize: 13, lineHeight: 18 },
  itemTags: { color: '#4a5568', fontSize: 12 },
  quickBadge: { color: '#eab308', fontSize: 11, fontFamily: 'monospace' },
  itemChecked: { backgroundColor: '#6fe0e610' },
  checkCircle: {
    width: 22, height: 22, borderRadius: 11, alignSelf: 'center',
    borderWidth: 2, borderColor: '#374151',
    alignItems: 'center', justifyContent: 'center',
  },
  checkCircleOn: { borderColor: '#6fe0e6', backgroundColor: '#6fe0e6' },
  checkMark: { color: '#0d1117', fontSize: 13, fontWeight: '800', lineHeight: 15 },
  quickChip: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: '#111827', borderWidth: 1, borderColor: '#1f2937',
    alignItems: 'center', justifyContent: 'center',
  },
  quickChipTxt: { fontSize: 18, color: '#4a5568' },
  itemMeta: { flexDirection: 'row', gap: 8, marginTop: 2 },
  metaTag: { color: '#4a5568', fontSize: 12 },
});
