import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { COLORS } from "../constants/theme";

type AnimatedMicrophoneProps = {
  isListening: boolean;
};

export function AnimatedMicrophone({ isListening }: AnimatedMicrophoneProps) {
  const pulse = useSharedValue(1);
  const wave = useSharedValue(0.45);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 1300, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [pulse]);

  useEffect(() => {
    wave.value = isListening
      ? withRepeat(withTiming(1, { duration: 900 }), -1, true)
      : withTiming(0.45, { duration: 500 });
  }, [isListening, wave]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const waveStyle = useAnimatedStyle(() => ({
    opacity: wave.value,
    transform: [{ scale: 1 + wave.value * 0.45 }],
  }));

  return (
    <View style={styles.wrapper}>
      <Animated.View style={[styles.wave, waveStyle]} />
      <Animated.View style={[styles.core, pulseStyle]}>
        <View style={styles.micStem} />
        <View style={styles.micBase} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: 170,
    height: 170,
    justifyContent: "center",
    alignItems: "center",
  },
  wave: {
    position: "absolute",
    width: 170,
    height: 170,
    borderRadius: 999,
    backgroundColor: "rgba(246,244,235,0.2)",
  },
  core: {
    width: 120,
    height: 120,
    borderRadius: 999,
    backgroundColor: COLORS.backgroundLight,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: COLORS.backgroundLight,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  micStem: {
    width: 26,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.primaryDark,
  },
  micBase: {
    marginTop: 10,
    width: 40,
    height: 8,
    borderRadius: 6,
    backgroundColor: COLORS.secondaryPink,
  },
});
