import { Reveal, PressScale } from '../../components/premium/PremiumVisual';
import { Alert } from '../../components/SkillCreditAlert';
// ═══════════════════════════════════════════════════════════════
//  MOBILE APP (Expo React Native) — src/pages/user/Payments.jsx
//  Mobile version (same data + logic as the web Payments page), compact X-style typography
//  to match UserDashboard. Needs: npx expo install expo-web-browser
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react';
import {
  Modal, RefreshControl, AppState, Platform, DeviceEventEmitter, StyleSheet
} from 'react-native';
import { ActivityIndicator, View, Text, Pressable, SectionList, ScrollView, TextInput, KeyboardAvoidingView } from '../../components/premium/PremiumThemePrimitives';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowDownRight, ArrowUpRight, Check, CheckCircle2, Clock, CreditCard, History, RefreshCcw, X, XCircle } from '../../components/premium/PremiumThemeIcons';
import supabase from '../../supabaseClient';

const T = {
  text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de',
  brand: '#047857', soft: '#ecfdf5', field: '#eff3f4', danger: '#e11d48',
};

const CHECKOUT_ATTEMPT_KEY = 'skillcredit_pending_paymongo_checkout_native';

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

// Match the Web ledger semantics: a top-up only becomes positive after 'paid'.
const FINAL_TOPUP_STATUSES = ['paid', 'failed', 'expired', 'cancelled'];
const unpaidTopupLabel = (status) => {
  if (status === 'cancelled') return 'Cancelled — not credited';
  if (status === 'failed') return 'Failed — not credited';
  if (status === 'expired') return 'Expired — not credited';
  if (status === 'pending') return 'Pending — not credited';
  return `${status || 'Unconfirmed'} — not credited`;
};
const checkoutNotice = (status) => {
  if (status === 'paid') return { tone: 'success', text: 'Payment verified. Your credits were added.' };
  if (status === 'failed') return { tone: 'warn', text: 'Payment failed. No credits were added.' };
  if (status === 'expired') return { tone: 'warn', text: 'Payment expired. No credits were added.' };
  if (status === 'cancelled') return { tone: 'warn', text: 'Checkout cancelled. No credits were added.' };
  return { tone: 'warn', text: 'Payment is still pending confirmation. No credits are counted until verified. Refresh later.' };
};

