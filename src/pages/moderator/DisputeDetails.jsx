import { Alert } from '../../components/SkillCreditAlert';
// ═══════════════════════════════════════════════════════════════
//  MOBILE APP (Expo React Native) — src/pages/moderator/DisputeDetails.jsx
//  Same queries, same conflict-of-interest guard, same claim step and the SAME escrow
//  ruling as the web (secure atomic dispute RPC -> issue_penalty ->
//  repeat_offenders / admin_escalations (3+ strikes) ->
//  report update -> mod_logs -> two notifications). Only the presentation changed.
//  Mobile layout: one column (summary, participants, filed statement, session
//  conversation as evidence) with ONE sticky decision bar. The ruling modal, the
//  image lightbox and the skill details modal are now sheets / a full-screen viewer.
//  Open it with: navigation.navigate('DisputeDetails', { id })   (root-stack screen)
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useLayoutEffect } from 'react';
import {
  View, Text, Image, Pressable, ScrollView, Modal, Linking, ActivityIndicator, StyleSheet,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertTriangle, ArrowLeft, ArrowRight, BookOpen, Calendar, Check, Clock, Download, Hand, Users, Wallet, X,
} from 'lucide-react-native';
import supabase from '../../supabaseClient';

const T = {
  text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4',
  brand: '#047857', soft: '#ecfdf5', strip: '#f7f9f9', danger: '#be123c',
};

// ─── AUTO-GENERATED DISPUTE NOTES LOGIC ───
function getDisputeAutoNote(actionType) {
  if (actionType === 'warning') {
    return 'Unprofessional conduct or minor policy violations were detected during this session. Please review our booking and session guidelines.';
  }
  if (actionType === 'penalty') {
    return 'Fraudulent activity, severe unprofessionalism, or deliberate failure to deliver services confirmed. Your booking privileges are temporarily suspended.';
  }
  if (actionType === 'escalate') {
    return 'Case escalated to Administration due to suspected severe fraud or repeated escrow abuse. The account requires a final review.';
  }
  return 'Standard escrow resolution. No disciplinary policy violations found.';
}

// ─── PARSERS FOR BOOKING CARDS & REPLIES ───
const BOOKING_PREFIX = '__BOOKING_REQUEST__::';
const REPLY_PREFIX = '__REPLY__:';
const REPLY_SUFFIX = '::__\n';

function parseBookingRequest(content) {
  if (!content || !content.startsWith(BOOKING_PREFIX)) return null;
  try {
    const json = content.slice(BOOKING_PREFIX.length);
    return JSON.parse(json);
  } catch { return null; }
}

function parseReply(content) {
  if (!content || !content.startsWith(REPLY_PREFIX)) return null;
  try {
    const end = content.indexOf(REPLY_SUFFIX);
    if (end === -1) return null;
    const json = content.slice(REPLY_PREFIX.length, end);
    return JSON.parse(json);
  } catch { return null; }
}

function stripReplyPrefix(content) {
  if (!content) return content;
  const end = content.indexOf(REPLY_SUFFIX);
  if (end === -1) return content;
  return content.slice(end + REPLY_SUFFIX.length);
}

const fmtShort = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtStamp = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

// ─── TIME DIVIDER UI ───
const ChatDivider = ({ label }) => (
  <View style={s.divider}>
    <View style={s.dividerLine} />
    <Text style={s.dividerText}>{label}</Text>
    <View style={s.dividerLine} />
  </View>
);

// the four disciplinary choices shown in the ruling sheet
const DISCIPLINE = [
  { id: 'standard', title: 'Standard resolution',      tag: null,       sub: 'Transfer funds only. No penalty or strike applied.',               on: { border: '#34d399', bg: '#ecfdf5' }, fg: T.text },
  { id: 'warning',  title: 'Issue formal warning',     tag: '+1 Strike', sub: 'For unprofessional conduct or minor policy violations.',           on: { border: '#fbbf24', bg: '#fffbeb' }, fg: '#78350f' },
  { id: 'penalty',  title: 'Apply 12h booking timeout', tag: '+1 Strike', sub: 'For fraudulent activity, severe unprofessionalism, or no-shows.', on: { border: '#fb923c', bg: '#fff7ed' }, fg: '#7c2d12' },
  { id: 'escalate', title: 'Escalate to Admin',        tag: null,       sub: 'For repeated escrow abuse requiring permanent ban review.',        on: { border: '#fb7185', bg: '#fff1f2' }, fg: '#881337' },
];

