// ═══════════════════════════════════════════════════════════════
//  MOBILE APP (Expo React Native) — src/pages/support/SupportDashboard.jsx
//  Mobile version of the web SupportDashboard. Same data + rules:
//    • support_tickets with the assigned agent (support_tickets_assigned_to_fkey)
//    • counts: open / in_progress / resolved / total, resolution rate
//    • top 5 agents by resolved tickets, their average rating, and the team rating
//      (average of each agent's own average)
//    • live: any change in support_tickets refetches (same realtime channel idea as the web)
//  Mobile extras: reloads when the tab is opened, when the app returns from the background,
//  and on pull-to-refresh.  Yellow support theme, compact X-style typography (as UserDashboard).
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Image, Pressable, ScrollView, RefreshControl, AppState, StyleSheet,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ArrowRight, CheckCircle2, ChevronRight, Clock3, Headphones, Star, Ticket, Users } from 'lucide-react-native';
import supabase from '../../supabaseClient';

const T = {
  text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4',
};
// the support (yellow) accent from the web page
const Y = { btn: '#facc15', soft: '#fefce8', light: '#fef9c3', text: '#854d0e', strong: '#a16207', ink: 'rgba(66,32,6,0.8)' };

// the tab to open for "Open ticket queue" (the Ticket queue tab in SupportLayout)
const TICKETS_TAB = 'Tickets';

