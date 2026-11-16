import { Alert } from '../../components/SkillCreditAlert';
// ═══════════════════════════════════════════════════════════════
//  MOBILE APP (Expo React Native) — src/pages/support/SupportLogs.jsx
//  Mobile version of the web Audit logs. Same data + rules:
//    • access: Admin or Support only (otherwise "Unauthorized access…" and back to the user app)
//    • support_logs with the acting agent (support_id) and the target user (target_user_id), newest first
//    • search: agent name, target name, details   • filter by action, with counts
//    • entries grouped by day (Today / Yesterday / full date)
//    • each sign-out is matched with that agent's latest sign-in to get the session length
//    • record details: people involved, "Action summary / Agent remarks" split on ". Notes: ",
//      record id, ticket id, session length
//  Mobile differences: a plain day-grouped list (no timeline rail), the centered modal became a
//  bottom sheet, and new log entries appear live (support_logs INSERT) without a loading flash.
//  Yellow support theme, compact X-style typography (as UserDashboard).
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Image, Pressable, SectionList, ScrollView, TextInput, Modal, RefreshControl, AppState, Platform, StyleSheet,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertOctagon, CheckCircle2, FileText, Headphones, LifeBuoy, LogIn, LogOut, RotateCcw, Search, Wallet, X,
} from 'lucide-react-native';
import supabase from '../../supabaseClient';

const T = {
  text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4',
};
// the support (yellow) accent from the web page
const Y = { btn: '#facc15', soft: '#fefce8', light: '#fef9c3', text: '#854d0e', border: '#fef08a' };

// the web "/dashboard" (user app), used when access is denied
const USER_APP_ROUTE = 'User';

// ── ACTION TYPE STYLES (SUPPORT THEME) ──
const ACTION_META = {
  SYSTEM_LOGIN:    { label: 'System Login',       Icon: LogIn,        color: '#065f46', bg: '#ecfdf5', border: '#a7f3d0' },
  SYSTEM_LOGOUT:   { label: 'System Logout',      Icon: LogOut,       color: '#374151', bg: '#f9fafb', border: '#e5e7eb' },
  TICKET_CLAIMED:  { label: 'Claimed Ticket',     Icon: Headphones,   color: '#6b21a8', bg: '#faf5ff', border: '#e9d5ff' },
  TICKET_RELEASED: { label: 'Released Ticket',    Icon: RotateCcw,    color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  RESOLVE_TICKET:  { label: 'Resolved Ticket',    Icon: CheckCircle2, color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
  MANUAL_REFUND:   { label: 'Manual Refund',      Icon: Wallet,       color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  ESCALATE_TICKET: { label: 'Escalated to Admin', Icon: AlertOctagon, color: '#9f1239', bg: '#fff1f2', border: '#fecdd3' },
  DEFAULT:         { label: 'System Action',      Icon: LifeBuoy,     color: '#374151', bg: '#f9fafb', border: '#e5e7eb' },
};
const getActionMeta = (type) => ACTION_META[type] || ACTION_META.DEFAULT;

// the filter chips (same options as the web)
const FILTERS = [
  { id: 'ALL', label: 'All actions' },
  { id: 'SYSTEM_LOGIN', label: 'Logins' },
  { id: 'SYSTEM_LOGOUT', label: 'Logouts' },
  { id: 'TICKET_CLAIMED', label: 'Tickets claimed' },
  { id: 'TICKET_RELEASED', label: 'Tickets released' },
  { id: 'RESOLVE_TICKET', label: 'Resolved tickets' },
];

// "Today", "Yesterday", or a full date for a day heading.
const getDayLabel = (dateStr) => {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};

// 135 minutes -> "2h 15m".
const formatDuration = (ms) => {
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 1) return 'under 1 min';
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
};

const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fullDateTime = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const shortId = (id) => String(id || '').split('-')[0];

// avatar image with an initial as fallback
const Avatar = ({ url, name, fallback, size, bg, fg, border }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: bg, borderWidth: 1, borderColor: border, alignItems: 'center', justifyContent: 'center' }}>
    {url
      ? <Image source={{ uri: url }} style={{ width: size, height: size }} />
      : <Text style={{ fontSize: size * 0.38, fontWeight: '700', color: fg }}>{name?.charAt(0) || fallback}</Text>}
  </View>
);

