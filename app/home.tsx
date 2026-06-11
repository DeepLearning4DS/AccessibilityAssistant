import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { AnimatedMicrophone } from "../src/components/AnimatedMicrophone";
import { CameraBackground } from "../src/components/CameraBackground";
import { SpeakButton } from "../src/components/SpeakButton";
import { MODULES } from "../src/constants/modules";
import { COLORS, SPACING } from "../src/constants/theme";
import { hapticsManager } from "../src/services/hapticsManager";
import { voiceManager } from "../src/services/voiceManager";
import { useAssistant } from "../src/state/AssistantContext";
import { useUserStore } from "../src/state/userStore";

export default function HomeScreen() {
  const router = useRouter();
  const { activeModuleIndex, isListening, setListening, selectedLanguage } = useAssistant();
  const profile = useUserStore((state) => state.profile);
  const activeModule = MODULES[activeModuleIndex];

  const startListening = () => {
    hapticsManager.success();
    setListening(true);
    voiceManager.speak("Listening.", true, selectedLanguage ?? "en-US");
  };

  const stopListening = () => {
    setListening(false);
  };

  const openCurrentModule = () => {
    hapticsManager.medium();
    router.replace(`/modules/${activeModule.id}`);
  };

  const greeting = profile.firstName
    ? `Welcome ${profile.firstName}`
    : "Accessibility Assistant";

  return (
    <SafeAreaView style={styles.container}>
      <CameraBackground />

      <View style={styles.content}>
        <View>
          <Text style={styles.title}>{greeting}</Text>
          <Text style={styles.subtitle}>Voice-first guidance for calm navigation</Text>
        </View>

        <View style={styles.microphoneContainer}>
          <AnimatedMicrophone isListening={isListening} />
        </View>

        <Pressable
          style={styles.modulePill}
          onPress={openCurrentModule}
          accessibilityRole="button"
          accessibilityLabel={`Open ${activeModule.title}`}
          accessibilityHint="Opens the active module screen"
        >
          <Text style={styles.modulePillText}>{activeModule.title}</Text>
        </Pressable>

        <View style={styles.bottomContainer}>
          <SpeakButton onPressIn={startListening} onPressOut={stopListening} />
          <Text style={styles.hintText}>
            Swipe to change modules. Long press to talk.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primaryDark,
  },
  content: {
    flex: 1,
    justifyContent: "space-between",
    paddingTop: SPACING.xxl + 12,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  title: {
    color: COLORS.backgroundLight,
    fontSize: 38,
    lineHeight: 46,
    fontWeight: "800",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 10,
    color: COLORS.textMuted,
    fontSize: 21,
    textAlign: "center",
    fontWeight: "600",
  },
  microphoneContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  modulePill: {
    minHeight: 66,
    borderRadius: 999,
    paddingHorizontal: SPACING.lg,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(246,244,235,0.18)",
    borderWidth: 1,
    borderColor: "rgba(246,244,235,0.45)",
  },
  modulePillText: {
    color: COLORS.backgroundLight,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  bottomContainer: {
    gap: SPACING.md,
  },
  hintText: {
    color: COLORS.textMuted,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "500",
  },
});
