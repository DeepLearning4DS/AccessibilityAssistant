import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { ModuleDefinition } from "../constants/modules";
import {
  FAMILY_CAMERA_POLL_MS,
  FAMILY_CAMERA_WAIT_MAX_MS,
  FAMILY_COUNTDOWN_MS,
  FAMILY_VOICE_LISTEN_TIMEOUT_MS,
} from "../constants/familyRecognition";
import { COLORS, SPACING } from "../constants/theme";
import { postFamilyRecognizeImage } from "../services/familyRecognitionApi";
import type { LanguageCode } from "../services/i18n";
import { stopListening } from "../services/speechRecognition";
import { VOICE_POST_TTS_LISTEN_MS, waitForVoiceKeyword } from "../services/voiceKeyword";
import { voiceManager } from "../services/voiceManager";
import { useUserStore } from "../state/userStore";
import type {
  FamilyRecognizeEvent,
  FamilyRecognizeResponse,
} from "../types/familyRecognition";

import type { CameraBackgroundHandle } from "./CameraBackground";

function speechLocale(lang: LanguageCode | null): LanguageCode {
  return lang ?? "fr-FR";
}

const OPENING: Record<LanguageCode, string> = {
  "en-US":
    "Family member detection is ready. Say ready when you are ready.",
  "fr-FR":
    "La détection des membres de la famille est activée. Dites « ready » ou « prêt » quand vous voulez commencer.",
  "ar-SA":
    "كشف أفراد العائلة جاهز. قولوا « ready » أو « جاهز » عندما تكونون مستعدين.",
};

const POINT_CAMERA: Record<LanguageCode, string> = {
  "en-US":
    "You have 3 seconds to point the camera at the family member.",
  "fr-FR":
    "Vous avez 3 secondes pour diriger la caméra vers le membre de la famille.",
  "ar-SA": "لديكم 3 ثوانٍ لتوجيه الكاميرا نحو فرد العائلة.",
};

const LOOP_PROMPT: Record<LanguageCode, string> = {
  "en-US":
    "Do you want to detect another family member? Say ready when you are ready.",
  "fr-FR":
    "Souhaitez-vous détecter un autre membre de la famille ? Dites « ready » ou « prêt » quand vous voulez continuer.",
  "ar-SA":
    "هل تريدون كشف فرد آخر من العائلة؟ قولوا « ready » أو « جاهز » عندما تكونون مستعدين.",
};

const STATUS_LISTENING: Record<LanguageCode, string> = {
  "fr-FR": "Écoute… dites « ready » ou « prêt ».",
  "en-US": "Listening… say « ready » or « prêt ».",
  "ar-SA": "استماع… قولوا ready أو جاهز.",
};

const REPROMPT: Record<LanguageCode, string> = {
  "fr-FR":
    "Je n'ai pas entendu. Dites « ready » ou « prêt » pour continuer.",
  "en-US": "I didn't hear you. Say « ready » or « prêt » to continue.",
  "ar-SA": "لم أسمع. قولوا ready أو جاهز للمتابعة.",
};

const PREPARING: Record<LanguageCode, string> = {
  "en-US": "Preparing detection...",
  "fr-FR": "Préparation de la détection…",
  "ar-SA": "جاري تجهيز الكشف…",
};

const DETECTING: Record<LanguageCode, string> = {
  "en-US": "Detecting family member...",
  "fr-FR": "Détection du membre de la famille…",
  "ar-SA": "جاري كشف فرد العائلة…",
};

const NO_MEMBER_TTS: Record<LanguageCode, string> = {
  "en-US": "No registered family member detected.",
  "fr-FR": "Aucun membre de la famille enregistré n'a été détecté.",
  "ar-SA": "لم يتم الكشف عن فرد مسجّل من العائلة.",
};

const NO_MEMBER_UI: Record<LanguageCode, string> = {
  "en-US": "No registered family member detected.",
  "fr-FR": "Aucun membre de la famille enregistré détecté.",
  "ar-SA": "لا يوجد فرد مسجّل من العائلة.",
};

const HINT_FOOTER: Record<LanguageCode, string> = {
  "fr-FR": "Quittez l’écran pour arrêter.",
  "en-US": "Leave this screen to stop.",
  "ar-SA": "غادروا الشاشة للإيقاف.",
};

