import UserScreenSkeleton from '../../components/premium/UserScreenSkeleton';
import { Reveal, PressScale } from '../../components/premium/PremiumVisual';
import { Alert } from '../../components/SkillCreditAlert';
// ═══════════════════════════════════════════════════════════════
//  MOBILE APP (Expo React Native), src/pages/user/EditSkill.jsx
//  Replace the WHOLE content of your current EditSkill.jsx with this.
//  Needs: expo-image-picker (already installed). No new packages.
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useLayoutEffect, useCallback } from 'react';
import {
  BackHandler, Platform, StyleSheet
} from 'react-native';
import { ActivityIndicator, View, Text, Image, Pressable, ScrollView, TextInput, KeyboardAvoidingView } from '../../components/premium/PremiumThemePrimitives';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { AlertCircle, ImagePlus, Lock, Minus, Plus, ShieldAlert, Unlock, X } from '../../components/premium/PremiumThemeIcons';
import supabase from '../../supabaseClient';

// ── type colors (X-style)
const T = { text: '#0f1419', sub: '#536471', line: '#eff3f4', green: '#047857', soft: '#f7f9f9' };

// min/max = allowed credits for a 1-hour session. 2-hr and 3-hr bands = x2 and x3.
const SKILL_CATEGORIES = [
  { name: 'Cooking & Baking',                       min: 8,  max: 15 },
  { name: 'Gardening & Plant Care',                 min: 7,  max: 13 },
  { name: 'Home Repair & DIY',                      min: 7,  max: 14 },
  { name: 'Fitness & Sports',                       min: 11, max: 21 },
  { name: 'Beauty & Personal Care',                 min: 9,  max: 17 },
  { name: 'Computer, Phone & Electronics Help',     min: 7,  max: 14 },
  { name: 'School Subjects & Tutoring',             min: 8,  max: 15 },
  { name: 'Writing & Editing',                      min: 11, max: 20 },
  { name: 'Languages & Public Speaking',            min: 22, max: 42 },
  { name: 'Music & Singing',                        min: 13, max: 24 },
  { name: 'Graphic Design & Digital Art',           min: 11, max: 21 },
  { name: 'Video, Animation & AI Content Creation', min: 11, max: 21 },
  { name: 'Business, Entrepreneurship & Marketing', min: 10, max: 19 },
  { name: 'Finance, Investing & Trading',           min: 15, max: 27 },
  { name: 'Website & App Design',                   min: 19, max: 35 },
  { name: 'Coding & Programming',                   min: 15, max: 28 },
];

// Old category names still stored on existing listings -> their new category (so the right band is used)
const LEGACY_CATEGORY_MAP = {
  'Gardening & Farming': 'Gardening & Plant Care',
  'Home & DIY': 'Home Repair & DIY',
  'Health & Fitness': 'Fitness & Sports',
  'Beauty & Grooming': 'Beauty & Personal Care',
  'Electronics, Appliance & Basic Repair': 'Computer, Phone & Electronics Help',
  'Electronics & Repair': 'Computer, Phone & Electronics Help',
  'School & Tutoring': 'School Subjects & Tutoring',
  'Writing & Content': 'Writing & Editing',
  'Languages & Speaking': 'Languages & Public Speaking',
  'Singing & Instruments': 'Music & Singing',
  'Art & Graphic Design': 'Graphic Design & Digital Art',
  'Video & Animation': 'Video, Animation & AI Content Creation',
  'Business & Freelance': 'Business, Entrepreneurship & Marketing',
  'Financial Literacy & Money Management': 'Finance, Investing & Trading',
  'Financial Literacy': 'Finance, Investing & Trading',
  'UI/UX Design': 'Website & App Design',
  'Coding & Tech': 'Coding & Programming',
};

