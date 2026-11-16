import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AlertTriangle, Ban, ChevronRight, Clock, MessageSquareOff, Scale, Search, ShieldAlert, ShieldCheck, UploadCloud, UserCheck, X } from 'lucide-react-native';
import supabase from '../../supabaseClient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const T = { brand: '#047857', text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4', danger: '#be123c', green: '#047857', strip: '#f7f9f9', soft: '#ecfdf5'};
const relation = value => Array.isArray(value) ? value[0] : value;
const date = value => value ? new Date(value).toLocaleString() : 'Unknown date';
const getTargetUser = item => relation(relation(item?.repeat_offender)?.user_profiles) || null;
const initialConfirm = { isOpen: false, item: null, note: '', mode: 'ban' };
const CASE_LABELS = { pending: 'Pending Review', admin_banned: 'Admin Banned', ban_lifted: 'Ban Lifted', resolved: 'Resolved' };
const caseLabel = status => CASE_LABELS[status] || String(status || 'Pending Review').replace(/_/g, ' ');
export default function Escalations() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [escalations, setEscalations] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTabFilter, setActiveTabFilter] = useState('ALL');
  const [manageModal, setManageModal] = useState({ isOpen: false, item: null });
  const [historyModal, setHistoryModal] = useState({ isOpen: false, user: null, logs: [], loading: false });
  const [confirmModal, setConfirmModal] = useState(initialConfirm);
  const [isProcessing, setIsProcessing] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [banSource, setBanSource] = useState(null);
  const fetchEscalations = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data, error } = await supabase.from('admin_escalations').select(`id,status,created_at,updated_at,repeat_offender_id,moderator_id,admin_id,repeat_offender:repeat_offenders(id,user_id,user_profiles:user_id(id,full_name,avatar_url,role,is_banned,violation_count)),moderator:user_profiles!admin_escalations_moderator_id_fkey(full_name)`).order('created_at', { ascending: false });
      if (!error && data) { setEscalations(data); setErrorMessage(''); }
      else if (error) { console.error('Error fetching admin_escalations:', error); setErrorMessage('Could not load escalations.'); }
    } catch (error) { console.error('Error fetching admin_escalations:', error); setErrorMessage('Could not load escalations.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { fetchEscalations(); }, [fetchEscalations]));
  useEffect(() => {
    let timeout;
    const refresh = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fetchEscalations(true), 450);
    };
    // Account changes made in Web or User Management must update the case screen.
    const channel = supabase.channel('mobile_admin_escalations_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_escalations' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_profiles' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'repeat_offenders' }, refresh)
      .subscribe();
    // Foreground fallback after the app was suspended or lost network events.
    const appSub = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => {
      clearTimeout(timeout);
      appSub.remove();
      supabase.removeChannel(channel);
    };
  }, [fetchEscalations]);
  // Read existing audit entries so View Record can show where the ban came from.
  // Never invent the origin if the records are unavailable through RLS.
  useEffect(() => {
    if (!manageModal.isOpen || !manageModal.item) {
      setBanSource(null);
      return;
    }
    const targetId = getTargetUser(manageModal.item)?.id;
    if (!targetId) return;
    let cancelled = false;
    setBanSource(null);
    (async () => {
      const { data, error } = await supabase.from('admin_logs')
        .select('action_type,details,created_at')
        .eq('target_user_id', targetId)
        .in('action_type', ['ACCOUNT_STATUS', 'ENFORCE_BAN', 'LIFT_BAN'])
        .order('created_at', { ascending: false })
        .limit(15);
      if (cancelled || error) return;
      const latest = (data || []).find(log => /ban/i.test(log.details || '') || log.action_type === 'LIFT_BAN');
      if (!latest) return;
      const details = latest.details || '';
      const origin = /source:\s*user_management/i.test(details) ? 'User Management'
        : /source:\s*admin_escalations/i.test(details) ? 'Admin Escalations'
          : null;
      setBanSource({ origin, action: /UNBANNED|LIFT_BAN/i.test(details + ' ' + latest.action_type) ? 'Ban lifted' : 'Ban enforced' });
    })();
    return () => { cancelled = true; };
  }, [manageModal.isOpen, manageModal.item]);

  const handleOpenHistoryModal = async targetUser => {
    setManageModal({ isOpen: false, item: null });
    setHistoryModal({ isOpen: true, user: targetUser, logs: [], loading: true });
    if (targetUser?.id) {
      const { data, error } = await supabase.from('reports').select('id, created_at, reason, details, status, reference_type').eq('reported_user_id', targetUser.id).order('created_at', { ascending: false });
      if (!error && data) setHistoryModal({ isOpen: true, user: targetUser, logs: data, loading: false });
      else setHistoryModal(prev => ({ ...prev, loading: false }));
    } else setHistoryModal(prev => ({ ...prev, loading: false }));
  };
  // Shared RPC is the single source of truth for both Web and Expo ban/lift.
  const confirmBan = async () => {
    if (isProcessing || !confirmModal.item) return;
    const item = escalations.find(e => e.id === confirmModal.item.id) || confirmModal.item;
    const targetUser = getTargetUser(item);
    const isBan = confirmModal.mode !== 'lift';
    if (!targetUser?.id) { setNotice('Target user ID not found.'); setConfirmModal(initialConfirm); return; }
    setIsProcessing(true);
    try {
      const { error } = await supabase.rpc('skillcredit_admin_change_account_ban', {
        p_target_user_id: targetUser.id,
        p_is_banned: isBan,
        p_source: 'admin_escalations',
        p_note: confirmModal.note.trim() || null,
        p_escalation_id: item.id,
      });
      if (error) throw error;

      // The RPC already writes one audit record. Notification is best effort.
      try {
        const { error: notificationError } = await supabase.from('notifications').insert([{
          user_id: targetUser.id,
          type: isBan ? 'account_banned' : 'system',
          content: isBan
            ? 'Your account has been banned by an Administrator following escalation review.'
            : 'Good news! Your account ban has been lifted by an Admin.',
        }]);
        if (notificationError) console.warn('Ban update saved; notification failed:', notificationError);
      } catch (notificationError) {
        console.warn('Ban update saved; notification failed:', notificationError);
      }
      setConfirmModal(initialConfirm);
      setManageModal({ isOpen: false, item: null });
      setNotice(`${targetUser.full_name || 'User'}: ${isBan ? 'ban enforced' : 'ban lifted'}. Account and linked cases synchronized.`);
    } catch (error) {
      console.error('Escalation action failed:', error);
      setNotice(`Could not ${isBan ? 'enforce ban' : 'lift ban'}: ${error?.message || 'Please try again.'}`);
    } finally {
      setIsProcessing(false);
      await fetchEscalations(true);
    }
  };
  const filtered = useMemo(() => escalations.filter(item => {
    const name = getTargetUser(item)?.full_name || '';
    const q = searchQuery.trim().toLowerCase();
    return (activeTabFilter === 'ALL' || item.status === activeTabFilter) && (!q || `${name} ${item.status} ${item.id}`.toLowerCase().includes(q));
  }), [escalations, activeTabFilter, searchQuery]);
  const stats = useMemo(() => ({ total: escalations.length, pending: escalations.filter(item => item.status === 'pending').length, banned: escalations.filter(item => item.status === 'admin_banned').length, lifted: escalations.filter(item => item.status === 'ban_lifted').length }), [escalations]);
  const closeManage = () => setManageModal({ isOpen: false, item: null });
  const closeHistory = () => setHistoryModal({ isOpen: false, user: null, logs: [], loading: false });
  const closeConfirm = () => { if (!isProcessing) setConfirmModal(initialConfirm); };
  const activeSheet = confirmModal.isOpen ? 'confirm' : historyModal.isOpen ? 'history' : manageModal.isOpen ? 'manage' : null;
  const closeSheet = activeSheet === 'confirm' ? closeConfirm : activeSheet === 'history' ? closeHistory : closeManage;
  const focused = manageModal.item ? (escalations.find(e => e.id === manageModal.item.id) || manageModal.item) : null;
  const focusedUser = getTargetUser(focused);
  const historyUser = historyModal.user;
  const confirmUser = getTargetUser(confirmModal.item ? (escalations.find(e => e.id === confirmModal.item.id) || confirmModal.item) : null);
  const confirmIsBan = confirmModal.mode !== 'lift';
  const historyLogs = historyModal.logs
    .filter(log => !log.details?.toUpperCase().includes('DISMISS'))
    .sort((a, b) => {
      const first = a.reason === 'Repeat Offender Threshold Reached';
      const second = b.reason === 'Repeat Offender Threshold Reached';
      if (first && !second) return -1;
      if (!first && second) return 1;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  const strikeReports = historyLogs.filter(log => log.reason !== 'Repeat Offender Threshold Reached');
  const tabs = [
    { id: 'ALL', label: 'All cases', count: stats.total },
    { id: 'pending', label: 'Pending', count: stats.pending },
    { id: 'admin_banned', label: 'Banned', count: stats.banned },
    { id: 'ban_lifted', label: 'Ban Lifted', count: stats.lifted },
  ];

  const Header = (
    <View>
      <View style={s.pageHead}>
        <Text style={s.pageTitle}>Admin escalations</Text>
        <Text style={s.small}>Review repeat offenders and enforcement decisions.</Text>
      </View>
      <FlatList
        horizontal
        data={tabs}
        keyExtractor={tab => tab.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chips}
        renderItem={({ item: tab }) => {
          const active = activeTabFilter === tab.id;
          return (
            <Pressable onPress={() => setActiveTabFilter(tab.id)} style={[s.chip, active && s.chipOn]} accessibilityState={{ selected: active }}>
              <Text style={[s.chipText, active && { color: '#fff' }]}>{tab.label}</Text>
              <Text style={[s.chipCount, { color: active ? '#d1fae5' : T.sub }]}>{tab.count}</Text>
            </Pressable>
          );
        }}
      />
      {!!notice && <Pressable onPress={() => setNotice('')} style={s.notice}><Text style={{ color: T.brand, flex: 1 }}>{notice}</Text><X size={16} color={T.brand} /></Pressable>}
      {!!errorMessage && <Text style={s.error}>{errorMessage}</Text>}
      <View style={s.searchWrap}>
        <Search size={17} color={T.sub} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by name or status"
          placeholderTextColor={T.sub}
          autoCapitalize="none"
          autoCorrect={false}
          style={s.searchInput}
          accessibilityLabel="Search admin escalations"
        />
        {!!searchQuery && <Pressable onPress={() => setSearchQuery('')} hitSlop={8}><X size={17} color={T.sub} /></Pressable>}
      </View>
      {!loading && (
        <Text style={[s.small, { paddingHorizontal: 16, paddingBottom: 10 }]}>
          Showing <Text style={{ fontWeight: '700', color: T.text }}>{filtered.length}</Text> of {escalations.length} cases
        </Text>
      )}
    </View>
  );

  const renderItem = ({ item }) => {
    const user = getTargetUser(item);
    const banned = item.status === 'admin_banned';
    const lifted = item.status === 'ban_lifted';
    return (
      <Pressable onPress={() => setManageModal({ isOpen: true, item })} style={({ pressed }) => [s.row, pressed && { backgroundColor: T.strip }]}>
        <View style={[s.accent, { backgroundColor: banned ? '#f43f5e' : lifted ? '#10b981' : '#fbbf24' }]} />
        <View style={s.topLine}>
          <View style={s.avatar}>
            {user?.avatar_url
              ? <Image source={{ uri: user.avatar_url }} style={{ width: 44, height: 44 }} />
              : <Text style={s.avatarText}>{user?.full_name?.charAt(0) || 'U'}</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle} numberOfLines={1}>{user?.full_name || 'Unknown user'}</Text>
            <View style={s.roleLine}>
              <Text style={s.roleChip}>{user?.role || 'User'}</Text>
              <Text style={s.small}>#{(user?.id || item.id).split('-')[0]}</Text>
            </View>
          </View>
          <View style={s.strikePill}>
            <View style={s.strikeDot} />
            <Text style={s.strikeText}>{user?.violation_count ?? '—'} Strikes</Text>
          </View>
        </View>
        <View style={s.metaRow}>
          <View style={[s.badge, { backgroundColor: banned ? '#fff1f2' : lifted ? '#ecfdf5' : '#fffbeb', borderColor: banned ? '#fecdd3' : lifted ? '#a7f3d0' : '#fde68a' }]}>
            <View style={[s.pillDot, { backgroundColor: banned ? '#f43f5e' : lifted ? '#10b981' : '#f59e0b' }]} />
            <Text style={[s.badgeText, { color: banned ? '#9f1239' : lifted ? T.brand : '#92400e' }]}>{caseLabel(item.status)}</Text>
          </View>
          <View style={{ flex: 1 }} />
          <Text style={[s.actionText, { color: banned ? T.sub : T.brand }]}>View details</Text>
          <ChevronRight size={16} color={banned ? T.sub : T.brand} />
        </View>
      </Pressable>
    );
  };

  const Empty = loading ? (
    <View>
      {[0, 1, 2, 3].map(i => (
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
      <View style={[s.emptyIcon, { backgroundColor: T.soft, borderColor: '#d1fae5' }]}><ShieldCheck size={22} color={T.brand} /></View>
      <Text style={[s.rowTitle, { marginTop: 12 }]}>No matching escalations</Text>
      <Text style={[s.small, { textAlign: 'center', marginTop: 4 }]}>Try switching your view above or clearing your search.</Text>
      {!!searchQuery && <Pressable onPress={() => setSearchQuery('')} style={s.clearBtn}><Text style={s.clearBtnText}>Clear search</Text></Pressable>}
    </View>
  );

  return (
    <>
      <FlatList
        style={s.root}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        data={loading ? [] : filtered}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        ListHeaderComponent={Header}
        ListEmptyComponent={Empty}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchEscalations(true); }} tintColor={T.brand} colors={[T.brand]} />}
      />

      {/* Same single switching bottom sheet structure as RepeatOffenders.jsx. */}
      <Modal visible={!!activeSheet} transparent animationType="slide" onRequestClose={closeSheet}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={s.overlay} onPress={closeSheet} />

          {activeSheet === 'manage' && !!focused && (
            <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
              <View style={s.grabber} />
              <View style={s.manageHead}>
                <View style={s.bigAvatar}>
                  {focusedUser?.avatar_url
                    ? <Image source={{ uri: focusedUser.avatar_url }} style={{ width: 64, height: 64 }} />
                    : <Text style={s.bigAvatarText}>{focusedUser?.full_name?.charAt(0)?.toUpperCase() || 'U'}</Text>}
                </View>
                <Text style={s.manageName} numberOfLines={1}>{focusedUser?.full_name || 'Unknown user'}</Text>
                <Text style={s.small}>{focusedUser?.role || 'User'}  •  #{(focusedUser?.id || focused.id).split('-')[0]}</Text>
                <Pressable onPress={closeManage} style={s.closeX} hitSlop={10}><X size={22} color={T.sub} /></Pressable>
              </View>
              <View style={s.infoBox}>
                <View style={s.infoRow}>
                  <Text style={s.small}>Policy strikes</Text>
                  <Text style={s.infoStrike}>{focusedUser?.violation_count ?? '—'}</Text>
                </View>
                <View style={[s.infoRow, { borderTopWidth: 1, borderTopColor: T.line }]}>
                  <Text style={s.small}>Escalation status</Text>
                  <Text style={s.infoValue}>{caseLabel(focused.status)}</Text>
                </View>
                <View style={[s.infoRow, { borderTopWidth: 1, borderTopColor: T.line }]}>
                  <Text style={s.small}>Current account status</Text>
                  <Text style={[s.infoValue, { color: focusedUser?.is_banned ? T.danger : T.green }]}>
                    {focusedUser?.is_banned ? 'Banned' : 'Active'}
                  </Text>
                </View>
              </View>
              {banSource && (
                <View style={{ marginHorizontal: 16, marginTop: 12, borderRadius: 10, padding: 11, backgroundColor: T.strip, borderWidth: 1, borderColor: T.line }}>
                  <Text style={[s.small, { color: T.text }]}>
                    Latest ban action: {banSource.action}{banSource.origin ? ` via ${banSource.origin}` : ''}
                  </Text>
                </View>
              )}
              <View style={{ paddingHorizontal: 16, gap: 10, marginTop: 14 }}>
                <Pressable onPress={() => handleOpenHistoryModal(focusedUser)} style={[s.btn, { backgroundColor: T.field }]}>
                  <Clock size={16} color={T.text} />
                  <Text style={[s.btnText, { color: T.text }]}>View report history</Text>
                </Pressable>
                {(focused.status === 'pending' || focused.status === 'ban_lifted') && !focusedUser?.is_banned ? (
                  <Pressable
                    disabled={isProcessing}
                    onPress={() => { setConfirmModal({ isOpen: true, item: focused, note: '', mode: 'ban' }); closeManage(); }}
                    style={[s.btn, { backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3' }]}
                  >
                    <Ban size={16} color={T.danger} />
                    <Text style={[s.btnText, { color: T.danger }]}>Enforce permanent ban</Text>
                  </Pressable>
                ) : !!focusedUser?.is_banned && focused.status !== 'resolved' ? (
                  <Pressable
                    disabled={isProcessing}
                    onPress={() => { setConfirmModal({ isOpen: true, item: focused, note: '', mode: 'lift' }); closeManage(); }}
                    style={[s.btn, { backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0' }]}
                  >
                    <UserCheck size={16} color={T.brand} />
                    <Text style={[s.btnText, { color: T.brand }]}>Lift ban</Text>
                  </Pressable>
                ) : (
                  <View style={[s.btn, { backgroundColor: T.strip, borderWidth: 1, borderColor: T.line }]}>
                    <ShieldCheck size={16} color={T.sub} />
                    <Text style={[s.btnText, { color: T.sub }]}>No ban action available</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {activeSheet === 'history' && (
            <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
              <View style={s.grabber} />
              <View style={s.sheetHeader}>
                <View style={s.sheetIconGray}><Clock size={20} color={T.sub} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.sheetTitle}>Report history</Text>
                  <Text style={s.small} numberOfLines={1}>{historyUser?.full_name || 'Unknown user'}</Text>
                </View>
                <Pressable onPress={closeHistory} hitSlop={10}><X size={22} color={T.sub} /></Pressable>
              </View>
              <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
                {historyModal.loading ? (
                  <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                    <ActivityIndicator color={T.brand} />
                    <Text style={[s.small, { marginTop: 10 }]}>Loading report records...</Text>
                  </View>
                ) : (
                  <View>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={[s.tile, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
                        <View style={s.tileHead}><MessageSquareOff size={15} color="#b45309" /><Text style={[s.tileLabel, { color: '#b45309' }]}>Total reports</Text></View>
                        <Text style={[s.tileNum, { color: '#78350f' }]}>{strikeReports.length}</Text>
                        <Text style={[s.tileSub, { color: '#b45309' }]}>filed against this user</Text>
                      </View>
                      <View style={[s.tile, { backgroundColor: '#faf5ff', borderColor: '#e9d5ff' }]}>
                        <View style={s.tileHead}><Scale size={15} color="#7e22ce" /><Text style={[s.tileLabel, { color: '#7e22ce' }]}>Session disputes</Text></View>
                        <Text style={[s.tileNum, { color: '#581c87' }]}>{strikeReports.filter(log => /session|booking/i.test(log.reference_type || '')).length}</Text>
                        <Text style={[s.tileSub, { color: '#7e22ce' }]}>booking or escrow issues</Text>
                      </View>
                    </View>
                    <Text style={s.sectionLabel}>Associated reports</Text>
                    {historyLogs.length === 0 ? (
                      <Text style={[s.small, { fontStyle: 'italic' }]}>No active reports found for this user.</Text>
                    ) : historyLogs.map(log => {
                      const isEscalationTicket = log.reason === 'Repeat Offender Threshold Reached';
                      const isDispute = /session|booking/i.test(log.reference_type || '');
                      const isCommunity = !isDispute && !isEscalationTicket;
                      let style = { bg: T.strip, border: T.border, text: T.text, Icon: ShieldAlert, iconColor: T.sub };
                      if (isEscalationTicket) style = { bg: '#fff1f2', border: '#fda4af', text: '#4c0519', Icon: UploadCloud, iconColor: '#e11d48' };
                      else if (isCommunity) style = { bg: '#fffbeb', border: '#fde68a', text: '#78350f', Icon: AlertTriangle, iconColor: '#d97706' };
                      else if (isDispute) style = { bg: '#faf5ff', border: '#e9d5ff', text: '#581c87', Icon: Scale, iconColor: '#9333ea' };
                      const IconToUse = style.Icon;
                      return (
                        <View key={log.id} style={[s.logCard, { backgroundColor: style.bg, borderColor: style.border }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <IconToUse size={15} color={style.iconColor} />
                            <Text style={[s.logReason, { color: style.text }]} numberOfLines={1}>{log.reason || 'User report'}</Text>
                            {isEscalationTicket && <Text style={s.masterTag}>Master ticket</Text>}
                            <View style={{ flex: 1 }} />
                            <Text style={s.small}>{new Date(log.created_at).toLocaleDateString()}</Text>
                          </View>
                          <Text style={s.logDetails} numberOfLines={3}>{log.details}</Text>
                          <View style={s.logFoot}>
                            <Text style={s.logFootText}>Status: <Text style={{ textTransform: 'uppercase' }}>{log.status}</Text></Text>
                            <Text style={s.logFootText}>Type: {log.reference_type || 'Unknown'}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </ScrollView>
              <View style={s.sheetFooter}>
                <Pressable onPress={closeHistory} style={[s.btn, { backgroundColor: T.field, flex: 1 }]}>
                  <Text style={[s.btnText, { color: T.text }]}>Close history</Text>
                </Pressable>
              </View>
            </View>
          )}

          {activeSheet === 'confirm' && (
            <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
              <View style={s.grabber} />
              <View style={s.sheetHeader}>
                <View style={s.sheetIconRose}>{confirmIsBan ? <Ban size={20} color={T.danger} /> : <UserCheck size={20} color={T.green} />}</View>
                <Text style={[s.sheetTitle, { flex: 1 }]}>{confirmIsBan ? 'Confirm permanent ban' : 'Confirm lift ban'}</Text>
                <Pressable onPress={closeConfirm} disabled={isProcessing} hitSlop={10}><X size={22} color={T.sub} /></Pressable>
              </View>
              <View style={{ padding: 16 }}>
                <Text style={s.body}>
                  {confirmIsBan ? 'This will ban ' : 'This will restore access for '}
                  <Text style={{ fontWeight: '700', color: T.text }}>{confirmUser?.full_name || 'this user'}</Text>
                  {' and notify them. Linked escalation records will be synchronized.'}
                </Text>
                <Text style={s.label}>Reason or notes (optional)</Text>
                <TextInput
                  multiline
                  value={confirmModal.note}
                  onChangeText={note => setConfirmModal(prev => ({ ...prev, note }))}
                  placeholder="Reason or notes (optional)"
                  placeholderTextColor={T.sub}
                  style={s.notes}
                />
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                  <Pressable onPress={closeConfirm} disabled={isProcessing} style={[s.btn, s.btnGhost, { flex: 1 }, isProcessing && { opacity: 0.5 }]}>
                    <Text style={[s.btnText, { color: T.text }]}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={confirmBan} disabled={isProcessing} style={[s.btn, { backgroundColor: confirmIsBan ? T.danger : T.brand, flex: 1.5 }, isProcessing && { opacity: 0.5 }]}>
                    <Text style={s.btnText}>{isProcessing ? 'Processing…' : confirmIsBan ? 'Confirm ban' : 'Lift ban'}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  notice: { marginHorizontal: 16, marginBottom: 12, backgroundColor: T.soft, padding: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center' },
  error: { marginHorizontal: 16, color: T.danger, marginBottom: 10 },
  notes: { height: 110, backgroundColor: T.field, borderRadius: 12, padding: 14, fontSize: 15, color: T.text, textAlignVertical: 'top' },

  small: { fontSize: 13, color: T.sub },
  rowTitle: { fontSize: 15, fontWeight: '700', color: T.text },
  label: { fontSize: 13, fontWeight: '600', color: T.sub, marginTop: 16, marginBottom: 8 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: T.sub, marginTop: 20, marginBottom: 10 },

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
  avatar: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: T.field, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '700', color: T.sub, textTransform: 'uppercase' },
  roleLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  roleChip: { fontSize: 12, fontWeight: '600', color: T.sub, backgroundColor: T.strip, borderWidth: 1, borderColor: T.line, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7, overflow: 'hidden' },
  strikePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#ffe4e6' },
  strikeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#f43f5e' },
  strikeText: { fontSize: 12, fontWeight: '700', color: '#be123c' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, height: 26, borderRadius: 8, borderWidth: 1 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  actionText: { fontSize: 13, fontWeight: '700' },

  skelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 18, borderTopWidth: 1, borderTopColor: T.line },
  skelIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: T.field },
  skelBar: { height: 12, borderRadius: 6, backgroundColor: T.field },
  emptyWrap: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 32, borderTopWidth: 1, borderTopColor: T.line },
  emptyIcon: { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  clearBtn: { marginTop: 16, height: 38, paddingHorizontal: 18, borderRadius: 19, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  clearBtnText: { fontSize: 14, fontWeight: '700', color: T.text },

  // sheet (shared)
  overlay: { flex: 1, backgroundColor: 'rgba(15,20,25,0.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%' },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: T.border, marginTop: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.line },
  sheetIconRose: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#fff1f2', alignItems: 'center', justifyContent: 'center' },
  sheetIconGray: { width: 38, height: 38, borderRadius: 12, backgroundColor: T.field, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2 },
  sheetFooter: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.line },
  btn: { height: 46, borderRadius: 23, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { borderWidth: 1, borderColor: T.border, backgroundColor: '#fff' },
  btnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // manage
  manageHead: { alignItems: 'center', paddingTop: 18, paddingBottom: 14, paddingHorizontal: 16 },
  bigAvatar: { width: 64, height: 64, borderRadius: 32, overflow: 'hidden', backgroundColor: '#d1fae5', borderWidth: 1, borderColor: '#a7f3d0', alignItems: 'center', justifyContent: 'center' },
  bigAvatarText: { fontSize: 22, fontWeight: '700', color: '#065f46' },
  manageName: { fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2, marginTop: 10, marginBottom: 2 },
  closeX: { position: 'absolute', top: 14, right: 16 },
  infoBox: { marginHorizontal: 16, borderWidth: 1, borderColor: T.line, borderRadius: 12, backgroundColor: T.strip },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12 },
  infoStrike: { fontSize: 14, fontWeight: '700', color: '#e11d48', backgroundColor: '#ffe4e6', paddingHorizontal: 9, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  infoValue: { fontSize: 14, fontWeight: '700', color: T.text },

  // history
  tile: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 12 },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileLabel: { fontSize: 12, fontWeight: '700' },
  tileNum: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5, marginTop: 6 },
  tileSub: { fontSize: 12, marginTop: 2 },
  logCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  logReason: { flexShrink: 1, fontSize: 14, fontWeight: '700' },
  masterTag: { fontSize: 11, fontWeight: '800', color: '#9f1239', backgroundColor: '#fecdd3', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5, overflow: 'hidden', textTransform: 'uppercase' },
  logDetails: { fontSize: 13, lineHeight: 19, color: '#374151', marginTop: 8 },
  logFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' },
  logFootText: { fontSize: 12, color: T.sub, fontWeight: '500' },

  // escalate
  body: { fontSize: 14, lineHeight: 21, color: T.sub },
  textarea: { height: 110, backgroundColor: T.field, borderRadius: 12, padding: 14, fontSize: 15, color: T.text },
  infoStrip: { flexDirection: 'row', gap: 10, marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: T.soft },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18, color: '#065f46' },
});