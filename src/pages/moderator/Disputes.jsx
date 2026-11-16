// ═══════════════════════════════════════════════════════════════
//  MOBILE APP (Expo React Native) — src/pages/moderator/Disputes.jsx
//  Same queries, metrics, tab filters, search and verdict parsing as the web.
//  Mobile layout: escrow strip, filter chips (the web stat tabs), a search field,
//  and case rows. The whole row opens the case (web had a separate button),
//  the refresh button became pull-to-refresh, and the desktop column grid is gone.
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, Pressable, FlatList, TextInput, RefreshControl, AppState, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, Check, ChevronRight, Scale, Search, Wallet, X } from 'lucide-react-native';
import supabase from '../../supabaseClient';

const T = {
  text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4',
  brand: '#047857', soft: '#ecfdf5', strip: '#f7f9f9', danger: '#e11d48',
};

// Display-only: the full resolution note lives in "View Record", so the row
// only needs to say who was favored, e.g. "[RESOLVED - FAVOR LEARNER on 10/31/2026 ...]" -> "Learner".
const getVerdict = (details) => {
  const match = /\[RESOLVED\s*[-–—]\s*FAVOR\s+([^\]]*?)(?:\s+on\s|\])/i.exec(details || '');
  if (!match) return null;
  return match[1].trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
};

