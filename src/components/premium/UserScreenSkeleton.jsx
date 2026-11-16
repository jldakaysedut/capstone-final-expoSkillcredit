// SkillCredit user-only, page-shaped loading placeholders.
// Static by design: no shimmer loops, timers, network requests, or extra packages.
// Each page keeps its original loading condition; only the visual fallback changes.
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useUserTheme } from './PremiumTheme';

const PALETTE = {
  light: { canvas: '#ffffff', card: '#ffffff', bone: '#e5eeeb', border: '#e7efec', soft: '#f7faf9' },
  dark: { canvas: '#0c151b', card: '#162329', bone: '#2b4249', border: '#2a4048', soft: '#102027' },
};
function Bone({ p, width = '100%', height = 13, radius = 7, style }) {
  return <View style={[{ width, height, borderRadius: radius, backgroundColor: p.bone }, style]} />;
}
function Row({ p, children, style }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 11 }, style]}>{children}</View>;
}
function Card({ p, children, style }) {
  return <View style={[{ backgroundColor: p.card, borderColor: p.border, borderWidth: 1, borderRadius: 18, padding: 15 }, style]}>{children}</View>;
}
function Lines({ p, widths = ['70%', '92%', '55%'], height = 12 }) {
  return <View style={{ flex: 1, gap: 9 }}>
    {widths.map((w, i) => <Bone key={i} p={p} width={w} height={i === 0 ? height + 2 : height} />)}
  </View>;
}
function Circle({ p, size = 44 }) { return <Bone p={p} width={size} height={size} radius={size / 2} />; }
function Field({ p, label = '42%', height = 44 }) {
  return <View style={{ gap: 10 }}><Bone p={p} width={label} height={12} /><Bone p={p} height={height} radius={12} /></View>;
}
function SearchBar({ p }) { return <Bone p={p} height={46} radius={15} />; }
function ContactList({ p, count = 5 }) {
  return Array.from({ length: count }, (_, i) => <Row p={p} key={i} style={{ paddingVertical: 13, borderBottomColor: p.border, borderBottomWidth: 1 }}>
    <Circle p={p} size={48} /><Lines p={p} widths={i % 2 ? ['55%', '76%'] : ['43%', '89%']} />
    <Bone p={p} width={28} height={10} />
  </Row>);
}
function PostCard({ p }) {
  return <Card p={p} style={{ gap: 12 }}>
    <Row p={p}><Circle p={p} /><Lines p={p} widths={['44%', '30%']} /></Row>
    <Bone p={p} width="94%" /><Bone p={p} width="75%" height={12} />
    <Bone p={p} height={134} radius={14} />
    <Row p={p} style={{ justifyContent: 'space-between' }}>
      <Bone p={p} width={64} height={12} /><Bone p={p} width={64} height={12} /><Bone p={p} width={54} height={12} />
    </Row>
  </Card>;
}
function ListingCard({ p }) {
  return <Card p={p} style={{ gap: 11 }}>
    <Row p={p}><Bone p={p} width={88} height={88} radius={14} /><Lines p={p} widths={['88%', '68%', '46%']} /></Row>
    <Row p={p} style={{ justifyContent: 'space-between' }}><Bone p={p} width={76} height={24} radius={12} /><Bone p={p} width={92} height={24} radius={12} /></Row>
  </Card>;
}
function ChatBubbles({ p, count = 5 }) {
  return <View style={{ gap: 18, paddingVertical: 8 }}>
    {Array.from({ length: count }, (_, i) => <View key={i} style={{ alignItems: i % 3 === 1 ? 'flex-end' : 'flex-start' }}>
      <Bone p={p} width={i % 3 === 1 ? '53%' : '74%'} height={i % 2 ? 52 : 72} radius={17} />
    </View>)}
  </View>;
}
function SkeletonContent({ type, p }) {
  switch (type) {
    case 'community': return <View style={{ gap: 14 }}>
      <Bone p={p} width="55%" height={25} /><SearchBar p={p} /><Card p={p}>
        <Row p={p}><Circle p={p} size={37} /><Bone p={p} width="67%" height={16} /></Row>
      </Card><PostCard p={p} /><PostCard p={p} />
    </View>;
    case 'chat': return <View style={{ gap: 14 }}>
      <Bone p={p} width="52%" height={25} /><SearchBar p={p} /><ContactList p={p} />
    </View>;
    case 'thread': case 'aiChat': return <ChatBubbles p={p} count={type === 'aiChat' ? 4 : 6} />;
    case 'sessions': return <View style={{ gap: 14 }}>
      <Bone p={p} width="60%" height={25} /><SearchBar p={p} />
      <Row p={p}>{[80, 83, 70].map((w, i) => <Bone key={i} p={p} width={w} height={32} radius={16} />)}</Row>
      {[0, 1, 2].map((i) => <Card p={p} key={i} style={{ gap: 13 }}>
        <Row p={p}><Circle p={p} size={38} /><Lines p={p} widths={['72%', '53%']} /><Bone p={p} width={55} height={23} radius={12} /></Row>
        <Bone p={p} width="85%" /><Row p={p} style={{ justifyContent: 'space-between' }}><Bone p={p} width={108} height={12} /><Bone p={p} width={94} height={32} radius={13} /></Row>
      </Card>)}
    </View>;
    case 'leaderboard': return <View style={{ gap: 16 }}>
      <Bone p={p} width="57%" height={25} />
      <Row p={p} style={{ justifyContent: 'space-around', alignItems: 'flex-end', paddingTop: 14 }}>
        {[52, 72, 52].map((size, i) => <View key={i} style={{ alignItems: 'center', gap: 11 }}><Circle p={p} size={size} /><Bone p={p} width={74} height={11} /></View>)}
      </Row><SearchBar p={p} /><ContactList p={p} count={4} />
    </View>;
    case 'settings': return <View style={{ gap: 16 }}>
      <Card p={p}><Row p={p}><Circle p={p} size={42} /><Lines p={p} widths={['45%', '67%']} /></Row></Card>
      <Card p={p} style={{ gap: 18 }}><Bone p={p} width="56%" height={18} /><Field p={p} /><Field p={p} /><Bone p={p} height={44} radius={16} /></Card>
      <Card p={p}><Row p={p}><Circle p={p} size={37} /><Lines p={p} widths={['43%', '73%']} /><Bone p={p} width={43} height={24} radius={14} /></Row></Card>
    </View>;
    case 'skillDetails': return <View style={{ gap: 16 }}>
      <Bone p={p} height={208} radius={19} /><Bone p={p} width="76%" height={25} />
      <Row p={p}><Bone p={p} width={106} height={25} radius={12} /><Bone p={p} width={69} height={25} radius={12} /></Row>
      <Card p={p}><Row p={p}><Circle p={p} size={49} /><Lines p={p} widths={['60%', '38%']} /></Row></Card>
      <Card p={p} style={{ gap: 11 }}><Bone p={p} width="44%" height={17} /><Bone p={p} width="94%" /><Bone p={p} width="87%" /><Bone p={p} width="61%" /></Card>
      <Bone p={p} height={49} radius={22} />
    </View>;
    case 'editSkill': case 'createSkill': return <View style={{ gap: 18 }}>
      <Bone p={p} width="52%" height={22} /><Bone p={p} height={5} radius={3} />
      <Field p={p} label="36%" /><Field p={p} label="34%" /><Field p={p} label="42%" height={92} />
      <Card p={p} style={{ gap: 12 }}><Bone p={p} width="36%" /><Bone p={p} height={108} radius={16} /></Card>
      <Bone p={p} height={47} radius={20} />
    </View>;
    case 'profile': case 'publicProfile': return <View style={{ gap: 14 }}>
      <Card p={p} style={{ alignItems: 'center', gap: 11 }}><Circle p={p} size={72} /><Bone p={p} width="56%" height={18} /><Bone p={p} width="81%" /></Card>
      <Row p={p} style={{ justifyContent: 'space-between' }}>{[0, 1, 2].map((i) => <Bone key={i} p={p} width="30%" height={75} radius={15} />)}</Row>
      <Bone p={p} width="48%" height={20} /><ListingCard p={p} /><ListingCard p={p} />
    </View>;
    case 'notifications': return <View style={{ gap: 14 }}><Bone p={p} width="58%" height={23} />
      <SearchBar p={p} /><ContactList p={p} count={6} />
    </View>;
    case 'payments': return <View style={{ gap: 14 }}><Card p={p} style={{ gap: 13 }}>
      <Bone p={p} width="51%" /><Bone p={p} width="62%" height={40} /><Bone p={p} height={39} radius={16} />
    </Card><Row p={p} style={{ gap: 9 }}><Bone p={p} width="48%" height={75} /><Bone p={p} width="48%" height={75} /></Row>
    <Bone p={p} width="42%" height={21} /><ContactList p={p} count={4} /></View>;
    case 'dashboard': return <View style={{ gap: 15 }}><Bone p={p} height={130} radius={18} />
      <SearchBar p={p} /><Bone p={p} width="44%" height={22} />
      <Row p={p}><Bone p={p} width="48%" height={190} radius={17} /><Bone p={p} width="48%" height={190} radius={17} /></Row>
      <Bone p={p} width="44%" height={22} /><ListingCard p={p} />
    </View>;
    case 'listings': return <View style={{ gap: 14 }}><Bone p={p} width="60%" height={25} />
      <Row p={p} style={{ justifyContent: 'space-around' }}>{[0,1,2].map(i=><Bone p={p} key={i} width="29%" height={65} radius={13}/>)}</Row>
      <SearchBar p={p}/><ListingCard p={p}/><ListingCard p={p}/>
    </View>;
    case 'interests': return <View style={{ gap: 16 }}><Bone p={p} height={105} radius={18} />
      <Bone p={p} width="64%" height={23} />
      <Row p={p} style={{ flexWrap:'wrap' }}>{[0,1,2,3,4,5,6,7].map((i) => <Bone key={i} p={p} width={i%2 ? '44%' : '50%'} height={48} radius={15} />)}</Row>
    </View>;
    default: return <View style={{ gap: 13 }}><SearchBar p={p}/><ContactList p={p}/></View>;
  }
}
export default function UserScreenSkeleton({ type = 'chat', embedded = false }) {
  const { isDark } = useUserTheme();
  const p = isDark ? PALETTE.dark : PALETTE.light;
  const content = <View style={{ padding: embedded ? 0 : 16 }}><SkeletonContent type={type} p={p} /></View>;
  if (embedded) return <View pointerEvents="none" accessibilityLabel="Loading messages" style={{ flex: 1, backgroundColor: p.canvas }}>{content}</View>;
  return <View pointerEvents="none" accessibilityLabel="Loading content" style={{ flex: 1, backgroundColor: p.canvas }}>
    <ScrollView scrollEnabled={false} contentContainerStyle={{ paddingBottom: 80 }}>
      {content}
    </ScrollView>
  </View>;
}
