import { Reveal, PressScale } from '../../components/premium/PremiumVisual';
import { useState, useEffect, useMemo, useRef } from 'react';
import {
  RefreshControl, AppState, StyleSheet
} from 'react-native';
import { ActivityIndicator, View, Text, Image, Pressable, FlatList } from '../../components/premium/PremiumThemePrimitives';
import { useNavigation } from '@react-navigation/native';
import { Star, GraduationCap, Coins, Crown, Trophy } from '../../components/premium/PremiumThemeIcons';
import supabase from '../../supabaseClient';
import UserScreenSkeleton from '../../components/premium/UserScreenSkeleton';

// Compact X-style layout: underline tabs, hairline rows, 15px names, 13px details
const T = {
  text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4',
  brand: '#047857', soft: '#ecfdf5', strip: '#f7f9f9',
};

// Match the working Web leaderboard: 3 reviews to enter featured Top Rated ranks.
const MIN_TOP_RATED_REVIEWS = 3;

const TABS = [
  { key: 'ratings',  label: 'Rating' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'credits',  label: 'Credits' },
];

const PODIUM = {
  1: { size: 68, ped: 84, ring: '#f59e0b' },
  2: { size: 56, ped: 64, ring: '#9ca3af' },
  3: { size: 56, ped: 48, ring: '#d97706' },
};

const Avatar = ({ user, size, ring }) => (
  <View style={{
    width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: '#d1fae5',
    alignItems: 'center', justifyContent: 'center', borderWidth: ring ? 2 : 0, borderColor: ring || 'transparent',
  }}>
    {user.avatar_url
      ? <Image source={{ uri: user.avatar_url }} style={{ width: '100%', height: '100%' }} />
      : <Text style={{ fontWeight: '700', color: '#065f46', fontSize: size * 0.4 }}>{user.full_name?.charAt(0).toUpperCase() || '?'}</Text>}
  </View>
);

