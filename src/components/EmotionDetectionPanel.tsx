import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import type { ModuleDefinition } from "../constants/modules";
import {
  EMOTION_CAMERA_POLL_MS,
  EMOTION_CAMERA_WAIT_MAX_MS,
  EMOTION_DETECT_POLL_MS,
  EMOTION_VOICE_LISTEN_TIMEOUT_MS,
} from "../constants/emotionDetection";
import { COLORS, SPACING } from "../constants/theme";
import { postEmotionDetect } from "../services/emotionDetectionApi";
import type { LanguageCode } from "../services/i18n";
import { stopListening } from "../services/speechRecognition";
import { VOICE_POST_TTS_LISTEN_MS, waitForVoiceKeyword } from "../services/voiceKeyword";
import { voiceManager } from "../services/voiceManager";
import { useUserStore } from "../state/userStore";
import type { EmotionDetectResponse, EmotionFace } from "../types/emotionDetection";

import type { CameraBackgroundHandle } from "./CameraBackground";

function speechLocale(lang: LanguageCode | null): LanguageCode {
  return lang ?? "fr-FR";
}

const INSTRUCTION: Record<LanguageCode, string> = {
  "fr-FR":
    "Pour lancer la détection des émotions, dites : commencer.",
  "en-US": "To start emotion detection, say: start.",
  "ar-SA": "لبدء كشف المشاعر، قولوا: ابدأ.",
};

const REPROMPT: Record<LanguageCode, string> = {
  "fr-FR":
    "Je n'ai pas entendu. Dites « commencer » ou « start » pour lancer la détection.",
  "en-US": "I didn't hear you. Say « start » or « commencer » to begin.",
  "ar-SA": "لم أسمع. قولوا ابدأ أو start للبدء.",
};

const STATUS_LISTENING: Record<LanguageCode, string> = {
  "fr-FR": "Écoute… dites « commencer » ou « start ».",
  "en-US": "Listening… say « start » or « commencer ».",
  "ar-SA": "استماع… قولوا ابدأ أو start.",
};

const STATUS_LIVE: Record<LanguageCode, string> = {
  "fr-FR": "Une image est analysée toutes les 5 secondes.",
  "en-US": "One frame is analyzed every 5 seconds.",
  "ar-SA": "تحليل صورة كل 5 ثوانٍ.",
};

const HINT_FOOTER: Record<LanguageCode, string> = {
  "fr-FR": "Quittez l’écran pour arrêter la détection.",
  "en-US": "Leave this screen to stop detection.",
  "ar-SA": "غادروا الشاشة لإيقاف الكشف.",
};

/** Libellés TTS pour quelques émotions courantes ; sinon l’API renvoie le mot tel quel. */
const EMOTION_SPEAK: Record<string, Partial<Record<LanguageCode, string>>> = {
  happy: { "fr-FR": "heureux", "en-US": "happy", "ar-SA": "سعيد" },
  sad: { "fr-FR": "triste", "en-US": "sad", "ar-SA": "حزين" },
  angry: { "fr-FR": "en colère", "en-US": "angry", "ar-SA": "غاضب" },
  neutral: { "fr-FR": "neutre", "en-US": "neutral", "ar-SA": "محايد" },
  surprised: { "fr-FR": "surpris", "en-US": "surprised", "ar-SA": "متفاجئ" },
  surprise: { "fr-FR": "surpris", "en-US": "surprised", "ar-SA": "متفاجئ" },
  fear: { "fr-FR": "peur", "en-US": "fear", "ar-SA": "خائف" },
  disgust: { "fr-FR": "dégoût", "en-US": "disgust", "ar-SA": "اشمئزاز" },
  contempt: { "fr-FR": "mépris", "en-US": "contempt", "ar-SA": "ازدراء" },
};

