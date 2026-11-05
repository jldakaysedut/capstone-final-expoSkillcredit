// ═══════════════════════════════════════════════════════════════
//  MOBILE APP (Expo React Native) — src/pages/auth/SetupInterests.jsx
//  Mobile version (same data + logic as the web SetupInterests),
//  styled like Dashboard / Community (compact X-style typography).
//  Replace the WHOLE content of your current SetupInterests.jsx with this.
//  Needs:  npx expo install @react-native-async-storage/async-storage
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, Alert, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ChefHat, Leaf, Hammer, Dumbbell, Scissors, Gamepad2, Wrench,
  BookOpen, PenLine, MessageCircle, Music2, Palette, Film, Briefcase,
  PiggyBank, Monitor, Code2, Sparkles, Check,
} from 'lucide-react-native';
import supabase from '../../supabaseClient';

// Route names used by this screen (the web used '/login' and '/dashboard'). Change them here if yours differ.
const ROUTES = { login: 'Login', home: 'User' };

const CATEGORIES = [
  { name: 'Coding & Tech',         icon: Code2,         color: '#65a30d' },
  { name: 'UI/UX Design',          icon: Monitor,       color: '#0ea5e9' },
  { name: 'Business & Freelance',  icon: Briefcase,     color: '#475569' },
  { name: 'Financial Literacy',    icon: PiggyBank,     color: '#059669' },
  { name: 'Writing & Content',     icon: PenLine,       color: '#14b8a6' },
  { name: 'Art & Graphic Design',  icon: Palette,       color: '#f43f5e' },
  { name: 'Video & Animation',     icon: Film,          color: '#f59e0b' },
  { name: 'Languages & Speaking',  icon: MessageCircle, color: '#06b6d4' },
  { name: 'School & Tutoring',     icon: BookOpen,      color: '#6366f1' },
  { name: 'Health & Fitness',      icon: Dumbbell,      color: '#ef4444' },
  { name: 'Cooking & Baking',      icon: ChefHat,       color: '#f97316' },
  { name: 'Singing & Instruments', icon: Music2,        color: '#d946ef' },
  { name: 'Gaming & Hobbies',      icon: Gamepad2,      color: '#8b5cf6' },
  { name: 'Beauty & Grooming',     icon: Scissors,      color: '#ec4899' },
  { name: 'Home & DIY',            icon: Hammer,        color: '#ca8a04' },
  { name: 'Gardening & Farming',   icon: Leaf,          color: '#22c55e' },
  { name: 'Electronics & Repair',  icon: Wrench,        color: '#3b82f6' },
];

