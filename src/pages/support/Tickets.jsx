import { Alert } from '../../components/SkillCreditAlert';
// ═══════════════════════════════════════════════════════════════
//  MOBILE APP (Expo React Native) — src/pages/support/Tickets.jsx
//  Mobile version of the web Ticket queue. Same data + rules:
//    • support_tickets with the requester (support_tickets_user_id_fkey) and the assigned
//      agent (support_tickets_assigned_to_fkey), newest first
//    • filter: all / open / in_progress ("Investigating") / resolved, with counts
//    • search: subject, ticket id, requester name
//    • "Your ticket" (you are the requester) cannot be opened; otherwise View ticket / View record
//    • Export CSV of the filtered list (same columns)
//    • live: any change in support_tickets refetches without the loading state
//  Mobile notes: the CSV opens the phone's share sheet (no extra packages needed);
//  tapping a ticket opens the 'TicketChat' screen (web: /support/tickets/:id).
//  Yellow support theme, compact X-style typography (as UserDashboard).
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Image, Pressable, FlatList, ScrollView, TextInput, RefreshControl, Share, AppState, StyleSheet,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { AlertTriangle, ArrowDownToLine, ArrowRight, Search, Ticket as TicketIcon, X } from 'lucide-react-native';
import supabase from '../../supabaseClient';

const T = {
  text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4',
};
// the support (yellow) accent from the web page
const Y = { btn: '#facc15', btnPress: '#eab308', soft: '#fefce8', light: '#fef9c3', text: '#854d0e', border: '#fde047' };

// where "View ticket" goes (see App.jsx)
const TICKET_ROUTE = 'TicketChat';

const STATUS_META = {
  open:        { label: 'Open',          bg: '#fffbeb', fg: '#92400e', dot: '#f59e0b' },
  in_progress: { label: 'Investigating', bg: '#eff6ff', fg: '#1e40af', dot: '#3b82f6' },
  resolved:    { label: 'Resolved',      bg: '#ecfdf5', fg: '#065f46', dot: '#10b981' },
};
const FILTERS = ['all', 'open', 'in_progress', 'resolved'];

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const formatCreatedAt = (value) => (value
  ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  : '—');

