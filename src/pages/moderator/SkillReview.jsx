import { Alert } from '../../components/SkillCreditAlert';
// ═══════════════════════════════════════════════════════════════
//  MOBILE APP (Expo React Native) — src/pages/moderator/SkillReview.jsx
//  Same query, same claim / approve / decline rules, same notifications and decline
//  reasons as the web. Mobile layout: one column (cover, title, instructor, stats,
//  description, outcomes, portfolio) and ONE sticky action bar — Claim case, or
//  Decline + Approve once you own the case. The decline modal became a bottom
//  sheet; window.confirm became a native confirm.
//  Open it with: navigation.navigate('SkillReview', { id })   (root-stack screen)
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useLayoutEffect } from 'react';
import {
  View, Text, Image, Pressable, ScrollView, Modal, Linking, ActivityIndicator, StyleSheet,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, CheckCircle2, Clock, ExternalLink, FileImage, FileText, Hand, MessageCircle, ShieldAlert,
  Sparkles, Video, X, XCircle,
} from 'lucide-react-native';
import supabase from '../../supabaseClient';

const T = {
  text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4',
  brand: '#047857', soft: '#ecfdf5', strip: '#f7f9f9', danger: '#be123c',
};

const getFormatIcon = (format) => {
  const map = {
    'Video Call': Video,
    'Chat/Text': MessageCircle,
    'Docs': FileText,
    'All Formats': Sparkles,
  };
  return map[format] || Sparkles;
};

const DECLINE_REASONS = [
  'Inappropriate or offensive content in cover photo or description.',
  'Skill description and outcomes are too vague or incomplete.',
  'Portfolio or reference link is invalid, broken, or suspicious.',
  'Listing violates platform Trust & Safety guidelines.',
  'Misclassified category or incorrect pricing tier.',
  'Spam or duplicate listing.',
];

