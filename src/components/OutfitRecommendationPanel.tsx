import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import type { ModuleDefinition } from "../constants/modules";
import {
  OUTFIT_AFTER_VOICE_MS,
  OUTFIT_CAMERA_POLL_MS,
  OUTFIT_CAMERA_WAIT_MAX_MS,
  OUTFIT_VOICE_LISTEN_TIMEOUT_MS,
} from "../constants/outfitRecommendation";
import { COLORS, SPACING } from "../constants/theme";
import type { LanguageCode } from "../services/i18n";
import { postOutfitAnalyze } from "../services/outfitRecommendationApi";
import { stopListening } from "../services/speechRecognition";
import { VOICE_POST_TTS_LISTEN_MS, waitForVoiceKeyword } from "../services/voiceKeyword";
import { voiceManager } from "../services/voiceManager";
import { useUserStore } from "../state/userStore";
import type { OutfitAnalyzeResponse } from "../types/outfitRecommendation";

import type { CameraBackgroundHandle } from "./CameraBackground";

function speechLocale(lang: LanguageCode | null): LanguageCode {
  return lang ?? "fr-FR";
}

const INSTRUCTION: Record<LanguageCode, string> = {
  "fr-FR":
    "Pour prendre une photo de votre tenue, dites : commencer.",
  "en-US": "To take a photo of your outfit, say: start.",
  "ar-SA": "لالتقاط صورة ملابسكم، قولوا: ابدأ.",
};

const REPROMPT: Record<LanguageCode, string> = {
  "fr-FR":
    "Je n'ai pas entendu. Dites « commencer » ou « start » quand vous voulez prendre la photo.",
  "en-US": "I didn't hear you. Say « start » or « commencer » when you want to take the photo.",
  "ar-SA": "لم أسمع. قولوا ابدأ أو start عندما تريدون التقاط الصورة.",
};

const STATUS_LISTENING: Record<LanguageCode, string> = {
  "fr-FR": "Écoute… dites « commencer » ou « start ».",
  "en-US": "Listening… say « start » or « commencer ».",
  "ar-SA": "استماع… قولوا ابدأ أو start.",
};

const STATUS_AFTER_KEYWORD: Record<LanguageCode, string> = {
  "fr-FR": "Photo dans 3 secondes…",
  "en-US": "Photo in 3 seconds…",
  "ar-SA": "الصورة خلال 3 ثوانٍ…",
};