export default function Tickets() {
  const navigation = useNavigation();
  const [currentUserId, setCurrentUserId] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const mounted = useRef(true);
  const reloadTimer = useRef(null);
  const firstFocus = useRef(true);

  // ─── same query as the web
  const fetchTickets = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*, user:user_profiles!support_tickets_user_id_fkey(id, full_name, avatar_url), agent:user_profiles!support_tickets_assigned_to_fkey(id, full_name)')
        .order('created_at', { ascending: false });
      if (error) console.error('Ticket queue fetch error:', error);
      if (data && mounted.current) setTickets(data);
    } catch (err) {
      console.error('Ticket queue fetch failed:', err);
    } finally {
      if (showLoading && mounted.current) setLoading(false);
    }
  }, []);

  // ─── first load + live updates
  useEffect(() => {
    mounted.current = true;
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (mounted.current) setCurrentUserId(user?.id ?? null);
      await fetchTickets();
    };
    init();

    // several events in a row refetch once
    const scheduleReload = () => {
      clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => fetchTickets(false), 300);
    };
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase.channel(`support_queue_updates_${suffix}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, scheduleReload)
      .subscribe();

    // back from the background: sockets may have slept, so catch up
    const appSub = AppState.addEventListener('change', (state) => { if (state === 'active') fetchTickets(false); });

    return () => {
      mounted.current = false;
      clearTimeout(reloadTimer.current);
      appSub.remove();
      supabase.removeChannel(channel);
    };
  }, [fetchTickets]);

  // tabs stay mounted, so refresh whenever this one is opened again
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    fetchTickets(false);
  }, [fetchTickets]));

  const onRefresh = async () => { setRefreshing(true); await fetchTickets(false); setRefreshing(false); };

  // ─── same filtering / counting as the web
  const filteredTickets = tickets.filter((ticket) => {
    const matchesTab = filter === 'all' || ticket.status === filter;
    const searchLower = searchQuery.trim().toLowerCase();
    const matchesSearch = !searchLower || [ticket.subject, ticket.id, ticket.user?.full_name]
      .some((value) => String(value ?? '').toLowerCase().includes(searchLower));
    return matchesTab && matchesSearch;
  });

  const counts = FILTERS.reduce((result, status) => {
    result[status] = status === 'all' ? tickets.length : tickets.filter((ticket) => ticket.status === status).length;
    return result;
  }, {});

  // ─── Export CSV: same columns; on a phone the CSV goes to the share sheet
  const handleExportCSV = async () => {
    if (filteredTickets.length === 0) { Alert.alert('No data to export.'); return; }
    const headers = ['Ticket ID', 'Subject', 'Status', 'User', 'Assigned Agent', 'Created At'];
    const rows = filteredTickets.map((ticket) => [
      ticket.id,
      ticket.subject,
      STATUS_META[ticket.status]?.label || ticket.status,
      ticket.user?.full_name || 'Unknown',
      ticket.agent?.full_name || 'Unassigned',
      formatCreatedAt(ticket.created_at),
    ].map(csvCell).join(','));
    const csv = [headers.map(csvCell).join(','), ...rows].join('\r\n');
    try {
      await Share.share({ title: `support-tickets-${new Date().toISOString().slice(0, 10)}.csv`, message: csv });
    } catch (err) {
      console.error('CSV export failed:', err);
    }
  };

  // ── the four filter tabs (counts double as the queue filter)
  const tabs = [
    { id: 'open', label: 'Open', count: counts.open },
    { id: 'in_progress', label: 'Investigating', count: counts.in_progress },
    { id: 'resolved', label: 'Resolved', count: counts.resolved },
    { id: 'all', label: 'All tickets', count: counts.all },
  ];

  const openTicket = (ticket) => navigation.navigate(TICKET_ROUTE, { id: ticket.id, ticketId: ticket.id });

  const Header = (
    <View>
      {/* page header */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Ticket queue</Text>
          <Text style={s.detail}>Find the right request, review ownership, and move it forward.</Text>
        </View>
        <Pressable
          onPress={handleExportCSV}
          disabled={filteredTickets.length === 0}
          accessibilityLabel="Export CSV"
          style={[s.exportBtn, filteredTickets.length === 0 && { opacity: 0.4 }]}
        >
          <ArrowDownToLine size={15} color={T.text} />
          <Text style={s.exportText}>Export</Text>
        </Pressable>
      </View>

      {/* filter chips (counts double as the filter) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
        {tabs.map((tab) => {
          const active = filter === tab.id;
          return (
            <Pressable key={tab.id} onPress={() => setFilter(tab.id)} accessibilityState={{ selected: active }} style={[s.chip, active && s.chipOn]}>
              <Text style={[s.chipText, active && { color: '#111827' }]}>{tab.label}</Text>
              <Text style={[s.chipCount, active && { color: '#111827' }, loading && { opacity: 0.3 }]}>{tab.count}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* search */}
      <View style={s.searchWrap}>
        <View style={s.searchBox}>
          <Search size={18} color={T.sub} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search tickets, people, or IDs"
            placeholderTextColor={T.sub}
            style={s.searchInput}
            returnKeyType="search"
            autoCorrect={false}
          />
          {!!searchQuery && <Pressable onPress={() => setSearchQuery('')} hitSlop={8}><X size={17} color={T.sub} /></Pressable>}
        </View>
        {!loading && (
          <Text style={[s.detail, { marginTop: 8 }]}>
            Showing <Text style={{ fontWeight: '700', color: T.text }}>{filteredTickets.length}</Text> of {tickets.length} tickets
          </Text>
        )}
      </View>
    </View>
  );

  const Empty = loading ? (
    <View accessibilityLabel="Loading tickets">
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={s.skelRow}>
          <View style={s.skelBlock} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={[s.skelLine, { width: '55%' }]} />
            <View style={[s.skelLine, { width: '30%' }]} />
          </View>
        </View>
      ))}
    </View>
  ) : (
    <View style={s.empty}>
      <TicketIcon size={40} color={T.border} />
      <Text style={s.emptyTitle}>No tickets found</Text>
      <Text style={s.emptySub}>{searchQuery ? 'No tickets matched your search or filter.' : 'There are no tickets in this queue.'}</Text>
      {!!searchQuery && (
        <Pressable onPress={() => setSearchQuery('')} style={s.clearBtn}>
          <Text style={s.clearBtnText}>Clear search</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: '#fff' }}
      contentContainerStyle={{ paddingBottom: 40 }}
      data={filteredTickets}
      keyExtractor={(ticket) => ticket.id}
      ListHeaderComponent={Header}
      ListEmptyComponent={Empty}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Y.text} colors={[Y.text]} />}
      renderItem={({ item: ticket }) => {
        const ownTicket = ticket.user_id === currentUserId;
        const status = STATUS_META[ticket.status] || STATUS_META.open;
        const isResolved = ticket.status === 'resolved';
        const isMine = Boolean(ticket.assigned_to) && ticket.assigned_to === currentUserId;

        return (
          <Pressable
            disabled={ownTicket}
            onPress={() => openTicket(ticket)}
            style={({ pressed }) => [s.row, ownTicket && { backgroundColor: '#fff7f8' }, pressed && { backgroundColor: '#f7f9f9' }]}
          >
            <View style={[s.accent, { backgroundColor: ownTicket ? '#f43f5e' : status.dot }]} />

            {/* subject + status */}
            <View style={s.line1}>
              <Text style={[s.rowTitle, { flex: 1 }]} numberOfLines={1}>{ticket.subject || 'Untitled request'}</Text>
              <View style={[s.statusPill, { backgroundColor: status.bg }]}>
                <View style={[s.statusDot, { backgroundColor: status.dot }]} />
                <Text style={[s.statusText, { color: status.fg }]}>{status.label}</Text>
              </View>
            </View>
            <Text style={s.detail}>Support request · #{String(ticket.id).split('-')[0]}</Text>

            {/* requester + assignment */}
            <View style={s.metaRow}>
              <View style={s.requester}>
                <View style={s.avatar}>
                  {ticket.user?.avatar_url
                    ? <Image source={{ uri: ticket.user.avatar_url }} style={{ width: 24, height: 24 }} />
                    : <Text style={{ fontSize: 11, fontWeight: '700', color: Y.text }}>{ticket.user?.full_name?.charAt(0) || 'U'}</Text>}
                </View>
                <Text style={s.requesterName} numberOfLines={1}>{ticket.user?.full_name || 'Unknown user'}</Text>
              </View>

              {ownTicket ? (
                <View style={[s.badge, { backgroundColor: '#fff1f2', borderColor: '#fecdd3' }]}>
                  <AlertTriangle size={12} color="#9f1239" />
                  <Text style={[s.badgeText, { color: '#9f1239' }]}>Your ticket</Text>
                </View>
              ) : ticket.agent ? (
                isMine ? (
                  <View style={[s.badge, { backgroundColor: Y.soft, borderColor: Y.border }]}>
                    <Text style={[s.badgeText, { color: '#713f12' }]}>Assigned to You</Text>
                  </View>
                ) : (
                  <Text style={s.agentName} numberOfLines={1}>{ticket.agent.full_name || 'Agent'}</Text>
                )
              ) : (
                <View style={[s.badge, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
                  <Text style={[s.badgeText, { color: '#92400e' }]}>Unassigned</Text>
                </View>
              )}
            </View>

            {/* created + action */}
            <View style={s.line3}>
              <Text style={s.detail}>{formatCreatedAt(ticket.created_at)}</Text>
              {ownTicket ? (
                <View style={[s.action, { backgroundColor: T.field }]}>
                  <Text style={[s.actionText, { color: T.sub }]}>Your ticket</Text>
                </View>
              ) : (
                <View style={[s.action, !isResolved ? { backgroundColor: Y.btn } : { borderWidth: 1, borderColor: T.border, backgroundColor: '#fff' }]}>
                  <Text style={[s.actionText, { color: !isResolved ? '#111827' : T.text }]}>{!isResolved ? 'View ticket' : 'View record'}</Text>
                  <ArrowRight size={14} color={!isResolved ? '#111827' : T.text} />
                </View>
              )}
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const s = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '700', color: T.text, letterSpacing: -0.3 },
  detail: { fontSize: 13, color: T.sub },
  rowTitle: { fontSize: 15, fontWeight: '600', color: T.text, lineHeight: 20 },

  // header
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: T.border, backgroundColor: '#fff', marginTop: 2 },
  exportText: { fontSize: 13, fontWeight: '600', color: T.text },

  // chips
  chipRow: { gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 34, borderRadius: 17, backgroundColor: T.field },
  chipOn: { backgroundColor: Y.btn },
  chipText: { fontSize: 13, fontWeight: '600', color: T.text },
  chipCount: { fontSize: 13, fontWeight: '600', color: T.sub },

  // search
  searchWrap: { paddingHorizontal: 16, paddingBottom: 10 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 42, borderRadius: 21, backgroundColor: T.field, paddingHorizontal: 16 },
  searchInput: { flex: 1, fontSize: 15, color: T.text, paddingVertical: 0 },

  // rows
  row: { paddingLeft: 16, paddingRight: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: T.line, backgroundColor: '#fff' },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  line1: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 11 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 10 },
  requester: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  avatar: { width: 24, height: 24, borderRadius: 12, overflow: 'hidden', backgroundColor: Y.light, alignItems: 'center', justifyContent: 'center' },
  requesterName: { fontSize: 13, fontWeight: '600', color: T.text, flexShrink: 1 },
  agentName: { fontSize: 13, color: T.sub, maxWidth: '45%' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  line3: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 10 },
  action: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 17 },
  actionText: { fontSize: 13, fontWeight: '700' },

  // empty + loading
  empty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 24, borderTopWidth: 1, borderTopColor: T.line },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: T.text, marginTop: 12 },
  emptySub: { fontSize: 14, color: T.sub, marginTop: 4, textAlign: 'center' },
  clearBtn: { height: 40, paddingHorizontal: 20, borderRadius: 20, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  clearBtnText: { fontSize: 14, fontWeight: '600', color: T.text },
  skelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 16, borderTopWidth: 1, borderTopColor: T.line },
  skelBlock: { width: 40, height: 40, borderRadius: 12, backgroundColor: T.field },
  skelLine: { height: 10, borderRadius: 5, backgroundColor: T.field },
});