import { useCallback, useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

// Keep the existing SkillCredit logo visible while startup auth/profile checks run.
// The splash fades away only after the destination screen is ready.
export default function SplashScreen({ ready = false, onFinish }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const introDone = useRef(false);
  const leaving = useRef(false);
  const readyRef = useRef(ready);
  const onFinishRef = useRef(onFinish);

  readyRef.current = ready;
  onFinishRef.current = onFinish;

  const finishWhenReady = useCallback(() => {
    if (!introDone.current || !readyRef.current || leaving.current) return;
    leaving.current = true;
    Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true })
      .start(({ finished }) => {
        if (finished) onFinishRef.current?.();
      });
  }, [opacity]);

  useEffect(() => {
    // A brief minimum display keeps the native-to-app splash transition smooth.
    const intro = Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(250),
    ]);
    intro.start(({ finished }) => {
      if (!finished) return;
      introDone.current = true;
      finishWhenReady();
    });
    return () => {
      intro.stop();
      opacity.stopAnimation();
    };
  }, [finishWhenReady, opacity]);

  useEffect(() => {
    finishWhenReady();
  }, [ready, finishWhenReady]);

  return (
    <View style={styles.container}>
      <Animated.Image
        source={require('../../assets/logo.png')}
        style={[styles.logo, { opacity }]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  logo: { width: 180, height: 180 },
});
