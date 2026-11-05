// ═══════════════════════════════════════════════════════════════
//  MOBILE APP (Expo React Native) — src/pages/user/Payments.jsx
//  Mobile version (same data + logic as the web Payments page), compact X-style typography
//  to match UserDashboard. Needs: npx expo install expo-web-browser
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react';
import {
  View, Text, Pressable, SectionList, ScrollView, TextInput, Modal, Alert, RefreshControl, AppState,
  ActivityIndicator, KeyboardAvoidingView, Platform, DeviceEventEmitter, StyleSheet,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import {
  ArrowDownRight, ArrowUpRight, Check, CheckCircle2, Clock, CreditCard, History, RefreshCcw, X, XCircle,
} from 'lucide-react-native';
import supabase from '../../supabaseClient';

const T = {
  text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de',
  brand: '#047857', soft: '#ecfdf5', field: '#eff3f4', danger: '#e11d48',
};

const TOPUP_PACKAGES = [
  { phpAmount: 100,  bonusCredits: 0 },
  { phpAmount: 500,  bonusCredits: 5 },
  { phpAmount: 1000, bonusCredits: 15 },
  { phpAmount: 2000, bonusCredits: 40 },
];

const FILTERS = ['All', 'Top-ups', 'Earned', 'Spent', 'Refunds'];
const FILTER_TYPE = { 'Top-ups': 'TOPUP', Earned: 'EARNED', Spent: 'SPENT', Refunds: 'REFUND' };
const GROUP_ORDER = ['Today', 'This week', 'This month', 'Earlier'];

const getGroup = (iso) => {
  const diffDays = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (diffDays < 1) return 'Today';
  if (diffDays < 7) return 'This week';
  if (diffDays < 30) return 'This month';
  return 'Earlier';
};

const fmtDate = (iso) => {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
};

// icon + colours per transaction (same rules as the web)
function txLook(tx) {
  if (tx.status === 'pending') return { Icon: Clock, bg: '#fffbeb', fg: '#d97706' };
  if (tx.status === 'failed') return { Icon: XCircle, bg: '#fff1f2', fg: '#e11d48' };
  if (tx.type === 'EARNED' || tx.type === 'TOPUP') return { Icon: ArrowDownRight, bg: '#ecfdf5', fg: '#059669' };
  if (tx.type === 'SPENT') return { Icon: ArrowUpRight, bg: '#fff1f2', fg: '#e11d48' };
  return { Icon: RefreshCcw, bg: '#f0f9ff', fg: '#0284c7' }; // REFUND
}

function Chip({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && s.chipOn]}>
      <Text style={[s.chipText, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export default function Payments() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [balance, setBalance] = useState(0);
  const [ledger, setLedger] = useState([]);
  const [stats, setStats] = useState({ earned: 0, spent: 0 });
  const [filter, setFilter] = useState('All');
  const [notice, setNotice] = useState(null); // { tone: 'info' | 'success' | 'warn', text }

  const [showTopup, setShowTopup] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(TOPUP_PACKAGES[1]);
  const [customAmount, setCustomAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const userIdRef = useRef(null);
  const balanceRef = useRef(0);
  const pollRef = useRef(null);
  const awaitingRef = useRef(false); // true while the user is out in the PayMongo checkout

  // ── load balance + ledger (same data rules as the web)
  const load = async () => {
    try {
      let uid = userIdRef.current;
      if (!uid) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { navigation.navigate('Login'); return null; }
        uid = user.id;
        userIdRef.current = uid;
      }

      const { data: profile } = await supabase.from('user_profiles').select('credits_balance').eq('id', uid).single();
      const bal = profile?.credits_balance || 0;
      setBalance(bal);
      balanceRef.current = bal;

      const { data: topups } = await supabase.from('topup_transactions').select('*').eq('user_id', uid);
      const { data: sessions } = await supabase
        .from('sessions')
        .select('id, status, credit_amount, created_at, student_id, instructor_id, skill:skills(title)')
        .or(`student_id.eq.${uid},instructor_id.eq.${uid}`);

      const combined = [];
      let totalEarned = 0;
      let totalSpent = 0;

      (topups || []).forEach((t) => {
        combined.push({
          id: `topup-${t.id}`,
          type: 'TOPUP',
          title: t.payment_method === 'gcash' ? 'GCash top-up' : t.payment_method === 'paymaya' ? 'Maya top-up' : 'PayMongo top-up',
          amount: t.credits_added,
          isPositive: true,
          date: t.created_at,
          status: t.status,
          meta: `₱${t.amount_php}`,
        });
      });

      (sessions || []).forEach((sess) => {
        if (sess.student_id === uid) {
          combined.push({
            id: `book-${sess.id}`, type: 'SPENT', title: `Session booking: ${sess.skill?.title || 'Session'}`,
            amount: sess.credit_amount, isPositive: false, date: sess.created_at, status: 'paid', meta: 'Payment for session',
          });
          if (['active', 'completed', 'upcoming', 'reschedule_proposed'].includes(sess.status)) totalSpent += sess.credit_amount;
          if (sess.status === 'cancelled') {
            combined.push({
              id: `refund-${sess.id}`, type: 'REFUND', title: `Refund: ${sess.skill?.title || 'Session'}`,
              amount: sess.credit_amount, isPositive: true, date: sess.created_at, status: 'paid', meta: 'Cancelled booking',
            });
          }
        }
        if (sess.instructor_id === uid && sess.status === 'completed') {
          combined.push({
            id: `earn-${sess.id}`, type: 'EARNED', title: `Session earnings: ${sess.skill?.title || 'Session'}`,
            amount: sess.credit_amount, isPositive: true, date: sess.created_at, status: 'paid', meta: 'Completed session',
          });
          totalEarned += sess.credit_amount;
        }
      });

      // latest first; on identical timestamps a refund shows above the booking it reverses
      combined.sort((a, b) => {
        const diff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (diff === 0) {
          if (a.type === 'REFUND' && b.type === 'SPENT') return -1;
          if (a.type === 'SPENT' && b.type === 'REFUND') return 1;
        }
        return diff;
      });

      setLedger(combined);
      setStats({ earned: totalEarned, spent: totalSpent });
      return { balance: bal };
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  // The webhook can arrive a few seconds after checkout, so we poll briefly.
  const confirmPayment = (txId) => {
    awaitingRef.current = false;
    if (pollRef.current) return;
    const startBalance = balanceRef.current;
    setNotice({ tone: 'info', text: 'Confirming your payment…' });
    let tries = 0;
    pollRef.current = setInterval(async () => {
      tries++;
      let paid = false;
      if (txId) {
        const { data } = await supabase.from('topup_transactions').select('status').eq('id', txId).single();
        paid = data?.status === 'paid';
      }
      const res = await load();
      if (!txId && res && res.balance > startBalance) paid = true;

      if (paid) {
        stopPoll();
        setNotice({ tone: 'success', text: 'Payment received. Your credits were added.' });
      } else if (tries >= 12) {
        stopPoll();
        setNotice({ tone: 'warn', text: 'We have not received the payment yet. If you paid, your credits will appear shortly.' });
      }
    }, 1500);
  };

  // ── init + live updates
  useEffect(() => {
    let disposed = false;
    let channel = null;

    (async () => {
      await load();
      if (disposed) return;
      setLoading(false);
      const uid = userIdRef.current;
      if (!uid) return;
      channel = supabase.channel(`payments_live_${uid}_${Date.now()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'topup_transactions', filter: `user_id=eq.${uid}` }, () => load())
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_profiles', filter: `id=eq.${uid}` }, () => load())
        .subscribe();
    })();

    const creditSub = DeviceEventEmitter.addListener('credit_updated', () => load());
    const appSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (awaitingRef.current) confirmPayment(); // back from the checkout page
      else load();
    });

    return () => {
      disposed = true;
      stopPoll();
      creditSub.remove();
      appSub.remove();
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  // optional deep link back from checkout: navigate('Payments', { status, tx })
  const pStatus = route.params?.status;
  const pTx = route.params?.tx;
  useEffect(() => {
    if (!pStatus || !pTx) return;
    navigation.setParams({ status: undefined, tx: undefined });
    if (pStatus === 'cancelled') { setNotice({ tone: 'warn', text: 'Payment cancelled. No credits were added.' }); return; }
    confirmPayment(pTx);
  }, [pStatus, pTx]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  // ── top-up maths (same as the web)
  const getActiveAmountPHP = () => {
    if (customAmount) return Number(customAmount);
    return selectedPackage ? selectedPackage.phpAmount : 0;
  };
  const getCalculatedCredits = () => {
    const phpAmount = getActiveAmountPHP();
    const baseCredits = Math.floor(phpAmount / 10);
    if (customAmount) {
      if (phpAmount >= 2000) return baseCredits + 40;
      if (phpAmount >= 1000) return baseCredits + 15;
      if (phpAmount >= 500) return baseCredits + 5;
      return baseCredits;
    }
    return selectedPackage ? baseCredits + selectedPackage.bonusCredits : 0;
  };

  const amountPHP = getActiveAmountPHP();
  const amountValid = amountPHP >= 10 && amountPHP % 10 === 0;

  const handleCheckout = async () => {
    if (amountPHP < 10) { Alert.alert('Minimum top-up amount is ₱10.'); return; }
    if (amountPHP % 10 !== 0) { Alert.alert('Top-up amount must be a multiple of ₱10.'); return; }

    setIsProcessing(true);
    try {
      // The server computes the credits and creates the pending transaction.
      // We only send the amount, so the app can't fake credits.
      const { data, error } = await supabase.functions.invoke('create-paymongo-checkout', {
        body: { amount: amountPHP, return_path: '/payments' },
      });
      if (error) throw error;
      if (!data?.checkout_url) throw new Error(data?.error || 'Invalid response from payment gateway.');

      setIsProcessing(false);
      setShowTopup(false);
      await new Promise((r) => setTimeout(r, 400)); // let the sheet finish closing before the browser opens
      const result = await WebBrowser.openBrowserAsync(data.checkout_url);
      awaitingRef.current = true;
      if (result.type !== 'opened') confirmPayment(); // iOS resolves when the user closes the page
    } catch (error) {
      console.error('Checkout Error:', error);
      Alert.alert('Something went wrong', 'We could not prepare your checkout. Please try again.');
      setIsProcessing(false);
    }
  };

  const openTopup = () => { setSelectedPackage(TOPUP_PACKAGES[1]); setCustomAmount(''); setShowTopup(true); };
  const closeTopup = () => { if (!isProcessing) setShowTopup(false); };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color={T.brand} />
      </View>
    );
  }

  // ── derived lists
  const counts = {
    All: ledger.length,
    'Top-ups': ledger.filter((t) => t.type === 'TOPUP').length,
    Earned: ledger.filter((t) => t.type === 'EARNED').length,
    Spent: ledger.filter((t) => t.type === 'SPENT').length,
    Refunds: ledger.filter((t) => t.type === 'REFUND').length,
  };
  const filtered = filter === 'All' ? ledger : ledger.filter((t) => t.type === FILTER_TYPE[filter]);
  const sections = GROUP_ORDER
    .map((title) => ({ title, data: filtered.filter((t) => getGroup(t.date) === title) }))
    .filter((sec) => sec.data.length > 0);

  const noticeStyle = {
    info: { bg: '#ecfdf5', fg: '#065f46' },
    success: { bg: '#ecfdf5', fg: '#065f46' },
    warn: { bg: '#fffbeb', fg: '#92400e' },
  };

  const Header = (
    <View>
      {/* balance */}
      <View style={s.topBlock}>
        {!!notice && (
          <View style={[s.notice, { backgroundColor: noticeStyle[notice.tone].bg }]}>
            {notice.tone === 'info'
              ? <ActivityIndicator size="small" color={noticeStyle[notice.tone].fg} />
              : <CheckCircle2 size={17} color={noticeStyle[notice.tone].fg} />}
            <Text style={[s.noticeText, { color: noticeStyle[notice.tone].fg }]}>{notice.text}</Text>
            {notice.tone !== 'info' && (
              <Pressable onPress={() => setNotice(null)} hitSlop={10}><X size={16} color={noticeStyle[notice.tone].fg} /></Pressable>
            )}
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Available balance</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
              <Text style={s.balance}>{balance.toLocaleString()}</Text>
              <Text style={s.balanceUnit}>CR</Text>
            </View>
            <Text style={s.detail}>≈ ₱{(balance * 10).toLocaleString()}</Text>
          </View>
          <Pressable onPress={openTopup} style={s.addBtn}>
            <CreditCard size={17} color="#fff" />
            <Text style={s.addBtnText}>Add credits</Text>
          </Pressable>
        </View>

        <View style={s.statsRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.detail}>Earned</Text>
            <Text style={s.statValue}>+{stats.earned.toLocaleString()} CR</Text>
          </View>
          <View style={s.statDivider} />
          <View style={{ flex: 1, paddingLeft: 16 }}>
            <Text style={s.detail}>Spent</Text>
            <Text style={s.statValue}>−{stats.spent.toLocaleString()} CR</Text>
          </View>
        </View>
      </View>

      {/* filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
        {FILTERS.map((f) => (
          <Chip
            key={f}
            label={f !== 'All' && counts[f] > 0 ? `${f} ${counts[f]}` : f}
            active={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </ScrollView>

      <View style={s.listHead}>
        <Text style={s.title}>Activity</Text>
        <Text style={s.detail}>{filtered.length} {filtered.length === 1 ? 'transaction' : 'transactions'}</Text>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: 140 }}
        ListHeaderComponent={Header}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.brand} colors={[T.brand]} />}
        renderSectionHeader={({ section }) => <Text style={s.groupLabel}>{section.title}</Text>}
        renderItem={({ item: tx }) => {
          const { Icon, bg, fg } = txLook(tx);
          return (
            <View style={s.row}>
              <View style={[s.txIcon, { backgroundColor: bg }]}><Icon size={19} color={fg} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle} numberOfLines={1}>{tx.title}</Text>
                <Text style={s.detail} numberOfLines={1}>{fmtDate(tx.date)} · {tx.meta}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.amount, { color: tx.isPositive ? '#059669' : T.text }]}>
                  {tx.isPositive ? '+' : '−'}{tx.amount} CR
                </Text>
                {tx.status === 'pending' && <Text style={[s.status, { color: '#b45309' }]}>Pending</Text>}
                {tx.status === 'failed' && <Text style={[s.status, { color: '#be123c' }]}>Failed</Text>}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={(
          <View style={s.empty}>
            <History size={40} color={T.border} />
            <Text style={s.emptyTitle}>{ledger.length === 0 ? 'No transactions yet' : 'Nothing here'}</Text>
            <Text style={s.emptySub}>
              {ledger.length === 0 ? 'Add credits or book a session to get started.' : 'Try another filter to see more.'}
            </Text>
            <Pressable onPress={ledger.length === 0 ? openTopup : () => setFilter('All')} style={s.showAll}>
              <Text style={s.showAllText}>{ledger.length === 0 ? 'Add credits' : 'Show all'}</Text>
            </Pressable>
          </View>
        )}
      />

      {/* ADD CREDITS SHEET */}
      <Modal visible={showTopup} transparent animationType="slide" onRequestClose={closeTopup}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={s.overlay} onPress={closeTopup} />
          <View style={[s.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={s.grabber} />
            <Text style={s.sheetTitle}>Add credits</Text>
            <Text style={[s.detail, { marginBottom: 6 }]}>₱10 = 1 credit. Larger packages include bonus credits.</Text>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {TOPUP_PACKAGES.map((pkg) => {
                const on = selectedPackage === pkg && !customAmount;
                const total = Math.floor(pkg.phpAmount / 10) + pkg.bonusCredits;
                return (
                  <Pressable key={pkg.phpAmount} onPress={() => { setSelectedPackage(pkg); setCustomAmount(''); }} style={s.pkgRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.pkgPrice, on && { fontWeight: '700', color: T.brand }]}>₱{pkg.phpAmount.toLocaleString()}</Text>
                      <Text style={s.detail}>
                        {total} credits{pkg.bonusCredits > 0 && <Text style={{ fontWeight: '600', color: T.brand }}> · +{pkg.bonusCredits} bonus</Text>}
                      </Text>
                    </View>
                    {on && <Check size={18} color={T.brand} />}
                  </Pressable>
                );
              })}

              <Text style={[s.fieldLabel, { marginTop: 14 }]}>Other amount</Text>
              <View style={[s.amountField, !!customAmount && { borderColor: T.brand }]}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: T.sub }}>₱</Text>
                <TextInput
                  value={customAmount}
                  onChangeText={(t) => { setCustomAmount(t.replace(/[^0-9]/g, '')); setSelectedPackage(null); }}
                  placeholder="Minimum 10"
                  placeholderTextColor={T.sub}
                  keyboardType="number-pad"
                  style={s.amountInput}
                />
              </View>
              {!!customAmount && !amountValid && <Text style={s.hintError}>Enter at least ₱10, in multiples of ₱10.</Text>}

              <View style={s.summary}>
                <View style={s.sumRow}>
                  <Text style={s.sumLabel}>You receive</Text>
                  <Text style={s.sumValue}>{amountValid ? getCalculatedCredits().toLocaleString() : 0} credits</Text>
                </View>
                <View style={[s.sumRow, { marginTop: 8 }]}>
                  <Text style={s.sumLabel}>Total</Text>
                  <Text style={s.sumValue}>₱{amountPHP.toLocaleString()}</Text>
                </View>
              </View>

              <Pressable
                onPress={handleCheckout}
                disabled={isProcessing || !amountValid}
                style={[s.payBtn, (isProcessing || !amountValid) && { opacity: 0.5 }]}
              >
                {isProcessing
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.payBtnText}>Pay ₱{amountPHP.toLocaleString()}</Text>}
              </Pressable>
              <Text style={[s.detail, { textAlign: 'center', marginTop: 10 }]}>Secure checkout by PayMongo</Text>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  // balance block
  topBlock: { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14 },
  label: { fontSize: 13, color: T.sub },
  balance: { fontSize: 32, fontWeight: '700', color: T.text, letterSpacing: -0.6 },
  balanceUnit: { fontSize: 17, fontWeight: '600', color: T.sub },
  detail: { fontSize: 13, color: T.sub },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 42, paddingHorizontal: 18, borderRadius: 21, backgroundColor: T.brand },
  addBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.line },
  statDivider: { width: 1, height: 30, backgroundColor: T.line },
  statValue: { fontSize: 15, fontWeight: '700', color: T.text, marginTop: 1 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  noticeText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },

  // chips
  chipRow: { gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  chip: { justifyContent: 'center', paddingHorizontal: 14, height: 34, borderRadius: 17, backgroundColor: T.field },
  chipOn: { backgroundColor: T.text },
  chipText: { fontSize: 13, fontWeight: '600', color: T.text },

  // list
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.line },
  title: { fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2 },
  groupLabel: { fontSize: 13, fontWeight: '600', color: T.sub, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, backgroundColor: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.line, backgroundColor: '#fff' },
  txIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: T.text, lineHeight: 20, marginBottom: 1 },
  amount: { fontSize: 15, fontWeight: '700' },
  status: { fontSize: 13, fontWeight: '600', marginTop: 1 },

  // empty
  empty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: T.text, marginTop: 12 },
  emptySub: { fontSize: 14, color: T.sub, marginTop: 4, textAlign: 'center' },
  showAll: { backgroundColor: T.brand, paddingHorizontal: 26, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  showAllText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // sheet
  overlay: { flex: 1, backgroundColor: 'rgba(15,20,25,0.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 8, maxHeight: '90%' },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: T.border, marginBottom: 6 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: T.text, marginTop: 6, marginBottom: 2 },
  pkgRow: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: 8, borderTopWidth: 1, borderTopColor: T.line },
  pkgPrice: { fontSize: 15, fontWeight: '600', color: T.text, marginBottom: 1 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: T.sub, marginBottom: 8 },
  amountField: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, borderRadius: 21, backgroundColor: T.field, borderWidth: 1, borderColor: 'transparent', paddingHorizontal: 14 },
  amountInput: { flex: 1, fontSize: 15, color: T.text, paddingVertical: 0 },
  hintError: { fontSize: 13, color: T.danger, fontWeight: '600', marginTop: 6 },
  summary: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.line },
  sumRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sumLabel: { fontSize: 15, color: T.sub },
  sumValue: { fontSize: 15, fontWeight: '700', color: T.text },
  payBtn: { height: 44, borderRadius: 22, backgroundColor: T.brand, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  payBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});