export default function Leaderboard() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('ratings');
  const [profiles, setProfiles] = useState([]);
  const [error, setError] = useState('');
  const [currentUserId, setCurrentUserId] = useState(null);
  const debounceRef = useRef(null);

  // Shared, authenticated global dataset — identical to the working Web leaderboard.
  // The Edge Function aggregates restricted sessions/reviews securely, so ranking
  // data does not depend on which account is signed in on the mobile app.
  const load = async () => {
    try {
      const { data, error: functionError } = await supabase.functions.invoke('skillcredit-leaderboard', {
        body: {},
      });
      if (functionError) throw functionError;
      if (!data || !Array.isArray(data.profiles) || !data.statsSummary) {
        throw new Error('Invalid global leaderboard response');
      }
      setProfiles(data.profiles);
      setError('');
    } catch (e) {
      console.error('Global leaderboard fetch failed:', e);
      setProfiles([]);
      setError('Global leaderboard is unavailable. Please try again.');
    }
  };

  useEffect(() => {
    let disposed = false;
    const init = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!disposed) setCurrentUserId(user?.id || null);
      await load();
      if (!disposed) setLoading(false);
    };
    init();

    // ── LIVE: any review / session / credit change re-ranks (debounced)
    const refresh = () => { clearTimeout(debounceRef.current); debounceRef.current = setTimeout(load, 800); };
    const channel = supabase.channel(`leaderboard_live_${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_profiles' }, refresh)
      .subscribe();

    const appSub = AppState.addEventListener('change', (state) => { if (state === 'active') load(); });

    return () => {
      disposed = true;
      clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
      appSub.remove();
    };
  }, []);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const sorted = useMemo(() => {
    const list = [...profiles];
    // Identical sort/tie rules to the latest working Web leaderboard.
    if (tab === 'ratings')  list.sort((a, b) => b.avgRating - a.avgRating || b.totalReviews - a.totalReviews || a.id.localeCompare(b.id));
    if (tab === 'sessions') list.sort((a, b) => b.sessionsCompleted - a.sessionsCompleted || b.avgRating - a.avgRating || a.id.localeCompare(b.id));
    if (tab === 'credits')  list.sort((a, b) => b.creditsBalance - a.creditsBalance || a.id.localeCompare(b.id));
    return list;
  }, [profiles, tab]);

  // Top Rated: 3+ received reviews for Top 3 / Top 10 only. Community has
  // no review minimum and retains qualified members who finish outside Top 10.
  // Sessions and Credits keep their existing unrestricted ranking behavior.
  const rankedSections = useMemo(() => {
    if (tab !== 'ratings') {
      return { featured: sorted.slice(0, 10), community: sorted.slice(10) };
    }
    const featured = sorted.filter(u => Number(u.totalReviews) >= MIN_TOP_RATED_REVIEWS).slice(0, 10);
    const featuredIds = new Set(featured.map(u => u.id));
    return { featured, community: sorted.filter(u => !featuredIds.has(u.id)) };
  }, [sorted, tab]);

  // ── what to show per tab (only what is necessary)
  const meta = {
    ratings:  { Icon: Star,          color: '#f59e0b', fill: '#fbbf24', value: (u) => (u.avgRating > 0 ? String(u.avgRating) : '—'), sub: (u) => `${u.totalReviews} ${u.totalReviews === 1 ? 'review' : 'reviews'}` },
    sessions: { Icon: GraduationCap, color: '#0284c7', fill: 'none',    value: (u) => String(u.sessionsCompleted),                   sub: (u) => (u.avgRating > 0 ? `${u.avgRating} ★ rating` : 'No ratings yet') },
    credits:  { Icon: Coins,         color: '#059669', fill: 'none',    value: (u) => `${u.creditsBalance} CR`,                      sub: (u) => `${u.sessionsCompleted} sessions` },
  }[tab];

  const goProfile = (id) => navigation.navigate('PublicProfile', { id });

  const featuredIndex = rankedSections.featured.findIndex(u => u.id === currentUserId);
  const communityIndex = rankedSections.community.findIndex(u => u.id === currentUserId);
  const me = featuredIndex >= 0
    ? rankedSections.featured[featuredIndex]
    : (communityIndex >= 0 ? rankedSections.community[communityIndex] : null);
  const myRank = featuredIndex >= 0 ? `#${featuredIndex + 1}`
    : communityIndex >= 0 ? (tab === 'ratings' ? `C${communityIndex + 1}` : `#${communityIndex + 11}`)
    : null;
  const showMyRank = me && (featuredIndex > 2 || communityIndex >= 0);

  const podiumUsers = rankedSections.featured.slice(0, 3).map((u, i) => ({ user: u, rank: i + 1 }));
  const podiumOrder = [2, 1, 3].map(r => podiumUsers.find(p => p.rank === r)).filter(Boolean);
  const top4to10 = rankedSections.featured.slice(3, 10).map((u, i) => ({ type: 'member', user: u, rank: i + 4, isCommunity: false }));
  const community = rankedSections.community.map((u, i) => ({
    type: 'member', user: u, rank: tab === 'ratings' ? `C${i + 1}` : i + 11, isCommunity: true,
  }));
  const rest = [
    ...(top4to10.length ? [{ type: 'section', key: 'top10', title: 'Top 10' }] : []),
    ...top4to10,
    ...(community.length ? [{ type: 'section', key: 'community', title: 'Community Members' }] : []),
    ...community,
  ];

  if (loading) return <UserScreenSkeleton type="leaderboard" />;

  const Header = (
    <View>
      {error ? (
        <View style={s.empty}>
          <Trophy size={40} color={T.border} strokeWidth={1.5} />
          <Text style={s.emptyTitle}>Leaderboard unavailable</Text>
          <Text style={s.emptySub}>{error}</Text>
          <Pressable onPress={onRefresh} style={s.retryButton}>
            <Text style={s.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : sorted.length === 0 ? (
        <View style={s.empty}>
          <Trophy size={40} color={T.border} strokeWidth={1.5} />
          <Text style={s.emptyTitle}>No members yet</Text>
          <Text style={s.emptySub}>Check back after some sessions are completed.</Text>
        </View>
      ) : (
        <>
          {/* podium */}
          {podiumOrder.length > 0 ? <Reveal delay={90}><View style={s.podium}>
            {podiumOrder.map(({ user, rank }) => {
              const p = PODIUM[rank];
              return (
                <PressScale key={user.id} onPress={() => goProfile(user.id)} style={s.spot}>
                  {rank === 1 && <Crown size={22} color="#f59e0b" fill="#fcd34d" strokeWidth={1.6} style={{ marginBottom: 4 }} />}
                  <Avatar user={user} size={p.size} ring={p.ring} />
                  <Text style={s.podName} numberOfLines={1}>{user.full_name?.split(' ')[0] || 'User'}</Text>
                  <View style={s.podMetric}>
                    <meta.Icon size={14} color={meta.color} fill={meta.fill} strokeWidth={1.8} />
                    <Text style={s.podValue}>{meta.value(user)}</Text>
                  </View>
                  <View style={[s.pedestal, { height: p.ped }, rank === 1 && { backgroundColor: T.soft }]}>
                    <Text style={[s.pedNum, rank === 1 && { color: T.brand }]}>{rank}</Text>
                  </View>
                </PressScale>
              );
            })}
          </View></Reveal> : (
            <View style={s.noFeatured}>
              <Text style={s.emptySub}>Top Rated Top 10 requires at least 3 reviews.</Text>
            </View>
          )}

          {/* Your featured rank or Community position, never an unqualified Top 3 rank. */}
          {showMyRank && (
            <Pressable onPress={() => goProfile(me.id)} style={s.youRow}>
              <Text style={s.youLabel}>{tab === 'ratings' && communityIndex >= 0 ? 'Community position' : 'Your rank'}</Text>
              <Text style={s.youRank}>{myRank}</Text>
              <View style={{ flex: 1 }} />
              <meta.Icon size={15} color={meta.color} fill={meta.fill} strokeWidth={1.8} />
              <Text style={s.youValue}>{meta.value(me)}</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* tabs */}
      <View style={s.tabs}>
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={s.tab}>
              <Text style={[s.tabText, on && s.tabTextOn]}>{t.label}</Text>
              <View style={[s.tabBar, on && { backgroundColor: T.brand }]} />
            </Pressable>
          );
        })}
      </View>

      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 140 }}
        data={rest}
        keyExtractor={(item) => item.type === 'section' ? item.key : item.user.id}
        ListHeaderComponent={Header}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.brand} colors={[T.brand]} />}
        renderItem={({ item }) => {
          if (item.type === 'section') {
            return (
              <View style={s.sectionTitleRow}>
                <Text style={s.sectionTitle}>{item.title}</Text>
              </View>
            );
          }
          const { user, rank, isCommunity } = item;
          const isMe = user.id === currentUserId;
          const reviewCount = Number(user.totalReviews) || 0;
          const subText = tab === 'ratings' && isCommunity && reviewCount < MIN_TOP_RATED_REVIEWS
            ? `${reviewCount}/${MIN_TOP_RATED_REVIEWS} reviews for Top 10`
            : meta.sub(user);
          return (
            <Pressable onPress={() => goProfile(user.id)} style={({ pressed }) => [s.row, isMe && s.rowMe, pressed && { backgroundColor: T.strip }]}>
              <Text style={s.rank}>{rank}</Text>
              <Avatar user={user} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={s.name} numberOfLines={1}>{user.full_name || 'Anonymous'}{isMe ? '  (You)' : ''}</Text>
                <Text style={s.sub} numberOfLines={1}>{subText}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <meta.Icon size={15} color={meta.color} fill={meta.fill} strokeWidth={1.8} />
                <Text style={s.score}>{meta.value(user)}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', borderBottomWidth: 1, backgroundColor: '#F8FCF9', borderBottomColor: '#DAEDE1'},
  tab: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 15, fontWeight: '600', color: T.sub },
  tabTextOn: { color: '#047857', fontWeight: '800'},
  tabBar: { position: 'absolute', bottom: 0, width: 44, height: 3, borderRadius: 2, backgroundColor: 'transparent' },

  empty: { alignItems: 'center', paddingVertical: 80, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: T.text, marginTop: 12 },
  emptySub: { fontSize: 14, color: T.sub, marginTop: 4, textAlign: 'center' },
  retryButton: { marginTop: 16, backgroundColor: T.brand, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  noFeatured: { paddingHorizontal: 16, paddingVertical: 18, alignItems: 'center', backgroundColor: '#F2F9F5' },
  sectionTitleRow: { backgroundColor: '#F8FCF9', borderBottomWidth: 1, borderBottomColor: T.line, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 9 },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: T.sub, textTransform: 'uppercase', letterSpacing: 1 },

  podium: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, backgroundColor: '#F2F9F5', paddingTop: 26, paddingBottom: 13, borderBottomWidth: 1, borderBottomColor: '#DDEEE4'},
  spot: { flex: 1, alignItems: 'center' , paddingHorizontal: 2},
  podName: { fontSize: 15, fontWeight: '700', color: T.text, marginTop: 8, maxWidth: '92%' },
  podMetric: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, marginBottom: 10 },
  podValue: { fontSize: 13, fontWeight: '600', color: T.sub },
  pedestal: { width: '86%', alignItems: 'center', justifyContent: 'center' , borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: '#DBF2E4'},
  pedNum: { fontSize: 22, fontWeight: '700', color: T.sub, letterSpacing: -0.3 },

  youRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, borderTopWidth: 1, borderBottomWidth: 1, backgroundColor: '#E9F8F0', borderColor: '#CFE8D8', height: 57},
  youLabel: { fontSize: 13, fontWeight: '600', color: T.brand },
  youRank: { fontSize: 17, fontWeight: '700', color: T.text },
  youValue: { fontSize: 15, fontWeight: '700', color: T.text },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E7F0EA', backgroundColor: '#FFFFFF', minHeight: 69},
  rowMe: { backgroundColor: '#E8F7EF'},
  rank: { width: 32, textAlign: 'center', fontSize: 14, fontWeight: '700', color: T.sub },
  name: { fontSize: 15, color: T.text , fontWeight: '800', letterSpacing: -0.25},
  sub: { fontSize: 13, color: T.sub, marginTop: 1 },
  score: { fontSize: 15, color: '#08775B', fontWeight: '800'},
});