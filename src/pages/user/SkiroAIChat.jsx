import UserScreenSkeleton from '../../components/premium/UserScreenSkeleton';
// Native Skiro AI chat. Uses the existing Web-compatible ai_chat_messages format
// and the already-deployed skillcredit-ai-chat Edge Function. No new backend objects.
import { Reveal, PressScale } from '../../components/premium/PremiumVisual';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, AppState, Keyboard, Modal, Platform, StyleSheet
} from 'react-native';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from '../../components/premium/PremiumThemePrimitives';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, BookOpen, CalendarDays, ChevronRight, Coins, History, Plus, Search, Send, Sparkles, Trash2, UserRound, Wallet, X } from '../../components/premium/PremiumThemeIcons';
import { Alert } from '../../components/SkillCreditAlert';
import supabase from '../../supabaseClient';
import SkiroMascot from '../../components/SkiroMascot';

const MAX_CHARS = 2000;
const CARD_PREFIX = '__SKILLCREDIT_AI_RESULTS_V1__:';
const MODES = [
  { id: 'chat', title: 'Ask SkillCredit', Icon: Sparkles },
  { id: 'recommend', title: 'Explore skills', Icon: Search },
  { id: 'sessions', title: 'My sessions', Icon: CalendarDays },
  { id: 'wallet', title: 'My wallet', Icon: Wallet },
  { id: 'listings', title: 'My listings', Icon: BookOpen },
  { id: 'describe', title: 'Skill Creator', Icon: Sparkles },
];
const SAFE_LINKS = {
  '/payments': 'Payments', '/sessions': 'Sessions', '/notifications': 'Notifications',
  '/my-listings': 'MyListings', '/create-skill': 'CreateSkill', '/community': 'Community',
  '/messages': 'Messages', '/dashboard': 'Dashboard',
};
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
  const r = Math.floor(Math.random() * 16);
  return (ch === 'x' ? r : ((r & 3) | 8)).toString(16);
});
const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const safeDraft = (v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const max = { title: 120, description: 2300, outcomes: 1200, category: 95, format: 30, duration: 15 };
  const result = Object.fromEntries(Object.entries(max).map(([k, n]) => [k, typeof v[k] === 'string' ? v[k].slice(0, n).trim() : '']));
  return result.title && result.description && result.outcomes ? result : null;
};
const unpack = (value) => {
  if (typeof value !== 'string' || !value.startsWith(CARD_PREFIX)) return { text: value || '', cards: [], links: [], draft: null };
  try {
    const v = JSON.parse(value.slice(CARD_PREFIX.length));
    if (typeof v.text !== 'string' || !Array.isArray(v.cards)) throw Error('Invalid saved response');
    return {
      text: v.text,
      cards: v.cards.filter((c) => c && ['user', 'skill'].includes(c.type) && isUuid(c.id) && typeof c.title === 'string').slice(0, 12),
      links: (Array.isArray(v.links) ? v.links : []).filter((link) => link && SAFE_LINKS[link.path] && typeof link.label === 'string').slice(0, 3),
      draft: safeDraft(v.draft),
    };
  } catch { return { text: 'Saved AI message could not be displayed.', cards: [], links: [], draft: null }; }
};
const pack = (text, cards, links, draft) => {
  const payload = {
    text: text.slice(0, 4200),
    cards: (Array.isArray(cards) ? cards : [])
      .filter((c) => c && ['user', 'skill'].includes(c.type) && isUuid(c.id))
      .slice(0, 12)
      .map((c) => ({ type: c.type, id: c.id, title: String(c.title || '').slice(0, 120), subtitle: String(c.subtitle || '').slice(0, 125), instructor_name: String(c.instructor_name || '').slice(0, 90), credit_cost: c.credit_cost })),
    links: (Array.isArray(links) ? links : []).filter((l) => l && SAFE_LINKS[l.path]).slice(0, 3)
      .map((l) => ({ path: l.path, label: String(l.label || 'Open page').slice(0, 55) })),
    draft: safeDraft(draft),
  };
  if (!payload.cards.length && !payload.links.length && !payload.draft) return text.slice(0, 10000);
  let result = CARD_PREFIX + JSON.stringify(payload);
  while (result.length > 11000 && payload.cards.length) { payload.cards.pop(); result = CARD_PREFIX + JSON.stringify(payload); }
  if (result.length > 11000) result = CARD_PREFIX + JSON.stringify({ ...payload, text: text.slice(0, 2500) });
  return result.length <= 11000 ? result : text.slice(0, 10000);
};
// Preserve the user's exact wording in chat history. A chosen topic is kept
// as a small, human-readable suffix in the SAME saved user message, because
// the existing AI Edge Function verifies saved text and counts one row/quota.
// The Expo UI renders the request and chosen topic as separate chat bubbles.
const CHOSEN_TOPIC_MARKER = '\n\nSelected topic: ';
const displayTopic = (term) => {
  const value = String(term || '').trim();
  const known = {
    'coding, programming, and technology': 'Coding & tech',
    'graphic design and digital art': 'Design & art',
    'gardening and plant care': 'Gardening',
    'fitness and sports': 'Fitness',
    'website and app design': 'Website & app design',
    'Photoshop and photo editing': 'Photo editing',
    'video editing and animation': 'Videos',
    'writing and proofreading': 'Writing',
  };
  return known[value] || value;
};
const visibleUserMessage = (value) => {
  const text = String(value || '');
  const markerAt = text.lastIndexOf(CHOSEN_TOPIC_MARKER);
  if (markerAt > 0) {
    const original = text.slice(0, markerAt);
    const subject = text.slice(markerAt + CHOSEN_TOPIC_MARKER.length).trim();
    if (original && subject && !subject.includes('\n')) return { original, topic: displayTopic(subject) };
  }
  // Also render the prior version's synthetic saved requests naturally,
  // without modifying or deleting any existing Supabase chat records.
  const old = text.match(/^Find real SkillCredit instructors or available skill listings that teach (.+)\. \(Clarification of: "([\s\S]+)"\)$/);
  if (old) return { original: old[2], topic: displayTopic(old[1]) };
  return { original: text, topic: '' };
};
const selectedTopicPrompt = (original, subject) => {
  const request = String(original || '').trim();
  const topic = String(subject || '').trim().replace(/[\r\n]+/g, ' ').slice(0, 250);
  return request && topic ? `${request}${CHOSEN_TOPIC_MARKER}${topic}` : '';
};
const getTitle = (messages) => visibleUserMessage(messages.find((m) => m.role === 'user')?.content).original.slice(0, 48) || 'New conversation';

