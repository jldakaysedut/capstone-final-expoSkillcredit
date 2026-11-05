import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, Image, Pressable, ScrollView, RefreshControl, Alert, Animated, StyleSheet,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import {
  ArrowLeft, BookOpen, Briefcase, ChefHat, ChevronDown, CircleHelp, ClipboardList, Code2, Coins, Dumbbell,
  ExternalLink, Film, Gamepad2, Hammer, Leaf, MessageCircle, Monitor, Music2, Palette, PenLine, Scissors,
  Star, Tag, Trash2, Wrench, Zap,
} from 'lucide-react-native';
import supabase from '../../supabaseClient';

// Compact X-style layout: summary line, underline filter tabs, hairline rows that expand in place
const T = {
  text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4',
  brand: '#047857', soft: '#ecfdf5', strip: '#f7f9f9', danger: '#e11d48', amber: '#d97706',
};

const CATEGORIES = [
  { name: 'Cooking & Baking',      icon: ChefHat,       color: '#f97316' },
  { name: 'Gardening & Farming',   icon: Leaf,          color: '#16a34a' },
  { name: 'Home & DIY',            icon: Hammer,        color: '#ca8a04' },
  { name: 'Health & Fitness',      icon: Dumbbell,      color: '#ef4444' },
  { name: 'Beauty & Grooming',     icon: Scissors,      color: '#ec4899' },
  { name: 'Gaming & Hobbies',      icon: Gamepad2,      color: '#8b5cf6' },
  { name: 'Electronics & Repair',  icon: Wrench,        color: '#3b82f6' },
  { name: 'Electronics, Appliance & Basic Repair', icon: Wrench, color: '#3b82f6' },
  { name: 'School & Tutoring',     icon: BookOpen,      color: '#6366f1' },
  { name: 'Writing & Content',     icon: PenLine,       color: '#14b8a6' },
  { name: 'Languages & Speaking',  icon: MessageCircle, color: '#06b6d4' },
  { name: 'Singing & Instruments', icon: Music2,        color: '#d946ef' },
  { name: 'Art & Graphic Design',  icon: Palette,       color: '#f43f5e' },
  { name: 'Video & Animation',     icon: Film,          color: '#f59e0b' },
  { name: 'Business & Freelance',  icon: Briefcase,     color: '#475569' },
  { name: 'Financial Literacy',    icon: Coins,         color: '#059669' },
  { name: 'Financial Literacy & Money Management', icon: Coins, color: '#059669' },
  { name: 'UI/UX Design',          icon: Monitor,       color: '#0ea5e9' },
  { name: 'Coding & Tech',         icon: Code2,         color: '#65a30d' },
];
const catInfo = (n) => CATEGORIES.find((c) => c.name === n) ?? { icon: Tag, color: '#6b7280' };

function timeAgo(d) {
  const days = Math.floor((Date.now() - new Date(d)) / 86400000);
  if (days < 1) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

const confirmAsync = (title, msg, okText = 'Remove') => new Promise((res) =>
  Alert.alert(title, msg, [
    { text: 'Cancel', style: 'cancel', onPress: () => res(false) },
    { text: okText, style: 'destructive', onPress: () => res(true) },
  ], { onDismiss: () => res(false) }));

function QBar({ label, value }) {
  const pct = value ? Math.round((value / 5) * 100) : 0;
  const col = pct >= 80 ? '#34d399' : pct >= 50 ? '#fbbf24' : value ? '#fb7185' : T.line;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text style={s.qLabel} numberOfLines={1}>{label}</Text>
      <View style={s.qTrack}>{!!value && <View style={{ width: `${pct}%`, height: '100%', borderRadius: 2, backgroundColor: col }} />}</View>
      <Text style={s.qValue}>{value ? value.toFixed(1) : '—'}</Text>
    </View>
  );
}

function Skeleton({ style }) {
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
}

function SkeletonRow() {
  return (
    <View style={s.row}>
      <Skeleton style={{ width: 56, height: 56, borderRadius: 12 }} />
      <View style={{ flex: 1, gap: 9 }}>
        <Skeleton style={{ height: 14, width: '60%' }} />
        <Skeleton style={{ height: 12, width: '45%' }} />
        <Skeleton style={{ height: 12, width: '70%' }} />
      </View>
    </View>
  );
}