// icon + colours per transaction (same rules as the web)
function txLook(tx) {
  if (tx.type === 'TOPUP' && tx.status !== 'paid') {
    return ['failed', 'cancelled', 'expired'].includes(tx.status)
      ? { Icon: XCircle, bg: '#fff1f2', fg: '#e11d48' }
      : { Icon: Clock, bg: '#fffbeb', fg: '#d97706' };
  }
  if (tx.status === 'pending') return { Icon: Clock, bg: '#fffbeb', fg: '#d97706' };
  if (tx.status === 'failed') return { Icon: XCircle, bg: '#fff1f2', fg: '#e11d48' };
  if (tx.type === 'EARNED' || tx.type === 'TOPUP' || tx.type === 'DAILY_REWARD') return { Icon: ArrowDownRight, bg: '#ecfdf5', fg: '#059669' };
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
  const pollGenerationRef = useRef(0);
  const awaitingRef = useRef(false); // true while the user is out in the PayMongo checkout
  const checkoutTxRef = useRef(null); // the exact checkout transaction, never inferred from wallet balance

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
      const { data: dailyRewards, error: rewardError } = await supabase.from('daily_reward_claims')
        .select('claim_date, streak_day, credits_earned')
        .eq('user_id', uid).order('claim_date', { ascending: false });
      if (rewardError) console.warn('Daily reward history unavailable:', rewardError);

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
          isPositive: t.status === 'paid',
          date: t.created_at,
          status: t.status,
          meta: `₱${t.amount_php}`,
        });
      });

      // Read-only entries: credits were already granted by claim_daily_reward().
      (dailyRewards || []).forEach((claim) => {
        combined.push({
          id: `daily-reward-${claim.claim_date}`, type: 'DAILY_REWARD',
          title: 'Daily Login Streak Bonus', amount: claim.credits_earned,
          isPositive: true, date: `${claim.claim_date}T12:00:00+08:00`,
          status: 'paid', meta: `Day ${claim.streak_day} of 7`,
        });
        totalEarned += Number(claim.credits_earned || 0);
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

  const stopPoll = () => {
    pollGenerationRef.current += 1;
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
  };

  // The HTTPS PayMongo return page is a WEB route, not a native deep link.
  // Back/Close is therefore NOT proof of cancellation. Ask our authenticated
  // backend for a provider-verified status when available, and always check
  // the exact user's transaction for a confirmed credit before showing success.
  const checkProviderStatus = async (txId) => {
    try {
      const { data, error } = await supabase.functions.invoke('create-paymongo-checkout', {
        body: { action: 'check_checkout_status', transaction_id: txId },
        headers: { 'x-skillcredit-client': 'mobile' },
      });
      if (error || data?.error) return null; // older backend may not offer this action
      return ['pending', ...FINAL_TOPUP_STATUSES].includes(data?.status) ? data.status : null;
    } catch {
      return null; // read-only DB status remains the conservative fallback
    }
  };

  // Never infer a successful checkout from another top-up or a balance change.
  // The signed webhook/server are the only sources that grant wallet credits.
  const confirmPayment = (txId) => {
    awaitingRef.current = false;
    stopPoll();
    if (!txId) {
      setNotice(checkoutNotice('pending'));
      void load();
      return;
    }
    const generation = pollGenerationRef.current;
    setNotice({ tone: 'info', text: 'Checking this checkout with PayMongo…' });
    let tries = 0;

    const check = async () => {
      if (generation !== pollGenerationRef.current) return;
      tries += 1;
      let status = 'pending';
      try {
        const uid = userIdRef.current;
        const readStatus = async () => {
          if (!uid) return null;
          const { data, error } = await supabase.from('topup_transactions')
            .select('status').eq('id', txId).eq('user_id', uid).maybeSingle();
          return error ? null : data?.status;
        };
        status = (await readStatus()) || 'pending';
        if (status === 'pending' && (tries === 1 || tries === 7)) {
          const verified = await checkProviderStatus(txId);
          if (verified && verified !== 'pending') {
            // Failed/cancelled/expired may be reported by the verified server.
            // For Paid, demand the actual credited DB transaction to avoid
            // showing a premature success while the webhook is still arriving.
            status = verified === 'paid' ? (await readStatus()) || 'pending' : verified;
          }
        }
        if (FINAL_TOPUP_STATUSES.includes(status) || tries === 12) await load();
      } catch (error) {
        console.warn('Could not verify checkout status yet:', error);
      }
      if (generation !== pollGenerationRef.current) return;
      if (FINAL_TOPUP_STATUSES.includes(status)) {
        checkoutTxRef.current = null;
        void AsyncStorage.removeItem(CHECKOUT_ATTEMPT_KEY).catch(() => {});
        setNotice(checkoutNotice(status));
      } else if (tries >= 12) {
        setNotice(checkoutNotice('pending'));
      } else {
        pollRef.current = setTimeout(check, 1500);
      }
    };
    void check();
  };

  // ── init + live updates
  useEffect(() => {
    let disposed = false;
    let channel = null;
    let ledgerTimer;
    const scheduleLedger = () => {
      if (disposed) return;
      clearTimeout(ledgerTimer);
      ledgerTimer = setTimeout(() => { if (!disposed) void load(); }, 450);
    };

    (async () => {
      await load();
      if (disposed) return;
      setLoading(false);
      const uid = userIdRef.current;
      if (!uid) return;
      try {
        const saved = await AsyncStorage.getItem(CHECKOUT_ATTEMPT_KEY);
        if (saved && !disposed) {
          const attempt = JSON.parse(saved);
          if (attempt?.userId === uid && attempt?.transactionId && Date.now() - attempt.timestamp < 2 * 60 * 60 * 1000) {
            checkoutTxRef.current = attempt.transactionId;
            confirmPayment(attempt.transactionId);
          } else {
            await AsyncStorage.removeItem(CHECKOUT_ATTEMPT_KEY);
          }
        }
      } catch (error) {
        console.warn('Could not restore checkout attempt:', error);
      }
      if (disposed) return;
      channel = supabase.channel(`payments_live_${uid}_${Date.now()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'topup_transactions', filter: `user_id=eq.${uid}` }, scheduleLedger)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_profiles', filter: `id=eq.${uid}` }, scheduleLedger)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_reward_claims', filter: `user_id=eq.${uid}` }, scheduleLedger)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `student_id=eq.${uid}` }, scheduleLedger)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `instructor_id=eq.${uid}` }, scheduleLedger)
        .subscribe();
    })();

    const creditSub = DeviceEventEmitter.addListener('credit_updated', () => load());
    const appSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (awaitingRef.current) confirmPayment(checkoutTxRef.current); // back from the checkout page
      else load();
    });

    return () => {
      disposed = true;
      clearTimeout(ledgerTimer);
      stopPoll();
      creditSub.remove();
      appSub.remove();
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  // Optional navigation return: a status parameter alone is never proof of payment.
  const pStatus = route.params?.status;
  const pTx = route.params?.tx;
  useEffect(() => {
    if (!pStatus || !pTx) return;
    navigation.setParams({ status: undefined, tx: undefined });
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
        headers: { 'x-skillcredit-client': 'mobile' },
      });
      if (error) throw error;
      if (!data?.checkout_url) throw new Error(data?.error || 'Invalid response from payment gateway.');

      stopPoll();
      checkoutTxRef.current = data.transaction_id || null;
      awaitingRef.current = true;
      if (checkoutTxRef.current) {
        try {
          await AsyncStorage.setItem(CHECKOUT_ATTEMPT_KEY, JSON.stringify({
            transactionId: checkoutTxRef.current,
            userId: userIdRef.current,
            timestamp: Date.now(),
          }));
        } catch (storageError) {
          console.warn('Could not save pending checkout attempt:', storageError);
        }
      }
      setNotice(null);
      setIsProcessing(false);
      setShowTopup(false);
      await new Promise((r) => setTimeout(r, 400)); // let the sheet finish closing before the browser opens
      // PayMongo returns to the HTTPS Web page. Closing/returning to Expo
      // only starts verification; it must not mark the checkout cancelled.
      try {
        await WebBrowser.openBrowserAsync(data.checkout_url);
      } catch (browserError) {
        console.warn('Could not open checkout browser:', browserError);
        setNotice({ tone: 'warn', text: 'Checkout could not open. Your pending transaction has not been credited.' });
      }
      if (awaitingRef.current) confirmPayment(checkoutTxRef.current);
    } catch (error) {
      awaitingRef.current = false;
      console.error('Checkout Error:', error);
      Alert.alert('Something went wrong', 'We could not prepare your checkout. Please try again.');
      setIsProcessing(false);
    }
  };

  const openTopup = () => { setSelectedPackage(TOPUP_PACKAGES[1]); setCustomAmount(''); setShowTopup(true); };
  const closeTopup = () => { if (!isProcessing) setShowTopup(false); };

  if (loading) {
    // Display placeholders only; payment calculations, fetching and checkout logic are unchanged.
    const Bone = ({ width = '100%', height = 14, radius = 7 }) => (
      <View style={{ width, height, borderRadius: radius, backgroundColor: '#e9eff0' }} />
    );
    return (
      <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: insets.top }} accessibilityLabel="Loading payments">
        <ScrollView scrollEnabled={false} contentContainerStyle={{ paddingBottom: 48 }}>
          <View style={{ padding: 18, gap: 14, borderBottomWidth: 1, borderBottomColor: T.line }}>
            <Bone width="38%" height={13} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, gap: 10 }}>
                <Bone width="60%" height={36} radius={10} />
                <Bone width="38%" height={12} />
              </View>
              <Bone width={115} height={42} radius={22} />
            </View>
            <View style={{ flexDirection: 'row', gap: 18, marginTop: 12 }}>
              <View style={{ flex: 1, gap: 9 }}><Bone width="46%" height={12} /><Bone width="70%" height={20} /></View>
              <View style={{ flex: 1, gap: 9 }}><Bone width="46%" height={12} /><Bone width="70%" height={20} /></View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 15 }}>
            {[0, 1, 2, 3].map((i) => <Bone key={i} width={73} height={32} radius={16} />)}
          </View>
          <View style={{ paddingHorizontal: 16, paddingBottom: 10, gap: 8 }}>
            <Bone width="30%" height={21} />
            <Bone width="42%" height={12} />
          </View>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: T.line }}>
              <Bone width={44} height={44} radius={12} />
              <View style={{ flex: 1, gap: 9 }}><Bone width="68%" height={14} /><Bone width="87%" height={12} /></View>
              <Bone width={55} height={18} />
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  // ── derived lists
  const counts = {
    All: ledger.length,
    'Top-ups': ledger.filter((t) => t.type === 'TOPUP').length,
    Earned: ledger.filter((t) => t.type === 'EARNED' || t.type === 'DAILY_REWARD').length,
    Spent: ledger.filter((t) => t.type === 'SPENT').length,
    Refunds: ledger.filter((t) => t.type === 'REFUND').length,
  };
  const filtered = filter === 'All' ? ledger : ledger.filter((t) => t.type === FILTER_TYPE[filter] || (filter === 'Earned' && t.type === 'DAILY_REWARD'));
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
      <Reveal delay={90}><View style={s.topBlock}>
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
          <PressScale onPress={openTopup} style={s.addBtn}>
            <CreditCard size={17} color="#fff" />
            <Text style={s.addBtnText}>Add credits</Text>
          </PressScale>
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
      </View></Reveal>

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
                <Text style={[s.amount, { color: tx.type === 'TOPUP' && tx.status !== 'paid' ? T.sub : tx.isPositive ? '#059669' : T.text }]}>
                  {tx.type === 'TOPUP' && tx.status !== 'paid' ? '' : tx.isPositive ? '+' : '−'}{tx.amount} CR
                </Text>
                {tx.type === 'TOPUP' ? (
                  <Text style={[s.status, { color: tx.status === 'paid' ? '#047857' : ['cancelled', 'failed', 'expired'].includes(tx.status) ? '#be123c' : '#b45309' }]}>
                    {tx.status === 'paid' ? 'Success — credited' : unpaidTopupLabel(tx.status)}
                  </Text>
                ) : (
                  <>
                    {tx.status === 'pending' && <Text style={[s.status, { color: '#b45309' }]}>Pending</Text>}
                    {tx.status === 'failed' && <Text style={[s.status, { color: '#be123c' }]}>Failed</Text>}
                  </>
                )}
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

              <PressScale
                onPress={handleCheckout}
                disabled={isProcessing || !amountValid}
                style={[s.payBtn, (isProcessing || !amountValid) && { opacity: 0.5 }]}
              >
                {isProcessing
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.payBtnText}>Pay ₱{amountPHP.toLocaleString()}</Text>}
              </PressScale>
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
  topBlock: { paddingHorizontal: 16, backgroundColor: '#F3FAF6', paddingTop: 20, paddingBottom: 21, borderBottomWidth: 1, borderBottomColor: '#DCEDE3'},
  label: { fontSize: 13, color: T.sub },
  balance: { fontSize: 38, fontWeight: '800', color: '#074D39', letterSpacing: -1.2},
  balanceUnit: { fontSize: 17, color: '#357F69', fontWeight: '700'},
  detail: { fontSize: 13, color: T.sub },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 18, backgroundColor: T.brand , borderRadius: 16, height: 46, shadowColor: '#047857', shadowOpacity: 0.16, shadowRadius: 9, shadowOffset:{width:0,height:4}, elevation: 2},
  addBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.line },
  statDivider: { width: 1, height: 30, backgroundColor: T.line },
  statValue: { fontSize: 15, marginTop: 1 , fontWeight: '800', color: '#07583E'},
  notice: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 , borderRadius: 16},
  noticeText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },

  // chips
  chipRow: { gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  chip: { justifyContent: 'center', paddingHorizontal: 14, height: 34, backgroundColor: '#ECF6F0', borderRadius: 15},
  chipOn: { backgroundColor: T.text },
  chipText: { fontSize: 13, fontWeight: '600', color: T.text },

  // list
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.line },
  title: { fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2 },
  groupLabel: { fontSize: 13, fontWeight: '600', color: T.sub, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, backgroundColor: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderBottomWidth: 1, backgroundColor: '#fff' , borderBottomColor: '#E7F0E9', paddingVertical: 15},
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
  sheet: { backgroundColor: '#fff', paddingHorizontal: 20, paddingTop: 8, maxHeight: '90%' , borderTopLeftRadius: 28, borderTopRightRadius: 28},
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: T.border, marginBottom: 6 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: T.text, marginTop: 6, marginBottom: 2 },
  pkgRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: T.line , minHeight: 64},
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