const DURATIONS = ['1 hr', '2 hrs', '3 hrs'];
const FORMATS = [
  ['Video Call', 'Video Call'],
  ['Chat/Text', 'Chat/Text'],
  ['Voice Call', 'Voice Call'],
  ['Docs', 'Docs / Review'],
  ['All Formats', 'All Formats'],
];
const getHours = (d) => parseInt(d, 10) || 1;
const findCat = (name) =>
  SKILL_CATEGORIES.find((c) => c.name === name) ||
  SKILL_CATEGORIES.find((c) => c.name === LEGACY_CATEGORY_MAP[name]) ||
  SKILL_CATEGORIES[0];

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
const uploadCover = async (userId, skillId, asset) => {
  try {
    const mime = (asset.mimeType || '').toLowerCase();
    const ext = MIME_EXT[mime] || 'jpg';
    const contentType = MIME_EXT[mime] ? mime : 'image/jpeg';
    const filePath = `${userId}/cover_${skillId}_${Date.now()}.${ext}`;

    let bytes;
    if (asset.base64) bytes = base64ToArrayBuffer(asset.base64);
    else { const res = await fetch(asset.uri); bytes = await res.arrayBuffer(); }
    if (!bytes || bytes.byteLength === 0) throw new Error('The photo came out empty');

    const { error } = await supabase.storage.from('skill_covers').upload(filePath, bytes, { contentType, upsert: true });
    if (error) throw error;
    return { url: supabase.storage.from('skill_covers').getPublicUrl(filePath).data.publicUrl };
  } catch (error) {
    console.error('Cover upload failed:', error);
    return { error: error?.message || String(error) };
  }
};