type EmotionDetectionPanelProps = {
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

function normalizeBase64(raw: string | undefined): string {
  if (!raw) return "";
  const t = raw.trim();
  if (t.startsWith("data:")) {
    const i = t.indexOf(",");
    return i >= 0 ? t.slice(i + 1) : t;
  }
  return t;
}

function pickBestFace(faces: EmotionFace[]): EmotionFace | null {
  if (!faces.length) return null;
  return faces.reduce((a, b) => (b.confidence > a.confidence ? b : a));
}

function emotionSpeakLabel(emotion: string, lang: LanguageCode): string {
  const k = emotion.toLowerCase().trim();
  return EMOTION_SPEAK[k]?.[lang] ?? emotion;
}

function formatConfidence(c: number | undefined): string {
  if (c === undefined || Number.isNaN(c)) return "—";
  if (c >= 0 && c <= 1) return `${Math.round(c * 100)}%`;
  return `${Math.round(c)}%`;
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
    if (Date.now() - start > EMOTION_CAMERA_WAIT_MAX_MS) {
      throw new Error(
        "La caméra met trop de temps à répondre. Réessayez ou rouvrez l’écran.",
      );
    }
    await wait(EMOTION_CAMERA_POLL_MS);
  }
  return null;
}

export function EmotionDetectionPanel({
  cameraRef,
  cameraSessionReadyRef,
  module,
  shortResponses,
}: EmotionDetectionPanelProps) {
  const language = useUserStore((s) => s.profile.language);
  const [lastPayload, setLastPayload] = useState<EmotionDetectResponse | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [awaitingVoice, setAwaitingVoice] = useState(true);
  const [liveActive, setLiveActive] = useState(false);
  const [noFace, setNoFace] = useState(false);

  const previousEmotionRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const livePollingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    livePollingRef.current = false;
    setAwaitingVoice(true);
    setLiveActive(false);
    setLastPayload(null);
    setErrorText(null);
    setStatusDetail(null);
    setNoFace(false);
    previousEmotionRef.current = null;

    let cancelled = false;
    const isCancelled = () => cancelled;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      const cam = cameraRef.current;
      if (!cam || inFlightRef.current) return;
      inFlightRef.current = true;
      setBusy(true);
      setStatusDetail("Detecting emotion...");
      try {
        const photo = await cam.takePictureAsync({
          quality: 0.35,
          skipProcessing: true,
          base64: true,
        });
        if (!mountedRef.current) return;

        const b64 = normalizeBase64(photo?.base64);
        if (!b64) {
          throw new Error("Impossible d’encoder l’image en base64.");
        }

        const data = await postEmotionDetect(b64);
        if (!mountedRef.current) return;

        setLastPayload(data);
        setErrorText(null);

        const faces = data.faces ?? [];
        if (faces.length === 0) {
          setNoFace(true);
        } else {
          setNoFace(false);
          const best = pickBestFace(faces);
          const emotionKey = (best?.emotion ?? "").toLowerCase().trim();
          const lang = speechLocale(language);
          if (best && emotionKey && previousEmotionRef.current !== emotionKey) {
            const toSpeak = emotionSpeakLabel(best.emotion, lang);
            await voiceManager.speak(toSpeak, true, lang);
            previousEmotionRef.current = emotionKey;
          }
        }
      } catch (e) {
        if (mountedRef.current) {
          setErrorText((e as Error)?.message ?? "Detection failed");
        }
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current) {
          setBusy(false);
          if (livePollingRef.current) setStatusDetail(null);
        }
      }
    };

    const run = async () => {
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
          timeoutMs: EMOTION_VOICE_LISTEN_TIMEOUT_MS,
        });
        if (cancelled || !heard) return;

        setAwaitingVoice(false);
        setLiveActive(true);
        livePollingRef.current = true;
        setStatusDetail(STATUS_LIVE[lang]);
        await wait(400);
        if (cancelled) return;

        void tick();
        intervalId = setInterval(() => {
          void tick();
        }, EMOTION_DETECT_POLL_MS);
      } catch (e) {
        if (!cancelled && mountedRef.current) {
          setErrorText((e as Error)?.message ?? "Detection failed");
          setAwaitingVoice(false);
          setStatusDetail(null);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      livePollingRef.current = false;
      void stopListening();
      if (intervalId !== null) clearInterval(intervalId);
    };
  }, [cameraRef, cameraSessionReadyRef, language]);

  const faces = lastPayload?.faces ?? [];
  const best = pickBestFace(faces);
  const faceCount = faces.length;

  let emotionDisplay = best?.emotion ?? "";
  if (shortResponses && emotionDisplay.length > 40) {
    emotionDisplay = `${emotionDisplay.slice(0, 40)}…`;
  }

  const showSpinner = awaitingVoice || busy;
  const langUi = speechLocale(language);

  return (
    <View style={styles.wrap} accessibilityLabel="Emotion detection live analysis">
      <Text style={styles.title}>{module.title}</Text>
      <Text style={styles.subtitle}>{module.subtitle}</Text>

      <View style={styles.row}>
        <Text style={styles.kLabel}>Emotion</Text>
        {showSpinner ? (
          <ActivityIndicator color={COLORS.backgroundLight} style={styles.spinner} />
        ) : null}
      </View>

      {((awaitingVoice || busy) && !errorText) || statusDetail ? (
        <View style={styles.statusBlock}>
          {statusDetail ? <Text style={styles.statusDetail}>{statusDetail}</Text> : null}
          {busy && !statusDetail ? (
            <Text style={styles.loadingLine}>Detecting emotion...</Text>
          ) : null}
        </View>
      ) : null}

      {liveActive && !busy && !errorText && lastPayload ? (
        <Text style={styles.metaMuted}>
          {STATUS_LIVE[langUi]}
        </Text>
      ) : null}

      {lastPayload && !errorText ? (
        <View style={styles.resultBlock}>
          {noFace || faceCount === 0 ? (
            <Text style={styles.noFace}>No face detected</Text>
          ) : (
            <>
              <Text style={styles.kLabel}>Detected emotion</Text>
              <Text style={styles.emotionValue}>{emotionDisplay || "—"}</Text>
              <Text style={styles.kLabel}>Confidence</Text>
              <Text style={styles.confidenceValue}>{formatConfidence(best?.confidence)}</Text>
            </>
          )}
          <Text style={styles.countLine}>
            Faces detected:{" "}
            <Text style={styles.countValue}>{String(faceCount)}</Text>
          </Text>
        </View>
      ) : null}

      {errorText ? <Text style={styles.error}>{errorText}</Text> : null}

      <Text style={styles.hint}>{HINT_FOOTER[langUi]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 28,
    backgroundColor: "rgba(9,38,61,0.74)",
    borderWidth: 1,
    borderColor: "rgba(246,244,235,0.3)",
    padding: SPACING.lg,
    gap: SPACING.sm,
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: SPACING.sm,
  },
  kLabel: {
    color: COLORS.textMuted,
    fontSize: 17,
    fontWeight: "700",
  },
  spinner: {
    marginLeft: SPACING.md,
  },
  statusBlock: {
    gap: SPACING.xs,
  },
  statusDetail: {
    color: COLORS.textMuted,
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 26,
  },
  loadingLine: {
    color: COLORS.backgroundLight,
    fontSize: 18,
    fontWeight: "600",
  },
  metaMuted: {
    color: COLORS.textMuted,
    fontSize: 16,
    fontWeight: "500",
  },
  resultBlock: {
    marginTop: SPACING.xs,
    gap: SPACING.xs,
  },
  emotionValue: {
    color: COLORS.white,
    fontSize: 26,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  confidenceValue: {
    color: COLORS.backgroundLight,
    fontSize: 22,
    fontWeight: "700",
  },
  countLine: {
    color: COLORS.backgroundLight,
    fontSize: 19,
    fontWeight: "600",
    marginTop: SPACING.sm,
  },
  countValue: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: "800",
  },
  noFace: {
    color: COLORS.textMuted,
    fontSize: 20,
    fontWeight: "600",
    fontStyle: "italic",
  },
  error: {
    color: "#FFAB91",
    fontSize: 17,
    fontWeight: "600",
  },
  hint: {
    color: COLORS.textMuted,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "500",
  },
});
