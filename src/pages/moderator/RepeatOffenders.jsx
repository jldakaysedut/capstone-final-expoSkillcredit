import { Alert } from '../../components/SkillCreditAlert';
// ═══════════════════════════════════════════════════════════════
//  MOBILE APP (Expo React Native) — src/pages/moderator/RepeatOffenders.jsx
//  Same logic as the new web version: accounts with 3+ strikes merged with the
//  'escalated' rows of repeat_offenders, Total / Pending / Escalated filters, search,
//  the report-history lookup, and the 4-step escalation (repeat_offenders ->
//  admin_escalations -> mod_logs -> notification).
//  Mobile layout: filter chips (the web summary cards), account rows (the web table)
//  and ONE bottom sheet that switches between Manage / History / Escalate.
//  Added pull-to-refresh.
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, Image, Pressable, FlatList, ScrollView, TextInput, Modal, RefreshControl, AppState,
  KeyboardAvoidingView, Platform, ActivityIndicator, StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertTriangle, ChevronRight, Clock, MessageSquareOff, Scale, Search, ShieldAlert, ShieldCheck, UploadCloud, X,
} from 'lucide-react-native';
import supabase from '../../supabaseClient';

const T = {
  text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4',
  brand: '#047857', soft: '#ecfdf5', strip: '#f7f9f9', danger: '#be123c',
};

const CLOSED_HISTORY = { isOpen: false, user: null, logs: [], loading: false };

