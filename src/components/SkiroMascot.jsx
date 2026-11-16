// Lightweight native vector mascot for Skiro AI.
// Visual-only: no Supabase calls, no timers that run after unmount, no chat state writes.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Stop } from 'react-native-svg';

const EXPRESSIONS = new Set(['idle', 'typing', 'thinking', 'replying']);

export default function SkiroMascot({ size = 44, mood = 'idle' }) {
  const expression = EXPRESSIONS.has(mood) ? mood : 'idle';
  const [reduceMotion, setReduceMotion] = useState(false);
  const [blink, setBlink] = useState(false);
  const float = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduceMotion(Boolean(value));
    }).catch(() => {});
    const listener = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduceMotion);
    return () => { mounted = false; listener?.remove?.(); };
  }, []);

  useEffect(() => {
    float.setValue(0);
    pulse.setValue(0);
    if (reduceMotion) return;
    const speed = expression === 'thinking' ? 780 : expression === 'replying' ? 520 : expression === 'typing' ? 670 : 1480;
    const movement = Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: 1, duration: speed, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(float, { toValue: -1, duration: speed, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(float, { toValue: 0, duration: speed, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    const breathing = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 960, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 960, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    movement.start();
    breathing.start();
    return () => { movement.stop(); breathing.stop(); float.stopAnimation(); pulse.stopAnimation(); };
  }, [expression, reduceMotion, float, pulse]);

  useEffect(() => {
    if (reduceMotion) { setBlink(false); return; }
    let closed = false;
    let nextTimer;
    let reopenTimer;
    const schedule = () => {
      nextTimer = setTimeout(() => {
        if (closed) return;
        setBlink(true);
        reopenTimer = setTimeout(() => { if (!closed) { setBlink(false); schedule(); } }, 135);
      }, 3400 + Math.floor(Math.random() * 1200));
    };
    schedule();
    return () => { closed = true; clearTimeout(nextTimer); clearTimeout(reopenTimer); };
  }, [reduceMotion]);

  const drift = float.interpolate({ inputRange: [-1, 0, 1], outputRange: [-size * 0.034, 0, size * 0.034] });
  const tilt = float.interpolate({ inputRange: [-1, 0, 1], outputRange: expression === 'thinking' ? ['-6deg', '-2deg', '4deg'] : ['-2deg', '0deg', '2deg'] });
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] });
  const eyesClosed = blink || expression === 'replying';

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`Skiro AI mascot ${expression}`} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ width: size, height: size, transform: [{ translateY: drift }, { rotate: tilt }, { scale }] }}>
        <Svg width={size} height={size} viewBox="0 0 120 120">
          <Defs>
            <LinearGradient id="skiro-emerald" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#10b981" />
              <Stop offset="0.58" stopColor="#059669" />
              <Stop offset="1" stopColor="#047857" />
            </LinearGradient>
          </Defs>
          <Circle cx="60" cy="60" r="55" fill="url(#skiro-emerald)" />
          <Circle cx="45" cy="29" r="19" fill="#b7f7d6" opacity={0.1} />
          <Path d="M53 15 Q55 15 56 20 L59 34 Q60 38 64 39 L78 42 Q82 43 78 46 L64 49 Q60 50 59 54 L56 68 Q55 72 53 68 L50 54 Q49 50 45 49 L31 46 Q27 43 31 42 L45 39 Q49 38 50 34 Z"
            stroke="#fff" strokeWidth="4.4" strokeLinejoin="round" fill="none" opacity={0.96} />
          <Path d="M85 20 V36 M77 28 H93" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
          {eyesClosed ? (
            <G stroke="#fff" strokeWidth="5.2" strokeLinecap="round" fill="none">
              <Path d="M28 75 Q36 65 44 75" />
              <Path d="M75 75 Q83 65 91 75" />
            </G>
          ) : expression === 'thinking' ? (
            <G fill="#fff"><Ellipse cx="35" cy="71" rx="5.6" ry="7.4" /><Ellipse cx="79" cy="68" rx="5.6" ry="7.4" /><Circle cx="34" cy="68" r="1.7" fill="#047857"/><Circle cx="78" cy="65" r="1.7" fill="#047857" /></G>
          ) : expression === 'typing' ? (
            <G fill="#fff"><Ellipse cx="35" cy="73" rx="5.6" ry="7.4" /><Ellipse cx="80" cy="73" rx="5.6" ry="7.4" /><Circle cx="37.3" cy="72" r="1.6" fill="#047857" /><Circle cx="82.3" cy="72" r="1.6" fill="#047857" /></G>
          ) : (
            <G fill="#fff"><Circle cx="35" cy="73" r="6"/><Circle cx="80" cy="73" r="6"/><Circle cx="35" cy="72" r="1.7" fill="#047857"/><Circle cx="80" cy="72" r="1.7" fill="#047857"/></G>
          )}
          <Path d="M24 91 L20 99 M34 93 L31 101 M91 92 L95 100 M101 91 L105 99"
            stroke="#b6f5d3" strokeWidth="3.8" strokeLinecap="round" opacity={0.75} />
          {expression === 'thinking' ? (
            <Ellipse cx="60" cy="92" rx="5.7" ry="6.6" fill="#fff" />
          ) : expression === 'typing' ? (
            <Path d="M52 92 Q60 97 68 92" fill="none" stroke="#fff" strokeWidth="4.4" strokeLinecap="round" />
          ) : expression === 'replying' ? (
            <Path d="M46 88 Q60 107 74 88 Q60 91 46 88" fill="#fff" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
          ) : (
            <Path d="M48 89 Q60 103 72 89" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
          )}
        </Svg>
      </Animated.View>
    </View>
  );
}
