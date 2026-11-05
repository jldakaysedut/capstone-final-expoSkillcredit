import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import {
  View, Text, Image, Pressable, ScrollView, Modal, Linking, RefreshControl, Animated, StyleSheet,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CalendarDays, ChevronRight, ClipboardList, Clock3, ExternalLink, FolderOpen, Mail, Paperclip, SearchX, Star, X,
} from 'lucide-react-native';
import supabase from '../../supabaseClient';

// Compact X-style layout: cover + overlapping avatar, inline stats, underline tabs, hairline rows
const T = {
  text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4',
  brand: '#047857', soft: '#ecfdf5', strip: '#f7f9f9',
};

const DIMS = [
  { key: 'avgClarity', label: 'Clarity' },
  { key: 'avgPatience', label: 'Patience' },
  { key: 'avgRelevance', label: 'Relevance' },
  { key: 'avgProfessionalism', label: 'Professionalism' },
];
const TABS = ['Listings', 'Portfolio', 'Reviews'];

const Avatar = ({ uri, name, size }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: '#d1fae5', alignItems: 'center', justifyContent: 'center' }}>
    {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />
      : <Text style={{ fontWeight: '700', color: '#065f46', fontSize: size * 0.4 }}>{name?.charAt(0).toUpperCase() || '?'}</Text>}
  </View>
);

const Stars = ({ value, size = 13 }) => (
  <View style={{ flexDirection: 'row', gap: 1 }}>
    {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={size} strokeWidth={1.8} color={n <= value ? '#f59e0b' : T.border} fill={n <= value ? '#f59e0b' : 'none'} />)}
  </View>
);

const Skeleton = ({ style }) => {
  const o = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 1, duration: 750, useNativeDriver: true }),
      Animated.timing(o, { toValue: 0.55, duration: 750, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [o]);
  return <Animated.View style={[{ backgroundColor: T.line, borderRadius: 6, opacity: o }, style]} />;
};

const ProfileSkeleton = () => (
  <View style={{ flex: 1, backgroundColor: '#fff' }}>
    <View style={{ height: 104, backgroundColor: T.line }} />
    <View style={{ paddingHorizontal: 16 }}>
      <Skeleton style={{ width: 92, height: 92, borderRadius: 46, marginTop: -46, borderWidth: 4, borderColor: '#fff' }} />
      <Skeleton style={{ width: 160, height: 20, marginTop: 14 }} />
      <Skeleton style={{ width: 110, height: 13, marginTop: 8 }} />
      <Skeleton style={{ width: '100%', height: 13, marginTop: 18 }} />
      <Skeleton style={{ width: '70%', height: 13, marginTop: 8 }} />
    </View>
    {[0, 1, 2].map((i) => (
      <View key={i} style={s.row}>
        <Skeleton style={{ width: 64, height: 64, borderRadius: 12 }} />
        <View style={{ flex: 1, gap: 8 }}><Skeleton style={{ height: 14, width: '60%' }} /><Skeleton style={{ height: 12, width: '40%' }} /></View>
      </View>
    ))}
  </View>
);

const InfoItem = ({ Icon, text }) => (
  <View style={s.infoItem}>
    <Icon size={14} color={T.sub} strokeWidth={1.8} />
    <Text style={s.infoText} numberOfLines={1}>{text}</Text>
  </View>
);

const Empty = ({ Icon, title, sub }) => (
  <View style={s.empty}>
    <Icon size={40} color={T.border} strokeWidth={1.5} />
    <Text style={s.emptyTitle}>{title}</Text>
    <Text style={s.emptySub}>{sub}</Text>
  </View>
);