export default function SupportDashboard() {
  const navigation = useNavigation();
  const [stats, setStats] = useState({ open: 0, inProgress: 0, resolved: 0, total: 0 });
  const [topAgents, setTopAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState(null);

  const mounted = useRef(true);
  const reloadTimer = useRef(null);
  const firstFocus = useRef(true);

  // ─── same queries and maths as the web
  const fetchDashboardData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profileData } = await supabase.from('user_profiles').select('full_name').eq('id', user.id).single();
        if (mounted.current) setProfile(profileData);
      }

      const { data: tickets, error } = await supabase
        .from('support_tickets')
        .select('status, rating, agent:user_profiles!support_tickets_assigned_to_fkey(id, full_name, avatar_url)');

      if (!mounted.current) return;
      if (!error && tickets) {
        setStats({
          open: tickets.filter((ticket) => ticket.status === 'open').length,
          inProgress: tickets.filter((ticket) => ticket.status === 'in_progress').length,
          resolved: tickets.filter((ticket) => ticket.status === 'resolved').length,
          total: tickets.length,
        });

        const agentCounts = {};
        tickets.filter((ticket) => ticket.status === 'resolved' && ticket.agent).forEach((ticket) => {
          const agentId = ticket.agent.id;
          if (!agentCounts[agentId]) agentCounts[agentId] = { ...ticket.agent, count: 0, totalStars: 0, ratedTickets: 0 };
          agentCounts[agentId].count += 1;
          if (ticket.rating) {
            agentCounts[agentId].totalStars += ticket.rating;
            agentCounts[agentId].ratedTickets += 1;
          }
        });
        setTopAgents(Object.values(agentCounts).sort((a, b) => b.count - a.count).slice(0, 5));
      } else if (error) {
        console.error('Dashboard fetch error:', error);
      }
    } catch (err) {
      console.error('Dashboard fetch failed:', err);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  // ─── first load + live updates (support_tickets)
  useEffect(() => {
    mounted.current = true;
    fetchDashboardData();

    // several events in a row (e.g. one ticket updated twice) refetch once
    const scheduleReload = () => {
      clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(fetchDashboardData, 300);
    };
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase.channel(`support_dashboard_stats_${suffix}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, scheduleReload)
      .subscribe();

    // back from the background: sockets may have slept, so catch up
    const appSub = AppState.addEventListener('change', (state) => { if (state === 'active') fetchDashboardData(); });

    return () => {
      mounted.current = false;
      clearTimeout(reloadTimer.current);
      appSub.remove();
      supabase.removeChannel(channel);
    };
  }, [fetchDashboardData]);

  // tabs stay mounted, so refresh whenever this one is opened again
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    fetchDashboardData();
  }, [fetchDashboardData]));

  const onRefresh = async () => { setRefreshing(true); await fetchDashboardData(); setRefreshing(false); };
  const openQueue = () => navigation.navigate(TICKETS_TAB);

  // ─── loading (same words as the web)
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={s.header}>
          <Text style={s.greeting}>Welcome back.</Text>
          <Text style={s.detail}>Loading the latest figures…</Text>
        </View>
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <View style={[s.skeleton, { height: 220 }]} />
          <View style={[s.skeleton, { height: 110, backgroundColor: Y.light }]} />
          <View style={[s.skeleton, { height: 80 }]} />
        </View>
      </View>
    );
  }

  const resolutionRate = stats.total ? Math.round((stats.resolved / stats.total) * 100) : 0;

  // ── display-only values derived from the stats above (same as the web)
  const queues = [
    { label: 'Open queue',  note: 'Waiting for an agent', count: stats.open,       Icon: Ticket,       tone: { bg: '#fffbeb', fg: '#b45309' }, bar: '#f59e0b' },
    { label: 'In progress', note: 'Being handled now',    count: stats.inProgress, Icon: Clock3,       tone: { bg: '#eff6ff', fg: '#1d4ed8' }, bar: '#3b82f6' },
    { label: 'Resolved',    note: 'Successfully closed',  count: stats.resolved,   Icon: CheckCircle2, tone: { bg: '#ecfdf5', fg: '#047857' }, bar: '#10b981' },
  ];

  // Team rating: add up each agent's own average rating, then divide by how many agents have a rating.
  const ratedAgents = topAgents.filter((agent) => agent.ratedTickets > 0);
  const overallRating = ratedAgents.length > 0
    ? (ratedAgents.reduce((sum, agent) => sum + agent.totalStars / agent.ratedTickets, 0) / ratedAgents.length).toFixed(1)
    : '—';

  const maxCount = Math.max(...topAgents.map((item) => item.count), 1);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#fff' }}
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Y.strong} colors={[Y.strong]} />}
    >
      {/* ── PAGE HEADER */}
      <View style={s.header}>
        <Text style={s.greeting}>Welcome back{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}.</Text>
        <Text style={s.detail}>Here’s the current pulse of your support team and customer queue.</Text>
        <Pressable onPress={openQueue} style={({ pressed }) => [s.cta, pressed && { backgroundColor: '#eab308' }]}>
          <Text style={s.ctaText}>Open ticket queue</Text>
          <ArrowRight size={16} color="#111827" />
        </Pressable>
      </View>

      {/* ── ROW 1: WORK QUEUES (the only place the open / in progress / resolved counts appear) */}
      <View style={s.laneHead}>
        <Text style={s.title}>Ticket queues</Text>
        <Text style={s.detail}>Share of all requests</Text>
      </View>
      {queues.map(({ label, note, count, Icon, tone, bar }) => {
        const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
        return (
          <Pressable key={label} onPress={openQueue} accessibilityLabel={`${label}, ${count}, ${pct}% of all requests`}
            style={({ pressed }) => [s.queueRow, pressed && { backgroundColor: '#f7f9f9' }]}>
            <View style={[s.queueIcon, { backgroundColor: tone.bg }]}><Icon size={20} color={tone.fg} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>{label}</Text>
              <Text style={s.detail}>{note}</Text>
              <View style={s.track}><View style={[s.fill, { width: `${pct}%`, backgroundColor: bar }]} /></View>
            </View>
            <Text style={s.count}>{count}</Text>
            <ChevronRight size={16} color={T.border} />
          </Pressable>
        );
      })}

      {/* ── RESOLUTION RATE */}
      <View style={s.rateCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={s.rateLabel}>Resolution rate</Text>
          <View style={s.rateIcon}><CheckCircle2 size={16} color="#111827" /></View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2, marginTop: 10 }}>
          <Text style={s.rateValue}>{resolutionRate}</Text>
          <Text style={[s.rateLabel, { fontWeight: '700' }]}>%</Text>
        </View>
        <Text style={s.rateNote}>Share of all support requests that have been successfully closed.</Text>
      </View>

      {/* ── WORKLOAD */}
      <View style={s.laneHead}><Text style={s.title}>Workload</Text></View>
      <View style={s.workload}>
        <View style={{ flex: 1 }}>
          <View style={s.workLabelRow}><Headphones size={14} color={T.sub} /><Text style={s.detail}>All requests</Text></View>
          <Text style={s.workValue}>{stats.total}</Text>
        </View>
        <View style={s.workDivider} />
        <View style={{ flex: 1, paddingLeft: 16 }}>
          <View style={s.workLabelRow}><Star size={14} color={T.sub} /><Text style={s.detail}>Avg. rating</Text></View>
          <Text style={s.workValue}>{overallRating}</Text>
        </View>
      </View>

      {/* ── ROW 2: AGENT PERFORMANCE */}
      <View style={[s.laneHead, { marginTop: 8 }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Agent performance</Text>
          <Text style={s.detail}>Resolved tickets and customer ratings</Text>
        </View>
        {topAgents.length > 0 && <Text style={s.topChip}>Top {topAgents.length}</Text>}
      </View>

      {topAgents.length === 0 ? (
        <View style={s.empty}>
          <Users size={40} color={T.border} />
          <Text style={s.emptyTitle}>No resolved tickets yet</Text>
          <Text style={s.emptySub}>Agent performance will appear here.</Text>
        </View>
      ) : topAgents.map((agent, index) => {
        const avgRating = agent.ratedTickets > 0 ? (agent.totalStars / agent.ratedTickets).toFixed(1) : '—';
        return (
          <View key={agent.id} style={s.agentRow}>
            <View style={s.accent} />
            <Text style={s.rank}>{String(index + 1).padStart(2, '0')}</Text>
            <View style={s.avatar}>
              {agent.avatar_url
                ? <Image source={{ uri: agent.avatar_url }} style={{ width: 40, height: 40 }} />
                : <Text style={{ fontSize: 15, fontWeight: '700', color: Y.text }}>{agent.full_name?.charAt(0) || 'A'}</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Text style={[s.rowTitle, { flexShrink: 1 }]} numberOfLines={1}>{agent.full_name || 'Support agent'}</Text>
                <Text style={s.detail}>{agent.count} resolved</Text>
              </View>
              <View style={s.track}>
                <View style={[s.fill, { width: `${Math.max(8, (agent.count / maxCount) * 100)}%`, backgroundColor: Y.btn }]} />
              </View>
            </View>
            <View style={s.ratingBox}>
              <Star size={13} color="#f59e0b" fill="#fbbf24" />
              <Text style={s.ratingText}>{avgRating}</Text>
            </View>
          </View>
        );
      })}

      {/* ── NEXT STEP */}
      <View style={s.nextCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={s.nextIcon}><Headphones size={16} color={Y.strong} /></View>
          <Text style={[s.rowTitle, { flex: 1 }]}>Stay on top of every request</Text>
        </View>
        <Text style={s.nextBody}>
          A calmer queue starts with a clear next step. Review unassigned requests, pick up a ticket, and keep customers moving toward a resolution.
        </Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2 },
  detail: { fontSize: 13, color: T.sub },
  rowTitle: { fontSize: 15, fontWeight: '600', color: T.text, lineHeight: 20 },

  // header
  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, gap: 4 },
  greeting: { fontSize: 20, fontWeight: '700', color: T.text, letterSpacing: -0.3 },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 22, backgroundColor: Y.btn, marginTop: 12 },
  ctaText: { fontSize: 15, fontWeight: '700', color: '#111827' },
  skeleton: { borderRadius: 12, backgroundColor: T.field },

  laneHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },

  // queues
  queueRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: T.line },
  queueIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 20, fontWeight: '700', color: T.text, minWidth: 28, textAlign: 'right' },
  track: { height: 6, borderRadius: 3, backgroundColor: T.field, overflow: 'hidden', marginTop: 8 },
  fill: { height: '100%', borderRadius: 3 },

  // resolution rate
  rateCard: { marginHorizontal: 16, marginTop: 16, backgroundColor: Y.btn, borderRadius: 12, padding: 16 },
  rateLabel: { fontSize: 13, fontWeight: '600', color: Y.ink },
  rateIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.1)', alignItems: 'center', justifyContent: 'center' },
  rateValue: { fontSize: 32, fontWeight: '700', color: '#111827', letterSpacing: -0.6 },
  rateNote: { fontSize: 13, color: Y.ink, marginTop: 6, lineHeight: 18 },

  // workload
  workload: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: T.line },
  workDivider: { width: 1, height: 36, backgroundColor: T.line },
  workLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  workValue: { fontSize: 20, fontWeight: '700', color: T.text, marginTop: 4 },

  // agents
  topChip: { fontSize: 12, fontWeight: '600', color: T.sub, backgroundColor: T.field, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, overflow: 'hidden' },
  agentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: T.line },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: Y.btn },
  rank: { width: 20, textAlign: 'center', fontSize: 12, fontWeight: '600', color: T.sub },
  avatar: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden', backgroundColor: Y.light, alignItems: 'center', justifyContent: 'center' },
  ratingBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, minWidth: 44 },
  ratingText: { fontSize: 13, fontWeight: '700', color: T.text },

  empty: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24, borderTopWidth: 1, borderTopColor: T.line },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: T.text, marginTop: 12 },
  emptySub: { fontSize: 14, color: T.sub, marginTop: 4, textAlign: 'center' },

  // next step
  nextCard: { marginHorizontal: 16, marginTop: 20, borderWidth: 1, borderColor: T.line, borderRadius: 12, padding: 16 },
  nextIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: Y.soft, alignItems: 'center', justifyContent: 'center' },
  nextBody: { fontSize: 13, color: T.sub, lineHeight: 19, marginTop: 12 },
});