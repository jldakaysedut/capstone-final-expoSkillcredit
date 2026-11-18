import { Reveal, PressScale } from '../../components/premium/PremiumVisual';
import { Alert } from '../../components/SkillCreditAlert';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Modal, Linking, RefreshControl, Animated, Platform, AppState, DeviceEventEmitter, StyleSheet
} from 'react-native';
import { ActivityIndicator, View, Text, Image, Pressable, ScrollView, TextInput, KeyboardAvoidingView } from '../../components/premium/PremiumThemePrimitives';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Camera, CalendarDays, ClipboardList, Clock3, ExternalLink, FileText, FolderOpen, ImagePlus, Mail, Paperclip, Pencil, Plus, Star, Trash2, X } from '../../components/premium/PremiumThemeIcons';
import supabase from '../../supabaseClient';

// Compact X-style layout: cover + overlapping avatar, inline stats, underline tabs, hairline rows
const T = {
  text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4',
  brand: '#047857', soft: '#ecfdf5', danger: '#e11d48', strip: '#f7f9f9',
};

const IMAGES = ['images'];
const DIMS = [
  { key: 'avgClarity', label: 'Clarity' },
  { key: 'avgPatience', label: 'Patience' },
  { key: 'avgRelevance', label: 'Relevance' },
  { key: 'avgProfessionalism', label: 'Professionalism' },
];
const TABS = ['Listings', 'Portfolio', 'Reviews'];
const EMPTY_FORM = { title: '', description: '', project_url: '', cover: null, attachments: [] };

const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
const extOf = (name = '', uri = '') => (name.split('.').pop() || uri.split('.').pop() || 'jpg').toLowerCase();
const confirmAsync = (title, msg, okText = 'Delete') => new Promise((res) =>
  Alert.alert(title, msg, [
    { text: 'Cancel', style: 'cancel', onPress: () => res(false) },
    { text: okText, style: 'destructive', onPress: () => res(true) },
  ]));

// base64 -> bytes (React Native can't upload a File/Blob reliably, so we send raw bytes)
const B64_LOOKUP = (() => {
  const t = new Uint8Array(256).fill(255);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < chars.length; i++) t[chars.charCodeAt(i)] = i;
  return t;
})();
const base64ToArrayBuffer = (b64) => {
  let len = b64.length;
  while (len > 0 && b64[len - 1] === '=') len--;
  const out = new Uint8Array(Math.floor((len * 3) / 4));
  let p = 0, buf = 0, bits = 0;
  for (let i = 0; i < len; i++) {
    const v = B64_LOOKUP[b64.charCodeAt(i)];
    if (v === 255) continue;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[p++] = (buf >> bits) & 255;
      buf &= (1 << bits) - 1;
    }
  }
  return out.buffer.slice(0, p);
};

// RN can't upload a File object — send an ArrayBuffer instead (photos come as base64, documents via fetch)
const uploadFile = async (bucket, path, uri, contentType, base64) => {
  let buf;
  if (base64) buf = base64ToArrayBuffer(base64);
  else { const res = await fetch(uri); buf = await res.arrayBuffer(); }
  if (!buf || buf.byteLength === 0) throw new Error('Could not read the selected file.');
  const { error } = await supabase.storage.from(bucket).upload(path, buf, { contentType: contentType || 'application/octet-stream', upsert: true });
  if (error) throw error;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
};

const Avatar = ({ uri, name, size }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: '#d1fae5', alignItems: 'center', justifyContent: 'center' }}>
    {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />
      : <Text style={{ fontWeight: '700', color: '#065f46', fontSize: size * 0.4 }}>{name?.charAt(0).toUpperCase() || '?'}</Text>}
  </View>
);

const Stars = ({ value, size = 13 }) => (
  <View style={{ flexDirection: 'row', gap: 1 }}>
    {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={size} strokeWidth={1.8} color={n <= value ? '#f59e0b' : T.border} fill={n <= value ? '#f59e0b' : 'none'} />)}
  </View>
);

const Skeleton = ({ style }) => (
  <View style={[{ backgroundColor: '#e9eff0', borderRadius: 6 }, style]} />
);

