// ═══════════════════════════════════════════════════════════════
//  MOBILE APP (Expo React Native) — src/pages/user/UserDashboard.jsx
//  Mobile version (same data + logic as the web dashboard), compact X-style typography.
//  Replace the WHOLE content of your current UserDashboard.jsx with this.
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Image, Pressable, ScrollView, FlatList, Modal, RefreshControl,
  Alert, AppState, StyleSheet,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import {
  ChefHat, Leaf, Hammer, Dumbbell, Scissors, Gamepad2, Wrench, BookOpen, PenLine,
  MessageCircle, Music2, Palette, Film, Briefcase, PiggyBank, Monitor, Code2, Globe,
  Bookmark, BookmarkCheck, Star, TrendingUp, TrendingDown, Flame, Sparkles, Trophy, Clock,
  Search, X, CalendarDays, Check, ChevronLeft, ChevronRight, Pin, SlidersHorizontal, Lightbulb, Plus, PartyPopper,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import supabase from '../../supabaseClient';

const CATEGORIES = [
  { name: 'Cooking & Baking',      icon: ChefHat,       color: '#f97316' },
  { name: 'Gardening & Farming',   icon: Leaf,          color: '#22c55e' },
  { name: 'Home & DIY',            icon: Hammer,        color: '#ca8a04' },
  { name: 'Health & Fitness',      icon: Dumbbell,      color: '#ef4444' },
  { name: 'Beauty & Grooming',     icon: Scissors,      color: '#ec4899' },
  { name: 'Gaming & Hobbies',      icon: Gamepad2,      color: '#8b5cf6' },
  { name: 'Electronics & Repair',  icon: Wrench,        color: '#3b82f6' },
  { name: 'School & Tutoring',     icon: BookOpen,      color: '#6366f1' },
  { name: 'Writing & Content',     icon: PenLine,       color: '#14b8a6' },
  { name: 'Languages & Speaking',  icon: MessageCircle, color: '#06b6d4' },
  { name: 'Singing & Instruments', icon: Music2,        color: '#d946ef' },
  { name: 'Art & Graphic Design',  icon: Palette,       color: '#f43f5e' },
  { name: 'Video & Animation',     icon: Film,          color: '#f59e0b' },
  { name: 'Business & Freelance',  icon: Briefcase,     color: '#475569' },
  { name: 'Financial Literacy',    icon: PiggyBank,     color: '#059669' },
  { name: 'UI/UX Design',          icon: Monitor,       color: '#0ea5e9' },
  { name: 'Coding & Tech',         icon: Code2,         color: '#65a30d' },
];

const SORT_OPTIONS = [
  { value: 'default',  label: 'Default',   icon: SlidersHorizontal, color: '#64748b' },
  { value: 'newest',   label: 'Newest',    icon: CalendarDays,      color: '#0284c7' },
  { value: 'oldest',   label: 'Oldest',    icon: Clock,             color: '#6366f1' },
  { value: 'cheapest', label: 'Cheapest',  icon: TrendingDown,      color: '#059669' },
  { value: 'priciest', label: 'Priciest',  icon: TrendingUp,        color: '#f97316' },
  { value: 'top',      label: 'Top Rated', icon: Star,              color: '#f59e0b', internal: true },
  { value: 'trending', label: 'Trending',  icon: Flame,             color: '#f97316', internal: true },
];

const CatIcon = ({ name, size = 16, color }) => {
  const cat = CATEGORIES.find((c) => c.name === name);
  if (!cat) return <Pin size={size} color={color || '#9ca3af'} />;
  const Icon = cat.icon;
  return <Icon size={size} color={color || cat.color} />;
};

const instructorName = (skill) => {
  const p = Array.isArray(skill.user_profiles) ? skill.user_profiles[0] : skill.user_profiles;
  return p?.full_name || 'Instructor';
};

// one line: "Maria · ★ 4.8 (12)"  or  "Maria · New"
function ByLine({ skill }) {
  const isNew = skill.totalReviews === 0;
  return (
    <View style={s.byLine}>
      <Text style={s.byName} numberOfLines={1}>{instructorName(skill)}</Text>
      <Text style={s.byDot}>·</Text>
      {isNew ? (
        <Text style={s.byNew}>New</Text>
      ) : (
        <>
          <Star size={12} color="#f59e0b" fill="#fbbf24" />
          <Text style={s.byRating}>{skill.avgRating}</Text>
          <Text style={s.byCount}>({skill.totalReviews})</Text>
        </>
      )}
    </View>
  );
}

// ── compact card used in the horizontal lanes (no box: image + text, like a feed item)
function SkillCard({ skill, isSaved, onSave, onView }) {
  return (
    <Pressable onPress={() => onView(skill.id)} style={s.card}>
      <View style={s.cover}>
        {skill.cover_image_url ? (
          <Image source={{ uri: skill.cover_image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={s.coverEmpty}><CatIcon name={skill.category} size={40} color="rgba(255,255,255,0.25)" /></View>
        )}
        <Pressable onPress={() => onSave(skill.id)} style={s.saveBtn} hitSlop={8}>
          {isSaved ? <BookmarkCheck size={16} color="#059669" /> : <Bookmark size={16} color="#0f1419" />}
        </Pressable>
      </View>
      <Text style={s.cardTitle} numberOfLines={2}>{skill.title}</Text>
      <ByLine skill={skill} />
      <Text style={s.price}>{skill.credit_cost} CR/hr</Text>
    </Pressable>
  );
}

function SkeletonCard() {
  return (
    <View style={s.card}>
      <View style={[s.cover, { backgroundColor: '#eff3f4' }]} />
      <View style={[s.skel, { marginTop: 10 }]} />
      <View style={[s.skel, { width: '60%', marginTop: 7 }]} />
    </View>
  );
}

// ── full-width row used in filtered / search results
function SkillRow({ skill, isSaved, onSave, onView }) {
  return (
    <Pressable onPress={() => onView(skill.id)} style={({ pressed }) => [s.row, pressed && { backgroundColor: '#f7f9f9' }]}>
      <View style={s.thumb}>
        {skill.cover_image_url
          ? <Image source={{ uri: skill.cover_image_url }} style={{ width: '100%', height: '100%' }} />
          : <CatIcon name={skill.category} size={24} color="rgba(255,255,255,0.45)" />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle} numberOfLines={2}>{skill.title}</Text>
        <ByLine skill={skill} />
        <Text style={[s.price, { marginTop: 3 }]}>{skill.credit_cost} CR/hr</Text>
      </View>
      <Pressable onPress={() => onSave(skill.id)} style={s.rowSave} hitSlop={6}>
        {isSaved ? <BookmarkCheck size={20} color="#059669" /> : <Bookmark size={20} color="#536471" />}
      </Pressable>
    </Pressable>
  );
}

// ── horizontal lane (max 10 cards, "See all" opens the full list)
function Lane({ icon: Icon, iconColor, title, skills, loading, savedSkills, onSave, onView, onSeeAll, last }) {
  if (!loading && skills.length === 0) return null;
  return (
    <View style={[s.lane, last && { borderBottomWidth: 0, marginBottom: 0 }]}>
      <View style={s.laneHead}>
        <Icon size={18} color={iconColor} />
        <Text style={s.laneTitle} numberOfLines={1}>{title}</Text>
        {!!onSeeAll && !loading && (
          <Pressable onPress={onSeeAll} style={s.seeAllBtn} hitSlop={8}>
            <Text style={s.seeAll}>See all</Text>
            <ChevronRight size={15} color="#047857" />
          </Pressable>
        )}
      </View>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={loading ? [0, 1, 2, 3] : skills.slice(0, 10)}
        keyExtractor={(item, i) => (loading ? `sk${i}` : item.id)}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
        renderItem={({ item }) => loading
          ? <SkeletonCard />
          : <SkillCard skill={item} isSaved={savedSkills.includes(item.id)} onSave={onSave} onView={onView} />}
      />
    </View>
  );
}

function Chip({ label, Icon, iconColor, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && s.chipOn]}>
      {Icon && <Icon size={15} color={active ? '#fff' : iconColor || '#536471'} />}
      <Text style={[s.chipText, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

// ────────────────── MAIN SCREEN
export default function UserDashboard() {
  const navigation = useNavigation();

  const [skills, setSkills] = useState([]);
  const [savedSkills, setSavedSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [showSaved, setShowSaved] = useState(false);
  const [sortBy, setSortBy] = useState('default');
  const [sortOpen, setSortOpen] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const debounceRef = useRef(null);

  // ── backend logic: same queries as before
  const fetchSkills = async () => {
    const { data, error } = await supabase
      .from('skills')
      .select(`id, title, category, format, duration, credit_cost, cover_image_url, description, created_at,
        user_profiles!instructor_id ( id, full_name, avatar_url ),
        reviews ( rating ),
        sessions ( id, student_completed, instructor_completed )`)
      .eq('is_active', true)
      .or('status.eq.approved,status.is.null')
      .order('created_at', { ascending: false });

    if (error || !data) { console.error('Fetch Error:', error); return; }

    setSkills(data.map((sk) => {
      const rv = sk.reviews || [];
      const ss = sk.sessions || [];
      const avgRating = rv.length
        ? parseFloat((rv.reduce((a, r) => a + (Number(r.rating) || 0), 0) / rv.length).toFixed(1))
        : 0;
      const completedSessions = ss.filter((x) => x.student_completed && x.instructor_completed).length;
      return { ...sk, avgRating, totalReviews: rv.length, totalSessions: completedSessions };
    }));
  };

  const fetchSaved = async (uid) => {
    const { data } = await supabase.from('saved_skills').select('skill_id').eq('user_id', uid);
    if (data) setSavedSkills(data.map((r) => r.skill_id));
  };

  const fetchProfile = async (uid) => {
    const { data } = await supabase.from('user_profiles').select('full_name, avatar_url, interests').eq('id', uid).single();
    if (data) setProfile(data);
  };

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUser(user);
      await Promise.all([fetchSkills(), fetchSaved(user.id), fetchProfile(user.id)]);
    } else {
      await fetchSkills();
    }
  }, []);

  // loads on open and again every time you come back to this tab (e.g. after saving in SkillDetails)
  useFocusEffect(useCallback(() => {
    (async () => { await load(); setLoading(false); })();
  }, [load]));

  // ── LIVE: new / changed skills, reviews and sessions refresh the dashboard (debounced)
  useEffect(() => {
    const refresh = () => { clearTimeout(debounceRef.current); debounceRef.current = setTimeout(load, 800); };
    const channel = supabase.channel(`dashboard_live_${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'skills' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions' }, refresh)
      .subscribe();
    const appSub = AppState.addEventListener('change', (state) => { if (state === 'active') load(); });
    return () => {
      clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
      appSub.remove();
    };
  }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const toggleSave = async (skillId) => {
    if (!currentUser) { Alert.alert('Please log in to save skills.'); return; }
    const already = savedSkills.includes(skillId);
    setSavedSkills((p) => (already ? p.filter((id) => id !== skillId) : [...p, skillId]));
    if (already) {
      await supabase.from('saved_skills').delete().match({ user_id: currentUser.id, skill_id: skillId });
    } else {
      await supabase.from('saved_skills').insert({ user_id: currentUser.id, skill_id: skillId });
    }
  };

  // Welcome bonus: shown once when the sign-up flow has set the 'showWelcomeBonus' flag
  useEffect(() => {
    AsyncStorage.getItem('showWelcomeBonus').then((v) => { if (v === 'true') setShowWelcomeModal(true); }).catch(() => {});
  }, []);
  const closeWelcomeModal = () => {
    setShowWelcomeModal(false);
    AsyncStorage.removeItem('showWelcomeBonus').catch(() => {}); // remove so it only shows once
  };

  const handleView = (id) => navigation.navigate('SkillDetails', { id });
  const handleReset = () => { setSearchQuery(''); setActiveCategory('All'); setShowSaved(false); setSortBy('default'); };
  const jumpTo = (cat) => { setActiveCategory(cat); setShowSaved(false); setSearchQuery(''); setSortBy('default'); };

  // ── derived data (same logic as before)
  const isFiltered = activeCategory !== 'All' || showSaved || !!searchQuery.trim() || sortBy !== 'default';
  const savedList = skills.filter((sk) => savedSkills.includes(sk.id));
  const trending = [...skills].sort((a, b) => b.totalSessions - a.totalSessions);
  const topRated = [...skills].sort((a, b) => b.avgRating - a.avgRating);
  const newest = [...skills];
  const recommendedSkills = profile?.interests?.length > 0
    ? [...skills].filter((sk) => profile.interests.includes(sk.category)).sort((a, b) => b.avgRating - a.avgRating)
    : [];

  let filtered = showSaved ? [...savedList] : [...skills];
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter((sk) => sk.title?.toLowerCase().includes(q) || sk.category?.toLowerCase().includes(q));
  }
  if (activeCategory !== 'All') filtered = filtered.filter((sk) => sk.category === activeCategory);
  if (sortBy === 'newest') filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  else if (sortBy === 'oldest') filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  else if (sortBy === 'top') filtered.sort((a, b) => (b.avgRating || 0) - (a.avgRating || 0));
  else if (sortBy === 'trending') filtered.sort((a, b) => (b.totalSessions || 0) - (a.totalSessions || 0));
  else if (sortBy === 'cheapest') filtered.sort((a, b) => (Number(a.credit_cost) || 0) - (Number(b.credit_cost) || 0));
  else if (sortBy === 'priciest') filtered.sort((a, b) => (Number(b.credit_cost) || 0) - (Number(a.credit_cost) || 0));

  let gridTitle = 'Search results';
  if (showSaved) gridTitle = 'Saved skills';
  else if (activeCategory !== 'All') gridTitle = activeCategory;
  else if (!searchQuery.trim()) {
    gridTitle = { top: 'Top rated', trending: 'Top trending', newest: 'New arrivals', oldest: 'Oldest listings',
      cheapest: 'Cheapest skills', priciest: 'Priciest skills' }[sortBy] || 'All skills';
  }

  const sharedProps = { savedSkills, onSave: toggleSave, onView: handleView };
  // one lane per category, only when that category has skills
  const categoryLanes = CATEGORIES
    .map((cat) => ({ cat, list: skills.filter((x) => x.category === cat.name) }))
    .filter(({ list }) => list.length > 0);
  const activeSort = SORT_OPTIONS.find((o) => o.value === sortBy) || SORT_OPTIONS[0];
  const ActiveSortIcon = activeSort.icon;
  const visibleSortOptions = SORT_OPTIONS.filter((o) => !o.internal || o.value === sortBy);

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#047857" colors={['#047857']} />}
      >
        {/* search + sort + category chips (all categories stay here) */}
        <View style={s.topBlock}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={s.search}>
              <Search size={18} color="#536471" />
              <TextInput
                value={searchQuery}
                onChangeText={(t) => { setSearchQuery(t); if (t) setShowSaved(false); setSortBy('default'); }}
                placeholder="Search skills"
                placeholderTextColor="#536471"
                style={s.searchInput}
              />
              {!!searchQuery && (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={8}><X size={16} color="#536471" /></Pressable>
              )}
            </View>
            <Pressable onPress={() => setSortOpen(true)} style={[s.sortBtn, sortBy !== 'default' && { backgroundColor: '#ecfdf5' }]}>
              <ActiveSortIcon size={20} color={sortBy !== 'default' ? activeSort.color : '#0f1419'} />
            </Pressable>
            <Pressable onPress={() => navigation.navigate('CreateSkill')} style={s.createBtn} accessibilityLabel="Create skill">
              <Plus size={22} color="#fff" />
            </Pressable>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 12 }}>
            <Chip label="All" Icon={Globe} active={activeCategory === 'All' && !showSaved} onPress={handleReset} />
            {currentUser && (
              <Chip
                label={`Saved ${savedList.length}`} Icon={Bookmark} active={showSaved}
                onPress={() => { setShowSaved((v) => !v); setActiveCategory('All'); setSortBy('default'); }}
              />
            )}
            {CATEGORIES.map((cat) => (
              <Chip
                key={cat.name} label={cat.name} Icon={cat.icon} iconColor={cat.color}
                active={activeCategory === cat.name && !showSaved} onPress={() => jumpTo(cat.name)}
              />
            ))}
          </ScrollView>
        </View>

        {/* HOME: lanes end at New arrivals */}
        {!isFiltered && (
          <View style={{ paddingTop: 6 }}>
            {!loading && recommendedSkills.length > 0 && (
              <Lane icon={Lightbulb} iconColor="#a855f7" title="Recommended for you"
                skills={recommendedSkills} loading={false} {...sharedProps} />
            )}
            <Lane icon={Flame} iconColor="#f97316" title="Top trending"
              skills={trending} loading={loading} {...sharedProps}
              onSeeAll={() => { setSortBy('trending'); setActiveCategory('All'); }} />
            <Lane icon={Trophy} iconColor="#f59e0b" title="Top rated"
              skills={topRated} loading={loading} {...sharedProps}
              onSeeAll={() => { setSortBy('top'); setActiveCategory('All'); }} />
            <Lane icon={Sparkles} iconColor="#0ea5e9" title="New arrivals" last={!categoryLanes.length}
              skills={newest} loading={loading} {...sharedProps}
              onSeeAll={() => { setSortBy('newest'); setActiveCategory('All'); }} />
            {!loading && categoryLanes.map(({ cat, list }, i) => (
              <Lane key={cat.name} icon={cat.icon} iconColor={cat.color} title={cat.name}
                skills={list} loading={false} last={i === categoryLanes.length - 1} {...sharedProps}
                onSeeAll={() => jumpTo(cat.name)} />
            ))}
          </View>
        )}

        {/* FILTERED: simple list rows */}
        {isFiltered && (
          <View>
            <View style={s.resultsHead}>
              <View style={{ flex: 1 }}>
                <Text style={s.resultsTitle} numberOfLines={1}>{gridTitle}</Text>
                <Text style={s.resultsSub}>
                  {filtered.length} {filtered.length === 1 ? 'skill' : 'skills'}{searchQuery ? ` for “${searchQuery}”` : ''}
                </Text>
              </View>
              <Pressable onPress={handleReset} style={s.homeBtn} hitSlop={6}>
                <ChevronLeft size={16} color="#047857" />
                <Text style={s.homeBtnText}>Home</Text>
              </Pressable>
            </View>

            {loading ? (
              <View style={{ paddingHorizontal: 16, gap: 14, paddingTop: 12 }}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={[s.thumb, { backgroundColor: '#eff3f4' }]} />
                    <View style={{ flex: 1, gap: 8, paddingTop: 4 }}>
                      <View style={s.skel} />
                      <View style={[s.skel, { width: '55%' }]} />
                    </View>
                  </View>
                ))}
              </View>
            ) : filtered.length === 0 ? (
              <View style={s.empty}>
                {showSaved ? <Bookmark size={40} color="#cfd9de" /> : <Search size={40} color="#cfd9de" />}
                <Text style={s.emptyTitle}>{showSaved ? 'No saved skills yet' : 'No skills found'}</Text>
                <Text style={s.emptySub}>
                  {showSaved ? 'Tap the bookmark on a skill to save it.' : 'Try a different keyword or category.'}
                </Text>
                <Pressable onPress={handleReset} style={s.showAll}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Back to home</Text>
                </Pressable>
              </View>
            ) : (
              <View>
                {filtered.map((skill) => (
                  <SkillRow key={skill.id} skill={skill}
                    isSaved={savedSkills.includes(skill.id)} onSave={toggleSave} onView={handleView} />
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* WELCOME BONUS */}
      <Modal visible={showWelcomeModal} transparent animationType="fade" onRequestClose={closeWelcomeModal}>
        <View style={s.welcomeWrap}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeWelcomeModal} />
          <View style={s.welcomeCard}>
            <Pressable onPress={closeWelcomeModal} style={s.welcomeClose} hitSlop={10}><X size={20} color="#536471" /></Pressable>
            <View style={s.welcomeIcon}><PartyPopper size={30} color="#f59e0b" /></View>
            <Text style={s.welcomeTag}>Welcome to SkillCredit</Text>
            <Text style={s.welcomeTitle}>You're all set up!</Text>
            <Text style={s.welcomeText}>As a starting gift, you received a bonus of</Text>
            <View style={s.welcomeAmount}>
              <Text style={s.welcomeNum}>20</Text>
              <Text style={s.welcomeUnit}>CR</Text>
            </View>
            <Text style={s.welcomeHint}>Use your credits to book your first skill-sharing session and start learning today.</Text>
            <Pressable onPress={closeWelcomeModal} style={s.welcomeBtn}>
              <Text style={s.welcomeBtnText}>Awesome, let's go!</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* SORT SHEET */}
      <Modal visible={sortOpen} transparent animationType="slide" onRequestClose={() => setSortOpen(false)}>
        <Pressable style={s.overlay} onPress={() => setSortOpen(false)} />
        <View style={s.sheet}>
          <View style={s.grabber} />
          <Text style={s.sheetTitle}>Sort by</Text>
          {visibleSortOptions.map((option) => {
            const OptionIcon = option.icon;
            const selected = sortBy === option.value;
            return (
              <Pressable key={option.value} onPress={() => { setSortBy(option.value); setSortOpen(false); }} style={s.sortRow}>
                <OptionIcon size={20} color={option.color} />
                <Text style={[s.sortLabel, selected && { fontWeight: '700', color: '#047857' }]}>{option.label}</Text>
                {selected && <Check size={18} color="#047857" />}
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  // top
  topBlock: { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#eff3f4', borderRadius: 22, paddingHorizontal: 14, height: 42 },
  searchInput: { flex: 1, fontSize: 15, color: '#0f1419', paddingVertical: 0 },
  sortBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#eff3f4', alignItems: 'center', justifyContent: 'center' },
  createBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#047857', alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 17, backgroundColor: '#eff3f4' },
  chipOn: { backgroundColor: '#0f1419' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#0f1419' },

  // lanes
  lane: { paddingTop: 14, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: '#eff3f4' },
  laneHead: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, marginBottom: 12 },
  laneTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#0f1419', letterSpacing: -0.2 },
  seeAllBtn: { flexDirection: 'row', alignItems: 'center' },
  seeAll: { fontSize: 14, fontWeight: '600', color: '#047857' },

  // card (image + text, no box)
  card: { width: 172 },
  cover: { height: 106, borderRadius: 12, backgroundColor: '#065f46', overflow: 'hidden' },
  coverEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  saveBtn: { position: 'absolute', top: 7, right: 7, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#0f1419', lineHeight: 19, marginTop: 8, marginBottom: 3 },
  skel: { height: 12, backgroundColor: '#eff3f4', borderRadius: 6 },

  // by-line + price
  byLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  byName: { flexShrink: 1, fontSize: 13, color: '#536471' },
  byDot: { fontSize: 13, color: '#536471' },
  byNew: { fontSize: 13, fontWeight: '600', color: '#059669' },
  byRating: { fontSize: 13, fontWeight: '600', color: '#0f1419' },
  byCount: { fontSize: 13, color: '#536471' },
  price: { fontSize: 13, fontWeight: '700', color: '#047857', marginTop: 5 },

  // rows
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eff3f4' },
  thumb: { width: 68, height: 68, borderRadius: 12, backgroundColor: '#065f46', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#0f1419', lineHeight: 20, marginBottom: 2 },
  rowSave: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  // results header + empty
  resultsHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#eff3f4' },
  resultsTitle: { fontSize: 18, fontWeight: '700', color: '#0f1419', letterSpacing: -0.2 },
  resultsSub: { fontSize: 13, color: '#536471', marginTop: 1 },
  homeBtn: { flexDirection: 'row', alignItems: 'center', height: 36, paddingLeft: 8 },
  homeBtnText: { fontSize: 14, fontWeight: '600', color: '#047857' },
  empty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#0f1419', marginTop: 12 },
  emptySub: { fontSize: 14, color: '#536471', marginTop: 4, textAlign: 'center' },
  showAll: { backgroundColor: '#047857', paddingHorizontal: 26, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginTop: 16 },

  // welcome bonus
  welcomeWrap: { flex: 1, backgroundColor: 'rgba(15,20,25,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  welcomeCard: { width: '100%', maxWidth: 340, backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 22, paddingTop: 28, paddingBottom: 20, alignItems: 'center' },
  welcomeClose: { position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  welcomeIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fffbeb', alignItems: 'center', justifyContent: 'center' },
  welcomeTag: { fontSize: 13, fontWeight: '600', color: '#b45309', marginTop: 14 },
  welcomeTitle: { fontSize: 20, fontWeight: '700', color: '#0f1419', letterSpacing: -0.2, marginTop: 4 },
  welcomeText: { fontSize: 14, color: '#536471', marginTop: 6, textAlign: 'center' },
  welcomeAmount: { flexDirection: 'row', alignItems: 'baseline', gap: 6, backgroundColor: '#fffbeb', borderRadius: 14, paddingHorizontal: 22, paddingVertical: 8, marginTop: 12 },
  welcomeNum: { fontSize: 32, fontWeight: '700', color: '#f59e0b', letterSpacing: -0.6 },
  welcomeUnit: { fontSize: 17, fontWeight: '600', color: '#d97706' },
  welcomeHint: { fontSize: 13, color: '#536471', textAlign: 'center', lineHeight: 18, marginTop: 12 },
  welcomeBtn: { alignSelf: 'stretch', height: 44, borderRadius: 22, backgroundColor: '#047857', alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  welcomeBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // sort sheet
  overlay: { flex: 1, backgroundColor: 'rgba(15,20,25,0.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 28 },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#cfd9de', marginBottom: 6 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#0f1419', marginTop: 6, marginBottom: 4 },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 48, borderTopWidth: 1, borderTopColor: '#eff3f4' },
  sortLabel: { flex: 1, fontSize: 15, color: '#0f1419' },
});