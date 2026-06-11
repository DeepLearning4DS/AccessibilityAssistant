import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Redirect, useRouter } from "expo-router";

import { OnboardingFlow } from "../src/onboarding/OnboardingFlow";
import { COLORS } from "../src/constants/theme";
import { useUserStore } from "../src/state/userStore";

export default function OnboardingScreen() {
  const router = useRouter();
  const isOnboarded = useUserStore((state) => state.isOnboarded);
  const hydrated = useUserStore((state) => state.hydrated);

  if (!hydrated) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.backgroundLight} size="large" />
      </View>
    );
  }

  if (isOnboarded) {
    return <Redirect href="/home" />;
  }

  return (
    <OnboardingFlow
      onComplete={() => {
        router.replace("/home");
      }}
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: COLORS.primaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
});