export default function Disputes() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disputes, setDisputes] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'my_claims' | 'resolved' | 'all'
  const [searchQuery, setSearchQuery] = useState('');
  const lastFetch = useRef(0);

  // silent = background refresh (no skeleton / dimming)
  const fetchDisputes = async (silent = false) => {
    if (!silent) setLoading(true);
    lastFetch.current = Date.now();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);

      // 1. all session dispute reports
      const { data: reportsData, error: reportsErr } = await supabase
        .from('reports')
        .select(`
          id, reference_id, reference_type, reason, details, status, created_at, assigned_to,
          reporter_id, reported_user_id,
          reporter:user_profiles!reports_reporter_id_fkey(id, full_name, avatar_url),
          reported:user_profiles!reports_reported_user_id_fkey(id, full_name, avatar_url),
          assignee:user_profiles!reports_assigned_to_fkey(id, full_name)
        `)
        .eq('reference_type', 'session')
        .order('created_at', { ascending: false });

      if (reportsErr) throw reportsErr;

      // 2. matching session telemetry for credits and skill name
      const sessionIds = (reportsData || []).map((r) => r.reference_id).filter(Boolean);
      const sessionMap = {};

      if (sessionIds.length > 0) {
        const { data: sessionsData } = await supabase
          .from('sessions')
          .select(`
            id, credit_amount, student_id, instructor_id, scheduled_date, scheduled_time,
            skill:skills(title)
          `)
          .in('id', sessionIds);

        (sessionsData || []).forEach((sess) => {
          sessionMap[sess.id] = sess;
        });
      }

      // 3. combine reports and session info
      const enriched = (reportsData || []).map((report) => ({
        ...report,
        session: sessionMap[report.reference_id] || null,
      }));

      setDisputes(enriched);
    } catch (err) {
      console.error('Failed to load escrow disputes:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDisputes(); }, []);

  // coming back from a case (a ruling may have been recorded), or back to the app -> quietly refresh
  useEffect(() => {
    const unsubFocus = navigation.addListener('focus', () => {
      if (Date.now() - lastFetch.current > 3000) fetchDisputes(true);
    });
    const appSub = AppState.addEventListener('change', (state) => { if (state === 'active') fetchDisputes(true); });
    const refreshRealtime = () => fetchDisputes(true);
    const liveChannel = supabase.channel('mod_disputes_live_' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, refreshRealtime)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions' }, refreshRealtime)
      .subscribe();
    return () => { unsubFocus(); appSub.remove(); supabase.removeChannel(liveChannel); };
  }, [navigation]);

  const onRefresh = async () => { setRefreshing(true); await fetchDisputes(true); setRefreshing(false); };

  // Telemetry Calculations
  const metrics = useMemo(() => {
    const pendingList = disputes.filter((d) => d.status === 'pending');
    const totalEscrow = pendingList.reduce(
      (acc, d) => acc + Number(d.session?.credit_amount || 0),
      0,
    );
    const myClaims = disputes.filter(
      (d) => d.status === 'pending' && d.assigned_to === currentUserId,
    ).length;
    const resolvedCount = disputes.filter((d) => d.status === 'resolved').length;

    return {
      pendingCount: pendingList.length,
      escrowLocked: totalEscrow,
      myClaimsCount: myClaims,
      resolvedCount,
    };
  }, [disputes, currentUserId]);

  // Tab & Search Filtering
  const filteredDisputes = useMemo(() => {
    return disputes.filter((item) => {
      if (activeTab === 'pending' && item.status !== 'pending') return false;
      if (activeTab === 'my_claims' && (item.status !== 'pending' || item.assigned_to !== currentUserId)) return false;
      if (activeTab === 'resolved' && item.status !== 'resolved') return false;

      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const skillMatch = item.session?.skill?.title?.toLowerCase().includes(q);
        const reporterMatch = item.reporter?.full_name?.toLowerCase().includes(q);
        const reportedMatch = item.reported?.full_name?.toLowerCase().includes(q);
        const reasonMatch = item.reason?.toLowerCase().includes(q);
        const idMatch = item.id.toLowerCase().includes(q);

        return skillMatch || reporterMatch || reportedMatch || reasonMatch || idMatch;
      }

      return true;
    });
  }, [disputes, activeTab, searchQuery, currentUserId]);

  // ── Display-only: the four filter chips ──
  const tabs = [
    { id: 'pending',   label: 'Pending',   count: metrics.pendingCount },
    { id: 'my_claims', label: 'My claims', count: metrics.myClaimsCount },
    { id: 'resolved',  label: 'Resolved',  count: metrics.resolvedCount },
    { id: 'all',       label: 'All cases', count: disputes.length },
  ];
  const dim = loading ? { opacity: 0.3 } : null;

  const Header = (
    <View>
      <View style={s.pageHead}>
        <Text style={s.pageTitle}>Dispute & escrow adjudication</Text>
        <Text style={s.small}>Review contested sessions, inspect dialogue logs, and release held escrow balances.</Text>
      </View>

      {/* escrow */}
      <View style={s.escrow}>
        <View style={{ flex: 1 }}>
          <Text style={s.escrowLabel}>Escrow locked</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
            <Text style={[s.escrowNum, dim]}>{metrics.escrowLocked}</Text>
            <Text style={s.escrowUnit}>Credits</Text>
          </View>
          <Text style={s.escrowNote}>Held in pending disputes</Text>
        </View>
        <View style={s.escrowIcon}><Wallet size={18} color="#d1fae5" /></View>
      </View>

      {/* filter chips */}
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

      {/* search */}
      <View style={s.searchWrap}>
        <Search size={17} color={T.sub} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by skill, user, reason, or ID"
          placeholderTextColor={T.sub}
          autoCapitalize="none"
          autoCorrect={false}
          style={s.searchInput}
          accessibilityLabel="Search disputes"
        />
        {!!searchQuery && (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8} accessibilityLabel="Clear search"><X size={17} color={T.sub} /></Pressable>
        )}
      </View>
      {!loading && (
        <Text style={[s.small, { paddingHorizontal: 16, paddingBottom: 10 }]}>
          Showing <Text style={{ fontWeight: '700', color: T.text }}>{filteredDisputes.length}</Text> of {disputes.length} cases
        </Text>
      )}
    </View>
  );

  const renderItem = ({ item }) => {
    const isParticipant = Boolean(
      currentUserId && item.session && (
        currentUserId === item.session.student_id || currentUserId === item.session.instructor_id
      ),
    );
    const isMine = item.assigned_to === currentUserId;
    const isPending = item.status === 'pending';
    const verdict = getVerdict(item.details);

    return (
      <Pressable
        onPress={() => navigation.navigate('DisputeDetails', { id: item.id })}
        style={({ pressed }) => [s.row, isParticipant && { backgroundColor: '#fff1f2' }, pressed && { backgroundColor: T.strip }]}
      >
        <View style={[s.accent, { backgroundColor: isParticipant ? '#f43f5e' : isPending ? '#fbbf24' : '#10b981' }]} />

        {/* title line */}
        <View style={s.topLine}>
          <View style={s.caseIcon}><Scale size={20} color="#b45309" strokeWidth={1.9} /></View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[s.rowTitle, { flex: 1 }]} numberOfLines={1}>{item.session?.skill?.title || 'Contested Booking'}</Text>
              <Text style={s.small}>{new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
            </View>
            <View style={s.reasonLine}>
              <Text style={s.reasonChip} numberOfLines={1}>{item.reason}</Text>
              <Text style={s.small}>#{item.id.slice(0, 8)}</Text>
            </View>
          </View>
        </View>

        {verdict ? (
          <View style={s.verdictLine}>
            <Check size={14} color="#065f46" />
            <Text style={s.verdictText}>Resolved in favor of {verdict}</Text>
          </View>
        ) : (
          <Text style={s.quote} numberOfLines={1}>"{item.details}"</Text>
        )}

        {/* parties */}
        <Text style={s.parties} numberOfLines={2}>
          <Text style={s.small}>Filer </Text><Text style={s.name}>{item.reporter?.full_name || 'Complainant'}</Text>
          <Text style={s.small}>   Target </Text><Text style={s.name}>{item.reported?.full_name || 'Instructor'}</Text>
        </Text>

        {/* meta row */}
        <View style={s.metaRow}>
          <Text style={s.escrowAmt}>{item.session?.credit_amount ?? 0} <Text style={s.small}>Credits</Text></Text>

          {isParticipant ? (
            <View style={[s.badge, { backgroundColor: '#fff1f2', borderColor: '#fecdd3' }]}>
              <AlertTriangle size={12} color="#9f1239" />
              <Text style={[s.badgeText, { color: '#9f1239' }]}>Conflict (You)</Text>
            </View>
          ) : item.assigned_to ? (
            isMine ? (
              <View style={[s.badge, { backgroundColor: T.soft, borderColor: '#a7f3d0' }]}>
                <Text style={[s.badgeText, { color: '#065f46' }]}>Assigned to You</Text>
              </View>
            ) : (
              <Text style={[s.name, { flexShrink: 1 }]} numberOfLines={1}>{item.assignee?.full_name || 'Staff Member'}</Text>
            )
          ) : (
            <View style={[s.badge, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
              <Text style={[s.badgeText, { color: '#92400e' }]}>Unassigned</Text>
            </View>
          )}

          <View style={{ flex: 1 }} />

          <View style={[s.pill, { backgroundColor: isPending ? '#fffbeb' : T.soft }]}>
            <View style={[s.pillDot, { backgroundColor: isPending ? '#f59e0b' : '#059669' }]} />
            <Text style={[s.pillText, { color: isPending ? '#92400e' : '#065f46' }]}>{item.status}</Text>
          </View>
        </View>

        {/* action label (the row itself is the button) */}
        <View style={s.actionLine}>
          <Text style={[s.actionText, { color: isPending ? T.brand : T.sub }]}>{isPending ? 'Review case' : 'View record'}</Text>
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
      <View style={s.emptyIcon}><Scale size={22} color={T.border} /></View>
      <Text style={[s.rowTitle, { marginTop: 12 }]}>No disputes found</Text>
      <Text style={[s.small, { textAlign: 'center', marginTop: 4 }]}>
        {searchQuery ? 'No cases matched your filter criteria.' : 'There are no active disputes in this queue.'}
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
      data={loading ? [] : filteredDisputes}
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

  pageHead: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: T.text, letterSpacing: -0.3, marginBottom: 2 },

  // escrow
  escrow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, padding: 14, borderRadius: 12, backgroundColor: '#064e3b' },
  escrowLabel: { fontSize: 13, fontWeight: '600', color: '#d1fae5' },
  escrowNum: { fontSize: 28, fontWeight: '700', color: '#fff', letterSpacing: -0.8 },
  escrowUnit: { fontSize: 13, fontWeight: '700', color: '#a7f3d0' },
  escrowNote: { fontSize: 13, color: 'rgba(209,250,229,0.8)', marginTop: 2 },
  escrowIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },

  // chips
  chips: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: T.field },
  chipOn: { backgroundColor: T.brand },
  chipText: { fontSize: 13, fontWeight: '600', color: T.text },
  chipCount: { fontSize: 13, fontWeight: '700' },

  // search
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, marginHorizontal: 16, marginBottom: 10, paddingHorizontal: 14, borderRadius: 21, backgroundColor: T.field },
  searchInput: { flex: 1, fontSize: 15, color: T.text, padding: 0 },

  // rows
  row: { paddingLeft: 16, paddingRight: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: T.line },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  topLine: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  caseIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#fffbeb', alignItems: 'center', justifyContent: 'center' },
  reasonLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  reasonChip: { flexShrink: 1, fontSize: 12, fontWeight: '600', color: '#be123c', backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7, overflow: 'hidden' },
  verdictLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  verdictText: { fontSize: 13, fontWeight: '600', color: '#065f46' },
  quote: { fontSize: 13, fontStyle: 'italic', color: T.sub, marginTop: 10 },
  parties: { marginTop: 8, lineHeight: 19 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  escrowAmt: { fontSize: 15, fontWeight: '700', color: T.text },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 24, borderRadius: 8, borderWidth: 1 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, height: 24, borderRadius: 12 },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  actionLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 8 },
  actionText: { fontSize: 13, fontWeight: '700' },

  // skeleton + empty
  skelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 18, borderTopWidth: 1, borderTopColor: T.line },
  skelIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: T.field },
  skelBar: { height: 12, borderRadius: 6, backgroundColor: T.field },
  emptyWrap: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 32, borderTopWidth: 1, borderTopColor: T.line },
  emptyIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: T.strip, borderWidth: 1, borderColor: T.line, alignItems: 'center', justifyContent: 'center' },
  clearBtn: { marginTop: 16, height: 38, paddingHorizontal: 18, borderRadius: 19, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  clearBtnText: { fontSize: 14, fontWeight: '700', color: T.text },
});