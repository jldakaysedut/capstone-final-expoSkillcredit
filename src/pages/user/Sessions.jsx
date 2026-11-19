import { Reveal, PressScale } from '../../components/premium/PremiumVisual';
import { Alert } from '../../components/SkillCreditAlert';
// ═══════════════════════════════════════════════════════════════
//  MOBILE APP (Expo React Native) — src/pages/user/Sessions.jsx
//  Same data + logic as before, restyled with the compact X-style typography
//  (matches UserDashboard): timeline rows, hairline dividers, 15px names, 13px details.
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react';
import {
  Modal, RefreshControl, AppState, Platform, DeviceEventEmitter, StyleSheet
} from 'react-native';
import { ActivityIndicator, View, Text, Image, Pressable, ScrollView, TextInput, KeyboardAvoidingView } from '../../components/premium/PremiumThemePrimitives';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { ArrowRight, Briefcase, CalendarDays, CheckCircle2, ChevronDown, Heart, MessageCircle, MessageSquare, MoreHorizontal, PenLine, PlayCircle, RefreshCw, Scale, ShieldCheck, Star, Target, X, AlertTriangle } from '../../components/premium/PremiumThemeIcons';
import supabase from '../../supabaseClient';
import UserScreenSkeleton from '../../components/premium/UserScreenSkeleton';

// ─────────────────────────────────────────────────────────────────
// SESSIONS: "Upcoming State" + Formal Start & Cancelled Chat (V4)
// ─────────────────────────────────────────────────────────────────

// compact X-style tokens (same as UserDashboard)
const T = {
  text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4',
  brand: '#047857', soft: '#ecfdf5',
};

const STATUS_META = {
  pending:             { dot: '#fbbf24', bar: '#fcd34d', label: 'Pending',     chipBg: '#fffbeb', chipText: '#b45309' },
  reschedule_proposed: { dot: '#c084fc', bar: '#c084fc', label: 'Rescheduled', chipBg: '#faf5ff', chipText: '#7e22ce' },
  upcoming:            { dot: '#818cf8', bar: '#818cf8', label: 'Upcoming',    chipBg: '#eef2ff', chipText: '#4338ca' },
  active:              { dot: '#38bdf8', bar: '#38bdf8', label: 'Active',      chipBg: '#f0f9ff', chipText: '#0369a1' },
  completed:           { dot: '#10b981', bar: '#34d399', label: 'Completed',   chipBg: '#ecfdf5', chipText: '#047857' },
  cancelled:           { dot: '#d1d5db', bar: '#e5e7eb', label: 'Cancelled',   chipBg: '#eff3f4', chipText: '#536471' },
  disputed:            { dot: '#fb7185', bar: '#fb7185', label: 'Disputed',    chipBg: '#fff1f2', chipText: '#be123c' },
};

const STATUS_TABS = ['All', 'Pending', 'Upcoming', 'Active', 'Completed', 'Cancelled', 'Disputed'];
const REPORT_REASONS = [
  'No-Show / Unresponsive', 'Harassment / Abuse', 'Scam / Fraud',
  'Inappropriate Behavior', "Tutorial Doesn't Match Description", 'Other',
];

// button looks
const TONES = {
  indigo:      { bg: '#4338ca', border: '#4338ca', text: '#fff' },
  green:       { bg: '#059669', border: '#059669', text: '#fff' },
  greenSoft:   { bg: '#ecfdf5', border: '#a7f3d0', text: '#047857' },
  purple:      { bg: '#9333ea', border: '#9333ea', text: '#fff' },
  amber:       { bg: '#fffbeb', border: '#fde68a', text: '#b45309' },
  danger:      { bg: '#fff', border: '#fecdd3', text: '#e11d48' },
  dangerSolid: { bg: '#e11d48', border: '#e11d48', text: '#fff' },
  soft:        { bg: '#eff3f4', border: '#eff3f4', text: '#0f1419' },
};

const confirmAsync = (title, message, confirmText = 'Confirm', destructive = false) =>
  new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });

function getSafeDateObj(dateStr, timeStr) {
  if (!dateStr || !timeStr) return new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes);
}

function getGroup(dateStr, timeStr) {
  const now = new Date();
  const date = getSafeDateObj(dateStr, timeStr);
  const diffDays = (now - date) / 86400000;
  if (diffDays < 1) return 'Today';
  if (diffDays < 7) return 'This Week';
  if (diffDays < 30) return 'This Month';
  return 'Earlier';
}

const GROUP_ORDER = ['Today', 'This Week', 'This Month', 'Earlier'];

function parseDurationToMs(durationStr) {
  if (!durationStr) return 0;
  const str = durationStr.toLowerCase();
  if (str.includes('min')) return (parseInt(str) || 0) * 60 * 1000;
  if (str.includes('hr') || str.includes('hour')) return (parseInt(str) || 0) * 3600 * 1000;
  return 0;
}