export default function SetupInterests() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [user, setUser] = useState(null);
  const [progress, setProgress] = useState(0);

  const goHome = () => navigation.reset({ index: 0, routes: [{ name: ROUTES.home }] });

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) navigation.reset({ index: 0, routes: [{ name: ROUTES.login }] });
      else setUser(user);
    };
    checkAuth();
  }, [navigation]);

  useEffect(() => {
    if (isSaving) {
      const startTime = Date.now();
      const duration = 4000;
      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const newProgress = Math.min((elapsed / duration) * 100, 100);
        setProgress(newProgress);
        if (newProgress >= 100) clearInterval(interval);
      }, 50);
      return () => clearInterval(interval);
    }
  }, [isSaving]);

  const toggleCategory = (name) => {
    setSelected((prev) => (prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]));
  };

  const handleSave = async () => {
    if (selected.length === 0 || !user) return;
    setIsSaving(true);

    try {
      // 1. Get the current data first
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('credits_balance, has_set_interests')
        .eq('id', user.id)
        .single();

      // Already set before (maybe just a refresh): go straight to the dashboard
      if (profile?.has_set_interests) {
        goHome();
        return;
      }

      const currentBalance = profile?.credits_balance || 0;

      // Avoid ending up with 40: if it is 0 make it 20, if the DB default already gave 20 keep it
      const finalBalance = currentBalance === 0 ? 20 : currentBalance;

      // 2. One update for interests, flag and balance
      const { error } = await supabase
        .from('user_profiles')
        .update({
          interests: selected,
          has_set_interests: true,
          credits_balance: finalBalance,
        })
        .eq('id', user.id);

      if (error) throw error;

      // 3. Check if the notification already exists (avoid doubles).
      //    NOTE: the web called .ilike('%20 CR starting bonus%') with no column, which is invalid; fixed here.
      const { data: existingNotif } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', user.id)
        .eq('type', 'system')
        .ilike('content', '%20 CR starting bonus%')
        .limit(1);

      if (!existingNotif || existingNotif.length === 0) {
        await supabase
          .from('notifications')
          .insert([{
            user_id: user.id,
            type: 'system',
            content: '🎉 Welcome to SkillCredit! You received a 20 CR starting bonus. Use it to book your first session!',
            link_url: '/dashboard',
            is_read: false,
          }]);
      }

      // 4. Trigger for the welcome bonus popup (read by UserDashboard)
      await AsyncStorage.setItem('showWelcomeBonus', 'true');

      await new Promise((resolve) => setTimeout(resolve, 4000));

      goHome();
    } catch (error) {
      console.error(error);
      Alert.alert('Failed to save interests. Please try again.');
      setIsSaving(false);
    }
  };

  // ── saving screen
  if (isSaving) {
    return (
      <View style={s.savingWrap}>
        <View style={s.savingIcon}><Sparkles size={34} color="#047857" /></View>
        <Text style={s.savingTag}>SkillCredit setup</Text>
        <Text style={s.savingTitle}>Preparing your dashboard…</Text>
        <Text style={s.savingSub}>Curating skills and building recommendations based on your selected interests.</Text>

        <View style={s.progressBlock}>
          <View style={s.progressLabels}>
            <Text style={s.progressLabel}>Loading resources</Text>
            <Text style={s.progressPct}>{Math.round(progress)}%</Text>
          </View>
          <View style={s.track}><View style={[s.fill, { width: `${progress}%` }]} /></View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <View style={[s.header, { paddingTop: insets.top + 24 }]}>
          <View style={s.headIcon}><Sparkles size={22} color="#047857" /></View>
          <Text style={s.title}>What are you interested in?</Text>
          <Text style={s.sub}>
            Pick a few topics you'd like to learn or teach. We'll use this to personalize your SkillCredit dashboard.
          </Text>
        </View>

        <View style={s.chips}>
          {CATEGORIES.map((cat) => {
            const on = selected.includes(cat.name);
            const Icon = cat.icon;
            return (
              <Pressable key={cat.name} onPress={() => toggleCategory(cat.name)} style={[s.chip, on && s.chipOn]}>
                <Icon size={16} color={on ? '#fff' : cat.color} />
                <Text style={[s.chipText, on && { color: '#fff' }]}>{cat.name}</Text>
                {on && <Check size={15} color="#fff" />}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* bottom bar */}
      <View style={[s.bar, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={s.barText}>
          {selected.length === 0 ? 'Select at least 1 topic' : `${selected.length} ${selected.length === 1 ? 'topic' : 'topics'} selected`}
        </Text>
        <Pressable
          onPress={handleSave}
          disabled={selected.length === 0 || isSaving}
          style={[s.btn, selected.length === 0 && { opacity: 0.4 }]}
        >
          <Text style={s.btnText}>Continue</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  // header
  header: { paddingHorizontal: 20, paddingBottom: 18 },
  headIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#ecfdf5', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontSize: 22, fontWeight: '700', color: '#0f1419', letterSpacing: -0.3 },
  sub: { fontSize: 15, color: '#536471', lineHeight: 21, marginTop: 6 },

  // chips
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 20 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#eff3f4' },
  chipOn: { backgroundColor: '#0f1419' },
  chipText: { fontSize: 14, fontWeight: '600', color: '#0f1419' },

  // bottom bar
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eff3f4', backgroundColor: '#fff' },
  barText: { flex: 1, fontSize: 13, color: '#536471' },
  btn: { height: 44, paddingHorizontal: 28, borderRadius: 22, backgroundColor: '#047857', alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // saving screen
  savingWrap: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 28 },
  savingIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#ecfdf5', alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  savingTag: { fontSize: 13, fontWeight: '600', color: '#047857' },
  savingTitle: { fontSize: 20, fontWeight: '700', color: '#0f1419', letterSpacing: -0.2, marginTop: 4 },
  savingSub: { fontSize: 14, color: '#536471', lineHeight: 20, textAlign: 'center', marginTop: 8, maxWidth: 280 },
  progressBlock: { alignSelf: 'stretch', maxWidth: 280, marginTop: 36 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: 13, color: '#536471' },
  progressPct: { fontSize: 13, fontWeight: '700', color: '#047857' },
  track: { height: 4, borderRadius: 2, backgroundColor: '#eff3f4', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2, backgroundColor: '#047857' },
});