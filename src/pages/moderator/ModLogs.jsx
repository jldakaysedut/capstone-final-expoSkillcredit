import { Alert } from '../../components/SkillCreditAlert';
// ═══════════════════════════════════════════════════════════════
//  MOBILE APP (Expo React Native) — src/pages/moderator/ModLogs.jsx
//  Same access check (Admin / Moderator only), same mod_logs query, search, action
//  filter, day grouping and sign-in -> sign-out session lengths as the web.
//  Mobile layout: search + filter chips, day sections with compact entries (the
//  web timeline rail is gone) and the side panel became a bottom sheet.
//  Added pull-to-refresh.
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, Image, Pressable, SectionList, FlatList, TextInput, Modal, ScrollView, RefreshControl, AppState, ActivityIndicator, Platform, StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertTriangle, BookOpen, CheckCircle, FileText, Hash, LogIn, LogOut, Scale, Search, ShieldAlert, ShieldCheck, Trash2, UploadCloud, X,
} from 'lucide-react-native';
import supabase from '../../supabaseClient';

const T = {
  text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4',
  brand: '#047857', soft: '#ecfdf5', strip: '#f7f9f9',
};

// ── ACTION TYPE STYLES (tailwind colors -> hex). `accent` is the colored left edge.
const ACTION_META = {
  SYSTEM_LOGIN:       { label: 'System Login',          icon: LogIn,         color: '#065f46', bg: '#ecfdf5', border: '#a7f3d0', accent: '#10b981' },
  SYSTEM_LOGOUT:      { label: 'System Logout',        icon: LogOut,        color: '#374151', bg: '#f9fafb', border: '#e5e7eb', accent: '#9ca3af' },
  REPORT_DISMISSED:   { label: 'Dismissed Report',     icon: CheckCircle,   color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe', accent: '#3b82f6' },
  USER_WARNED:        { label: 'Issued Warning',       icon: AlertTriangle, color: '#92400e', bg: '#fffbeb', border: '#fde68a', accent: '#f59e0b' },
  USER_PENALIZED:     { label: 'Account Penalty (12h)', icon: ShieldAlert,  color: '#9a3412', bg: '#fff7ed', border: '#fed7aa', accent: '#f97316' },
  ESCALATED_TO_ADMIN: { label: 'Escalated to Admin',   icon: UploadCloud,   color: '#9f1239', bg: '#fff1f2', border: '#fecdd3', accent: '#f43f5e' },
  DELETE_POST:        { label: 'Deleted Content',      icon: Trash2,        color: '#9f1239', bg: '#fff1f2', border: '#fecdd3', accent: '#f43f5e' },
  RESOLVE_DISPUTE:    { label: 'Resolved Dispute',     icon: Scale,         color: '#6b21a8', bg: '#faf5ff', border: '#e9d5ff', accent: '#a855f7' },
  SKILL_REVIEW:       { label: 'Skill Reviewed',       icon: BookOpen,      color: '#3730a3', bg: '#eef2ff', border: '#c7d2fe', accent: '#6366f1' },
  DEFAULT:            { label: 'System Action',        icon: ShieldCheck,   color: '#374151', bg: '#f9fafb', border: '#e5e7eb', accent: '#9ca3af' },
};

const getActionMeta = (type) => ACTION_META[type] || ACTION_META.DEFAULT;

// Display-only: the filter chips (same options the dropdown used to offer).
const FILTERS = [
  { id: 'ALL', label: 'All actions' },
  { id: 'SYSTEM_LOGIN', label: 'Logins' },
  { id: 'SYSTEM_LOGOUT', label: 'Logouts' },
  { id: 'REPORT_DISMISSED', label: 'Dismissed reports' },
  { id: 'USER_WARNED', label: 'Warnings' },
  { id: 'USER_PENALIZED', label: 'Penalties' },
  { id: 'ESCALATED_TO_ADMIN', label: 'Escalations' },
  { id: 'DELETE_POST', label: 'Deleted content' },
  { id: 'RESOLVE_DISPUTE', label: 'Disputes' },
  { id: 'SKILL_REVIEW', label: 'Skill reviews' },
];

// Display-only: "Today", "Yesterday", or a full date for a day heading.
const getDayLabel = (dateStr) => {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};

// Display-only: 135 minutes -> "2h 15m".
const formatDuration = (ms) => {
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 1) return 'under 1 min';
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
};

const fmtDateTime = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// Display-only: avatar image with an initial as fallback.
function Avatar({ url, name, fallback, size, bg, border, fg }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: bg, borderWidth: 1, borderColor: border, alignItems: 'center', justifyContent: 'center' }}>
      {url
        ? <Image source={{ uri: url }} style={{ width: size, height: size }} />
        : <Text style={{ fontSize: size * 0.4, fontWeight: '700', color: fg }}>{name?.charAt(0) || fallback}</Text>}
    </View>
  );
}

