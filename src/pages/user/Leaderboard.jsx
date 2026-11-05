import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, Image, Pressable, FlatList, RefreshControl, ActivityIndicator, AppState, StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Star, GraduationCap, Coins, Crown, Trophy } from 'lucide-react-native';
import supabase from '../../supabaseClient';

// Compact X-style layout: underline tabs, hairline rows, 15px names, 13px details
const T = {
  text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4',
  brand: '#047857', soft: '#ecfdf5', strip: '#f7f9f9',
};

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
  const [currentUserId, setCurrentUserId] = useState(null);
  const debounceRef = useRef(null);

  // ── same ranking data as the web
  const load = async () => {
    try {
      const [{ data: usersData }, { data: reviewsData }, { data: sessionsData }] = await Promise.all([
        supabase.from('user_profiles').select('id,full_name,avatar_url,bio,role,credits_balance').eq('is_deleted', false),
        supabase.from('reviews').select('instructor_id,rating,q1_clarity,q2_patience,q3_relevance,q4_professionalism'),
        supabase.from('sessions').select('instructor_id,status'),
      ]);

      const reviewMap = {};
      reviewsData?.forEach((rev) => {
        if (!reviewMap[rev.instructor_id]) reviewMap[rev.instructor_id] = { sum: 0, count: 0 };
        const avg5 = ([rev.rating, rev.q1_clarity, rev.q2_patience, rev.q3_relevance, rev.q4_professionalism]
          .map(Number).reduce((a, b) => a + b, 0)) / 5;
        reviewMap[rev.instructor_id].sum += avg5;
        reviewMap[rev.instructor_id].count++;
      });

      const sessionMap = {};
      sessionsData?.forEach((sess) => {
        if (sess.status === 'completed') sessionMap[sess.instructor_id] = (sessionMap[sess.instructor_id] || 0) + 1;
      });

      const processed = (usersData || []).map((u) => {
        const r = reviewMap[u.id] || { sum: 0, count: 0 };
        const avg = r.count > 0 ? parseFloat((r.sum / r.count).toFixed(1)) : 0;
        return {
          ...u, avgRating: avg, totalReviews: r.count,
          sessionsCompleted: sessionMap[u.id] || 0, creditsBalance: Number(u.credits_balance || 0),
        };
      });
      setProfiles(processed);
    } catch (e) { console.error(e); }
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
    if (tab === 'ratings')  list.sort((a, b) => b.avgRating - a.avgRating || b.totalReviews - a.totalReviews);
    if (tab === 'sessions') list.sort((a, b) => b.sessionsCompleted - a.sessionsCompleted || b.avgRating - a.avgRating);
    if (tab === 'credits')  list.sort((a, b) => b.creditsBalance - a.creditsBalance);
    return list;
  }, [profiles, tab]);

  // ── what to show per tab (only what is necessary)
  const meta = {
    ratings:  { Icon: Star,          color: '#f59e0b', fill: '#fbbf24', value: (u) => (u.avgRating > 0 ? String(u.avgRating) : '—'), sub: (u) => `${u.totalReviews} ${u.totalReviews === 1 ? 'review' : 'reviews'}` },
    sessions: { Icon: GraduationCap, color: '#0284c7', fill: 'none',    value: (u) => String(u.sessionsCompleted),                   sub: (u) => (u.avgRating > 0 ? `${u.avgRating} ★ rating` : 'No ratings yet') },
    credits:  { Icon: Coins,         color: '#059669', fill: 'none',    value: (u) => `${u.creditsBalance} CR`,                      sub: (u) => `${u.sessionsCompleted} sessions` },
  }[tab];

  const goProfile = (id) => navigation.navigate('PublicProfile', { id });

  const myIndex = sorted.findIndex((u) => u.id === currentUserId);
  const me = myIndex >= 0 ? sorted[myIndex] : null;
  const myRank = myIndex + 1;

  const podiumUsers = sorted.slice(0, 3).map((u, i) => ({ user: u, rank: i + 1 }));
  const podiumOrder = [2, 1, 3].map((r) => podiumUsers.find((p) => p.rank === r)).filter(Boolean);
  const rest = sorted.slice(3).map((u, i) => ({ user: u, rank: i + 4 }));

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color={T.brand} />
      </View>
    );
  }

  const Header = (
    <View>
      {sorted.length === 0 ? (
        <View style={s.empty}>
          <Trophy size={40} color={T.border} strokeWidth={1.5} />
          <Text style={s.emptyTitle}>No members yet</Text>
          <Text style={s.emptySub}>Check back after some sessions are completed.</Text>
        </View>
      ) : (
        <>
          {/* podium */}
          <View style={s.podium}>
            {podiumOrder.map(({ user, rank }) => {
              const p = PODIUM[rank];
              return (
                <Pressable key={user.id} onPress={() => goProfile(user.id)} style={s.spot}>
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
                </Pressable>
              );
            })}
          </View>

          {/* your rank (only when you are outside the podium) */}
          {me && myRank > 3 && (
            <Pressable onPress={() => goProfile(me.id)} style={s.youRow}>
              <Text style={s.youLabel}>Your rank</Text>
              <Text style={s.youRank}>#{myRank}</Text>
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
        keyExtractor={(item) => item.user.id}
        ListHeaderComponent={Header}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.brand} colors={[T.brand]} />}
        renderItem={({ item: { user, rank } }) => {
          const isMe = user.id === currentUserId;
          return (
            <Pressable onPress={() => goProfile(user.id)} style={({ pressed }) => [s.row, isMe && s.rowMe, pressed && { backgroundColor: T.strip }]}>
              <Text style={s.rank}>{rank}</Text>
              <Avatar user={user} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={s.name} numberOfLines={1}>{user.full_name || 'Anonymous'}{isMe ? '  (You)' : ''}</Text>
                <Text style={s.sub} numberOfLines={1}>{meta.sub(user)}</Text>
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
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: T.line, backgroundColor: '#fff' },
  tab: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 15, fontWeight: '600', color: T.sub },
  tabTextOn: { fontWeight: '700', color: T.text },
  tabBar: { position: 'absolute', bottom: 0, width: 44, height: 3, borderRadius: 2, backgroundColor: 'transparent' },

  empty: { alignItems: 'center', paddingVertical: 80, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: T.text, marginTop: 12 },
  emptySub: { fontSize: 14, color: T.sub, marginTop: 4, textAlign: 'center' },

  podium: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingTop: 20 },
  spot: { flex: 1, alignItems: 'center' },
  podName: { fontSize: 15, fontWeight: '700', color: T.text, marginTop: 8, maxWidth: '92%' },
  podMetric: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, marginBottom: 10 },
  podValue: { fontSize: 13, fontWeight: '600', color: T.sub },
  pedestal: { width: '86%', borderTopLeftRadius: 12, borderTopRightRadius: 12, backgroundColor: T.line, alignItems: 'center', justifyContent: 'center' },
  pedNum: { fontSize: 22, fontWeight: '700', color: T.sub, letterSpacing: -0.3 },

  youRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, height: 52, backgroundColor: T.soft, borderTopWidth: 1, borderBottomWidth: 1, borderColor: T.line },
  youLabel: { fontSize: 13, fontWeight: '600', color: T.brand },
  youRank: { fontSize: 17, fontWeight: '700', color: T.text },
  youValue: { fontSize: 15, fontWeight: '700', color: T.text },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.line },
  rowMe: { backgroundColor: T.soft },
  rank: { width: 26, textAlign: 'center', fontSize: 15, fontWeight: '700', color: T.sub },
  name: { fontSize: 15, fontWeight: '700', color: T.text },
  sub: { fontSize: 13, color: T.sub, marginTop: 1 },
  score: { fontSize: 15, fontWeight: '700', color: T.text },
});