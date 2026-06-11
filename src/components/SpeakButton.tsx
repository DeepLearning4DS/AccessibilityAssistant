import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { COLORS } from "../constants/theme";
import { defaultHitSlop } from "../utils/accessibility";

type SpeakButtonProps = {
  onPressIn: () => void;
  onPressOut: () => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function SpeakButton({ onPressIn, onPressOut }: SpeakButtonProps) {
  const glow = useSharedValue(0.6);

  useEffect(() => {
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.6, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [glow]);

  const animatedStyle = useAnimatedStyle(() => ({
    shadowOpacity: glow.value,
    transform: [{ scale: 0.98 + glow.value * 0.02 }],
  }));

  return (
    <AnimatedPressable
      accessible
      accessibilityRole="button"
      accessibilityLabel="Hold to speak"
      accessibilityHint="Long press to activate assistant listening mode"
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      hitSlop={defaultHitSlop}
      style={[styles.button, animatedStyle]}
    >
      <Text style={styles.text}>Hold to speak</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 76,
    width: "100%",
    borderRadius: 999,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.secondaryPink,
    shadowColor: COLORS.backgroundLight,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 2,
    borderColor: "rgba(246,244,235,0.4)",
  },
  text: {
    color: COLORS.white,
    fontSize: 24,
    fontWeight: "800",
  },
});
