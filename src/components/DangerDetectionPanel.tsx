import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import type { ModuleDefinition } from "../constants/modules";
import {
  DANGER_CAMERA_POLL_MS,
  DANGER_CAMERA_WAIT_MAX_MS,
  DANGER_DETECT_AFTER_VOICE_MS,
  DANGER_VOICE_LISTEN_TIMEOUT_MS,
} from "../constants/dangerDetection";
import { COLORS, SPACING } from "../constants/theme";
import { postDangerDetectFrame } from "../services/dangerDetectionApi";
import type { LanguageCode } from "../services/i18n";
import { stopListening } from "../services/speechRecognition";
import { VOICE_POST_TTS_LISTEN_MS, waitForVoiceKeyword } from "../services/voiceKeyword";
import { voiceManager } from "../services/voiceManager";
import { useUserStore } from "../state/userStore";
import type { DangerDetectResponse } from "../types/dangerDetection";

import type { CameraBackgroundHandle } from "./CameraBackground";

function speechLocale(lang: LanguageCode | null): LanguageCode {
  return lang ?? "fr-FR";
}

function normalizeLevelKey(raw: string): string {
  return String(raw ?? "").trim().toUpperCase();
}

function levelIndicatorColor(levelKey: string): string {
  if (levelKey === "LOW") return "#2E7D32";
  if (levelKey === "MEDIUM") return "#FBC02D";
  if (levelKey === "HIGH" || levelKey === "RED") return "#E53935";
  return "rgba(246,244,235,0.35)";
}

function isUrgentLevel(levelKey: string): boolean {
  return levelKey === "HIGH" || levelKey === "RED";
}

const INSTRUCTION: Record<LanguageCode, string> = {
  "fr-FR":
    "Pour lancer une détection de danger, dites : commencer.",
  "en-US": "To start danger detection, say: start.",
  "ar-SA": "لبدء كشف الخطر، قولوا: ابدأ.",
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

const STATUS_AFTER_KEYWORD: Record<LanguageCode, string> = {
  "fr-FR": "Capture dans 3 secondes…",
  "en-US": "Capture in 3 seconds…",
  "ar-SA": "التقاط الصورة خلال 3 ثوانٍ…",
};

const HINT_FOOTER: Record<LanguageCode, string> = {
  "fr-FR":
    "Après chaque analyse, dites de nouveau « commencer » ou « start » pour une nouvelle capture.",
  "en-US": "After each analysis, say « start » or « commencer » again for a new capture.",
  "ar-SA": "بعد كل تحليل، قولوا ابدأ أو start من جديد لالتقاط صورة جديدة.",
};

type DangerDetectionPanelProps = {
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
    if (Date.now() - start > DANGER_CAMERA_WAIT_MAX_MS) {
      throw new Error(
        "La caméra met trop de temps à répondre. Réessayez ou rouvrez l’écran.",
      );
    }
    await wait(DANGER_CAMERA_POLL_MS);
  }
  return null;
}

