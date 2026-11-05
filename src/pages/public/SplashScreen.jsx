import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

export default function SplashScreen({ onFinish }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const to = (v, d) => Animated.timing(opacity, { toValue: v, duration: d, useNativeDriver: true });
    Animated.sequence([to(1, 250), to(0.15, 120), to(1, 150), to(0.3, 120), to(1, 200), Animated.delay(700), to(0, 300)])
      .start(() => onFinish && onFinish());
  }, []);

  return (
    <View style={styles.container}>
      <Animated.Image source={require("../../assets/logo.png")} style={[styles.logo, { opacity }]} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  logo: { width: 180, height: 180 },
});