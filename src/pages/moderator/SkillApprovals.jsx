// ═══════════════════════════════════════════════════════════════
//  MOBILE APP (Expo React Native) — src/pages/moderator/SkillApprovals.jsx
//  Same query, metrics, tab filters and search as the web.
//  Mobile layout: filter chips (the web stat tabs), a search field and listing rows.
//  The whole row opens the review (web had a separate button), the refresh button
//  became pull-to-refresh, and the desktop column grid is gone.
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, Image, Pressable, FlatList, TextInput, RefreshControl, AppState, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, ClipboardCheck, FileImage, Search, X } from 'lucide-react-native';
import supabase from '../../supabaseClient';

const T = {
  text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4',
  brand: '#047857', soft: '#ecfdf5', strip: '#f7f9f9',
};

// status -> stripe / pill colors
const STATUS = {
  pending:  { stripe: '#fbbf24', bg: '#fffbeb', dot: '#f59e0b', fg: '#92400e' },
  approved: { stripe: '#10b981', bg: '#ecfdf5', dot: '#059669', fg: '#065f46' },
  rejected: { stripe: '#fb7185', bg: '#fff1f2', dot: '#f43f5e', fg: '#9f1239' },
};

export default function SkillApprovals() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [skills, setSkills] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'unassigned' | 'my_claims' | 'resolved' | 'all'
  const [searchQuery, setSearchQuery] = useState('');
  const lastFetch = useRef(0);

  // silent = background refresh (no skeleton / dimming)
  const fetchSkills = async (silent = false) => {
    if (!silent) setLoading(true);
    lastFetch.current = Date.now();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);

      // 🚨 FIX: Explicit relations to avoid Ambiguous Relationship error
      const { data, error } = await supabase
        .from('skills')
        .select(`
          id, title, category, format, credit_cost, cover_image_url, created_at, status, assigned_to,
          instructor:user_profiles!instructor_id(id, full_name),
          assignee:user_profiles!assigned_to(id, full_name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSkills(data || []);
    } catch (err) {
      console.error('Failed to load skill approvals:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSkills(); }, []);

  // coming back from a review (a decision may have been recorded), or back to the app -> quietly refresh
  useEffect(() => {
    const unsubFocus = navigation.addListener('focus', () => {
      if (Date.now() - lastFetch.current > 3000) fetchSkills(true);
    });
    const appSub = AppState.addEventListener('change', (state) => { if (state === 'active') fetchSkills(true); });
    return () => { unsubFocus(); appSub.remove(); };
  }, [navigation]);

  const onRefresh = async () => { setRefreshing(true); await fetchSkills(true); setRefreshing(false); };

  // Telemetry Calculations
  const metrics = useMemo(() => {
    const pendingList = skills.filter((s) => s.status === 'pending');
    const unassigned = pendingList.filter((s) => !s.assigned_to).length;
    const myClaims = pendingList.filter((s) => s.assigned_to === currentUserId).length;
    const resolvedCount = skills.filter((s) => s.status === 'approved' || s.status === 'rejected').length;

    return {
      pendingCount: pendingList.length,
      unassignedCount: unassigned,
      myClaimsCount: myClaims,
      resolvedCount,
    };
  }, [skills, currentUserId]);

  // Tab & Search Filtering
  const filteredSkills = useMemo(() => {
    return skills.filter((item) => {
      if (activeTab === 'pending' && item.status !== 'pending') return false;
      if (activeTab === 'unassigned' && (item.status !== 'pending' || item.assigned_to)) return false;
      if (activeTab === 'my_claims' && (item.status !== 'pending' || item.assigned_to !== currentUserId)) return false;
      if (activeTab === 'resolved' && (item.status === 'pending')) return false;

      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const titleMatch = item.title?.toLowerCase().includes(q);
        const catMatch = item.category?.toLowerCase().includes(q);
        const instructorMatch = item.instructor?.full_name?.toLowerCase().includes(q);
        const idMatch = item.id.toLowerCase().includes(q);

        return titleMatch || catMatch || instructorMatch || idMatch;
      }

      return true;
    });
  }, [skills, activeTab, searchQuery, currentUserId]);

  // ── Display-only: the five filter chips ──
  const tabs = [
    { id: 'pending',    label: 'All pending',      count: metrics.pendingCount },
    { id: 'unassigned', label: 'Unassigned',       count: metrics.unassignedCount },
    { id: 'my_claims',  label: 'My claims',        count: metrics.myClaimsCount },
    { id: 'resolved',   label: 'Resolved history', count: metrics.resolvedCount },
    { id: 'all',        label: 'All listings',     count: skills.length },
  ];
  const dim = loading ? { opacity: 0.3 } : null;

  const Header = (
    <View>
      <View style={s.pageHead}>
        <Text style={s.pageTitle}>Skill approvals</Text>
        <Text style={s.small}>Review, claim, and rule on new skill listings before they go live on the platform.</Text>
      </View>

      <FlatList
        horizontal
        data={tabs}
        keyExtractor={(t) => t.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chips}
        renderItem={({ item: tab }) => {
          const on = activeTab === tab.id;
          return (
            <Pressable onPress={() => setActiveTab(tab.id)} style={[s.chip, on && s.chipOn]} accessibilityState={{ selected: on }}>
              <Text style={[s.chipText, on && { color: '#fff' }]}>{tab.label}</Text>
              <Text style={[s.chipCount, on ? { color: '#d1fae5' } : { color: T.sub }, dim]}>{tab.count}</Text>
            </Pressable>
          );
        }}
      />

      <View style={s.searchWrap}>
        <Search size={17} color={T.sub} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by title, category, instructor, or ID"
          placeholderTextColor={T.sub}
          autoCapitalize="none"
          autoCorrect={false}
          style={s.searchInput}
          accessibilityLabel="Search listings"
        />
        {!!searchQuery && (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8} accessibilityLabel="Clear search"><X size={17} color={T.sub} /></Pressable>
        )}
      </View>
      {!loading && (
        <Text style={[s.small, { paddingHorizontal: 16, paddingBottom: 10 }]}>
          Showing <Text style={{ fontWeight: '700', color: T.text }}>{filteredSkills.length}</Text> of {skills.length} listings
        </Text>
      )}
    </View>
  );

  const renderItem = ({ item }) => {
    const isMine = item.assigned_to === currentUserId;
    const isPending = item.status === 'pending';
    const st = STATUS[item.status] || STATUS.rejected;

    return (
      <Pressable
        onPress={() => navigation.navigate('SkillReview', { id: item.id })}
        style={({ pressed }) => [s.row, pressed && { backgroundColor: T.strip }]}
      >
        <View style={[s.accent, { backgroundColor: st.stripe }]} />

        {/* skill */}
        <View style={s.topLine}>
          <View style={s.thumb}>
            {item.cover_image_url
              ? <Image source={{ uri: item.cover_image_url }} style={{ width: 52, height: 52 }} resizeMode="cover" />
              : <FileImage size={18} color={T.border} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={s.small} numberOfLines={1}>{item.category} / #{item.id.slice(0, 8)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.cost}>{item.credit_cost} CR</Text>
            <Text style={s.small} numberOfLines={1}>{item.format}</Text>
          </View>
        </View>

        {/* instructor + date */}
        <Text style={s.byLine} numberOfLines={1}>
          <Text style={s.small}>By </Text><Text style={s.name}>{item.instructor?.full_name || 'Unknown User'}</Text>
          <Text style={s.small}>  ·  {new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
        </Text>

        {/* assignment + status */}
        <View style={s.metaRow}>
          {item.assigned_to ? (
            isMine ? (
              <View style={[s.badge, { backgroundColor: T.soft, borderColor: '#a7f3d0' }]}>
                <Text style={[s.badgeText, { color: '#065f46' }]}>Assigned to You</Text>
              </View>
            ) : (
              <Text style={[s.name, { flexShrink: 1 }]} numberOfLines={1}>{item.assignee?.full_name || 'Another Mod'}</Text>
            )
          ) : (
            <View style={[s.badge, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
              <Text style={[s.badgeText, { color: '#92400e' }]}>Unassigned</Text>
            </View>
          )}

          <View style={{ flex: 1 }} />

          <View style={[s.pill, { backgroundColor: st.bg }]}>
            <View style={[s.pillDot, { backgroundColor: st.dot }]} />
            <Text style={[s.pillText, { color: st.fg }]}>{item.status}</Text>
          </View>
        </View>

        {/* action label (the row itself is the button) */}
        <View style={s.actionLine}>
          <Text style={[s.actionText, { color: isPending ? T.brand : T.sub }]}>{isPending ? 'Review skill' : 'View record'}</Text>
          <ChevronRight size={16} color={isPending ? T.brand : T.sub} />
        </View>
      </Pressable>
    );
  };

  const Empty = loading ? (
    <View>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={s.skelRow}>
          <View style={s.skelIcon} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={[s.skelBar, { width: '55%' }]} />
            <View style={[s.skelBar, { width: '30%' }]} />
          </View>
        </View>
      ))}
    </View>
  ) : (
    <View style={s.emptyWrap}>
      <View style={s.emptyIcon}><ClipboardCheck size={22} color={T.border} /></View>
      <Text style={[s.rowTitle, { marginTop: 12 }]}>Queue is clear</Text>
      <Text style={[s.small, { textAlign: 'center', marginTop: 4 }]}>
        {searchQuery ? 'No skills matched your search filter.' : 'There are no listings waiting for approval.'}
      </Text>
      {!!searchQuery && (
        <Pressable onPress={() => setSearchQuery('')} style={s.clearBtn}><Text style={s.clearBtnText}>Clear search</Text></Pressable>
      )}
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: '#fff' }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      data={loading ? [] : filteredSkills}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      ListHeaderComponent={Header}
      ListEmptyComponent={Empty}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.brand} colors={[T.brand]} />}
    />
  );
}

const s = StyleSheet.create({
  small: { fontSize: 13, color: T.sub },
  rowTitle: { fontSize: 15, fontWeight: '700', color: T.text },
  name: { fontSize: 13, fontWeight: '600', color: T.text },

  pageHead: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: T.text, letterSpacing: -0.3, marginBottom: 2 },

  chips: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: T.field },
  chipOn: { backgroundColor: T.brand },
  chipText: { fontSize: 13, fontWeight: '600', color: T.text },
  chipCount: { fontSize: 13, fontWeight: '700' },

  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, marginHorizontal: 16, marginBottom: 10, paddingHorizontal: 14, borderRadius: 21, backgroundColor: T.field },
  searchInput: { flex: 1, fontSize: 15, color: T.text, padding: 0 },

  // rows
  row: { paddingLeft: 16, paddingRight: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: T.line },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  topLine: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 52, height: 52, borderRadius: 12, overflow: 'hidden', backgroundColor: T.strip, borderWidth: 1, borderColor: T.line, alignItems: 'center', justifyContent: 'center' },
  cost: { fontSize: 15, fontWeight: '700', color: T.text },
  byLine: { marginTop: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, height: 24, borderRadius: 8, borderWidth: 1 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, height: 24, borderRadius: 12 },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  actionLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 8 },
  actionText: { fontSize: 13, fontWeight: '700' },

  skelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 18, borderTopWidth: 1, borderTopColor: T.line },
  skelIcon: { width: 52, height: 52, borderRadius: 12, backgroundColor: T.field },
  skelBar: { height: 12, borderRadius: 6, backgroundColor: T.field },
  emptyWrap: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 32, borderTopWidth: 1, borderTopColor: T.line },
  emptyIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: T.strip, borderWidth: 1, borderColor: T.line, alignItems: 'center', justifyContent: 'center' },
  clearBtn: { marginTop: 16, height: 38, paddingHorizontal: 18, borderRadius: 19, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  clearBtnText: { fontSize: 14, fontWeight: '700', color: T.text },
});