import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, Image, Modal, Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Search, X, ShieldCheck, ShieldAlert, CheckCircle, FileText, LogIn, LogOut, Ban, UserCog, ChevronRight } from 'lucide-react-native';
import supabase from '../../supabaseClient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const T = { brand: '#047857', text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4', danger: '#b91c1c' , green: '#047857', strip: '#f7f9f9'};
const PROFILE_BATCH_SIZE = 100;
const pretty = (value) => String(value || 'SYSTEM_ACTION').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, x => x.toUpperCase());
const short = value => value ? `${String(value).slice(0, 8)}…` : '—';
// Presentation-only: use the same colored timeline styles as ModLogs and SupportLogs.
// The displayed action title is derived from the original action_type; nothing is rewritten in the database.
const getActionMeta = type => {
  const value = String(type || '').toUpperCase();
  if (value.includes('BAN') || value.includes('DELETE') || value.includes('REMOVE')) return { icon: Ban, color: '#9f1239', bg: '#fff1f2', border: '#fecdd3', accent: '#f43f5e' };
  if (value.includes('WARN') || value.includes('PENALT') || value.includes('SUSPEND')) return { icon: ShieldAlert, color: '#92400e', bg: '#fffbeb', border: '#fde68a', accent: '#f59e0b' };
  if (value.includes('LOGIN')) return { icon: LogIn, color: '#065f46', bg: '#ecfdf5', border: '#a7f3d0', accent: '#10b981' };
  if (value.includes('LOGOUT')) return { icon: LogOut, color: '#374151', bg: '#f9fafb', border: '#e5e7eb', accent: '#9ca3af' };
  if (value.includes('APPROV') || value.includes('RESOLV') || value.includes('RESTORE')) return { icon: CheckCircle, color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe', accent: '#3b82f6' };
  if (value.includes('ROLE') || value.includes('USER')) return { icon: UserCog, color: '#3730a3', bg: '#eef2ff', border: '#c7d2fe', accent: '#6366f1' };
  return { icon: ShieldCheck, color: '#374151', bg: '#f9fafb', border: '#e5e7eb', accent: '#9ca3af' };
};
const getDayLabel = dateStr => {
  if (!dateStr) return 'Unknown date';
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};
const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—';
function PersonAvatar({ person, fallback }) {
  return <View style={s.personAvatar}>
    {person?.avatar_url ? <Image source={{ uri: person.avatar_url }} style={s.avatarPhoto}/> : <Text style={s.avatarInitial}>{(person?.full_name || fallback).slice(0,1).toUpperCase()}</Text>}
  </View>;
}
const dateText = value => value ? new Date(value).toLocaleString() : 'Date unavailable';
export default function AdminLogs() {
  const insets = useSafeAreaInsets();
  const [logs, setLogs] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState('ALL');
  const [selectedLog, setSelectedLog] = useState(null);

  const fetchLogs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setErrorMessage('');
    try {
      const { data, error } = await supabase.from('admin_logs').select('*').order('created_at', { ascending: false });
      if (error) setErrorMessage('Could not load audit logs. Please try again.');
      const profileMap = {};
      const ids = [...new Set((data || []).flatMap(log => [log.admin_id, log.target_user_id]).filter(Boolean))];
      for (let start = 0; start < ids.length; start += PROFILE_BATCH_SIZE) {
        const { data: people } = await supabase.from('user_profiles').select('id, full_name, avatar_url, role').in('id', ids.slice(start, start + PROFILE_BATCH_SIZE));
        (people || []).forEach(person => { profileMap[person.id] = person; });
      }
      setProfiles(profileMap);
      setLogs(data || []);
    } catch (error) {
      console.error('Unable to load audit logs:', error);
      setErrorMessage('Could not load audit logs. Please try again.');
    } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { fetchLogs(); }, [fetchLogs]));
  useEffect(() => {
    let timeout;
    const refresh = () => { clearTimeout(timeout); timeout = setTimeout(() => fetchLogs(true), 500); };
    const channel = supabase.channel('mobile_admin_logs_screen')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_logs' }, refresh)
      // The shared migration publishes user_profiles, so ban/lift updates also
      // refresh the log view even when admin_logs isn't in the publication.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_profiles' }, refresh)
      .subscribe();
    const appSub = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { clearTimeout(timeout); appSub.remove(); supabase.removeChannel(channel); };
  }, [fetchLogs]);
  const actions = useMemo(() => ['ALL', ...new Set(logs.map(l => l.action_type).filter(Boolean))], [logs]);
  const filtered = useMemo(() => {
    const search = searchQuery.trim().toLowerCase();
    return logs.filter(log => (filterAction === 'ALL' || log.action_type === filterAction) && (!search || [log.action_type, log.details, log.id, profiles[log.admin_id]?.full_name, profiles[log.target_user_id]?.full_name].some(v => String(v || '').toLowerCase().includes(search))));
  }, [logs, profiles, searchQuery, filterAction]);
  const groups = useMemo(() => {
    const map = new Map();
    filtered.forEach(log => {
      const key = log.created_at ? new Date(log.created_at).toDateString() : 'Unknown date';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(log);
    });
    return [...map.entries()].map(([key, data]) => ({ title: data[0]?.created_at ? getDayLabel(data[0].created_at) : key, data }));
  }, [filtered]);
  const counts = useMemo(() => {
    const acc = { ALL: logs.length };
    logs.forEach(log => { acc[log.action_type] = (acc[log.action_type] || 0) + 1; });
    return acc;
  }, [logs]);
  const closeRecord = () => setSelectedLog(null);
  const header = (
    <View>
      <View style={s.pageHead}>
        <Text style={s.pageTitle}>Audit logs</Text>
        <Text style={s.small}>Everything the administration team has done, newest first. Tap an entry to see the full record.</Text>
      </View>
      <View style={s.searchWrap}>
        <Search size={17} color={T.sub} />
        <TextInput style={s.searchInput} value={searchQuery} onChangeText={setSearchQuery} placeholder="Search by administrator, user, or details" placeholderTextColor={T.sub} autoCapitalize="none" />
        {!!searchQuery && <Pressable onPress={() => setSearchQuery('')} hitSlop={10}><X size={17} color={T.sub}/></Pressable>}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        {actions.map(action => <Pressable key={action} onPress={() => setFilterAction(action)} style={[s.chip, action === filterAction && s.chipOn]}>
          <Text style={[s.chipText, action === filterAction && s.chipTextOn]}>{action === 'ALL' ? 'All actions' : pretty(action)}</Text>
          <Text style={[s.chipCount, action === filterAction && s.chipCountOn]}>{counts[action] || 0}</Text>
        </Pressable>)}
      </ScrollView>
      <Text style={s.resultText}>Showing <Text style={s.resultBold}>{filtered.length}</Text> of {logs.length} actions</Text>
      {!!errorMessage && <Text style={s.error}>{errorMessage}</Text>}
    </View>
  );
  return <View style={s.root}>
    <SectionList
      sections={groups}
      keyExtractor={item => item.id}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={{ paddingBottom: insets.bottom + 22 }}
      ListHeaderComponent={header}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchLogs(true); }} tintColor={T.brand} />}
      renderSectionHeader={({ section }) => <View style={s.dayHead}><Text style={s.dayTitle}>{section.title}</Text><Text style={s.small}>{section.data.length} {section.data.length === 1 ? 'action' : 'actions'}</Text></View>}
      renderItem={({ item: log }) => <Pressable onPress={() => setSelectedLog(log)} style={({ pressed }) => [s.row, pressed && { backgroundColor: T.field }]}>
        <View style={[s.accent, { backgroundColor: getActionMeta(log.action_type).accent }]} />
        <View style={[s.iconCircle, { backgroundColor: getActionMeta(log.action_type).bg, borderColor: getActionMeta(log.action_type).border }]}>
          {(() => { const Icon = getActionMeta(log.action_type).icon; return <Icon size={18} color={getActionMeta(log.action_type).color} strokeWidth={1.9} />; })()}
        </View>
        <View style={{ flex: 1 }}>
          <View style={s.rowHeading}><Text style={s.rowTitle} numberOfLines={1}>{pretty(log.action_type)}</Text><Text style={s.time}>{fmtTime(log.created_at)}</Text></View>
          <Text style={s.who} numberOfLines={1}>{profiles[log.admin_id]?.full_name || short(log.admin_id)}{log.target_user_id ? ` acted on ${profiles[log.target_user_id]?.full_name || short(log.target_user_id)}` : ''}</Text>
          <Text style={s.details} numberOfLines={2}>{log.details || 'No additional details provided.'}</Text>
        </View>
        
      </Pressable>}
      ListEmptyComponent={<View style={s.empty}><FileText size={27} color="#cbd5e1"/><Text style={s.rowTitle}>{loading ? 'Loading audit logs…' : 'No logs found'}</Text>{loading && <ActivityIndicator color={T.brand} style={{marginTop:10}}/>}</View>}
    />
    <Modal visible={!!selectedLog} transparent animationType="slide" onRequestClose={closeRecord}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={s.overlay} onPress={closeRecord}/>
        {!!selectedLog && <View style={[s.sheet, {paddingBottom: insets.bottom + 12}]}>
          <View style={s.grabber}/>
          <View style={s.sheetHeader}>
            <View style={[s.iconCircle, { backgroundColor: getActionMeta(selectedLog.action_type).bg, borderColor: getActionMeta(selectedLog.action_type).border }]}><ShieldCheck size={20} color={getActionMeta(selectedLog.action_type).color}/></View>
            <View style={{flex:1}}><Text style={s.small}>Administration record</Text><Text style={s.sheetTitle}>{pretty(selectedLog.action_type)}</Text><Text style={s.small}>{dateText(selectedLog.created_at)}</Text></View>
            <Pressable onPress={closeRecord} hitSlop={10}><X size={22} color={T.sub}/></Pressable>
          </View>
          <ScrollView contentContainerStyle={{padding:16}}>
            
            <View style={s.people}>
              <View style={s.personRow}><PersonAvatar person={profiles[selectedLog.admin_id]} fallback="A"/><View style={{flex:1}}><Text style={s.small}>Action by</Text><Text style={s.detailValue}>{profiles[selectedLog.admin_id]?.full_name || selectedLog.admin_id || 'System / Unknown'}</Text></View></View>
              <View style={{height:1,backgroundColor:T.line}}/>
              {selectedLog.target_user_id ? <View style={s.personRow}><PersonAvatar person={profiles[selectedLog.target_user_id]} fallback="U"/><View style={{flex:1}}><Text style={s.small}>Target user</Text><Text style={s.detailValue}>{profiles[selectedLog.target_user_id]?.full_name || selectedLog.target_user_id}</Text></View></View> : <Text style={s.small}>No specific target user</Text>}
            </View>
            <Text style={s.sectionLabel}>Action details</Text>
            <View style={s.detailsBox}><Text style={s.detailValue}>{selectedLog.details || 'No additional details provided.'}</Text></View>
            <Text style={s.sectionLabel}>System metadata</Text>
            <View style={s.detailBox}><Text style={s.small}>Record ID</Text><Text selectable style={s.mono}>{selectedLog.id}</Text></View>
          </ScrollView>
          <View style={s.sheetFooter}><Pressable onPress={closeRecord} style={s.closeButton}><Text style={s.closeText}>Close record</Text></Pressable></View>
        </View>}
      </View>
    </Modal>
  </View>;
}
const s = StyleSheet.create({
  people: { marginTop: 16, borderWidth: 1, borderColor: T.line, borderRadius: 12 },
  detailsBox: { borderWidth: 1, borderColor: T.line, borderRadius: 12, padding: 14 },

  root:{flex:1,backgroundColor:'#fff'}, pageHead: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },pageTitle: { fontSize: 20, fontWeight: '700', color: T.text, letterSpacing: -0.3, marginBottom: 2 },small: { fontSize: 13, color: T.sub },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, marginHorizontal: 16, paddingHorizontal: 14, borderRadius: 21, backgroundColor: T.field },searchInput: { flex: 1, fontSize: 15, color: T.text, padding: 0 },
  chips: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: T.field },chipOn: { backgroundColor: T.brand },chipText: { fontSize: 13, fontWeight: '600', color: T.text },chipTextOn:{color:'#fff'},chipCount: { fontSize: 13, fontWeight: '700' },chipCountOn:{color:'#d1fae5'},resultText:{ fontSize: 13, color: T.sub, paddingHorizontal: 16, paddingBottom: 6 },resultBold:{fontWeight:'700',color:T.text},
  dayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: T.strip, borderTopWidth: 1, borderTopColor: T.line },dayTitle: { fontSize: 15, fontWeight: '700', color: T.text },
  row: { flexDirection: 'row', gap: 12, paddingLeft: 16, paddingRight: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: T.line, backgroundColor: '#fff' },accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },iconCircle: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 1 },rowHeading:{ flexDirection: 'row', alignItems: 'center', gap: 8 },rowTitle: { fontSize: 15, fontWeight: '700', color: T.text },time:{ fontSize: 13, color: T.sub, marginLeft: 'auto' },who: { fontSize: 13, fontWeight: '600', color: T.text, marginTop: 3 },details: { fontSize: 13, lineHeight: 18, color: T.sub, marginTop: 3 },
  personRow:{flexDirection:'row',alignItems:'center',gap:12},personAvatar:{width:40,height:40,borderRadius:20,overflow:'hidden',backgroundColor:'#d1fae5',borderColor:'#a7f3d0',borderWidth:1,justifyContent:'center',alignItems:'center'},avatarPhoto:{width:40,height:40},avatarInitial:{color:'#065f46',fontWeight:'700'},
  empty:{ alignItems: 'center', paddingVertical: 56, paddingHorizontal: 32, borderTopWidth: 1, borderTopColor: T.line },error:{color:T.danger,marginHorizontal:16,marginBottom:12},overlay:{ flex: 1, backgroundColor: 'rgba(15,20,25,0.5)' },sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: T.border, marginTop: 8 },sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.line },sheetTitle: { fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2 },sectionLabel: { fontSize: 13, fontWeight: '600', color: T.sub, marginTop: 18, marginBottom: 8 },detailBox: { borderWidth: 1, borderColor: T.line, borderRadius: 12, padding: 14, backgroundColor: '#fff' },detailValue:{fontSize:14,color:T.text,lineHeight:21,fontWeight:'500',marginTop:4},rule:{height:1,backgroundColor:T.line,marginVertical:12},mono:{fontSize:12,color:T.sub,marginTop:6},sheetFooter: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: T.line },closeButton: { height: 44, borderRadius: 22, backgroundColor: T.brand, alignItems: 'center', justifyContent: 'center' },closeText: { fontSize: 15, fontWeight: '700', color: '#fff' }
});