export default function RepeatOffenders() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offenders, setOffenders] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentModId, setCurrentModId] = useState(null);
  const lastFetch = useRef(0);

  const [activeTabFilter, setActiveTabFilter] = useState('ALL');
  const [manageModal, setManageModal] = useState({ isOpen: false, user: null });
  const [escalateModal, setEscalateModal] = useState({ isOpen: false, user: null });
  const [escalationNote, setEscalationNote] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [historyModal, setHistoryModal] = useState(CLOSED_HISTORY);

  const STRIKE_LIMIT = 3;

  // silent = background refresh (no skeleton)
  const fetchOffenders = async (silent = false) => {
    if (!silent) setLoading(true);
    lastFetch.current = Date.now();
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentModId(user?.id);

    const { data: usersData, error: usersError } = await supabase
      .from('user_profiles')
      .select('id, full_name, avatar_url, role, violation_count, community_restricted_until, booking_restricted_until')
      .gte('violation_count', STRIKE_LIMIT)
      .order('violation_count', { ascending: false });

    if (!usersError && usersData) {
      // Fetch from repeat_offenders to see if status is 'escalated'
      const { data: repeatOffendersData } = await supabase
        .from('repeat_offenders')
        .select('user_id, status')
        .eq('status', 'escalated');

      const escalatedIds = new Set((repeatOffendersData || []).map((r) => r.user_id));

      const combinedData = usersData.map((u) => ({
        ...u,
        is_escalated: escalatedIds.has(u.id),
      }));

      setOffenders(combinedData);
    }
    setLoading(false);
  };

  useEffect(() => { fetchOffenders(); }, []);

  // coming back to this tab, or back to the app -> quietly refresh
  useEffect(() => {
    const unsubFocus = navigation.addListener('focus', () => {
      if (Date.now() - lastFetch.current > 3000) fetchOffenders(true);
    });
    const appSub = AppState.addEventListener('change', (state) => { if (state === 'active') fetchOffenders(true); });
    const refreshRealtime = () => fetchOffenders(true);
    const liveChannel = supabase.channel('mod_repeatoffenders_live_' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'repeat_offenders' }, refreshRealtime)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, refreshRealtime)
      .subscribe();
    return () => { unsubFocus(); appSub.remove(); supabase.removeChannel(liveChannel); };
  }, [navigation]);

  const onRefresh = async () => { setRefreshing(true); await fetchOffenders(true); setRefreshing(false); };

  const handleOpenEscalateModal = (targetUser) => {
    setManageModal({ isOpen: false, user: null });
    setEscalateModal({ isOpen: true, user: targetUser });
    setEscalationNote('');
  };

  const handleOpenHistoryModal = async (targetUser) => {
    setManageModal({ isOpen: false, user: null });
    setHistoryModal({ isOpen: true, user: targetUser, logs: [], loading: true });

    const { data, error } = await supabase
      .from('reports')
      .select('id, created_at, reason, details, status, reference_type')
      .eq('reported_user_id', targetUser.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setHistoryModal({ isOpen: true, user: targetUser, logs: data, loading: false });
    } else {
      setHistoryModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const confirmEscalation = async () => {
    if (!escalationNote.trim()) {
      Alert.alert('Please provide a justification note for the Administration team.');
      return;
    }
    setIsProcessing(true);
    const targetUser = escalateModal.user;

    try {
      // 1. Check if record exists in repeat_offenders
      const { data: existingOffender } = await supabase
        .from('repeat_offenders')
        .select('id')
        .eq('user_id', targetUser.id)
        .maybeSingle();

      let repeatOffenderId = existingOffender?.id;

      if (existingOffender) {
        // Update existing record status to 'escalated'
        const { error: updateErr } = await supabase
          .from('repeat_offenders')
          .update({ status: 'escalated', moderator_id: currentModId, updated_at: new Date().toISOString() })
          .eq('id', existingOffender.id);

        if (updateErr) throw updateErr;
      } else {
        // Insert new record with status 'escalated'
        const { data: newOffender, error: insertOffenderErr } = await supabase
          .from('repeat_offenders')
          .insert([{
            user_id: targetUser.id,
            moderator_id: currentModId,
            status: 'escalated',
          }])
          .select('id')
          .single();

        if (insertOffenderErr) throw insertOffenderErr;
        if (newOffender) repeatOffenderId = newOffender.id;
      }

      // 2. Insert into admin_escalations for the admin queue with status 'pending'
      const { data: escalationRecord, error: escalationErr } = await supabase
        .from('admin_escalations')
        .insert([{
          repeat_offender_id: repeatOffenderId,
          moderator_id: currentModId,
          status: 'pending',
        }])
        .select()
        .single();

      if (escalationErr) throw escalationErr;

      // 3. Log the action in mod_logs
      const { error: logErr } = await supabase.from('mod_logs').insert([{
        moderator_id: currentModId,
        target_user_id: targetUser.id,
        action_type: 'ESCALATED_TO_ADMIN',
        reference_id: escalationRecord.id,
        details: `Escalated repeat offender (${targetUser.violation_count} strikes) to Admin.\nNotes: ${escalationNote.trim()}`,
      }]);

      if (logErr) throw logErr;

      const notifContent = `Your account behavior has been escalated to an Administrator for severe review due to accumulating ${targetUser.violation_count} policy strikes.\n\nModerator Note: ${escalationNote.trim()}`;

      await supabase.from('notifications').insert([{
        user_id: targetUser.id,
        type: 'account_escalated',
        content: notifContent,
      }]);

      setOffenders((prev) => prev.map((u) =>
        (u.id === targetUser.id ? { ...u, is_escalated: true } : u),
      ));

      Alert.alert('Escalated', `Successfully escalated ${targetUser.full_name} to the Administration team.`);
      setEscalateModal({ isOpen: false, user: null });
    } catch (err) {
      console.error(err);
      Alert.alert('Error escalating user: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const stats = useMemo(() => {
    const total = offenders.length;
    const escalatedCount = offenders.filter((u) => u.is_escalated).length;
    const pendingCount = total - escalatedCount;

    return { total, pending: pendingCount, escalated: escalatedCount };
  }, [offenders]);

  const filteredOffenders = useMemo(() => {
    return offenders.filter((user) => {
      const isEscalated = user.is_escalated;

      if (activeTabFilter === 'PENDING' && isEscalated) return false;
      if (activeTabFilter === 'ESCALATED' && !isEscalated) return false;

      const matchesSearch =
        user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.id.includes(searchQuery);

      return matchesSearch;
    });
  }, [offenders, searchQuery, activeTabFilter]);

  const validHistoryLogs = historyModal.logs
    .filter((log) => !log.details?.toUpperCase().includes('DISMISS'))
    .sort((a, b) => {
      const isAEscape = a.reason === 'Repeat Offender Threshold Reached';
      const isBEscape = b.reason === 'Repeat Offender Threshold Reached';
      if (isAEscape && !isBEscape) return -1;
      if (!isAEscape && isBEscape) return 1;
      return new Date(b.created_at) - new Date(a.created_at);
    });

  const strikeReportsCount = validHistoryLogs.filter(
    (log) => log.reason !== 'Repeat Offender Threshold Reached',
  );

  // ── Display-only: the three filter chips (the web summary cards) ──
  const tabs = [
    { id: 'ALL',       label: 'Total tracked',      count: stats.total },
    { id: 'PENDING',   label: 'Pending review',     count: stats.pending },
    { id: 'ESCALATED', label: 'Escalated to admin', count: stats.escalated },
  ];
  const dim = loading ? { opacity: 0.3 } : null;

  const closeManage = () => setManageModal({ isOpen: false, user: null });
  const closeHistory = () => setHistoryModal(CLOSED_HISTORY);
  const closeEscalate = () => { if (!isProcessing) setEscalateModal({ isOpen: false, user: null }); };

  // ONE modal; its content switches (avoids two modals fighting on iOS)
  const sheet = (escalateModal.isOpen && escalateModal.user) ? 'escalate'
    : (historyModal.isOpen && historyModal.user) ? 'history'
      : (manageModal.isOpen && manageModal.user) ? 'manage'
        : null;
  const closeSheet = sheet === 'escalate' ? closeEscalate : sheet === 'history' ? closeHistory : closeManage;

  const Header = (
    <View>
      <View style={s.pageHead}>
        <Text style={s.pageTitle}>Repeat offenders queue</Text>
        <Text style={s.small}>Review accounts with {STRIKE_LIMIT} or more policy strikes and manage escalation statuses.</Text>
      </View>

      <FlatList
        horizontal
        data={tabs}
        keyExtractor={(t) => t.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chips}
        renderItem={({ item: tab }) => {
          const on = activeTabFilter === tab.id;
          return (
            <Pressable onPress={() => setActiveTabFilter(tab.id)} style={[s.chip, on && s.chipOn]} accessibilityState={{ selected: on }}>
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
          placeholder="Search by name or details"
          placeholderTextColor={T.sub}
          autoCapitalize="none"
          autoCorrect={false}
          style={s.searchInput}
          accessibilityLabel="Search repeat offenders"
        />
        {!!searchQuery && (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8} accessibilityLabel="Clear search"><X size={17} color={T.sub} /></Pressable>
        )}
      </View>
      {!loading && (
        <Text style={[s.small, { paddingHorizontal: 16, paddingBottom: 10 }]}>
          Showing <Text style={{ fontWeight: '700', color: T.text }}>{filteredOffenders.length}</Text> of {offenders.length} accounts
        </Text>
      )}
    </View>
  );

  const renderItem = ({ item: user }) => {
    const isEscalated = user.is_escalated;

    return (
      <Pressable
        onPress={() => setManageModal({ isOpen: true, user })}
        style={({ pressed }) => [s.row, pressed && { backgroundColor: T.strip }]}
      >
        <View style={[s.accent, { backgroundColor: isEscalated ? '#f43f5e' : '#fbbf24' }]} />

        <View style={s.topLine}>
          <View style={s.avatar}>
            {user.avatar_url
              ? <Image source={{ uri: user.avatar_url }} style={{ width: 44, height: 44 }} />
              : <Text style={s.avatarText}>{user.full_name?.charAt(0) || 'U'}</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle} numberOfLines={1}>{user.full_name}</Text>
            <View style={s.roleLine}>
              <Text style={s.roleChip}>{user.role || 'User'}</Text>
              <Text style={s.small}>#{user.id.split('-')[0]}</Text>
            </View>
          </View>
          <View style={s.strikePill}>
            <View style={s.strikeDot} />
            <Text style={s.strikeText}>{user.violation_count} Strikes</Text>
          </View>
        </View>

        <View style={s.metaRow}>
          {isEscalated ? (
            <View style={[s.badge, { backgroundColor: '#fff1f2', borderColor: '#fecdd3' }]}>
              <UploadCloud size={13} color="#9f1239" />
              <Text style={[s.badgeText, { color: '#9f1239' }]}>Escalated to Admin</Text>
            </View>
          ) : (
            <View style={[s.badge, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
              <View style={[s.pillDot, { backgroundColor: '#f59e0b' }]} />
              <Text style={[s.badgeText, { color: '#92400e' }]}>Pending Review</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          <Text style={[s.actionText, { color: isEscalated ? T.sub : T.brand }]}>{isEscalated ? 'View record' : 'Manage user'}</Text>
          <ChevronRight size={16} color={isEscalated ? T.sub : T.brand} />
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
      <View style={[s.emptyIcon, { backgroundColor: T.soft, borderColor: '#d1fae5' }]}><ShieldCheck size={22} color={T.brand} /></View>
      <Text style={[s.rowTitle, { marginTop: 12 }]}>No accounts match this filter</Text>
      <Text style={[s.small, { textAlign: 'center', marginTop: 4 }]}>Try switching your view above or clearing your search.</Text>
      {!!searchQuery && (
        <Pressable onPress={() => setSearchQuery('')} style={s.clearBtn}><Text style={s.clearBtnText}>Clear search</Text></Pressable>
      )}
    </View>
  );

  const mUser = manageModal.user;
  const hUser = historyModal.user;
  const eUser = escalateModal.user;

  return (
    <>
      <FlatList
        style={{ flex: 1, backgroundColor: '#fff' }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        data={loading ? [] : filteredOffenders}
        keyExtractor={(user) => user.id}
        renderItem={renderItem}
        ListHeaderComponent={Header}
        ListEmptyComponent={Empty}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.brand} colors={[T.brand]} />}
      />

      {/* ── ONE SHEET: manage / history / escalate */}
      <Modal visible={!!sheet} transparent animationType="slide" onRequestClose={closeSheet}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={s.overlay} onPress={closeSheet} />

          {/* MANAGE */}
          {sheet === 'manage' && !!mUser && (
            <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
              <View style={s.grabber} />
              <View style={s.manageHead}>
                <View style={s.bigAvatar}>
                  {mUser.avatar_url
                    ? <Image source={{ uri: mUser.avatar_url }} style={{ width: 64, height: 64 }} />
                    : <Text style={s.bigAvatarText}>{mUser.full_name?.charAt(0)?.toUpperCase() || 'U'}</Text>}
                </View>
                <Text style={s.manageName} numberOfLines={1}>{mUser.full_name}</Text>
                <Text style={s.small}>{mUser.role || 'User'}  •  #{mUser.id.split('-')[0]}</Text>
                <Pressable onPress={closeManage} style={s.closeX} hitSlop={10}><X size={22} color={T.sub} /></Pressable>
              </View>

              <View style={s.infoBox}>
                <View style={s.infoRow}>
                  <Text style={s.small}>Policy strikes</Text>
                  <Text style={s.infoStrike}>{mUser.violation_count}</Text>
                </View>
                <View style={[s.infoRow, { borderTopWidth: 1, borderTopColor: T.line }]}>
                  <Text style={s.small}>Queue status</Text>
                  <Text style={s.infoValue}>{mUser.is_escalated ? 'Escalated to Admin' : 'Pending Review'}</Text>
                </View>
              </View>

              <View style={{ paddingHorizontal: 16, gap: 10, marginTop: 14 }}>
                <Pressable onPress={() => handleOpenHistoryModal(mUser)} style={[s.btn, { backgroundColor: T.field }]}>
                  <Clock size={16} color={T.text} />
                  <Text style={[s.btnText, { color: T.text }]}>View active reports</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleOpenEscalateModal(mUser)}
                  disabled={mUser.is_escalated}
                  style={[s.btn, mUser.is_escalated
                    ? { backgroundColor: T.strip, borderWidth: 1, borderColor: T.line }
                    : { backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3' }]}
                >
                  <UploadCloud size={16} color={mUser.is_escalated ? '#9ca3af' : '#be123c'} />
                  <Text style={[s.btnText, { color: mUser.is_escalated ? '#9ca3af' : '#be123c' }]}>{mUser.is_escalated ? 'Already escalated' : 'Escalate to Admin'}</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* HISTORY */}
          {sheet === 'history' && !!hUser && (
            <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
              <View style={s.grabber} />
              <View style={s.sheetHeader}>
                <View style={s.sheetIconGray}><Clock size={20} color={T.sub} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.sheetTitle}>Active report history</Text>
                  <Text style={s.small} numberOfLines={1}>{hUser.full_name}</Text>
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
                        <Text style={[s.tileNum, { color: '#78350f' }]}>{strikeReportsCount.length}</Text>
                        <Text style={[s.tileSub, { color: '#b45309' }]}>filed against this user</Text>
                      </View>
                      <View style={[s.tile, { backgroundColor: '#faf5ff', borderColor: '#e9d5ff' }]}>
                        <View style={s.tileHead}><Scale size={15} color="#7e22ce" /><Text style={[s.tileLabel, { color: '#7e22ce' }]}>Session disputes</Text></View>
                        <Text style={[s.tileNum, { color: '#581c87' }]}>
                          {strikeReportsCount.filter((l) => l.reference_type?.toLowerCase().includes('session') || l.reference_type?.toLowerCase().includes('booking')).length}
                        </Text>
                        <Text style={[s.tileSub, { color: '#7e22ce' }]}>booking or escrow issues</Text>
                      </View>
                    </View>

                    <Text style={s.sectionLabel}>Associated reports</Text>
                    {validHistoryLogs.length === 0 ? (
                      <Text style={[s.small, { fontStyle: 'italic' }]}>No active reports found for this user.</Text>
                    ) : (
                      validHistoryLogs.map((log) => {
                        const isEscalationTicket = log.reason === 'Repeat Offender Threshold Reached';
                        const isDispute = log.reference_type?.toLowerCase().includes('session') || log.reference_type?.toLowerCase().includes('booking');
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
                              <Text style={[s.logReason, { color: style.text }]} numberOfLines={1}>{log.reason || 'User Report'}</Text>
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
                      })
                    )}
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

          {/* ESCALATE */}
          {sheet === 'escalate' && !!eUser && (
            <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
              <View style={s.grabber} />
              <View style={s.sheetHeader}>
                <View style={s.sheetIconRose}><AlertTriangle size={20} color={T.danger} /></View>
                <Text style={[s.sheetTitle, { flex: 1 }]}>Escalate to admin</Text>
                <Pressable onPress={closeEscalate} hitSlop={10}><X size={22} color={T.sub} /></Pressable>
              </View>

              <View style={{ padding: 16 }}>
                <Text style={s.body}>
                  You are escalating <Text style={{ fontWeight: '700', color: T.text }}>{eUser.full_name}</Text> ({eUser.violation_count} strikes) to the Administration team for severe review and a possible permanent ban.
                </Text>

                <Text style={s.label}>Moderator justification notes</Text>
                <TextInput
                  value={escalationNote}
                  onChangeText={setEscalationNote}
                  placeholder="Explain why this user needs to be banned"
                  placeholderTextColor={T.sub}
                  multiline
                  textAlignVertical="top"
                  style={s.textarea}
                />

                <View style={s.infoStrip}>
                  <ShieldAlert size={16} color={T.brand} style={{ marginTop: 1 }} />
                  <Text style={s.infoText}>These notes are attached to the user's notification and logged securely for the admin's reference.</Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                  <Pressable onPress={() => setEscalateModal({ isOpen: false, user: null })} disabled={isProcessing} style={[s.btn, s.btnGhost, { flex: 1 }, isProcessing && { opacity: 0.5 }]}>
                    <Text style={[s.btnText, { color: T.text }]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={confirmEscalation}
                    disabled={isProcessing || !escalationNote.trim()}
                    style={[s.btn, { backgroundColor: T.danger, flex: 1.5 }, (isProcessing || !escalationNote.trim()) && { opacity: 0.5 }]}
                  >
                    {isProcessing
                      ? <><ActivityIndicator color="#fff" size="small" /><Text style={s.btnText}>Escalating...</Text></>
                      : <Text style={s.btnText}>Confirm escalation</Text>}
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