const ProfileSkeleton = () => (
  <View style={{ flex: 1, backgroundColor: '#fff' }}>
    <View style={{ height: 104, backgroundColor: T.line }} />
    <View style={{ paddingHorizontal: 16 }}>
      <Skeleton style={{ width: 92, height: 92, borderRadius: 46, marginTop: -46, borderWidth: 4, borderColor: '#fff' }} />
      <Skeleton style={{ width: 160, height: 20, marginTop: 14 }} />
      <Skeleton style={{ width: 110, height: 13, marginTop: 8 }} />
      <Skeleton style={{ width: '100%', height: 13, marginTop: 18 }} />
      <Skeleton style={{ width: '70%', height: 13, marginTop: 8 }} />
    </View>
    {[0, 1, 2].map((i) => (
      <View key={i} style={s.row}>
        <Skeleton style={{ width: 64, height: 64, borderRadius: 12 }} />
        <View style={{ flex: 1, gap: 8 }}><Skeleton style={{ height: 14, width: '60%' }} /><Skeleton style={{ height: 12, width: '40%' }} /></View>
      </View>
    ))}
  </View>
);

const InfoItem = ({ Icon, text }) => (
  <View style={s.infoItem}>
    <Icon size={14} color={T.sub} strokeWidth={1.8} />
    <Text style={s.infoText} numberOfLines={1}>{text}</Text>
  </View>
);

const Toolbar = ({ label, action, onAction }) => (
  <View style={s.toolbar}>
    <Text style={s.toolbarLabel}>{label}</Text>
    <Pressable onPress={onAction} style={({ pressed }) => [s.fillBtnSm, pressed && { backgroundColor: '#065f46' }]}>
      <Plus size={15} color="#fff" strokeWidth={2.25} /><Text style={s.fillBtnSmText}>{action}</Text>
    </Pressable>
  </View>
);

const Empty = ({ Icon, title, sub, cta, onCta }) => (
  <View style={s.empty}>
    <Icon size={40} color={T.border} strokeWidth={1.5} />
    <Text style={s.emptyTitle}>{title}</Text>
    <Text style={s.emptySub}>{sub}</Text>
    {!!cta && <Pressable onPress={onCta} style={s.cta}><Text style={s.fillBtnText}>{cta}</Text></Pressable>}
  </View>
);

const Sheet = ({ visible, onClose, title, subtitle, children }) => {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}><View style={s.overlay} /></Pressable>
        <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={s.grabber} />
          {!!title && (
            <View style={s.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.sheetTitle}>{title}</Text>
                {!!subtitle && <Text style={s.sheetSub}>{subtitle}</Text>}
              </View>
              <Pressable onPress={onClose} hitSlop={10} style={s.closeBtn}><X size={18} color={T.text} /></Pressable>
            </View>
          )}
          <View style={{ paddingHorizontal: 16 }}>{children}</View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const Field = ({ label, ...props }) => (
  <View style={{ marginBottom: 14 }}>
    <Text style={s.fieldLabel}>{label}</Text>
    <TextInput placeholderTextColor="#8b98a5" {...props} style={[s.input, props.multiline && { height: 104, textAlignVertical: 'top', paddingTop: 12 }]} />
  </View>
);

