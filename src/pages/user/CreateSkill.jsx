// ═══════════════════════════════════════════════════════════════
//  MOBILE APP (Expo React Native), src/pages/user/CreateSkill.jsx
//  Replace the WHOLE content of your current CreateSkill.jsx with this.
//  Needs: expo-image-picker (already installed). No new packages.
// ═══════════════════════════════════════════════════════════════
import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import {
  View, Text, Image, Pressable, ScrollView, TextInput, Alert, ActivityIndicator,
  Keyboard, BackHandler, KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  BookOpen, Briefcase, Check, ChefHat, Clock, Code2, Dumbbell, ExternalLink, FileText, Film, Hammer,
  ImagePlus, Leaf, MessageCircle, Minus, Monitor, Music2, Palette, PenLine, PiggyBank, Plus, Rocket,
  Scissors, Sparkles, Video, Wrench, X,
} from 'lucide-react-native';
import supabase from '../../supabaseClient';

// ── type colors (X-style)
const T = { text: '#0f1419', sub: '#536471', line: '#eff3f4', green: '#047857', soft: '#f7f9f9' };

// min/max = allowed credits for a 1-hour session. 2-hr and 3-hr bands = x2 and x3.
const SKILL_CATEGORIES = [
  { name: 'Cooking & Baking',                       min: 8,  max: 15, icon: ChefHat,       iconColor: '#f97316', color: '#f97316' },
  { name: 'Gardening & Plant Care',                 min: 7,  max: 13, icon: Leaf,          iconColor: '#22c55e', color: '#22c55e' },
  { name: 'Home Repair & DIY',                      min: 7,  max: 14, icon: Hammer,        iconColor: '#ca8a04', color: '#a78bfa' },
  { name: 'Fitness & Sports',                       min: 11, max: 21, icon: Dumbbell,      iconColor: '#ef4444', color: '#ef4444' },
  { name: 'Beauty & Personal Care',                 min: 9,  max: 17, icon: Scissors,      iconColor: '#ec4899', color: '#ec4899' },
  { name: 'Computer, Phone & Electronics Help',     min: 7,  max: 14, icon: Wrench,        iconColor: '#3b82f6', color: '#64748b' },
  { name: 'School Subjects & Tutoring',             min: 8,  max: 15, icon: BookOpen,      iconColor: '#6366f1', color: '#0ea5e9' },
  { name: 'Writing & Editing',                      min: 11, max: 20, icon: PenLine,       iconColor: '#14b8a6', color: '#8b5cf6' },
  { name: 'Languages & Public Speaking',            min: 22, max: 42, icon: MessageCircle, iconColor: '#06b6d4', color: '#14b8a6' },
  { name: 'Music & Singing',                        min: 13, max: 24, icon: Music2,        iconColor: '#d946ef', color: '#f43f5e' },
  { name: 'Graphic Design & Digital Art',           min: 11, max: 21, icon: Palette,       iconColor: '#f43f5e', color: '#f59e0b' },
  { name: 'Video, Animation & AI Content Creation', min: 11, max: 21, icon: Film,          iconColor: '#f59e0b', color: '#dc2626' },
  { name: 'Business, Entrepreneurship & Marketing', min: 10, max: 19, icon: Briefcase,     iconColor: '#475569', color: '#0d9488' },
  { name: 'Finance, Investing & Trading',           min: 15, max: 27, icon: PiggyBank,     iconColor: '#059669', color: '#ca8a04' },
  { name: 'Website & App Design',                   min: 19, max: 35, icon: Monitor,       iconColor: '#0ea5e9', color: '#7c3aed' },
  { name: 'Coding & Programming',                   min: 15, max: 28, icon: Code2,         iconColor: '#65a30d', color: '#10b981' },
];

const DURATIONS = ['1 hr', '2 hrs', '3 hrs'];
const getHours = (d) => parseInt(d, 10) || 1;
const FORMATS = [
  ['Video Call', Video, 'Live 1-on-1'],
  ['Chat/Text', MessageCircle, 'Q&A via messaging'],
  ['Docs', FileText, 'PDFs & file guides'],
  ['All Formats', Sparkles, 'Mixed combination'],
];
const formatIcon = (f) => (FORMATS.find((x) => x[0] === f) || FORMATS[3])[1];
const STEP_LABELS = ['Category', 'Skill info', 'Session setup', 'Publish'];