export default function ModLogs() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logs, setLogs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState('ALL');
  const lastFetch = useRef(0);

  // ── DETAIL SHEET STATE ──
  const [selectedLog, setSelectedLog] = useState(null);

  // silent = background refresh (no loading screen)
  const fetchModLogs = async (silent = false) => {
    if (!silent) setLoading(true);
    lastFetch.current = Date.now();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return; // signed out: App.jsx sends you back to Login

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!profile || (profile.role !== 'Admin' && profile.role !== 'Moderator')) {
        Alert.alert('Unauthorized access. Admin or Moderator privileges required.');
        navigation.navigate('User');
        return;
      }

      const { data, error } = await supabase
        .from('mod_logs')
        .select(`
          *,
          moderator:moderator_id(full_name, avatar_url, role),
          target:target_user_id(full_name, avatar_url)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching mod logs:', error);
      } else {
        setLogs(data || []);
      }

      setLoading(false);
    } catch (err) {
      // Without this, a thrown error would leave the page on the loading screen forever.
      console.error('Error loading audit logs:', err);
      setLoading(false);
    }
  };

  useEffect(() => { fetchModLogs(); }, []);

  // coming back to this tab, or back to the app -> quietly refresh
  useEffect(() => {
    const unsubFocus = navigation.addListener('focus', () => {
      if (Date.now() - lastFetch.current > 3000) fetchModLogs(true);
    });
    const appSub = AppState.addEventListener('change', (state) => { if (state === 'active') fetchModLogs(true); });
    const refreshRealtime = () => fetchModLogs(true);
    const liveChannel = supabase.channel('mod_modlogs_live_' + Date.now())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mod_logs' }, refreshRealtime)
      .subscribe();
    return () => { unsubFocus(); appSub.remove(); supabase.removeChannel(liveChannel); };
  }, [navigation]);

  const onRefresh = async () => { setRefreshing(true); await fetchModLogs(true); setRefreshing(false); };

  // ── FILTERING LOGIC ──
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchSearch =
        (log.moderator?.full_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (log.target?.full_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (log.details?.toLowerCase() || '').includes(searchQuery.toLowerCase());

      const matchAction = filterAction === 'ALL' || log.action_type === filterAction;

      return matchSearch && matchAction;
    });
  }, [logs, searchQuery, filterAction]);

  // ── Display-only: chip counts, day grouping, and session lengths ──
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
      if (last && last.key === key) last.data.push(log);
      else groups.push({ key, title: getDayLabel(log.created_at), data: [log] });
    });
    return groups;
  }, [filteredLogs]);

  // Each sign-out is matched with that moderator's most recent sign-in to show how long the session lasted.
  const sessionLengths = useMemo(() => {
    const lengths = {};
    const openSignIn = {};
    [...logs].reverse().forEach((log) => {
      if (log.action_type === 'SYSTEM_LOGIN') {
        openSignIn[log.moderator_id] = log.created_at;
      } else if (log.action_type === 'SYSTEM_LOGOUT' && openSignIn[log.moderator_id]) {
        lengths[log.id] = new Date(log.created_at) - new Date(openSignIn[log.moderator_id]);
        delete openSignIn[log.moderator_id];
      }
    });
    return lengths;
  }, [logs]);

  // ── LOADING SCREEN ──
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={s.pageHead}>
          <Text style={s.pageTitle}>Audit logs</Text>
          <Text style={s.small}>Checking your access and loading the latest actions…</Text>
        </View>
        <ActivityIndicator color={T.brand} style={{ marginTop: 32 }} />
      </View>
    );
  }

  const Header = (
    <View>
      <View style={s.pageHead}>
        <Text style={s.pageTitle}>Audit logs</Text>
        <Text style={s.small}>Everything the moderation team has done, newest first. Tap an entry to see the full record.</Text>
      </View>

      <View style={s.searchWrap}>
        <Search size={17} color={T.sub} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by moderator, user, or details"
          placeholderTextColor={T.sub}
          autoCapitalize="none"
          autoCorrect={false}
          style={s.searchInput}
          accessibilityLabel="Search audit logs"
        />
        {!!searchQuery && (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8} accessibilityLabel="Clear search"><X size={17} color={T.sub} /></Pressable>
        )}
      </View>

      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(f) => f.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chips}
        renderItem={({ item: f }) => {
          const on = filterAction === f.id;
          return (
            <Pressable onPress={() => setFilterAction(f.id)} style={[s.chip, on && s.chipOn]} accessibilityState={{ selected: on }}>
              <Text style={[s.chipText, on && { color: '#fff' }]}>{f.label}</Text>
              <Text style={[s.chipCount, on ? { color: '#d1fae5' } : { color: T.sub }]}>{actionCounts[f.id] || 0}</Text>
            </Pressable>
          );
        }}
      />

      <Text style={[s.small, { paddingHorizontal: 16, paddingBottom: 6 }]}>
        Showing <Text style={{ fontWeight: '700', color: T.text }}>{filteredLogs.length}</Text> of {logs.length} actions
      </Text>
    </View>
  );

  const renderItem = ({ item: log }) => {
    const meta = getActionMeta(log.action_type);
    const ActionIcon = meta.icon;

    return (
      <Pressable onPress={() => setSelectedLog(log)} style={({ pressed }) => [s.row, pressed && { backgroundColor: T.strip }]}>
        <View style={[s.accent, { backgroundColor: meta.accent }]} />
        <View style={[s.node, { backgroundColor: meta.bg, borderColor: meta.border }]}>
          <ActionIcon size={18} color={meta.color} strokeWidth={1.9} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[s.rowTitle, { flexShrink: 1 }]} numberOfLines={1}>{meta.label}</Text>
            <View style={{ flex: 1 }} />
            <Text style={s.small}>{fmtTime(log.created_at)}</Text>
          </View>

          <Text style={s.who} numberOfLines={1}>
            {log.moderator?.full_name || 'System'}{log.target?.full_name ? ` acted on ${log.target.full_name}` : ''}
          </Text>

          <Text style={s.details} numberOfLines={2}>{log.details || 'No additional details provided.'}</Text>
        </View>
      </Pressable>
    );
  };

  const sel = selectedLog;
  const selMeta = sel ? getActionMeta(sel.action_type) : null;
  const SelIcon = selMeta?.icon;

  return (
    <>
      <SectionList
        style={{ flex: 1, backgroundColor: '#fff' }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        sections={groupedByDay}
        keyExtractor={(log) => log.id}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => (
          <View style={s.dayHead}>
            <Text style={s.dayTitle}>{section.title}</Text>
            <Text style={s.small}>{section.data.length} {section.data.length === 1 ? 'action' : 'actions'}</Text>
          </View>
        )}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={Header}
        ListEmptyComponent={(
          <View style={s.emptyWrap}>
            <View style={s.emptyIcon}><FileText size={22} color={T.border} /></View>
            <Text style={[s.rowTitle, { marginTop: 12 }]}>No logs found</Text>
            <Text style={[s.small, { textAlign: 'center', marginTop: 4 }]}>Try adjusting your search or filter settings.</Text>
          </View>
        )}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.brand} colors={[T.brand]} />}
      />

      {/* ── AUDIT RECORD (was the side panel) */}
      <Modal visible={!!sel} transparent animationType="slide" onRequestClose={() => setSelectedLog(null)}>
        <View style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setSelectedLog(null)} />
          {!!sel && (
            <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
              <View style={s.grabber} />
              <View style={s.sheetHeader}>
                <View style={[s.sheetIcon, { backgroundColor: selMeta.bg, borderColor: selMeta.border }]}>
                  <SelIcon size={20} color={selMeta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.small}>Moderation record</Text>
                  <Text style={[s.sheetTitle, { color: selMeta.color }]} numberOfLines={1}>{selMeta.label}</Text>
                  <Text style={s.small}>{fmtDateTime(sel.created_at)}</Text>
                </View>
                <Pressable onPress={() => setSelectedLog(null)} hitSlop={10}><X size={22} color={T.sub} /></Pressable>
              </View>

              <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
                {/* people involved */}
                <View style={s.people}>
                  <View style={s.personRow}>
                    <Avatar url={sel.moderator?.avatar_url} name={sel.moderator?.full_name} fallback="M" size={40} bg="#d1fae5" border="#a7f3d0" fg="#065f46" />
                    <View style={{ flex: 1 }}>
                      <Text style={s.small}>Action by</Text>
                      <Text style={s.rowTitle} numberOfLines={1}>{sel.moderator?.full_name || 'System / Unknown'}</Text>
                    </View>
                    <View style={s.idChip}><Hash size={12} color={T.sub} /><Text style={s.idText}>{sel.moderator_id.slice(0, 8)}</Text></View>
                  </View>
                  {sel.target ? (
                    <View style={[s.personRow, { borderTopWidth: 1, borderTopColor: T.line }]}>
                      <Avatar url={sel.target.avatar_url} name={sel.target.full_name} fallback="U" size={40} bg={T.field} border={T.border} fg={T.sub} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.small}>Target user</Text>
                        <Text style={s.rowTitle} numberOfLines={1}>{sel.target.full_name}</Text>
                      </View>
                      <View style={s.idChip}><Hash size={12} color={T.sub} /><Text style={s.idText}>{sel.target_user_id.slice(0, 8)}</Text></View>
                    </View>
                  ) : (
                    <View style={[s.personRow, { borderTopWidth: 1, borderTopColor: T.line, justifyContent: 'center' }]}>
                      <Text style={s.small}>No specific target user</Text>
                    </View>
                  )}
                </View>

                {/* action details (summary + moderator remarks) */}
                <Text style={s.sectionLabel}>Action details</Text>
                <View style={s.detailsBox}>
                  {!sel.details ? (
                    <Text style={[s.detailsBody, { color: T.sub, fontStyle: 'italic' }]}>No additional details were provided.</Text>
                  ) : sel.details.includes('. Notes: ') ? (
                    <View style={{ gap: 12 }}>
                      <View>
                        <Text style={s.small}>System summary</Text>
                        <Text style={[s.detailsBody, { fontWeight: '600' }]}>{sel.details.split('. Notes: ')[0]}</Text>
                      </View>
                      <View style={s.remarks}>
                        <Text style={[s.small, { color: '#d97706' }]}>Moderator remarks</Text>
                        <Text style={[s.detailsBody, { fontStyle: 'italic', color: '#78350f' }]}>"{sel.details.split('. Notes: ').slice(1).join('. Notes: ')}"</Text>
                      </View>
                    </View>
                  ) : (
                    <Text style={[s.detailsBody, { fontWeight: '500' }]}>{sel.details}</Text>
                  )}
                </View>

                {/* system metadata */}
                <Text style={s.sectionLabel}>System metadata</Text>
                <View style={s.metaBox}>
                  <View style={s.metaItem}>
                    <Text style={s.small}>Log record ID</Text>
                    <Text style={s.mono} selectable>{sel.id}</Text>
                  </View>
                  {!!sel.reference_id && (
                    <View style={s.metaItem}>
                      <Text style={s.small}>Reference (ticket / session)</Text>
                      <Text style={s.mono} selectable>{sel.reference_id}</Text>
                    </View>
                  )}
                  {sessionLengths[sel.id] != null && (
                    <View style={[s.metaItem, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                      <Text style={s.small}>Recorded session length</Text>
                      <Text style={s.rowTitle}>{formatDuration(sessionLengths[sel.id])}</Text>
                    </View>
                  )}
                </View>
              </ScrollView>

              <View style={s.sheetFooter}>
                <Pressable onPress={() => setSelectedLog(null)} style={s.closeBtn}>
                  <Text style={s.closeBtnText}>Close record</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  small: { fontSize: 13, color: T.sub },
  rowTitle: { fontSize: 15, fontWeight: '700', color: T.text },

  pageHead: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: T.text, letterSpacing: -0.3, marginBottom: 2 },

  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, marginHorizontal: 16, paddingHorizontal: 14, borderRadius: 21, backgroundColor: T.field },
  searchInput: { flex: 1, fontSize: 15, color: T.text, padding: 0 },

  chips: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: T.field },
  chipOn: { backgroundColor: T.brand },
  chipText: { fontSize: 13, fontWeight: '600', color: T.text },
  chipCount: { fontSize: 13, fontWeight: '700' },

  // day sections
  dayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: T.strip, borderTopWidth: 1, borderTopColor: T.line },
  dayTitle: { fontSize: 15, fontWeight: '700', color: T.text },

  // entries
  row: { flexDirection: 'row', gap: 12, paddingLeft: 16, paddingRight: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: T.line, backgroundColor: '#fff' },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  node: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  who: { fontSize: 13, fontWeight: '600', color: T.text, marginTop: 3 },
  details: { fontSize: 13, lineHeight: 18, color: T.sub, marginTop: 3 },

  emptyWrap: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 32, borderTopWidth: 1, borderTopColor: T.line },
  emptyIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: T.strip, borderWidth: 1, borderColor: T.line, alignItems: 'center', justifyContent: 'center' },

  // sheet
  overlay: { flex: 1, backgroundColor: 'rgba(15,20,25,0.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: T.border, marginTop: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.line },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2 },
  sheetIcon: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  idChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  idText: { fontSize: 12, color: T.sub },
  metaBox: { borderWidth: 1, borderColor: T.line, borderRadius: 12, padding: 14, gap: 12, backgroundColor: T.strip },
  metaItem: { gap: 4 },
  people: { marginTop: 16, borderWidth: 1, borderColor: T.line, borderRadius: 12 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: T.sub, marginTop: 18, marginBottom: 8 },
  detailsBox: { borderWidth: 1, borderColor: T.line, borderRadius: 12, padding: 14 },
  detailsBody: { fontSize: 14, lineHeight: 21, color: T.text },
  remarks: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fef3c7', borderRadius: 10, padding: 12 },
  mono: { alignSelf: 'flex-start', fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }), fontSize: 12, color: T.sub, backgroundColor: T.strip, borderWidth: 1, borderColor: T.line, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  sheetFooter: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: T.line },
  closeBtn: { height: 44, borderRadius: 22, backgroundColor: T.brand, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});