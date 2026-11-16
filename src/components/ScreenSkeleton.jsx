import React from 'react';
import { ScrollView, View } from 'react-native';

// Lightweight, dependency-free placeholders matching the main page layouts.
// Static skeletons intentionally avoid running animations while data is loading.
const Bone = ({ width = '100%', height = 14, radius = 7, style }) => (
  <View style={[{ width, height, borderRadius: radius, backgroundColor: '#e9eff0' }, style]} />
);

const Row = ({ type }) => (
  <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#eff3f4' }}>
    <Bone width={type === 'chat' || type === 'leaderboard' ? 48 : 52} height={type === 'chat' || type === 'leaderboard' ? 48 : 52} radius={type === 'chat' || type === 'leaderboard' ? 24 : 12} />
    <View style={{ flex: 1, gap: 10, paddingTop: 3 }}>
      <Bone width="52%" height={14} />
      <Bone width="92%" height={12} />
      <Bone width="64%" height={12} />
    </View>
  </View>
);

export default function ScreenSkeleton({ type = 'list' }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }} accessibilityLabel="Loading content">
      <ScrollView contentContainerStyle={{ paddingBottom: 90 }} scrollEnabled={false}>
        <View style={{ padding: 16, gap: 13, borderBottomWidth: 1, borderBottomColor: '#eff3f4' }}>
          {type !== 'chat' && <Bone width="42%" height={22} radius={9} />}
          <Bone width="100%" height={42} radius={12} />
          {type === 'sessions' && <View style={{ flexDirection: 'row', gap: 8 }}>
            {[0, 1, 2].map((i) => <Bone key={i} width={85} height={30} radius={15} />)}
          </View>}
        </View>
        {Array.from({ length: 6 }, (_, i) => <Row key={i} type={type} />)}
      </ScrollView>
    </View>
  );
}