export default function SupportLogs() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logs, setLogs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState('ALL');
  const [selectedLog, setSelectedLog] = useState(null); // the record sheet

  const mounted = useRef(true);
  const reloadTimer = useRef(null);
  const firstFocus = useRef(true);

  // ── same query as the web
  const fetchLogs = useCallback(async () => {
    const { data, error } = await supabase
      .from('support_logs')
      .select(`
        *,
        support:support_id(full_name, avatar_url, role),
        target:target_user_id(full_name, avatar_url)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching support logs:', error);
    } else if (mounted.current) {
      setLogs(data || []);
    }
  }, []);

  // ── first load: access check (same rules as the web), then the logs
  useEffect(() => {
    mounted.current = true;
    const init = async () => {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return; // signed out: App.jsx sends you back to Login

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!profile || (profile.role !== 'Admin' && profile.role !== 'Support')) {
        Alert.alert('Unauthorized access', 'Admin or Support privileges required.');
        navigation.navigate(USER_APP_ROUTE);
        return;
      }

      await fetchLogs();
      if (mounted.current) setLoading(false);
    };
    init().catch((e) => { console.error('Support logs init failed:', e); if (mounted.current) setLoading(false); });

    // live: a new entry appears without a loading flash
    const scheduleReload = () => {
      clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(fetchLogs, 300);
    };
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase.channel(`support_logs_live_${suffix}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_logs' }, scheduleReload)
      .subscribe();

    // back from the background: sockets may have slept, so catch up
    const appSub = AppState.addEventListener('change', (state) => { if (state === 'active') fetchLogs(); });

    return () => {
      mounted.current = false;
      clearTimeout(reloadTimer.current);
      appSub.remove();
      supabase.removeChannel(channel);
    };
  }, [fetchLogs, navigation]);

  // tabs stay mounted, so refresh whenever this one is opened again
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    fetchLogs();
  }, [fetchLogs]));

  const onRefresh = async () => { setRefreshing(true); await fetchLogs(); setRefreshing(false); };

  // ── FILTERING LOGIC (same as the web)
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchSearch =
        (log.support?.full_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (log.target?.full_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (log.details?.toLowerCase() || '').includes(searchQuery.toLowerCase());

      const matchAction = filterAction === 'ALL' || log.action_type === filterAction;

      return matchSearch && matchAction;
    });
  }, [logs, searchQuery, filterAction]);

  // ── chip counts, day grouping, and session lengths (same as the web)
  const actionCounts = useMemo(() => {
    const counts = { ALL: logs.length };
    logs.forEach((log) => { counts[log.action_type] = (counts[log.action_type] || 0) + 1; });
    return counts;
  }, [logs]);

  const groupedByDay = useMemo(() => {
    const groups = [];
    filteredLogs.forEach((log) => {
      const key = new Date(log.created_at).toDateString();
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.items.push(log);
      else groups.push({ key, label: getDayLabel(log.created_at), items: [log] });
    });
    return groups;
  }, [filteredLogs]);

  // Each sign-out is matched with that agent's most recent sign-in to show how long the session lasted.
  const sessionLengths = useMemo(() => {
    const lengths = {};
    const openSignIn = {};
    [...logs].reverse().forEach((log) => {
      if (log.action_type === 'SYSTEM_LOGIN') {
        openSignIn[log.support_id] = log.created_at;
      } else if (log.action_type === 'SYSTEM_LOGOUT' && openSignIn[log.support_id]) {
        lengths[log.id] = new Date(log.created_at) - new Date(openSignIn[log.support_id]);
        delete openSignIn[log.support_id];
      }
    });
    return lengths;
  }, [logs]);

  const sections = groupedByDay.map((group) => ({ key: group.key, title: group.label, data: group.items }));

  // ── header: title, search, chips
  const Header = (
    <View>
      <View style={s.header}>
        <Text style={s.title}>Audit logs</Text>
        <Text style={s.detail}>
          {loading
            ? 'Checking your access and loading the latest actions…'
            : 'Everything the support team has done, newest first. Tap an entry to see the full record.'}
        </Text>
      </View>

      <View style={s.searchWrap}>
        <View style={s.searchBox}>
          <Search size={18} color={T.sub} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by agent, user, or details"
            placeholderTextColor={T.sub}
            style={s.searchInput}
            returnKeyType="search"
            autoCorrect={false}
          />
          {!!searchQuery && <Pressable onPress={() => setSearchQuery('')} hitSlop={8}><X size={17} color={T.sub} /></Pressable>}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
        {FILTERS.map((f) => {
          const active = filterAction === f.id;
          return (
            <Pressable key={f.id} onPress={() => setFilterAction(f.id)} accessibilityState={{ selected: active }} style={[s.chip, active && s.chipOn]}>
              <Text style={[s.chipText, active && { color: '#111827' }]}>{f.label}</Text>
              <Text style={[s.chipCount, active && { color: '#111827' }, loading && { opacity: 0.3 }]}>{actionCounts[f.id] || 0}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {!loading && (
        <Text style={[s.detail, s.showing]}>
          Showing <Text style={{ fontWeight: '700', color: T.text }}>{filteredLogs.length}</Text> of {logs.length} actions
        </Text>
      )}
    </View>
  );

  const Empty = loading ? (
    <View accessibilityLabel="Loading support logs">
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={s.skelRow}>
          <View style={s.skelCircle} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={[s.skelLine, { width: '45%' }]} />
            <View style={[s.skelLine, { width: '70%' }]} />
          </View>
        </View>
      ))}
    </View>
  ) : (
    <View style={s.empty}>
      <FileText size={40} color={T.border} />
      <Text style={s.emptyTitle}>No logs found</Text>
      <Text style={s.emptySub}>Try adjusting your search or filter settings.</Text>
    </View>
  );

  // ── the record sheet content (same details as the web modal)
  const renderDetails = (details) => {
    if (!details) return <Text style={{ fontSize: 14, color: T.sub, fontStyle: 'italic' }}>No additional details were provided for this action.</Text>;
    if (details.includes('. Notes: ')) {
      const parts = details.split('. Notes: ');
      const summary = parts[0];
      const notes = parts.slice(1).join('. Notes: ');
      return (
        <View style={{ gap: 12 }}>
          <View>
            <Text style={s.miniLabel}>Action summary</Text>
            <Text style={{ fontSize: 15, fontWeight: '600', color: T.text, lineHeight: 21 }}>{summary}</Text>
          </View>
          <View style={s.remarks}>
            <Text style={s.miniLabel}>Agent remarks</Text>
            <Text style={{ fontSize: 14, fontStyle: 'italic', color: T.text, lineHeight: 20 }}>“{notes}”</Text>
          </View>
        </View>
      );
    }
    return <Text style={{ fontSize: 15, fontWeight: '500', color: T.text, lineHeight: 21 }}>{details}</Text>;
  };

  const sel = selectedLog;
  const selMeta = sel ? getActionMeta(sel.action_type) : null;
  const SelIcon = selMeta?.Icon;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <SectionList
        sections={loading ? [] : sections}
        keyExtractor={(log) => String(log.id)}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={Header}
        ListEmptyComponent={Empty}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Y.text} colors={[Y.text]} />}
        renderSectionHeader={({ section }) => (
          <View style={s.dayHead}>
            <View style={s.dayDot} />
            <Text style={s.dayTitle}>{section.title}</Text>
            <Text style={s.detail}>{section.data.length}</Text>
          </View>
        )}
        renderItem={({ item: log }) => {
          const meta = getActionMeta(log.action_type);
          const ActionIcon = meta.Icon;
          return (
            <Pressable onPress={() => setSelectedLog(log)} style={({ pressed }) => [s.row, pressed && { backgroundColor: '#f7f9f9' }]}>
              <View style={[s.iconCircle, { backgroundColor: meta.bg, borderColor: meta.border }]}>
                <ActionIcon size={18} color={meta.color} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={[s.rowTitle, { flexShrink: 1 }]} numberOfLines={1}>{meta.label}</Text>
                  <Text style={s.detail}>{timeOf(log.created_at)}</Text>
                </View>
                <Text style={s.detail} numberOfLines={1}>
                  {log.support?.full_name || 'Unknown Agent'}{log.target?.full_name ? ` acted on ${log.target.full_name}` : ''}
                </Text>
                <Text style={s.snippet} numberOfLines={2}>{log.details || 'No additional details provided.'}</Text>
              </View>
            </Pressable>
          );
        }}
      />

      {/* ── SUPPORT RECORD (was the centered modal) */}
      <Modal visible={!!sel} transparent animationType="slide" onRequestClose={() => setSelectedLog(null)}>
        <View style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setSelectedLog(null)} />
          {!!sel && (
            <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
              <View style={s.grabber} />

              <View style={s.sheetHead}>
                <View style={[s.sheetIcon, { backgroundColor: selMeta.bg, borderColor: selMeta.border }]}>
                  <SelIcon size={20} color={selMeta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.detail}>Support record</Text>
                  <Text style={s.sheetTitle} numberOfLines={1}>{selMeta.label}</Text>
                  <Text style={s.detail}>{fullDateTime(sel.created_at)}</Text>
                </View>
                <Pressable onPress={() => setSelectedLog(null)} hitSlop={10} accessibilityLabel="Close"><X size={22} color={T.sub} /></Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8, gap: 16 }}>
                {/* people involved */}
                <View style={{ gap: 10 }}>
                  <View style={s.personCard}>
                    <Text style={s.miniLabel}>Action by</Text>
                    <View style={s.personRow}>
                      <Avatar url={sel.support?.avatar_url} name={sel.support?.full_name} fallback="S" size={38} bg={Y.light} fg={Y.text} border={Y.border} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.rowTitle} numberOfLines={1}>{sel.support?.full_name || 'Unknown Agent'}</Text>
                        <Text style={s.detail}>{sel.support?.role || 'Support'} · #{shortId(sel.support_id)}</Text>
                      </View>
                    </View>
                  </View>

                  {sel.target ? (
                    <View style={s.personCard}>
                      <Text style={s.miniLabel}>Target user</Text>
                      <View style={s.personRow}>
                        <Avatar url={sel.target.avatar_url} name={sel.target.full_name} fallback="U" size={38} bg={T.field} fg={T.sub} border={T.border} />
                        <View style={{ flex: 1 }}>
                          <Text style={s.rowTitle} numberOfLines={1}>{sel.target.full_name}</Text>
                          <Text style={s.detail}>#{shortId(sel.target_user_id)}</Text>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View style={s.noTarget}><Text style={s.detail}>No specific target user</Text></View>
                  )}
                </View>

                {/* details */}
                <View>
                  <Text style={s.miniLabel}>Resolution details</Text>
                  <View style={s.detailsBox}>{renderDetails(sel.details)}</View>
                </View>

                {/* metadata */}
                <View>
                  <Text style={s.miniLabel}>System metadata</Text>
                  <View style={s.metaBox}>
                    <View style={s.metaRow}>
                      <Text style={s.detail}>Record ID</Text>
                      <Text style={s.mono} selectable>{sel.id}</Text>
                    </View>
                    {!!sel.ticket_id && (
                      <View style={s.metaRow}>
                        <Text style={s.detail}>Support ticket ID</Text>
                        <Text style={s.mono} selectable>{sel.ticket_id}</Text>
                      </View>
                    )}
                    {sessionLengths[sel.id] != null && (
                      <View style={s.metaRow}>
                        <Text style={s.detail}>Session length</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: T.text }}>{formatDuration(sessionLengths[sel.id])}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '700', color: T.text, letterSpacing: -0.3 },
  detail: { fontSize: 13, color: T.sub },
  rowTitle: { fontSize: 15, fontWeight: '600', color: T.text, lineHeight: 20 },

  // header
  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, gap: 4 },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 12 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 42, borderRadius: 21, backgroundColor: T.field, paddingHorizontal: 16 },
  searchInput: { flex: 1, fontSize: 15, color: T.text, paddingVertical: 0 },
  chipRow: { gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 34, borderRadius: 17, backgroundColor: T.field },
  chipOn: { backgroundColor: Y.btn },
  chipText: { fontSize: 13, fontWeight: '600', color: T.text },
  chipCount: { fontSize: 13, fontWeight: '600', color: T.sub },
  showing: { paddingHorizontal: 16, paddingBottom: 6 },

  // day groups + rows
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, backgroundColor: '#fff' },
  dayDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#eab308' },
  dayTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: T.text },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: T.line, backgroundColor: '#fff' },
  iconCircle: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  snippet: { fontSize: 13, color: T.text, lineHeight: 18, marginTop: 4 },

  // empty + loading
  empty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 24, borderTopWidth: 1, borderTopColor: T.line },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: T.text, marginTop: 12 },
  emptySub: { fontSize: 14, color: T.sub, marginTop: 4, textAlign: 'center' },
  skelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 16, borderTopWidth: 1, borderTopColor: T.line },
  skelCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.field },
  skelLine: { height: 10, borderRadius: 5, backgroundColor: T.field },

  // record sheet
  overlay: { flex: 1, backgroundColor: 'rgba(15,20,25,0.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8, maxHeight: '88%' },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: T.border, marginBottom: 6 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.line },
  sheetIcon: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2 },
  miniLabel: { fontSize: 13, fontWeight: '600', color: T.sub, marginBottom: 6 },
  personCard: { borderWidth: 1, borderColor: T.line, borderRadius: 12, padding: 12 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  noTarget: { borderWidth: 1, borderStyle: 'dashed', borderColor: T.border, borderRadius: 12, padding: 12, alignItems: 'center' },
  detailsBox: { borderWidth: 1, borderColor: T.line, borderRadius: 12, padding: 14 },
  remarks: { backgroundColor: '#f7f9f9', borderRadius: 10, padding: 12 },
  metaBox: { borderWidth: 1, borderColor: T.line, borderRadius: 12, padding: 12, gap: 10 },
  metaRow: { gap: 4 },
  mono: { fontSize: 12, color: T.sub, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});