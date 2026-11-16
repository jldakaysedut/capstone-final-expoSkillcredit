import { Alert } from '../../components/SkillCreditAlert';
// ═══════════════════════════════════════════════════════════════
//  MOBILE APP (Expo React Native) — src/pages/moderator/ReportDetails.jsx
//  Same queries, same conflict-of-interest guard, same claim step and the SAME
//  adjudication as the web (report update -> cluster update -> issue_penalty ->
//  repeat_offenders / admin_escalations -> optional content delete -> mod_logs ->
//  notifications). Only the presentation changed.
//  Mobile layout: one column (case summary, evidence, complaint record, verdict) and
//  ONE sticky bar (Claim, or Choose outcome). The web "Decision desk" became an
//  outcome sheet; the case-material modals became sheets and the image viewer is
//  full screen.
//  Open it with: navigation.navigate('ReportDetails', { id })   (root-stack screen)
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useLayoutEffect } from 'react';
import {
  View, Text, Image, Pressable, ScrollView, Modal, ActivityIndicator, StyleSheet,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronDown, ChevronLeft, ChevronRight, X, ArrowLeft, AlertTriangle, Scale,
  Clock, Users, Check, FileText, UploadCloud, Flag, MessageSquare, Image as ImageIcon,
} from 'lucide-react-native';
import supabase from '../../supabaseClient';

const T = {
  text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4',
  brand: '#047857', soft: '#ecfdf5', strip: '#f7f9f9', danger: '#be123c',
};

const fmtStamp = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtShort = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// Display-only: avatar image with an initial as fallback.
function Avatar({ url, name, fallback = 'U', size, bg, border, fg, radius }) {
  return (
    <View style={{ width: size, height: size, borderRadius: radius ?? size / 2, overflow: 'hidden', backgroundColor: bg, borderWidth: 1, borderColor: border, alignItems: 'center', justifyContent: 'center' }}>
      {url
        ? <Image source={{ uri: url }} style={{ width: size, height: size }} />
        : <Text style={{ fontSize: size * 0.4, fontWeight: '700', color: fg }}>{(name?.charAt(0) || fallback).toUpperCase()}</Text>}
    </View>
  );
}

function parseReportDetails(rawDetails) {
  if (!rawDetails) return { complainantText: 'No narrative details provided.', resolutionMeta: null, resolutionNotes: null };
  const resolutionPattern = /\n\n\[RESOLVED\s*-\s*([^\]]+)\]:\s*([\s\S]*)$/i;
  const match = rawDetails.match(resolutionPattern);
  if (match) {
    return {
      complainantText: rawDetails.substring(0, match.index).trim() || 'No narrative details provided.',
      resolutionMeta: match[1].trim(),
      resolutionNotes: match[2].trim(),
    };
  }
  return { complainantText: rawDetails.trim(), resolutionMeta: null, resolutionNotes: null };
}

// ─── AUTO-GENERATED MODERATOR NOTES LOGIC ───
function getAutoNote(reason, actionType) {
  if (actionType === 'dismiss') return 'Report reviewed and dismissed. No community guidelines violation found.';
  if (actionType === 'escalate') return 'Case escalated to Administration. The account requires a final review for platform safety.';

  const r = reason || '';
  if (r.includes('Spam') || r.includes('Inappropriate')) {
    return actionType === 'warning'
      ? 'Your recent post or comment was flagged and reviewed for violating our spam and content relevance policies. Please ensure your contributions remain constructive and relevant to the community.'
      : 'Your account has been temporarily restricted for 12 hours due to repeated or severe posting of inappropriate/spam content. Please adhere to community standards.';
  }
  if (r.includes('Harassment') || r.includes('Abuse')) {
    return actionType === 'warning'
      ? 'Your recent community interaction was reviewed and flagged for unprofessional or disrespectful language. SkillCredit strictly enforces a respectful and safe environment for all members.'
      : 'Zero tolerance for harassment. Your account has been temporarily restricted for 12 hours following verified reports of abusive behavior or targeted harassment towards another member.';
  }
  if (r.includes('Misinformation')) {
    return actionType === 'warning'
      ? 'Content published from your account was flagged for sharing misleading or unverified information. Please verify your claims and resources before sharing them in the community.'
      : 'Your account has been temporarily restricted for 12 hours due to the distribution of misleading claims or unverified technical data that could affect other learners.';
  }

  // Fallback / Other
  return actionType === 'warning'
    ? 'Your recent contribution was reviewed by Trust & Safety and found to be in violation of general community guidelines. Please review our platform rules.'
    : 'Your account has been temporarily restricted for 12 hours from posting and commenting due to a confirmed breach of community rules.';
}