// ────────────────── MAIN SCREEN
export default function EditSkill() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { id } = route.params;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasActiveSessions, setHasActiveSessions] = useState(false);

  const [skill, setSkill] = useState(null);
  const [newImage, setNewImage] = useState(null); // picked photo (with base64)
  const [previewUrl, setPreviewUrl] = useState('');

  // for the "send back to pending" rule
  const [initialPortfolio, setInitialPortfolio] = useState('');
  const [initialImage, setInitialImage] = useState('');
  const [original, setOriginal] = useState(null);

  // no native header (saves space); close + Save live inside the screen
  useLayoutEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);

  useEffect(() => {
    const fetchSkillData = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: skillData, error: skillError } = await supabase
        .from('skills').select('*').eq('id', id).eq('instructor_id', user.id).single();

      if (skillError || !skillData) {
        Alert.alert('Skill not found or unauthorized.');
        navigation.replace('MyListings');
        return;
      }

      setSkill(skillData);
      setPreviewUrl(skillData.cover_image_url || '');
      setInitialPortfolio(skillData.portfolio_url || '');
      setInitialImage(skillData.cover_image_url || '');
      setOriginal({
        description: skillData.description || '', outcomes: skillData.outcomes || '',
        portfolio_url: skillData.portfolio_url || '', cover: skillData.cover_image_url || '',
        credit_cost: String(skillData.credit_cost ?? ''), format: skillData.format || '', duration: skillData.duration || '',
      });

      const { data: activeSessions } = await supabase
        .from('sessions').select('id').eq('skill_id', id)
        .in('status', ['pending', 'active', 'upcoming', 'confirmed']).limit(1);
      if (activeSessions && activeSessions.length > 0) setHasActiveSessions(true);

      setLoading(false);
    };
    fetchSkillData();
  }, [id]);

  const isDirty = !!skill && !!original && (
    !!newImage ||
    (skill.description || '') !== original.description ||
    (skill.outcomes || '') !== original.outcomes ||
    (skill.portfolio_url || '') !== original.portfolio_url ||
    (previewUrl || '') !== original.cover ||
    String(skill.credit_cost ?? '') !== original.credit_cost ||
    (skill.format || '') !== original.format ||
    (skill.duration || '') !== original.duration
  );

  const handleClose = useCallback(() => {
    if (!isDirty || saving) { navigation.goBack(); return; }
    Alert.alert('Discard changes?', 'Your edits will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
    ]);
  }, [isDirty, saving, navigation]);

  // Android back button: ask before losing edits
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isDirty && !saving) { handleClose(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [isDirty, saving, handleClose]));

  const setField = (name) => (value) => setSkill((prev) => ({ ...prev, [name]: value }));

  const handleDuration = (value) => {
    if (hasActiveSessions || !DURATIONS.includes(value)) return;
    setSkill((prev) => {
      const c = findCat(prev.category);
      const h = getHours(value);
      const lo = c.min * h, hi = c.max * h;
      const v = Math.min(hi, Math.max(lo, parseInt(prev.credit_cost, 10) || lo));
      return { ...prev, duration: value, credit_cost: v };
    });
  };

  const pickCover = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.8, base64: true,
    });
    if (res.canceled) return;
    const asset = res.assets[0];
    const bytes = asset.fileSize || (asset.base64 ? asset.base64.length * 0.75 : 0);
    if (bytes > 5 * 1024 * 1024) { Alert.alert('File size exceeds 5MB limit.'); return; }
    setNewImage(asset);
    setPreviewUrl(asset.uri);
  };

  const handleRemoveImage = () => {
    setNewImage(null);
    setPreviewUrl('');
    setSkill((prev) => ({ ...prev, cover_image_url: null }));
  };

  const handleSave = async () => {
    if (!skill.description.trim() || !skill.outcomes.trim()) {
      Alert.alert('Description and Outcomes are required.');
      return;
    }

    if (!hasActiveSessions) {
      if (!DURATIONS.includes(skill.duration)) {
        Alert.alert('Please choose a session duration (1, 2, or 3 hrs).');
        return;
      }
      const c = findCat(skill.category);
      const h = getHours(skill.duration);
      const cost = parseInt(skill.credit_cost, 10);
      if (isNaN(cost) || cost < c.min * h || cost > c.max * h) {
        Alert.alert(`Credit cost must be between ${c.min * h} and ${c.max * h} credits for a ${skill.duration} session in this category.`);
        return;
      }
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let finalImageUrl = skill.cover_image_url;

      if (newImage) {
        const up = await uploadCover(user.id, id, newImage);
        if (up.error) throw new Error(`Cover upload failed: ${up.error}`);
        finalImageUrl = `${up.url}?t=${Date.now()}`;
      } else if (!previewUrl) {
        finalImageUrl = null;
      }

      const updatePayload = {
        description: skill.description,
        outcomes: skill.outcomes,
        portfolio_url: skill.portfolio_url,
        cover_image_url: finalImageUrl,
      };

      if (!hasActiveSessions) {
        updatePayload.credit_cost = parseInt(skill.credit_cost, 10);
        updatePayload.format = skill.format;
        updatePayload.duration = skill.duration;
      }

      // re-review only when the portfolio link or cover image really changed
      // (empty and null are treated the same, so editing text alone never sends it back to pending)
      const needsReview =
        (skill.portfolio_url || '') !== (initialPortfolio || '') ||
        (finalImageUrl || '') !== (initialImage || '');

      if (needsReview) {
        updatePayload.status = 'pending';
        updatePayload.assigned_to = null;
        updatePayload.rejection_reason = null;
      }

      const { error: updateError } = await supabase.from('skills').update(updatePayload).eq('id', id);
      if (updateError) throw updateError;

      Alert.alert(
        needsReview ? 'Listing updated' : 'Saved',
        needsReview
          ? 'Because you changed your Portfolio Link or Cover Image, your listing has been sent back to pending status for moderator approval.'
          : 'Listing updated successfully!',
        [{ text: 'OK', onPress: () => navigation.replace('MyListings') }]
      );
    } catch (error) {
      console.error('Error updating skill:', error);
      Alert.alert('Failed to update listing', error?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !skill) {
    return (
      <UserScreenSkeleton type="editSkill" />
    );
  }

  const activeCat = findCat(skill.category);
  const hours = DURATIONS.includes(skill.duration) ? getHours(skill.duration) : 1;
  const band = { min: activeCat.min * hours, max: activeCat.max * hours };
  const cost = parseInt(skill.credit_cost, 10) || band.min;
  const setCost = (v) => {
    if (hasActiveSessions) return;
    setSkill((prev) => ({ ...prev, credit_cost: Math.min(band.max, Math.max(band.min, v)) }));
  };
  const durOptions = DURATIONS.includes(skill.duration) ? DURATIONS : [skill.duration, ...DURATIONS];
  const locked = hasActiveSessions;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#fff' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* top: close + Save (no page title) */}
      <View style={[s.top, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={handleClose} hitSlop={10} style={s.closeBtn}><X size={24} color={T.text} /></Pressable>
        <Text style={s.topTitle} numberOfLines={1}>{skill.title}</Text>
        <PressScale onPress={handleSave} disabled={saving} style={[s.saveBtn, saving && { opacity: 0.6 }]}>
          {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.saveText}>Save</Text>}
        </PressScale>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* integrity rules, one small callout */}
        <Reveal delay={90}><View style={s.callout}>
          <ShieldAlert size={18} color="#2563eb" style={{ marginTop: 1 }} />
          <Text style={s.calloutText}>
            Title and category are locked to prevent bait-and-switch.{' '}
            {locked
              ? <Text style={{ fontWeight: '700', color: '#b45309' }}>Pricing and schedule are locked while you have active or pending sessions.</Text>
              : <Text style={{ color: '#047857' }}>Pricing and schedule can be edited now (no active sessions).</Text>}
          </Text>
        </View></Reveal>

        {/* locked identity */}
        <View style={s.group}>
          <View style={s.lockedRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.detail}>Title</Text>
              <Text style={s.lockedValue} numberOfLines={2}>{skill.title}</Text>
            </View>
            <Lock size={16} color="#a1abb3" />
          </View>
          <View style={[s.lockedRow, { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.detail}>Category</Text>
              <Text style={s.lockedValue} numberOfLines={2}>{skill.category}</Text>
            </View>
            <Lock size={16} color="#a1abb3" />
          </View>
        </View>

        {/* contract details */}
        <View style={s.sectionHead}>
          {locked ? <Lock size={16} color="#f59e0b" /> : <Unlock size={16} color="#10b981" />}
          <Text style={s.h2}>Pricing & session</Text>
          {locked && <Text style={s.lockedTag}>Locked</Text>}
        </View>

        <View style={[s.section, locked && { opacity: 0.55 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Text style={s.label}>Credit cost</Text>
            <Text style={s.detail}>{band.min}–{band.max} cr range</Text>
          </View>
          <View style={s.stepper}>
            <Pressable onPress={() => setCost(cost - 1)} disabled={locked} style={s.stepBtn} hitSlop={6}><Minus size={22} color={T.text} /></Pressable>
            <View style={{ alignItems: 'center', minWidth: 110 }}>
              <Text style={s.costNum}>{cost}<Text style={s.costUnit}> cr</Text></Text>
            </View>
            <Pressable onPress={() => setCost(cost + 1)} disabled={locked} style={s.stepBtn} hitSlop={6}><Plus size={22} color={T.text} /></Pressable>
          </View>
          <View style={s.presets}>
            {[['Min', band.min], ['Mid', Math.round((band.min + band.max) / 2)], ['Max', band.max]].map(([name, v]) => (
              <Pressable key={name} onPress={() => setCost(v)} disabled={locked} style={[s.preset, cost === v && { backgroundColor: '#d1fae5' }]}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: cost === v ? '#065f46' : T.sub }}>{name} {v}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={[s.section, locked && { opacity: 0.55 }]}>
          <Text style={s.label}>Duration</Text>
          <View style={s.segRow}>
            {durOptions.map((d) => {
              const sel = skill.duration === d;
              const old = !DURATIONS.includes(d);
              return (
                <Pressable key={d} onPress={() => handleDuration(d)} disabled={locked}
                  style={[s.segBtn, sel && s.segOn]}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: sel ? T.green : T.sub }}>{d}{old ? ' (old)' : ''}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[s.section, locked && { opacity: 0.55 }]}>
          <Text style={s.label}>Format</Text>
          <View style={s.chipWrap}>
            {FORMATS.map(([value, label]) => {
              const sel = skill.format === value;
              return (
                <Pressable key={value} onPress={() => !locked && setField('format')(value)} disabled={locked}
                  style={[s.chip, sel && { backgroundColor: T.green }]}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: sel ? '#fff' : T.sub }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* editable content */}
        <View style={[s.sectionHead, { marginTop: 8 }]}>
          <Text style={s.h2}>Content</Text>
        </View>

        <View style={s.warn}>
          <AlertCircle size={18} color="#d97706" style={{ marginTop: 1 }} />
          <Text style={s.warnText}>
            Edit the description and outcomes freely. Changing the <Text style={{ fontWeight: '700' }}>portfolio link</Text> or{' '}
            <Text style={{ fontWeight: '700' }}>cover image</Text> sends this listing back to Pending for moderator approval.
          </Text>
        </View>

        <View style={s.section}>
          <Text style={s.label}>Description</Text>
          <TextInput style={[s.input, s.textarea]} value={skill.description} onChangeText={setField('description')}
            placeholder="Describe your skill..." placeholderTextColor="#9ca3af" multiline textAlignVertical="top" />
        </View>

        <View style={s.section}>
          <Text style={s.label}>Outcomes (what they will learn)</Text>
          <TextInput style={[s.input, s.textarea, { height: 96 }]} value={skill.outcomes} onChangeText={setField('outcomes')}
            placeholder="E.g., Students will be able to build a React app..." placeholderTextColor="#9ca3af" multiline textAlignVertical="top" />
        </View>

        <View style={s.section}>
          <Text style={s.label}>Portfolio / proof link <Text style={s.opt}>(optional)</Text></Text>
          <TextInput style={s.input} value={skill.portfolio_url || ''} onChangeText={setField('portfolio_url')}
            placeholder="https://your-portfolio.com" placeholderTextColor="#9ca3af"
            autoCapitalize="none" keyboardType="url" autoCorrect={false} />
        </View>

        <View style={s.section}>
          <Text style={s.label}>Cover image <Text style={s.opt}>(optional)</Text></Text>
          {previewUrl ? (
            <View>
              <View style={s.cover}>
                <Image source={{ uri: previewUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              </View>
              <View style={s.coverActions}>
                <Pressable onPress={pickCover} style={s.coverBtn}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: T.text }}>Change</Text>
                </Pressable>
                <Pressable onPress={handleRemoveImage} style={[s.coverBtn, { backgroundColor: '#fff1f2' }]}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#e11d48' }}>Remove</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <PressScale onPress={pickCover} style={s.coverEmpty}>
              <ImagePlus size={28} color="#8b98a5" />
              <Text style={[s.itemName, { marginTop: 6 }]}>Tap to upload image</Text>
              <Text style={s.detail}>JPEG, PNG, WEBP (Max 5MB)</Text>
            </PressScale>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  // top
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, borderBottomWidth: 1, backgroundColor: '#F8FCF9', borderBottomColor: '#D8EDE1', paddingBottom: 12},
  closeBtn: { width: 36, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
  topTitle: { flex: 1, fontWeight: '800', fontSize: 17, color: '#0A4B38'},
  saveBtn: { minWidth: 72, paddingHorizontal: 18, backgroundColor: T.green, alignItems: 'center', justifyContent: 'center' , borderRadius: 14, height: 40, shadowColor: '#047857', shadowOpacity: 0.13, shadowRadius: 7, shadowOffset: {width:0,height:3}, elevation: 2},
  saveText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // text
  h2: { fontSize: 21, fontWeight: '800', color: '#0D3023', letterSpacing: -0.5},
  itemName: { fontSize: 15, fontWeight: '600', color: T.text },
  detail: { fontSize: 13, color: T.sub, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '600', color: T.sub, marginBottom: 8 },
  opt: { fontWeight: '400', color: '#8b98a5' },

  // callouts
  callout: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 14, padding: 12 , borderRadius: 18, backgroundColor: '#EEF8F4'},
  calloutText: { flex: 1, fontSize: 13, color: '#1e40af', lineHeight: 19 },
  warn: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 2, backgroundColor: '#fffbeb', borderRadius: 12, padding: 12 },
  warnText: { flex: 1, fontSize: 13, color: '#92400e', lineHeight: 19 },

  // locked rows
  group: { marginTop: 8 },
  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.line },
  lockedValue: { fontSize: 15, fontWeight: '600', color: '#8b98a5', marginTop: 2 },

  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 16 },
  lockedTag: { marginLeft: 'auto', fontSize: 12, fontWeight: '700', color: '#92400e', backgroundColor: '#fef3c7', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },

  // forms
  section: { paddingHorizontal: 18, paddingTop: 19},
  input: { borderWidth: 1, paddingHorizontal: 14, fontSize: 15, color: T.text , backgroundColor: '#F8FBF9', borderColor: '#D8E8DF', borderRadius: 15, height: 50},
  textarea: { height: 120, paddingTop: 12, paddingBottom: 12 },

  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, marginTop: 10 },
  stepBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#f0f2f5', alignItems: 'center', justifyContent: 'center' },
  costNum: { fontSize: 44, fontWeight: '800', color: T.text, letterSpacing: -1 },
  costUnit: { fontSize: 18, fontWeight: '600', color: T.sub },
  presets: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 12 },
  preset: { height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: '#f0f2f5', alignItems: 'center', justifyContent: 'center' },

  segRow: { flexDirection: 'row', backgroundColor: '#f0f2f5', borderRadius: 12, padding: 4 },
  segBtn: { flex: 1, height: 42, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: '#fff' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: '#f0f2f5', alignItems: 'center', justifyContent: 'center' },

  // cover
  cover: { height: 190, overflow: 'hidden', backgroundColor: '#e5e7eb' , borderRadius: 19},
  coverActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  coverBtn: { flex: 1, height: 44, borderRadius: 22, backgroundColor: '#f0f2f5', alignItems: 'center', justifyContent: 'center' },
  coverEmpty: { height: 150, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#cfd9de', backgroundColor: T.soft, alignItems: 'center', justifyContent: 'center' , borderRadius: 18},
});