export default function DisputeDetails() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const id = route.params?.id;

  const [currentUserId, setCurrentUserId] = useState(null);
  const [report, setReport] = useState(null);
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [barH, setBarH] = useState(0);

  const [previewImage, setPreviewImage] = useState(null);
  const [selectedBookingData, setSelectedBookingData] = useState(null);

  const [bookingSkillDetails, setBookingSkillDetails] = useState({
    description: '',
    outcomes: '',
    category: '',
    format: '',
    duration: '',
    loading: false,
  });

  // ── Resolution Modal State ──
  const [resolutionModal, setResolutionModal] = useState({ isOpen: false, decision: null });
  const [disciplinaryAction, setDisciplinaryAction] = useState('standard');

  // this screen draws its own back bar
  useLayoutEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);

  // back to the disputes queue (the screen that opened this one)
  const goQueue = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Mod', { screen: 'Disputes' });
  };

  useEffect(() => {
    const fetchSkillDetails = async () => {
      if (selectedBookingData?.skill_id) {
        setBookingSkillDetails((prev) => ({ ...prev, loading: true }));
        const { data } = await supabase
          .from('skills')
          .select('description, outcomes, category, format, duration')
          .eq('id', selectedBookingData.skill_id)
          .maybeSingle();

        if (data) {
          setBookingSkillDetails({
            description: data.description || 'No description provided.',
            outcomes: data.outcomes || 'No outcomes listed.',
            category: data.category || 'Uncategorized',
            format: data.format || 'N/A',
            duration: data.duration || 'N/A',
            loading: false,
          });
        } else {
          setBookingSkillDetails({
            description: 'Description unavailable.',
            outcomes: 'Outcome unavailable.',
            category: 'N/A', format: 'N/A', duration: 'N/A',
            loading: false,
          });
        }
      }
    };
    fetchSkillDetails();
  }, [selectedBookingData]);

  const fetchDisputeData = async (userId) => {
    setLoading(true);
    try {
      const { data: reportData, error: reportErr } = await supabase
        .from('reports')
        .select(`*, reporter:user_profiles!reports_reporter_id_fkey(id, full_name, role), reported:user_profiles!reports_reported_user_id_fkey(id, full_name, role), assignee:user_profiles!reports_assigned_to_fkey(id, full_name)`)
        .eq('id', id)
        .maybeSingle();

      if (reportErr) throw reportErr;
      if (!reportData) { setReport(null); setSession(null); return; }

      setReport(reportData);

      const { data: sessionData, error: sessionErr } = await supabase
        .from('sessions')
        .select(`*, skill:skills(title), student:user_profiles!sessions_student_id_fkey(id, full_name, credits_balance), instructor:user_profiles!sessions_instructor_id_fkey(id, full_name, credits_balance)`)
        .eq('id', reportData.reference_id)
        .maybeSingle();

      if (sessionErr) throw sessionErr;

      if (sessionData) {
        setSession(sessionData);
        const { data: messagesData, error: msgErr } = await supabase
          .from('messages')
          .select(`id, session_id, sender_id, content, file_url, file_type, created_at, sender:user_profiles!sender_id(id, full_name, avatar_url)`)
          .eq('session_id', sessionData.id)
          .order('created_at', { ascending: true });

        if (msgErr) throw msgErr;
        setMessages(messagesData || []);
      } else {
        setSession(null);
      }
    } catch (err) {
      console.error('Failed to load dispute dossier:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) { setCurrentUserId(user.id); fetchDisputeData(user.id); }
    };
    init();
  }, [id]);

  const isParticipant = Boolean(currentUserId && session && (currentUserId === session.student_id || currentUserId === session.instructor_id));

  const handleClaim = async () => {
    if (isParticipant) { Alert.alert('Action blocked: Conflict of interest policy prohibits self-adjudication.'); return; }
    setIsProcessing(true);
    try {
      const { error } = await supabase.from('reports').update({ assigned_to: currentUserId }).eq('id', report.id);
      if (error) throw error;
      await fetchDisputeData(currentUserId);
    } catch (err) { Alert.alert('Failed to claim ticket: ' + err.message); } finally { setIsProcessing(false); }
  };

  const openResolutionModal = (decision) => {
    if (isParticipant) { Alert.alert('Action blocked: Conflict of interest policy prohibits self-adjudication.'); return; }
    setDisciplinaryAction('standard');
    setResolutionModal({ isOpen: true, decision });
  };

  const finalizeResolution = async () => {
    const decision = resolutionModal.decision;
    setResolutionModal({ isOpen: false, decision: null });
    setIsProcessing(true);
    let escrowResolved = false;

    try {
      const winnerId = decision === 'Learner' ? session.student_id : session.instructor_id;
      const loserId = decision === 'Learner' ? session.instructor_id : session.student_id;

      const adjustmentAmount = Number(session.credit_amount || 0);
      // Payout, report resolution and session outcome all commit in one RPC.
      const { data: resolution, error: resolutionError } = await supabase.rpc(
        'skillcredit_secure_resolve_dispute', {
          p_report_id: report.id,
          p_decision: decision,
        }
      );
      if (resolutionError) throw resolutionError;
      // The backend may already have committed even if the response is odd.
      escrowResolved = true;
      if (resolution?.state !== 'resolved' || resolution?.awarded !== true) {
        throw new Error('Dispute response could not be verified. Check the case; do NOT retry the credit payout.');
      }

      const autoNote = getDisputeAutoNote(disciplinaryAction);
      const timestamp = new Date().toLocaleString();

      if (disciplinaryAction === 'warning') {
        await supabase.rpc('issue_penalty', { target_id: loserId, strike_to_add: 1, penalty_hours: 0, penalty_type: 'booking' });
      } else if (disciplinaryAction === 'penalty') {
        await supabase.rpc('issue_penalty', { target_id: loserId, strike_to_add: 1, penalty_hours: 12, penalty_type: 'booking' });
      }

      // ─── REPEAT OFFENDERS & ADMIN ESCALATIONS INTEGRATION (WITH MODERATOR_ID) ───
      if (disciplinaryAction === 'warning' || disciplinaryAction === 'penalty' || disciplinaryAction === 'escalate') {
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('violation_count')
          .eq('id', loserId)
          .single();

        if (profileData) {
          const currentCount = profileData.violation_count || 0;

          if (currentCount >= 3) {
            const { data: existingOffender } = await supabase
              .from('repeat_offenders')
              .select('id')
              .eq('user_id', loserId)
              .maybeSingle();

            let repeatOffenderId = existingOffender?.id;

            if (!existingOffender) {
              const { data: newOffender, error: insertOffenderErr } = await supabase
                .from('repeat_offenders')
                .insert([{ user_id: loserId, moderator_id: currentUserId }])
                .select('id')
                .single();

              if (!insertOffenderErr && newOffender) {
                repeatOffenderId = newOffender.id;
              }
            }

            if (disciplinaryAction === 'escalate') {
              if (!repeatOffenderId) {
                console.warn('Escalation skipped because repeat offender record was unavailable.');
              } else {
                const { error: escalationError } = await supabase
                  .from('admin_escalations')
                  .insert([{
                    repeat_offender_id: repeatOffenderId,
                    moderator_id: currentUserId,
                    status: 'pending',
                  }]);
                if (escalationError) console.warn('Admin escalation failed:', escalationError);
              }
            }
          }
        }
      }
      // ────────────────────────────────────────────────────────

      // RPC already set reports.status = resolved. These are notes only.
      const updatedDetails = `${report.details}\n\n[RESOLVED - FAVOR ${decision.toUpperCase()} on ${timestamp}]: ${autoNote}`;

      const { error: reportUpdateErr } = await supabase.from('reports').update({ details: updatedDetails, mod_action_notes: autoNote }).eq('id', report.id);
      if (reportUpdateErr) throw reportUpdateErr;

      const logDetails = decision === 'Learner'
        ? `Refunded ${adjustmentAmount} credits to Learner. Penalty applied to Instructor: ${disciplinaryAction.toUpperCase()}.`
        : `Released ${adjustmentAmount} credits to Instructor. Penalty applied to Learner: ${disciplinaryAction.toUpperCase()}.`;

      await supabase.from('mod_logs').insert([{ moderator_id: currentUserId, target_user_id: loserId, action_type: 'RESOLVE_DISPUTE', reference_id: report.id, details: logDetails }]);

      const tutorialTitle = session.skill?.title || 'Skill Session';

      await supabase.from('notifications').insert([{
        user_id: winnerId,
        type: 'dispute_resolved',
        content: `The dispute for session '${tutorialTitle}' has been resolved in your favor. The escrowed credits have been securely transferred to your wallet.`,
        link_url: `/sessions?session=${session.id}`,
      }]);

      let loserNotifType = 'dispute_resolved';
      let loserNotifContent = `The dispute for session '${tutorialTitle}' was resolved in favor of the other party. The escrowed credits have been released to them.`;

      if (disciplinaryAction === 'warning') {
        loserNotifType = 'account_warning';
        loserNotifContent = `Your profile received a warning regarding your conduct in session '${tutorialTitle}'.\n\nModerator Note: ${autoNote}`;
      } else if (disciplinaryAction === 'penalty') {
        loserNotifType = 'account_penalized';
        loserNotifContent = `Your account has been temporarily restricted for 12 hours from booking and creating listings regarding your conduct in session '${tutorialTitle}'.\n\nModerator Note: ${autoNote}`;
      } else if (disciplinaryAction === 'escalate') {
        loserNotifType = 'account_escalated';
        loserNotifContent = `Your account behavior has been escalated to an Administrator for severe review regarding session '${tutorialTitle}'.\n\nModerator Note: ${autoNote}`;
      }

      await supabase.from('notifications').insert([{
        user_id: loserId,
        type: loserNotifType,
        content: loserNotifContent,
        link_url: `/sessions?session=${session.id}`,
      }]);

      Alert.alert(`Dispute successfully closed in favor of the ${decision}. Action executed.`);
      goQueue();
    } catch (err) {
      console.error('Dispute resolution failed:', err);
      if (escrowResolved) {
        Alert.alert('Payout already processed', 'Credits and report status were already processed. Some follow-up action may be incomplete. Do NOT retry the payout. Check the case. ' + (err?.message || ''));
        goQueue();
      } else {
        Alert.alert('Error finalizing verdict: ' + (err?.message || 'Unknown error'));
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const openFile = (url) => { Linking.openURL(url).catch(() => {}); };

  // ─── shared top bar (back + title + status)
  const TopBar = (
    <View style={[s.header, { paddingTop: insets.top + 6 }]}>
      <Pressable onPress={goQueue} style={s.headBtn} hitSlop={8} accessibilityLabel="Back to disputes">
        <ArrowLeft size={22} color={T.text} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={s.headTitle}>Dispute review</Text>
        {!!report && <Text style={s.small}>Case #{report.id.slice(0, 8)}</Text>}
      </View>
      {!!report && (
        <View style={[s.statusPill, report.status === 'pending' ? { backgroundColor: '#fffbeb' } : { backgroundColor: T.soft }]}>
          <Text style={[s.statusText, { color: report.status === 'pending' ? '#92400e' : '#065f46' }]}>{report.status}</Text>
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

  if (!report || !session) {
    return (
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        {TopBar}
        <View style={s.center}>
          <Text style={s.rowTitle}>Record not found</Text>
          <Text style={[s.small, { textAlign: 'center', marginTop: 4 }]}>This dispute ticket or its associated session reference does not exist in the database.</Text>
          <Pressable onPress={goQueue} style={s.fillBtn}><Text style={s.fillBtnText}>Return to disputes</Text></Pressable>
        </View>
      </View>
    );
  }

  const isReporterStudent = report.reporter_id === session.student_id;

  // ── Display-only values (no new data is fetched) ──
  const isPendingCase = report.status === 'pending';
  const assignedLabel = report.assigned_to
    ? (report.assigned_to === currentUserId ? 'You' : report.assignee?.full_name || 'Another moderator')
    : 'Unassigned';
  const progressSteps = [
    { label: 'Filed', done: true, detail: report.created_at ? fmtShort(report.created_at) : 'On record' },
    { label: 'Claimed', done: Boolean(report.assigned_to), detail: report.assigned_to ? `By ${assignedLabel}` : 'Waiting for a moderator' },
    { label: 'Decision', done: !isPendingCase, detail: !isPendingCase ? 'Resolved' : 'Not decided yet' },
  ];
  const currentStepIndex = progressSteps.findIndex((step) => !step.done);

  const canDecide = !isParticipant && report.status === 'pending';
  const isUnassigned = canDecide && !report.assigned_to;
  const isMine = canDecide && report.assigned_to === currentUserId;
  const isOther = canDecide && !!report.assigned_to && report.assigned_to !== currentUserId;
  const isSettled = !isParticipant && report.status !== 'pending';
  const showBar = isUnassigned || isMine;

  const participants = [
    { role: 'Learner', person: session.student, isReporter: isReporterStudent, completed: session.student_completed },
    { role: 'Instructor', person: session.instructor, isReporter: !isReporterStudent, completed: session.instructor_completed },
  ];

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
              You are registered as an active participant ({currentUserId === session.student_id ? 'Learner' : 'Instructor'}) in this session. Case controls have been locked to maintain institutional impartiality.
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
        {isSettled && (
          <View style={[s.notice, { backgroundColor: T.soft }]}>
            <Check size={20} color="#047857" style={{ marginTop: 1 }} />
            <Text style={[s.noticeText, { color: '#065f46', fontWeight: '600' }]}>This dispute is settled and the escrow transaction has been recorded.</Text>
          </View>
        )}

        {/* summary */}
        <View style={s.block}>
          <Text style={s.title}>{session.skill?.title || 'Session booking'}</Text>
          <Text style={s.small}>Review the session record and escrow outcome.</Text>
          <View style={s.infoRow}>
            <Wallet size={17} color={T.sub} />
            <Text style={s.infoStrong}>{session.credit_amount} credits in escrow</Text>
          </View>
          <View style={s.infoRow}>
            <Calendar size={17} color={T.sub} />
            <Text style={s.infoText}>{session.scheduled_date || 'Date unavailable'}{session.scheduled_time ? ` · ${session.scheduled_time}` : ''}</Text>
          </View>

          <View style={s.ownerRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.small}>Case owner</Text>
              <Text style={s.rowTitle} numberOfLines={1}>{assignedLabel}</Text>
              <Text style={s.small}>{report.assigned_to ? 'Ticket in custody' : 'Open for any moderator'}</Text>
            </View>
            <View style={[s.ownerDot, { backgroundColor: report.assigned_to ? '#10b981' : '#f59e0b' }]} />
          </View>

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

        {/* participants */}
        <View style={s.block}>
          <Text style={s.sectionTitle}>Participants</Text>
          {participants.map((p, idx) => (
            <View key={p.role} style={[s.personRow, idx > 0 && { borderTopWidth: 1, borderTopColor: T.line }]}>
              <View style={s.avatar}>
                <Text style={s.avatarText}>{p.person?.full_name?.charAt(0)?.toUpperCase() || '?'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[s.rowTitle, { flexShrink: 1 }]} numberOfLines={1}>{p.person?.full_name || `${p.role} not available`}</Text>
                  {p.isReporter && <Text style={s.reporterTag}>Reporter</Text>}
                </View>
                <Text style={s.small}>{p.role}</Text>
              </View>
              <View style={[s.doneChip, p.completed ? { backgroundColor: T.soft } : { backgroundColor: T.field }]}>
                {p.completed ? <Check size={13} color="#047857" /> : <Clock size={13} color={T.sub} />}
                <Text style={[s.doneText, { color: p.completed ? '#047857' : T.sub }]}>{p.completed ? 'Completed' : 'Not completed'}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* filed statement */}
        <View style={s.block}>
          <Text style={s.sectionTitle}>Filed statement</Text>
          <Text style={s.label}>Reason</Text>
          <Text style={s.rowTitle}>{report.reason || 'Not specified'}</Text>
          <Text style={[s.label, { marginTop: 14 }]}>Reporter’s account</Text>
          <View style={s.accountBox}>
            <Text style={s.accountText}>{report.details || 'No additional details were provided.'}</Text>
          </View>
        </View>

        {/* evidence: session conversation */}
        <View style={[s.block, { borderBottomWidth: 0 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={s.sectionTitle}>Session conversation</Text>
            <Text style={s.countChip}>{messages.length} {messages.length === 1 ? 'message' : 'messages'}</Text>
          </View>
          <Text style={[s.small, { marginBottom: 6 }]}>Messages and evidence shared in this session.</Text>

          {messages.length === 0 ? (
            <View style={s.emptyChat}>
              <Text style={s.rowTitle}>No session messages</Text>
              <Text style={[s.small, { textAlign: 'center', marginTop: 4 }]}>No chat messages or attachments were recorded for this session.</Text>
            </View>
          ) : (
            messages.map((msg, i) => {
              const isStudentSender = msg.sender_id === session.student_id;
              const isInstructorSender = msg.sender_id === session.instructor_id;

              const bookingData = parseBookingRequest(msg.content);
              const replyData = parseReply(msg.content);
              const bodyText = replyData ? stripReplyPrefix(msg.content) : msg.content;

              const prevMsg = messages[i - 1];
              const thisDate = new Date(msg.created_at);
              let dividerLabel = null;

              if (!prevMsg || thisDate.toDateString() !== new Date(prevMsg.created_at).toDateString()) {
                dividerLabel = thisDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
              } else if (thisDate - new Date(prevMsg.created_at) > 60 * 60 * 1000) {
                dividerLabel = thisDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              }

              const isImage = msg.file_url && (msg.file_type?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(msg.file_url));
              const textToShow = bookingData ? bookingData.userMsg : bodyText;

              return (
                <View key={msg.id}>
                  {dividerLabel && <ChatDivider label={dividerLabel} />}

                  <View style={[s.msgRow, isInstructorSender && { flexDirection: 'row-reverse' }]}>
                    <View style={s.msgAvatar}>
                      {msg.sender?.avatar_url
                        ? <Image source={{ uri: msg.sender.avatar_url }} style={{ width: 32, height: 32 }} />
                        : <Text style={s.msgAvatarText}>{msg.sender?.full_name?.charAt(0) || 'U'}</Text>}
                    </View>

                    <View style={{ flex: 1, alignItems: isInstructorSender ? 'flex-end' : 'flex-start' }}>
                      <View style={[s.msgHead, isInstructorSender && { flexDirection: 'row-reverse' }]}>
                        <Text style={s.msgName} numberOfLines={1}>{msg.sender?.full_name || 'User'}</Text>
                        {isStudentSender && <Text style={s.roleTag}>Learner</Text>}
                        {isInstructorSender && <Text style={s.roleTag}>Teacher</Text>}
                      </View>
                      <Text style={s.time}>{fmtStamp(msg.created_at)}</Text>

                      <View style={[s.bubble, { maxWidth: '92%' }, isInstructorSender && { backgroundColor: '#e8f1eb', borderColor: '#bbf7d0' }]}>
                        {replyData && (
                          <View style={s.replyBox}>
                            <Text style={s.replyName}>Replying to {replyData.name}</Text>
                            <Text style={s.replySnippet} numberOfLines={1}>{replyData.snippet || 'Image'}</Text>
                          </View>
                        )}

                        {bookingData ? (
                          <Pressable onPress={() => setSelectedBookingData(bookingData)} style={s.bookCard}>
                            <View style={s.bookHead}>
                              <Calendar size={13} color="#fff" />
                              <Text style={s.bookHeadText}>Booking request · tap to view</Text>
                            </View>
                            <View style={s.bookBody}>
                              {bookingData.image ? (
                                <Image source={{ uri: bookingData.image }} style={s.bookThumb} />
                              ) : (
                                <View style={[s.bookThumb, { backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center' }]}>
                                  <Calendar size={20} color="#f59e0b" />
                                </View>
                              )}
                              <View style={{ flex: 1 }}>
                                <Text style={s.bookTitle} numberOfLines={1}>{bookingData.title}</Text>
                                <Text style={s.bookMeta}>
                                  {new Date(bookingData.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} • {bookingData.time}
                                </Text>
                                <Text style={s.bookCost}>{bookingData.cost} CR</Text>
                              </View>
                            </View>
                          </Pressable>
                        ) : null}

                        {!!textToShow && <Text style={s.msgText}>{textToShow}</Text>}

                        {!!msg.file_url && (
                          <View style={[(!!textToShow || !!bookingData || !!replyData) && s.fileSep]}>
                            {isImage ? (
                              <Pressable onPress={() => setPreviewImage(msg.file_url)} style={s.evidenceWrap} accessibilityLabel="View evidence image">
                                <Image source={{ uri: msg.file_url }} style={s.evidenceImg} resizeMode="contain" />
                              </Pressable>
                            ) : (
                              <Pressable onPress={() => openFile(msg.file_url)} style={s.fileBtn}>
                                <Download size={16} color={T.text} />
                                <Text style={s.fileBtnText}>Download file attachment</Text>
                              </Pressable>
                            )}
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* ── sticky decision bar */}
      {showBar && (
        <View style={[s.bar, { paddingBottom: insets.bottom + 10 }]} onLayout={(e) => setBarH(e.nativeEvent.layout.height)}>
          {isUnassigned && (
            <>
              <Text style={s.barHint}>This case is unassigned. Claim it to record the escrow decision.</Text>
              <Pressable onPress={handleClaim} disabled={isProcessing} style={[s.btn, { backgroundColor: T.text }, isProcessing && { opacity: 0.5 }]}>
                {isProcessing
                  ? <><ActivityIndicator color="#fff" size="small" /><Text style={s.btnText}>Claiming case...</Text></>
                  : <><Hand size={18} color="#fff" /><Text style={s.btnText}>Claim case</Text></>}
              </Pressable>
            </>
          )}
          {isMine && (
            <>
              <Text style={s.barHint}>Choose who should receive the <Text style={{ fontWeight: '700', color: T.text }}>{session.credit_amount} credits</Text> held in escrow.</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable onPress={() => openResolutionModal('Learner')} disabled={isProcessing} style={[s.choice, { backgroundColor: T.soft, borderColor: '#a7f3d0' }, isProcessing && { opacity: 0.5 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <ArrowLeft size={15} color="#065f46" />
                    <Text style={[s.choiceTitle, { color: '#064e3b' }]}>Refund Learner</Text>
                  </View>
                  <Text style={[s.choiceSub, { color: '#047857' }]} numberOfLines={1}>{session.credit_amount} CR · {session.student?.full_name?.split(' ')[0] || 'student'}</Text>
                </Pressable>
                <Pressable onPress={() => openResolutionModal('Teacher')} disabled={isProcessing} style={[s.choice, { backgroundColor: '#fff', borderColor: T.border }, isProcessing && { opacity: 0.5 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[s.choiceTitle, { color: T.text }]}>Release to Instructor</Text>
                    <ArrowRight size={15} color={T.text} />
                  </View>
                  <Text style={[s.choiceSub, { color: T.sub }]} numberOfLines={1}>{session.credit_amount} CR · {session.instructor?.full_name?.split(' ')[0] || 'teacher'}</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      )}

      {/* ── DISCIPLINARY ACTION SHEET */}
      <Modal visible={resolutionModal.isOpen} transparent animationType="slide" onRequestClose={() => setResolutionModal({ isOpen: false, decision: null })}>
        <View style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setResolutionModal({ isOpen: false, decision: null })} />
          <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={s.grabber} />
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Finalize escrow resolution</Text>
              <Pressable onPress={() => setResolutionModal({ isOpen: false, decision: null })} hitSlop={10}><X size={22} color={T.sub} /></Pressable>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
              <Text style={s.body}>
                You are resolving the dispute in favor of the <Text style={{ fontWeight: '700', color: T.text }}>{resolutionModal.decision}</Text>. The {session.credit_amount} credits will be safely transferred to their wallet.
              </Text>

              <Text style={[s.label, { marginTop: 18 }]}>Disciplinary action against losing party</Text>
              {DISCIPLINE.map((opt) => {
                const on = disciplinaryAction === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => setDisciplinaryAction(opt.id)}
                    accessibilityState={{ selected: on }}
                    style={[s.option, on && { borderColor: opt.on.border, backgroundColor: opt.on.bg }]}
                  >
                    <View style={[s.radio, on && { borderColor: opt.on.border }]}>{on && <View style={[s.radioDot, { backgroundColor: opt.on.border }]} />}</View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Text style={[s.optionTitle, { color: opt.fg }]}>{opt.title}</Text>
                        {!!opt.tag && <Text style={s.strikeTag}>{opt.tag}</Text>}
                      </View>
                      <Text style={s.optionSub}>{opt.sub}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={s.sheetFooter}>
              <Pressable onPress={() => setResolutionModal({ isOpen: false, decision: null })} style={[s.btn, s.btnGhost, { flex: 1 }]}>
                <Text style={[s.btnText, { color: T.text }]}>Cancel</Text>
              </Pressable>
              <Pressable onPress={finalizeResolution} style={[s.btn, { backgroundColor: T.brand, flex: 1.5 }]}>
                <Text style={s.btnText}>Confirm release</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── IMAGE LIGHTBOX */}
      <Modal visible={!!previewImage} transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
        <View style={s.lightbox}>
          <View style={[s.lightHead, { paddingTop: insets.top + 8 }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.lightTitle}>Session attachment</Text>
              <Text style={s.lightSub}>Submitted evidence</Text>
            </View>
            <Pressable onPress={() => setPreviewImage(null)} style={s.lightClose} hitSlop={8} accessibilityLabel="Close"><X size={20} color="#fff" /></Pressable>
          </View>
          {!!previewImage && <Image source={{ uri: previewImage }} style={{ flex: 1, width: '100%' }} resizeMode="contain" />}
          <View style={{ height: insets.bottom + 12 }} />
        </View>
      </Modal>

      {/* ── SKILL DETAILS SHEET (from a booking card) */}
      <Modal visible={!!selectedBookingData} transparent animationType="slide" onRequestClose={() => setSelectedBookingData(null)}>
        <View style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setSelectedBookingData(null)} />
          {!!selectedBookingData && (
            <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
              <View style={s.grabber} />
              <View style={s.sheetHeader}>
                <BookOpen size={20} color="#f59e0b" />
                <Text style={[s.sheetTitle, { flex: 1 }]}>Skill details</Text>
                <Pressable onPress={() => setSelectedBookingData(null)} hitSlop={10}><X size={22} color={T.sub} /></Pressable>
              </View>

              <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
                {!!selectedBookingData.image && (
                  <Image source={{ uri: selectedBookingData.image }} style={s.skillCover} resizeMode="cover" />
                )}
                <Text style={s.skillTitle}>{selectedBookingData.title}</Text>
                <View style={s.chipRow}>
                  <Text style={s.skillChip}>{bookingSkillDetails.loading ? '...' : bookingSkillDetails.category}</Text>
                  <Text style={[s.skillChip, { backgroundColor: T.soft, color: '#047857', borderColor: '#a7f3d0' }]}>{bookingSkillDetails.loading ? '...' : bookingSkillDetails.format}</Text>
                  <Text style={[s.skillChip, { backgroundColor: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }]}>{bookingSkillDetails.loading ? '...' : bookingSkillDetails.duration}</Text>
                </View>

                <Text style={[s.label, { marginTop: 18 }]}>Description</Text>
                <Text style={s.bodyText}>{bookingSkillDetails.loading ? 'Loading description...' : bookingSkillDetails.description}</Text>

                <Text style={[s.label, { marginTop: 18 }]}>Outcomes</Text>
                <Text style={s.bodyText}>{bookingSkillDetails.loading ? 'Loading outcomes...' : bookingSkillDetails.outcomes}</Text>
              </ScrollView>

              <View style={s.sheetFooter}>
                <Pressable onPress={() => setSelectedBookingData(null)} style={[s.btn, { backgroundColor: T.text, flex: 1 }]}>
                  <Text style={s.btnText}>Close</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  small: { fontSize: 13, color: T.sub },
  rowTitle: { fontSize: 15, fontWeight: '700', color: T.text },
  label: { fontSize: 13, fontWeight: '600', color: T.sub, marginBottom: 6 },
  fillBtn: { marginTop: 18, height: 42, paddingHorizontal: 20, borderRadius: 21, backgroundColor: T.text, alignItems: 'center', justifyContent: 'center' },
  fillBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // header
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingBottom: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: T.line },
  headBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headTitle: { fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2 },
  statusPill: { paddingHorizontal: 12, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  statusText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },

  // notices
  notice: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.line },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 19 },

  // blocks
  block: { paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: T.line },
  title: { fontSize: 20, fontWeight: '700', color: T.text, lineHeight: 26, letterSpacing: -0.3, marginBottom: 2 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2, marginBottom: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  infoStrong: { fontSize: 15, fontWeight: '700', color: T.text },
  infoText: { fontSize: 14, color: T.text },
  ownerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: T.strip, borderWidth: 1, borderColor: T.line },
  ownerDot: { width: 10, height: 10, borderRadius: 5 },
  progress: { flexDirection: 'row', marginTop: 16, gap: 8 },
  step: { flex: 1 },
  stepDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  stepLabel: { fontSize: 13, fontWeight: '700', color: T.text },
  stepDetail: { fontSize: 12, lineHeight: 16, color: T.sub, marginTop: 2 },

  personRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.field, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '700', color: T.sub },
  reporterTag: { fontSize: 12, fontWeight: '600', color: '#1d4ed8', backgroundColor: '#eff6ff', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
  doneChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, height: 26, borderRadius: 13 },
  doneText: { fontSize: 12, fontWeight: '600' },

  accountBox: { backgroundColor: T.strip, borderWidth: 1, borderColor: T.line, borderRadius: 12, padding: 12 },
  accountText: { fontSize: 14, lineHeight: 21, color: T.text },

  // conversation
  countChip: { fontSize: 13, fontWeight: '600', color: T.sub, backgroundColor: T.field, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },
  emptyChat: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 16, marginTop: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: T.border, borderRadius: 12 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, marginBottom: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: T.line },
  dividerText: { fontSize: 12, fontWeight: '600', color: T.sub, backgroundColor: '#fff', borderWidth: 1, borderColor: T.line, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },
  msgRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  msgAvatar: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden', backgroundColor: T.field, alignItems: 'center', justifyContent: 'center' },
  msgAvatarText: { fontSize: 13, fontWeight: '700', color: T.sub },
  msgHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  msgName: { flexShrink: 1, fontSize: 14, fontWeight: '700', color: T.text },
  roleTag: { fontSize: 12, fontWeight: '600', color: T.sub, backgroundColor: T.field, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 7, overflow: 'hidden' },
  time: { fontSize: 12, color: '#8b98a5', marginTop: 1, marginBottom: 6 },
  bubble: { borderWidth: 1, borderColor: T.line, borderRadius: 12, padding: 10, backgroundColor: '#fff', gap: 8 },
  msgText: { fontSize: 14, lineHeight: 20, color: T.text },
  replyBox: { backgroundColor: T.strip, borderLeftWidth: 3, borderLeftColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  replyName: { fontSize: 12, fontWeight: '700', color: T.sub },
  replySnippet: { fontSize: 12, color: T.sub, marginTop: 1 },
  bookCard: { borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#fde68a', backgroundColor: '#fffbeb' },
  bookHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#f59e0b' },
  bookHeadText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  bookBody: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
  bookThumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: T.field },
  bookTitle: { fontSize: 13, fontWeight: '700', color: '#451a03' },
  bookMeta: { fontSize: 12, fontWeight: '600', color: '#b45309', marginTop: 2 },
  bookCost: { fontSize: 12, fontWeight: '700', color: '#92400e', marginTop: 1 },
  fileSep: { paddingTop: 8, borderTopWidth: 1, borderTopColor: T.line },
  evidenceWrap: { alignSelf: 'flex-start', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: T.line, backgroundColor: T.strip },
  evidenceImg: { width: 220, height: 160 },
  fileBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, height: 38, paddingHorizontal: 12, borderRadius: 19, borderWidth: 1, borderColor: T.line, backgroundColor: T.strip },
  fileBtnText: { fontSize: 13, fontWeight: '700', color: T.text },

  // sticky bar
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: T.line, gap: 10 },
  barHint: { fontSize: 13, lineHeight: 18, color: T.sub },
  btn: { flex: 1, height: 44, borderRadius: 22, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { borderWidth: 1, borderColor: T.border, backgroundColor: '#fff' },
  btnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  choice: { flex: 1, minHeight: 56, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, justifyContent: 'center' },
  choiceTitle: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  choiceSub: { fontSize: 12, fontWeight: '600', marginTop: 2 },

  // sheets
  overlay: { flex: 1, backgroundColor: 'rgba(15,20,25,0.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: T.border, marginTop: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.line },
  sheetTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2 },
  sheetFooter: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.line },
  body: { fontSize: 14, lineHeight: 21, color: T.sub },
  bodyText: { fontSize: 14, lineHeight: 21, color: T.text },
  option: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12, marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: T.line, backgroundColor: '#fff' },
  optionTitle: { fontSize: 14, fontWeight: '700' },
  optionSub: { fontSize: 13, lineHeight: 18, color: T.sub, marginTop: 2 },
  strikeTag: { fontSize: 12, fontWeight: '700', color: '#92400e', backgroundColor: '#fef3c7', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, overflow: 'hidden' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: T.border, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  radioDot: { width: 10, height: 10, borderRadius: 5 },

  // skill details
  skillCover: { width: '100%', height: 140, borderRadius: 12, backgroundColor: T.strip, marginBottom: 12 },
  skillTitle: { fontSize: 17, fontWeight: '700', color: T.text, lineHeight: 23 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  skillChip: { fontSize: 12, fontWeight: '600', color: T.sub, backgroundColor: T.field, borderWidth: 1, borderColor: T.border, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },

  // lightbox
  lightbox: { flex: 1, backgroundColor: 'rgba(2,6,23,0.94)' },
  lightHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 10 },
  lightTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  lightSub: { fontSize: 12, color: '#cbd5e1' },
  lightClose: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
});