import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { AnimatedMicrophone } from "../components/AnimatedMicrophone";
import { CameraBackground } from "../components/CameraBackground";
import { COLORS, SPACING } from "../constants/theme";
import { hapticsManager } from "../services/hapticsManager";
import {
  cleanNameFromTranscript,
  detectLanguageFromTranscript,
  isSkipPhrase,
  parseAge,
  t,
  type LanguageCode,
} from "../services/i18n";
import { listenOnce, stopListening } from "../services/speechRecognition";
import { voiceManager } from "../services/voiceManager";
import { useUserStore } from "../state/userStore";

type OnboardingStep =
  | "greeting"
  | "language"
  | "first-name"
  | "last-name"
  | "age"
  | "confirmation"
  | "demo"
  | "complete";

type OnboardingFlowProps = {
  onComplete: () => void;
};

const MAX_RETRIES = 2;

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const { setProfile, completeOnboarding } = useUserStore.getState();

  const [step, setStep] = useState<OnboardingStep>("greeting");
  const [statusText, setStatusText] = useState("");
  const [isListening, setIsListening] = useState(false);

  const skipRef = useRef(false);
  const cancelledRef = useRef(false);
  const flowStartedRef = useRef(false);

  useEffect(() => {
    if (flowStartedRef.current) return;
    flowStartedRef.current = true;
    cancelledRef.current = false;
    skipRef.current = false;
    void runFlow();
    return () => {
      cancelledRef.current = true;
      void stopListening();
      voiceManager.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerSkip = () => {
    if (skipRef.current) return;
    skipRef.current = true;
    hapticsManager.success();
    void stopListening();
    voiceManager.stop();
  };

  const swipeUpGesture = useMemo(() => {
    return Gesture.Pan().onEnd((event) => {
      if (Math.abs(event.translationY) > Math.abs(event.translationX) && event.translationY < -70) {
        runOnJS(triggerSkip)();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const speak = async (text: string, lang: LanguageCode) => {
    if (cancelledRef.current) return;
    setStatusText(text);
    setIsListening(false);
    await voiceManager.speak(text, true, lang);
  };

  const listen = async (
    lang: LanguageCode,
    timeoutMs = 8000,
  ): Promise<string> => {
    if (cancelledRef.current) return "";
    hapticsManager.light();
    setIsListening(true);
    setStatusText(`${t(lang).askLanguage ? "" : ""}...`);
    const result = await listenOnce({ language: lang, timeoutMs });
    setIsListening(false);
    if (cancelledRef.current) return "";
    if (!result.ok) return "";
    return result.transcript ?? "";
  };

  const askLanguageStep = async (): Promise<LanguageCode> => {
    let attempt = 0;
    let lang: LanguageCode = "en-US";
    while (!cancelledRef.current) {
      const phrases = t(lang);
      const prompt = attempt === 0 ? phrases.askLanguage : phrases.unrecognizedLanguage;
      await speak(prompt, lang);
      const transcript = await listen(lang, 9000);
      const detected = detectLanguageFromTranscript(transcript);
      if (detected) {
        return detected;
      }
      attempt += 1;
      if (attempt >= MAX_RETRIES + 1) {
        return lang;
      }
    }
    return lang;
  };

  const askNameStep = async (
    lang: LanguageCode,
    kind: "first" | "last",
  ): Promise<string> => {
    const phrases = t(lang);
    let attempt = 0;
    while (!cancelledRef.current) {
      const prompt =
        attempt === 0
          ? kind === "first"
            ? phrases.askFirstName
            : phrases.askLastName
          : phrases.unrecognizedAnswer;
      await speak(prompt, lang);
      const transcript = await listen(lang, 8000);
      const cleaned = cleanNameFromTranscript(transcript);
      if (cleaned.length >= 2) {
        return cleaned;
      }
      attempt += 1;
      if (attempt >= MAX_RETRIES + 1) {
        return cleaned || (kind === "first" ? "Friend" : "Guest");
      }
    }
    return "";
  };

  const askAgeStep = async (lang: LanguageCode): Promise<number> => {
    const phrases = t(lang);
    let attempt = 0;
    while (!cancelledRef.current) {
      const prompt = attempt === 0 ? phrases.askAge : phrases.unrecognizedAge;
      await speak(prompt, lang);
      const transcript = await listen(lang, 8000);
      const age = parseAge(transcript, lang);
      if (age) return age;
      attempt += 1;
      if (attempt >= MAX_RETRIES + 1) {
        return 0;
      }
    }
    return 0;
  };

  const speakDemoStepWithSkipCheck = async (
    text: string,
    lang: LanguageCode,
  ): Promise<boolean> => {
    if (skipRef.current || cancelledRef.current) return true;
    await speak(text, lang);
    if (skipRef.current || cancelledRef.current) return true;

    await new Promise<void>((r) => setTimeout(r, 450));
    if (skipRef.current || cancelledRef.current) return true;

    setIsListening(true);
    setStatusText(text);
    const result = await listenOnce({
      language: lang,
      timeoutMs: 8000,
      interimResults: true,
      shouldAbort: (tr) => isSkipPhrase(tr, lang),
    });
    setIsListening(false);
    if (result.ok && isSkipPhrase(result.transcript, lang)) {
      skipRef.current = true;
      return true;
    }
    return false;
  };

  const runDemoStep = async (lang: LanguageCode) => {
    const phrases = t(lang);
    if (!cancelledRef.current) {
      await speak(phrases.demoSkipHint, lang);
    }
    const sequence = [
      phrases.demoIntro,
      phrases.demoStep1,
      phrases.demoStep2,
      phrases.demoStep3,
      phrases.demoStep4,
      phrases.featuresIntro,
      phrases.featureObstacle,
      phrases.featureTextReader,
      phrases.featureMedical,
      phrases.featureFamily,
      phrases.featureStreet,
      phrases.featureOutfit,
      phrases.featureEmotion,
    ];

    for (const line of sequence) {
      if (cancelledRef.current) return;
      const skipped = await speakDemoStepWithSkipCheck(line, lang);
      if (skipped) {
        await speak(phrases.demoSkipped, lang);
        return;
      }
    }
    await speak(phrases.onboardingComplete, lang);
  };

  const runFlow = async () => {
    try {
      // STEP 1 — GREETING (in default English)
      setStep("greeting");
      hapticsManager.medium();
      await speak(t("en-US").greeting, "en-US");
      if (cancelledRef.current) return;

      // STEP 2 — LANGUAGE
      setStep("language");
      const detectedLanguage = await askLanguageStep();
      if (cancelledRef.current) return;
      voiceManager.setLanguage(detectedLanguage);
      useUserStore.getState().setLanguage(detectedLanguage);
      hapticsManager.medium();
      await speak(t(detectedLanguage).languageConfirmed, detectedLanguage);

      // STEP 3 — SIGN IN
      const phrases = t(detectedLanguage);
      await speak(phrases.startProfile, detectedLanguage);

      setStep("first-name");
      const firstName = await askNameStep(detectedLanguage, "first");
      if (cancelledRef.current) return;
      hapticsManager.light();
      await speak(phrases.confirmFirstName(firstName), detectedLanguage);

      setStep("last-name");
      const lastName = await askNameStep(detectedLanguage, "last");
      if (cancelledRef.current) return;
      hapticsManager.light();
      await speak(phrases.confirmLastName(lastName), detectedLanguage);

      setStep("age");
      const age = await askAgeStep(detectedLanguage);
      if (cancelledRef.current) return;
      hapticsManager.light();
      await speak(phrases.confirmAge(age), detectedLanguage);

      // STEP 4 — STORE
      setProfile({
        language: detectedLanguage,
        firstName,
        lastName,
        age,
      });

      // STEP 5 — SIGN IN CONFIRMATION
      setStep("confirmation");
      hapticsManager.success();
      await speak(phrases.signInSuccess(firstName), detectedLanguage);

      // STEP 6 — DEMO
      setStep("demo");
      await runDemoStep(detectedLanguage);

      // COMPLETE
      setStep("complete");
      completeOnboarding();
      hapticsManager.success();
      onComplete();
    } catch (error) {
      console.warn("Onboarding flow error", error);
      onComplete();
    }
  };

  const stepLabel = useMemo(() => {
    switch (step) {
      case "greeting":
        return "Greeting";
      case "language":
        return "Language";
      case "first-name":
        return "First name";
      case "last-name":
        return "Last name";
      case "age":
        return "Age";
      case "confirmation":
        return "Confirmation";
      case "demo":
        return "Demo";
      case "complete":
        return "Ready";
      default:
        return "";
    }
  }, [step]);

  return (
    <GestureDetector gesture={swipeUpGesture}>
      <SafeAreaView style={styles.container}>
        <CameraBackground />
        <View style={styles.content}>
          <View style={styles.headerBlock}>
            <Text style={styles.title}>Accessibility Assistant</Text>
            <Text style={styles.stepLabel}>{stepLabel}</Text>
          </View>

          <View style={styles.microphoneContainer}>
            <AnimatedMicrophone isListening={isListening} />
          </View>

          <View style={styles.bottomBlock}>
            <Text style={styles.statusText}>{statusText}</Text>
            <Text style={styles.hint}>
              {step === "demo"
                ? `Say "skip" or swipe up to skip the demo`
                : "Voice-first onboarding"}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primaryDark,
  },
  content: {
    flex: 1,
    paddingTop: SPACING.xxl + 12,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
    justifyContent: "space-between",
  },
  headerBlock: {
    alignItems: "center",
    gap: SPACING.xs,
  },
  title: {
    color: COLORS.backgroundLight,
    fontSize: 34,
    lineHeight: 42,
    fontWeight: "800",
    textAlign: "center",
  },
  stepLabel: {
    color: COLORS.textMuted,
    fontSize: 18,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.6,
  },
  microphoneContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  bottomBlock: {
    gap: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },
  statusText: {
    color: COLORS.backgroundLight,
    textAlign: "center",
    fontSize: 22,
    lineHeight: 30,
    fontWeight: "600",
    minHeight: 60,
  },
  hint: {
    color: COLORS.textMuted,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "500",
  },
});