// ── image upload (works on phones): base64 -> bytes, the method Supabase recommends for React Native
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
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

// returns { url } or { error } (never throws)
const uploadCover = async (userId, asset) => {
  try {
    const mime = (asset.mimeType || '').toLowerCase();
    const ext = MIME_EXT[mime] || 'jpg';
    const contentType = MIME_EXT[mime] ? mime : 'image/jpeg';
    const fileName = `${userId}-${Date.now()}.${ext}`;

    let bytes;
    if (asset.base64) bytes = base64ToArrayBuffer(asset.base64);
    else { const res = await fetch(asset.uri); bytes = await res.arrayBuffer(); }
    if (!bytes || bytes.byteLength === 0) throw new Error('The photo came out empty');

    const { error } = await supabase.storage.from('skill_covers').upload(fileName, bytes, { contentType });
    if (error) throw error;
    return { url: supabase.storage.from('skill_covers').getPublicUrl(fileName).data.publicUrl };
  } catch (error) {
    console.error('Cover upload failed:', error);
    return { error: error?.message || String(error) };
  }
};

// ────────────────── MAIN SCREEN
export default function CreateSkill() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const stepRef = useRef(1);

  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [keyboardUp, setKeyboardUp] = useState(false);
  const [profile, setProfile] = useState({ full_name: 'Me', avatar_url: '', booking_restricted_until: null });
  const [coverAsset, setCoverAsset] = useState(null); // picked photo (with base64)
  const [formData, setFormData] = useState({
    title: '', category: 'Coding & Programming', description: '', outcomes: '',
    format: 'Video Call', duration: '1 hr', creditCost: '15', portfolioUrl: '',
  });

  stepRef.current = step;

  // no native header (saves space); the close button lives inside the screen
  useLayoutEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: p } = await supabase.from('user_profiles')
            .select('full_name,avatar_url,booking_restricted_until').eq('id', user.id).single();
          if (p) setProfile(p);
        }
      } finally { setPageLoading(false); }
    })();
  }, []);

  // hide the bottom bar while the keyboard is open (more room to type)
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardUp(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardUp(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Android back button: previous step first
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stepRef.current > 1) { setStep((x) => x - 1); return true; }
      return false;
    });
    return () => sub.remove();
  }, []));

  useEffect(() => { scrollRef.current?.scrollTo({ y: 0, animated: true }); }, [step]);

  // ─── BOOKING RESTRICTION CHECKER (same rule as the web)
  const checkRestriction = () => {
    if (profile?.booking_restricted_until) {
      const restrictionEnd = new Date(profile.booking_restricted_until);
      if (restrictionEnd > new Date()) {
        const timeOptions = { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' };
        Alert.alert('Action blocked',
          `Your account is temporarily restricted from creating or booking sessions until ${restrictionEnd.toLocaleString(undefined, timeOptions)} due to a Trust & Safety violation.`);
        return true;
      }
    }
    return false;
  };

  const cat = SKILL_CATEGORIES.find((c) => c.name === formData.category) || SKILL_CATEGORIES[SKILL_CATEGORIES.length - 1];
  const CategoryIcon = cat.icon;
  const hours = getHours(formData.duration);
  const band = { min: cat.min * hours, max: cat.max * hours };
  const FormatIcon = formatIcon(formData.format);
  const setField = (key) => (value) => setFormData((p) => ({ ...p, [key]: value }));

  const handleCategorySelect = (name) => {
    const c = SKILL_CATEGORIES.find((x) => x.name === name);
    setFormData((p) => ({ ...p, category: name, creditCost: String(c.min * getHours(p.duration)) }));
  };

  const handleDuration = (d) => {
    setFormData((p) => {
      const h = getHours(d);
      const lo = cat.min * h, hi = cat.max * h;
      const v = Math.min(hi, Math.max(lo, parseInt(p.creditCost, 10) || lo));
      return { ...p, duration: d, creditCost: String(v) };
    });
  };

  const cost = parseInt(formData.creditCost, 10) || band.min;
  const setCost = (v) => setFormData((p) => ({ ...p, creditCost: String(Math.min(band.max, Math.max(band.min, v))) }));

  // ── cover image
  const pickCover = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.8, base64: true,
    });
    if (res.canceled) return;
    const asset = res.assets[0];
    const bytes = asset.fileSize || (asset.base64 ? asset.base64.length * 0.75 : 0);
    if (bytes > 5e6) { Alert.alert('Max 5MB'); return; }
    setCoverAsset(asset);
  };

  // ── steps
  const handleNext = () => {
    if (checkRestriction()) return; // guard: block when restricted
    if (step === 2 && (!formData.title.trim() || !formData.description.trim() || !formData.outcomes.trim())) {
      Alert.alert('Fill in all required fields.');
      return;
    }
    Keyboard.dismiss();
    setStep((x) => x + 1);
  };
  const handlePrev = () => { Keyboard.dismiss(); setStep((x) => x - 1); };

  const handleClose = () => {
    const dirty = formData.title.trim() || formData.description.trim() || formData.outcomes.trim() || coverAsset;
    if (!dirty) { navigation.goBack(); return; }
    Alert.alert('Discard this listing?', 'Your changes will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
    ]);
  };

  const askPublishWithoutCover = (reason) =>
    new Promise((resolve) => {
      Alert.alert('Cover upload failed', `${reason}\n\nPublish without a cover image?`, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Publish without cover', onPress: () => resolve(true) },
      ], { cancelable: true, onDismiss: () => resolve(false) });
    });

  const handlePublish = async () => {
    if (checkRestriction()) return; // guard check again before publishing
    const costNum = parseInt(formData.creditCost, 10);
    if (isNaN(costNum) || costNum < band.min || costNum > band.max) {
      Alert.alert(`Credit cost must be between ${band.min} and ${band.max} credits for a ${formData.duration} ${formData.category} session.`);
      return;
    }
    setIsSubmitting(true);
    try {
      const { data: { user }, error: ue } = await supabase.auth.getUser();
      if (ue || !user) { Alert.alert('Auth error.'); return; }

      let imgUrl = null;
      if (coverAsset) {
        const { url, error } = await uploadCover(user.id, coverAsset);
        if (url) imgUrl = url;
        else if (!(await askPublishWithoutCover(error || 'Please try again.'))) return;
      }

      const { error: dbe } = await supabase.from('skills').insert([{
        instructor_id: user.id, title: formData.title, category: formData.category,
        description: formData.description, outcomes: formData.outcomes, format: formData.format,
        duration: formData.duration, credit_cost: parseInt(formData.creditCost, 10),
        portfolio_url: formData.portfolioUrl || null, cover_image_url: imgUrl,
        status: 'pending', // goes to Moderator approval first
      }]);
      if (dbe) throw dbe;

      Alert.alert('Skill submitted', 'It is now In Review and waiting for Moderator approval.', [
        { text: 'OK', onPress: () => navigation.replace('MyListings') },
      ]);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally { setIsSubmitting(false); }
  };

  if (pageLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color={T.green} />
      </View>
    );
  }

  const reviewRows = [
    { label: 'Category', value: formData.category },
    { label: 'Title', value: formData.title || '—' },
    { label: 'Format', value: formData.format },
    { label: 'Duration', value: formData.duration },
    { label: 'Credit cost', value: `${formData.creditCost} credits`, sub: `${band.min}–${band.max} range` },
    { label: 'Portfolio', value: formData.portfolioUrl || 'Not provided' },
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#fff' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* top: close + step + progress (no page title) */}
      <View style={[s.top, { paddingTop: insets.top + 6 }]}>
        <View style={s.topRow}>
          <Pressable onPress={handleClose} hitSlop={10} style={s.closeBtn}><X size={24} color={T.text} /></Pressable>
          <Text style={s.stepText}>Step {step} of 4 · {STEP_LABELS[step - 1]}</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={s.progress}>
          {[1, 2, 3, 4].map((n) => (
            <Pressable key={n} onPress={() => step > n && setStep(n)} hitSlop={{ top: 10, bottom: 10 }} style={{ flex: 1 }}>
              <View style={[s.seg, n <= step && { backgroundColor: T.green }]} />
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ───────────── STEP 1: CATEGORY */}
        {step === 1 && (
          <View>
            <View style={s.head}>
              <Text style={s.h2}>Pick a category</Text>
              <Text style={s.detail}>Sets your credit price range per hour.</Text>
            </View>
            {SKILL_CATEGORIES.map((c) => {
              const sel = formData.category === c.name;
              const Icon = c.icon;
              return (
                <Pressable key={c.name} onPress={() => handleCategorySelect(c.name)}
                  style={[s.catRow, sel && { backgroundColor: c.iconColor + '12' }]}>
                  <View style={[s.catIcon, { backgroundColor: c.iconColor + '1a' }]}>
                    <Icon size={22} color={c.iconColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemName} numberOfLines={2}>{c.name}</Text>
                    <Text style={s.detail}>{c.min}–{c.max} cr/hr</Text>
                  </View>
                  <View style={[s.radio, sel && { backgroundColor: T.green, borderColor: T.green }]}>
                    {sel && <Check size={14} color="#fff" />}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* ───────────── STEP 2: SKILL INFO */}
        {step === 2 && (
          <View>
            <View style={s.catLine}>
              <CategoryIcon size={18} color={cat.iconColor} />
              <Text style={[s.detail, { flex: 1 }]} numberOfLines={1}>{formData.category} · {cat.min}–{cat.max} cr/hr</Text>
              <Pressable onPress={() => setStep(1)} hitSlop={8}><Text style={s.link}>Change</Text></Pressable>
            </View>

            <View style={s.section}>
              <Text style={s.label}>Cover image</Text>
              {coverAsset ? (
                <View style={s.cover}>
                  <Image source={{ uri: coverAsset.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  <Pressable onPress={() => setCoverAsset(null)} style={s.coverX} hitSlop={8}><X size={16} color="#fff" /></Pressable>
                </View>
              ) : (
                <Pressable onPress={pickCover} style={[s.coverEmpty, { borderColor: cat.color + '66', backgroundColor: cat.color + '0d' }]}>
                  <ImagePlus size={28} color={cat.iconColor} />
                  <Text style={[s.itemName, { color: cat.iconColor, marginTop: 6 }]}>Tap to upload cover</Text>
                  <Text style={s.detail}>Max 5MB</Text>
                </Pressable>
              )}
            </View>

            <View style={s.section}>
              <Text style={s.label}>Skill title <Text style={{ color: '#f43f5e' }}>*</Text></Text>
              <TextInput style={s.input} value={formData.title} onChangeText={setField('title')}
                placeholder="e.g. Master React & Tailwind" placeholderTextColor="#9ca3af" />
            </View>

            <View style={s.section}>
              <Text style={s.label}>Portfolio link <Text style={s.opt}>(optional)</Text></Text>
              <View style={s.inputIconWrap}>
                <ExternalLink size={17} color="#9ca3af" />
                <TextInput style={s.inputBare} value={formData.portfolioUrl} onChangeText={setField('portfolioUrl')}
                  placeholder="https://github.com/..." placeholderTextColor="#9ca3af"
                  autoCapitalize="none" keyboardType="url" autoCorrect={false} />
              </View>
            </View>

            <View style={s.section}>
              <Text style={s.label}>Description <Text style={{ color: '#f43f5e' }}>*</Text></Text>
              <TextInput style={[s.input, s.textarea]} value={formData.description} onChangeText={setField('description')}
                placeholder="What is this session about?" placeholderTextColor="#9ca3af" multiline textAlignVertical="top" />
            </View>

            <View style={s.section}>
              <Text style={s.label}>Learner outcomes <Text style={{ color: '#f43f5e' }}>*</Text></Text>
              <TextInput style={[s.input, s.textarea, { height: 88 }]} value={formData.outcomes} onChangeText={setField('outcomes')}
                placeholder="What will learners walk away with?" placeholderTextColor="#9ca3af" multiline textAlignVertical="top" />
            </View>
          </View>
        )}

        {/* ───────────── STEP 3: SESSION SETUP */}
        {step === 3 && (
          <View>
            <View style={s.section}>
              <Text style={s.label}>Teaching format</Text>
              <View style={s.grid}>
                {FORMATS.map(([f, Icon, desc]) => {
                  const sel = formData.format === f;
                  return (
                    <Pressable key={f} onPress={() => setField('format')(f)}
                      style={[s.fmtCard, sel && { borderColor: T.green, backgroundColor: '#ecfdf5' }]}>
                      <Icon size={24} color={sel ? T.green : T.sub} />
                      <Text style={[s.itemName, { marginTop: 8 }]}>{f}</Text>
                      <Text style={s.detail}>{desc}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={s.section}>
              <Text style={s.label}>Duration</Text>
              <View style={s.seg3}>
                {DURATIONS.map((d) => {
                  const sel = formData.duration === d;
                  return (
                    <Pressable key={d} onPress={() => handleDuration(d)} style={[s.seg3Btn, sel && s.seg3On]}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: sel ? T.green : T.sub }}>{d}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={s.section}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Text style={s.label}>Credit cost</Text>
                <Text style={s.detail}>{band.min}–{band.max} cr range</Text>
              </View>
              <View style={s.stepper}>
                <Pressable onPress={() => setCost(cost - 1)} style={s.stepBtn} hitSlop={6}><Minus size={22} color={T.text} /></Pressable>
                <View style={{ alignItems: 'center', minWidth: 110 }}>
                  <Text style={s.costNum}>{cost}<Text style={s.costUnit}> cr</Text></Text>
                </View>
                <Pressable onPress={() => setCost(cost + 1)} style={s.stepBtn} hitSlop={6}><Plus size={22} color={T.text} /></Pressable>
              </View>
              <View style={s.presets}>
                {[['Min', band.min], ['Mid', Math.round((band.min + band.max) / 2)], ['Max', band.max]].map(([name, v]) => (
                  <Pressable key={name} onPress={() => setCost(v)} style={[s.preset, cost === v && { backgroundColor: '#d1fae5' }]}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: cost === v ? '#065f46' : T.sub }}>{name} {v}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* ───────────── STEP 4: REVIEW + PUBLISH */}
        {step === 4 && (
          <View>
            <View style={s.head}>
              <Text style={s.h2}>Review your listing</Text>
              <Text style={s.detail}>It will be reviewed by our moderation team shortly.</Text>
            </View>

            {/* how it will look */}
            <View style={s.preview}>
              <View style={[s.previewCover, { backgroundColor: coverAsset ? '#e5e7eb' : cat.color }]}>
                {coverAsset
                  ? <Image source={{ uri: coverAsset.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  : <CategoryIcon size={46} color="rgba(255,255,255,0.85)" />}
                <View style={s.priceBadge}><Text style={s.priceText}>{formData.creditCost} cr</Text></View>
              </View>
              <View style={{ padding: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <View style={s.miniAvatar}>
                    {profile.avatar_url
                      ? <Image source={{ uri: profile.avatar_url }} style={{ width: '100%', height: '100%' }} />
                      : <Text style={{ fontSize: 12, fontWeight: '700', color: '#065f46' }}>{profile.full_name?.charAt(0) || 'U'}</Text>}
                  </View>
                  <Text style={s.detail} numberOfLines={1}>{profile.full_name}</Text>
                </View>
                <Text style={s.itemName} numberOfLines={2}>{formData.title || 'Skill title'}</Text>
                <Text style={[s.detail, { marginTop: 4 }]} numberOfLines={2}>{formData.description}</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <View style={s.tag}><FormatIcon size={14} color={T.sub} /><Text style={s.tagText}>{formData.format}</Text></View>
                  <View style={s.tag}><Clock size={14} color={T.sub} /><Text style={s.tagText}>{formData.duration}</Text></View>
                </View>
              </View>
            </View>

            {/* summary */}
            <View style={{ marginTop: 6 }}>
              {reviewRows.map((r) => (
                <View key={r.label} style={s.reviewRow}>
                  <View>
                    <Text style={s.detail}>{r.label}</Text>
                    {!!r.sub && <Text style={[s.detail, { color: '#8b98a5' }]}>{r.sub}</Text>}
                  </View>
                  <Text style={s.reviewVal} numberOfLines={1}>{r.value}</Text>
                </View>
              ))}
            </View>

            <View style={s.note}>
              <Sparkles size={20} color={T.green} />
              <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: '#065f46' }}>Looking great! Ready to publish?</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* bottom bar (hidden while the keyboard is open) */}
      {!keyboardUp && (
        <View style={[s.bottom, { paddingBottom: insets.bottom + 10 }]}>
          {step > 1 && (
            <Pressable onPress={handlePrev} style={s.backBtn}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: T.text }}>Back</Text>
            </Pressable>
          )}
          {step < 4 ? (
            <Pressable onPress={handleNext} style={s.nextBtn}>
              <Text style={s.nextText}>Next</Text>
            </Pressable>
          ) : (
            <Pressable onPress={handlePublish} disabled={isSubmitting} style={[s.nextBtn, isSubmitting && { backgroundColor: '#9ca3af' }]}>
              {isSubmitting
                ? <><ActivityIndicator color="#fff" size="small" /><Text style={s.nextText}>  Publishing…</Text></>
                : <><Rocket size={18} color="#fff" /><Text style={s.nextText}>  Submit for review</Text></>}
            </Pressable>
          )}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  // top
  top: { backgroundColor: '#fff', paddingHorizontal: 16, paddingBottom: 6 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeBtn: { width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
  stepText: { fontSize: 15, fontWeight: '600', color: T.text },
  progress: { flexDirection: 'row', gap: 6, marginTop: 2 },
  seg: { height: 4, borderRadius: 2, backgroundColor: T.line },

  // text
  head: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  h2: { fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2 },
  itemName: { fontSize: 15, fontWeight: '600', color: T.text },
  detail: { fontSize: 13, color: T.sub, lineHeight: 18 },
  link: { fontSize: 13, fontWeight: '700', color: T.green },
  label: { fontSize: 13, fontWeight: '600', color: T.sub, marginBottom: 8 },
  opt: { fontWeight: '400', color: '#8b98a5' },

  // category list
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.line },
  catIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#cfd9de', alignItems: 'center', justifyContent: 'center' },
  catLine: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.line },

  // forms
  section: { paddingHorizontal: 16, paddingTop: 16 },
  input: { backgroundColor: T.soft, borderRadius: 12, borderWidth: 1, borderColor: T.line, paddingHorizontal: 14, height: 48, fontSize: 15, color: T.text },
  inputIconWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: T.soft, borderRadius: 12, borderWidth: 1, borderColor: T.line, paddingHorizontal: 14, height: 48 },
  inputBare: { flex: 1, fontSize: 15, color: T.text, paddingVertical: 0 },
  textarea: { height: 104, paddingTop: 12, paddingBottom: 12 },
  cover: { height: 190, borderRadius: 12, overflow: 'hidden', backgroundColor: '#e5e7eb' },
  coverX: { position: 'absolute', top: 10, right: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  coverEmpty: { height: 150, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },

  // step 3
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fmtCard: { width: '48.2%', borderRadius: 12, borderWidth: 1.5, borderColor: T.line, backgroundColor: '#fff', padding: 14 },
  seg3: { flexDirection: 'row', backgroundColor: '#f0f2f5', borderRadius: 12, padding: 4 },
  seg3Btn: { flex: 1, height: 42, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  seg3On: { backgroundColor: '#fff' },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, marginTop: 10 },
  stepBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#f0f2f5', alignItems: 'center', justifyContent: 'center' },
  costNum: { fontSize: 44, fontWeight: '800', color: T.text, letterSpacing: -1 },
  costUnit: { fontSize: 18, fontWeight: '600', color: T.sub },
  presets: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 12 },
  preset: { height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: '#f0f2f5', alignItems: 'center', justifyContent: 'center' },

  // step 4
  preview: { marginHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: T.line, overflow: 'hidden' },
  previewCover: { height: 150, alignItems: 'center', justifyContent: 'center' },
  priceBadge: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  priceText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  miniAvatar: { width: 24, height: 24, borderRadius: 12, overflow: 'hidden', backgroundColor: '#d1fae5', alignItems: 'center', justifyContent: 'center' },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 10, borderRadius: 15, backgroundColor: '#f0f2f5' },
  tagText: { fontSize: 13, fontWeight: '600', color: T.sub },
  reviewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.line },
  reviewVal: { flex: 1, textAlign: 'right', fontSize: 15, fontWeight: '600', color: T.text },
  note: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 18, backgroundColor: '#ecfdf5', borderRadius: 12, padding: 14 },

  // bottom bar
  bottom: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: T.line, backgroundColor: '#fff' },
  backBtn: { flex: 1, height: 48, borderRadius: 24, borderWidth: 1, borderColor: '#cfd9de', alignItems: 'center', justifyContent: 'center' },
  nextBtn: { flex: 2, height: 48, borderRadius: 24, backgroundColor: T.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  nextText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});