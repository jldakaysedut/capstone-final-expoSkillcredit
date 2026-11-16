// Native-only UI for the EXISTING claim_daily_reward() Supabase RPC.
// Do not award credits from the client; the database is authoritative.
import { useCallback, useEffect, useState } from 'react';
import { AppState, DeviceEventEmitter, Modal, Pressable, Text, View, ActivityIndicator, StyleSheet } from 'react-native';
import { Coins, Flame, Gift } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import supabase from '../supabaseClient';

const REWARDS = [1, 1, 1, 1, 2, 2, 5];
const manilaDayFor = (date) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date(date));
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};
const daysApart = (a, b) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000;

export default function DailyRewardModal({ userId, blocked = false, onClaimed }) {
  const [eligible, setEligible] = useState(false);
  const [nextDay, setNextDay] = useState(1);
  const [claiming, setClaiming] = useState(false);
  const [checking, setChecking] = useState(true);
  const [errorText, setErrorText] = useState('');
  const [success, setSuccess] = useState(null);

  const check = useCallback(async () => {
    if (!userId) { setEligible(false); setChecking(false); return; }
    setChecking(true);
    try {
      const today = manilaDayFor(Date.now());
      const [claimResult, accountResult] = await Promise.all([
        supabase.from('daily_reward_claims').select('claim_date, streak_day')
          .eq('user_id', userId).order('claim_date', { ascending: false }).limit(1),
        supabase.from('user_profiles').select('created_at').eq('id', userId).single(),
      ]);
      if (claimResult.error) throw claimResult.error;
      if (accountResult.error || !accountResult.data?.created_at) {
        throw accountResult.error || new Error('Registration date is missing.');
      }
      const latest = claimResult.data?.[0];
      setEligible(manilaDayFor(accountResult.data.created_at) < today && latest?.claim_date !== today);
      setNextDay(latest?.claim_date && daysApart(latest.claim_date, today) === 1
        ? (Number(latest.streak_day) % 7) + 1 : 1);
      setErrorText('');
    } catch (err) {
      console.error('Daily reward eligibility check failed:', err);
      setEligible(false); // Do not display a broken claim popup on RLS/network failures.
    } finally { setChecking(false); }
  }, [userId]);

  useFocusEffect(useCallback(() => { void check(); }, [check]));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => sub.remove();
  }, [check]);

  const claim = async () => {
    if (claiming || !userId) return;
    setClaiming(true);
    setErrorText('');
    try {
      const { data, error } = await supabase.rpc('claim_daily_reward');
      if (error) {
        if (/already claimed/i.test(error.message || '')) {
          setEligible(false);
          return;
        }
        throw error;
      }
      // The credit award is complete; notification delivery is best-effort ONLY.
      try {
        const { error: noticeError } = await supabase.from('notifications').insert({
          user_id: userId,
          type: 'daily_reward',
          content: `Daily Login Bonus claimed! Day ${data.day} of 7: +${data.reward} CR added to your SkillCredit wallet.`,
          link_url: '/notifications',
        });
        if (noticeError) console.error('Reward notice failed; credits were already awarded:', noticeError);
      } catch (err) { console.error('Reward notice failed; credits were already awarded:', err); }
      setEligible(false);
      setSuccess(data);
      DeviceEventEmitter.emit('credit_updated');
      await onClaimed?.();
    } catch (err) {
      console.error('Daily claim failed:', err);
      setErrorText(err?.message || 'Could not claim. Please try again.');
    } finally { setClaiming(false); }
  };

  if (!userId || blocked || checking || (!eligible && !success)) return null;
  const day = Math.min(7, Math.max(1, Number(success?.day || nextDay) || 1));
  const reward = Number(success?.reward || REWARDS[day - 1]);
  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => { if (success) setSuccess(null); }}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.icon}><Gift size={30} color="#b45309" /></View>
          <Text style={styles.label}>SKILLCREDIT DAILY REWARDS</Text>
          <Text style={styles.heading}>{success ? 'Credits added!' : 'Daily Login Bonus!'}</Text>
          <Text style={styles.sub}>{success ? 'Come back tomorrow to continue your streak.' : 'Claim today’s reward and keep your streak alive.'}</Text>
          <View style={styles.days}>
            {REWARDS.map((cr, i) => (
              <View key={i} style={[styles.day, i + 1 === day && styles.dayActive]}>
                <Text style={[styles.dayText, i + 1 === day && styles.dayTextActive]}>D{i + 1}</Text>
                <Text style={[styles.dayValue, i + 1 === day && styles.dayTextActive]}>+{cr}</Text>
              </View>
            ))}
          </View>
          <View style={styles.amount}><Coins size={22} color="#d97706"/><Text style={styles.reward}>+{reward} CR</Text><Text style={styles.dayNum}>Day {day} of 7</Text></View>
          {!!errorText && <Text style={styles.error}>{errorText}</Text>}
          {success ? (
            <Pressable style={styles.button} onPress={() => setSuccess(null)}><Text style={styles.buttonText}>Awesome!</Text></Pressable>
          ) : (
            <Pressable disabled={claiming} style={[styles.button, claiming && { opacity: 0.6 }]} onPress={claim}>
              {claiming ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Claim Reward</Text>}
            </Pressable>
          )}
          <Text style={styles.hint}>13 CR per completed 7-day streak</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  card: { width: '100%', maxWidth: 360, backgroundColor: '#fff', borderRadius: 20, padding: 18, alignItems: 'center' },
  icon: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fffbeb', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  label: { color: '#b45309', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  heading: { color: '#111827', fontSize: 22, fontWeight: '800', marginTop: 4 },
  sub: { fontSize: 12, color: '#6b7280', textAlign: 'center', marginTop: 6, lineHeight: 18 },
  days: { flexDirection: 'row', gap: 4, marginTop: 16, alignSelf: 'stretch' },
  day: { flex: 1, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 9, paddingVertical: 7, alignItems: 'center' },
  dayActive: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  dayText: { fontSize: 10, color: '#92400e', fontWeight: '700' },
  dayValue: { fontSize: 12, color: '#92400e', fontWeight: '800' },
  dayTextActive: { color: '#fff' },
  amount: { flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', marginTop: 16, backgroundColor: '#fffbeb', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 12, alignSelf: 'stretch' },
  reward: { color: '#b45309', fontWeight: '900', fontSize: 23 },
  dayNum: { color: '#92400e', fontWeight: '700', fontSize: 11 },
  error: { color: '#be123c', fontSize: 12, marginTop: 10, textAlign: 'center' },
  button: { backgroundColor: '#f59e0b', borderRadius: 12, marginTop: 14, minHeight: 44, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  hint: { fontSize: 11, color: '#9ca3af', marginTop: 11 },
});
