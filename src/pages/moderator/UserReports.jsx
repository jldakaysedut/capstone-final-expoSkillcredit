// ═══════════════════════════════════════════════════════════════
//  MOBILE APP (Expo React Native) — src/pages/moderator/UserReports.jsx
//  Same query, same clustering (group by reference_id), same metrics, tab filters
//  and search as the web. Mobile layout: filter chips (the web stat tabs), a search
//  field and report rows. The whole row opens the ticket (web had a separate
//  button), the refresh button became pull-to-refresh, the desktop column grid is gone.
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, Pressable, FlatList, TextInput, RefreshControl, AppState, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, ChevronRight, Flag, Search, X } from 'lucide-react-native';
import supabase from '../../supabaseClient';

const T = {
  text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4',
  brand: '#047857', soft: '#ecfdf5', strip: '#f7f9f9', danger: '#e11d48',
};

export default function UserReports() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [groupedReports, setGroupedReports] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'my_claims' | 'resolved' | 'all'
  const [searchQuery, setSearchQuery] = useState('');
  const lastFetch = useRef(0);

  // silent = background refresh (no skeleton / dimming)
  const fetchReports = async (silent = false) => {
    if (!silent) setLoading(true);
    lastFetch.current = Date.now();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);

      // all behavioral and conduct reports (not session escrow)
      const { data, error } = await supabase
        .from('reports')
        .select(`
          id, reference_id, reference_type, reason, details, status, created_at, assigned_to,
          reporter_id, reported_user_id,
          reporter:user_profiles!reports_reporter_id_fkey(id, full_name, role),
          reported:user_profiles!reports_reported_user_id_fkey(id, full_name, role),
          assignee:user_profiles!reports_assigned_to_fkey(id, full_name)
        `)
        .neq('reference_type', 'session')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // ─── CLUSTERING LOGIC: Group by reference_id ───
      const clusters = {};
      (data || []).forEach((report) => {
        // no reference_id -> use the report ID itself
        const key = report.reference_id || report.id;

        if (!clusters[key]) {
          clusters[key] = {
            ...report,
            report_count: 1,
            all_reporters: [report.reporter?.full_name].filter(Boolean),
            all_reasons: [],
            all_details: [],
          };
        } else {
          clusters[key].report_count += 1;
          if (report.reporter?.full_name && !clusters[key].all_reporters.includes(report.reporter.full_name)) {
            clusters[key].all_reporters.push(report.reporter.full_name);
          }
          // Keep a pending status if any filer still has an open report.
          if (report.status === 'pending' && clusters[key].status !== 'pending') {
            clusters[key].status = 'pending';
          }
        }

        const reason = report.reason?.trim();
        if (reason && !clusters[key].all_reasons.some(
          (existing) => existing.toLowerCase() === reason.toLowerCase(),
        )) {
          clusters[key].all_reasons.push(reason);
        }
        const details = report.details?.trim();
        if (details) clusters[key].all_details.push(details);
      });

      // Convert clustered records to a summary that does not hide differing filer reasons.
      const grouped = Object.values(clusters).map((cluster) => ({
        ...cluster,
        reason_variants: cluster.all_reasons,
        reason_summary: cluster.all_reasons.length > 1
          ? 'Mixed reasons'
          : cluster.all_reasons[0] || 'Unspecified reason',
      }));
      setGroupedReports(grouped);
    } catch (err) {
      console.error('Failed to load user reports:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReports(); }, []);

  // coming back from a ticket (a decision may have been recorded), or back to the app -> quietly refresh
  useEffect(() => {
    const unsubFocus = navigation.addListener('focus', () => {
      if (Date.now() - lastFetch.current > 3000) fetchReports(true);
    });
    const appSub = AppState.addEventListener('change', (state) => { if (state === 'active') fetchReports(true); });
    const refreshRealtime = () => fetchReports(true);
    const liveChannel = supabase.channel('mod_userreports_live_' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, refreshRealtime)
      .subscribe();
    return () => { unsubFocus(); appSub.remove(); supabase.removeChannel(liveChannel); };
  }, [navigation]);

  const onRefresh = async () => { setRefreshing(true); await fetchReports(true); setRefreshing(false); };

  // Telemetry Calculations (Using grouped reports)
  const metrics = useMemo(() => {
    const pendingList = groupedReports.filter((r) => r.status === 'pending');
    const myClaims = groupedReports.filter((r) => r.status === 'pending' && r.assigned_to === currentUserId).length;
    const resolvedCount = groupedReports.filter((r) => r.status === 'resolved' || r.status === 'escalated').length;

    return {
      pendingCount: pendingList.length,
      myClaimsCount: myClaims,
      resolvedCount,
      totalCount: groupedReports.length, // Number of unique issues
    };
  }, [groupedReports, currentUserId]);

  // Tab & Search Filtering
  const filteredReports = useMemo(() => {
    return groupedReports.filter((item) => {
      if (activeTab === 'pending' && item.status !== 'pending') return false;
      if (activeTab === 'my_claims' && (item.status !== 'pending' || item.assigned_to !== currentUserId)) return false;
      if (activeTab === 'resolved' && item.status !== 'resolved' && item.status !== 'escalated') return false;

      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const reasonMatch = (item.reason_variants || []).some((reason) => reason.toLowerCase().includes(q));
        const reporterMatch = item.all_reporters.some((name) => name.toLowerCase().includes(q));
        const reportedMatch = item.reported?.full_name?.toLowerCase().includes(q);
        const detailsMatch = (item.all_details || []).some((details) => details.toLowerCase().includes(q));

        return reasonMatch || reporterMatch || reportedMatch || detailsMatch;
      }

      return true;
    });
  }, [groupedReports, activeTab, searchQuery, currentUserId]);

  // ── Display-only: the four filter chips ──
  const tabs = [
    { id: 'pending',   label: 'Pending',              count: metrics.pendingCount },
    { id: 'my_claims', label: 'My claims',            count: metrics.myClaimsCount },
    { id: 'resolved',  label: 'Resolved & escalated', count: metrics.resolvedCount },
    { id: 'all',       label: 'All reports',          count: groupedReports.length },
  ];
  const dim = loading ? { opacity: 0.3 } : null;

  const Header = (
    <View>
      <View style={s.pageHead}>
        <Text style={s.pageTitle}>User reports & conduct queue</Text>
        <Text style={s.small}>Review community infractions, harassment complaints, and account conduct tickets.</Text>
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
          placeholder="Search by reason, user, or details"
          placeholderTextColor={T.sub}
          autoCapitalize="none"
          autoCorrect={false}
          style={s.searchInput}
          accessibilityLabel="Search user reports"
        />
        {!!searchQuery && (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8} accessibilityLabel="Clear search"><X size={17} color={T.sub} /></Pressable>
        )}
      </View>
      {!loading && (
        <Text style={[s.small, { paddingHorizontal: 16, paddingBottom: 10 }]}>
          Showing <Text style={{ fontWeight: '700', color: T.text }}>{filteredReports.length}</Text> of {groupedReports.length} reports
        </Text>
      )}
    </View>
  );

  const renderItem = ({ item }) => {
    const isParticipant = Boolean(
      currentUserId && (currentUserId === item.reporter_id || currentUserId === item.reported_user_id),
    );
    const isMine = item.assigned_to === currentUserId;
    const isPending = item.status === 'pending';
    const isEscalated = item.status === 'escalated';

    return (
      <Pressable
        onPress={() => navigation.navigate('ReportDetails', { id: item.id })}
        style={({ pressed }) => [s.row, isParticipant && { backgroundColor: '#fff1f2' }, pressed && { backgroundColor: T.strip }]}
      >
        <View style={[s.accent, { backgroundColor: isParticipant || isEscalated ? '#f43f5e' : isPending ? '#fbbf24' : '#10b981' }]} />

        {/* title line */}
        <View style={s.topLine}>
          <View style={s.caseIcon}><Flag size={20} color="#be123c" strokeWidth={1.9} /></View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[s.rowTitle, { flex: 1 }]} numberOfLines={1}>{item.reason_summary}</Text>
              <Text style={s.small}>{new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</Text>
            </View>
            <View style={s.reasonLine}>
              <Text style={s.typeChip} numberOfLines={1}>{item.reference_type || 'User Conduct'}</Text>
              <Text style={s.small}>#{item.id.slice(0, 8)}</Text>
            </View>
          </View>
        </View>

        {/* reported user */}
        <Text style={s.parties} numberOfLines={1}>
          <Text style={s.small}>Reported </Text><Text style={s.name}>{item.reported?.full_name || 'Flagged User'}</Text>
        </Text>

        {/* meta row */}
        <View style={s.metaRow}>
          <Text style={s.countChip}>{item.report_count} {item.report_count > 1 ? 'reports' : 'report'}</Text>

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

          <View style={[s.pill, { backgroundColor: isPending ? '#fffbeb' : isEscalated ? '#fff1f2' : T.soft }]}>
            <View style={[s.pillDot, { backgroundColor: isPending ? '#f59e0b' : isEscalated ? '#f43f5e' : '#059669' }]} />
            <Text style={[s.pillText, { color: isPending ? '#92400e' : isEscalated ? '#9f1239' : '#065f46' }]}>{item.status}</Text>
          </View>
        </View>

        {/* action label (the row itself is the button) */}
        <View style={s.actionLine}>
          <Text style={[s.actionText, { color: isPending ? T.brand : T.sub }]}>{isPending ? 'Review ticket' : 'View record'}</Text>
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
      <View style={s.emptyIcon}><Flag size={22} color={T.border} /></View>
      <Text style={[s.rowTitle, { marginTop: 12 }]}>No reports found</Text>
      <Text style={[s.small, { textAlign: 'center', marginTop: 4 }]}>
        {searchQuery ? 'No tickets matched your filter criteria.' : 'There are no active records in this queue.'}
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
      data={loading ? [] : filteredReports}
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
  caseIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#fff1f2', alignItems: 'center', justifyContent: 'center' },
  reasonLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  typeChip: { flexShrink: 1, fontSize: 12, fontWeight: '600', color: T.sub, backgroundColor: T.strip, borderWidth: 1, borderColor: T.line, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7, overflow: 'hidden', textTransform: 'capitalize' },
  parties: { marginTop: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  countChip: { fontSize: 12, fontWeight: '700', color: '#be123c', backgroundColor: '#fff1f2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },
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