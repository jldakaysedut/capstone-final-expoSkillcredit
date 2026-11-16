// ═══════════════════════════════════════════════════════════════
//  MOBILE APP (Expo React Native) — src/pages/moderator/ModDashboard.jsx
//  Same queries + same clustering as the web (pending disputes, escrow total,
//  pending reports, resolved total, pending skills, my claims, recent intake).
//  Mobile layout: one column — work queues, escrow + workload, then the intake
//  feed as tappable rows (whole row = "Open case"). The refresh button became
//  pull-to-refresh and the protocol card is a collapsible row.
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl, ActivityIndicator, AppState, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertTriangle, Check, ChevronDown, ChevronRight, FileText, Scale, Search, ShieldCheck, Users, Wallet,
} from 'lucide-react-native';
import supabase from '../../supabaseClient';

const T = {
  text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4',
  brand: '#047857', soft: '#ecfdf5', strip: '#f7f9f9',
};

const TONES = {
  emerald: { bg: '#ecfdf5', fg: '#047857', bar: '#059669' },
  amber:   { bg: '#fffbeb', fg: '#b45309', bar: '#f59e0b' },
  rose:    { bg: '#fff1f2', fg: '#be123c', bar: '#f43f5e' },
};

export default function ModDashboard() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [stats, setStats] = useState({
    pendingDisputes: 0,
    escrowLocked: 0,
    pendingReports: 0,
    resolvedTotal: 0,
    myClaims: 0,
    pendingSkills: 0,
  });
  const [recentQueue, setRecentQueue] = useState([]);
  const [protocolOpen, setProtocolOpen] = useState(false);
  const lastFetch = useRef(0);

  // silent = background refresh (no dimming of the numbers)
  const fetchDashboardData = async (silent = false) => {
    if (!silent) setLoading(true);
    lastFetch.current = Date.now();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);

      // 1. Fetch Session Disputes (reference_type = 'session')
      const { data: sessionReports, error: repErr } = await supabase
        .from('reports')
        .select('id, reference_id, status, assigned_to')
        .eq('reference_type', 'session');

      if (repErr) throw repErr;

      const pendingDisputesList = (sessionReports || []).filter((r) => r.status === 'pending');
      const pendingDisputesCount = pendingDisputesList.length;

      // 2. Compute Real Escrow Amount from Pending Sessions
      let totalEscrow = 0;
      const sessionIds = pendingDisputesList.map((r) => r.reference_id).filter(Boolean);
      if (sessionIds.length > 0) {
        const { data: sessionsData } = await supabase
          .from('sessions')
          .select('credit_amount')
          .in('id', sessionIds);

        totalEscrow = (sessionsData || []).reduce(
          (acc, item) => acc + Number(item.credit_amount || 0),
          0,
        );
      }

      // 3. Fetch User Behavioral Reports (reference_type != 'session')
      const { count: pendingReportsCount } = await supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .neq('reference_type', 'session')
        .eq('status', 'pending');

      // 4. Fetch All-Time Resolved Count
      const { count: resolvedCount } = await supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'resolved');

      // 5. Fetch Pending Skills Count
      const { count: pendingSkillsCount } = await supabase
        .from('skills')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      // 6. My Active Claims
      const myClaimedCount = (sessionReports || []).filter(
        (r) => r.status === 'pending' && r.assigned_to === user?.id,
      ).length;

      setStats({
        pendingDisputes: pendingDisputesCount,
        escrowLocked: totalEscrow,
        pendingReports: pendingReportsCount || 0,
        resolvedTotal: resolvedCount || 0,
        myClaims: myClaimedCount,
        pendingSkills: pendingSkillsCount || 0,
      });

      // 7. Fetch Recent Incoming Tickets (Cluster by reference_id, Limit 8)
      const { data: recentData } = await supabase
        .from('reports')
        .select(`
          id, reference_id, reference_type, reason, details, status, created_at, assigned_to,
          reporter:user_profiles!reports_reporter_id_fkey(full_name),
          reported:user_profiles!reports_reported_user_id_fkey(full_name)
        `)
        .order('created_at', { ascending: false })
        .limit(30);

      // Report Clustering Logic
      const recentClusters = {};
      (recentData || []).forEach((report) => {
        const key = report.reference_id || report.id;
        if (!recentClusters[key]) {
          recentClusters[key] = { ...report, report_count: 1 };
        } else {
          recentClusters[key].report_count += 1;
          if (report.status === 'pending' && recentClusters[key].status !== 'pending') {
            recentClusters[key].status = 'pending';
          }
        }
      });

      setRecentQueue(Object.values(recentClusters).slice(0, 20));
    } catch (err) {
      console.error('Failed to load moderator dashboard metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDashboardData(); }, []);

  // coming back from a case, or back to the app -> quietly refresh
  useEffect(() => {
    const unsubFocus = navigation.addListener('focus', () => {
      if (Date.now() - lastFetch.current > 3000) fetchDashboardData(true);
    });
    const appSub = AppState.addEventListener('change', (state) => { if (state === 'active') fetchDashboardData(true); });
    const refreshRealtime = () => fetchDashboardData(true);
    const liveChannel = supabase.channel('mod_moddashboard_live_' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, refreshRealtime)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'skills' }, refreshRealtime)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions' }, refreshRealtime)
      .subscribe();
    return () => { unsubFocus(); appSub.remove(); supabase.removeChannel(liveChannel); };
  }, [navigation]);

  const onRefresh = async () => { setRefreshing(true); await fetchDashboardData(true); setRefreshing(false); };

  // ── Display-only values derived from the stats above ──
  const queues = [
    { label: 'Skill approvals',   note: 'Listings awaiting quality review', count: stats.pendingSkills,   to: 'Approvals', Icon: Search,        tone: TONES.emerald },
    { label: 'Disputes & escrow', note: 'Session cases awaiting a ruling',  count: stats.pendingDisputes, to: 'Disputes',  Icon: Scale,         tone: TONES.amber },
    { label: 'User reports',      note: 'Conduct and profile flags',        count: stats.pendingReports,  to: 'Reports',   Icon: AlertTriangle, tone: TONES.rose },
  ];
  const totalOpen = queues.reduce((sum, q) => sum + q.count, 0);
  const dim = loading ? { opacity: 0.3 } : null;

  const openCase = (item) => {
    const isDispute = item.reference_type === 'session';
    navigation.navigate(isDispute ? 'DisputeDetails' : 'ReportDetails', { id: item.id });
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#fff' }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.brand} colors={[T.brand]} />}
    >
      {/* ── page header */}
      <View style={s.pageHead}>
        <Text style={s.pageTitle}>Moderation overview</Text>
        <Text style={s.small}>
          {loading
            ? 'Loading the latest figures…'
            : totalOpen === 0
              ? 'Nothing is waiting for review right now.'
              : `${totalOpen} ${totalOpen === 1 ? 'item needs' : 'items need'} review across your queues.`}
        </Text>
      </View>

      {/* ── work queues */}
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>Work queues</Text>
        <Text style={s.small}>Share of open items</Text>
      </View>
      {queues.map(({ label, note, count, to, Icon, tone }) => {
        const pct = totalOpen > 0 ? Math.round((count / totalOpen) * 100) : 0;
        return (
          <Pressable key={to} onPress={() => navigation.navigate(to)} style={({ pressed }) => [s.queueRow, pressed && { backgroundColor: T.strip }]}>
            <View style={[s.queueIcon, { backgroundColor: tone.bg }]}><Icon size={20} color={tone.fg} strokeWidth={1.9} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>{label}</Text>
              <Text style={s.small} numberOfLines={1}>{note}</Text>
              <View style={s.track} accessibilityLabel={`${pct}% of open items`}>
                <View style={[s.fill, { width: `${pct}%`, backgroundColor: tone.bar }]} />
              </View>
            </View>
            <Text style={[s.count, dim]}>{count}</Text>
            <ChevronRight size={18} color={T.border} />
          </Pressable>
        );
      })}

      {/* ── escrow + workload */}
      <View style={s.escrow}>
        <View style={s.escrowTop}>
          <Text style={s.escrowLabel}>Escrow held in disputes</Text>
          <View style={s.escrowIcon}><Wallet size={16} color="#d1fae5" /></View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 12 }}>
          <Text style={[s.escrowNum, dim]}>{stats.escrowLocked}</Text>
          <Text style={s.escrowUnit}>CR</Text>
        </View>
        <Text style={s.escrowNote}>Locked across sessions with an open dispute. Released only when a ruling is recorded.</Text>
      </View>

      <View style={s.workload}>
        <View style={s.stat}>
          <View style={s.statLabelRow}><Users size={14} color={T.sub} /><Text style={s.small}>Claimed by you</Text></View>
          <Text style={[s.statNum, dim]}>{stats.myClaims}</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.stat}>
          <View style={s.statLabelRow}><Check size={14} color={T.sub} /><Text style={s.small}>Resolved total</Text></View>
          <Text style={[s.statNum, dim]}>{stats.resolvedTotal}</Text>
        </View>
      </View>

      {/* ── recent intake */}
      <View style={[s.sectionHead, { marginTop: 24 }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.sectionTitle}>Recent intake</Text>
          <Text style={s.small}>Latest submissions, grouped by case</Text>
        </View>
        {!loading && recentQueue.length > 0 && <Text style={s.casesTag}>{recentQueue.length} cases</Text>}
      </View>

      {loading ? (
        <View style={s.emptyWrap}><ActivityIndicator color={T.brand} /><Text style={[s.small, { marginTop: 10 }]}>Loading the intake queue…</Text></View>
      ) : recentQueue.length === 0 ? (
        <View style={s.emptyWrap}>
          <View style={s.emptyIcon}><FileText size={22} color={T.border} /></View>
          <Text style={[s.rowTitle, { marginTop: 12 }]}>The queue is clear</Text>
          <Text style={[s.small, { textAlign: 'center', marginTop: 4 }]}>New reports and disputes will appear here as they come in.</Text>
        </View>
      ) : (
        recentQueue.map((item) => {
          const isDispute = item.reference_type === 'session';
          const isPending = item.status === 'pending';
          const tone = isDispute ? TONES.amber : TONES.rose;
          const Icon = isDispute ? Scale : AlertTriangle;
          return (
            <Pressable key={item.id} onPress={() => openCase(item)} style={({ pressed }) => [s.caseRow, pressed && { backgroundColor: T.strip }]}>
              <View style={[s.accent, { backgroundColor: isPending ? '#fbbf24' : '#10b981' }]} />
              <View style={[s.caseIcon, { backgroundColor: tone.bg }]}><Icon size={18} color={tone.fg} strokeWidth={1.9} /></View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[s.rowTitle, { flexShrink: 1 }]} numberOfLines={1}>{item.reason}</Text>
                  {item.report_count > 1 && <Text style={s.multi}>{item.report_count}x</Text>}
                </View>
                <Text style={s.small} numberOfLines={1}>
                  {isDispute ? 'Dispute' : 'Report'} from {item.report_count > 1 ? 'multiple users' : (item.reporter?.full_name || 'Anonymous')} against {item.reported?.full_name || 'User'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <View style={[s.pill, { backgroundColor: isPending ? '#fffbeb' : T.soft }]}>
                  <View style={[s.pillDot, { backgroundColor: isPending ? '#f59e0b' : '#059669' }]} />
                  <Text style={[s.pillText, { color: isPending ? '#92400e' : '#065f46' }]}>{item.status}</Text>
                </View>
                <Text style={s.date}>
                  {new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            </Pressable>
          );
        })
      )}

      {/* ── protocol (collapsed by default) */}
      <Pressable onPress={() => setProtocolOpen((v) => !v)} style={[s.protocolHead, { marginTop: 8 }]}>
        <View style={s.protocolIcon}><ShieldCheck size={16} color={T.brand} /></View>
        <Text style={[s.rowTitle, { flex: 1 }]}>Adjudication protocol</Text>
        <ChevronDown size={18} color={T.sub} style={protocolOpen && { transform: [{ rotate: '180deg' }] }} />
      </Pressable>
      {protocolOpen && (
        <View style={s.protocolBody}>
          <View>
            <Text style={s.ruleTitle}>Inspect independently</Text>
            <Text style={s.ruleText}>Review the chat history and attendance record before you rule.</Text>
          </View>
          <View style={s.ruleSep}>
            <Text style={s.ruleTitle}>Avoid conflicts</Text>
            <Text style={s.ruleText}>Never claim or resolve a dispute that your own account is part of.</Text>
          </View>
          <View style={s.ruleSep}>
            <Text style={s.ruleTitle}>Rulings are final</Text>
            <Text style={s.ruleText}>Escrow refunds and payouts are permanent once executed.</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  small: { fontSize: 13, color: T.sub },
  rowTitle: { fontSize: 15, fontWeight: '600', color: T.text },

  pageHead: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: T.text, letterSpacing: -0.3, marginBottom: 2 },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.line },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2 },
  casesTag: { fontSize: 13, fontWeight: '600', color: T.sub, backgroundColor: T.field, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },

  // queues
  queueRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: T.line },
  queueIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: T.field, overflow: 'hidden', marginTop: 8 },
  fill: { height: '100%', borderRadius: 2 },
  count: { minWidth: 34, textAlign: 'right', fontSize: 24, fontWeight: '700', color: T.text, letterSpacing: -0.5 },

  // escrow + workload
  escrow: { marginHorizontal: 16, marginTop: 16, padding: 16, borderRadius: 12, backgroundColor: '#064e3b' },
  escrowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  escrowLabel: { fontSize: 14, fontWeight: '600', color: '#d1fae5' },
  escrowIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  escrowNum: { fontSize: 36, fontWeight: '700', color: '#fff', letterSpacing: -1 },
  escrowUnit: { fontSize: 15, fontWeight: '700', color: '#a7f3d0' },
  escrowNote: { fontSize: 13, lineHeight: 18, color: 'rgba(209,250,229,0.8)', marginTop: 10 },

  workload: { flexDirection: 'row', marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderColor: T.line, borderRadius: 12 },
  stat: { flex: 1, padding: 14 },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statNum: { fontSize: 24, fontWeight: '700', color: T.text, letterSpacing: -0.5, marginTop: 8 },
  statDivider: { width: 1, backgroundColor: T.line },

  // intake
  emptyWrap: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 32 },
  emptyIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: T.strip, borderWidth: 1, borderColor: T.line, alignItems: 'center', justifyContent: 'center' },
  caseRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: T.line },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  caseIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  multi: { fontSize: 12, fontWeight: '700', color: '#be123c', backgroundColor: '#fff1f2', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, overflow: 'hidden' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, height: 24, borderRadius: 12 },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  date: { fontSize: 12, color: T.sub },

  // protocol
  protocolHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: T.line },
  protocolIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: T.soft, alignItems: 'center', justifyContent: 'center' },
  protocolBody: { paddingHorizontal: 16, paddingBottom: 16 },
  ruleSep: { borderTopWidth: 1, borderTopColor: T.line, marginTop: 12, paddingTop: 12 },
  ruleTitle: { fontSize: 14, fontWeight: '600', color: T.text },
  ruleText: { fontSize: 13, lineHeight: 18, color: T.sub, marginTop: 2 },
});