export default function Profile() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({ full_name: '', bio: '', avatar_url: '', credits_balance: 0, role: '', created_at: '', availability_schedule: '', contact_info: '' });
  const [reviews, setReviews] = useState([]);
  const [mySkills, setMySkills] = useState([]);
  const [portfolio, setPortfolio] = useState([]);
  const [stats, setStats] = useState({ avgRating: 0, totalReviews: 0, sessionsTaught: 0, avgClarity: '0.0', avgPatience: '0.0', avgRelevance: '0.0', avgProfessionalism: '0.0' });
  const [tab, setTab] = useState('Listings');

  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pendingAvatar, setPendingAvatar] = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [uploadingProject, setUploadingProject] = useState(false);
  const [selected, setSelected] = useState(null);
  const channelRef = useRef(null);

  const fetchAll = useCallback(async () => {
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) { navigation.navigate('Login'); return null; }
    setUser(u);

    const [{ data: p }, { data: revData }, { count }, { data: skills }, { data: port }] = await Promise.all([
      supabase.from('user_profiles').select('*').eq('id', u.id).single(),
      supabase.from('reviews').select('*').eq('instructor_id', u.id).order('created_at', { ascending: false }),
      supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('instructor_id', u.id).eq('status', 'completed'),
      supabase.from('skills').select('*').eq('instructor_id', u.id).eq('is_active', true).eq('status', 'approved').order('created_at', { ascending: false }),
      supabase.from('portfolio_items').select('*').eq('user_id', u.id).order('created_at', { ascending: false }),
    ]);

    if (p) setProfile({
      full_name: p.full_name || '', bio: p.bio || '', avatar_url: p.avatar_url || '', credits_balance: p.credits_balance || 0,
      role: p.role || 'User', created_at: p.created_at || new Date().toISOString(),
      availability_schedule: p.availability_schedule || '', contact_info: p.contact_info || '',
    });

    // same rating math as the web
    const list = revData || [];
    let total = 0, c = 0, pa = 0, r = 0, pr = 0;
    list.forEach((x) => {
      const q1 = Number(x.q1_clarity || 0), q2 = Number(x.q2_patience || 0), q3 = Number(x.q3_relevance || 0), q4 = Number(x.q4_professionalism || 0);
      total += (Number(x.rating || 0) + q1 + q2 + q3 + q4) / 5;
      c += q1; pa += q2; r += q3; pr += q4;
    });
    const n = list.length;
    setStats({
      avgRating: n ? parseFloat((total / n).toFixed(1)) : 0, totalReviews: n, sessionsTaught: count || 0,
      avgClarity: n ? (c / n).toFixed(1) : '0.0', avgPatience: n ? (pa / n).toFixed(1) : '0.0',
      avgRelevance: n ? (r / n).toFixed(1) : '0.0', avgProfessionalism: n ? (pr / n).toFixed(1) : '0.0',
    });

    // enrich reviews with 2 batched queries (web did 2 queries per review)
    if (n) {
      const sIds = [...new Set(list.map((x) => x.student_id).filter(Boolean))];
      const kIds = [...new Set(list.map((x) => x.skill_id).filter(Boolean))];
      const [{ data: studs }, { data: skls }] = await Promise.all([
        sIds.length ? supabase.from('user_profiles').select('id,full_name,avatar_url').in('id', sIds) : { data: [] },
        kIds.length ? supabase.from('skills').select('id,title').in('id', kIds) : { data: [] },
      ]);
      const sm = Object.fromEntries((studs || []).map((x) => [x.id, x]));
      const km = Object.fromEntries((skls || []).map((x) => [x.id, x]));
      setReviews(list.map((x) => ({ ...x, student: sm[x.student_id], skill: km[x.skill_id] })));
    } else setReviews([]);

    setMySkills(skills || []);
    setPortfolio(port || []);
    return u.id;
  }, [navigation]);

  useEffect(() => {
    let disposed = false;
    (async () => {
      const uid_ = await fetchAll();
      if (disposed) return;
      setLoading(false);
      if (!uid_) return;
      channelRef.current = supabase.channel(`profile_page_${uid_}_${Date.now()}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_profiles', filter: `id=eq.${uid_}` }, (payload) => {
          const n = payload.new;
          if (n) setProfile((prev) => ({
            ...prev, credits_balance: n.credits_balance ?? prev.credits_balance, avatar_url: n.avatar_url || '',
            bio: n.bio || '', full_name: n.full_name || prev.full_name,
            availability_schedule: n.availability_schedule || '', contact_info: n.contact_info || '',
          }));
        }).subscribe();
    })();
    const appSub = AppState.addEventListener('change', (st) => { if (st === 'active') fetchAll(); });
    return () => { disposed = true; appSub.remove(); if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, [fetchAll]);

  useEffect(() => {
    const offFocus = navigation.addListener('focus', fetchAll);
    if (!user?.id) return () => offFocus();
    let timer;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { void fetchAll(); }, 400);
    };
    // Narrow the previous global listeners to this profile, and include skills.
    const liveChannel = supabase.channel('profile_relations_live_' + user.id + '_' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews', filter: `instructor_id=eq.${user.id}` }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portfolio_items', filter: `user_id=eq.${user.id}` }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `instructor_id=eq.${user.id}` }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'skills', filter: `instructor_id=eq.${user.id}` }, schedule)
      .subscribe();
    return () => { clearTimeout(timer); offFocus(); supabase.removeChannel(liveChannel); };
  }, [fetchAll, navigation, user?.id]);

  const onRefresh = async () => { setRefreshing(true); await fetchAll(); setRefreshing(false); };

  // ── avatar
  const pickAvatar = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: IMAGES, allowsEditing: true, aspect: [1, 1], quality: 0.8, base64: true });
    if (r.canceled) return;
    const a = r.assets[0];
    if (a.fileSize && a.fileSize > 5 * 1024 * 1024) return Alert.alert('Photo too large', 'Choose an image under 5MB.');
    setPendingAvatar(a);
  };
  const saveAvatar = async () => {
    if (!pendingAvatar || !user) return;
    setUploadingAvatar(true);
    try {
      const path = `${user.id}/${user.id}-${Date.now()}.${extOf(pendingAvatar.fileName, pendingAvatar.uri)}`;
      const url = await uploadFile('avatars', path, pendingAvatar.uri, pendingAvatar.mimeType, pendingAvatar.base64);
      await supabase.from('user_profiles').update({ avatar_url: url }).eq('id', user.id);
      setProfile((p) => ({ ...p, avatar_url: url }));
      setPendingAvatar(null);
      DeviceEventEmitter.emit('credit_updated'); // makes UserLayout re-read the profile (new photo in the top bar)
    } catch (e) { console.warn('avatar upload', e); Alert.alert('Upload failed', e?.message || 'Could not upload your photo.'); }
    finally { setUploadingAvatar(false); }
  };

  // ── edit profile
  const openEdit = () => {
    setDraft({ full_name: profile.full_name, bio: profile.bio, availability_schedule: profile.availability_schedule, contact_info: profile.contact_info });
    setEditOpen(true);
  };
  const saveProfile = async () => {
    if (!draft.full_name.trim()) return Alert.alert('Name required', 'Name cannot be empty.');
    setSaving(true);
    try {
      const { error } = await supabase.from('user_profiles').update(draft).eq('id', user.id);
      if (error) throw error;
      setProfile((p) => ({ ...p, ...draft }));
      setEditOpen(false);
      DeviceEventEmitter.emit('credit_updated'); // makes UserLayout re-read the profile (new name in the menu)
    } catch { Alert.alert('Not saved', 'Failed to update profile.'); }
    finally { setSaving(false); }
  };

  // ── portfolio
  const openAdd = () => { setEditingId(null); setForm(EMPTY_FORM); setFormOpen(true); };
  const openEditProject = (item) => {
    setSelected(null);
    setEditingId(item.id);
    setForm({ title: item.project_title || '', description: item.project_description || '', project_url: item.project_url || '', cover: item.image_url ? { uri: item.image_url, isNew: false } : null, attachments: [] });
    setTimeout(() => setFormOpen(true), 350); // wait for the detail sheet to finish closing
  };
  const pickCover = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: IMAGES, quality: 0.8, base64: true });
    if (!r.canceled) { const a = r.assets[0]; setForm((f) => ({ ...f, cover: { uri: a.uri, isNew: true, name: a.fileName, mimeType: a.mimeType, base64: a.base64 } })); }
  };
  const pickFiles = async () => {
    const r = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (!r.canceled) setForm((f) => ({ ...f, attachments: [...f.attachments, ...r.assets] }));
  };
  const saveProject = async () => {
    if (!form.title.trim()) return Alert.alert('Title required', 'Add a project title.');
    setUploadingProject(true);
    try {
      const editing = !!editingId;
      let coverUrl = editing ? (form.cover?.uri ?? null) : '';
      if (form.cover?.isNew) coverUrl = await uploadFile('portfolios', `${user.id}/cover_${uid()}.${extOf(form.cover.name, form.cover.uri)}`, form.cover.uri, form.cover.mimeType, form.cover.base64);
      else if (!editing) coverUrl = '';
      const atts = [];
      for (const f of form.attachments) {
        try { atts.push({ name: f.name, type: f.mimeType, url: await uploadFile('portfolios', `${user.id}/doc_${uid()}.${extOf(f.name)}`, f.uri, f.mimeType) }); } catch { /* skip failed file */ }
      }
      const base = { project_title: form.title, project_description: form.description, image_url: coverUrl, project_url: form.project_url };
      if (editing) await supabase.from('portfolio_items').update(base).eq('id', editingId);
      else await supabase.from('portfolio_items').insert([{ user_id: user.id, ...base, attachments: atts }]);
      const { data } = await supabase.from('portfolio_items').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      if (data) setPortfolio(data);
      setFormOpen(false); setForm(EMPTY_FORM); setEditingId(null);
    } catch (e) { console.warn('portfolio save', e); Alert.alert('Not saved', e?.message || 'Failed to save portfolio item.'); }
    finally { setUploadingProject(false); }
  };
  const deleteProject = async (id) => {
    if (!(await confirmAsync('Delete this item?', 'This cannot be undone.'))) return;
    await supabase.from('portfolio_items').delete().eq('id', id);
    setPortfolio((p) => p.filter((x) => x.id !== id));
    setSelected(null);
  };

  if (loading) return <ProfileSkeleton />;

  const joined = new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const counts = { Listings: mySkills.length, Portfolio: portfolio.length, Reviews: reviews.length };
  const fmt = (d, o) => new Date(d).toLocaleDateString('en-US', o);

  return (
    <>
      <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.brand} colors={[T.brand]} />}>

        {/* 0 · cover, identity, stats */}
        <View>
          <View style={s.cover} />
          <Reveal delay={90}><View style={s.head}>
            <View style={s.idRow}>
              <Pressable onPress={pickAvatar} disabled={uploadingAvatar}>
                <View style={s.avatarRing}><Avatar uri={pendingAvatar?.uri || profile.avatar_url} name={profile.full_name} size={84} /></View>
                <View style={s.camBadge}><Camera size={13} color="#fff" strokeWidth={2} /></View>
              </Pressable>

              <View style={s.headActions}>
                {pendingAvatar ? (
                  <>
                    <Pressable onPress={() => setPendingAvatar(null)} disabled={uploadingAvatar} style={s.outlineBtn}><Text style={s.outlineBtnText}>Cancel</Text></Pressable>
                    <PressScale onPress={saveAvatar} disabled={uploadingAvatar} style={s.fillBtnSm}>
                      {uploadingAvatar ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.fillBtnSmText}>Save photo</Text>}
                    </PressScale>
                  </>
                ) : (
                  <Pressable onPress={openEdit} style={({ pressed }) => [s.outlineBtn, pressed && { backgroundColor: T.strip }]}>
                    <Text style={s.outlineBtnText}>Edit profile</Text>
                  </Pressable>
                )}
              </View>
            </View>

            <Text style={s.name} numberOfLines={1}>{profile.full_name}</Text>
            <View style={s.joinedRow}>
              <CalendarDays size={14} color={T.sub} strokeWidth={1.8} />
              <Text style={s.handle}>Joined {joined}</Text>
            </View>

            <Text style={s.bio}>{profile.bio || 'No bio yet. Tap Edit profile to add one.'}</Text>

            <View style={s.infoWrap}>
              {!!profile.availability_schedule && <InfoItem Icon={Clock3} text={profile.availability_schedule} />}
              {!!profile.contact_info && <InfoItem Icon={Mail} text={profile.contact_info} />}
            </View>

            <View style={s.stats}>
              <Text style={s.statLabel}><Text style={s.statNum}>{profile.credits_balance}</Text> Credits</Text>
              <Text style={s.statLabel}><Text style={s.statNum}>{stats.sessionsTaught}</Text> Sessions</Text>
              <Text style={s.statLabel}><Text style={s.statNum}>{mySkills.length}</Text> Listings</Text>
              <View style={s.ratingInline}>
                <Star size={14} color="#f59e0b" fill="#f59e0b" strokeWidth={1.8} />
                <Text style={s.statNum}>{stats.avgRating > 0 ? stats.avgRating.toFixed(1) : '0.0'}</Text>
              </View>
            </View>
          </View></Reveal>
        </View>

        {/* 1 · sticky tabs */}
        <View style={s.tabsSticky}>
          <View style={s.tabs}>
          {TABS.map((t) => {
            const on = tab === t;
            return (
              <Pressable key={t} onPress={() => setTab(t)} style={s.tab}>
                <View style={s.tabInner}>
                  <Text style={[s.tabText, on && s.tabTextOn]}>{t}</Text>
                  <Text style={[s.tabCount, on && { color: T.text }]}>{counts[t]}</Text>
                </View>
                <View style={[s.tabBar, on && { backgroundColor: T.brand }]} />
              </Pressable>
            );
          })}
          </View>
        </View>

        {/* 2 · content */}
        <View>
          {tab === 'Listings' && (
            <View>
              <Toolbar label={`${mySkills.length} active ${mySkills.length === 1 ? 'listing' : 'listings'}`} action="New listing" onAction={() => navigation.navigate('CreateSkill')} />
              {mySkills.length === 0
                ? <Empty Icon={ClipboardList} title="No listings yet" sub="Share your expertise with the community." />
                : mySkills.map((k) => (
                  <Pressable key={k.id} onPress={() => navigation.navigate('SkillDetails', { id: k.id })} style={({ pressed }) => [s.row, pressed && { backgroundColor: T.strip }]}>
                    <View style={s.thumb}>{k.cover_image_url ? <Image source={{ uri: k.cover_image_url }} style={s.fill} /> : <ClipboardList size={22} color={T.border} strokeWidth={1.6} />}</View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowTitle} numberOfLines={1}>{k.title}</Text>
                      <Text style={s.rowSub} numberOfLines={1}>{[k.category, k.mode || 'Online'].filter(Boolean).join(' · ')}</Text>
                      <Text style={s.price}>{k.credit_cost} cr/hr</Text>
                    </View>
                    <Pressable onPress={() => navigation.navigate('EditSkill', { id: k.id })} hitSlop={10} style={s.iconBtn}><Pencil size={16} color={T.text} strokeWidth={1.8} /></Pressable>
                  </Pressable>
                ))}
            </View>
          )}

          {tab === 'Portfolio' && (
            <View>
              <Toolbar label={`${portfolio.length} ${portfolio.length === 1 ? 'project' : 'projects'}`} action="Add project" onAction={openAdd} />
              {portfolio.length === 0
                ? <Empty Icon={FolderOpen} title="No portfolio items yet" sub="Showcase your best work to attract learners." />
                : portfolio.map((p) => (
                  <Pressable key={p.id} onPress={() => setSelected(p)} style={({ pressed }) => [s.row, pressed && { backgroundColor: T.strip }]}>
                    <View style={s.thumb}>{p.image_url ? <Image source={{ uri: p.image_url }} style={s.fill} /> : <FolderOpen size={22} color={T.border} strokeWidth={1.6} />}</View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowTitle} numberOfLines={1}>{p.project_title}</Text>
                      <Text style={s.rowSub} numberOfLines={2}>{p.project_description || 'No description.'}</Text>
                    </View>
                  </Pressable>
                ))}
            </View>
          )}

          {tab === 'Reviews' && (
            <View>
              <View style={s.summary}>
                <View style={s.ratingCol}>
                  <Text style={s.bigRating}>{stats.avgRating > 0 ? stats.avgRating.toFixed(1) : '—'}</Text>
                  <Stars value={Math.round(stats.avgRating)} size={14} />
                  <Text style={s.rowSub}>{stats.totalReviews} {stats.totalReviews === 1 ? 'review' : 'reviews'}</Text>
                </View>
                <View style={{ flex: 1, gap: 10 }}>
                  {DIMS.map((d) => (
                    <View key={d.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={s.dimLbl} numberOfLines={1}>{d.label}</Text>
                      <View style={s.bar}><View style={[s.barFill, { width: `${(Number(stats[d.key]) / 5) * 100}%` }]} /></View>
                      <Text style={s.dimVal}>{stats[d.key]}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {reviews.length === 0
                ? <Empty Icon={Star} title="No reviews yet" sub="Complete sessions to receive feedback." />
                : reviews.map((r) => (
                  <View key={r.id} style={s.review}>
                    <Pressable onPress={() => navigation.navigate('PublicProfile', { id: r.student_id })}>
                      <Avatar uri={r.student?.avatar_url} name={r.student?.full_name || 'S'} size={40} />
                    </Pressable>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={s.rowTitle} numberOfLines={1}>{r.student?.full_name || 'Student'}</Text>
                        <View style={{ flex: 1 }} />
                        <Text style={s.rowSub}>{fmt(r.created_at, { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
                        <Stars value={r.rating} />
                        <Text style={[s.rowSub, { flex: 1, marginTop: 0 }]} numberOfLines={1}>{r.skill?.title || 'Session'}</Text>
                      </View>
                      {!!(r.feedback || r.comment) && <Text style={s.reviewText}>{r.feedback || r.comment}</Text>}
                    </View>
                  </View>
                ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* edit profile */}
      <Sheet visible={editOpen} onClose={() => setEditOpen(false)} title="Edit profile">
        {draft && (
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 440 }} contentContainerStyle={{ paddingTop: 14 }}>
            <Field label="Name" value={draft.full_name} onChangeText={(v) => setDraft({ ...draft, full_name: v })} />
            <Field label="About" multiline value={draft.bio} onChangeText={(v) => setDraft({ ...draft, bio: v })} />
            <Field label="Availability" placeholder="e.g. Weekdays 5PM-9PM" value={draft.availability_schedule} onChangeText={(v) => setDraft({ ...draft, availability_schedule: v })} />
            <Field label="Contact or handle" placeholder="@handle or email" autoCapitalize="none" value={draft.contact_info} onChangeText={(v) => setDraft({ ...draft, contact_info: v })} />
          </ScrollView>
        )}
        <View style={s.btnRow}>
          <Pressable onPress={() => setEditOpen(false)} style={[s.fillBtn, s.softBtn]}><Text style={[s.fillBtnText, { color: T.text }]}>Cancel</Text></Pressable>
          <Pressable onPress={saveProfile} disabled={saving} style={s.fillBtn}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={s.fillBtnText}>Save</Text>}</Pressable>
        </View>
      </Sheet>

      {/* add / edit project */}
      <Sheet visible={formOpen} onClose={() => setFormOpen(false)} title={editingId ? 'Edit project' : 'Add project'}>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 470 }} contentContainerStyle={{ paddingTop: 14 }}>
          <Field label="Project title" value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} />
          <Field label="Description" multiline value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} />
          <Field label="Project link" autoCapitalize="none" keyboardType="url" placeholder="https://" value={form.project_url} onChangeText={(v) => setForm({ ...form, project_url: v })} />
          <Text style={s.fieldLabel}>Cover image</Text>
          {form.cover ? (
            <View style={s.coverBox}>
              <Image source={{ uri: form.cover.uri }} style={s.fill} />
              <Pressable onPress={() => setForm({ ...form, cover: null })} style={s.coverX} hitSlop={8}><X size={16} color="#fff" /></Pressable>
            </View>
          ) : (
            <Pressable onPress={pickCover} style={s.dropzone}><ImagePlus size={22} color={T.sub} strokeWidth={1.8} /><Text style={s.dropText}>Upload cover</Text></Pressable>
          )}
          {!editingId && (
            <View style={{ marginTop: 16 }}>
              <Text style={s.fieldLabel}>Attachments</Text>
              <Pressable onPress={pickFiles} style={s.outlineBtn}><Paperclip size={15} color={T.text} strokeWidth={1.8} /><Text style={s.outlineBtnText}>Attach files</Text></Pressable>
              {form.attachments.map((f, i) => (
                <View key={i} style={s.fileRow}>
                  <FileText size={16} color={T.sub} strokeWidth={1.8} />
                  <Text style={{ flex: 1, fontSize: 14, color: T.text }} numberOfLines={1}>{f.name}</Text>
                  <Pressable hitSlop={10} onPress={() => setForm((x) => ({ ...x, attachments: x.attachments.filter((_, j) => j !== i) }))}><X size={17} color={T.sub} /></Pressable>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
        <View style={s.btnRow}>
          <Pressable onPress={() => setFormOpen(false)} style={[s.fillBtn, s.softBtn]}><Text style={[s.fillBtnText, { color: T.text }]}>Cancel</Text></Pressable>
          <Pressable onPress={saveProject} disabled={uploadingProject} style={s.fillBtn}>{uploadingProject ? <ActivityIndicator color="#fff" /> : <Text style={s.fillBtnText}>{editingId ? 'Save' : 'Add project'}</Text>}</Pressable>
        </View>
      </Sheet>

      {/* project detail */}
      <Sheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.project_title} subtitle={selected ? fmt(selected.created_at, { month: 'long', day: 'numeric', year: 'numeric' }) : ''}>
        {selected && (
          <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ paddingTop: 14 }}>
            {!!selected.image_url && <Image source={{ uri: selected.image_url }} style={s.detailImg} />}
            <Text style={s.body}>{selected.project_description || 'No description provided.'}</Text>
            {!!selected.project_url && (
              <Pressable onPress={() => Linking.openURL(selected.project_url)} style={s.link}><ExternalLink size={15} color={T.brand} strokeWidth={1.8} /><Text style={s.linkText}>View project</Text></Pressable>
            )}
            {selected.attachments?.length > 0 && (
              <View style={{ marginTop: 16 }}>
                <Text style={s.fieldLabel}>Attachments</Text>
                {selected.attachments.map((a, i) => (
                  <Pressable key={i} onPress={() => Linking.openURL(a.url)} style={s.fileRow}>
                    <Paperclip size={15} color={T.sub} strokeWidth={1.8} /><Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: T.text }} numberOfLines={1}>{a.name}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <View style={s.btnRow}>
              <Pressable onPress={() => openEditProject(selected)} style={[s.fillBtn, s.softBtn, { flexDirection: 'row', gap: 6 }]}><Pencil size={15} color={T.text} strokeWidth={1.8} /><Text style={[s.fillBtnText, { color: T.text }]}>Edit</Text></Pressable>
              <Pressable onPress={() => deleteProject(selected.id)} style={[s.fillBtn, { backgroundColor: '#fff1f2', flexDirection: 'row', gap: 6 }]}><Trash2 size={15} color={T.danger} strokeWidth={1.8} /><Text style={[s.fillBtnText, { color: T.danger }]}>Delete</Text></Pressable>
            </View>
          </ScrollView>
        )}
      </Sheet>
    </>
  );
}

const s = StyleSheet.create({
  fill: { width: '100%', height: '100%' },

  // cover + identity
  cover: { height: 114, backgroundColor: '#B5E8D0'},
  head: { paddingHorizontal: 18},
  idRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: -44 },
  avatarRing: { padding: 4, marginLeft: -4, borderRadius: 50, borderWidth: 2, borderColor: '#D0EDDD', backgroundColor: '#FFFFFF'},
  camBadge: { position: 'absolute', right: 2, bottom: 2, width: 28, height: 28, borderRadius: 14, backgroundColor: T.text, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  headActions: { flexDirection: 'row', gap: 8, paddingBottom: 6 },
  outlineBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'flex-start', height: 36, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, borderColor: T.border, backgroundColor: '#fff' },
  outlineBtnText: { fontSize: 14, fontWeight: '700', color: T.text },
  name: { marginTop: 10 , fontSize: 23, fontWeight: '800', letterSpacing: -0.6, color: '#0A3E2C'},
  joinedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  handle: { fontSize: 14, lineHeight: 18, color: T.sub },
  bio: { fontSize: 15, color: T.text, marginTop: 12 , lineHeight: 23},
  infoWrap: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6, marginTop: 12 },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
  infoText: { fontSize: 13, lineHeight: 18, color: T.sub, flexShrink: 1 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, rowGap: 4, paddingBottom: 19, marginTop: 15},
  statLabel: { fontSize: 14, color: T.sub },
  statNum: { fontSize: 14, fontWeight: '700', color: T.text },
  ratingInline: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  // tabs
  tabsSticky: { backgroundColor: '#fff' },
  tabs: { flexDirection: 'row', alignItems: 'stretch', backgroundColor: '#fff', borderBottomWidth: 1, borderTopWidth: 1, borderBottomColor: '#DCEEE3', borderTopColor: '#DCEEE3'},
  tab: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' },
  tabInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabText: { fontSize: 15, fontWeight: '600', color: T.sub },
  tabTextOn: { fontWeight: '700', color: T.text },
  tabCount: { fontSize: 13, color: T.sub },
  tabBar: { position: 'absolute', bottom: 0, width: 44, height: 3, borderRadius: 2, backgroundColor: 'transparent' },

  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, backgroundColor: '#F7FCF9', borderBottomColor: '#E3F0E7'},
  toolbarLabel: { fontSize: 13, color: T.sub },
  fillBtnSm: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 14, backgroundColor: T.brand , borderRadius: 13, height: 37},
  fillBtnSmText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // rows
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#E2EFE6', paddingVertical: 16},
  thumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: T.field, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  rowTitle: { flexShrink: 1, fontSize: 15, fontWeight: '700', color: T.text },
  rowSub: { fontSize: 13, color: T.sub, marginTop: 1 },
  price: { fontSize: 14, fontWeight: '700', color: T.brand, marginTop: 3 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },

  // reviews
  summary: { flexDirection: 'row', alignItems: 'center', gap: 20, paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: T.line },
  ratingCol: { alignItems: 'center', gap: 4, minWidth: 84 },
  bigRating: { fontSize: 30, fontWeight: '700', color: T.text, letterSpacing: -0.5 },
  dimLbl: { width: 88, fontSize: 13, color: T.sub },
  dimVal: { width: 26, textAlign: 'right', fontSize: 13, fontWeight: '700', color: T.text },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: T.line, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2, backgroundColor: T.brand },
  review: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.line },
  reviewText: { fontSize: 15, lineHeight: 21, color: T.text, marginTop: 6 },

  // empty
  empty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: T.text, marginTop: 12 },
  emptySub: { fontSize: 14, color: T.sub, marginTop: 4, textAlign: 'center' },
  fillBtn: { flex: 1, height: 44, paddingHorizontal: 22, borderRadius: 22, backgroundColor: T.brand, alignItems: 'center', justifyContent: 'center' },
  cta: { height: 44, paddingHorizontal: 24, borderRadius: 22, backgroundColor: T.brand, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  fillBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  softBtn: { backgroundColor: T.field },

  // sheets
  overlay: { flex: 1, backgroundColor: 'rgba(15,20,25,0.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28},
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: T.border, marginTop: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.line },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2 },
  sheetSub: { fontSize: 13, color: T.sub, marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 18 },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: T.sub, marginBottom: 8 },
  input: { height: 46, borderRadius: 12, backgroundColor: T.field, paddingHorizontal: 14, fontSize: 15, color: T.text },
  coverBox: { height: 160, borderRadius: 12, overflow: 'hidden', backgroundColor: T.field },
  coverX: { position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(15,20,25,0.7)', alignItems: 'center', justifyContent: 'center' },
  dropzone: { height: 100, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: T.border, alignItems: 'center', justifyContent: 'center', gap: 6 },
  dropText: { fontSize: 14, fontWeight: '600', color: T.sub },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, backgroundColor: T.strip, borderWidth: 1, borderColor: T.line, borderRadius: 12, paddingHorizontal: 12, height: 44 },

  detailImg: { width: '100%', height: 190, borderRadius: 12, marginBottom: 14, backgroundColor: T.field },
  body: { fontSize: 15, lineHeight: 21, color: T.text },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 14 },
  linkText: { fontSize: 15, fontWeight: '600', color: T.brand },
});