function ListingRow({ skill, expanded, onToggle, onView, onDelete, currentFilter, highlighted, onLayout }) {
  const cat = catInfo(skill.category);
  const CategoryIcon = cat.icon;
  const isNew = skill.totalReviews === 0;
  const needsAct = skill.pendingSessions > 0 || skill.unratedSessions > 0;
  const compPct = skill.totalSessions > 0 ? Math.round((skill.completedSessions / skill.totalSessions) * 100) : 0;
  const showTag = needsAct && !(currentFilter === 'all' && skill.unratedSessions > 0 && skill.pendingSessions === 0);

  const metrics = [
    `${skill.credit_cost} cr/hr`,
    `${skill.totalSessions} ${skill.totalSessions === 1 ? 'session' : 'sessions'}`,
    isNew ? null : `★ ${skill.avgRating}`,
    skill.totalSessions > 0 ? `${compPct}% done` : null,
  ].filter(Boolean).join(' · ');

  const breakdown = [
    { label: 'Pending',   count: skill.pendingSessions,   dot: '#fbbf24' },
    { label: 'Active',    count: skill.activeSessions,    dot: '#34d399' },
    { label: 'Upcoming',  count: skill.upcomingSessions,  dot: '#38bdf8' },
    { label: 'Confirmed', count: skill.confirmedSessions, dot: '#2dd4bf' },
    { label: 'Completed', count: skill.completedSessions, dot: '#6b7280' },
    { label: 'Cancelled', count: skill.cancelledSessions, dot: T.border },
  ].filter((x) => x.count > 0);

  return (
    <Pressable
      onPress={() => onToggle(skill.id)}
      onLayout={onLayout}
      style={[s.row, { borderLeftWidth: 3, borderLeftColor: needsAct ? '#f59e0b' : 'transparent', paddingLeft: 13 }, highlighted && s.rowHi]}
    >
      <View style={[s.thumb, { backgroundColor: cat.color + '1a' }]}>
        {skill.cover_image_url
          ? <Image source={{ uri: skill.cover_image_url }} style={{ width: '100%', height: '100%' }} />
          : <CategoryIcon size={24} color={cat.color} strokeWidth={1.8} />}
        {needsAct && <View style={s.zapBadge}><Zap size={10} color="#fff" fill="#fff" /></View>}
      </View>

      <View style={{ flex: 1 }}>
        <Text style={s.title} numberOfLines={2} onPress={() => onView(skill.id)}>{skill.title}</Text>

        {(isNew || skill.status === 'pending' || skill.status === 'rejected') && (
          <View style={s.badges}>
            {isNew && <Text style={[s.badge, { color: T.brand, backgroundColor: T.soft }]}>New</Text>}
            {skill.status === 'pending' && <Text style={[s.badge, { color: T.amber, backgroundColor: '#fffbeb' }]}>In review</Text>}
            {skill.status === 'rejected' && <Text style={[s.badge, { color: T.danger, backgroundColor: '#fff1f2' }]}>Rejected</Text>}
          </View>
        )}

        <Text style={s.meta} numberOfLines={1}>{[skill.category, skill.format, timeAgo(skill.created_at)].filter(Boolean).join(' · ')}</Text>
        <Text style={s.metrics} numberOfLines={1}>{metrics}</Text>

        {showTag && (
          <View style={s.tag}>
            <Zap size={13} color={T.amber} strokeWidth={2} />
            <Text style={s.tagText}>{skill.pendingSessions > 0 ? `${skill.pendingSessions} pending` : `${skill.unratedSessions} unrated`}</Text>
          </View>
        )}

        {expanded && (
          <View style={s.details}>
            <Text style={s.sectionLabel}>Session breakdown</Text>
            {breakdown.map((b) => (
              <View key={b.label} style={s.bRow}>
                <View style={[s.bDot, { backgroundColor: b.dot }]} />
                <Text style={s.bLabel}>{b.label}</Text>
                <Text style={s.bCount}>{b.count}</Text>
              </View>
            ))}
            {skill.totalSessions === 0 && <Text style={s.empty}>No sessions yet</Text>}

            <Text style={[s.sectionLabel, { marginTop: 16 }]}>Review quality</Text>
            <View style={{ gap: 9, marginTop: 2 }}>
              <QBar label="Clarity" value={skill.avgClarity} />
              <QBar label="Patience" value={skill.avgPatience} />
              <QBar label="Relevance" value={skill.avgRelevance} />
              <QBar label="Professionalism" value={skill.avgProfessionalism} />
            </View>
            {!skill.totalReviews && <Text style={[s.empty, { marginTop: 8 }]}>No reviews yet</Text>}

            {skill.status === 'rejected' && !!skill.rejection_reason && (
              <View style={s.note}>
                <Text style={s.noteTitle}>Moderator note (rejected)</Text>
                <Text style={s.noteText}>{skill.rejection_reason}</Text>
              </View>
            )}

            <Text style={[s.sectionLabel, { marginTop: 16 }]}>Earnings</Text>
            <Text style={s.earned}>{skill.totalEarned} <Text style={s.earnedUnit}>credits earned</Text></Text>
            {skill.unratedSessions > 0 && (
              <View style={[s.tag, { marginTop: 6 }]}>
                <CircleHelp size={14} color={T.danger} strokeWidth={2} />
                <Text style={[s.tagText, { color: T.danger }]}>{skill.unratedSessions} unrated session{skill.unratedSessions > 1 ? 's' : ''}</Text>
              </View>
            )}

            {!!skill.latestReview?.feedback && (
              <View style={s.quote}>
                <Text style={s.sectionLabel}>Latest review</Text>
                <Text style={s.quoteText} numberOfLines={3}>"{skill.latestReview.feedback}"</Text>
              </View>
            )}

            <View style={s.actions}>
              <Pressable onPress={() => onView(skill.id)} style={s.btnOutline}>
                <ExternalLink size={15} color={T.text} strokeWidth={1.8} /><Text style={s.btnOutlineText}>View listing</Text>
              </Pressable>
              <Pressable onPress={() => onDelete(skill.id)} style={s.btnDanger}>
                <Trash2 size={15} color={T.danger} strokeWidth={1.8} /><Text style={s.btnDangerText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      <ChevronDown size={18} color={T.sub} style={{ marginTop: 4, transform: [{ rotate: expanded ? '180deg' : '0deg' }] }} />
    </Pressable>
  );
}

// ─ Main Page ─────────────────────────────────────────────────────
export default function MyListings() {
  const navigation = useNavigation();
  const route = useRoute();
  const highlightParam = route.params?.highlight ? String(route.params.highlight) : null;
  const [highlightId, setHighlightId] = useState(null);

  const scrollRef = useRef(null);
  const listY = useRef(0);
  const rowYs = useRef({});
  const didLoad = useRef(false);

  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(new Set());
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({
    totalListings: 0, totalSessions: 0, totalEarned: 0,
    totalPending: 0, totalUnrated: 0, avgRating: 0, totalReviews: 0,
    totalActive: 0, totalCompleted: 0, totalCancelled: 0,
  });

  const fetchMyListings = async (silent = false) => {
    if (!silent) setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigation.navigate('Login'); return; }
    const { data: pData } = await supabase.from('user_profiles').select('full_name, credits_balance, avatar_url').eq('id', user.id).single();
    if (pData) setProfile(pData);

    const { data, error } = await supabase.from('skills').select(`
      id, title, category, format, duration, credit_cost, cover_image_url,
      description, portfolio_url, created_at, status, rejection_reason,
      reviews ( rating, feedback, created_at, q1_clarity, q2_patience, q3_relevance, q4_professionalism ),
      sessions ( id, status, credit_amount, student_completed, instructor_completed, is_rated )
    `).eq('instructor_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error || !data) { setLoading(false); return; }
    let gEarned = 0, gSess = 0, gPend = 0, gUnrated = 0, gRatingSum = 0, gRevCnt = 0, gActive = 0, gCompleted = 0, gCancelled = 0;
    const enriched = data.map((skill) => {
      const rv = skill.reviews || []; const ss = skill.sessions || []; const n = rv.length;
      const avg = (key) => n > 0 ? parseFloat((rv.reduce((a, r) => a + (Number(r[key]) || 0), 0) / n).toFixed(1)) : null;
      gRatingSum += rv.reduce((a, r) => a + (Number(r.rating) || 0), 0); gRevCnt += n;
      const byStatus = (st) => ss.filter((x) => x.status === st).length;
      const completed = ss.filter((x) => x.student_completed && x.instructor_completed);
      const earned = completed.reduce((a, x) => a + (x.credit_amount || 0), 0);
      const unrated = ss.filter((x) => x.student_completed && x.instructor_completed && !x.is_rated).length;
      const pending = byStatus('pending'); const active = byStatus('active'); const cancelled = byStatus('cancelled');
      gEarned += earned; gSess += ss.length; gPend += pending; gUnrated += unrated;
      gActive += active; gCompleted += completed.length; gCancelled += cancelled;
      return { ...skill, avgRating: n > 0 ? parseFloat((rv.reduce((a, r) => a + (Number(r.rating) || 0), 0) / n).toFixed(1)) : 0, totalReviews: n, avgClarity: avg('q1_clarity'), avgPatience: avg('q2_patience'), avgRelevance: avg('q3_relevance'), avgProfessionalism: avg('q4_professionalism'), latestReview: n > 0 ? [...rv].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] : null, totalSessions: ss.length, completedSessions: completed.length, pendingSessions: pending, activeSessions: active, upcomingSessions: byStatus('upcoming'), confirmedSessions: byStatus('confirmed'), cancelledSessions: cancelled, unratedSessions: unrated, totalEarned: earned };
    });
    setSkills(enriched);
    setStats({ totalListings: enriched.length, totalSessions: gSess, totalEarned: gEarned, totalPending: gPend, totalUnrated: gUnrated, avgRating: gRevCnt > 0 ? (gRatingSum / gRevCnt).toFixed(1) : 0, totalReviews: gRevCnt, totalActive: gActive, totalCompleted: gCompleted, totalCancelled: gCancelled });
    setLoading(false);
  };

  // load on first focus, and quietly again when you come back from Create/Edit (the screen stays mounted in the stack)
  useFocusEffect(useCallback(() => {
    fetchMyListings(didLoad.current);
    didLoad.current = true;
  }, []));

  const onRefresh = async () => { setRefreshing(true); await fetchMyListings(true); setRefreshing(false); };

  // highlight a listing (route param `highlight`, was ?highlight= on the web)
  useEffect(() => {
    if (!highlightParam || skills.length === 0) return undefined;
    setExpanded((prev) => new Set(prev).add(highlightParam));
    let t2;
    const t1 = setTimeout(() => {
      const y = rowYs.current[highlightParam];
      if (y != null) {
        scrollRef.current?.scrollTo({ y: Math.max(0, listY.current + y - 140), animated: true });
        setHighlightId(highlightParam);
        t2 = setTimeout(() => setHighlightId(null), 3000);
      }
    }, 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [highlightParam, skills]);

  const handleDelete = async (skillId) => {
    if (!(await confirmAsync('Remove listing?', 'Are you sure you want to remove this listing?'))) return;

    try {
      const { data: active } = await supabase
        .from('sessions')
        .select('id')
        .eq('skill_id', skillId)
        .in('status', ['pending', 'active', 'upcoming', 'confirmed']);

      if (active?.length > 0) {
        Alert.alert('Cannot delete', 'Cannot delete: This skill currently has active or pending sessions.');
        return;
      }

      const { error } = await supabase
        .from('skills')
        .update({ is_active: false })
        .eq('id', skillId);

      if (error) throw error;

      setSkills((p) => p.filter((x) => x.id !== skillId));
      Alert.alert('Done', 'Listing successfully removed.');

    } catch (error) {
      console.error('Error during deletion:', error);
      Alert.alert('Error', 'An error occurred while deleting the skill. Please try again.');
    }
  };

  const toggleExpand = (id) => setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const FILTERS = [
    { key: 'all',         label: 'All',        count: skills.length },
    { key: 'has_pending', label: 'Action',     count: skills.filter((x) => x.pendingSessions > 0 || x.unratedSessions > 0).length },
    { key: 'unrated',     label: 'Unrated',    count: skills.filter((x) => x.unratedSessions > 0).length },
    { key: 'no_reviews',  label: 'No reviews', count: skills.filter((x) => x.totalReviews === 0).length },
  ];
  const filtered = skills.filter((x) => {
    if (filter === 'has_pending') return x.pendingSessions > 0 || x.unratedSessions > 0;
    if (filter === 'unrated') return x.unratedSessions > 0;
    if (filter === 'no_reviews') return x.totalReviews === 0;
    return true;
  });

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: '#fff' }}
      contentContainerStyle={{ paddingBottom: 140 }}
      stickyHeaderIndices={[1]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.brand} colors={[T.brand]} />}
    >
      {/* 0 · summary */}
      <View style={s.summary}>
        <Text style={s.heading} numberOfLines={1}>
          {profile?.full_name ? `${profile.full_name.split(' ')[0]}'s listings` : 'My listings'}
        </Text>
        {loading ? (
          <Skeleton style={{ height: 14, width: 240, marginTop: 10 }} />
        ) : (
          <View style={s.statsLine}>
            <Text style={s.statLabel}><Text style={s.statNum}>{stats.totalListings}</Text> Listings</Text>
            <Text style={s.statLabel}><Text style={s.statNum}>{stats.totalSessions}</Text> Sessions</Text>
            <Text style={s.statLabel}><Text style={s.statNum}>{stats.totalEarned}</Text> CR earned</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Star size={14} color="#f59e0b" fill="#f59e0b" strokeWidth={1.8} />
              <Text style={s.statNum}>{stats.avgRating > 0 ? stats.avgRating : '—'}</Text>
              <Text style={s.statLabel}>({stats.totalReviews})</Text>
            </View>
          </View>
        )}
        {!loading && (stats.totalPending > 0 || stats.totalUnrated > 0) && (
          <View style={s.alertRow}>
            {stats.totalPending > 0 && (
              <Pressable onPress={() => setFilter('has_pending')} style={[s.alertChip, { borderColor: '#fde68a', backgroundColor: '#fffbeb' }]}>
                <Zap size={14} color={T.amber} strokeWidth={2} /><Text style={[s.alertText, { color: '#b45309' }]}>{stats.totalPending} pending</Text>
              </Pressable>
            )}
            {stats.totalUnrated > 0 && (
              <Pressable onPress={() => setFilter('unrated')} style={[s.alertChip, { borderColor: '#fecdd3', backgroundColor: '#fff1f2' }]}>
                <CircleHelp size={14} color={T.danger} strokeWidth={2} /><Text style={[s.alertText, { color: T.danger }]}>{stats.totalUnrated} unrated</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      {/* 1 · sticky filter tabs */}
      <View style={s.top}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabsRow}>
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <Pressable key={f.key} onPress={() => setFilter(f.key)} style={s.tab}>
                <View style={s.tabInner}>
                  <Text style={[s.tabText, on && s.tabTextOn]}>{f.label}</Text>
                  <Text style={[s.tabCount, on && { color: T.text }]}>{f.count}</Text>
                </View>
                <View style={[s.tabBar, on && { backgroundColor: T.brand }]} />
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* 2 · list */}
      <View onLayout={(e) => { listY.current = e.nativeEvent.layout.y; }}>
        {loading ? (
          [1, 2, 3].map((i) => <SkeletonRow key={i} />)
        ) : filtered.length === 0 ? (
          <View style={s.emptyWrap}>
            <ClipboardList size={40} color={T.border} strokeWidth={1.5} />
            <Text style={s.emptyTitle}>{filter === 'all' ? 'No listings yet' : 'No listings match this filter'}</Text>
            <Text style={s.emptySub}>{filter === 'all' ? 'Share your expertise with the community.' : 'Try switching to a different filter.'}</Text>
            {filter === 'all' ? (
              <Pressable onPress={() => navigation.navigate('CreateSkill')} style={s.cta}><Text style={s.ctaText}>Create first listing</Text></Pressable>
            ) : (
              <Pressable onPress={() => setFilter('all')} style={[s.cta, { backgroundColor: T.field, flexDirection: 'row', gap: 6 }]}>
                <ArrowLeft size={16} color={T.text} /><Text style={[s.ctaText, { color: T.text }]}>Back to all</Text>
              </Pressable>
            )}
          </View>
        ) : (
          filtered.map((skill) => (
            <ListingRow
              key={skill.id}
              skill={skill}
              expanded={expanded.has(skill.id)}
              onToggle={toggleExpand}
              onView={(id) => navigation.navigate('SkillDetails', { id })}
              onDelete={handleDelete}
              currentFilter={filter}
              highlighted={highlightId === String(skill.id)}
              onLayout={(e) => { rowYs.current[String(skill.id)] = e.nativeEvent.layout.y; }}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  // summary
  summary: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, backgroundColor: '#fff' },
  heading: { fontSize: 20, fontWeight: '700', color: T.text, letterSpacing: -0.3 },
  statsLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, rowGap: 4, marginTop: 8 },
  statLabel: { fontSize: 14, color: T.sub },
  statNum: { fontSize: 14, fontWeight: '700', color: T.text },
  alertRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  alertChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1 },
  alertText: { fontSize: 13, fontWeight: '700' },

  // sticky tabs (column container; the tab row is a ScrollView inside)
  top: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: T.line, borderBottomWidth: 1, borderBottomColor: T.line },
  tabsRow: { paddingHorizontal: 16, gap: 24 },
  tab: { height: 44, justifyContent: 'center' },
  tabInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabText: { fontSize: 15, fontWeight: '600', color: T.sub },
  tabTextOn: { fontWeight: '700', color: T.text },
  tabCount: { fontSize: 13, color: T.sub },
  tabBar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, borderRadius: 2, backgroundColor: 'transparent' },

  // rows
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.line, backgroundColor: '#fff' },
  rowHi: { backgroundColor: T.soft },
  thumb: { width: 56, height: 56, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  zapBadge: { position: 'absolute', top: 3, right: 3, width: 16, height: 16, borderRadius: 8, backgroundColor: '#f59e0b', borderWidth: 1.5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: T.text },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  badge: { fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  meta: { fontSize: 13, color: T.sub, marginTop: 3 },
  metrics: { fontSize: 13, fontWeight: '600', color: T.text, marginTop: 3 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  tagText: { fontSize: 13, fontWeight: '600', color: T.amber },

  // expanded
  details: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: T.line },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: T.sub, marginBottom: 8 },
  bRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  bDot: { width: 8, height: 8, borderRadius: 4 },
  bLabel: { flex: 1, fontSize: 14, color: T.text },
  bCount: { fontSize: 14, fontWeight: '700', color: T.text },
  empty: { fontSize: 13, color: T.sub },
  qLabel: { width: 96, fontSize: 13, color: T.sub },
  qTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: T.line, overflow: 'hidden' },
  qValue: { width: 28, textAlign: 'right', fontSize: 13, fontWeight: '700', color: T.text },
  note: { marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: '#fff1f2' },
  noteTitle: { fontSize: 13, fontWeight: '700', color: T.danger, marginBottom: 3 },
  noteText: { fontSize: 14, lineHeight: 20, color: '#9f1239' },
  earned: { fontSize: 22, fontWeight: '700', color: T.text, letterSpacing: -0.3 },
  earnedUnit: { fontSize: 13, fontWeight: '500', color: T.sub },
  quote: { marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: T.strip },
  quoteText: { fontSize: 14, lineHeight: 20, color: T.text },
  actions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  btnOutline: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: T.border, backgroundColor: '#fff' },
  btnOutlineText: { fontSize: 14, fontWeight: '700', color: T.text },
  btnDanger: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: '#fff1f2' },
  btnDangerText: { fontSize: 14, fontWeight: '700', color: T.danger },

  // empty
  emptyWrap: { alignItems: 'center', paddingVertical: 64, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: T.text, marginTop: 12, textAlign: 'center' },
  emptySub: { fontSize: 14, color: T.sub, marginTop: 4, textAlign: 'center' },
  cta: { height: 44, paddingHorizontal: 24, borderRadius: 22, backgroundColor: T.brand, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  ctaText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});