export default function PublicProfile() {
  const navigation = useNavigation();
  const { id } = useRoute().params;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [profile, setProfile] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [skills, setSkills] = useState([]);
  const [portfolio, setPortfolio] = useState([]);
  const [stats, setStats] = useState({ avgRating: 0, totalReviews: 0, sessionsTaught: 0, avgClarity: '0.0', avgPatience: '0.0', avgRelevance: '0.0', avgProfessionalism: '0.0' });
  const [tab, setTab] = useState('Listings');
  const [selected, setSelected] = useState(null);

  useLayoutEffect(() => { if (profile?.full_name) navigation.setOptions({ title: profile.full_name }); }, [navigation, profile?.full_name]);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id === id) { navigation.navigate('Profile'); return; }

    const [{ data: p, error }, { data: revData }, { count }, { data: skillsData }, { data: port }] = await Promise.all([
      supabase.from('user_profiles').select('*').eq('id', id).eq('is_deleted', false).single(),
      supabase.from('reviews').select('*').eq('instructor_id', id).order('created_at', { ascending: false }),
      supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('instructor_id', id).eq('status', 'completed'),
      supabase.from('skills').select('*').eq('instructor_id', id).eq('is_active', true).or('status.eq.approved,status.is.null').order('created_at', { ascending: false }),
      supabase.from('portfolio_items').select('*').eq('user_id', id).order('created_at', { ascending: false }),
    ]);
    if (error || !p) { setNotFound(true); return; }
    setNotFound(false);
    setProfile({
      full_name: p.full_name || 'Anonymous User', bio: p.bio || '', avatar_url: p.avatar_url || '', role: p.role || 'Member',
      credits_balance: p.credits_balance || 0, created_at: p.created_at || new Date().toISOString(),
      availability_schedule: p.availability_schedule || '', contact_info: p.contact_info || '',
    });

    // overall = average of rating + 4 questions, same as Leaderboard and your own Profile
    const list = revData || [];
    let total = 0, c = 0, pa = 0, r = 0, pr = 0;
    list.forEach((x) => {
      const q1 = Number(x.q1_clarity || 0), q2 = Number(x.q2_patience || 0), q3 = Number(x.q3_relevance || 0), q4 = Number(x.q4_professionalism || 0);
      total += (Number(x.rating || 0) + q1 + q2 + q3 + q4) / 5;
      c += q1; pa += q2; r += q3; pr += q4;
    });
    const n = list.length;
    setStats({
      avgRating: n ? parseFloat((total / n).toFixed(1)) : 0, totalReviews: n, sessionsTaught: count || 0,
      avgClarity: n ? (c / n).toFixed(1) : '0.0', avgPatience: n ? (pa / n).toFixed(1) : '0.0',
      avgRelevance: n ? (r / n).toFixed(1) : '0.0', avgProfessionalism: n ? (pr / n).toFixed(1) : '0.0',
    });

    if (n) {
      const sIds = [...new Set(list.map((x) => x.student_id).filter(Boolean))];
      const kIds = [...new Set(list.map((x) => x.skill_id).filter(Boolean))];
      const [{ data: studs }, { data: skls }] = await Promise.all([
        sIds.length ? supabase.from('user_profiles').select('id,full_name,avatar_url').in('id', sIds) : { data: [] },
        kIds.length ? supabase.from('skills').select('id,title').in('id', kIds) : { data: [] },
      ]);
      const sm = Object.fromEntries((studs || []).map((x) => [x.id, x]));
      const km = Object.fromEntries((skls || []).map((x) => [x.id, x]));
      setReviews(list.map((x) => ({ ...x, student: sm[x.student_id], skill: km[x.skill_id] })));
    } else setReviews([]);

    setSkills(skillsData || []);
    setPortfolio(port || []);
  }, [id, navigation]);

  useEffect(() => {
    let disposed = false;
    (async () => { setLoading(true); await load(); if (!disposed) setLoading(false); })();
    return () => { disposed = true; };
  }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (loading) return <ProfileSkeleton />;

  if (notFound || !profile) {
    return (
      <View style={s.center}>
        <SearchX size={40} color={T.border} strokeWidth={1.5} />
        <Text style={s.emptyTitle}>User not found</Text>
        <Text style={s.emptySub}>This profile doesn't exist or was deactivated.</Text>
        <Pressable onPress={() => navigation.goBack()} style={s.cta}><Text style={s.ctaText}>Go back</Text></Pressable>
      </View>
    );
  }

  const joined = new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const counts = { Listings: skills.length, Portfolio: portfolio.length, Reviews: reviews.length };
  const fmt = (d, o) => new Date(d).toLocaleDateString('en-US', o);

  return (
    <>
      <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.brand} colors={[T.brand]} />}>

        {/* 0 · cover, identity, stats */}
        <View>
          <View style={s.cover} />
          <View style={s.head}>
            <View style={s.idRow}>
              <View style={s.avatarRing}><Avatar uri={profile.avatar_url} name={profile.full_name} size={84} /></View>
            </View>

            <Text style={s.name} numberOfLines={2}>{profile.full_name}</Text>
            <View style={s.joinedRow}>
              <CalendarDays size={14} color={T.sub} strokeWidth={1.8} />
              <Text style={s.handle}>Joined {joined}</Text>
            </View>

            <Text style={s.bio}>{profile.bio || 'This member has not added a bio yet.'}</Text>

            {(!!profile.availability_schedule || !!profile.contact_info) && (
              <View style={s.infoWrap}>
                {!!profile.availability_schedule && <InfoItem Icon={Clock3} text={profile.availability_schedule} />}
                {!!profile.contact_info && <InfoItem Icon={Mail} text={profile.contact_info} />}
              </View>
            )}

            <View style={s.stats}>
              <Text style={s.statLabel}><Text style={s.statNum}>{profile.credits_balance}</Text> Credits</Text>
              <Text style={s.statLabel}><Text style={s.statNum}>{stats.sessionsTaught}</Text> Sessions</Text>
              <Text style={s.statLabel}><Text style={s.statNum}>{skills.length}</Text> Listings</Text>
              <View style={s.ratingInline}>
                <Star size={14} color="#f59e0b" fill="#f59e0b" strokeWidth={1.8} />
                <Text style={s.statNum}>{stats.avgRating > 0 ? stats.avgRating.toFixed(1) : '0.0'}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* 1 · sticky tabs (row lives one level inside the sticky container) */}
        <View style={s.tabsSticky}>
          <View style={s.tabs}>
            {TABS.map((t) => {
              const on = tab === t;
              return (
                <Pressable key={t} onPress={() => setTab(t)} style={s.tab}>
                  <View style={s.tabInner}>
                    <Text style={[s.tabText, on && s.tabTextOn]}>{t}</Text>
                    <Text style={[s.tabCount, on && { color: T.text }]}>{counts[t]}</Text>
                  </View>
                  <View style={[s.tabBar, on && { backgroundColor: T.brand }]} />
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 2 · content */}
        <View>
          {tab === 'Listings' && (skills.length === 0
            ? <Empty Icon={ClipboardList} title="No listings yet" sub="This member has not shared any skills." />
            : skills.map((k) => (
              <Pressable key={k.id} onPress={() => navigation.navigate('SkillDetails', { id: k.id })} style={({ pressed }) => [s.row, pressed && { backgroundColor: T.strip }]}>
                <View style={s.thumb}>{k.cover_image_url ? <Image source={{ uri: k.cover_image_url }} style={s.fill} /> : <ClipboardList size={22} color={T.border} strokeWidth={1.6} />}</View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>{k.title}</Text>
                  <Text style={s.rowSub} numberOfLines={1}>{[k.category, k.format].filter(Boolean).join(' · ') || 'Skill'}</Text>
                  <Text style={s.price}>{k.credit_cost} cr · {k.mode || 'Online'}</Text>
                </View>
                <ChevronRight size={18} color={T.border} />
              </Pressable>
            )))}

          {tab === 'Portfolio' && (portfolio.length === 0
            ? <Empty Icon={FolderOpen} title="No portfolio items yet" sub="This member has not showcased any work." />
            : portfolio.map((p) => (
              <Pressable key={p.id} onPress={() => setSelected(p)} style={({ pressed }) => [s.row, pressed && { backgroundColor: T.strip }]}>
                <View style={s.thumb}>{p.image_url ? <Image source={{ uri: p.image_url }} style={s.fill} /> : <FolderOpen size={22} color={T.border} strokeWidth={1.6} />}</View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>{p.project_title}</Text>
                  <Text style={s.rowSub} numberOfLines={2}>{p.project_description || 'No description.'}</Text>
                </View>
                <ChevronRight size={18} color={T.border} />
              </Pressable>
            )))}

          {tab === 'Reviews' && (
            <View>
              {stats.totalReviews > 0 && (
                <View style={s.summary}>
                  <View style={s.ratingCol}>
                    <Text style={s.bigRating}>{stats.avgRating.toFixed(1)}</Text>
                    <Stars value={Math.round(stats.avgRating)} size={14} />
                    <Text style={s.rowSub}>{stats.totalReviews} {stats.totalReviews === 1 ? 'review' : 'reviews'}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 10 }}>
                    {DIMS.map((d) => (
                      <View key={d.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={s.dimLbl} numberOfLines={1}>{d.label}</Text>
                        <View style={s.bar}><View style={[s.barFill, { width: `${(Number(stats[d.key]) / 5) * 100}%` }]} /></View>
                        <Text style={s.dimVal}>{stats[d.key]}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {reviews.length === 0
                ? <Empty Icon={Star} title="No reviews yet" sub="Be the first to book a session with this member." />
                : reviews.map((r) => (
                  <View key={r.id} style={s.review}>
                    <Pressable onPress={() => navigation.push('PublicProfile', { id: r.student_id })}>
                      <Avatar uri={r.student?.avatar_url} name={r.student?.full_name || 'A'} size={40} />
                    </Pressable>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={s.rowTitle} numberOfLines={1}>{r.student?.full_name || 'Anonymous'}</Text>
                        <View style={{ flex: 1 }} />
                        <Text style={s.rowSub}>{fmt(r.created_at, { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
                        <Stars value={r.rating} />
                        <Text style={[s.rowSub, { flex: 1, marginTop: 0 }]} numberOfLines={1}>{r.skill?.title || 'Skill session'}</Text>
                      </View>
                      {!!r.feedback && <Text style={s.reviewText}>{r.feedback}</Text>}
                    </View>
                  </View>
                ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* project detail sheet */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)} statusBarTranslucent>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelected(null)}><View style={s.overlay} /></Pressable>
          <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={s.grabber} />
            {selected && (
              <>
                <View style={s.sheetHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.sheetTitle} numberOfLines={2}>{selected.project_title}</Text>
                    <Text style={s.sheetSub}>{fmt(selected.created_at, { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
                  </View>
                  <Pressable onPress={() => setSelected(null)} hitSlop={10} style={s.closeBtn}><X size={18} color={T.text} /></Pressable>
                </View>
                <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ padding: 16 }}>
                  {!!selected.image_url && <Image source={{ uri: selected.image_url }} style={s.detailImg} />}
                  <Text style={s.body}>{selected.project_description || 'No description provided.'}</Text>
                  {!!selected.project_url && (
                    <Pressable onPress={() => Linking.openURL(selected.project_url)} style={s.link}><ExternalLink size={15} color={T.brand} strokeWidth={1.8} /><Text style={s.linkText}>View project</Text></Pressable>
                  )}
                  {selected.attachments?.length > 0 && (
                    <View style={{ marginTop: 16 }}>
                      <Text style={s.fieldLabel}>Attachments</Text>
                      {selected.attachments.map((a, i) => (
                        <Pressable key={i} onPress={() => Linking.openURL(a.url)} style={s.fileRow}>
                          <Paperclip size={15} color={T.sub} strokeWidth={1.8} /><Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: T.text }} numberOfLines={1}>{a.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 32 },
  fill: { width: '100%', height: '100%' },

  // cover + identity
  cover: { height: 104, backgroundColor: T.border },
  head: { paddingHorizontal: 16 },
  idRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: -44 },
  avatarRing: { padding: 4, marginLeft: -4, borderRadius: 50, backgroundColor: '#fff' },
  name: { fontSize: 20, fontWeight: '700', color: T.text, letterSpacing: -0.3, marginTop: 10 },
  joinedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  handle: { fontSize: 14, lineHeight: 18, color: T.sub },
  bio: { fontSize: 15, lineHeight: 21, color: T.text, marginTop: 12 },
  infoWrap: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6, marginTop: 12 },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
  infoText: { fontSize: 13, lineHeight: 18, color: T.sub, flexShrink: 1 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, rowGap: 4, marginTop: 12, paddingBottom: 14 },
  statLabel: { fontSize: 14, color: T.sub },
  statNum: { fontSize: 14, fontWeight: '700', color: T.text },
  ratingInline: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  // tabs
  tabsSticky: { backgroundColor: '#fff' },
  tabs: { flexDirection: 'row', alignItems: 'stretch', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: T.line, borderTopWidth: 1, borderTopColor: T.line },
  tab: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' },
  tabInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabText: { fontSize: 15, fontWeight: '600', color: T.sub },
  tabTextOn: { fontWeight: '700', color: T.text },
  tabCount: { fontSize: 13, color: T.sub },
  tabBar: { position: 'absolute', bottom: 0, width: 44, height: 3, borderRadius: 2, backgroundColor: 'transparent' },

  // rows
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.line },
  thumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: T.field, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  rowTitle: { flexShrink: 1, fontSize: 15, fontWeight: '700', color: T.text },
  rowSub: { fontSize: 13, color: T.sub, marginTop: 1 },
  price: { fontSize: 14, fontWeight: '700', color: T.brand, marginTop: 3 },

  // reviews
  summary: { flexDirection: 'row', alignItems: 'center', gap: 20, paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: T.line },
  ratingCol: { alignItems: 'center', gap: 4, minWidth: 84 },
  bigRating: { fontSize: 30, fontWeight: '700', color: T.text, letterSpacing: -0.5 },
  dimLbl: { width: 88, fontSize: 13, color: T.sub },
  dimVal: { width: 26, textAlign: 'right', fontSize: 13, fontWeight: '700', color: T.text },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: T.line, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2, backgroundColor: T.brand },
  review: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.line },
  reviewText: { fontSize: 15, lineHeight: 21, color: T.text, marginTop: 6 },

  // empty / not found
  empty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: T.text, marginTop: 12 },
  emptySub: { fontSize: 14, color: T.sub, marginTop: 4, textAlign: 'center' },
  cta: { height: 44, paddingHorizontal: 24, borderRadius: 22, backgroundColor: T.brand, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  ctaText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // sheet
  overlay: { flex: 1, backgroundColor: 'rgba(15,20,25,0.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: T.border, marginTop: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.line },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2 },
  sheetSub: { fontSize: 13, color: T.sub, marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: T.sub, marginBottom: 8 },
  detailImg: { width: '100%', height: 190, borderRadius: 12, marginBottom: 14, backgroundColor: T.field },
  body: { fontSize: 15, lineHeight: 21, color: T.text },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 14 },
  linkText: { fontSize: 15, fontWeight: '600', color: T.brand },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, backgroundColor: T.strip, borderWidth: 1, borderColor: T.line, borderRadius: 12, paddingHorizontal: 12, height: 44 },
});