// ── date/time picker
const pad = (n) => String(n).padStart(2, '0');
const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeStr = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function PickerField({ label, mode, value, onChange, minimumDate }) {
  const [showIOS, setShowIOS] = useState(false);
  const current = (() => {
    const base = new Date();
    if (!value) return base;
    if (mode === 'date') {
      const [y, m, d] = value.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    const [h, min] = value.split(':').map(Number);
    base.setHours(h, min, 0, 0);
    return base;
  })();
  const display = !value
    ? (mode === 'date' ? 'Select date' : 'Select time')
    : mode === 'date'
      ? current.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : current.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const apply = (d) => onChange(mode === 'date' ? toDateStr(d) : toTimeStr(d));
  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current, mode, minimumDate, is24Hour: false,
        onChange: (e, d) => { if (e.type === 'set' && d) apply(d); },
      });
    } else setShowIOS((v) => !v);
  };
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Pressable onPress={open} style={s.pickInput}>
        <Text style={{ fontSize: 15, color: value ? T.text : T.sub }}>{display}</Text>
      </Pressable>
      {Platform.OS === 'ios' && showIOS && (
        <View>
          <DateTimePicker value={current} mode={mode} display="spinner" minimumDate={minimumDate} onChange={(e, d) => d && apply(d)} />
          <Pressable onPress={() => setShowIOS(false)} style={{ alignSelf: 'flex-end', padding: 6 }}>
            <Text style={{ color: T.brand, fontWeight: '600', fontSize: 14 }}>Done</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function StarRow({ label, Icon, value, onChange }) {
  return (
    <View style={s.starRow}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {Icon && <Icon size={17} color={T.brand} />}
        <Text style={{ fontSize: 15, fontWeight: '600', color: T.text }}>{label}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Pressable key={star} onPress={() => onChange(star)} hitSlop={4}>
            <Star size={28} color={star <= value ? '#fbbf24' : T.border} fill={star <= value ? '#fbbf24' : 'none'} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function Sessions() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const listY = useRef(0);
  const groupYs = useRef({});
  const cardYs = useRef({});

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [roleFilter, setRoleFilter] = useState('All');
  const [statusTab, setStatusTab] = useState('All');
  const [expandedId, setExpandedId] = useState(null);
  const [highlightedSessionId, setHighlightedSessionId] = useState(null);
  const [moreSheet, setMoreSheet] = useState(null); // { title, actions }

  const [proposeModal, setProposeModal] = useState({ isOpen: false, session: null });
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [isSubmittingPropose, setIsSubmittingPropose] = useState(false);

  const [ratingModal, setRatingModal] = useState({ isOpen: false, session: null });
  const [ratings, setRatings] = useState({ overall: 0, clarity: 0, patience: 0, relevance: 0, professionalism: 0 });
  const [feedback, setFeedback] = useState('');
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);

  const [reportModal, setReportModal] = useState({ isOpen: false, session: null });
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [reportDetails, setReportDetails] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [submittedReports, setSubmittedReports] = useState([]);

  const [disputeModal, setDisputeModal] = useState({ isOpen: false, session: null, reportInfo: null });

  // deep links: navigate('Sessions', { session: id }) or { tab: 'Disputed' }
  const focusSessionId = route.params?.session || null;
  const focusTab = route.params?.tab || null;

  useEffect(() => {
    if (focusTab) { setStatusTab(focusTab); navigation.setParams({ tab: undefined }); }
  }, [focusTab]);

  const fetchSessions = async (userId) => {
    const uid = userId || currentUserId;
    if (!uid) return;
    const { data, error } = await supabase
      .from('sessions')
      .select(`*, skill:skills(duration,title,format), student:user_profiles!student_id(id,full_name,avatar_url), instructor:user_profiles!instructor_id(id,full_name,avatar_url)`)
      .or(`student_id.eq.${uid},instructor_id.eq.${uid}`)
      .order('created_at', { ascending: false });
    if (!error) setSessions(data || []);
    setLoading(false);
  };

  const fetchUserReports = async (userId) => {
    const { data } = await supabase.from('reports')
      .select('reference_id')
      .or(`reporter_id.eq.${userId},reported_user_id.eq.${userId}`)
      .eq('reference_type', 'session');
    if (data) setSubmittedReports(data.map((r) => r.reference_id));
  };

  // ─── LIVE: realtime channel
  useEffect(() => {
    let channel = null;
    let disposed = false;
    const init = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || disposed) return;
      setCurrentUserId(user.id);
      await fetchSessions(user.id);
      await fetchUserReports(user.id);

      channel = supabase.channel(`sessions_rt_${user.id}_${Date.now()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, (payload) => {
          fetchSessions(user.id);
          if (payload.new && (payload.new.status === 'cancelled' || payload.new.status === 'completed')) {
            DeviceEventEmitter.emit('credit_updated');
          }
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reports' }, () => fetchUserReports(user.id))
        .subscribe();
    };
    init();
    return () => { disposed = true; if (channel) supabase.removeChannel(channel); };
  }, []);

  // ─── LIVE: re-sync when the app returns from the background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && currentUserId) { fetchSessions(currentUserId); fetchUserReports(currentUserId); }
    });
    return () => sub.remove();
  }, [currentUserId]);

  // Refresh when navigating back from Messages or session detail views.
  useEffect(() => {
    const off = navigation.addListener('focus', () => {
      if (currentUserId) { fetchSessions(currentUserId); fetchUserReports(currentUserId); }
    });
    return off;
  }, [navigation, currentUserId]);

  const onRefresh = async () => { setRefreshing(true); await fetchSessions(currentUserId); await fetchUserReports(currentUserId); setRefreshing(false); };

  // deep link: expand + highlight + scroll to the session
  useEffect(() => {
    if (!focusSessionId || loading || sessions.length === 0) return;
    const target = sessions.find((x) => x.id === focusSessionId);
    if (!target) return;

    setStatusTab('All'); setRoleFilter('All');
    setExpandedId(focusSessionId); setHighlightedSessionId(focusSessionId);

    const scrollTimer = setTimeout(() => {
      const group = getGroup(target.scheduled_date, target.scheduled_time);
      const y = listY.current + (groupYs.current[group] || 0) + (cardYs.current[focusSessionId] || 0);
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true });
    }, 400);
    const glowTimer = setTimeout(() => {
      setHighlightedSessionId(null);
      navigation.setParams({ session: undefined });
    }, 4000);
    return () => { clearTimeout(scrollTimer); clearTimeout(glowTimer); };
  }, [focusSessionId, loading, sessions.length]);

  // ─── status actions (same rules as the web)
  const handleUpdateStatus = async (session, action) => {
    setProcessingId(session.id);
    try {
      if (action === 'cancel' || action === 'decline' || action === 'cancel_no_show') {
        // Secure cancellation and credit refund happen in one DB transaction.
        const { data: cancellationResult, error: cancellationError } = await supabase.rpc(
          'skillcredit_secure_cancel_session', { p_session_id: session.id, p_action: action }
        );
        if (cancellationError) throw cancellationError;
        if (cancellationResult?.state === 'already_cancelled') {
          throw new Error('This session was already cancelled. Check credits before trying again.');
        }
        if (cancellationResult?.state !== 'cancelled' || cancellationResult?.refunded !== true) {
          throw new Error('Cancellation outcome unconfirmed. Check Sessions before retrying.');
        }
        DeviceEventEmitter.emit('credit_updated');

        // Notify the other participant only after the existing cancellation update succeeds.
        // Keep the existing credit refund and no-show behavior unchanged.
        if (!cancellationError && (action === 'cancel' || action === 'decline')) {
          const actorIsInstructor = session.instructor_id === currentUserId;
          const otherId = actorIsInstructor ? session.student_id : session.instructor_id;
          const actor = actorIsInstructor
            ? session.instructor?.full_name || 'Your provider'
            : session.student?.full_name || 'Your seeker';
          const sessionLabel = session.skill?.title ? ` for "${session.skill.title}"` : '';
          let noticeContent;

          if (action === 'decline' && session.status === 'pending') {
            noticeContent = `${actor} declined your booking request${sessionLabel}. The booking has been cancelled. Please check your wallet for the credit refund.`;
          } else if (action === 'decline') {
            noticeContent = `${actor} cancelled your booking${sessionLabel} after proposing a new time. Please check your wallet for the credit refund.`;
          } else if (session.status === 'reschedule_proposed' && !actorIsInstructor) {
            noticeContent = `${actor} declined the proposed schedule and cancelled the booking${sessionLabel}.`;
          } else if (session.status === 'upcoming' && actorIsInstructor) {
            noticeContent = `${actor} cancelled your upcoming session${sessionLabel}. Please check your wallet for the credit refund.`;
          } else if (session.status === 'upcoming') {
            noticeContent = `${actor} cancelled the upcoming session${sessionLabel}.`;
          } else if (session.status === 'pending') {
            noticeContent = `${actor} cancelled the booking request${sessionLabel}.`;
          } else {
            noticeContent = `${actor} cancelled the session${sessionLabel}.`;
          }

          if (otherId && otherId !== currentUserId) {
            const { error: noticeError } = await supabase.from('notifications').insert({
              user_id: otherId,
              type: 'session_cancelled',
              content: noticeContent,
              link_url: `/sessions?session=${session.id}`,
            });
            if (noticeError) console.error('Session cancellation notification failed:', noticeError);
          }
        }
        if (action === 'cancel_no_show') {
          await supabase.from('notifications').insert([{
            user_id: session.instructor_id,
            type: 'session_cancelled',
            content: `Your session was cancelled and the credits were refunded to the seeker due to inactivity (Missed Schedule).`,
            link_url: `/sessions?session=${session.id}`,
          }]);
        }
      } else if (action === 'accept_schedule') {
        // Already-installed shared RPC validates actor, expiry, status, and
        // locks the row. Do not insert duplicate confirmation notifications.
        const { data: confirmation, error: confirmError } = await supabase.rpc(
          'skillcredit_secure_confirm_schedule', { p_session_id: session.id }
        );
        if (confirmError) throw confirmError;
        if (confirmation?.state === 'already_confirmed') {
          await fetchSessions(currentUserId);
          return;
        }
        if (confirmation?.state !== 'confirmed') {
          throw new Error('Schedule confirmation unconfirmed. Refresh Sessions before retrying.');
        }

        const isInstructorAction = session.instructor_id === currentUserId;
        const targetUserId = isInstructorAction ? session.student_id : session.instructor_id;
        const actorName = isInstructorAction ? session.instructor?.full_name || 'The provider' : session.student?.full_name || 'The seeker';

        try {
          const { error: noticeError } = await supabase.from('notifications').insert([{
            user_id: targetUserId,
            type: 'booking_accepted',
            content: `${actorName} has confirmed the schedule for the session. It is now upcoming!`,
            link_url: `/sessions?session=${session.id}`,
          }]);
          if (noticeError) console.error('Schedule confirmed but notification failed:', noticeError);
        } catch (noticeError) {
          console.error('Schedule confirmed but notification failed:', noticeError);
        }
      } else if (action === 'start_session') {
        const now = new Date();
        const dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        const timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

        await supabase.from('sessions').update({ status: 'active', scheduled_date: dateStr, scheduled_time: timeStr }).eq('id', session.id);

        await supabase.from('notifications').insert([{
          user_id: session.student_id,
          type: 'session_started',
          content: `${session.instructor?.full_name || 'The provider'} has started the session. The countdown has begun!`,
          link_url: `/sessions?session=${session.id}`,
        }]);
      } else if (action === 'mark_done') {
        if (!(await confirmAsync('Mark as done', 'Mark session as done?'))) { setProcessingId(null); return; }
        // The existing DB RPC atomically confirms both participants and awards credits only once.
        // Never update instructor credits_balance directly from mobile.
        const { data: outcome, error: completionError } = await supabase.rpc('confirm_session_completion', {
          p_session_id: session.id,
        });
        if (completionError) throw completionError;
        if (!outcome || !['waiting', 'completed'].includes(outcome.state)) {
          throw new Error('Unexpected completion response. Refresh the session before retrying.');
        }

        const isInstructor = session.instructor_id === currentUserId;
        const targetUserId = isInstructor ? session.student_id : session.instructor_id;
        const actorName = isInstructor ? session.instructor?.full_name || 'The provider' : session.student?.full_name || 'The seeker';

        if (outcome.state === 'completed' && outcome.awarded === true) {
          DeviceEventEmitter.emit('credit_updated');
          // Notification delivery is best-effort: the credit award is already committed.
          const { error: noticeError } = await supabase.from('notifications').insert([
            {
              user_id: session.student_id,
              type: 'session_completed',
              content: `Your session with ${session.instructor?.full_name || 'the provider'} is officially completed!`,
              link_url: `/sessions?session=${session.id}`,
            },
            {
              user_id: session.instructor_id,
              type: 'session_completed',
              content: `Your session with ${session.student?.full_name || 'the seeker'} is officially completed! ${session.credit_amount} CR added.`,
              link_url: `/sessions?session=${session.id}`,
            },
          ]);
          if (noticeError) console.error('Completion notification failed (credits were already awarded):', noticeError);
        } else if (outcome.state === 'waiting' && outcome.new_confirmation === true) {
          const { error: noticeError } = await supabase.from('notifications').insert([{
            user_id: targetUserId,
            type: 'session_update',
            content: `${actorName} has marked the session as done. Please confirm to finalize the completion.`,
            link_url: `/sessions?session=${session.id}`,
          }]);
          if (noticeError) console.error('Completion confirmation notification failed:', noticeError);
        }
      } else if (action === 'undo_done') {
        if (!(await confirmAsync('Undo', "Undo 'Mark as Done'?"))) { setProcessingId(null); return; }
        const isInstructor = session.instructor_id === currentUserId;
        const { error: undoError } = await supabase.from('sessions').update(isInstructor ? { instructor_completed: false } : { student_completed: false }).eq('id', session.id);
        if (!undoError) {
          const otherId = isInstructor ? session.student_id : session.instructor_id;
          const actor = isInstructor
            ? session.instructor?.full_name || 'The provider'
            : session.student?.full_name || 'The seeker';
          if (otherId && otherId !== currentUserId) {
            const { error: noticeError } = await supabase.from('notifications').insert({
              user_id: otherId,
              type: 'session_update',
              content: `${actor} withdrew their completion confirmation. The session now needs confirmation again.`,
              link_url: `/sessions?session=${session.id}`,
            });
            if (noticeError) console.error('Completion undo notification failed:', noticeError);
          }
        }
      }
      fetchSessions(currentUserId);
    } catch (err) { console.error(err.message); Alert.alert('Error', 'Error processing transaction.'); }
    finally { setProcessingId(null); }
  };

  // confirm first, then run (replaces: if (window.confirm(...)) handleUpdateStatus(...))
  const askThenRun = async (title, message, session, action, confirmText, destructive = true) => {
    if (await confirmAsync(title, message, confirmText, destructive)) handleUpdateStatus(session, action);
  };

  const handleProposeTime = async () => {
    if (!newDate || !newTime) return;
    setIsSubmittingPropose(true);
    const sess = proposeModal.session;
    try {
      await supabase.from('sessions').update({ status: 'reschedule_proposed', scheduled_date: newDate, scheduled_time: newTime }).eq('id', sess.id);

      await supabase.from('notifications').insert([{
        user_id: sess.student_id,
        type: 'session_disputed',
        content: `Your Provider proposed a new time for your session: ${newDate} at ${newTime}. Please Accept or Decline.`,
        link_url: `/sessions?session=${sess.id}`,
      }]);

      Alert.alert('Done', 'New time proposed to the seeker successfully!');
      setProposeModal({ isOpen: false, session: null });
      fetchSessions(currentUserId);
    } catch (error) {
      Alert.alert('Error', 'Failed to propose new time.');
    } finally { setIsSubmittingPropose(false); }
  };

  const handleSubmitRating = async () => {
    if (!Object.values(ratings).every((v) => v > 0)) { Alert.alert('Please rate all categories.'); return; }
    setIsSubmittingRating(true);
    const sess = ratingModal.session;
    try {
      await supabase.from('reviews').insert([{
        session_id: sess.id, skill_id: sess.skill_id, instructor_id: sess.instructor_id, student_id: sess.student_id,
        rating: ratings.overall, q1_clarity: ratings.clarity, q2_patience: ratings.patience,
        q3_relevance: ratings.relevance, q4_professionalism: ratings.professionalism, feedback,
      }]);
      await supabase.from('sessions').update({ is_rated: true }).eq('id', sess.id);

      await supabase.from('notifications').insert([{
        user_id: sess.instructor_id,
        type: 'new_rating',
        content: `${sess.student?.full_name || 'A seeker'} evaluated your session and left a rating!`,
        link_url: `/sessions?session=${sess.id}`,
      }]);

      setRatingModal({ isOpen: false, session: null });
      setRatings({ overall: 0, clarity: 0, patience: 0, relevance: 0, professionalism: 0 });
      setFeedback('');
      fetchSessions(currentUserId);
      Alert.alert('Evaluation submitted!');
    } catch { Alert.alert('Error', 'Failed to submit.'); }
    finally { setIsSubmittingRating(false); }
  };

  const handleSubmitReport = async () => {
    if (!reportDetails.trim()) return;
    setIsSubmittingReport(true);
    const sess = reportModal.session;
    const reportedUserId = sess.instructor_id === currentUserId ? sess.student_id : sess.instructor_id;
    try {
      await supabase.from('reports').insert([{
        reporter_id: currentUserId, reported_user_id: reportedUserId, reason: reportReason,
        details: reportDetails, reference_type: 'session', reference_id: sess.id,
      }]);
      await supabase.from('sessions').update({ status: 'disputed' }).eq('id', sess.id);

      const isInstructorAction = sess.instructor_id === currentUserId;
      const targetUserId = isInstructorAction ? sess.student_id : sess.instructor_id;
      const actorName = isInstructorAction ? sess.instructor?.full_name || 'The provider' : sess.student?.full_name || 'The seeker';

      await supabase.from('notifications').insert([{
        user_id: targetUserId,
        type: 'session_disputed',
        content: `${actorName} has filed a dispute regarding your session. A moderator will review the case.`,
        link_url: `/sessions?session=${sess.id}`,
      }]);

      Alert.alert('Issue reported', 'A moderator will review this case and decide on the credit refund.');
      setSubmittedReports((p) => [...p, sess.id]);
      setReportModal({ isOpen: false, session: null });
      setReportDetails(''); setReportReason(REPORT_REASONS[0]);
      fetchSessions(currentUserId);
    } catch { Alert.alert('Error', 'Failed to submit report.'); }
    finally { setIsSubmittingReport(false); }
  };

  const handleOpenDisputeModal = async (session) => {
    const { data } = await supabase.from('reports').select('*')
      .eq('reference_id', session.id).eq('reference_type', 'session')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();

    setDisputeModal({
      isOpen: true, session,
      reportInfo: data || { reason: 'System Dispute', details: 'No formal report narrative available. Please check support messages.', status: session.status },
    });
  };

  // ─── ONE main action + the rest in "More"
  const buildActions = (session) => {
    const isInstructor = session.instructor_id === currentUserId;
    const isProcessing = processingId === session.id;
    const myCompleted = isInstructor ? Boolean(session.instructor_completed) : Boolean(session.student_completed);
    const otherCompleted = isInstructor ? Boolean(session.student_completed) : Boolean(session.instructor_completed);
    const hasReported = submittedReports.includes(session.id) || session.status === 'disputed';

    const sessionDateObj = getSafeDateObj(session.scheduled_date, session.scheduled_time);
    const durationMs = parseDurationToMs(session.skill?.duration);
    const isSessionFinished = Date.now() > sessionDateObj.getTime() + durationMs;
    const isExpired = Date.now() > sessionDateObj.getTime();
    const isNoShow = Date.now() > sessionDateObj.getTime() + 30 * 60 * 1000;

    const actions = [];
    let hint = null;
    let tag = null;
    const add = (label, onPress, tone, Icon, extra = {}) =>
      actions.push({ label, onPress, tone, Icon, disabled: isProcessing, ...extra });
    const openPropose = () => { setProposeModal({ isOpen: true, session }); setNewDate(session.scheduled_date); setNewTime(session.scheduled_time); };

    const st = session.status;

    if (st === 'pending') {
      if (isExpired) hint = '⏰ Schedule expired';
      if (isInstructor) {
        if (!isExpired) add('Confirm schedule', () => handleUpdateStatus(session, 'accept_schedule'), 'indigo');
        if (!isExpired) add('Propose new time', openPropose, 'soft');
        add(isExpired ? 'Return credit' : 'Decline',
          () => askThenRun(isExpired ? 'Return credit' : 'Decline',
            isExpired ? 'Expired booking. Return the credits to the seeker?' : 'Decline?',
            session, 'decline', isExpired ? 'Return credit' : 'Decline'), 'danger');
      } else if (!isExpired) {
        add('Cancel & refund', () => askThenRun('Cancel', 'Cancel?', session, 'cancel', 'Cancel booking'), 'danger');
      } else {
        add('Claim refund', () => askThenRun('Claim refund', 'Session expired. Cancel to refund?', session, 'cancel', 'Refund', false), 'greenSoft', RefreshCw);
      }
    } else if (st === 'reschedule_proposed') {
      if (isInstructor) {
        hint = isExpired ? '⏰ Proposed schedule expired' : '⏳ Waiting for the seeker to confirm the new time';
        if (!isExpired) add('Edit proposed time', openPropose, 'purple');
        add(isExpired ? 'Return credit' : 'Decline',
          () => askThenRun(isExpired ? 'Return credit' : 'Decline', 'Cancel booking and return seeker credits?', session, 'decline', isExpired ? 'Return credit' : 'Decline'), 'danger');
      } else {
        hint = isExpired ? '⏰ Proposed schedule expired' : '📅 The provider proposed a new schedule';
        if (!isExpired) add('Accept schedule', () => handleUpdateStatus(session, 'accept_schedule'), 'indigo');
        add(isExpired ? 'Claim refund' : 'Cancel & refund',
          () => askThenRun(isExpired ? 'Claim refund' : 'Cancel', 'Cancel and refund this booking?', session, 'cancel', isExpired ? 'Claim refund' : 'Cancel session', false), isExpired ? 'greenSoft' : 'danger');
      }
    } else if (st === 'upcoming') {
      if (isInstructor) {
        if (!isNoShow) {
          hint = '📅 Schedule confirmed. Wait for the day.';
          add('Start session', () => askThenRun('Start session', 'Start session now? This will begin the duration countdown.', session, 'start_session', 'Start', false), 'green', PlayCircle);
          add('Cancel booking', () => askThenRun('Emergency cancel', 'Emergency: Cancel this upcoming session? Credits will be refunded to the seeker.', session, 'cancel', 'Cancel booking'), 'danger');
        } else tag = '⏰ Missed schedule';
      } else if (!isNoShow) {
        hint = '📅 Schedule confirmed. Wait for the day.';
        add('Cancel & refund', () => askThenRun('Cancel', 'Cancel booking?', session, 'cancel', 'Cancel booking'), 'danger');
      } else {
        add('Claim refund (no-show)', () => askThenRun('No-show', 'Provider is a no-show. Claim your refund now?', session, 'cancel_no_show', 'Claim refund', false), 'dangerSolid', RefreshCw);
      }
    } else {
      // active, completed, disputed, cancelled
      if (hasReported) add('Dispute details', () => handleOpenDisputeModal(session), 'danger', ShieldCheck, { disabled: false });

      if (st === 'active' && !hasReported) {
        if (myCompleted) hint = '⏳ Waiting for your partner to confirm';
        else if (otherCompleted) hint = '✨ Your partner marked it done. Finalize it!';
        else if (!isSessionFinished) hint = 'Dispute unlocks after the session';

        add(myCompleted ? 'Waiting for partner' : 'Mark done', () => handleUpdateStatus(session, 'mark_done'), myCompleted ? 'soft' : 'green',
          myCompleted ? null : CheckCircle2, { disabled: isProcessing || myCompleted });
        if (myCompleted) add('Undo "Mark done"', () => handleUpdateStatus(session, 'undo_done'), 'soft');
        if (isSessionFinished) add('File a dispute', () => setReportModal({ isOpen: true, session }), 'danger', AlertTriangle, { disabled: false });
      }

      if (!isInstructor && st === 'completed' && !session.is_rated && !hasReported) {
        add('Evaluate', () => setRatingModal({ isOpen: true, session }), 'amber', PenLine, { disabled: false });
      }
      if (!isInstructor && st === 'completed' && session.is_rated) tag = '⭐ Rated';
      if (isInstructor && st === 'completed' && !hasReported) tag = '✅ Completed';
      if (st === 'cancelled' && !hasReported) tag = 'Cancelled';
    }
    return { actions, hint, tag };
  };

  // ─── filtering / grouping (same as the web)
  const filtered = sessions.filter((x) => {
    if (roleFilter === 'Teaching' && x.instructor_id !== currentUserId) return false;
    if (roleFilter === 'Learning' && x.student_id !== currentUserId) return false;

    if (statusTab !== 'All') {
      const isActuallyDisputed = submittedReports.includes(x.id) || x.status === 'disputed';
      if (statusTab.toLowerCase() === 'disputed') return isActuallyDisputed;
      if (statusTab.toLowerCase() === 'pending') return (x.status === 'pending' || x.status === 'reschedule_proposed') && !isActuallyDisputed;
      return x.status === statusTab.toLowerCase() && !isActuallyDisputed;
    }
    return true;
  }).sort((a, b) => {
    const aCreated = new Date(a.created_at || 0).getTime();
    const bCreated = new Date(b.created_at || 0).getTime();
    return (Number.isFinite(bCreated) ? bCreated : 0) - (Number.isFinite(aCreated) ? aCreated : 0);
  });

  const grouped = GROUP_ORDER.reduce((acc, g) => ({ ...acc, [g]: [] }), {});
  filtered.forEach((x) => { grouped[getGroup(x.scheduled_date, x.scheduled_time)].push(x); });
  const latestBookingGroup = filtered.length ? getGroup(filtered[0].scheduled_date, filtered[0].scheduled_time) : null;
  const activeGroups = GROUP_ORDER.filter((g) => grouped[g].length > 0).sort((a, b) => {
    if (a === b) return 0;
    if (a === latestBookingGroup) return -1;
    if (b === latestBookingGroup) return 1;
    return GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b);
  });

  const tabCounts = STATUS_TABS.reduce((acc, t) => {
    if (t === 'All') acc[t] = sessions.length;
    else if (t === 'Disputed') acc[t] = sessions.filter((x) => submittedReports.includes(x.id) || x.status === 'disputed').length;
    else if (t === 'Pending') acc[t] = sessions.filter((x) => (x.status === 'pending' || x.status === 'reschedule_proposed') && !submittedReports.includes(x.id)).length;
    else acc[t] = sessions.filter((x) => x.status === t.toLowerCase() && !submittedReports.includes(x.id)).length;
    return acc;
  }, {});

  if (loading) return <UserScreenSkeleton type="sessions" />;

  const goProfile = (id) => id && navigation.navigate('PublicProfile', { id });
  const goSkill = (id) => navigation.navigate('SkillDetails', { id });
  const goChat = (id) => navigation.navigate('Messages', { session: id });

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#047857" colors={['#047857']} />}
      >
        {/* top: role toggle + status chips */}
        <Reveal delay={90}><View style={s.topBlock}>
          <View style={s.roleToggle}>
            {['All', 'Teaching', 'Learning'].map((role) => (
              <Pressable key={role} onPress={() => setRoleFilter(role)} style={[s.roleBtn, roleFilter === role && s.roleBtnOn]}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: roleFilter === role ? T.text : T.sub }}>{role}</Text>
              </Pressable>
            ))}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 12 }}>
            {STATUS_TABS.map((tab) => {
              const meta = STATUS_META[tab.toLowerCase()];
              const on = statusTab === tab;
              return (
                <Pressable key={tab} onPress={() => setStatusTab(tab)} style={[s.tab, on && s.tabOn]}>
                  {meta && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: on ? '#fff' : meta.dot }} />}
                  <Text style={{ fontSize: 13, fontWeight: '600', color: on ? '#fff' : T.text }}>{tab}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: on ? 'rgba(255,255,255,0.7)' : T.sub }}>{tabCounts[tab]}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View></Reveal>

        {/* cards */}
        {filtered.length === 0 ? (
          <View style={s.empty}>
            <CalendarDays size={40} color={T.border} />
            <Text style={{ fontSize: 17, fontWeight: '700', color: T.text, marginTop: 12 }}>No sessions here</Text>
            <Text style={{ fontSize: 14, color: T.sub, marginTop: 4, textAlign: 'center' }}>Switch tabs to see more.</Text>
            <Pressable onPress={() => { setStatusTab('All'); setRoleFilter('All'); }} style={s.showAll}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Show all</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ borderTopWidth: 1, borderTopColor: T.line }} onLayout={(e) => { listY.current = e.nativeEvent.layout.y; }}>
            {activeGroups.map((group) => (
              <View key={group} onLayout={(e) => { groupYs.current[group] = e.nativeEvent.layout.y; }}>
                <Text style={s.groupLabel}>{group}</Text>

                <View>
                  {grouped[group].map((session) => {
                    const isInstructor = session.instructor_id === currentUserId;
                    const displayUser = isInstructor ? session.student : session.instructor;
                    const displayName = displayUser?.full_name || 'Unknown';
                    const displayAvatar = displayUser?.avatar_url || null;
                    const partnerId = displayUser?.id;

                    const hasReported = submittedReports.includes(session.id) || session.status === 'disputed';
                    const meta = hasReported ? STATUS_META.disputed : (STATUS_META[session.status] || STATUS_META.cancelled);

                    const sessionDateObj = getSafeDateObj(session.scheduled_date, session.scheduled_time);
                    const time = sessionDateObj.toLocaleString('en-US', {
                      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
                    });
                    const bookedDate = new Date(session.created_at).toLocaleString('en-US', {
                      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
                    });

                    const isExpanded = expandedId === session.id;
                    const isHighlighted = highlightedSessionId === session.id;
                    const canMessage = ['pending', 'reschedule_proposed', 'upcoming', 'active', 'completed', 'disputed', 'cancelled'].includes(session.status);

                    const { actions, hint, tag } = buildActions(session);
                    const primary = actions[0];
                    const more = actions.slice(1);
                    const tone = primary ? TONES[primary.tone] : null;

                    return (
                      <View
                        key={session.id}
                        onLayout={(e) => { cardYs.current[session.id] = e.nativeEvent.layout.y; }}
                        style={[s.card, isHighlighted && s.cardHighlight]}
                      >
                        <Pressable onPress={() => setExpandedId(isExpanded ? null : session.id)} style={s.cardHead}>
                          <Pressable onPress={() => goProfile(partnerId)} style={s.avatar}>
                            {displayAvatar
                              ? <Image source={{ uri: displayAvatar }} style={{ width: '100%', height: '100%' }} />
                              : <Text style={{ fontSize: 17, fontWeight: '700', color: '#065f46' }}>{displayName.charAt(0).toUpperCase()}</Text>}
                          </Pressable>

                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text style={{ flexShrink: 1, fontSize: 15, fontWeight: '700', color: T.text }} numberOfLines={1}>{displayName}</Text>
                              <Text style={[s.chip, { backgroundColor: meta.chipBg, color: meta.chipText }]}>{meta.label}</Text>
                            </View>
                            <Text style={{ fontSize: 13, color: T.sub, marginTop: 1 }} numberOfLines={1}>
                              {isInstructor ? 'Seeker' : 'Provider'} · {session.skill?.title || 'Unknown skill'}
                            </Text>
                            <Text style={{ fontSize: 13, color: T.text, marginTop: 3 }}>
                              {time} · <Text style={{ fontWeight: '700', color: T.brand }}>{session.credit_amount} CR</Text>
                            </Text>
                          </View>

                          <ChevronDown size={18} color={T.sub} style={{ marginTop: 2, transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] }} />
                        </Pressable>

                        {!!hint && <Text style={s.hint}>{hint}</Text>}

                        {/* ONE main button + Chat + More */}
                        {(primary || tag || canMessage) && (
                          <View style={s.actionRow}>
                            {primary ? (
                              <PressScale
                                onPress={primary.onPress}
                                disabled={primary.disabled}
                                style={[s.mainBtn, { backgroundColor: tone.bg, borderColor: tone.border }, primary.disabled && { opacity: 0.55 }]}
                              >
                                {primary.Icon && <primary.Icon size={16} color={tone.text} />}
                                <Text style={{ fontSize: 14, fontWeight: '700', color: tone.text }} numberOfLines={1}>{primary.label}</Text>
                              </PressScale>
                            ) : tag ? (
                              <View style={s.tagBox}><Text style={{ fontSize: 13, fontWeight: '600', color: T.sub }}>{tag}</Text></View>
                            ) : <View style={{ flex: 1 }} />}

                            {canMessage && (
                              <Pressable onPress={() => goChat(session.id)} style={s.iconBtn} hitSlop={4}>
                                <MessageSquare size={18} color={T.text} />
                              </Pressable>
                            )}
                            {more.length > 0 && (
                              <Pressable onPress={() => setMoreSheet({ title: displayName, actions: more })} style={s.iconBtn} hitSlop={4}>
                                <MoreHorizontal size={18} color={T.text} />
                              </Pressable>
                            )}
                          </View>
                        )}

                        {isExpanded && (
                          <View style={s.expanded}>
                            <View style={s.detailGrid}>
                              <Text style={s.dKey}>Format</Text><Text style={s.dVal}>{session.skill?.format || 'N/A'}</Text>
                              <Text style={s.dKey}>Duration</Text><Text style={s.dVal}>{session.skill?.duration || '?'}</Text>
                              <Text style={s.dKey}>Booked on</Text><Text style={s.dVal}>{bookedDate}</Text>
                            </View>
                            <Pressable onPress={() => goSkill(session.skill_id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 }}>
                              <Text style={{ fontSize: 14, fontWeight: '600', color: T.brand }}>View listing</Text>
                              <ArrowRight size={15} color={T.brand} />
                            </Pressable>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ── MORE ACTIONS SHEET */}
      <Modal visible={!!moreSheet} transparent animationType="slide" onRequestClose={() => setMoreSheet(null)}>
        <Pressable style={s.overlay} onPress={() => setMoreSheet(null)} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={s.grabber} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: T.sub, marginVertical: 10, textAlign: 'center' }}>{moreSheet?.title}</Text>
          {moreSheet?.actions.map((a) => (
            <Pressable key={a.label} disabled={a.disabled}
              onPress={() => { setMoreSheet(null); setTimeout(a.onPress, 250); }}
              style={[s.moreRow, a.disabled && { opacity: 0.5 }]}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: a.tone === 'danger' || a.tone === 'dangerSolid' ? '#e11d48' : T.text }}>{a.label}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setMoreSheet(null)} style={[s.moreRow, { marginTop: 4 }]}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: T.sub }}>Close</Text>
          </Pressable>
        </View>
      </Modal>

      {/* ── PROPOSE TIME */}
      <Modal visible={proposeModal.isOpen} transparent animationType="slide"
        onRequestClose={() => !isSubmittingPropose && setProposeModal({ isOpen: false, session: null })}>
        <Pressable style={s.overlay} onPress={() => !isSubmittingPropose && setProposeModal({ isOpen: false, session: null })} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={s.grabber} />
          <Text style={s.sheetTitle}>Propose new time</Text>
          <Text style={{ fontSize: 13, color: T.sub, marginBottom: 16 }}>
            Offer a new schedule to <Text style={{ fontWeight: '700', color: T.text }}>{proposeModal.session?.student?.full_name}</Text>.
          </Text>
          <PickerField label="New date" mode="date" value={newDate} onChange={setNewDate} minimumDate={new Date()} />
          <PickerField label="New time" mode="time" value={newTime} onChange={setNewTime} />
          <View style={{ flexDirection: 'row', gap: 12, paddingTop: 6 }}>
            <Pressable onPress={() => setProposeModal({ isOpen: false, session: null })} style={[s.modalBtn, { backgroundColor: '#eff3f4' }]}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: T.text }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleProposeTime} disabled={isSubmittingPropose || !newDate || !newTime}
              style={[s.modalBtn, { backgroundColor: '#9333ea' }, (isSubmittingPropose || !newDate || !newTime) && { opacity: 0.5 }]}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>{isSubmittingPropose ? 'Sending…' : 'Send offer'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── DISPUTE & ESCROW DETAILS */}
      <Modal visible={disputeModal.isOpen} transparent animationType="slide"
        onRequestClose={() => setDisputeModal({ isOpen: false, session: null, reportInfo: null })}>
        <Pressable style={s.overlay} onPress={() => setDisputeModal({ isOpen: false, session: null, reportInfo: null })} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={s.grabber} />
          {disputeModal.session && (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, marginBottom: 10 }}>
                <View style={s.dispIcon}><ShieldCheck size={20} color="#be123c" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2 }}>Dispute & escrow record</Text>
                  <Text style={{ fontSize: 13, color: T.sub, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
                    Session #{disputeModal.session.id.slice(0, 8)}
                  </Text>
                </View>
                <Pressable onPress={() => setDisputeModal({ isOpen: false, session: null, reportInfo: null })} hitSlop={8}>
                  <X size={20} color={T.sub} />
                </Pressable>
              </View>

              <View style={s.grayBox}>
                <Text style={s.fieldLabel}>Filed reason</Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: T.text }}>{disputeModal.reportInfo?.reason || 'Issue Reported'}</Text>
              </View>

              <View style={s.grayBox}>
                <Text style={s.fieldLabel}>Complainant narrative / resolution</Text>
                <Text style={{ fontSize: 14, color: T.text, fontStyle: 'italic', lineHeight: 20 }}>
                  "{disputeModal.reportInfo?.details || 'Resolution metadata was logged by Trust & Safety.'}"
                </Text>
              </View>

              <View style={[s.grayBox, { backgroundColor: '#fff1f2', borderColor: '#fecdd3' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Scale size={17} color="#be123c" />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#881337' }}>Escrow allocation & verdict</Text>
                </View>
                <Text style={{ fontSize: 13, color: '#9f1239', lineHeight: 19 }}>
                  {disputeModal.session.status === 'completed' || disputeModal.session.status === 'cancelled' || disputeModal.reportInfo?.status === 'resolved'
                    ? `This dispute case has been settled and closed by Trust & Safety. The locked escrow amount of ${disputeModal.session.credit_amount} CR has been permanently distributed or refunded according to the moderator's final adjudication verdict.`
                    : `The escrow amount of ${disputeModal.session.credit_amount} CR is currently locked and held safely in the platform escrow vault awaiting a moderator's active review and adjudication.`}
                </Text>
              </View>

              <Pressable onPress={() => setDisputeModal({ isOpen: false, session: null, reportInfo: null })}
                style={[s.modalBtn, { backgroundColor: T.text, marginTop: 6, flex: 0 }]}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Acknowledge & close</Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* ── FILE DISPUTE */}
      <Modal visible={reportModal.isOpen} transparent animationType="slide"
        onRequestClose={() => !isSubmittingReport && setReportModal({ isOpen: false, session: null })}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={s.overlay} onPress={() => !isSubmittingReport && setReportModal({ isOpen: false, session: null })} />
          <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={s.grabber} />
            <Text style={s.sheetTitle}>File a dispute</Text>
            <Text style={{ fontSize: 13, color: T.sub, marginBottom: 16 }}>
              Against <Text style={{ fontWeight: '700', color: T.text }}>
                {reportModal.session && (reportModal.session.instructor_id === currentUserId ? reportModal.session.student?.full_name : reportModal.session.instructor?.full_name)}
              </Text>.
            </Text>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={s.fieldLabel}>Reason</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {REPORT_REASONS.map((r) => (
                  <Pressable key={r} onPress={() => setReportReason(r)} style={[s.selChip, reportReason === r && s.selChipOn]}>
                    <Text style={[s.selChipText, reportReason === r && { color: '#fff' }]}>{r}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={s.fieldLabel}>Details</Text>
              <TextInput value={reportDetails} onChangeText={setReportDetails} placeholder="Describe what happened…" placeholderTextColor={T.sub}
                multiline textAlignVertical="top" style={s.textarea} />

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
                <Pressable onPress={() => setReportModal({ isOpen: false, session: null })} style={[s.modalBtn, { backgroundColor: '#eff3f4' }]}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: T.text }}>Cancel</Text>
                </Pressable>
                <Pressable onPress={handleSubmitReport} disabled={isSubmittingReport || !reportDetails.trim()}
                  style={[s.modalBtn, { backgroundColor: '#e11d48' }, (isSubmittingReport || !reportDetails.trim()) && { opacity: 0.5 }]}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>{isSubmittingReport ? 'Submitting…' : 'Submit'}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── RATING */}
      <Modal visible={ratingModal.isOpen} transparent animationType="slide"
        onRequestClose={() => setRatingModal({ isOpen: false, session: null })}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={s.overlay} onPress={() => setRatingModal({ isOpen: false, session: null })} />
          <View style={[s.sheet, { paddingBottom: insets.bottom + 16, maxHeight: '92%' }]}>
            <View style={s.grabber} />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={{ alignItems: 'center', marginVertical: 14 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: T.text, letterSpacing: -0.2 }}>Provider evaluation</Text>
                <Text style={{ fontSize: 13, color: T.sub, marginTop: 4, textAlign: 'center' }}>
                  Rate <Text style={{ fontWeight: '700', color: T.text }}>{ratingModal.session?.instructor?.full_name}</Text>.
                </Text>
              </View>

              <StarRow label="Overall" Icon={Star} value={ratings.overall} onChange={(v) => setRatings((p) => ({ ...p, overall: v }))} />
              <StarRow label="Clarity" Icon={MessageCircle} value={ratings.clarity} onChange={(v) => setRatings((p) => ({ ...p, clarity: v }))} />
              <StarRow label="Patience" Icon={Heart} value={ratings.patience} onChange={(v) => setRatings((p) => ({ ...p, patience: v }))} />
              <StarRow label="Relevance" Icon={Target} value={ratings.relevance} onChange={(v) => setRatings((p) => ({ ...p, relevance: v }))} />
              <StarRow label="Professionalism" Icon={Briefcase} value={ratings.professionalism} onChange={(v) => setRatings((p) => ({ ...p, professionalism: v }))} />

              <Text style={[s.fieldLabel, { marginTop: 8 }]}>Comments (optional)</Text>
              <TextInput value={feedback} onChangeText={setFeedback} placeholder="Extra feedback…" placeholderTextColor={T.sub}
                multiline textAlignVertical="top" style={[s.textarea, { height: 80 }]} />

              <View style={{ flexDirection: 'row', gap: 12, paddingTop: 14, marginTop: 14 }}>
                <Pressable onPress={() => setRatingModal({ isOpen: false, session: null })} style={[s.modalBtn, { backgroundColor: '#eff3f4' }]}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: T.text }}>Cancel</Text>
                </Pressable>
                <Pressable onPress={handleSubmitRating} disabled={isSubmittingRating || !Object.values(ratings).every((v) => v > 0)}
                  style={[s.modalBtn, { backgroundColor: '#047857', flex: 2 }, (isSubmittingRating || !Object.values(ratings).every((v) => v > 0)) && { opacity: 0.5 }]}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>{isSubmittingRating ? 'Submitting…' : 'Submit'}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  // top
  topBlock: { paddingHorizontal: 16, backgroundColor: '#F5FBF7', paddingTop: 18, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#DDEFE3'},
  roleToggle: { flexDirection: 'row', borderRadius: 16, backgroundColor: '#E1F1E8', padding: 4},
  roleBtn: { flex: 1, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  roleBtnOn: { borderRadius: 13, backgroundColor: '#FFFFFF', shadowColor:'#0B573C', shadowOpacity:0.07, shadowRadius:5, shadowOffset:{width:0,height:2}, elevation:1},
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 34, borderRadius: 15, backgroundColor: '#EAF4ED'},
  tabOn: { backgroundColor: T.text },

  empty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 24 },
  showAll: { backgroundColor: T.brand, paddingHorizontal: 26, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  groupLabel: { fontSize: 13, fontWeight: '600', color: T.sub, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },

  // session rows (timeline style: avatar left, content aligned at 72px)
  card: { backgroundColor: '#fff', borderBottomWidth: 1, marginHorizontal: 12, marginTop: 10, borderRadius: 20, borderWidth: 1, borderColor: '#E0ECE5', borderBottomColor: '#E0ECE5', shadowColor:'#0B573C', shadowOpacity:0.04, shadowRadius:7, shadowOffset:{width:0,height:2}, elevation:1},
  cardHighlight: { backgroundColor: T.soft },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingBottom: 8 , paddingTop: 15},
  avatar: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: '#d1fae5', alignItems: 'center', justifyContent: 'center' },
  chip: { fontSize: 12, fontWeight: '600', paddingHorizontal: 9, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
  hint: { fontSize: 13, color: T.sub, paddingLeft: 72, paddingRight: 16, paddingBottom: 8 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 72, paddingRight: 16, paddingBottom: 12 },
  mainBtn: { flex: 1, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12 , borderRadius: 14, height: 41},
  tagBox: { flex: 1, height: 38, borderRadius: 19, backgroundColor: T.field, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: T.field, alignItems: 'center', justifyContent: 'center' },
  expanded: { paddingLeft: 72, paddingRight: 16, paddingBottom: 12 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 6 },
  dKey: { width: '28%', fontSize: 13, fontWeight: '600', color: T.sub },
  dVal: { width: '72%', fontSize: 13, color: T.text },

  // sheets
  overlay: { flex: 1, backgroundColor: 'rgba(15,20,25,0.5)' },
  sheet: { backgroundColor: '#fff', paddingHorizontal: 20, paddingTop: 8, maxHeight: '88%' , borderTopLeftRadius: 28, borderTopRightRadius: 28},
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: T.border, marginBottom: 6 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: T.text, marginTop: 6, marginBottom: 4, letterSpacing: -0.2 },
  moreRow: { height: 48, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: T.line },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: T.sub, marginBottom: 8 },
  pickInput: { backgroundColor: T.field, borderRadius: 22, paddingHorizontal: 16, height: 44, justifyContent: 'center' },
  modalBtn: { flex: 1, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  textarea: { height: 96, backgroundColor: T.field, borderRadius: 12, padding: 14, fontSize: 15, color: T.text },
  selChip: { justifyContent: 'center', paddingHorizontal: 14, height: 34, borderRadius: 17, backgroundColor: T.field },
  selChipOn: { backgroundColor: T.text },
  selChipText: { fontSize: 13, fontWeight: '600', color: T.text },
  starRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.line },
  dispIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ffe4e6', alignItems: 'center', justifyContent: 'center' },
  grayBox: { borderWidth: 1, padding: 12, marginBottom: 10 , backgroundColor: '#F4FAF6', borderRadius: 16, borderColor: '#DAEAE1'},
});