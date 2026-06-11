import React, { useEffect, useMemo, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { CameraBackground, type CameraBackgroundHandle } from "../../src/components/CameraBackground";
import { DangerDetectionPanel } from "../../src/components/DangerDetectionPanel";
import { EmotionDetectionPanel } from "../../src/components/EmotionDetectionPanel";
import { FamilyRecognitionPanel } from "../../src/components/FamilyRecognitionPanel";
import { ModuleCard } from "../../src/components/ModuleCard";
import { OutfitRecommendationPanel } from "../../src/components/OutfitRecommendationPanel";
import { StreetSafetyPanel } from "../../src/components/StreetSafetyPanel";
import { TextReaderPanel } from "../../src/components/TextReaderPanel";
import { MODULES, getModuleById } from "../../src/constants/modules";
import { moduleHasVoiceFlow } from "../../src/constants/voiceModules";
import { COLORS, SPACING } from "../../src/constants/theme";
import { hapticsManager } from "../../src/services/hapticsManager";
import { stopListening } from "../../src/services/speechRecognition";
import { voiceManager } from "../../src/services/voiceManager";
import { useAssistant } from "../../src/state/AssistantContext";

export default function ModuleScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const cameraRef = useRef<CameraBackgroundHandle>(null);
  const cameraSessionReadyRef = useRef(false);
  const {
    activeModuleIndex,
    setActiveModuleByIndex,
    shortResponses,
    goNextModule,
    goPreviousModule,
  } = useAssistant();

  const selected = useMemo(() => getModuleById(String(id)), [id]);

  useEffect(() => {
    if (!selected) {
      setActiveModuleByIndex(0);
      router.replace(`/modules/${MODULES[0].id}`);
      return;
    }
    const index = MODULES.findIndex((item) => item.id === selected.id);
    if (index !== -1 && index !== activeModuleIndex) {
      setActiveModuleByIndex(index);
    }
    if (!moduleHasVoiceFlow(selected.id)) {
      void voiceManager.speak(`${selected.title} activated.`);
    }

    return () => {
      voiceManager.stop();
      void stopListening();
    };
  }, [selected?.id]);

  if (!selected) {
    return <View style={styles.container} />;
  }

  const next = () => {
    const index = goNextModule();
    hapticsManager.medium();
    router.replace(`/modules/${MODULES[index].id}`);
  };

  const previous = () => {
    const index = goPreviousModule();
    hapticsManager.medium();
    router.replace(`/modules/${MODULES[index].id}`);
  };

  const goHome = () => {
    hapticsManager.light();
    voiceManager.speak("Returning to onboarding.");
    router.replace("/");
  };

  return (
    <SafeAreaView style={styles.container}>
      <CameraBackground ref={cameraRef} sessionReadyRef={cameraSessionReadyRef} />
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(200)}>
          <Text style={styles.sectionLabel}>Active module</Text>
          {selected.id === "street-safety" ? (
            <StreetSafetyPanel
              cameraRef={cameraRef}
              module={selected}
              shortResponses={shortResponses}
            />
          ) : selected.id === "danger-detection" ? (
            <DangerDetectionPanel
              cameraRef={cameraRef}
              cameraSessionReadyRef={cameraSessionReadyRef}
              module={selected}
              shortResponses={shortResponses}
            />
          ) : selected.id === "emotion-detection" ? (
            <EmotionDetectionPanel
              cameraRef={cameraRef}
              cameraSessionReadyRef={cameraSessionReadyRef}
              module={selected}
              shortResponses={shortResponses}
            />
          ) : selected.id === "outfit-recommandation" ? (
            <OutfitRecommendationPanel
              cameraRef={cameraRef}
              cameraSessionReadyRef={cameraSessionReadyRef}
              module={selected}
              shortResponses={shortResponses}
            />
          ) : selected.id === "family-recognition" ? (
            <FamilyRecognitionPanel
              cameraRef={cameraRef}
              cameraSessionReadyRef={cameraSessionReadyRef}
              module={selected}
              shortResponses={shortResponses}
            />
          ) : selected.id === "text-reader" ? (
            <TextReaderPanel
              cameraRef={cameraRef}
              cameraSessionReadyRef={cameraSessionReadyRef}
              module={selected}
              shortResponses={shortResponses}
            />
          ) : (
            <ModuleCard module={selected} shortResponses={shortResponses} />
          )}
        </Animated.View>

        <View style={styles.controlsRow}>
          <Pressable style={styles.navButton} onPress={previous} accessibilityRole="button">
            <Text style={styles.navText}>Previous</Text>
          </Pressable>
          <Pressable style={styles.navButton} onPress={next} accessibilityRole="button">
            <Text style={styles.navText}>Next</Text>
          </Pressable>
        </View>

        <Pressable style={styles.homeButton} onPress={goHome} accessibilityRole="button">
          <Text style={styles.homeText}>Back to onboarding</Text>
        </Pressable>

        <Text style={styles.instructions}>
          Double tap to repeat. Long press to talk. Swipe down for short responses.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primaryDark,
  },
  content: {
    paddingTop: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
    gap: SPACING.lg,
  },
  sectionLabel: {
    color: COLORS.backgroundLight,
    fontSize: 22,
    marginBottom: SPACING.sm,
    fontWeight: "700",
  },
  controlsRow: {
    flexDirection: "row",
    gap: SPACING.md,
  },
  navButton: {
    flex: 1,
    minHeight: 68,
    borderRadius: 24,
    backgroundColor: COLORS.secondaryBlue,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(246,244,235,0.4)",
  },
  navText: {
    color: COLORS.backgroundLight,
    fontSize: 22,
    fontWeight: "800",
  },
  homeButton: {
    minHeight: 68,
    borderRadius: 24,
    backgroundColor: COLORS.primaryPurple,
    justifyContent: "center",
    alignItems: "center",
  },
  homeText: {
    color: COLORS.white,
    fontSize: 22,
    fontWeight: "800",
  },
  instructions: {
    color: COLORS.textMuted,
    textAlign: "center",
    fontSize: 19,
    lineHeight: 28,
    fontWeight: "600",
  },
});
