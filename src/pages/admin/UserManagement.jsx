// ═══════════════════════════════════════════════════════════════
//  MOBILE APP (Expo React Native), src/pages/admin/UserManagement.jsx
//  Replace the WHOLE content of your current UserManagement.jsx with this.
//  Needs: nothing new.
//
//  All the data + admin action logic (fetch, role change, credit adjust,
//  ban/unban, logs, notifications) is copied 1:1 from the web file.
//  Only the layout is mobile. The "live refresh" block is separate:
//  delete it and everything else still works.
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Image, Pressable, FlatList, TextInput, Modal, ScrollView, RefreshControl,
  ActivityIndicator, AppState, KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Ban, BookOpen, Calendar, ChevronDown, ChevronRight, Clock, Coins, Eye, Mail, Phone,
  Search, Shield, ShieldAlert, UserCheck, Users, UserX, X,
} from 'lucide-react-native';
import supabase from '../../supabaseClient';

// ── type colors (X-style reference)
const T = { text: '#0f1419', sub: '#536471', line: '#eff3f4', green: '#047857', soft: '#f7f9f9' };

const ROLE_OPTIONS = ['User', 'Moderator', 'Admin'];

// ── same helpers as the web
const formatNumber = value => Number(value || 0).toLocaleString();

const formatDate = value => {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const userName = user => user?.full_name?.trim() || 'Unnamed user';

// colour of the thin accent on the left of each row
const accountAccent = user => {
  if (user.is_deleted) return '#d1d5db';
  if (user.is_banned) return '#f43f5e';
  return '#10b981';
};

// ── small pieces
function UserAvatar({ user, size = 44 }) {
  const initial = userName(user).charAt(0).toUpperCase();
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: '#d1fae5',
      alignItems: 'center', justifyContent: 'center',
    }}>
      {user?.avatar_url
        ? <Image source={{ uri: user.avatar_url }} style={{ width: '100%', height: '100%' }} />
        : <Text style={{ fontWeight: '700', color: '#065f46', fontSize: size * 0.4 }}>{initial}</Text>}
    </View>
  );
}

function StatusBadge({ isBanned, isDeleted }) {
  const cfg = isDeleted
    ? { label: 'Deleted', dot: '#9ca3af', bg: '#f3f4f6', text: '#6b7280' }
    : isBanned
      ? { label: 'Banned', dot: '#f43f5e', bg: '#fff1f2', text: '#be123c' }
      : { label: 'Active', dot: '#10b981', bg: '#ecfdf5', text: '#047857' };
  return (
    <View style={[s.badge, { backgroundColor: cfg.bg }]}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: cfg.dot }} />
      <Text style={{ fontSize: 12, fontWeight: '700', color: cfg.text }}>{cfg.label}</Text>
    </View>
  );
}

// bottom sheet shell
function Sheet({ onClose, children, keyboard = false }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={keyboard && Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={s.overlay} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 14 }]}>
          <View style={s.grabber} />
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function MenuRow({ Icon, iconColor, label, detail, danger, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.menuRow, pressed && { backgroundColor: T.soft }]}>
      <Icon size={20} color={iconColor || T.sub} />
      <Text style={[s.menuText, danger && { color: '#e11d48' }]}>{label}</Text>
      {!!detail && <Text style={s.detail}>{detail}</Text>}
      <ChevronRight size={18} color="#cfd9de" />
    </Pressable>
  );
}