// Official category names from Expo CreateSkill.jsx. The database is still the
// source of truth for real, approved listings; these are ONLY local search hints.
const SKILL_CATEGORIES = [
  'Cooking & Baking', 'Gardening & Plant Care', 'Home Repair & DIY',
  'Fitness & Sports', 'Beauty & Personal Care',
  'Computer, Phone & Electronics Help', 'School Subjects & Tutoring',
  'Writing & Editing', 'Languages & Public Speaking', 'Music & Singing',
  'Graphic Design & Digital Art', 'Video, Animation & AI Content Creation',
  'Business, Entrepreneurship & Marketing', 'Finance, Investing & Trading',
  'Website & App Design', 'Coding & Programming',
];

// Subject clusters express meaning, not just literal category names. Specific
// terms get a stronger title score; broader requests search related categories.
const SKILL_TOPICS = [
  { id: 'technology', match: /\b(?:tech(?:nology|nical)?|it skills?|information technology|computer technology)\b/i,
    categories: ['Coding & Programming', 'Website & App Design', 'Computer, Phone & Electronics Help'],
    terms: ['coding', 'programming', 'software', 'python', 'javascript', 'web development', 'app development', 'website', 'computer', 'laptop', 'electronics', 'hardware', 'it support'], broad: true },
  { id: 'coding', match: /\b(?:cod(?:e|ing|er)|programm?(?:ing|er)?|software develop(?:ment|er)?|python|javascript|typescript|java\b|html|css\b|react|node\.?js|debugg?(?:ing)?|magcode)\b/i,
    categories: ['Coding & Programming'], terms: ['coding', 'programming', 'python', 'javascript', 'typescript', 'java', 'html', 'css', 'react', 'software', 'debugging', 'code'] },
  { id: 'webapp', match: /\b(?:web(?:site)?\s*(?:development|design|dev|creation)|app\s*(?:develop(?:ment)?|design|creation)|webdev|mobile app|build (?:a )?(?:website|app)|make (?:a )?(?:website|app)|ui\s*\/?\s*ux|figma|wireframe)\b/i,
    categories: ['Website & App Design', 'Coding & Programming'], terms: ['web development', 'website', 'web design', 'app development', 'mobile app', 'figma', 'ui ux', 'react', 'wireframe', 'frontend'] },
  { id: 'repair', match: /\b(?:computer repair|laptop repair|pc repair|phone repair|fix (?:my )?(?:computer|laptop|phone)|electronics?|troubleshoot(?:ing)?|hardware|printer repair|tech support)\b/i,
    categories: ['Computer, Phone & Electronics Help'], terms: ['repair', 'troubleshooting', 'computer', 'laptop', 'phone', 'electronics', 'hardware', 'printer'] },
  { id: 'design', match: /\b(?:graphic design|graphics?|photoshop|photo\s*edit(?:ing)?|photograph(?:y|ic)|image editing|retouch(?:ing)?|canva|digital art|illustrat(?:ion|ing|or)|draw(?:ing)?|digital paint(?:ing)?|logo design|poster design)\b/i,
    categories: ['Graphic Design & Digital Art'], terms: ['photoshop', 'photo editing', 'photography', 'image editing', 'graphic design', 'canva', 'digital art', 'illustration', 'drawing', 'logo', 'design'] },
  { id: 'video', match: /\b(?:video edit(?:ing)?|animat(?:ion|ing)?|capcut|premiere pro|after effects|motion graphics|film(?:making)?|reels|tiktok video|ai content|content creation)\b/i,
    categories: ['Video, Animation & AI Content Creation'], terms: ['video editing', 'animation', 'capcut', 'premiere', 'after effects', 'motion graphics', 'content creation', 'ai video'] },
  { id: 'cooking', match: /\b(?:cook(?:ing)?|bak(?:ing|e)?|chef|pastr(?:y|ies)|recipes?|culinary|dessert|luto|magluto)\b/i,
    categories: ['Cooking & Baking'], terms: ['cooking', 'baking', 'pastry', 'chef', 'recipe', 'food', 'dessert'] },
  { id: 'gardening', match: /\b(?:garden(?:ing|er)?|farm(?:ing|er)?|agricultur(?:e|al)?|plant(?:ing|s)?|horticultur(?:e|al)|grow(?:ing)? vegetables?|succulent|landscap(?:e|ing)|halaman|magtanim|pagtatanim)\b/i,
    categories: ['Gardening & Plant Care'], terms: ['garden', 'gardening', 'farm', 'farming', 'agriculture', 'plants', 'plant care', 'growing', 'planting', 'vegetables', 'landscaping'] },
  { id: 'home', match: /\b(?:diy|home repair|house repair|plumb(?:ing|er)|carpentry|woodwork(?:ing)?|home maintenance|furniture repair|handyman)\b/i,
    categories: ['Home Repair & DIY'], terms: ['diy', 'home repair', 'plumbing', 'carpentry', 'woodworking', 'furniture'] },
  { id: 'fitness', match: /\b(?:fitness|work\s*out|exercise|gym|weightlift(?:ing)?|yoga|pilates|basketball|volleyball|sports?|cardio|personal train(?:ing|er))\b/i,
    categories: ['Fitness & Sports'], terms: ['fitness', 'workout', 'gym', 'yoga', 'exercise', 'sports', 'basketball', 'volleyball'] },
  { id: 'beauty', match: /\b(?:beauty|make\s*up|makeup|cosmetics?|skincare|skin care|hair\s*styling|nail art|manicure|salon)\b/i,
    categories: ['Beauty & Personal Care'], terms: ['beauty', 'makeup', 'cosmetics', 'skincare', 'hair', 'nail'] },
  { id: 'school', match: /\b(?:math(?:ematics)?|algebra|physics|chemistry|biology|science|homework|exam prep|school subjects?|academic tutor(?:ing)?)\b/i,
    categories: ['School Subjects & Tutoring'], terms: ['math', 'mathematics', 'algebra', 'physics', 'chemistry', 'biology', 'science', 'tutoring'] },
  { id: 'writing', match: /\b(?:writ(?:e|ing|er)|essay|proofread(?:ing)?|grammar|copywrit(?:ing)?|blogg?(?:ing)?|scriptwrit(?:ing)?|resume writ(?:ing)?)\b/i,
    categories: ['Writing & Editing'], terms: ['writing', 'editing', 'essay', 'proofreading', 'grammar', 'copywriting', 'script'] },
  { id: 'language', match: /\b(?:languages?|english|spanish|french|korean|japanese|chinese|tagalog|bisaya|pronunciation|public speak(?:ing)?|speech|conversation practi(?:ce|se))\b/i,
    categories: ['Languages & Public Speaking'], terms: ['language', 'english', 'spanish', 'korean', 'japanese', 'pronunciation', 'public speaking', 'speech'] },
  { id: 'music', match: /\b(?:music|sing(?:ing|er)?|vocals?|guitar|piano|ukulele|drums?|violin|instrument(?:s)?|songwrit(?:ing)?|kumanta)\b/i,
    categories: ['Music & Singing'], terms: ['music', 'singing', 'guitar', 'piano', 'voice', 'vocals', 'drums', 'instrument'] },
  { id: 'business', match: /\b(?:business|entrepreneur(?:ship)?|marketing|selling|sales|startup|ecommerce|e-commerce|branding strategy|negosyo|digital marketing)\b/i,
    categories: ['Business, Entrepreneurship & Marketing'], terms: ['business', 'entrepreneur', 'marketing', 'sales', 'ecommerce', 'startup'] },
  { id: 'finance', match: /\b(?:financ(?:e|ial)|invest(?:ing|ment)?|trad(?:e|ing|er)|stocks?|stock market|crypto|forex|budget(?:ing)?|personal finance|money management)\b/i,
    categories: ['Finance, Investing & Trading'], terms: ['finance', 'investing', 'trading', 'budgeting', 'stocks', 'crypto', 'forex'] },
];
const tidy = (value) => String(value || '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}+#]+/gu, ' ').replace(/\s+/g, ' ').trim();
const topicMatches = (text) => SKILL_TOPICS.filter((topic) => topic.match.test(String(text || '')));
// V4 presentation intent: do not mix teacher profiles into requests for lessons,
// or skill listing cards into requests for people. The Edge Function still
// determines what can be retrieved; this controls only the type of cards shown.
const discoveryResultType = (message, selectedMode) => {
  const text = String(message || '').replace(/\n\nSelected topic: .+$/s, '');
  const peopleWords = '(?:teachers?|instructors?|mentors?|tutors?|users?|people|persons?)';
  const listingWords = '(?:skills?|lessons?|courses?|listings?|classes?|workshops?)';
  const asksPeople = /\b(?:teachers?|instructors?|mentors?|tutors?|users?|people|persons?|someone|somebody|sino|nagtuturo|magtuturo|who\s+(?:can\s+)?teach(?:es)?|who\s+offers?)\b/i.test(text);
  const asksListings = /\b(?:skills?|lessons?|courses?|listings?|classes?|workshops?)\b/i.test(text);
  const coordinatedPeopleFirst = new RegExp(`\\b${peopleWords}\\b\\s+(?:and|plus|as well as|along with)\\s+(?:(?:their|available|some|the)\\s+){0,3}(?:[\\w-]+\\s+){0,3}${listingWords}\\b`, 'i');
  const coordinatedListingsFirst = new RegExp(`\\b${listingWords}\\b\\s+(?:and|plus|as well as|along with)\\s+(?:(?:available|some|the)\\s+){0,2}${peopleWords}\\b`, 'i');
  // "Coding and baking lessons with a teacher" is still a teacher request,
  // while "teachers and lessons" explicitly asks for both result types.
  const explicitlyBoth = asksPeople && asksListings && (/\bboth\b/i.test(text) || coordinatedPeopleFirst.test(text) || coordinatedListingsFirst.test(text));
  if (explicitlyBoth) return 'both';
  if (asksPeople) return 'user';
  return 'skill'; // A discovery mode without a person request means skill listings.
};
const filterDiscoveryCards = (items, resultType) => {
  const rows = Array.isArray(items) ? items : [];
  if (resultType === 'both') return rows.slice(0, 12);
  return rows.filter((item) => item?.type === resultType).slice(0, 12);
};
const isDiscoveryRequest = (text, mode) => {
  if (mode === 'recommend') return true;
  if (!['chat', 'recommend'].includes(mode)) return false;
  const value = String(text || '');
  if (/\b(?:my|mine)\s+(?:sessions?|listings?|wallet|payments?|notifications?|credits?|balance)\b/i.test(value)) return false;
  return /\b(?:find|search|looking for|look for|show me|recommend|suggest|hanap(?:in)?|naghahanap|pahanap|sino|teachers?|instructors?|tutors?|mentors?|who (?:can )?teach(?:es)?|someone who teach(?:es)?|people who teach|users? who teach|nagtuturo|magtuturo|nag.?ooffer)\b/i.test(value);
};
const subjectTokens = (text) => tidy(text).split(' ').filter((word) => word.length >= 3 && !/^(?:find|search|looking|look|show|please|could|would|want|need|learn|teach|teaches|teacher|teachers|instructor|instructors|tutor|tutors|mentor|mentors|someone|person|people|users|user|skill|skills|lesson|lessons|course|courses|class|classes|with|about|what|where|which|that|this|who|how|for|the|and|any|good|best|some|hello|help|related|topic|topics|subject|subjects|give|list|something|anything|available|offer|offers|provide|provides|naman|lang|ako|sino|hanap|mga|nagtuturo)$/.test(word));
const getClarification = (text, selectedMode) => {
  const value = String(text || '').trim();
  if (/\b(?:my|mine)\b/i.test(value) && /\b(?:credits?|wallet|sessions?|listings?|notifications?)\b/i.test(value)) return null;
  const discovering = isDiscoveryRequest(value, selectedMode);
  // "Design" and "editing" alone can refer to very different skills.
  if (discovering && !topicMatches(value).length && /\bdesign\b/i.test(value) &&
      !/\b(?:graphic|logo|digital|ui|ux|website|web|app|figma|photo|art|interior|fashion)\b/i.test(value)) {
    return {
      original: value,
      question: 'What kind of design do you want to learn?',
      options: [
        { label: 'Graphic design', query: 'graphic design and digital art' },
        { label: 'Website & app design', query: 'website and app design' },
        { label: 'Photo editing', query: 'Photoshop and photo editing' },
      ],
    };
  }
  if (discovering && !topicMatches(value).length && /\bedit(?:ing)?\b/i.test(value) &&
      !/\b(?:photo|image|photoshop|video|text|writing|document|audio)\b/i.test(value)) {
    return {
      original: value,
      question: 'What would you like to edit?',
      options: [
        { label: 'Photos', query: 'Photoshop and photo editing' },
        { label: 'Videos', query: 'video editing and animation' },
        { label: 'Writing', query: 'writing and proofreading' },
      ],
    };
  }
  const vagueDiscovery = discovering && !topicMatches(value).length && !subjectTokens(value).length;
  const vagueLearning = /^(?:(?:hi|hello|hey)[,!?. ]*)?(?:teach me something|i want to learn|i wanna learn|teach me anything|i want to study|help me learn)(?:[.!? ]*)$/i.test(value);
  if (!vagueDiscovery && !vagueLearning) return null;
  return {
    original: value,
    question: 'What subject would you like to learn or find an instructor for?',
    options: [
      { label: 'Coding & tech', query: 'coding, programming, and technology' },
      { label: 'Design & art', query: 'graphic design and digital art' },
      { label: 'Gardening', query: 'gardening and plant care' },
      { label: 'Fitness', query: 'fitness and sports' },
    ],
  };
};

// Search across the official CreateSkill categories AND relevant titles, rather
// than only a newest-N global feed. Related skills are labelled as related;
// an old approved gardening listing should not disappear behind newer posts.
const includesPhrase = (text, phrase) => (` ${tidy(text)} `).includes(` ${tidy(phrase)} `);
const keywordHits = (text, terms) => terms.reduce((count, term) => count + (includesPhrase(text, term) ? 1 : 0), 0);
const EXACT_SUBJECTS = ['python', 'javascript', 'typescript', 'java', 'react', 'html', 'css', 'photoshop', 'figma', 'canva', 'capcut', 'premiere pro', 'guitar', 'piano', 'algebra', 'physics', 'chemistry', 'korean', 'japanese', 'spanish', 'forex', 'crypto'];
const SEARCH_COLUMNS = 'id, instructor_id, title, category, description, outcomes, credit_cost, created_at';
const TOPIC_SUFFIX = '\n\nSelected topic: ';
const searchSubject = (message) => {
  const value = String(message || '').trim();
  const index = value.lastIndexOf(TOPIC_SUFFIX);
  return index >= 0 ? value.slice(index + TOPIC_SUFFIX.length).trim() : value;
};
const queryConcepts = (message) => {
  const subject = searchSubject(message);
  const topics = topicMatches(subject);
  // Include a category named literally in the user's message, and recognize
  // canonical categories even when they have no dedicated synonym trigger.
  for (const category of SKILL_CATEGORIES) {
    if (includesPhrase(subject, category) && !topics.some((topic) => topic.categories.includes(category))) {
      topics.push({ id: `category:${category}`, categories: [category], terms: [category], broad: true });
    }
  }
  // Keep only meaningful subject tokens. Do not try to match "teacher" or "find".
  const tokens = subjectTokens(subject).filter((term) => !/^(?:selected|topic|topics|user|users|skillcredit)$/.test(term));
  const categories = [...new Set(topics.flatMap((topic) => topic.categories))];
  return { subject, topics, tokens, categories };
};
const hasSubjectWord = (text, word) => {
  const needle = tidy(word);
  if (!needle) return false;
  if (includesPhrase(text, needle)) return true;
  // Exact technologies/tools must never become false synonyms: Java != JavaScript,
  // React != reactive, and CSS != a longer unrelated word.
  if (EXACT_SUBJECTS.includes(needle)) return false;
  // Covers garden/gardening, program/programming, photo/photos, etc.,
  // but never use substring matching for very short words such as "AI".
  if (needle.length < 4 || needle.includes(' ')) return false;
  const root = needle.slice(0, Math.max(4, needle.length - 2));
  return tidy(text).split(' ').some((token) => token.startsWith(root) && token.length >= 4);
};
const relevanceScore = (skill, { topics, tokens, categories }) => {
  const title = skill.title || '';
  const category = String(skill.category || '');
  const details = `${skill.description || ''} ${skill.outcomes || ''}`;
  let score = 0;
  if (categories.includes(category)) score = 58; // Related category is a valid candidate, not a failure.
  for (const group of topics) {
    const titleHits = group.terms.filter((term) => hasSubjectWord(title, term)).length;
    const detailHits = group.terms.filter((term) => hasSubjectWord(details, term)).length;
    if (group.categories.includes(category)) {
      score = Math.max(score, 58 + Math.min(titleHits * 12, 30) + Math.min(detailHits * 2, 8));
    } else if (titleHits) {
      // A strong title match can compensate for a cross-category or legacy category.
      score = Math.max(score, 44 + Math.min(titleHits * 12, 32) + Math.min(detailHits * 2, 6));
    }
  }
  const directTitleHits = tokens.filter((term) => hasSubjectWord(title, term)).length;
  const directCategoryHits = tokens.filter((term) => hasSubjectWord(category, term)).length;
  const directDetailHits = tokens.filter((term) => hasSubjectWord(details, term)).length;
  if (directTitleHits) score = Math.max(score, 40 + Math.min(15 * directTitleHits, 45));
  if (directCategoryHits) score = Math.max(score, 40 + Math.min(12 * directCategoryHits, 25));
  // For an unfamiliar but meaningful subject (e.g. 'sculpting'), a clearly
  // matching description can surface a related listing even without a known alias.
  if (!topics.length && directDetailHits && tokens.length <= 3) {
    score = Math.max(score, 38 + Math.min(directDetailHits * 6, 18));
  }
  if (score > 0) score += Math.min(2 * directDetailHits, 8);
  return score;
};

async function verifiedSkillResults(message, selectedMode) {
  if (!isDiscoveryRequest(message, selectedMode)) return null;
  const concepts = queryConcepts(message);
  if (!concepts.categories.length && !concepts.tokens.length) return null;

  const candidates = new Map();
  const addRows = (rows) => {
    for (const skill of rows || []) {
      if (isUuid(skill.id) && isUuid(skill.instructor_id)) candidates.set(skill.id, skill);
    }
  };
  const activeQuery = () => supabase.from('skills').select(SEARCH_COLUMNS)
    .eq('status', 'approved').eq('is_active', true);

  // Look in each matching category independently. A 1-year-old gardening
  // listing is still eligible, even if 600 unrelated skills were added later.
  const categoryLookups = concepts.categories.slice(0, 12).map((category) =>
    activeQuery().eq('category', category).order('created_at', { ascending: false }).limit(160));
  const categoryResults = await Promise.all(categoryLookups);
  for (const { data, error } of categoryResults) {
    if (error) throw error;
    addRows(data);
  }

  // Search titles/descriptions outside the expected categories too, including
  // uncommon subjects without hardcoded aliases. Batch terms to avoid extra
  // network round trips on slower mobile connections.
  const titleTerms = [...new Set([
    ...concepts.tokens.filter((term) => term.length >= 3),
    ...concepts.topics.flatMap((topic) => topic.terms).filter((term) => term.length >= 4),
  ])].map((term) => tidy(term)).filter((term) => term.length >= 3 && term.length <= 40).slice(0, 7);
  if (titleTerms.length) {
    const filters = titleTerms.flatMap((term) => [
      `title.ilike.%${term}%`, `description.ilike.%${term}%`, `outcomes.ilike.%${term}%`,
    ]);
    const { data, error } = await activeQuery().or(filters.join(','))
      .order('created_at', { ascending: false }).limit(160);
    if (error) throw error;
    addRows(data);
  }

  const ranked = [...candidates.values()]
    .map((skill) => ({ ...skill, matchScore: relevanceScore(skill, concepts) }))
    .filter((skill) => skill.matchScore >= 40)
    .sort((a, b) => b.matchScore - a.matchScore || new Date(b.created_at) - new Date(a.created_at));
  if (!ranked.length) return null; // Preserve the existing backend search, not a false negative.

  // Exact named tools get first priority, but broad related alternatives are
  // still useful when there is no verified exact listing.
  const specifics = EXACT_SUBJECTS.filter((term) => includesPhrase(concepts.subject, term));
  const exact = specifics.length ? ranked.filter((skill) => specifics.some((term) =>
    hasSubjectWord(skill.title, term) || hasSubjectWord(skill.description, term) || hasSubjectWord(skill.outcomes, term))) : [];
  const onlyRelated = specifics.length > 0 && !exact.length;
  const focused = exact.length ? exact : ranked;
  const shortList = focused.slice(0, 36);
  const instructorIds = [...new Set(shortList.map((skill) => skill.instructor_id))];
  if (!instructorIds.length) return null;
  const { data: profiles, error: profilesError } = await supabase.from('user_profiles')
    .select('id, full_name, is_deleted, is_banned, is_active').in('id', instructorIds);
  if (profilesError) throw profilesError;
  // Treat a missing/null status as not explicitly disabled. Previous strict
  // eq(true) filters wrongly excluded otherwise visible instructor profiles.
  const people = new Map((profiles || []).filter((person) => isUuid(person.id) &&
    person.is_deleted !== true && person.is_banned !== true && person.is_active !== false)
    .map((person) => [person.id, person]));
  const valid = shortList.filter((skill) => people.has(skill.instructor_id));
  if (!valid.length) return null; // Let the already-deployed AI search respond.

  const resultType = discoveryResultType(message, selectedMode);
  const listings = valid.slice(0, resultType === 'both' ? 8 : 12).map((skill) => ({
    type: 'skill', id: skill.id, title: String(skill.title || 'Skill listing'),
    subtitle: skill.category,
    instructor_name: String(people.get(skill.instructor_id)?.full_name || 'SkillCredit instructor'),
    credit_cost: skill.credit_cost,
  }));
  const instructors = [], seen = new Set();
  if (resultType !== 'skill') for (const skill of valid) {
    if (seen.has(skill.instructor_id)) continue;
    seen.add(skill.instructor_id);
    instructors.push({ type: 'user', id: skill.instructor_id,
      title: String(people.get(skill.instructor_id)?.full_name || 'SkillCredit instructor'),
      subtitle: `Teaches ${skill.category}` });
    if (instructors.length === (resultType === 'both' ? 4 : 12)) break;
  }
  const cards = resultType === 'user' ? instructors : resultType === 'skill' ? listings : [...instructors, ...listings].slice(0, 12);
  const categoryNames = [...new Set(valid.slice(0, 8).map((skill) => skill.category))].slice(0, 3);
  return {
    text: `${onlyRelated ? 'I could not verify an exact match for that specific subject, but here are related options.' :
      resultType === 'user' ? `I found **${instructors.length} matching instructor${instructors.length === 1 ? '' : 's'}**.` :
      resultType === 'skill' ? `I found **${listings.length} matching or related active skill listing${listings.length === 1 ? '' : 's'}**.` :
      `I found **${instructors.length} instructor${instructors.length === 1 ? '' : 's'}** and **${listings.length} active skill listing${listings.length === 1 ? '' : 's'}**.`}` +
      `${categoryNames.length ? ` Related categories include **${categoryNames.join('**, **')}**.` : ''} ` +
      'Open a card to learn more, or tell me a more specific topic to narrow the results.',
    cards,
  };
}

// The Edge Function returns Markdown like **bold**, headings and bullet lists.
// React Native Text does not parse Markdown automatically, unlike the Web renderer.
// Render safe formatting locally without inserting HTML or changing stored AI messages.
function InlineMarkdown({ text }) {
  const parts = String(text).split(/(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/g);
  return parts.map((part, index) => {
    const bold = (part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'));
    const code = part.startsWith('`') && part.endsWith('`') && part.length >= 2;
    const italic = !bold && ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) && part.length >= 2;
    if (bold) return <Text key={index} style={styles.markdownBold}>{part.slice(2, -2)}</Text>;
    if (code) return <Text key={index} style={styles.markdownCode}>{part.slice(1, -1)}</Text>;
    if (italic) return <Text key={index} style={styles.markdownItalic}>{part.slice(1, -1)}</Text>;
    return part;
  });
}
function AiMessageText({ text }) {
  let inCode = false;
  return <View style={styles.markdownBlock}>
    {String(text || '').replace(/\r/g, '').split('\n').map((raw, index) => {
      const line = raw.trim();
      if (/^```/.test(line)) { inCode = !inCode; return null; }
      if (!line) return <View key={index} style={styles.markdownSpace} />;
      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      const bullet = line.match(/^[-*•]\s+(.+)$/);
      const numbered = line.match(/^(\d+[.)])\s+(.+)$/);
      const value = (heading ? heading[2] : bullet ? bullet[1] : numbered ? numbered[2] : line)
        .replace(/\[([^\]]+)\]\((?:https?:\/\/|\/)[^)]+\)/g, '$1');
      return <Text key={index} selectable style={[styles.messageText,
        heading && styles.markdownHeading, (bullet || numbered) && styles.markdownList, inCode && styles.markdownCodeLine]}>
        {bullet ? '•  ' : numbered ? `${numbered[1]}  ` : null}<InlineMarkdown text={value} />
      </Text>;
    })}
  </View>;
}


export default function SkiroAIChat() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const listRef = useRef(null);
  const sendingRef = useRef(false);
  const replyTimer = useRef(null);
  const thinkingDotsRef = useRef(null);
  if (!thinkingDotsRef.current) thinkingDotsRef.current = [new Animated.Value(0.35), new Animated.Value(0.35), new Animated.Value(0.35)];
  const thinkingDots = thinkingDotsRef.current;
  const [userId, setUserId] = useState(null);
  const [allMessages, setAllMessages] = useState([]);
  const [chatId, setChatId] = useState(null);
  const [mode, setMode] = useState('chat');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [replying, setReplying] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState('');
  const [clarification, setClarification] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [usage, setUsage] = useState(null);
  const [lastSentAt, setLastSentAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const mascotMood = sending ? 'thinking' : replying ? 'replying' : draft.trim() ? 'typing' : 'idle';
  useEffect(() => () => clearTimeout(replyTimer.current), []);

  const refreshUsage = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('skillcredit-ai-chat', { body: { action: 'usage_status' } });
      if (!error && data?.usage) setUsage(data.usage);
    } catch { /* The server will enforce the actual limits. */ }
  }, []);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) throw Error('Please sign in first.');
        if (!active) return;
        setUserId(auth.user.id);
        const rows = [];
        const pageSize = 500;
        for (let offset = 0; ; offset += pageSize) {
          const { data, error } = await supabase.from('ai_chat_messages')
            .select('id, user_id, chat_id, role, content, created_at')
            .eq('user_id', auth.user.id)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(offset, offset + pageSize - 1);
          if (error) throw error;
          rows.push(...(data || []));
          if (!data || data.length < pageSize) break;
        }
        if (active) { setAllMessages(rows); setChatId(rows[rows.length - 1]?.chat_id || null); }
      } catch (err) { if (active) setErrorText(err.message || 'Could not load Skiro AI.'); }
      finally { if (active) setLoading(false); }
    })();
    void refreshUsage();
    return () => { active = false; };
  }, [refreshUsage]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') void refreshUsage(); });
    return () => { clearInterval(t); sub.remove(); };
  }, [refreshUsage]);

  // On Android, keep the composer visible above the software keyboard.
  // Also give the input more room by temporarily collapsing the mode row.
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardOpen(true);
      listRef.current?.scrollToEnd({ animated: true });
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => { shown.remove(); hidden.remove(); };
  }, []);

  // Subtle three-dot typing animation, no oversized spinner/card.
  useEffect(() => {
    if (!sending) return;
    const loops = thinkingDots.map((dot, index) => Animated.loop(Animated.sequence([
      Animated.delay(index * 180),
      Animated.timing(dot, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.timing(dot, { toValue: 0.35, duration: 360, useNativeDriver: true }),
      Animated.delay((2 - index) * 180 + 120),
    ])));
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [sending, thinkingDots]);

  const conversations = Object.entries(allMessages.reduce((group, m) => {
    (group[m.chat_id] ||= []).push(m);
    return group;
  }, {})).map(([id, messages]) => ({ id, title: getTitle(messages), date: messages[messages.length - 1]?.created_at }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const visibleMessages = allMessages.filter((m) => m.chat_id === chatId);
  const resetAt = Date.parse(usage?.reset_at || '');
  const retryAt = Date.parse(usage?.retry_at || '');
  const blocked = (usage?.remaining === 0 && (!Number.isFinite(resetAt) || now < resetAt)) ||
    (usage?.reason && usage.reason !== 'ok' && Number.isFinite(retryAt) && now < retryAt);
  const cooling = now - lastSentAt < 5000;
  const canSend = !!userId && !sending && !loading && !blocked && !cooling && !!draft.trim() && draft.length <= MAX_CHARS;

  const openSafeRoute = (route, params) => navigation.navigate(route, params);
  const send = async (topicChoice = null) => {
    // Choice is a real selection, not a replacement prompt authored as the user.
    // Store original wording plus a short subject suffix in ONE user row.
    const typed = draft.trim();
    const selected = topicChoice && typeof topicChoice === 'object' ? topicChoice : null;
    const chosenSubject = selected ? selected.query : typed;
    const text = clarification
      ? selectedTopicPrompt(clarification.original, chosenSubject)
      : typed;
    if (!text || !userId || sending || loading || blocked || cooling || sendingRef.current) return;
    if (text.length > MAX_CHARS) {
      setErrorText('Your request and selected topic must be within 2,000 characters. Please shorten the text.');
      return;
    }
    if (!clarification) {
      const followUp = getClarification(text, mode);
      if (followUp) {
        setClarification(followUp);
        setDraft('');
        setErrorText('');
        return; // Clarification is local; no AI quota or DB write until selection.
      }
    }
    setClarification(null);
    sendingRef.current = true;
    clearTimeout(replyTimer.current);
    setReplying(false);
    setSending(true);
    setPendingPrompt(text);
    setErrorText('');
    setLastSentAt(Date.now());
    setDraft('');
    const nextId = chatId || uuid();
    if (!chatId) setChatId(nextId);
    const history = visibleMessages.slice(-10).map((m) => ({
      role: m.role,
      content: (m.role === 'assistant' ? unpack(m.content).text : m.content).slice(0, MAX_CHARS),
    }));
    try {
      const { data: saved, error: insertError } = await supabase.from('ai_chat_messages')
        .insert({ user_id: userId, chat_id: nextId, role: 'user', content: text })
        .select('id, user_id, chat_id, role, content, created_at').single();
      if (insertError) throw insertError;
      setAllMessages((prev) => [...prev, saved]);
      const { data, error } = await supabase.functions.invoke('skillcredit-ai-chat', {
        body: { mode, message: text, history, message_id: saved.id },
      });
      if (error) {
        let errorCode = '';
        let reason = 'Skiro AI is temporarily unavailable. Please try again.';
        try {
          const details = await error.context?.json();
          errorCode = details?.code || '';
          reason = details?.error || reason;
          if (details?.usage) setUsage(details.usage);
          if (details?.retry_at) setUsage((prev) => ({ ...(prev || {}), reason: errorCode || 'provider_cooldown', retry_at: details.retry_at, allowed: false }));
        } catch { /* Fall back to a generic error message. */ }
        if (['user_limit', 'shared_limit', 'slow_down', 'provider_cooldown'].includes(errorCode)) {
          const { error: deleteError } = await supabase.from('ai_chat_messages').delete().eq('user_id', userId).eq('id', saved.id);
          if (!deleteError) setAllMessages((prev) => prev.filter((m) => m.id !== saved.id));
        }
        throw new Error(reason);
      }
      if (data?.usage) setUsage(data.usage);
      if (typeof data?.answer !== 'string' || !data.answer.trim()) throw Error('Skiro AI did not return an answer.');
      let answer = data.answer.trim();
      let cards = data.results;
      let links = data.links;
      let aiDraft = data.draft;
      if (isDiscoveryRequest(text, mode) && (queryConcepts(text).topics.length || queryConcepts(text).tokens.length)) {
        try {
          const verified = await verifiedSkillResults(text, mode);
          if (verified) {
            answer = verified.text;
            cards = verified.cards;
            links = [];
            aiDraft = null;
          }
        } catch (lookupError) {
          // The app-side read may be unavailable (including RLS differences).
          // Preserve the Edge Function answer and its server-verified results.
          console.warn('Skiro AI additional relevance lookup unavailable:', lookupError?.message);
        }
      }
      // Even when the extra mobile lookup fails, keep the server results scoped
      // to the user's requested card type instead of accidentally mixing cards.
      if (isDiscoveryRequest(text, mode)) {
        cards = filterDiscoveryCards(cards, discoveryResultType(text, mode));
      }
      const { data: response, error: saveError } = await supabase.from('ai_chat_messages')
        .insert({ user_id: userId, chat_id: nextId, role: 'assistant', content: pack(answer, cards, links, aiDraft) })
        .select('id, user_id, chat_id, role, content, created_at').single();
      if (saveError) throw saveError;
      setAllMessages((prev) => [...prev, response]);
      setReplying(true);
      replyTimer.current = setTimeout(() => setReplying(false), 1450);
    } catch (err) {
      console.error('Skiro AI request failed:', err);
      setErrorText(err?.message || 'Could not send your request.');
    } finally {
      sendingRef.current = false;
      setSending(false);
      setPendingPrompt('');
      void refreshUsage();
    }
  };

  const deleteChat = (id) => {
    Alert.alert('Delete conversation?', 'This AI chat history will be permanently deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('ai_chat_messages').delete().eq('user_id', userId).eq('chat_id', id);
        if (error) { setErrorText(error.message); return; }
        setAllMessages((prev) => prev.filter((m) => m.chat_id !== id));
        if (chatId === id) { setChatId(null); setClarification(null); }
      } },
    ]);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#fff' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Reveal delay={90}><View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.iconButton}><ArrowLeft size={22} color="#0f1419" /></Pressable>
        <View style={styles.avatar}><SkiroMascot size={42} mood={mascotMood} /></View>
        <View style={{ flex: 1 }}><Text style={styles.title}>Skiro AI</Text><Text style={styles.subtitle}>SkillCredit assistant</Text></View>
        <Pressable onPress={() => { if (!sending) { setChatId(null); setDraft(''); setClarification(null); setErrorText(''); } }} style={styles.iconButton} accessibilityLabel="New AI chat"><Plus size={22} color="#047857" /></Pressable>
        <Pressable onPress={() => setShowHistory(true)} style={styles.iconButton} accessibilityLabel="AI chat history"><History size={22} color="#536471" /></Pressable>
      </View></Reveal>
      <ScrollView ref={listRef} style={{ flex: 1 }} contentContainerStyle={styles.chatArea} onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })} keyboardShouldPersistTaps="handled">
        {loading ? <UserScreenSkeleton type="aiChat" embedded /> : visibleMessages.length === 0 && !clarification ? (
          <View style={styles.empty}><SkiroMascot size={100} mood={mascotMood} /><Text style={styles.emptyTitle}>Ask Skiro AI</Text><Text style={styles.emptySub}>Find skills, check session information, learn about your wallet, or draft your next listing.</Text></View>
        ) : visibleMessages.map((m) => {
          const response = m.role === 'assistant' ? unpack(m.content) : { text: m.content, cards: [], links: [], draft: null };
          const mine = m.role === 'user';
          const shown = mine ? visibleUserMessage(m.content) : null;
          return <View key={m.id} style={mine ? styles.userMessageGroup : [styles.bubble, styles.theirs]}>
            {mine ? <>
              <View style={[styles.bubble, styles.mine]}><Text selectable style={[styles.messageText, { color: '#fff' }]}>{shown.original}</Text></View>
              {!!shown.topic && <View style={[styles.bubble, styles.mine, styles.selectedTopicBubble]}>
                <Text style={styles.selectedTopicText}>{shown.topic}</Text>
              </View>}
            </> : <>
              <Text style={styles.sender}>Skiro AI</Text>
              <AiMessageText text={response.text} />
            </>}
            {response.cards.map((card) => (
              <PressScale key={card.id} style={styles.resultCard} onPress={() => openSafeRoute(card.type === 'user' ? 'PublicProfile' : 'SkillDetails', { id: card.id })}>
                {card.type === 'user' ? <UserRound size={18} color="#047857"/> : <BookOpen size={18} color="#047857"/>}
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultTitle} numberOfLines={2}>{card.title}</Text>
                  {!!card.subtitle && <Text style={styles.resultSub} numberOfLines={2}>{card.subtitle}</Text>}
                  {card.type === 'skill' && <Text style={styles.resultMeta} numberOfLines={2}>
                    {[card.instructor_name, card.credit_cost != null && Number.isFinite(Number(card.credit_cost)) ? `${card.credit_cost} CR` : ''].filter(Boolean).join(' · ')}
                  </Text>}
                  <Text style={styles.resultCta}>{card.type === 'user' ? 'View profile' : 'View skill'}</Text>
                </View>
                <ChevronRight size={17} color="#047857" />
              </PressScale>
            ))}
            {response.links.map((link) => (
              <Pressable key={link.path} style={styles.linkChip} onPress={() => openSafeRoute(SAFE_LINKS[link.path])}>
                <Text style={styles.linkText}>{link.label}</Text><ChevronRight size={15} color="#047857" />
              </Pressable>
            ))}
            {!!response.draft && <Pressable style={styles.draftAction} onPress={() => openSafeRoute('CreateSkill', { aiDraft: response.draft })}>
              <BookOpen size={17} color="#fff" /><Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Review draft in Create Skill</Text>
            </Pressable>}
          </View>;
        })}
        {!!clarification && !sending && <>
          <View style={[styles.bubble, styles.mine]}>
            <Text selectable style={[styles.messageText, { color: '#fff' }]}>{clarification.original}</Text>
          </View>
          <View style={[styles.bubble, styles.theirs, styles.clarificationBox]}>
          <Text style={styles.sender}>Skiro AI</Text>
          <Text style={styles.clarificationQuestion}>{clarification.question}</Text>
          <View style={styles.clarificationChoices}>
            {clarification.options.map((choice) => (
              <Pressable key={choice.label} disabled={sending || blocked || cooling} onPress={() => send(choice)}
                style={[styles.clarificationChoice, (sending || blocked || cooling) && { opacity: 0.5 }]}>
                <Text style={styles.clarificationChoiceText}>{choice.label}</Text>
                <ChevronRight size={13} color="#047857" />
              </Pressable>
            ))}
          </View>
          <Text style={styles.clarificationHint}>Or type another subject below.</Text>
          </View>
        </>}
        {sending && <View style={styles.thinkingBubble} accessibilityRole="text" accessibilityLabel="Skiro AI is responding">
          <View style={styles.thinkingHeader}><View style={styles.thinkingIcon}><SkiroMascot size={23} mood="thinking" /></View>
            <Text style={styles.thinkingTitle}>Skiro AI</Text>
          </View>
          <View style={styles.thinkingRow}>
            <View style={styles.thinkingDots}>
              {thinkingDots.map((dot, index) => <Animated.View key={index} style={[styles.thinkingDot, { opacity: dot, transform: [{ scale: dot.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }]} />)}
            </View>
            <Text style={styles.thinkingText}>{isDiscoveryRequest(pendingPrompt, mode) ? (discoveryResultType(pendingPrompt, mode) === 'user' ? 'Finding relevant instructors…' : 'Finding relevant skills…') : 'Thinking…'}</Text>
          </View>
        </View>}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: keyboardOpen ? 8 : Math.max(insets.bottom, 10) }]}>
        {!keyboardOpen && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 9 }}>
          {MODES.map((item) => <Pressable key={item.id} onPress={() => { setMode(item.id); setClarification(null); }} style={[styles.modeChip, mode === item.id && styles.modeActive]}>
            <item.Icon size={13} color={mode === item.id ? '#fff' : '#047857'} />
            <Text style={[styles.modeText, mode === item.id && { color: '#fff' }]}>{item.title}</Text>
          </Pressable>)}
        </ScrollView>}
        {!!errorText && <Text style={styles.error}>{errorText}</Text>}
        <View style={styles.inputRow}>
          <TextInput multiline value={draft} onChangeText={setDraft} maxLength={MAX_CHARS} placeholder="Message Skiro AI…"
            placeholderTextColor="#8b98a5" style={styles.input} editable={!sending} />
          <PressScale onPress={() => send()} disabled={!canSend} style={[styles.sendButton, !canSend && { backgroundColor: '#9ca3af' }]}>
            <Send size={19} color="#fff" />
          </PressScale>
        </View>
        {!keyboardOpen && <Text style={styles.footerText}>{usage?.remaining !== undefined ? `${usage.remaining} messages remaining this hour · ` : ''}{cooling ? '5-second pause' : '20 messages/hour · 5-second cooldown'}</Text>}
      </View>
      <Modal transparent visible={showHistory} animationType="slide" onRequestClose={() => setShowHistory(false)}>
        <View style={styles.historyOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowHistory(false)} />
          <View style={[styles.historyCard, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.historyHeader}><Text style={styles.title}>AI conversations</Text><Pressable onPress={() => setShowHistory(false)}><X size={22} color="#0f1419" /></Pressable></View>
            <Pressable style={styles.historyRow} onPress={() => { setChatId(null); setShowHistory(false); setDraft(''); setClarification(null); }}><Plus size={20} color="#047857" /><Text style={styles.historyTitle}>New conversation</Text></Pressable>
            <ScrollView style={{ maxHeight: 360 }}>
              {conversations.map((item) => (
                <View key={item.id} style={styles.historyRow}>
                  <Pressable style={{ flex: 1 }} onPress={() => { setChatId(item.id); setShowHistory(false); setClarification(null); setErrorText(''); }}><Text style={styles.historyTitle} numberOfLines={1}>{item.title}</Text></Pressable>
                  <Pressable disabled={sending} onPress={() => deleteChat(item.id)} hitSlop={8}><Trash2 size={18} color="#e11d48" /></Pressable>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 7, borderBottomWidth: 1, paddingHorizontal: 9, backgroundColor: '#F7FCF9', borderBottomColor: '#DCEEE2', paddingBottom: 13},
  iconButton: { padding: 5, justifyContent: 'center', alignItems: 'center' },
  avatar: { alignItems: 'center', justifyContent: 'center', borderRadius: 16, width: 44, height: 44 },
  title: { fontWeight: '800', color: '#0f1419' , fontSize: 18, letterSpacing: -0.4},
  subtitle: { fontSize: 11, color: '#536471', marginTop: 2 },
  chatArea: { flexGrow: 1, padding: 14, paddingBottom: 28 , paddingHorizontal: 15, gap: 13},
  empty: { flex: 1, minHeight: 240, alignItems: 'center', justifyContent: 'center', padding: 18 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#0f1419', marginTop: 12 },
  emptySub: { fontSize: 13, color: '#536471', textAlign: 'center', marginTop: 7, lineHeight: 19 },
  bubble: { maxWidth: '92%', borderRadius: 19, padding: 13, gap: 8},
  mine: { backgroundColor: '#047857', alignSelf: 'flex-end' },
  userMessageGroup: { alignSelf: 'stretch', alignItems: 'flex-end', gap: 5 },
  selectedTopicBubble: { paddingHorizontal: 11, paddingVertical: 7, backgroundColor: '#d1fae5' },
  selectedTopicText: { fontSize: 12, fontWeight: '700', color: '#065f46' },
  theirs: { alignSelf: 'flex-start' , backgroundColor: '#F1F8F4', borderWidth: 1, borderColor: '#E3F0E7'},
  sender: { fontSize: 11, fontWeight: '800', color: '#047857' },
  clarificationBox: { maxWidth: '92%', backgroundColor: '#EDF8F1'},
  clarificationQuestion: { fontSize: 13, fontWeight: '700', color: '#0f1419', lineHeight: 19 },
  clarificationChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 3 },
  clarificationChoice: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', borderWidth: 1, borderRadius: 14, borderColor: '#B7E6CA', paddingHorizontal: 11, paddingVertical: 10},
  clarificationChoiceText: { fontSize: 12, fontWeight: '700', color: '#047857' },
  clarificationHint: { fontSize: 10, color: '#64748b', lineHeight: 15 },
  thinkingBubble: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start', minWidth: 162, maxWidth: '84%' , borderRadius: 18, backgroundColor: '#F2FBF6', borderColor: '#D9F0E2'},
  thinkingHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  thinkingIcon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  thinkingTitle: { color: '#047857', fontSize: 11, fontWeight: '800' },
  thinkingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 7 },
  thinkingDots: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  thinkingDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#059669' },
  thinkingText: { color: '#64748b', fontSize: 12 },
  messageText: { fontSize: 14, lineHeight: 21, color: '#0f1419' },
  markdownBlock: { gap: 2 },
  markdownSpace: { height: 6 },
  markdownBold: { fontWeight: '800' },
  markdownItalic: { fontStyle: 'italic' },
  markdownCode: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', backgroundColor: '#e6eeea', fontSize: 13 },
  markdownHeading: { fontWeight: '800', marginTop: 5, marginBottom: 2, fontSize: 15, lineHeight: 22 },
  markdownList: { paddingLeft: 8 },
  markdownCodeLine: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12 },
  resultCard: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, backgroundColor: '#fff' , borderRadius: 15, padding: 12, borderColor: '#CDEDDC', shadowColor:'#047857', shadowOpacity:0.035, shadowRadius:7, shadowOffset:{width:0,height:2}, elevation:1},
  resultTitle: { fontSize: 12, fontWeight: '700', color: '#0f1419' },
  resultSub: { color: '#536471', fontSize: 11, marginTop: 3 },
  resultMeta: { color: '#64748b', fontSize: 11, marginTop: 4 },
  resultCta: { color: '#047857', fontSize: 11, fontWeight: '700', marginTop: 4 },
  linkChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#a7f3d0', backgroundColor: '#fff', paddingHorizontal: 9, paddingVertical: 8, alignSelf: 'flex-start' , borderRadius: 13},
  linkText: { color: '#047857', fontWeight: '700', fontSize: 12 },
  draftAction: { backgroundColor: '#047857', flexDirection: 'row', gap: 7, alignItems: 'center', borderRadius: 15, padding: 13},
  footer: { borderTopWidth: 1, paddingHorizontal: 12, backgroundColor: '#FAFDFB', borderTopColor: '#DCEFE4', paddingTop: 12},
  modeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, backgroundColor: '#effaf4', borderWidth: 1, borderColor: '#d1fae5', paddingHorizontal: 10, paddingVertical: 8 },
  modeActive: { backgroundColor: '#047857', borderColor: '#047857' },
  modeText: { fontSize: 11, fontWeight: '700', color: '#047857' },
  error: { color: '#be123c', fontSize: 12, paddingBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 7 },
  input: { flex: 1, maxHeight: 130, paddingHorizontal: 13, paddingVertical: 10, fontSize: 14, color: '#0f1419' , borderRadius: 19, backgroundColor: '#F1F7F3', minHeight: 45, borderWidth: 1, borderColor: '#DDEDE4'},
  sendButton: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#047857' , borderRadius: 16, height: 45, width: 45},
  footerText: { fontSize: 10, color: '#9ca3af', textAlign: 'right', marginTop: 7 },
  historyOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  historyCard: { backgroundColor: '#fff', padding: 16 , borderTopLeftRadius: 28, borderTopRightRadius: 28},
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  historyRow: { paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#eff3f4' },
  historyTitle: { fontSize: 14, color: '#0f1419', fontWeight: '600' },
});
