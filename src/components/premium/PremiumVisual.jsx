// SkillCredit user UI trial: presentation-only helpers.
// Uses React Native's built-in Animated API; no dependency or business-logic changes.
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable } from 'react-native';
import { useThemeStyle } from './PremiumThemePrimitives';

// One OS preference read shared by all visual effects; prevents dozens of
// native bridge calls at screen mount on budget Android devices.
let reduceMotionPromise;
export const prefersReducedMotion = () => {
  if (!reduceMotionPromise) {
    reduceMotionPromise = AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
  }
  return reduceMotionPromise;
};
const ENTER_MS = Platform.OS === 'android' ? 190 : 260;
const ENTER_RISE = Platform.OS === 'android' ? 5 : 8;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Reveal({ children, style, delay = 0 }) {
  const themedStyle = useThemeStyle(style);
  const opacity = useRef(new Animated.Value(0.90)).current;
  const rise = useRef(new Animated.Value(ENTER_RISE)).current;

  useEffect(() => {
    let current = true;
    let animation;
    const animate = (reduced) => {
      if (!current) return;
      if (reduced) {
        opacity.setValue(1);
        rise.setValue(0);
        return;
      }
      animation = Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: ENTER_MS, delay: Math.min(delay, 65), easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(rise, { toValue: 0, duration: ENTER_MS, delay: Math.min(delay, 65), easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]);
      animation.start();
    };
    prefersReducedMotion().then(animate).catch(() => animate(false));
    return () => {
      current = false;
      animation?.stop();
    };
  }, [delay, opacity, rise]);

  return <Animated.View style={[themedStyle, { opacity, transform: [{ translateY: rise }] }]}>{children}</Animated.View>;
}

export function PressScale({ children, style, onPressIn, onPressOut, ...props }) {
  const themedStyle = useThemeStyle(style);
  const scale = useRef(new Animated.Value(1)).current;
  const active = useRef(true);

  useEffect(() => {
    let mounted = true;
    prefersReducedMotion().then((reduced) => { if (mounted) active.current = !reduced; }).catch(() => {});
    return () => { mounted = false; scale.stopAnimation(); };
  }, [scale]);

  const bounceTo = (target) => {
    if (!active.current) return;
    scale.stopAnimation();
    Animated.timing(scale, { toValue: target, duration: target === 1 ? 110 : 80, useNativeDriver: true }).start();
  };

  return (
    <AnimatedPressable
      {...props}
      style={[themedStyle, { transform: [{ scale }] }]}
      onPressIn={(event) => { bounceTo(0.972); onPressIn?.(event); }}
      onPressOut={(event) => { bounceTo(1); onPressOut?.(event); }}
    >
      {children}
    </AnimatedPressable>
  );
}

export function SoftPulse({ children, style }) {
  const themedStyle = useThemeStyle(style);
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let current = true;
    let animation;
    prefersReducedMotion().then((reduced) => {
      if (!current || reduced) return;
      animation = Animated.loop(Animated.sequence([
        Animated.timing(scale, { toValue: 1.035, duration: 1250, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 1250, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]));
      animation.start();
    }).catch(() => {});
    return () => { current = false; animation?.stop(); };
  }, [scale]);
  return <Animated.View style={[themedStyle, { transform: [{ scale }] }]}>{children}</Animated.View>;
}