type FamilyRecognitionPanelProps = {
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
  if (/\bready\b/.test(ascii)) return true;
  if (/\bpret\b/.test(ascii)) return true;
  if (raw.includes("جاهز")) return true;
  return false;
}

function isKnownIdentity(identity: string): boolean {
  const t = identity.trim();
  if (!t) return false;
  const low = t.toLowerCase();
  if (low === "unknown" || low === "inconnu" || low === "n/a" || low === "none") {
    return false;
  }
  return true;
}

function pickBestKnownEvent(events: FamilyRecognizeEvent[]): FamilyRecognizeEvent | null {
  const known = events.filter((e) => isKnownIdentity(e.identity));
  if (!known.length) return null;
  return known.reduce((a, b) => (b.confidence > a.confidence ? b : a));
}

function formatConfidence(c: number | undefined): string {
  if (c === undefined || Number.isNaN(c)) return "—";
  if (c >= 0 && c <= 1) return `${Math.round(c * 100)}%`;
  return `${Math.round(c)}%`;
}

function ttsForEvent(event: FamilyRecognizeEvent): string {
  const phrase = event.phrase?.trim();
  if (event.speak && phrase) return phrase;
  const id = event.identity?.trim();
  if (id) return id;
  return phrase || "";
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
    if (Date.now() - start > FAMILY_CAMERA_WAIT_MAX_MS) {
      throw new Error(
        "La caméra met trop de temps à répondre. Réessayez ou rouvrez l’écran.",
      );
    }
    await wait(FAMILY_CAMERA_POLL_MS);
  }
  return null;
}

type Presented =
  | { kind: "hit"; event: FamilyRecognizeEvent; response: FamilyRecognizeResponse }
  | { kind: "miss"; response: FamilyRecognizeResponse };