export function DangerDetectionPanel({
  cameraRef,
  cameraSessionReadyRef,
  module,
  shortResponses,
}: DangerDetectionPanelProps) {
  const language = useUserStore((s) => s.profile.language);
  const [lastPayload, setLastPayload] = useState<DangerDetectResponse | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [awaitingFirstResult, setAwaitingFirstResult] = useState(true);

  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setAwaitingFirstResult(true);
    setLastPayload(null);
    setStatusDetail(null);
    setErrorText(null);

    let cancelled = false;
    const isCancelled = () => cancelled;

    const captureOnce = async () => {
      const cam = cameraRef.current;
      if (!cam || inFlightRef.current) return;
      inFlightRef.current = true;
      setBusy(true);
      setStatusDetail("Detecting danger...");
      try {
        const photo = await cam.takePictureAsync({
          quality: 0.35,
          skipProcessing: true,
        });
        if (!photo?.uri || !mountedRef.current) return;

        const data = await postDangerDetectFrame(photo.uri);
        if (!mountedRef.current) return;

        setLastPayload(data);
        setErrorText(null);
        setAwaitingFirstResult(false);
        setStatusDetail(null);

        const levelKey = normalizeLevelKey(data.danger_level);
        const analysis = (data.llm_analysis ?? "").trim();
        if (analysis) {
          await voiceManager.speak(analysis, isUrgentLevel(levelKey), speechLocale(language));
        }
      } catch (e) {
        if (mountedRef.current) {
          setErrorText((e as Error)?.message ?? "Detection failed");
          setAwaitingFirstResult(false);
        }
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current) setBusy(false);
      }
    };

    const run = async () => {
      try {
        const cam = await waitForCameraRef(cameraRef, cameraSessionReadyRef, isCancelled);
        if (cancelled || !cam) return;

        const lang = speechLocale(language);

        while (!cancelled && mountedRef.current) {
          setErrorText(null);
          setAwaitingFirstResult(true);
          setStatusDetail(INSTRUCTION[lang]);
          await voiceManager.speak(INSTRUCTION[lang], true, lang);
          if (cancelled) break;
          await wait(VOICE_POST_TTS_LISTEN_MS);
          if (cancelled) break;

          const heard = await waitForVoiceKeyword({
            lang,
            isCancelled,
            setStatusDetail,
            matches: transcriptSignalsReady,
            listeningHint: STATUS_LISTENING[lang],
            repromptMessage: REPROMPT[lang],
            timeoutMs: DANGER_VOICE_LISTEN_TIMEOUT_MS,
          });
          if (cancelled || !heard) break;

          setStatusDetail(STATUS_AFTER_KEYWORD[lang]);
          await wait(DANGER_DETECT_AFTER_VOICE_MS);
          if (cancelled) break;

          await captureOnce();
        }
      } catch (e) {
        if (!cancelled && mountedRef.current) {
          setErrorText((e as Error)?.message ?? "Detection failed");
          setAwaitingFirstResult(false);
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

  const levelKey = lastPayload ? normalizeLevelKey(lastPayload.danger_level) : "";
  const dotColor = levelKey ? levelIndicatorColor(levelKey) : "rgba(246,244,235,0.25)";

  let topAlertDisplay = (lastPayload?.top_alert ?? "").trim();
  if (shortResponses && topAlertDisplay.length > 220) {
    topAlertDisplay = `${topAlertDisplay.slice(0, 220)}…`;
  }

  let llmAnalysisDisplay = (lastPayload?.llm_analysis ?? "").trim();
  if (shortResponses && llmAnalysisDisplay.length > 320) {
    llmAnalysisDisplay = `${llmAnalysisDisplay.slice(0, 320)}…`;
  }

  const hazardsShown =
    lastPayload?.hazards && shortResponses ? lastPayload.hazards.slice(0, 2) : lastPayload?.hazards;

  const showSpinner = awaitingFirstResult || busy;

  const langUi = speechLocale(language);

  return (
    <View style={styles.wrap} accessibilityLabel="Danger detection live analysis">
      <Text style={styles.title}>{module.title}</Text>
      <Text style={styles.subtitle}>{module.subtitle}</Text>

      <View style={styles.row}>
        <Text style={styles.levelLabel}>Danger level</Text>
        <View
          style={[styles.levelDot, { backgroundColor: dotColor }]}
          accessibilityRole="image"
          accessibilityLabel={
            levelKey ? `Danger level ${lastPayload?.danger_level}` : "Danger level unknown"
          }
        />
        {lastPayload ? (
          <Text style={[styles.levelText, { color: dotColor }]}>{lastPayload.danger_level}</Text>
        ) : (
          <Text style={styles.levelTextMuted}>…</Text>
        )}
        {showSpinner ? <ActivityIndicator color={COLORS.backgroundLight} style={styles.spinner} /> : null}
      </View>

      {((awaitingFirstResult || busy) && !errorText) || statusDetail ? (
        <View style={styles.statusBlock}>
          {statusDetail ? <Text style={styles.statusDetail}>{statusDetail}</Text> : null}
          {busy && !statusDetail ? (
            <Text style={styles.loadingLine}>Detecting danger...</Text>
          ) : null}
          {awaitingFirstResult && !statusDetail && !busy ? (
            <Text style={styles.loadingLine}>…</Text>
          ) : null}
        </View>
      ) : null}

      {lastPayload && !busy && !errorText ? (
        <Text style={styles.metaMuted}>Analyse basée sur une seule image.</Text>
      ) : null}

      {lastPayload ? (
        <View style={styles.alertBlock}>
          <Text style={styles.alertLabel}>Alert</Text>
          <Text style={styles.alertBody}>{topAlertDisplay || "—"}</Text>
        </View>
      ) : null}

      {lastPayload && llmAnalysisDisplay ? (
        <View style={styles.llmBlock}>
          <Text style={styles.alertLabel}>Analysis</Text>
          <Text style={styles.llmBody}>{llmAnalysisDisplay}</Text>
        </View>
      ) : null}

      {lastPayload && hazardsShown && hazardsShown.length > 0 ? (
        <View style={styles.hazardsBlock}>
          <Text style={styles.alertLabel}>Hazards</Text>
          {hazardsShown.map((h, i) => (
            <Text key={`${h.tracker_id}-${i}`} style={styles.hazardLine}>
              {`• ${h.object} · ${h.urgency} · ${h.zone_v}/${h.zone_h}`}
              {typeof h.depth_value === "number" ? ` · depth ${h.depth_value.toFixed(2)}` : ""}
              {typeof h.motion_factor === "number" ? ` · motion ${h.motion_factor.toFixed(3)}` : ""}
              {Array.isArray(h.bbox) && h.bbox.length >= 4
                ? ` · bbox [${h.bbox.join(", ")}]`
                : ""}
            </Text>
          ))}
        </View>
      ) : null}

      {lastPayload ? (
        <Text style={styles.countLine}>
          Detections: <Text style={styles.countValue}>{String(lastPayload.detection_count)}</Text>
        </Text>
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
    gap: SPACING.md,
    marginTop: SPACING.sm,
  },
  levelLabel: {
    color: COLORS.backgroundLight,
    fontSize: 20,
    fontWeight: "700",
  },
  levelDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "rgba(246,244,235,0.5)",
  },
  levelText: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  levelTextMuted: {
    color: COLORS.textMuted,
    fontSize: 22,
    fontWeight: "600",
  },
  spinner: {
    marginLeft: "auto",
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
  alertBlock: {
    marginTop: SPACING.xs,
    gap: SPACING.xs,
  },
  alertLabel: {
    color: COLORS.textMuted,
    fontSize: 17,
    fontWeight: "700",
  },
  alertBody: {
    color: COLORS.white,
    fontSize: 20,
    lineHeight: 30,
    fontWeight: "500",
  },
  llmBlock: {
    marginTop: SPACING.xs,
    gap: SPACING.xs,
  },
  llmBody: {
    color: COLORS.white,
    fontSize: 18,
    lineHeight: 28,
    fontWeight: "500",
  },
  hazardsBlock: {
    marginTop: SPACING.xs,
    gap: SPACING.xs,
  },
  hazardLine: {
    color: COLORS.white,
    fontSize: 17,
    lineHeight: 26,
    fontWeight: "500",
  },
  countLine: {
    color: COLORS.backgroundLight,
    fontSize: 19,
    fontWeight: "600",
  },
  countValue: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: "800",
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