type OutfitRecommendationPanelProps = {
  cameraRef: React.RefObject<CameraBackgroundHandle | null>;
  cameraSessionReadyRef: React.MutableRefObject<boolean>;
  module: ModuleDefinition;
  shortResponses: boolean;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function transcriptSignalsReady(raw: string): boolean {
  const ascii = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (/\bstart\b/.test(ascii)) return true;
  if (/\bgo\b/.test(ascii)) return true;
  if (/\bcommencer\b/.test(ascii)) return true;
  if (raw.includes("ابدأ")) return true;
  return false;
}

async function waitForCameraRef(
  cameraRef: React.RefObject<CameraBackgroundHandle | null>,
  sessionReadyRef: React.MutableRefObject<boolean>,
  isCancelled: () => boolean,
): Promise<CameraBackgroundHandle | null> {
  const start = Date.now();
  while (!isCancelled()) {
    const cam = cameraRef.current;
    const sessionOk = sessionReadyRef.current;
    if (cam && sessionOk) return cam;
    if (Date.now() - start > OUTFIT_CAMERA_WAIT_MAX_MS) {
      throw new Error(
        "La caméra met trop de temps à répondre. Réessayez ou rouvrez l’écran.",
      );
    }
    await wait(OUTFIT_CAMERA_POLL_MS);
  }
  return null;
}

export function OutfitRecommendationPanel({
  cameraRef,
  cameraSessionReadyRef,
  module,
  shortResponses,
}: OutfitRecommendationPanelProps) {
  const language = useUserStore((s) => s.profile.language);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [result, setResult] = useState<OutfitAnalyzeResponse | null>(null);
  const [statusDetail, setStatusDetail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;

    const run = async () => {
      setLoading(true);
      setErrorText(null);
      setResult(null);
      setStatusDetail("Connexion à la caméra…");

      try {
        const cam = await waitForCameraRef(cameraRef, cameraSessionReadyRef, isCancelled);
        if (cancelled || !cam) return;

        const lang = speechLocale(language);
        setStatusDetail(INSTRUCTION[lang]);
        await voiceManager.speak(INSTRUCTION[lang], true, lang);
        if (cancelled) return;
        await wait(VOICE_POST_TTS_LISTEN_MS);
        if (cancelled) return;

        const heard = await waitForVoiceKeyword({
          lang,
          isCancelled,
          setStatusDetail,
          matches: transcriptSignalsReady,
          listeningHint: STATUS_LISTENING[lang],
          repromptMessage: REPROMPT[lang],
          timeoutMs: OUTFIT_VOICE_LISTEN_TIMEOUT_MS,
        });
        if (cancelled || !heard) return;

        setStatusDetail(STATUS_AFTER_KEYWORD[lang]);
        await wait(OUTFIT_AFTER_VOICE_MS);
        if (cancelled) return;

        setStatusDetail(
          lang === "fr-FR"
            ? "Prise de la photo…"
            : lang === "ar-SA"
              ? "جاري التقاط الصورة…"
              : "Taking the photo…",
        );
        const liveCam = cameraRef.current ?? cam;
        const photo = await liveCam.takePictureAsync({
          quality: 0.35,
          skipProcessing: true,
        });
        if (!photo?.uri) {
          throw new Error("Impossible d’enregistrer la photo.");
        }

        if (cancelled) return;

        setStatusDetail(
          lang === "fr-FR"
            ? "Envoi de l’image et analyse de la tenue…"
            : lang === "ar-SA"
              ? "إرسال الصورة وتحليل الزي…"
              : "Sending image and analyzing outfit…",
        );
        const data = await postOutfitAnalyze(photo.uri);
        if (cancelled) return;

        setResult(data);

        const toSpeak = (data.recommendation ?? "").trim();
        if (toSpeak) {
          await voiceManager.speak(toSpeak, true, lang);
        }
      } catch (e) {
        if (!cancelled) {
          setErrorText((e as Error)?.message ?? "Échec de la requête.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setStatusDetail(null);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
      void stopListening();
    };
  }, [cameraRef, cameraSessionReadyRef, language]);

  const lang = speechLocale(language);

  const recommendationDisplay =
    result?.recommendation && shortResponses && result.recommendation.length > 220
      ? `${result.recommendation.slice(0, 220)}…`
      : result?.recommendation;

  const loadingTitle =
    lang === "fr-FR"
      ? "Analyse de la tenue…"
      : lang === "ar-SA"
        ? "تحليل الزي…"
        : "Analyzing outfit…";

  return (
    <View style={styles.card} accessible accessibilityLabel={`${module.title} module`}>
      <Text style={styles.title}>{module.title}</Text>
      <Text style={styles.subtitle}>{module.subtitle}</Text>

      {loading ? (
        <View style={styles.loadingBlock}>
          <View style={styles.loadingRow}>
            <ActivityIndicator color={COLORS.backgroundLight} />
            <Text style={styles.loadingText}>{loadingTitle}</Text>
          </View>
          {statusDetail ? <Text style={styles.statusDetail}>{statusDetail}</Text> : null}
        </View>
      ) : null}

      {errorText ? <Text style={styles.error}>{errorText}</Text> : null}

      {!loading && result && !errorText ? (
        <View style={styles.resultBlock}>
          <Text style={styles.sectionHeading}>Recommendation</Text>
          <Text style={styles.body}>{recommendationDisplay}</Text>
          <Text style={styles.scoreLabel}>
            Outfit score: <Text style={styles.scoreValue}>{String(result.outfit_score)}</Text>
          </Text>
          <Text style={styles.sectionHeading}>Overall style</Text>
          <Text style={styles.body}>{result.overall_style}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    backgroundColor: "rgba(9,38,61,0.74)",
    borderWidth: 1,
    borderColor: "rgba(246,244,235,0.3)",
    padding: SPACING.lg,
    gap: SPACING.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  title: {
    color: COLORS.backgroundLight,
    fontSize: 30,
    fontWeight: "800",
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 20,
    fontWeight: "600",
  },
  loadingBlock: {
    marginTop: SPACING.sm,
    gap: SPACING.xs,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  loadingText: {
    color: COLORS.backgroundLight,
    fontSize: 20,
    fontWeight: "600",
  },
  statusDetail: {
    color: COLORS.textMuted,
    fontSize: 18,
    fontWeight: "600",
    marginLeft: 40,
  },
  error: {
    color: "#FFAB91",
    fontSize: 18,
    fontWeight: "600",
    marginTop: SPACING.xs,
  },
  resultBlock: {
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  scoreLabel: {
    color: COLORS.backgroundLight,
    fontSize: 20,
    fontWeight: "700",
  },
  scoreValue: {
    color: COLORS.white,
    fontSize: 22,
    fontWeight: "800",
  },
  sectionHeading: {
    color: COLORS.textMuted,
    fontSize: 18,
    fontWeight: "700",
    marginTop: SPACING.xs,
  },
  body: {
    color: COLORS.white,
    fontSize: 21,
    lineHeight: 30,
    fontWeight: "500",
  },
});