export function FamilyRecognitionPanel({
  cameraRef,
  cameraSessionReadyRef,
  module,
  shortResponses,
}: FamilyRecognitionPanelProps) {
  const language = useUserStore((s) => s.profile.language);
  const [presented, setPresented] = useState<Presented | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [phase, setPhase] = useState<"preparing" | "detecting" | null>(null);

  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;

    const run = async () => {
      try {
        const cam = await waitForCameraRef(cameraRef, cameraSessionReadyRef, isCancelled);
        if (cancelled || !cam) return;

        const lang = speechLocale(language);

        setErrorText(null);
        setPresented(null);
        setStatusDetail(null);
        setPhase(null);

        await voiceManager.speak(OPENING[lang], true, lang);
        if (cancelled) return;
        await wait(VOICE_POST_TTS_LISTEN_MS);
        if (cancelled) return;

        let heard = await waitForVoiceKeyword({
          lang,
          isCancelled,
          setStatusDetail,
          matches: transcriptSignalsReady,
          listeningHint: STATUS_LISTENING[lang],
          repromptMessage: REPROMPT[lang],
          timeoutMs: FAMILY_VOICE_LISTEN_TIMEOUT_MS,
        });
        if (cancelled || !heard) return;

        while (!cancelled && mountedRef.current) {
          setErrorText(null);
          setPresented(null);
          setStatusDetail(null);

          await voiceManager.speak(POINT_CAMERA[lang], true, lang);
          if (cancelled) break;
          await wait(VOICE_POST_TTS_LISTEN_MS);
          if (cancelled) break;

          setPhase("preparing");
          setStatusDetail(PREPARING[lang]);
          await wait(FAMILY_COUNTDOWN_MS);
          if (cancelled) break;

          const liveCam = cameraRef.current ?? cam;
          if (inFlightRef.current) break;
          inFlightRef.current = true;
          setBusy(true);
          setPhase("detecting");
          setStatusDetail(DETECTING[lang]);

          try {
            const photo = await liveCam.takePictureAsync({
              quality: 0.4,
              skipProcessing: true,
            });
            if (!photo?.uri || !mountedRef.current) {
              setPhase(null);
              setStatusDetail(null);
              break;
            }

            const data = await postFamilyRecognizeImage(photo.uri);
            if (!mountedRef.current) return;

            const best = pickBestKnownEvent(data.events);
            if (best) {
              setPresented({ kind: "hit", event: best, response: data });
              const spoken = ttsForEvent(best);
              if (spoken) {
                await voiceManager.speak(spoken, true, lang);
              }
            } else {
              setPresented({ kind: "miss", response: data });
              await voiceManager.speak(NO_MEMBER_TTS[lang], true, lang);
            }
            setErrorText(null);
          } catch (e) {
            if (mountedRef.current) {
              setPresented(null);
              setErrorText((e as Error)?.message ?? "Detection failed");
            }
          } finally {
            inFlightRef.current = false;
            if (mountedRef.current) {
              setBusy(false);
              setPhase(null);
              setStatusDetail(null);
            }
          }

          if (cancelled) break;

          await voiceManager.speak(LOOP_PROMPT[lang], true, lang);
          if (cancelled) break;
          await wait(VOICE_POST_TTS_LISTEN_MS);
          if (cancelled) break;

          heard = await waitForVoiceKeyword({
            lang,
            isCancelled,
            setStatusDetail,
            matches: transcriptSignalsReady,
            listeningHint: STATUS_LISTENING[lang],
            repromptMessage: REPROMPT[lang],
            timeoutMs: FAMILY_VOICE_LISTEN_TIMEOUT_MS,
          });
          if (cancelled || !heard) break;
        }
      } catch (e) {
        if (!cancelled && mountedRef.current) {
          setErrorText((e as Error)?.message ?? "Detection failed");
          setPhase(null);
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

  const langUi = speechLocale(language);
  const showSpinner = busy || phase !== null;
  const hit = presented?.kind === "hit" ? presented : null;
  const miss = presented?.kind === "miss" ? presented : null;
  const annotatedUri =
    hit?.response.annotated_image ?? miss?.response.annotated_image ?? "";

  let nameDisplay = hit?.event.identity?.trim() ?? "";
  if (shortResponses && nameDisplay.length > 80) {
    nameDisplay = `${nameDisplay.slice(0, 80)}…`;
  }

  return (
    <View style={styles.wrap} accessibilityLabel="Family recognition">
      <Text style={styles.title}>{module.title}</Text>
      <Text style={styles.subtitle}>{module.subtitle}</Text>

      <View style={styles.row}>
        <Text style={styles.rowLabel}>Status</Text>
        {showSpinner ? (
          <ActivityIndicator color={COLORS.backgroundLight} style={styles.spinner} />
        ) : (
          <Text style={styles.rowValueMuted}>Ready</Text>
        )}
      </View>

      {(phase === "preparing" || phase === "detecting" || statusDetail) && !errorText ? (
        <View style={styles.statusBlock}>
          {phase === "preparing" ? (
            <Text style={styles.loadingLine}>{PREPARING[langUi]}</Text>
          ) : null}
          {phase === "detecting" ? (
            <Text style={styles.loadingLine}>{DETECTING[langUi]}</Text>
          ) : null}
          {statusDetail && !phase ? (
            <Text style={styles.statusDetail}>{statusDetail}</Text>
          ) : null}
        </View>
      ) : null}

      {hit ? (
        <View style={styles.resultBlock}>
          <Text style={styles.alertLabel}>Detected</Text>
          <Text style={styles.alertBody}>{nameDisplay || "—"}</Text>
          <Text style={styles.confidenceLine}>
            Confidence:{" "}
            <Text style={styles.confidenceValue}>
              {formatConfidence(hit.event.confidence)}
            </Text>
          </Text>
        </View>
      ) : null}

      {miss ? (
        <View style={styles.resultBlock}>
          <Text style={styles.alertBody}>{NO_MEMBER_UI[langUi]}</Text>
        </View>
      ) : null}

      {annotatedUri ? (
        <View style={styles.imageWrap}>
          <Text style={styles.alertLabel}>Annotated view</Text>
          <Image
            source={{ uri: annotatedUri }}
            style={styles.annotatedImage}
            resizeMode="contain"
            accessibilityLabel="Annotated detection image"
          />
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
    gap: SPACING.md,
    marginTop: SPACING.sm,
  },
  rowLabel: {
    color: COLORS.backgroundLight,
    fontSize: 20,
    fontWeight: "700",
  },
  rowValueMuted: {
    color: COLORS.textMuted,
    fontSize: 18,
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
  resultBlock: {
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
  confidenceLine: {
    color: COLORS.backgroundLight,
    fontSize: 18,
    fontWeight: "600",
  },
  confidenceValue: {
    color: COLORS.white,
    fontSize: 19,
    fontWeight: "800",
  },
  imageWrap: {
    marginTop: SPACING.xs,
    gap: SPACING.xs,
  },
  annotatedImage: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.25)",
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
