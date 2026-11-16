// ═══════════════════════════════════════════════════════════════
//  MOBILE APP (Expo React Native), src/pages/admin/AdminDashboard.jsx
//  Replace the WHOLE content of your current AdminDashboard.jsx with this.
//  Needs: nothing new.
//
//  The data logic (queries + math) is copied 1:1 from the web file.
//  Only the screen layout is mobile. The "live refresh" block is a
//  separate effect: delete it and everything else still works.
// ═══════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, Modal, RefreshControl, ActivityIndicator, AppState, Platform, StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookOpen, ChevronRight, Clock, Coins, Users, Wallet, X } from 'lucide-react-native';
import supabase from '../../supabaseClient';

// ── type colors (X-style reference)
const T = { text: '#0f1419', sub: '#536471', line: '#eff3f4', green: '#047857' , field: '#eff3f4', border: '#cfd9de', brand: '#047857', strip: '#f7f9f9'};

// ── same helpers as the web
const formatNumber = value => Number(value || 0).toLocaleString();

const formatDate = value => {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatPeso = value => `₱${Number(value || 0).toLocaleString()}`;

const methodLabel = value => {
  if (value === 'gcash') return 'GCash';
  if (value === 'paymaya') return 'Maya';
  return 'PayMongo';
};

// Display-only: colours for a top-up status.
const topupTone = value => {
  if (value === 'paid') return { dot: '#10b981', bg: '#ecfdf5', text: '#047857' };
  if (value === 'pending') return { dot: '#f59e0b', bg: '#fffbeb', text: '#b45309' };
  return { dot: '#9ca3af', bg: '#f3f4f6', text: '#6b7280' };
};

const relationOne = value => (Array.isArray(value) ? value[0] : value) || null;

export default function AdminDashboard() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [stats, setStats] = useState({ users: 0, skills: 0, sessions: 0, credits: 0 });
  const [recentUsers, setRecentUsers] = useState([]);
  const [topupStats, setTopupStats] = useState({ revenue: 0, credits: 0, paid: 0, pending: 0, gcash: 0, maya: 0 });
  const [recentTopups, setRecentTopups] = useState([]);
  const [topupError, setTopupError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const closeDetails = () => setSelectedRecord(null);
  const refetchRef = useRef(null); // lets pull-to-refresh and live refresh call the same fetch below

  // ════ DATA LOGIC: identical to the web ════
  useEffect(() => {
    let isMounted = true;

    // silent = true only skips the "loading dashes" on a refresh. Nothing else differs.
    const fetchDashboardData = async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const [usersResult, skillsResult, sessionsResult, creditsResult] = await Promise.all([
          supabase.from('user_profiles').select('id', { count: 'exact', head: true }),
          supabase.from('skills').select('id', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('sessions').select('id', { count: 'exact', head: true }),
          supabase.from('user_profiles').select('credits_balance'),
        ]);

        const totalCredits = creditsResult.data?.reduce(
          (sum, user) => sum + (Number(user.credits_balance) || 0),
          0,
        ) || 0;

        const { data: usersDataResult } = await supabase
          .from('user_profiles')
          .select('id, full_name, email, created_at')
          .order('created_at', { ascending: false })
          .limit(5);

        const topupResult = await supabase
          .from('topup_transactions')
          .select('id, amount_php, credits_added, status, payment_method, created_at, user_profiles(full_name, email)')
          .order('created_at', { ascending: false })
          .limit(1000);

        if (!isMounted) return;

        const topupRows = topupResult.data || [];
        const paidRows = topupRows.filter(t => t.status === 'paid');
        const sumOf = (rows, key) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
        setTopupError(Boolean(topupResult.error));
        setTopupStats({
          revenue: sumOf(paidRows, 'amount_php'),
          credits: sumOf(paidRows, 'credits_added'),
          paid: paidRows.length,
          pending: topupRows.filter(t => t.status === 'pending').length,
          gcash: paidRows.filter(t => t.payment_method === 'gcash').length,
          maya: paidRows.filter(t => t.payment_method === 'paymaya').length,
        });
        setRecentTopups(topupRows.slice(0, 5));

        setStats({
          users: usersResult.count || 0,
          skills: skillsResult.count || 0,
          sessions: sessionsResult.count || 0,
          credits: totalCredits,
        });
        setRecentUsers(usersDataResult || []);
      } catch (error) {
        console.error('Unable to load admin dashboard data:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    refetchRef.current = fetchDashboardData;
    fetchDashboardData();
    return () => { isMounted = false; refetchRef.current = null; };
  }, []);

  // ════ LIVE REFRESH (optional, separate): re-runs the same fetch when data changes ════
  useEffect(() => {
    let timer = null;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (refetchRef.current) refetchRef.current(true); }, 800);
    };
    let channel = null;
    try {
      channel = supabase.channel(`admin_overview_live_${Date.now()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_profiles' }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'skills' }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'topup_transactions' }, refresh)
        .subscribe();
    } catch (error) {
      console.log('Live updates unavailable:', error?.message);
    }
    const appSub = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });

    return () => {
      clearTimeout(timer);
      appSub.remove();
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    if (refetchRef.current) await refetchRef.current(true);
    setRefreshing(false);
  };

  // ── Display-only values derived from the stats above ──
  const metrics = [
    { label: 'Total users',      value: stats.users,    tab: 'Users',    Icon: Users,    bg: '#eff6ff', color: '#1d4ed8' },
    { label: 'Active skills',    value: stats.skills,   tab: 'Platform', Icon: BookOpen, bg: '#ecfdf5', color: '#047857' },
    { label: 'Total sessions',   value: stats.sessions, tab: 'Platform', Icon: Clock,    bg: '#fffbeb', color: '#b45309' },
    { label: 'Platform credits', value: stats.credits,  tab: 'Users',    Icon: Coins,    bg: '#f5f3ff', color: '#6d28d9' },
  ];

  const pct = count => (topupStats.paid ? Math.round((count / topupStats.paid) * 100) : 0);
  const dash = v => (loading ? '—' : v);
  const selected = selectedRecord?.item;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.green} colors={[T.green]} />}
      >
        <View style={s.pageHead}>
          <Text style={s.pageTitle}>Administration overview</Text>
          <Text style={s.detail}>Platform activity and account management at a glance.</Text>
        </View>
        <View style={s.sectionHead}>
          <Text style={s.lane}>Platform overview</Text>
          <Text style={s.detail}>Platform totals</Text>
        </View>
        {metrics.map(({label,value,tab,Icon,bg,color}) => (
          <Pressable key={label} onPress={() => navigation.navigate(tab)} style={({pressed}) => [s.queueRow, pressed && {backgroundColor:T.strip}]}>
            <View style={[s.queueIcon,{backgroundColor:bg}]}><Icon size={20} color={color} strokeWidth={1.9}/></View>
            <View style={{flex:1}}><Text style={s.itemName}>{label}</Text><Text style={s.detail}>Tap to view {tab.toLowerCase()}</Text></View>
            <Text style={[s.queueCount, loading && {opacity:0.3}]}>{dash(formatNumber(value))}</Text>
            <ChevronRight size={18} color={T.border}/>
          </Pressable>
        ))}
        {/* ── top-up revenue */}
        <View style={s.revenue}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={s.revLabel}>Top-up revenue</Text>
            <Wallet size={18} color="#a7f3d0" />
          </View>

          {topupError ? (
            <Text style={s.revError}>Could not load top-up data. Make sure the admin read policy for top-ups is in place.</Text>
          ) : (
            <>
              <Text style={[s.revValue, loading && { opacity: 0.3 }]}>{dash(formatPeso(topupStats.revenue))}</Text>
              <View style={s.revRow}>
                <View style={s.revCol}><Text style={s.revNum}>{dash(formatNumber(topupStats.credits))}</Text><Text style={s.revSub}>Credits sold</Text></View>
                <View style={s.revCol}><Text style={s.revNum}>{dash(formatNumber(topupStats.paid))}</Text><Text style={s.revSub}>Paid</Text></View>
                <View style={s.revCol}><Text style={s.revNum}>{dash(formatNumber(topupStats.pending))}</Text><Text style={s.revSub}>Pending</Text></View>
              </View>
              <Text style={s.revMethods}>
                GCash {dash(`${formatNumber(topupStats.gcash)} · ${pct(topupStats.gcash)}%`)}   |   Maya {dash(`${formatNumber(topupStats.maya)} · ${pct(topupStats.maya)}%`)}
              </Text>
            </>
          )}
        </View>

        {/* ── recent top-ups */}
        <View style={[s.laneHead,{marginTop:24}]}>
          <Text style={s.lane}>Recent top-ups</Text>
        </View>
        {loading ? (
          <ActivityIndicator style={{ marginVertical: 28 }} color={T.green} />
        ) : topupError ? (
          <Text style={s.emptyText}>Top-up records are not available right now.</Text>
        ) : recentTopups.length === 0 ? (
          <View style={s.empty}>
            <Wallet size={34} color="#cfd9de" />
            <Text style={[s.itemName, { marginTop: 8 }]}>No top-ups yet</Text>
            <Text style={s.detail}>Credit purchases will appear here.</Text>
          </View>
        ) : recentTopups.map(topup => {
          const member = relationOne(topup.user_profiles);
          const tone = topupTone(topup.status);
          return (
            <View key={topup.id} style={s.row}>
              <View style={[s.avatar, { backgroundColor: tone.bg }]}><Wallet size={18} color={tone.text} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.itemName} numberOfLines={1}>{member?.full_name || 'Unknown member'}</Text>
                <Text style={s.detail} numberOfLines={1}>{methodLabel(topup.payment_method)} · {formatDate(topup.created_at)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.itemName}>{formatPeso(topup.amount_php)}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: tone.dot }} />
                  <Text style={[s.detail, { textTransform: 'capitalize', color: tone.text }]}>{topup.status || 'unknown'}</Text>
                </View>
              </View>
            </View>
          );
        })}

        {/* ── newest accounts */}
        <View style={[s.laneHead, { marginTop: 14 }]}>
          <Text style={s.lane}>Newest accounts</Text>
          <Pressable onPress={() => navigation.navigate('Users')} hitSlop={8} style={s.seeAll}>
            <Text style={s.link}>See all</Text>
            <ChevronRight size={15} color={T.green} />
          </Pressable>
        </View>
        {loading ? (
          <ActivityIndicator style={{ marginVertical: 28 }} color={T.green} />
        ) : recentUsers.length === 0 ? (
          <View style={s.empty}>
            <Users size={34} color="#cfd9de" />
            <Text style={[s.itemName, { marginTop: 8 }]}>No recent accounts</Text>
            <Text style={s.detail}>New members will appear here.</Text>
          </View>
        ) : recentUsers.map(user => (
          <Pressable key={user.id} onPress={() => setSelectedRecord({ type: 'user', item: user })}
            style={({ pressed }) => [s.row, pressed && { backgroundColor: '#f7f9f9' }]}>
            <View style={[s.avatar, { backgroundColor: '#d1fae5' }]}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#065f46' }}>{(user.full_name || 'M').trim().charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.itemName} numberOfLines={1}>{user.full_name || 'New member'}</Text>
              <Text style={s.detail} numberOfLines={1}>{user.email || 'Email not provided'}</Text>
            </View>
            <Text style={[s.detail, { color: '#8b98a5' }]}>{formatDate(user.created_at)}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* ── account details (same info as the web side panel) */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={closeDetails}>
        <Pressable style={s.overlay} onPress={closeDetails} />
        {!!selected && (
          <View style={[s.sheet, { paddingBottom: insets.bottom + 14 }]}>
            <View style={s.grabber} />
            <View style={s.sheetHead}>
              <View style={[s.avatar, { width: 48, height: 48, borderRadius: 24, backgroundColor: '#d1fae5' }]}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#065f46' }}>{(selected.full_name || 'M').trim().charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.detail}>Newly created member</Text>
                <Text style={s.lane} numberOfLines={2}>{selected.full_name || 'New member'}</Text>
              </View>
              <Pressable onPress={closeDetails} hitSlop={10}><X size={22} color="#8b98a5" /></Pressable>
            </View>

            <View style={s.dRow}><Text style={s.detail}>Email</Text><Text style={s.dVal} selectable>{selected.email || 'Not provided'}</Text></View>
            <View style={s.dRow}><Text style={s.detail}>Joined</Text><Text style={s.dVal}>{formatDate(selected.created_at)}</Text></View>
            <View style={s.dRow}>
              <Text style={s.detail}>Record ID</Text>
              <Text style={[s.dVal, { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, color: T.sub }]} selectable>{selected.id}</Text>
            </View>

            <Pressable onPress={closeDetails} style={s.closeBtn}>
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Close</Text>
            </Pressable>
          </View>
        )}
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  queueCount: { minWidth: 34, textAlign: 'right', fontSize: 24, fontWeight: '700', color: T.text, letterSpacing: -0.5 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.line },
  queueIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  queueRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: T.line },
  pageTitle: { fontSize: 20, fontWeight: '700', color: T.text, letterSpacing: -0.3, marginBottom: 2 },
  pageHead: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  // text
  lane: { fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2 },
  itemName: { fontSize: 15, fontWeight: '600', color: T.text },
  detail: { fontSize: 13, color: T.sub },
  link: { fontSize: 13, fontWeight: '700', color: T.green },

  // numbers
  grid: { flexDirection: 'row', flexWrap: 'wrap', borderBottomWidth: 1, borderBottomColor: T.line },
  tile: { width: '50%', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.line },
  tileIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  tileValue: { fontSize: 24, fontWeight: '800', color: T.text, letterSpacing: -0.4, marginBottom: 2 },

  // revenue card
  revenue: { marginHorizontal: 16, marginTop: 16, padding: 16, borderRadius: 12, backgroundColor: '#064e3b' },
  revLabel: { fontSize: 14, fontWeight: '600', color: '#d1fae5' },
  revValue: { fontSize: 36, fontWeight: '700', color: '#fff', letterSpacing: -1 },
  revError: { marginTop: 10, fontSize: 13, lineHeight: 19, color: '#fecdd3' },
  revRow: { flexDirection: 'row', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)' },
  revCol: { flex: 1 },
  revNum: { fontSize: 18, fontWeight: '800', color: '#fff' },
  revSub: { fontSize: 13, lineHeight: 18, color: 'rgba(209,250,229,0.8)', marginTop: 10 },
  revMethods: { fontSize: 13, lineHeight: 18, color: 'rgba(209,250,229,0.8)', marginTop: 10 },

  // lanes + rows
  laneHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.line },
  seeAll: { flexDirection: 'row', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: T.line },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { fontSize: 14, color: T.sub, textAlign: 'center', paddingVertical: 28 },

  // details sheet
  overlay: { flex: 1, backgroundColor: 'rgba(15,20,25,0.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: T.border, marginTop: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.line },
  dRow: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: T.line },
  dVal: { fontSize: 15, fontWeight: '600', color: T.text, marginTop: 3 },
  closeBtn: { height: 44, borderRadius: 22, backgroundColor: T.green, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
});