// ── threaded discussion (replies nested under their parent, reported comment highlighted)
function ModerationCommentThread({ comments, flaggedCommentId, parentId = null, depth = 0 }) {
  const [collapsed, setCollapsed] = useState({});
  const commentIds = new Set(comments.map((comment) => comment.id));
  const threadItems = parentId === null
    ? comments.filter((comment) => !comment.parent_comment_id || !commentIds.has(comment.parent_comment_id))
    : comments.filter((comment) => comment.parent_comment_id === parentId);

  if (!threadItems.length) return null;

  return (
    <View style={depth > 0 ? s.nested : { gap: 12 }}>
      {threadItems.map((comment) => {
        const children = comments.filter((reply) => reply.parent_comment_id === comment.id);
        const isFlagged = comment.id === flaggedCommentId;
        const name = comment.user?.full_name || 'Community member';
        return (
          <View key={comment.id}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Avatar url={comment.user?.avatar_url} name={name} size={32} bg="#fff" border={T.border} fg={T.sub} />
              <View style={{ flex: 1 }}>
                <View style={[s.commentBox, isFlagged && { borderColor: '#fecdd3', backgroundColor: '#fff1f2' }]}>
                  <View style={s.commentHead}>
                    <Text style={s.commentName} numberOfLines={1}>{name}</Text>
                    {depth > 0 && <Text style={[s.tag, { backgroundColor: T.soft, color: '#047857' }]}>Reply</Text>}
                    {isFlagged && <Text style={[s.tag, { backgroundColor: '#ffe4e6', color: '#be123c' }]}>Reported comment</Text>}
                  </View>
                  <Text style={s.time}>{fmtStamp(comment.created_at)}</Text>
                  <Text style={s.commentText}>{comment.content}</Text>
                </View>
                {children.length > 0 && (
                  <Pressable
                    onPress={() => setCollapsed((previous) => ({ ...previous, [comment.id]: !previous[comment.id] }))}
                    style={s.collapseBtn}
                    hitSlop={6}
                  >
                    <ChevronDown size={14} color="#047857" style={collapsed[comment.id] && { transform: [{ rotate: '-90deg' }] }} />
                    <Text style={s.collapseText}>{collapsed[comment.id] ? `Show ${children.length} replies` : 'Hide replies'}</Text>
                  </Pressable>
                )}
                {!collapsed[comment.id] && children.length > 0 && (
                  <View style={{ marginTop: 8 }}>
                    <ModerationCommentThread comments={comments} flaggedCommentId={flaggedCommentId} parentId={comment.id} depth={depth + 1} />
                  </View>
                )}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── attached evidence: 1 image full width, otherwise a 2-column grid (max 4, "+N" on the last)
function PostImageCollage({ mediaUrls = [], onOpen }) {
  if (!mediaUrls.length) return null;
  const total = mediaUrls.length;
  if (total === 1) {
    return (
      <Pressable onPress={() => onOpen(mediaUrls, 0)} style={s.collageOne} accessibilityLabel="Open image 1 of 1">
        <Image source={{ uri: mediaUrls[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      </Pressable>
    );
  }
  const visible = mediaUrls.slice(0, 4);
  return (
    <View style={s.collageGrid}>
      {visible.map((url, index) => {
        const hasOverflow = total > 4 && index === 3;
        return (
          <Pressable key={`${url}-${index}`} onPress={() => onOpen(mediaUrls, index)} style={s.collageTile} accessibilityLabel={`Open image ${index + 1} of ${total}`}>
            <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            {hasOverflow && <View style={s.collageMore}><Text style={s.collageMoreText}>+{total - 4}</Text></View>}
          </Pressable>
        );
      })}
    </View>
  );
}

// ── full-screen evidence viewer
function ImageGalleryModal({ images = [], initialIndex = 0, onClose }) {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => setCurrentIndex(initialIndex), [initialIndex]);

  if (!images.length) return null;

  const showPrevious = () => setCurrentIndex((index) => (index - 1 + images.length) % images.length);
  const showNext = () => setCurrentIndex((index) => (index + 1) % images.length);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.lightbox}>
        <View style={[s.lightHead, { paddingTop: insets.top + 8 }]}>
          <View style={s.lightIcon}><ImageIcon size={18} color="#a7f3d0" /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.lightTitle}>Original submitted media</Text>
            <Text style={s.lightSub}>Image {currentIndex + 1} of {images.length}</Text>
          </View>
          <Pressable onPress={onClose} style={s.lightClose} hitSlop={8} accessibilityLabel="Close image viewer"><X size={20} color="#fff" /></Pressable>
        </View>

        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Image source={{ uri: images[currentIndex] }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
        </View>

        <View style={[s.lightFoot, { paddingBottom: insets.bottom + 12 }]}>
          {images.length > 1 ? (
            <>
              <Pressable onPress={showPrevious} style={s.lightNav} accessibilityLabel="Previous image"><ChevronLeft size={22} color="#fff" /></Pressable>
              <Text style={s.lightCount}>{currentIndex + 1} / {images.length}</Text>
              <Pressable onPress={showNext} style={s.lightNav} accessibilityLabel="Next image"><ChevronRight size={22} color="#fff" /></Pressable>
            </>
          ) : (
            <Text style={s.lightCount}>Submitted evidence</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

export default function ReportDetails() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const id = route.params?.id;

  const [currentUserId, setCurrentUserId] = useState(null);
  const [report, setReport] = useState(null);
  const [clusteredReports, setClusteredReports] = useState([]);
  const [reportedPost, setReportedPost] = useState(null);
  const [reportedComment, setReportedComment] = useState(null);
  const [postComments, setPostComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(null);
  const [imageGallery, setImageGallery] = useState(null);
  const [activeDetailModal, setActiveDetailModal] = useState(null);
  const [barH, setBarH] = useState(0);

  // Modal State for Penalty Options
  const [actionModal, setActionModal] = useState({ isOpen: false, type: null });
  const [deleteContentOption, setDeleteContentOption] = useState(true);
  const [outcomeOpen, setOutcomeOpen] = useState(false);

  // this screen draws its own back bar
  useLayoutEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);

  // back to the reports queue (the screen that opened this one)
  const goQueue = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Mod', { screen: 'Reports' });
  };

  const openImageGallery = (images, index) => setImageGallery({ images, index });

  const resolveMediaUrls = (media) => {
    if (!media) return [];
    let urls = [];
    if (Array.isArray(media)) urls = media;
    else if (typeof media === 'string') {
      try { urls = JSON.parse(media); urls = Array.isArray(urls) ? urls : [media]; } catch { urls = [media]; }
    }
    return urls.map((url) => {
      if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:'))) return url;
      const { data } = supabase.storage.from('community_media').getPublicUrl(url);
      return data?.publicUrl || url;
    });
  };

  const fetchParentPost = async (postId) => {
    const { data: postData, error: postErr } = await supabase.from('community_posts').select(`*, author:user_profiles!community_posts_user_id_fkey(id, full_name, role, avatar_url)`).eq('id', postId).maybeSingle();
    if (!postErr && postData) {
      setReportedPost(postData);
      const { data: comments, error: commErr } = await supabase.from('community_comments').select(`*, user:user_profiles!community_comments_user_id_fkey(id, full_name, avatar_url)`).eq('post_id', postData.id).order('created_at', { ascending: true });
      if (!commErr) setPostComments(comments || []);
    }
  };

  const fetchReportData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);

      const { data: repData, error: repErr } = await supabase.from('reports').select(`*, reporter:user_profiles!reports_reporter_id_fkey(id, full_name, role, avatar_url), reported:user_profiles!reports_reported_user_id_fkey(id, full_name, role, avatar_url), assignee:user_profiles!reports_assigned_to_fkey(id, full_name)`).eq('id', id).maybeSingle();
      if (repErr) throw repErr;
      if (!repData) { setReport(null); return; }
      setReport(repData);

      const refType = repData.reference_type?.toLowerCase() || '';
      const refId = repData.reference_id;

      if (refId) {
        const { data: clusterData } = await supabase.from('reports').select(`id, details, reason, reference_type, created_at, reporter_id, reporter:user_profiles!reports_reporter_id_fkey(id, full_name, role, avatar_url)`).eq('reference_id', refId).order('created_at', { ascending: true });
        setClusteredReports(clusterData || [repData]);
      } else {
        setClusteredReports([repData]);
      }

      if (refType.includes('comment') && refId) {
        const { data: commData, error: commErr } = await supabase.from('community_comments').select(`*, author:user_profiles!community_comments_user_id_fkey(id, full_name, role, avatar_url)`).eq('id', refId).maybeSingle();
        if (!commErr && commData) {
          setReportedComment(commData);
          if (commData.post_id) await fetchParentPost(commData.post_id);
        }
      } else if (refId) {
        await fetchParentPost(refId);
      }
    } catch (err) {
      console.error('Failed to load incident report dossier:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData();
  }, [id]);

  const isParticipant = Boolean(currentUserId && report && (clusteredReports.some((r) => r.reporter_id === currentUserId) || currentUserId === report.reported_user_id));

  const handleClaim = async () => {
    if (isParticipant) { Alert.alert('Action blocked: Conflict of interest policy prohibits self-adjudication.'); return; }
    setIsProcessing('claim');
    try {
      const { error } = await supabase.from('reports').update({ assigned_to: currentUserId }).eq('id', report.id);
      if (error) throw error;
      await fetchReportData();
    } catch (err) { Alert.alert('Failed to claim ticket: ' + err.message); } finally { setIsProcessing(null); }
  };

  const handleOpenActionModal = (actionType) => {
    if (isParticipant) { Alert.alert('Action blocked: Conflict of interest policy prohibits self-adjudication.'); return; }

    setOutcomeOpen(false);
    if (actionType === 'dismiss' || actionType === 'warning') {
      executeFinalAction(actionType, false);
    } else {
      setDeleteContentOption(true);
      setActionModal({ isOpen: true, type: actionType });
    }
  };

  const executeFinalAction = async (actionType, shouldDeleteContentParam) => {
    setActionModal({ isOpen: false, type: null });
    setIsProcessing(actionType);

    const shouldDeleteContent = (actionType === 'penalty' || actionType === 'escalate') ? shouldDeleteContentParam : false;

    try {
      const { complainantText } = parseReportDetails(report.details);
      const timestamp = new Date().toLocaleString();
      const autoNote = getAutoNote(report.reason, actionType);

      const updatedDetails = `${complainantText}\n\n[RESOLVED - ${actionType.toUpperCase()} on ${timestamp}]: ${autoNote}`;
      const newStatus = actionType === 'escalate' ? 'resolved' : 'resolved';

      await supabase.from('reports').update({ status: newStatus, details: updatedDetails, mod_action_notes: autoNote }).eq('id', report.id);

      if (report.reference_id && clusteredReports.length > 1) {
        await supabase.from('reports').update({ status: newStatus, assigned_to: currentUserId, mod_action_notes: autoNote }).eq('reference_id', report.reference_id).neq('id', report.id);
      }

      if (actionType === 'warning') {
        await supabase.rpc('issue_penalty', { target_id: report.reported_user_id, strike_to_add: 1, penalty_hours: 0, penalty_type: 'community' });
      } else if (actionType === 'penalty') {
        await supabase.rpc('issue_penalty', { target_id: report.reported_user_id, strike_to_add: 1, penalty_hours: 12, penalty_type: 'community' });
      }

      // ─── REPEAT OFFENDERS & ADMIN ESCALATIONS INTEGRATION (WITH MODERATOR_ID) ───
      if (actionType === 'warning' || actionType === 'penalty' || actionType === 'escalate') {
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('violation_count')
          .eq('id', report.reported_user_id)
          .single();

        if (profileData) {
          const currentCount = profileData.violation_count || 0;

          if (currentCount >= 3) {
            const { data: existingOffender } = await supabase
              .from('repeat_offenders')
              .select('id')
              .eq('user_id', report.reported_user_id)
              .maybeSingle();

            let repeatOffenderId = existingOffender?.id;

            if (!existingOffender) {
              const { data: newOffender, error: insertOffenderErr } = await supabase
                .from('repeat_offenders')
                .insert([{ user_id: report.reported_user_id, moderator_id: currentUserId }])
                .select('id')
                .single();

              if (!insertOffenderErr && newOffender) {
                repeatOffenderId = newOffender.id;
              }
            }

            if (actionType === 'escalate') {
              await supabase
                .from('admin_escalations')
                .insert([{
                  user_id: report.reported_user_id,
                  repeat_offender_id: repeatOffenderId,
                  status: 'pending',
                }]);
            }
          }
        }
      }
      // ────────────────────────────────────────────────────────

      if (shouldDeleteContent) {
        try {
          if (reportedComment) {
            await supabase.from('community_comments').delete().eq('id', reportedComment.id);
          } else if (reportedPost) {
            await supabase.from('community_posts').delete().eq('id', reportedPost.id);
          }
        } catch (contentDelErr) { console.warn('Could not remove reported content automatically:', contentDelErr); }
      }

      const logEntries = [];
      const logActionTypes = { dismiss: 'REPORT_DISMISSED', warning: 'USER_WARNED', penalty: 'USER_PENALIZED', escalate: 'ESCALATED_TO_ADMIN' };
      const actionDescriptions = { dismiss: 'Dismiss report (No violation detected)', warning: 'Issue an official community conduct warning (+1 Strike)', penalty: 'Apply a 12-hour account timeout (+1 Strike)', escalate: 'Escalate to Admin for severe review and potential ban' };

      logEntries.push({ moderator_id: currentUserId, target_user_id: report.reported_user_id, action_type: logActionTypes[actionType], reference_id: report.id, details: `${actionDescriptions[actionType]}. Notes: ${autoNote}${shouldDeleteContent ? ' (Content Deleted)' : ''}` });

      if (shouldDeleteContent && actionType !== 'dismiss' && (reportedComment || reportedPost)) {
        logEntries.push({ moderator_id: currentUserId, target_user_id: report.reported_user_id, action_type: 'DELETE_POST', reference_id: reportedComment ? reportedComment.id : reportedPost.id, details: `Auto-deleted offending ${reportedComment ? 'comment' : 'post'} during report adjudication.` });
      }

      if (logEntries.length > 0) {
        const { error: logErr } = await supabase.from('mod_logs').insert(logEntries);
        if (logErr) console.warn('Failed to insert mod log:', logErr);
      }

      try {
        let notifContent = '';
        let notifType = '';
        const deletedNoticeTag = shouldDeleteContent ? '\n\nAction Taken: The offending content has been permanently removed by the moderation team.' : '';

        if (actionType === 'warning') {
          notifType = 'account_warning';
          notifContent = `Your profile received a warning regarding: "${report.reason}".\n\nModerator Note: ${autoNote}`;
        } else if (actionType === 'penalty') {
          notifType = 'account_penalized';
          notifContent = `Your account has been temporarily restricted for 12 hours from posting and commenting in the Community regarding violations in: "${report.reason}".\n\nModerator Note: ${autoNote}${deletedNoticeTag}`;
        } else if (actionType === 'escalate') {
          notifType = 'account_escalated';
          notifContent = `Your account behavior has been escalated to an Administrator for severe review regarding: "${report.reason}".\n\nModerator Note: ${autoNote}${deletedNoticeTag}`;
        }

        let dynamicLink = '/notifications';
        if (!shouldDeleteContent) {
          const refType = report.reference_type?.toLowerCase() || '';
          if (refType.includes('post')) {
            dynamicLink = `/community?post=${report.reference_id}`;
          } else if (refType.includes('comment') && reportedComment?.post_id) {
            dynamicLink = `/community?post=${reportedComment.post_id}&comment=${report.reference_id}`;
          }
        }

        if (notifContent && report.reported_user_id) {
          await supabase.from('notifications').insert([{
            user_id: report.reported_user_id,
            type: notifType,
            content: notifContent,
            link_url: dynamicLink,
          }]);
        }

        if (clusteredReports.length > 0) {
          const reporterNotifications = clusteredReports
            .filter((r) => r.reporter_id)
            .map((r) => ({
              user_id: r.reporter_id,
              type: 'report_updated',
              content: `Your report regarding "${report.reason}" has been reviewed and adjudicated by Trust & Safety.`,
              link_url: '/notifications',
            }));
          if (reporterNotifications.length > 0) await supabase.from('notifications').insert(reporterNotifications);
        }
      } catch (notifErr) { console.warn('Notification log skipped:', notifErr.message); }

      Alert.alert('Ticket successfully adjudicated and resolved.');
      goQueue();
    } catch (err) {
      console.error(err);
      Alert.alert('Error finalizing ticket: ' + err.message);
    } finally {
      setIsProcessing(null);
    }
  };

  // ─── shared top bar (back + title + status)
  const isPendingTop = report?.status === 'pending';
  const isEscalatedTop = report?.status === 'escalated';
  const pageTitleTop = reportedComment ? 'Comment review' : reportedPost ? 'Post review' : 'Report review';
  const TopBar = (
    <View style={[s.header, { paddingTop: insets.top + 6 }]}>
      <Pressable onPress={goQueue} style={s.headBtn} hitSlop={8} accessibilityLabel="Back to reports">
        <ArrowLeft size={22} color={T.text} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={s.headTitle}>{loading || !report ? 'Report review' : pageTitleTop}</Text>
        {!!report && <Text style={s.small}>Case #{report.id.slice(0, 8)}</Text>}
      </View>
      {!!report && (
        <View style={[s.statusPill, { backgroundColor: isPendingTop ? '#fffbeb' : isEscalatedTop ? '#fff1f2' : T.soft }]}>
          <Text style={[s.statusText, { color: isPendingTop ? '#92400e' : isEscalatedTop ? '#9f1239' : '#065f46' }]}>
            {isPendingTop ? 'Awaiting decision' : isEscalatedTop ? 'Escalated' : 'Closed'}
          </Text>
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
          <Text style={[s.small, { marginTop: 10 }]}>Loading case documentation...</Text>
        </View>
      </View>
    );
  }

  if (!report) {
    return (
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        {TopBar}
        <View style={s.center}>
          <View style={s.emptyIcon}><FileText size={22} color={T.border} /></View>
          <Text style={[s.rowTitle, { marginTop: 12 }]}>Record not found</Text>
          <Text style={[s.small, { textAlign: 'center', marginTop: 4 }]}>This report does not exist or has been removed from the database.</Text>
          <Pressable onPress={goQueue} style={s.fillBtn}><ArrowLeft size={15} color="#fff" /><Text style={s.fillBtnText}>Return to reports</Text></Pressable>
        </View>
      </View>
    );
  }

  const postMediaUrls = reportedPost ? resolveMediaUrls(reportedPost.media_urls) : [];
  const { resolutionMeta, resolutionNotes: existingResolutionNotes } = parseReportDetails(report.details);
  const postCommentIds = new Set(postComments.map((comment) => comment.id));
  const topLevelCommentCount = postComments.filter((comment) => !comment.parent_comment_id || !postCommentIds.has(comment.parent_comment_id)).length;
  const totalReplyCount = postComments.length - topLevelCommentCount;
  const involvedReporters = Array.from(new Map(clusteredReports.map((claim) => [claim.reporter_id || claim.reporter?.id || claim.id, claim])).values());
  const reporterReportCounts = clusteredReports.reduce((counts, claim) => {
    const key = claim.reporter_id || claim.reporter?.id || claim.id;
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());
  const contentCategory = reportedPost?.category || 'Not specified';
  const claimReasons = Array.from(new Map(clusteredReports.map((claim) => claim.reason?.trim()).filter(Boolean).map((reason) => [reason.toLowerCase(), reason])).values());
  const claimReasonSummary = claimReasons.length > 1 ? 'Mixed reasons' : claimReasons[0] || report.reason || 'Not specified';

  const isPending = report.status === 'pending';
  const isEscalated = report.status === 'escalated';
  const firstFiledAt = clusteredReports[0]?.created_at || report.created_at;
  const assignedLabel = report.assigned_to
    ? (report.assigned_to === currentUserId ? 'You' : report.assignee?.full_name || 'Another moderator')
    : 'Unassigned';
  const progressSteps = [
    {
      label: 'Filed',
      done: true,
      detail: firstFiledAt ? fmtShort(firstFiledAt) : 'On record',
    },
    {
      label: 'Claimed',
      done: Boolean(report.assigned_to),
      detail: report.assigned_to ? `By ${assignedLabel}` : 'Waiting for a moderator',
    },
    {
      label: 'Decision',
      done: !isPending,
      detail: !isPending
        ? (resolutionMeta ? (resolutionMeta.split(' on ')[0] || 'Resolved') : isEscalated ? 'Escalated' : 'Resolved')
        : 'Not decided yet',
    },
  ];
  const currentStepIndex = progressSteps.findIndex((step) => !step.done);

  const adjudicationActions = [
    { type: 'dismiss',  Icon: X,             idle: 'Dismiss (No Violation)', busy: 'Dismissing Ticket...', hint: 'Unfounded', row: { bg: '#fff', border: T.border, fg: T.text, hint: T.sub } },
    { type: 'warning',  Icon: AlertTriangle, idle: 'Issue Formal Warning',   busy: 'Issuing Warning...',   hint: '+1 Strike', row: { bg: '#fffbeb', border: '#fde68a', fg: '#78350f', hint: '#b45309' } },
    { type: 'penalty',  Icon: Clock,         idle: 'Apply 12h Timeout',      busy: 'Applying Penalty...',  hint: '+1 Strike', row: { bg: '#fff7ed', border: '#fed7aa', fg: '#7c2d12', hint: '#c2410c' } },
    { type: 'escalate', Icon: UploadCloud,   idle: 'Escalate to Admin',      busy: 'Escalating...',        hint: 'Severe',    row: { bg: '#be123c', border: '#be123c', fg: '#fff', hint: '#fecdd3' } },
  ];

  const canDecide = !isParticipant && isPending;
  const isUnassigned = canDecide && !report.assigned_to;
  const isMine = canDecide && report.assigned_to === currentUserId;
  const isOther = canDecide && !!report.assigned_to && report.assigned_to !== currentUserId;
  const isClosed = !isParticipant && !isPending;
  const showBar = isUnassigned || isMine;
  const busyAction = adjudicationActions.find((a) => a.type === isProcessing);

  const sheetOpen = outcomeOpen || actionModal.isOpen;
  const closeSheet = () => { setOutcomeOpen(false); setActionModal({ isOpen: false, type: null }); };

  const detailTitle = activeDetailModal === 'comments'
    ? 'Community discussion'
    : activeDetailModal === 'claims'
      ? `Complainant claims (${clusteredReports.length})`
      : `Involved parties (${involvedReporters.length} complainants)`;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {TopBar}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: (showBar ? barH : 0) + insets.bottom + 24 }}>
        {/* notices */}
        {isParticipant && (
          <View style={[s.notice, { backgroundColor: '#fff1f2' }]}>
            <AlertTriangle size={20} color="#e11d48" style={{ marginTop: 1 }} />
            <Text style={[s.noticeText, { color: '#9f1239' }]}>
              <Text style={{ fontWeight: '700' }}>Self-adjudication restriction: </Text>
              You are an involved party in this complaint. Adjudication controls have been disabled to ensure institutional impartiality.
            </Text>
          </View>
        )}
        {isOther && (
          <View style={[s.notice, { backgroundColor: '#eff6ff' }]}>
            <Users size={20} color="#1d4ed8" style={{ marginTop: 1 }} />
            <Text style={[s.noticeText, { color: '#1e3a8a' }]}>
              Assigned to <Text style={{ fontWeight: '700' }}>{report.assignee?.full_name || 'another moderator'}</Text>. This case is read-only for you.
            </Text>
          </View>
        )}
        {isClosed && (
          <View style={[s.notice, { backgroundColor: T.soft }]}>
            <Check size={20} color="#047857" style={{ marginTop: 1 }} />
            <Text style={[s.noticeText, { color: '#065f46', fontWeight: '600' }]}>This incident inquiry has been resolved and closed.</Text>
          </View>
        )}

        {/* case summary */}
        <View style={s.block}>
          <Text style={s.label}>Subject of report</Text>
          <View style={s.subjectRow}>
            <Avatar url={report.reported?.avatar_url} name={report.reported?.full_name} size={44} radius={12} bg="#fff1f2" border="#fecdd3" fg="#be123c" />
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle} numberOfLines={1}>{report.reported?.full_name || 'Flagged User'}</Text>
              <Text style={[s.small, { textTransform: 'capitalize' }]}>{report.reported?.role || 'User'}</Text>
            </View>
            <Text style={[s.tag, { backgroundColor: '#fff1f2', color: '#be123c' }]}>Reported account</Text>
          </View>

          <Text style={[s.label, { marginTop: 16 }]}>Primary concern</Text>
          <Text style={s.rowTitle}>{claimReasonSummary}</Text>
          <Text style={s.small}>{contentCategory}</Text>

          <View style={s.stats}>
            <View style={s.stat}>
              <Text style={s.small}>Filings</Text>
              <Text style={s.statNum}>{clusteredReports.length}</Text>
              <Text style={s.small}>linked reports</Text>
            </View>
            <View style={s.statDivider} />
            <Pressable style={s.stat} onPress={() => setActiveDetailModal('parties')} accessibilityLabel="Open party register">
              <Text style={s.small}>Complainants</Text>
              <Text style={s.statNum}>{involvedReporters.length}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Text style={[s.small, { color: T.brand, fontWeight: '700' }]}>View people</Text>
                <ChevronRight size={14} color={T.brand} />
              </View>
            </Pressable>
          </View>

          <View style={s.ownerRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.small}>Case owner</Text>
              <Text style={s.rowTitle} numberOfLines={1}>{assignedLabel}</Text>
              <Text style={s.small}>{report.assigned_to ? 'Ticket in custody' : 'Open for any moderator'}</Text>
            </View>
            <View style={[s.ownerDot, { backgroundColor: report.assigned_to ? '#10b981' : '#f59e0b' }]} />
          </View>

          {/* progress */}
          <View style={s.progress}>
            {progressSteps.map((step, index) => {
              const isCurrent = index === currentStepIndex;
              return (
                <View key={step.label} style={s.step}>
                  <View style={[s.stepDot, step.done ? { backgroundColor: T.brand, borderColor: T.brand } : isCurrent ? { borderColor: '#059669', backgroundColor: '#fff' } : { borderColor: T.border, backgroundColor: '#fff' }]}>
                    {step.done && <Check size={11} color="#fff" strokeWidth={3} />}
                  </View>
                  <Text style={[s.stepLabel, !(step.done || isCurrent) && { color: T.sub }]}>{step.label}</Text>
                  <Text style={s.stepDetail} numberOfLines={3}>{step.detail}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* evidence */}
        <View style={s.block}>
          <Text style={s.sectionTitle}>Evidence under review</Text>
          <Text style={[s.small, { marginBottom: 12 }]}>Original community activity</Text>

          {reportedComment && (
            <View style={s.commentCard}>
              <View style={s.commentCardHead}>
                <Flag size={14} color="#9f1239" />
                <Text style={s.commentCardTitle}>Reported comment</Text>
                <View style={{ flex: 1 }} />
                <Text style={s.small}>{fmtStamp(reportedComment.created_at)}</Text>
              </View>
              <View style={{ padding: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Avatar url={reportedComment.author?.avatar_url} name={reportedComment.author?.full_name} size={32} bg={T.strip} border={T.border} fg={T.sub} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.nameText} numberOfLines={1}>{reportedComment.author?.full_name || 'Comment Author'}</Text>
                    <Text style={s.small}>Comment author</Text>
                  </View>
                </View>
                <View style={s.quote}><Text style={s.quoteText}>“{reportedComment.content}”</Text></View>
              </View>
            </View>
          )}

          {reportedPost ? (
            <View style={[s.postCard, reportedComment && { marginTop: 12 }]}>
              <View style={s.postHead}>
                <Avatar url={reportedPost.author?.avatar_url} name={reportedPost.author?.full_name} size={36} bg={T.field} border={T.border} fg={T.sub} />
                <View style={{ flex: 1 }}>
                  <Text style={s.nameText} numberOfLines={1}>{reportedPost.author?.full_name || 'Post Author'}</Text>
                  <Text style={s.small}>{new Date(reportedPost.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                </View>
              </View>
              <View style={s.chipRow}>
                <Text style={s.catChip}>{reportedPost.category || 'General'}</Text>
                <Text style={[s.catChip, reportedComment ? { backgroundColor: '#fff' } : { backgroundColor: '#fff1f2', color: '#9f1239', borderColor: '#fecdd3' }]}>{reportedComment ? 'Parent context' : 'Reported post'}</Text>
              </View>

              <Text style={s.postText}>{reportedPost.content}</Text>

              {postMediaUrls.length > 0 && (
                <View style={s.evidenceBlock}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <ImageIcon size={14} color={T.sub} />
                    <Text style={[s.small, { fontWeight: '600' }]}>Attached evidence</Text>
                    <View style={{ flex: 1 }} />
                    <Text style={s.small}>{postMediaUrls.length} file{postMediaUrls.length === 1 ? '' : 's'}</Text>
                  </View>
                  <PostImageCollage mediaUrls={postMediaUrls} onOpen={openImageGallery} />
                </View>
              )}

              <View style={s.discussionRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.nameText}>Community discussion</Text>
                  <Text style={s.small}>{postComments.length === 0 ? 'No comments published under this post.' : `${topLevelCommentCount} thread${topLevelCommentCount === 1 ? '' : 's'}, ${totalReplyCount} repl${totalReplyCount === 1 ? 'y' : 'ies'}`}</Text>
                </View>
                {postComments.length > 0 && (
                  <Pressable onPress={() => setActiveDetailModal('comments')} style={s.smallBtn}>
                    <MessageSquare size={14} color={T.text} />
                    <Text style={s.smallBtnText}>Read</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ) : (
            !reportedComment && (
              <View style={s.noContent}>
                <View style={s.emptyIcon}><FileText size={20} color={T.border} /></View>
                <Text style={[s.rowTitle, { marginTop: 10 }]}>No content record</Text>
                <Text style={[s.small, { textAlign: 'center', marginTop: 2 }]}>No active community post record found for this reference.</Text>
              </View>
            )
          )}
        </View>

        {/* complaint record */}
        <View style={[s.block, !resolutionMeta && { borderBottomWidth: 0 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={s.sectionTitle}>Complaint record</Text>
            <Text style={s.small}>{clusteredReports.length} filing{clusteredReports.length === 1 ? '' : 's'}</Text>
          </View>
          <Text style={[s.small, { marginBottom: 12 }]}>{clusteredReports.length} complete statement{clusteredReports.length === 1 ? '' : 's'} from {involvedReporters.length} complainant{involvedReporters.length === 1 ? '' : 's'}.</Text>
          {clusteredReports.length > 0 && (
            <Pressable onPress={() => setActiveDetailModal('claims')} style={s.readBtn}>
              <FileText size={16} color="#fff" />
              <Text style={s.readBtnText}>Read all statements</Text>
            </Pressable>
          )}
        </View>

        {/* recorded verdict */}
        {resolutionMeta && (
          <View style={[s.block, { borderBottomWidth: 0 }]}>
            <View style={s.verdict}>
              <View style={s.verdictHead}>
                <Scale size={16} color="#047857" />
                <Text style={s.verdictTitle}>Recorded verdict</Text>
                <View style={{ flex: 1 }} />
                <Text style={[s.small, { color: '#047857' }]}>{resolutionMeta.split(' on ')[1] || ''}</Text>
              </View>
              <View style={{ padding: 12, gap: 8 }}>
                <Text style={s.verdictTag}>{resolutionMeta.split(' on ')[0] || 'RESOLVED'}</Text>
                <Text style={s.verdictText}>“{existingResolutionNotes}”</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── sticky decision bar */}
      {showBar && (
        <View style={[s.bar, { paddingBottom: insets.bottom + 10 }]} onLayout={(e) => setBarH(e.nativeEvent.layout.height)}>
          {isUnassigned && (
            <>
              <Text style={s.barHint}>This case is waiting for an owner. Claim custody to record findings and take moderation action.</Text>
              <Pressable onPress={handleClaim} disabled={isProcessing === 'claim'} style={[s.btn, { backgroundColor: T.brand }, isProcessing === 'claim' && { opacity: 0.5 }]}>
                {isProcessing === 'claim'
                  ? <><ActivityIndicator color="#fff" size="small" /><Text style={s.btnText}>Claiming Ticket...</Text></>
                  : <Text style={s.btnText}>Claim this case</Text>}
              </Pressable>
            </>
          )}
          {isMine && (
            <>
              <Text style={s.barHint}>Automated remarks will be generated based on the chosen action and report reason.</Text>
              <Pressable onPress={() => setOutcomeOpen(true)} disabled={Boolean(isProcessing)} style={[s.btn, { backgroundColor: T.brand }, Boolean(isProcessing) && { opacity: 0.6 }]}>
                {isProcessing
                  ? <><ActivityIndicator color="#fff" size="small" /><Text style={s.btnText}>{busyAction?.busy || 'Processing...'}</Text></>
                  : <Text style={s.btnText}>Choose an outcome</Text>}
              </Pressable>
            </>
          )}
        </View>
      )}

      {/* ── OUTCOME / CONFIRM SHEET (one modal, content switches) */}
      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={closeSheet}>
        <View style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={closeSheet} />

          {!actionModal.isOpen && (
            <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
              <View style={s.grabber} />
              <View style={s.sheetHeader}>
                <Text style={s.sheetTitle}>Choose an outcome</Text>
                <Pressable onPress={closeSheet} hitSlop={10}><X size={22} color={T.sub} /></Pressable>
              </View>
              <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} showsVerticalScrollIndicator={false}>
                <Text style={s.body}>Automated remarks will be generated based on the chosen action and report reason.</Text>
                {adjudicationActions.map(({ type, Icon, idle, hint, row }) => (
                  <Pressable
                    key={type}
                    onPress={() => handleOpenActionModal(type)}
                    disabled={Boolean(isProcessing)}
                    style={[s.outcomeRow, { backgroundColor: row.bg, borderColor: row.border }]}
                  >
                    <Icon size={18} color={row.fg} />
                    <Text style={[s.outcomeText, { color: row.fg }]}>{idle}</Text>
                    <Text style={[s.outcomeHint, { color: row.hint }]}>{hint}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {actionModal.isOpen && (
            <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
              <View style={s.grabber} />
              <View style={s.sheetHeader}>
                <View style={s.sheetIconRose}><AlertTriangle size={20} color={T.danger} /></View>
                <Text style={[s.sheetTitle, { flex: 1, textTransform: 'capitalize' }]}>Confirm {actionModal.type} action</Text>
                <Pressable onPress={closeSheet} hitSlop={10}><X size={22} color={T.sub} /></Pressable>
              </View>

              <View style={{ padding: 16 }}>
                <Text style={s.body}>
                  You are about to issue a <Text style={{ fontWeight: '700', color: T.text }}>{actionModal.type}</Text> against this user. Please confirm your preferences below:
                </Text>

                {(actionModal.type === 'penalty' || actionModal.type === 'escalate') && (reportedPost || reportedComment) && (
                  <Pressable onPress={() => setDeleteContentOption((v) => !v)} style={s.checkCard} accessibilityState={{ checked: deleteContentOption }}>
                    <View style={[s.checkBox, deleteContentOption && { backgroundColor: T.brand, borderColor: T.brand }]}>
                      {deleteContentOption && <Check size={14} color="#fff" strokeWidth={3} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.nameText}>Remove / Delete offending content immediately</Text>
                      <Text style={[s.small, { marginTop: 4, lineHeight: 18 }]}>If checked, the offender will receive a notification stating their post was permanently removed.</Text>
                    </View>
                  </Pressable>
                )}

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                  <Pressable onPress={() => setActionModal({ isOpen: false, type: null })} style={[s.btn, s.btnGhost, { flex: 1 }]}>
                    <Text style={[s.btnText, { color: T.text }]}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={() => executeFinalAction(actionModal.type, deleteContentOption)} style={[s.btn, { backgroundColor: T.danger, flex: 1.5 }]}>
                    <Text style={s.btnText}>Confirm & execute</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* ── CASE MATERIALS SHEET (comments / statements / parties) */}
      <Modal visible={!!activeDetailModal} transparent animationType="slide" onRequestClose={() => setActiveDetailModal(null)}>
        <View style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setActiveDetailModal(null)} />
          <View style={[s.sheet, { paddingBottom: insets.bottom + 12, maxHeight: '92%' }]}>
            <View style={s.grabber} />
            <View style={s.sheetHeader}>
              <View style={s.sheetIconGreen}><FileText size={20} color="#065f46" /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.small}>Case materials</Text>
                <Text style={s.sheetTitle} numberOfLines={1}>{detailTitle}</Text>
              </View>
              <Pressable onPress={() => setActiveDetailModal(null)} hitSlop={10}><X size={22} color={T.sub} /></Pressable>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
              {activeDetailModal === 'comments' && (
                <>
                  <View style={s.infoCard}>
                    <Text style={s.nameText}>Conversation timeline</Text>
                    <Text style={[s.small, { marginTop: 2, lineHeight: 18 }]}>Replies are nested under their parent comment. The reported comment is highlighted.</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <Text style={[s.tag, { backgroundColor: T.field, color: T.sub }]}>{topLevelCommentCount} {topLevelCommentCount === 1 ? 'thread' : 'threads'}</Text>
                      <Text style={[s.tag, { backgroundColor: T.soft, color: '#047857' }]}>{totalReplyCount} {totalReplyCount === 1 ? 'reply' : 'replies'}</Text>
                    </View>
                  </View>
                  <View style={{ marginTop: 14 }}>
                    <ModerationCommentThread comments={postComments} flaggedCommentId={reportedComment?.id} />
                  </View>
                </>
              )}

              {activeDetailModal === 'claims' && (
                <>
                  <View style={s.infoCard}>
                    <View style={{ gap: 10 }}>
                      <View><Text style={s.small}>Reason</Text><Text style={s.rowTitle}>{claimReasonSummary}</Text></View>
                      <View><Text style={s.small}>Content category</Text><Text style={s.rowTitle}>{contentCategory}</Text></View>
                      <View><Text style={s.small}>Reference type</Text><Text style={[s.rowTitle, { textTransform: 'capitalize' }]}>{report.reference_type || 'Not specified'}</Text></View>
                    </View>
                  </View>
                  {clusteredReports.map((claim) => {
                    const { complainantText } = parseReportDetails(claim.details);
                    return (
                      <View key={claim.id} style={s.claimCard}>
                        <View style={s.claimHead}>
                          <Avatar url={claim.reporter?.avatar_url} name={claim.reporter?.full_name} size={36} bg={T.field} border={T.border} fg={T.sub} />
                          <View style={{ flex: 1 }}>
                            <Text style={s.nameText} numberOfLines={1}>{claim.reporter?.full_name || 'Anonymous User'}</Text>
                            <Text style={[s.small, { textTransform: 'capitalize' }]}>{claim.reporter?.role || 'User'}</Text>
                          </View>
                        </View>
                        <Text style={[s.small, { marginTop: 8 }]}>{fmtStamp(claim.created_at)}</Text>
                        <View style={s.reasonBox}>
                          <Text style={s.small}>Reason for this filing</Text>
                          <Text style={[s.nameText, { fontWeight: '500' }]}>{claim.reason || report.reason || 'Not specified'}</Text>
                        </View>
                        <Text style={s.commentText}>{complainantText}</Text>
                      </View>
                    );
                  })}
                </>
              )}

              {activeDetailModal === 'parties' && (
                <>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={[s.partyTile, { backgroundColor: '#fff', borderColor: T.line }]}>
                      <Text style={s.small}>Complainants</Text>
                      <Text style={s.statNum}>{involvedReporters.length}</Text>
                      <Text style={s.small}>{clusteredReports.length} linked filing{clusteredReports.length === 1 ? '' : 's'}</Text>
                    </View>
                    <View style={[s.partyTile, { backgroundColor: '#fff1f2', borderColor: '#fecdd3' }]}>
                      <Text style={[s.small, { color: '#be123c' }]}>Reported subject</Text>
                      <Text style={[s.rowTitle, { marginTop: 4 }]} numberOfLines={2}>{report.reported?.full_name || 'Flagged User'}</Text>
                      <Text style={[s.small, { textTransform: 'capitalize' }]}>{report.reported?.role || 'User'}</Text>
                    </View>
                  </View>

                  <Text style={s.sectionLabel}>Filing parties</Text>
                  <View style={s.partyList}>
                    {involvedReporters.map((claim, i) => {
                      const key = claim.reporter_id || claim.reporter?.id || claim.id;
                      const name = claim.reporter?.full_name || 'Anonymous User';
                      return (
                        <View key={key} style={[s.partyRow, i > 0 && { borderTopWidth: 1, borderTopColor: T.line }]}>
                          <Avatar url={claim.reporter?.avatar_url} name={name} size={40} bg={T.field} border={T.border} fg={T.sub} />
                          <View style={{ flex: 1 }}>
                            <Text style={s.nameText} numberOfLines={1}>{name}</Text>
                            <Text style={[s.small, { textTransform: 'capitalize' }]}>{claim.reporter?.role || 'User'}</Text>
                          </View>
                          <Text style={[s.tag, { backgroundColor: T.field, color: T.sub }]}>{reporterReportCounts.get(key) || 1} {reporterReportCounts.get(key) === 1 ? 'filing' : 'filings'}</Text>
                        </View>
                      );
                    })}
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── EVIDENCE VIEWER */}
      <ImageGalleryModal images={imageGallery?.images || []} initialIndex={imageGallery?.index ?? 0} onClose={() => setImageGallery(null)} />
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  small: { fontSize: 13, color: T.sub },
  rowTitle: { fontSize: 15, fontWeight: '700', color: T.text },
  nameText: { fontSize: 14, fontWeight: '700', color: T.text },
  label: { fontSize: 13, fontWeight: '600', color: T.sub, marginBottom: 8 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: T.sub, marginTop: 18, marginBottom: 8 },
  tag: { fontSize: 12, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
  time: { fontSize: 12, color: '#8b98a5', marginTop: 1, marginBottom: 6 },
  emptyIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: T.strip, borderWidth: 1, borderColor: T.line, alignItems: 'center', justifyContent: 'center' },
  fillBtn: { marginTop: 18, height: 42, paddingHorizontal: 20, borderRadius: 21, backgroundColor: T.brand, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  fillBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // header
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingBottom: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: T.line },
  headBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headTitle: { fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2 },
  statusPill: { paddingHorizontal: 11, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  statusText: { fontSize: 12, fontWeight: '700' },

  // notices + blocks
  notice: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.line },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 19 },
  block: { paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: T.line },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2, marginBottom: 2 },

  // summary
  subjectRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stats: { flexDirection: 'row', marginTop: 16, borderWidth: 1, borderColor: T.line, borderRadius: 12 },
  stat: { flex: 1, padding: 12 },
  statNum: { fontSize: 22, fontWeight: '700', color: T.text, letterSpacing: -0.5, marginVertical: 2 },
  statDivider: { width: 1, backgroundColor: T.line },
  ownerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: T.strip, borderWidth: 1, borderColor: T.line },
  ownerDot: { width: 10, height: 10, borderRadius: 5 },
  progress: { flexDirection: 'row', marginTop: 16, gap: 8 },
  step: { flex: 1 },
  stepDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  stepLabel: { fontSize: 13, fontWeight: '700', color: T.text },
  stepDetail: { fontSize: 12, lineHeight: 16, color: T.sub, marginTop: 2 },

  // evidence
  commentCard: { borderWidth: 1, borderColor: '#fecdd3', borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff' },
  commentCardHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff1f2', borderBottomWidth: 1, borderBottomColor: '#ffe4e6' },
  commentCardTitle: { fontSize: 13, fontWeight: '700', color: '#9f1239' },
  quote: { marginTop: 12, borderLeftWidth: 3, borderLeftColor: '#fda4af', backgroundColor: '#fff1f2', paddingHorizontal: 12, paddingVertical: 10 },
  quoteText: { fontSize: 14, lineHeight: 21, color: T.text },
  postCard: { borderWidth: 1, borderColor: T.line, borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff' },
  postHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12 },
  catChip: { fontSize: 12, fontWeight: '600', color: T.sub, backgroundColor: T.field, borderWidth: 1, borderColor: T.field, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  postText: { fontSize: 14, lineHeight: 22, color: T.text, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12 },
  evidenceBlock: { marginHorizontal: 12, paddingTop: 12, paddingBottom: 12, borderTopWidth: 1, borderTopColor: T.line },
  collageOne: { width: '100%', aspectRatio: 16 / 9, borderRadius: 10, overflow: 'hidden', backgroundColor: T.field },
  collageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  collageTile: { width: '49.3%', aspectRatio: 1, borderRadius: 8, overflow: 'hidden', backgroundColor: T.field },
  collageMore: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  collageMoreText: { fontSize: 24, fontWeight: '700', color: '#fff' },
  discussionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: T.strip, borderTopWidth: 1, borderTopColor: T.line },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: '#fff', borderWidth: 1, borderColor: T.border },
  smallBtnText: { fontSize: 13, fontWeight: '700', color: T.text },
  noContent: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: T.border, borderRadius: 12 },

  // complaint record + verdict
  readBtn: { height: 44, borderRadius: 22, backgroundColor: T.brand, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  readBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  verdict: { borderWidth: 1, borderColor: '#a7f3d0', borderRadius: 12, overflow: 'hidden' },
  verdictHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: T.soft, borderBottomWidth: 1, borderBottomColor: '#d1fae5' },
  verdictTitle: { fontSize: 13, fontWeight: '700', color: '#064e3b' },
  verdictTag: { alignSelf: 'flex-start', fontSize: 11, fontWeight: '700', color: '#064e3b', backgroundColor: '#d1fae5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden', textTransform: 'uppercase' },
  verdictText: { fontSize: 14, lineHeight: 21, color: T.text },

  // sticky bar
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: T.line, gap: 10 },
  barHint: { fontSize: 13, lineHeight: 18, color: T.sub },
  btn: { height: 46, borderRadius: 23, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { borderWidth: 1, borderColor: T.border, backgroundColor: '#fff' },
  btnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // sheets
  overlay: { flex: 1, backgroundColor: 'rgba(15,20,25,0.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: T.border, marginTop: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.line },
  sheetIconRose: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#fff1f2', alignItems: 'center', justifyContent: 'center' },
  sheetIconGreen: { width: 38, height: 38, borderRadius: 12, backgroundColor: T.soft, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2 },
  body: { fontSize: 14, lineHeight: 21, color: T.sub },
  outcomeRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1 },
  outcomeText: { flex: 1, fontSize: 15, fontWeight: '700' },
  outcomeHint: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  checkCard: { flexDirection: 'row', gap: 12, marginTop: 16, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: T.line, backgroundColor: T.strip },
  checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: T.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginTop: 1 },

  // case materials
  infoCard: { borderWidth: 1, borderColor: T.line, borderRadius: 12, padding: 14, backgroundColor: T.strip },
  nested: { marginLeft: 14, borderLeftWidth: 2, borderLeftColor: T.line, paddingLeft: 10, gap: 12 },
  commentBox: { borderWidth: 1, borderColor: T.line, borderRadius: 12, padding: 12, backgroundColor: '#fff' },
  commentHead: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  commentName: { flexShrink: 1, fontSize: 14, fontWeight: '700', color: T.text },
  commentText: { fontSize: 14, lineHeight: 21, color: T.text },
  collapseBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, alignSelf: 'flex-start' },
  collapseText: { fontSize: 13, fontWeight: '700', color: '#047857' },
  claimCard: { marginTop: 12, borderWidth: 1, borderColor: T.line, borderRadius: 12, padding: 14, backgroundColor: '#fff' },
  claimHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reasonBox: { marginTop: 10, marginBottom: 10, padding: 10, borderRadius: 10, backgroundColor: T.strip, borderWidth: 1, borderColor: T.line },
  partyTile: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 12 },
  partyList: { borderWidth: 1, borderColor: T.line, borderRadius: 12, overflow: 'hidden' },
  partyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },

  // evidence viewer
  lightbox: { flex: 1, backgroundColor: '#111916' },
  lightHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  lightIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  lightTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  lightSub: { fontSize: 12, color: '#9ca3af' },
  lightClose: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  lightFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  lightNav: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  lightCount: { fontSize: 14, fontWeight: '600', color: '#d1d5db' },
});