export default function SkillReview() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const id = route.params?.id;

  const [skill, setSkill] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // this screen draws its own back bar
  useLayoutEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);

  // back to the approvals queue (the screen that opened this one)
  const goQueue = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Mod', { screen: 'Approvals' });
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);

      // explicit foreign keys so there is no Ambiguous Relationship error
      const { data, error } = await supabase
        .from('skills')
        .select(`
          *,
          instructor:user_profiles!instructor_id ( id, full_name, email, avatar_url ),
          assignee:user_profiles!assigned_to ( id, full_name )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      setSkill(data);
    } catch (err) {
      console.error(err);
      Alert.alert('Skill not found.');
      goQueue();
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async () => {
    setProcessing(true);
    try {
      // .select() added so we can verify the update really went through
      const { data, error } = await supabase
        .from('skills')
        .update({ assigned_to: currentUser.id })
        .eq('id', id)
        .select();

      if (error) throw error;

      // no error but nothing changed = RLS blocked it
      if (!data || data.length === 0) {
        throw new Error('Supabase RLS blocked the update. Check your database policies.');
      }

      await fetchData();
    } catch (err) {
      console.error('CLAIM ERROR:', err);
      Alert.alert('Error claiming skill', err.message);
    } finally {
      setProcessing(false);
    }
  };

  // the web used window.confirm -> native confirm, then the same approve logic
  const handleApprove = () => {
    Alert.alert('Approve skill', 'Approve this skill to be published on the platform?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: runApprove },
    ]);
  };

  const runApprove = async () => {
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('skills')
        .update({ status: 'approved', rejection_reason: null })
        .eq('id', id);

      if (error) throw error;

      await supabase.from('notifications').insert([{
        user_id: skill.instructor_id,
        type: 'report_updated',
        content: `Moderator Update: Your skill listing "${skill.title}" has been APPROVED and is now live!`,
        link_url: `/my-listings?highlight=${id}`, // 🚨 highlight param added
      }]);

      Alert.alert('Skill successfully approved!');
      goQueue();
    } catch (err) {
      console.error(err);
      Alert.alert('Error approving skill.');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason) {
      Alert.alert('Please select a reason for rejection.');
      return;
    }

    setProcessing(true);
    try {
      const { error } = await supabase
        .from('skills')
        .update({ status: 'rejected', rejection_reason: rejectReason })
        .eq('id', id);

      if (error) throw error;

      await supabase.from('notifications').insert([{
        user_id: skill.instructor_id,
        type: 'account_warning',
        content: `Moderator Update: Your skill listing "${skill.title}" was REJECTED. Reason: ${rejectReason}`,
        link_url: `/my-listings?highlight=${id}`, // 🚨 highlight param added
      }]);

      Alert.alert('Skill has been rejected and the instructor has been notified.');
      setShowRejectModal(false);
      goQueue();
    } catch (err) {
      console.error(err);
      Alert.alert('Error rejecting skill.');
    } finally {
      setProcessing(false);
    }
  };

  const openPortfolio = (url) => {
    const full = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    Linking.openURL(full).catch(() => {});
  };

  const instructor = skill ? (Array.isArray(skill.instructor) ? skill.instructor[0] : skill.instructor) : null;
  const isResolved = skill ? skill.status !== 'pending' : false;
  const isClaimedByMe = skill ? skill.status === 'pending' && skill.assigned_to === currentUser?.id : false;
  const isUnassigned = skill ? skill.status === 'pending' && !skill.assigned_to : false;
  const assignedToSomeoneElse = skill ? skill.status === 'pending' && skill.assigned_to && skill.assigned_to !== currentUser?.id : false;

  const TopBar = (
    <View style={[s.header, { paddingTop: insets.top + 6 }]}>
      <Pressable onPress={goQueue} style={s.headBtn} hitSlop={8} accessibilityLabel="Back to queue">
        <ArrowLeft size={22} color={T.text} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={s.headTitle}>Skill inspection</Text>
        <Text style={s.small}>Back to queue</Text>
      </View>
      {isResolved && (
        <View style={[s.statusPill, skill.status === 'approved' ? { backgroundColor: T.soft } : { backgroundColor: '#fff1f2' }]}>
          <Text style={[s.statusText, { color: skill.status === 'approved' ? '#065f46' : '#9f1239' }]}>{skill.status}</Text>
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        {TopBar}
        <View style={s.center}>
          <ActivityIndicator color={T.brand} />
          <Text style={[s.small, { marginTop: 10 }]}>Loading skill details...</Text>
        </View>
      </View>
    );
  }

  if (!skill) return null;

  const FormatIcon = getFormatIcon(skill.format);
  const showBar = isUnassigned || isClaimedByMe;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {TopBar}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: (showBar ? 90 : 24) + insets.bottom }}>
        {/* notices */}
        {isResolved && (
          <View style={[s.notice, skill.status === 'approved' ? { backgroundColor: T.soft } : { backgroundColor: '#fff1f2' }]}>
            {skill.status === 'approved'
              ? <CheckCircle2 size={20} color="#065f46" style={{ marginTop: 1 }} />
              : <XCircle size={20} color="#9f1239" style={{ marginTop: 1 }} />}
            <View style={{ flex: 1 }}>
              <Text style={[s.noticeTitle, { color: skill.status === 'approved' ? '#065f46' : '#9f1239' }]}>This skill has been {skill.status}.</Text>
              {skill.status === 'rejected' && <Text style={[s.noticeText, { color: '#9f1239' }]}>Reason: {skill.rejection_reason}</Text>}
              <Text style={[s.noticeMeta, { color: skill.status === 'approved' ? '#065f46' : '#9f1239' }]}>Resolved by {skill.assignee?.full_name || 'Moderator'}</Text>
            </View>
          </View>
        )}

        {!!assignedToSomeoneElse && (
          <View style={[s.notice, { backgroundColor: '#fffbeb' }]}>
            <Hand size={20} color="#92400e" style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={[s.noticeTitle, { color: '#92400e' }]}>Currently claimed by another moderator.</Text>
              <Text style={[s.noticeText, { color: '#92400e' }]}>This skill is locked for review by {skill.assignee?.full_name}.</Text>
            </View>
          </View>
        )}

        <View style={isResolved && { opacity: 0.85 }}>
          {/* cover */}
          <View style={s.cover}>
            {skill.cover_image_url ? (
              <Image source={{ uri: skill.cover_image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <View style={{ alignItems: 'center' }}>
                <FileImage size={30} color={T.border} />
                <Text style={[s.small, { marginTop: 6, fontWeight: '600' }]}>No Cover Image</Text>
              </View>
            )}
            <View style={s.catChip}><Text style={s.catChipText} numberOfLines={1}>{skill.category}</Text></View>
          </View>

          {/* title + instructor */}
          <View style={s.block}>
            <Text style={s.title}>{skill.title}</Text>
            <View style={s.instructorRow}>
              <View style={s.avatar}>
                {instructor?.avatar_url
                  ? <Image source={{ uri: instructor.avatar_url }} style={{ width: 40, height: 40 }} />
                  : <Text style={s.avatarText}>{instructor?.full_name?.charAt(0)}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle} numberOfLines={1}>{instructor?.full_name || 'Unknown'}</Text>
                <Text style={s.small} numberOfLines={1}>{instructor?.email || 'No email provided'}</Text>
              </View>
            </View>
          </View>

          {/* stats */}
          <View style={s.stats}>
            <View style={s.stat}>
              <Text style={s.small}>Credit cost</Text>
              <Text style={s.statValue}>{skill.credit_cost} CR</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.stat}>
              <Text style={s.small}>Duration</Text>
              <View style={s.statRow}><Clock size={15} color={T.sub} /><Text style={s.statValue}>{skill.duration}</Text></View>
            </View>
            <View style={s.statDivider} />
            <View style={s.stat}>
              <Text style={s.small}>Format</Text>
              <View style={s.statRow}><FormatIcon size={15} color={T.sub} /><Text style={s.statValue} numberOfLines={1}>{skill.format}</Text></View>
            </View>
          </View>

          {/* text sections */}
          <View style={s.block}>
            <Text style={s.sectionTitle}>Description</Text>
            <Text style={s.bodyText}>{skill.description}</Text>
          </View>

          <View style={s.block}>
            <Text style={s.sectionTitle}>Learner outcomes</Text>
            <Text style={s.bodyText}>{skill.outcomes}</Text>
          </View>

          {!!skill.portfolio_url && (
            <View style={[s.block, { borderBottomWidth: 0 }]}>
              <Text style={s.sectionTitle}>Portfolio reference</Text>
              <Pressable onPress={() => openPortfolio(skill.portfolio_url)} style={s.linkBtn}>
                <ExternalLink size={16} color="#2563eb" />
                <Text style={s.linkText}>View external link</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── sticky actions */}
      {showBar && (
        <View style={[s.bar, { paddingBottom: insets.bottom + 10 }]}>
          {isUnassigned && (
            <Pressable onPress={handleClaim} disabled={processing} style={[s.btn, { backgroundColor: T.text }, processing && { opacity: 0.6 }]}>
              {processing ? <ActivityIndicator color="#fff" /> : <><Hand size={18} color="#fff" /><Text style={s.btnText}>Claim case</Text></>}
            </Pressable>
          )}
          {isClaimedByMe && (
            <>
              <Pressable onPress={() => setShowRejectModal(true)} disabled={processing} style={[s.btn, s.btnGhost, processing && { opacity: 0.6 }]}>
                <XCircle size={18} color={T.danger} />
                <Text style={[s.btnText, { color: T.danger }]}>Decline</Text>
              </Pressable>
              <Pressable onPress={handleApprove} disabled={processing} style={[s.btn, { backgroundColor: T.brand }, processing && { opacity: 0.6 }]}>
                {processing ? <ActivityIndicator color="#fff" /> : <><CheckCircle2 size={18} color="#fff" /><Text style={s.btnText}>Approve</Text></>}
              </Pressable>
            </>
          )}
        </View>
      )}

      {/* ── DECLINE SHEET */}
      <Modal visible={showRejectModal} transparent animationType="slide" onRequestClose={() => !processing && setShowRejectModal(false)}>
        <View style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => !processing && setShowRejectModal(false)} />
          <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={s.grabber} />
            <View style={s.sheetHeader}>
              <View style={s.sheetIcon}><ShieldAlert size={20} color={T.danger} /></View>
              <Text style={s.sheetTitle}>Decline listing</Text>
              <Pressable onPress={() => !processing && setShowRejectModal(false)} hitSlop={10}><X size={22} color={T.sub} /></Pressable>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
              <Text style={[s.small, { marginBottom: 12 }]}>Select a reason to notify the instructor why this skill was rejected.</Text>
              {DECLINE_REASONS.map((reason) => {
                const on = rejectReason === reason;
                return (
                  <Pressable key={reason} onPress={() => setRejectReason(reason)} style={[s.reason, on && s.reasonOn]} accessibilityState={{ selected: on }}>
                    <View style={[s.radio, on && { borderColor: T.danger }]}>{on && <View style={s.radioDot} />}</View>
                    <Text style={[s.reasonText, on && { color: '#9f1239', fontWeight: '700' }]}>{reason}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={s.sheetFooter}>
              <Pressable onPress={() => setShowRejectModal(false)} disabled={processing} style={[s.btn, s.btnGhost, { flex: 1 }, processing && { opacity: 0.5 }]}>
                <Text style={[s.btnText, { color: T.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleReject}
                disabled={processing || !rejectReason}
                style={[s.btn, { backgroundColor: T.danger, flex: 1.5 }, (processing || !rejectReason) && { opacity: 0.5 }]}
              >
                <Text style={s.btnText}>{processing ? 'Processing...' : 'Confirm rejection'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  small: { fontSize: 13, color: T.sub },
  rowTitle: { fontSize: 15, fontWeight: '700', color: T.text },

  // header
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingBottom: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: T.line },
  headBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headTitle: { fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2 },
  statusPill: { paddingHorizontal: 12, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  statusText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },

  // notices
  notice: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.line },
  noticeTitle: { fontSize: 14, fontWeight: '700' },
  noticeText: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  noticeMeta: { fontSize: 12, fontWeight: '600', marginTop: 6, opacity: 0.7 },

  // content
  cover: { height: 200, backgroundColor: T.strip, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: T.line },
  catChip: { position: 'absolute', top: 12, left: 12, maxWidth: '80%', backgroundColor: 'rgba(15,20,25,0.7)', paddingHorizontal: 10, height: 26, borderRadius: 13, justifyContent: 'center' },
  catChipText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  block: { paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: T.line },
  title: { fontSize: 20, fontWeight: '700', color: T.text, lineHeight: 26, letterSpacing: -0.3 },
  instructorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  avatar: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden', backgroundColor: T.field, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '700', color: T.sub },

  stats: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: T.line },
  stat: { flex: 1, paddingHorizontal: 12, paddingVertical: 14 },
  statDivider: { width: 1, backgroundColor: T.line },
  statValue: { fontSize: 15, fontWeight: '700', color: T.text, marginTop: 4, flexShrink: 1 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },

  sectionTitle: { fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2, marginBottom: 8 },
  bodyText: { fontSize: 15, lineHeight: 22, color: T.text },
  linkBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#eff6ff' },
  linkText: { fontSize: 14, fontWeight: '700', color: '#2563eb' },

  // sticky bar
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: T.line },
  btn: { flex: 1, height: 44, borderRadius: 22, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { borderWidth: 1, borderColor: T.border, backgroundColor: '#fff' },
  btnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // decline sheet
  overlay: { flex: 1, backgroundColor: 'rgba(15,20,25,0.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: T.border, marginTop: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.line },
  sheetIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#fff1f2', alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2 },
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12, marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: T.line, backgroundColor: T.strip },
  reasonOn: { backgroundColor: '#fff1f2', borderColor: '#fda4af' },
  reasonText: { flex: 1, fontSize: 14, lineHeight: 20, color: T.text },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: T.border, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: T.danger },
  sheetFooter: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.line },
});