// ────────────────── MAIN SCREEN
export default function UserManagement() {
  const insets = useSafeAreaInsets();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adminUser, setAdminUser] = useState(null);
  const [activeModal, setActiveModal] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [creditAmount, setCreditAmount] = useState('');
  const [creditError, setCreditError] = useState('');
  const [savingUserId, setSavingUserId] = useState(null);
  const [pageError, setPageError] = useState('');
  const [notice, setNotice] = useState('');
  const [roleFilterOpen, setRoleFilterOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const debounceRef = useRef(null);
  const creditAdjustInFlightRef = useRef(false);

  // ════ DATA LOGIC: identical to the web (silent only skips the loading state on refresh) ════
  const fetchUsers = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setPageError('');
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) setPageError('Could not load users. Please try again.');
    setUsers(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const initialize = async () => {
      const { data } = await supabase.auth.getUser();
      if (isMounted) setAdminUser(data?.user || null);
      await fetchUsers();
    };
    initialize();
    return () => { isMounted = false; };
  }, [fetchUsers]);

  const closeModal = useCallback(() => {
    setActiveModal(null);
    setCreditAmount('');
    setCreditError('');
  }, []);

  const logAdminAction = async (targetUserId, actionType, details) => {
    if (!adminUser) return;
    await supabase.from('admin_logs').insert({
      admin_id: adminUser.id,
      target_user_id: targetUserId,
      action_type: actionType,
      details,
    });
  };

  const updateLocalUser = (userId, updates) => {
    setUsers(current => current.map(user => user.id === userId ? { ...user, ...updates } : user));
  };

  const handleRoleChange = async (user, newRole) => {
    setSavingUserId(user.id);
    setNotice('');
    const { error } = await supabase.from('user_profiles').update({ role: newRole }).eq('id', user.id);
    if (error) {
      setNotice('The role could not be updated. Please try again.');
      setSavingUserId(null);
      return;
    }
    updateLocalUser(user.id, { role: newRole });
    await logAdminAction(user.id, 'ROLE_CHANGE', `Promoted/Demoted ${userName(user)} to ${newRole}`);
    await supabase.from('notifications').insert({
      user_id: user.id,
      type: 'system',
      content: `Your account role has been updated to ${newRole} by an Admin.`,
    });
    setNotice(`Role updated to ${newRole} for ${userName(user)}.`);
    setSavingUserId(null);
    closeModal();
  };

  const handleCreditAdjust = async user => {
    if (creditAdjustInFlightRef.current || savingUserId) return;
    const parsedAmount = Number.parseInt(creditAmount, 10);
    if (!creditAmount.trim() || !Number.isFinite(parsedAmount) || parsedAmount === 0) {
      setCreditError('Enter a whole number other than zero. Use a negative number to deduct credits.');
      return;
    }

    creditAdjustInFlightRef.current = true;
    setSavingUserId(user.id);
    setCreditError('');
    setNotice('');
    try {
      // The Admin-only RPC checks authorization, locks the wallet and writes
      // CREDIT_ADJUST admin_logs atomically. Do not log a second time here.
      const { data, error } = await supabase.rpc('skillcredit_admin_adjust_credits', {
        p_target_user_id: user.id,
        p_delta: parsedAmount,
      });
      if (error) throw error;
      if (data?.state !== 'adjusted' || data?.target_user_id !== user.id ||
          !Number.isInteger(data?.new_balance)) {
        throw new Error('Adjustment result could not be verified. Refresh the user before retrying.');
      }
      const newBalance = data.new_balance;
      updateLocalUser(user.id, { credits_balance: newBalance });
      const actionWord = parsedAmount >= 0 ? 'added to' : 'deducted from';
      const { error: notificationError } = await supabase.from('notifications').insert({
        user_id: user.id,
        type: 'system_alert',
        content: `Admin has ${actionWord} your account by ${Math.abs(parsedAmount)} credits. Your new balance is ${newBalance} CR.`,
      });
      if (notificationError) console.warn('Admin credit notification failed:', notificationError);
      setNotice(`Credits updated for ${userName(user)}. New balance: ${formatNumber(newBalance)} CR.${notificationError ? ' Notification failed.' : ''}`);
      closeModal();
    } catch (error) {
      console.error('Admin credit adjustment failed:', error);
      setCreditError(error?.message || 'Cannot verify wallet update. Refresh before retrying to prevent duplicate credits.');
    } finally {
      creditAdjustInFlightRef.current = false;
      setSavingUserId(null);
    }
  };

  // Shared Web + Expo ban operation. The database RPC synchronizes the user,
  // existing linked escalation cases, and admin_logs in one transaction.
  const handleBanToggle = async user => {
    if (savingUserId) return;
    const currentBanStatus = Boolean(user.is_banned);
    setSavingUserId(user.id);
    setNotice('');
    try {
      const { error } = await supabase.rpc('skillcredit_admin_change_account_ban', {
        p_target_user_id: user.id,
        p_is_banned: !currentBanStatus,
        p_source: 'user_management',
        p_note: null,
        p_escalation_id: null,
      });
      if (error) throw error;

      // Audit history is written inside the RPC. Do not insert a duplicate log.
      if (currentBanStatus) {
        try {
          const { error: notificationError } = await supabase.from('notifications').insert({
            user_id: user.id,
            type: 'system',
            content: 'Good news! Your account ban has been lifted by an Admin.',
          });
          if (notificationError) console.warn('Ban lifted; notification failed:', notificationError);
        } catch (notificationError) {
          console.warn('Ban lifted; notification failed:', notificationError);
        }
      }
      updateLocalUser(user.id, { is_banned: !currentBanStatus });
      closeModal();
      setNotice(`${userName(user)} is now ${currentBanStatus ? 'active' : 'banned'}. Linked escalations synchronized.`);
    } catch (error) {
      console.error('Unable to change account ban:', error);
      setNotice(`Could not ${currentBanStatus ? 'lift ban for' : 'ban'} ${userName(user)}: ${error?.message || 'Please try again.'}`);
    } finally {
      setSavingUserId(null);
      await fetchUsers(true);
    }
  };

  const handleConfirmAction = async () => {
    if (!activeModal) return;
    const latestUser = users.find(user => user.id === activeModal.user?.id) || activeModal.user;
    if (activeModal.type === 'role') await handleRoleChange(latestUser, activeModal.newRole);
    if (activeModal.type === 'ban') await handleBanToggle(latestUser);
  };

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return users.filter(user => {
      const matchesQuery = !query
        || userName(user).toLowerCase().includes(query)
        || (user.email || '').toLowerCase().includes(query)
        || (user.id || '').toLowerCase().includes(query);

      let matchesStatus = true;
      if (statusFilter === 'active') matchesStatus = !user.is_banned && !user.is_deleted;
      else if (statusFilter === 'banned') matchesStatus = Boolean(user.is_banned) && !user.is_deleted;
      else if (statusFilter === 'deleted') matchesStatus = Boolean(user.is_deleted);

      const matchesRole = roleFilter === 'all' || (user.role || 'User') === roleFilter;
      return matchesQuery && matchesStatus && matchesRole;
    });
  }, [users, searchQuery, statusFilter, roleFilter]);

  const activeCount = users.filter(user => !user.is_banned && !user.is_deleted).length;
  const bannedCount = users.filter(user => user.is_banned && !user.is_deleted).length;
  const deletedCount = users.filter(user => user.is_deleted).length;

  const statTabs = [
    { id: 'all', label: 'All', count: users.length },
    { id: 'active', label: 'Active', count: activeCount },
    { id: 'banned', label: 'Banned', count: bannedCount },
    { id: 'deleted', label: 'Deleted', count: deletedCount },
  ];

  const openCreditModal = user => {
    setCreditAmount('');
    setCreditError('');
    setActiveModal({ type: 'credits', user });
  };

  const openRoleConfirm = (user, newRole) => {
    if (newRole === user.role) return;
    setActiveModal({ type: 'role', user, newRole });
  };

  const openBanConfirm = user => setActiveModal({ type: 'ban', user });

  const hasFilters = Boolean(searchQuery) || statusFilter !== 'all' || roleFilter !== 'all';
  const clearFilters = () => { setSearchQuery(''); setStatusFilter('all'); setRoleFilter('all'); };

  // ════ LIVE REFRESH (optional, separate): re-runs the same fetch when accounts change ════
  useEffect(() => {
    const refresh = () => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchUsers(true), 800);
    };
    let channel = null;
    try {
      channel = supabase.channel(`admin_users_live_${Date.now()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_profiles' }, refresh)
        .subscribe();
    } catch (error) {
      console.log('Live updates unavailable:', error?.message);
    }
    const appSub = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => {
      clearTimeout(debounceRef.current);
      appSub.remove();
      if (channel) supabase.removeChannel(channel);
    };
  }, [fetchUsers]);

  const onRefresh = async () => { setRefreshing(true); await fetchUsers(true); setRefreshing(false); };

  const modalUser = activeModal?.user ? (users.find(user => user.id === activeModal.user.id) || activeModal.user) : null;
  const saving = !!modalUser && savingUserId === modalUser.id;

  // ── header of the list (search + filters + messages)
  const header = (
    <View>
      {!!notice && (
        <View style={s.notice}>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: '#065f46', lineHeight: 20 }}>{notice}</Text>
          <Pressable onPress={() => setNotice('')} hitSlop={10}><X size={18} color="#047857" /></Pressable>
        </View>
      )}
      {!!pageError && (
        <View style={[s.notice, { backgroundColor: '#fff1f2' }]}>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: '#9f1239' }}>{pageError}</Text>
          <Pressable onPress={() => fetchUsers()} style={s.retry}><Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Try again</Text></Pressable>
        </View>
      )}

      <View style={s.searchRow}>
        <View style={s.search}>
          <Search size={18} color="#8b98a5" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search name, email, or ID"
            placeholderTextColor="#8b98a5"
            style={s.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {!!searchQuery && <Pressable onPress={() => setSearchQuery('')} hitSlop={8}><X size={18} color="#8b98a5" /></Pressable>}
        </View>
        <Pressable onPress={() => setRoleFilterOpen(true)} style={[s.roleBtn, roleFilter !== 'all' && { backgroundColor: '#d1fae5' }]}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: roleFilter !== 'all' ? '#065f46' : T.sub }}>{roleFilter === 'all' ? 'All roles' : roleFilter}</Text>
          <ChevronDown size={15} color={roleFilter !== 'all' ? '#065f46' : '#8b98a5'} />
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        {statTabs.map(tab => {
          const on = statusFilter === tab.id;
          return (
            <Pressable key={tab.id} onPress={() => setStatusFilter(tab.id)} style={[s.chip, on && { backgroundColor: T.text }]}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: on ? '#fff' : T.sub }}>{tab.label}</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: on ? 'rgba(255,255,255,0.65)' : '#8b98a5', opacity: loading ? 0.3 : 1 }}>{formatNumber(tab.count)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {hasFilters && !loading && (
        <View style={s.showing}>
          <Text style={s.detail}>Showing {formatNumber(filteredUsers.length)} of {formatNumber(users.length)}</Text>
          <Pressable onPress={clearFilters} hitSlop={8}><Text style={s.link}>Clear filters</Text></Pressable>
        </View>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <FlatList
        data={filteredUsers}
        keyExtractor={user => String(user.id)}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.green} colors={[T.green]} />}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginVertical: 48 }} color={T.green} />
          ) : (
            <View style={s.empty}>
              <Users size={38} color="#cfd9de" />
              <Text style={[s.itemName, { marginTop: 10 }]}>No users found</Text>
              <Text style={s.detail}>Try changing your search or filters.</Text>
              {hasFilters && (
                <Pressable onPress={clearFilters} style={s.clearBtn}><Text style={{ fontSize: 14, fontWeight: '700', color: T.text }}>Clear filters</Text></Pressable>
              )}
            </View>
          )
        }
        renderItem={({ item: user }) => (
          <Pressable
            onPress={() => setActiveModal({ type: 'menu', user })}
            style={({ pressed }) => [s.row, user.is_deleted && { opacity: 0.7 }, pressed && { backgroundColor: T.soft }]}
          >
            <View style={[s.accent, { backgroundColor: accountAccent(user) }]} />
            <UserAvatar user={user} />
            <View style={{ flex: 1 }}>
              <Text style={s.itemName} numberOfLines={1}>{userName(user)}</Text>
              <Text style={s.detail} numberOfLines={1}>{user.email || 'Email not provided'}</Text>
              <Text style={[s.detail, { color: '#8b98a5' }]} numberOfLines={1}>{user.role || 'User'} · Joined {formatDate(user.created_at)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={s.itemName}>{formatNumber(user.credits_balance)} CR</Text>
              <StatusBadge isBanned={user.is_banned} isDeleted={user.is_deleted} />
            </View>
          </Pressable>
        )}
      />

      {/* ── role filter */}
      {roleFilterOpen && (
        <Sheet onClose={() => setRoleFilterOpen(false)}>
          <Text style={s.sheetTitle}>Filter by role</Text>
          {['all', ...ROLE_OPTIONS].map(role => (
            <Pressable key={role} onPress={() => { setRoleFilter(role); setRoleFilterOpen(false); }} style={s.pickRow}>
              <Text style={[s.menuText, { flex: 1 }, roleFilter === role && { color: T.green }]}>{role === 'all' ? 'All roles' : role}</Text>
              {roleFilter === role && <UserCheck size={18} color={T.green} />}
            </Pressable>
          ))}
        </Sheet>
      )}

      {/* ── 1. manage menu (one tap on a user) */}
      {activeModal?.type === 'menu' && (
        <Sheet onClose={closeModal}>
          <View style={s.sheetHead}>
            <UserAvatar user={modalUser} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={s.lane} numberOfLines={1}>{userName(modalUser)}</Text>
              <Text style={s.detail} numberOfLines={1}>{modalUser.email || 'Email not provided'}</Text>
            </View>
            <StatusBadge isBanned={modalUser.is_banned} isDeleted={modalUser.is_deleted} />
          </View>

          <MenuRow Icon={Eye} label="View profile" onPress={() => setActiveModal({ type: 'details', user: modalUser })} />
          {!modalUser.is_deleted ? (
            <>
              <MenuRow Icon={Coins} iconColor="#b45309" label="Adjust credits" detail={`${formatNumber(modalUser.credits_balance)} CR`}
                onPress={() => openCreditModal(modalUser)} />
              <MenuRow Icon={Shield} iconColor={T.green} label="Change role" detail={modalUser.role || 'User'}
                onPress={() => setActiveModal({ type: 'rolepick', user: modalUser })} />
              <MenuRow
                Icon={modalUser.is_banned ? UserCheck : Ban}
                iconColor={modalUser.is_banned ? T.green : '#e11d48'}
                label={modalUser.is_banned ? 'Restore access' : 'Ban account'}
                danger={!modalUser.is_banned}
                onPress={() => openBanConfirm(modalUser)}
              />
            </>
          ) : (
            <Text style={[s.detail, { paddingVertical: 14, textAlign: 'center' }]}>Deleted accounts are locked.</Text>
          )}
        </Sheet>
      )}

      {/* ── role picker (then the same confirm step as the web) */}
      {activeModal?.type === 'rolepick' && (
        <Sheet onClose={closeModal}>
          <Text style={s.sheetTitle}>Change role</Text>
          <Text style={[s.detail, { marginBottom: 6 }]}>{userName(modalUser)}</Text>
          {ROLE_OPTIONS.map(role => {
            const current = (modalUser.role || 'User') === role;
            return (
              <Pressable key={role} onPress={() => (current ? closeModal() : openRoleConfirm(modalUser, role))} style={s.pickRow}>
                <Text style={[s.menuText, { flex: 1 }, current && { color: T.green }]}>{role}{current ? '  (current)' : ''}</Text>
                {current && <UserCheck size={18} color={T.green} />}
              </Pressable>
            );
          })}
        </Sheet>
      )}

      {/* ── 2. profile details */}
      {activeModal?.type === 'details' && (() => {
        const user = modalUser;
        const interests = Array.isArray(user.interests) ? user.interests : [];
        return (
          <Sheet onClose={closeModal}>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: '100%' }}>
              <View style={{ alignItems: 'center', paddingTop: 6, paddingBottom: 14 }}>
                <UserAvatar user={user} size={72} />
                <Text style={[s.lane, { marginTop: 10, textAlign: 'center' }]}>{userName(user)}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <Mail size={14} color="#8b98a5" />
                  <Text style={s.detail} selectable>{user.email || 'Email not provided'}</Text>
                </View>
                <View style={{ marginTop: 10 }}><StatusBadge isBanned={user.is_banned} isDeleted={user.is_deleted} /></View>
              </View>

              {!!user.bio && (
                <View style={s.dRow}><Text style={s.detail}>About</Text><Text style={s.dVal}>{user.bio}</Text></View>
              )}
              <View style={s.dPair}>
                <View style={{ flex: 1 }}><Text style={s.detail}>System role</Text><Text style={s.dVal}>{user.role || 'User'}</Text></View>
                <View style={{ flex: 1 }}><Text style={s.detail}>Credit balance</Text><Text style={s.dVal}>{formatNumber(user.credits_balance)} CR</Text></View>
              </View>
              <View style={s.dRow}>
                <View style={s.dLabel}><Phone size={14} color="#8b98a5" /><Text style={s.detail}>Contact info</Text></View>
                <Text style={s.dVal}>{user.contact_info || 'Not specified'}</Text>
              </View>
              <View style={s.dRow}>
                <View style={s.dLabel}><Clock size={14} color="#8b98a5" /><Text style={s.detail}>Availability schedule</Text></View>
                <Text style={s.dVal}>{user.availability_schedule || 'Not specified'}</Text>
              </View>
              {interests.length > 0 && (
                <View style={s.dRow}>
                  <View style={s.dLabel}><BookOpen size={14} color="#8b98a5" /><Text style={s.detail}>Interests</Text></View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {interests.map((interest, idx) => (
                      <View key={idx} style={s.interest}><Text style={{ fontSize: 13, fontWeight: '600', color: '#065f46' }}>{interest}</Text></View>
                    ))}
                  </View>
                </View>
              )}
              <View style={s.dRow}>
                <View style={s.dLabel}><Calendar size={14} color="#8b98a5" /><Text style={s.detail}>Date joined</Text></View>
                <Text style={s.dVal}>{formatDate(user.created_at)}</Text>
              </View>
              <View style={s.dRow}>
                <Text style={s.detail}>User ID</Text>
                <Text style={[s.dVal, { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, color: T.sub }]} selectable>{user.id}</Text>
              </View>

              <Pressable onPress={closeModal} style={s.grayBtn}><Text style={{ fontSize: 16, fontWeight: '700', color: T.text }}>Close</Text></Pressable>
            </ScrollView>
          </Sheet>
        );
      })()}

      {/* ── 3. credit adjustment */}
      {activeModal?.type === 'credits' && (
        <Sheet onClose={closeModal} keyboard>
          <Text style={s.sheetTitle}>Adjust credits</Text>
          <Text style={[s.detail, { marginBottom: 12 }]}>Add or deduct credits for this account</Text>

          <View style={s.userBox}>
            <UserAvatar user={modalUser} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={s.itemName} numberOfLines={1}>{userName(modalUser)}</Text>
              <Text style={s.detail}>Current balance: {formatNumber(modalUser.credits_balance)} CR</Text>
            </View>
          </View>

          <Text style={[s.detail, { fontWeight: '600', marginTop: 14, marginBottom: 6 }]}>Credit adjustment amount</Text>
          <View style={s.amountWrap}>
            <Coins size={18} color="#b45309" />
            <TextInput
              value={creditAmount}
              onChangeText={v => { setCreditAmount(v); setCreditError(''); }}
              placeholder="e.g. 10 or -5"
              placeholderTextColor="#8b98a5"
              keyboardType="numbers-and-punctuation"
              style={s.amountInput}
              autoFocus
            />
          </View>
          <Text style={[s.detail, { marginTop: 6 }]}>Use positive numbers to add credits or negative numbers to deduct them.</Text>
          {!!creditError && <Text style={s.error}>{creditError}</Text>}

          <View style={s.btnRow}>
            <Pressable onPress={closeModal} disabled={saving} style={[s.outBtn, saving && { opacity: 0.5 }]}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: T.text }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => handleCreditAdjust(modalUser)} disabled={saving} style={[s.mainBtn, saving && { opacity: 0.5 }]}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>{saving ? 'Applying…' : 'Apply adjustment'}</Text>
            </Pressable>
          </View>
        </Sheet>
      )}

      {/* ── 4. role / ban confirmation */}
      {(activeModal?.type === 'role' || activeModal?.type === 'ban') && (() => {
        const isBan = activeModal.type === 'ban';
        const isRestoring = isBan && modalUser?.is_banned;
        const title = activeModal.type === 'role' ? 'Confirm role change' : isRestoring ? 'Restore account access' : 'Ban this account';
        const sub = activeModal.type === 'role' ? 'System role assignment' : 'Account status modification';
        const danger = isBan && !isRestoring;
        return (
          <Sheet onClose={closeModal}>
            <Text style={s.sheetTitle}>{title}</Text>
            <Text style={[s.detail, { marginBottom: 12 }]}>{sub}</Text>

            <View style={[s.userBox, danger && { backgroundColor: '#fff1f2' }]}>
              <Text style={{ fontSize: 15, lineHeight: 22, color: T.text }}>
                {activeModal.type === 'role' ? (
                  <>Change role for <Text style={s.bold}>{userName(activeModal.user)}</Text> from <Text style={s.bold}>{activeModal.user.role || 'User'}</Text> to <Text style={s.bold}>{activeModal.newRole}</Text>?</>
                ) : isRestoring ? (
                  <>Restore full access for <Text style={s.bold}>{userName(activeModal.user)}</Text>? Their account will be reactivated.</>
                ) : (
                  <>Ban <Text style={s.bold}>{userName(activeModal.user)}</Text>? This will restrict active account access across the platform.</>
                )}
              </Text>
            </View>

            {danger && (
              <View style={s.warn}>
                <ShieldAlert size={18} color="#e11d48" style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 13, lineHeight: 19, color: '#9f1239' }}>This action will be logged in system audit logs and sent as a notification to the user.</Text>
              </View>
            )}

            <View style={s.btnRow}>
              <Pressable onPress={closeModal} disabled={saving} style={[s.outBtn, saving && { opacity: 0.5 }]}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: T.text }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleConfirmAction} disabled={saving}
                style={[s.mainBtn, danger && { backgroundColor: '#be123c' }, saving && { opacity: 0.5 }]}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>
                  {saving ? 'Saving…' : activeModal.type === 'role' ? 'Confirm' : isRestoring ? 'Restore access' : 'Ban account'}
                </Text>
              </Pressable>
            </View>
          </Sheet>
        );
      })()}
    </View>
  );
}

const s = StyleSheet.create({
  // text
  lane: { fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2 },
  itemName: { fontSize: 15, fontWeight: '600', color: T.text },
  detail: { fontSize: 13, color: T.sub, lineHeight: 18 },
  link: { fontSize: 13, fontWeight: '700', color: T.green },
  bold: { fontWeight: '700' },

  // header
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 12, backgroundColor: '#ecfdf5', borderRadius: 12, padding: 12 },
  retry: { backgroundColor: '#be123c', borderRadius: 14, paddingHorizontal: 12, height: 30, alignItems: 'center', justifyContent: 'center' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, borderRadius: 21, backgroundColor: '#eff3f4', paddingHorizontal: 14 },
  searchInput: { flex: 1, fontSize: 15, color: T.text, paddingVertical: 0 },
  roleBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 42, paddingHorizontal: 12, borderRadius: 21, backgroundColor: '#eff3f4' },
  chips: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: '#eff3f4' },
  showing: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },

  // rows
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.line },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 24, paddingHorizontal: 9, borderRadius: 12 },
  empty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 24 },
  clearBtn: { marginTop: 14, height: 40, paddingHorizontal: 18, borderRadius: 20, borderWidth: 1, borderColor: '#cfd9de', alignItems: 'center', justifyContent: 'center' },

  // sheets
  overlay: { flex: 1, backgroundColor: 'rgba(15,20,25,0.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 8, maxHeight: '88%' },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#cfd9de', marginBottom: 8 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: T.text, marginTop: 4, marginBottom: 2, letterSpacing: -0.2 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: T.line },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 56, borderBottomWidth: 1, borderBottomColor: T.line },
  menuText: { flex: 1, fontSize: 16, fontWeight: '600', color: T.text },
  pickRow: { flexDirection: 'row', alignItems: 'center', height: 52, borderBottomWidth: 1, borderBottomColor: T.line },

  // details
  dRow: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: T.line },
  dPair: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: T.line },
  dLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dVal: { fontSize: 15, fontWeight: '600', color: T.text, marginTop: 3 },
  interest: { backgroundColor: '#ecfdf5', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  grayBtn: { height: 48, borderRadius: 24, backgroundColor: '#eff3f4', alignItems: 'center', justifyContent: 'center', marginTop: 8 },

  // credits + confirm
  userBox: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.soft, borderRadius: 12, padding: 12 },
  amountWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, borderRadius: 12, borderWidth: 1, borderColor: '#cfd9de', paddingHorizontal: 14 },
  amountInput: { flex: 1, fontSize: 17, fontWeight: '600', color: T.text, paddingVertical: 0 },
  error: { marginTop: 8, fontSize: 13, fontWeight: '600', color: '#be123c' },
  warn: { flexDirection: 'row', gap: 10, marginTop: 10, backgroundColor: '#fff1f2', borderRadius: 12, padding: 12 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  outBtn: { flex: 1, height: 48, borderRadius: 24, borderWidth: 1, borderColor: '#cfd9de', alignItems: 'center', justifyContent: 'center' },
  mainBtn: { flex: 1.5, height: 48, borderRadius: 24, backgroundColor: T.green, alignItems: 'center', justifyContent: 'center' },
});