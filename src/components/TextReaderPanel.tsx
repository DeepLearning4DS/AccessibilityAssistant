import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { ModuleDefinition } from "../constants/modules";
import {
  TEXT_READER_CAMERA_POLL_MS,
  TEXT_READER_CAMERA_WAIT_MAX_MS,
  TEXT_READER_COUNTDOWN_MS,
  TEXT_READER_VOICE_LISTEN_TIMEOUT_MS,
} from "../constants/textReader";
import { COLORS, SPACING } from "../constants/theme";
import type { LanguageCode } from "../services/i18n";
import { postPrescriptionReadImage } from "../services/prescriptionReadApi";
import { stopListening } from "../services/speechRecognition";
import { VOICE_POST_TTS_LISTEN_MS, waitForVoiceKeyword } from "../services/voiceKeyword";
import { voiceManager } from "../services/voiceManager";
import { useUserStore } from "../state/userStore";

import type { CameraBackgroundHandle } from "./CameraBackground";

function speechLocale(lang: LanguageCode | null): LanguageCode {
  return lang ?? "fr-FR";
}

const OPENING: Record<LanguageCode, string> = {
  "en-US": "If you want to read a document, say yes.",
  "fr-FR": "Pour lire un document, dites « oui ».",
  "ar-SA": "لقراءة مستند، قولوا « نعم ».",
};

const POINT_CAMERA: Record<LanguageCode, string> = {
  "en-US": "You have 3 seconds to place the document in front of the camera.",
  "fr-FR": "Vous avez 3 secondes pour placer le document devant la caméra.",
  "ar-SA": "لديكم 3 ثوانٍ لوضع المستند أمام الكاميرا.",
};

const STATUS_LISTENING: Record<LanguageCode, string> = {
  "fr-FR": "Écoute… dites « oui » ou « yes ».",
  "en-US": "Listening… say « yes ».",
  "ar-SA": "استماع… قولوا « نعم ».",
};

const REPROMPT: Record<LanguageCode, string> = {
  "fr-FR": "Je n'ai pas entendu. Dites « oui » ou « yes » pour lire un document.",
  "en-US": "I didn't hear you. Say « yes » to read a document.",
  "ar-SA": "لم أسمع. قولوا « نعم » لقراءة مستند.",
};

const PREPARING: Record<LanguageCode, string> = {
  "en-US": "Preparing text reading...",
  "fr-FR": "Préparation de la lecture du texte…",
  "ar-SA": "جاري تجهيز قراءة النص…",
};

const READING: Record<LanguageCode, string> = {
  "en-US": "Reading document...",
  "fr-FR": "Lecture du document…",
  "ar-SA": "جاري قراءة المستند…",
};

const UNCLEAR_TTS: Record<LanguageCode, string> = {
  "en-US": "I could not read the document clearly.",
  "fr-FR": "Je n'ai pas pu lire le document clairement.",
  "ar-SA": "لم أتمكن من قراءة المستند بوضوح.",
};

const UNCLEAR_UI: Record<LanguageCode, string> = {
  "en-US": "I could not read the document clearly.",
  "fr-FR": "Impossible de lire le document clairement.",
  "ar-SA": "تعذّرت قراءة المستند بوضوح.",
};

const EXTRACTED_LABEL: Record<LanguageCode, string> = {
  "fr-FR": "Texte extrait",
  "en-US": "Extracted text",
  "ar-SA": "النص المستخرج",
};

const HINT_FOOTER: Record<LanguageCode, string> = {
  "fr-FR": "Quittez l’écran pour arrêter. Double tapez pour réécouter le texte.",
  "en-US": "Leave this screen to stop. Double tap to hear the text again.",
  "ar-SA": "غادروا الشاشة للإيقاف. انقر مرتين لإعادة سماع النص.",
};

type TextReaderPanelProps = {
  cameraRef: React.RefObject<CameraBackgroundHandle | null>;
  cameraSessionReadyRef: React.MutableRefObject<boolean>;
  module: ModuleDefinition;
  shortResponses: boolean;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function transcriptSignalsYes(raw: string): boolean {
  const ascii = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (/\byes\b/.test(ascii)) return true;
  if (/\byeah\b/.test(ascii)) return true;
  if (/\bou?i\b/.test(ascii)) return true;
  if (raw.includes("نعم")) return true;
  return false;
}

function ttsLangForDetected(detectedLang: string | undefined, fallback: LanguageCode): LanguageCode {
  const code = (detectedLang ?? "").toLowerCase().slice(0, 2);
  if (code === "ar") return "ar-SA";
  if (code === "fr") return "fr-FR";
  if (code === "en") return "en-US";
  return fallback;
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
    if (Date.now() - start > TEXT_READER_CAMERA_WAIT_MAX_MS) {
      throw new Error(
        "La caméra met trop de temps à répondre. Réessayez ou rouvrez l’écran.",
      );
    }
    await wait(TEXT_READER_CAMERA_POLL_MS);
  }
  return null;
}

export function TextReaderPanel({
  cameraRef,
  cameraSessionReadyRef,
  module,
  shortResponses,
}: TextReaderPanelProps) {
  const language = useUserStore((s) => s.profile.language);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [unclear, setUnclear] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [phase, setPhase] = useState<"preparing" | "reading" | null>(null);

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
        setExtractedText(null);
        setUnclear(false);
        setStatusDetail(null);
        setPhase(null);

        await voiceManager.speak(OPENING[lang], true, lang);
        if (cancelled) return;
        await wait(VOICE_POST_TTS_LISTEN_MS);
        if (cancelled) return;

        const heard = await waitForVoiceKeyword({
          lang,
          isCancelled,
          setStatusDetail,
          matches: transcriptSignalsYes,
          listeningHint: STATUS_LISTENING[lang],
          repromptMessage: REPROMPT[lang],
          timeoutMs: TEXT_READER_VOICE_LISTEN_TIMEOUT_MS,
        });
        if (cancelled || !heard) return;

        setErrorText(null);
        setExtractedText(null);
        setUnclear(false);
        setStatusDetail(null);

        await voiceManager.speak(POINT_CAMERA[lang], true, lang);
        if (cancelled) return;
        await wait(VOICE_POST_TTS_LISTEN_MS);
        if (cancelled) return;

        setPhase("preparing");
        setStatusDetail(PREPARING[lang]);
        await wait(TEXT_READER_COUNTDOWN_MS);
        if (cancelled) return;

        const liveCam = cameraRef.current ?? cam;
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        setBusy(true);
        setPhase("reading");
        setStatusDetail(READING[lang]);

        try {
          const photo = await liveCam.takePictureAsync({
            quality: 0.4,
            skipProcessing: true,
          });
          if (!photo?.uri || !mountedRef.current) {
            setPhase(null);
            setStatusDetail(null);
            return;
          }

          const data = await postPrescriptionReadImage(photo.uri);
          if (!mountedRef.current) return;

          const text = (data.extracted_text ?? "").trim();
          const speakLang = ttsLangForDetected(data.detected_lang, lang);

          if (!text) {
            setUnclear(true);
            setExtractedText(null);
            await voiceManager.speak(UNCLEAR_TTS[lang], true, lang);
          } else {
            setUnclear(false);
            setExtractedText(text);
            voiceManager.setLastMessage(text);
            await voiceManager.speakLong(text, true, speakLang);
          }
          setErrorText(null);
        } catch (e) {
          if (mountedRef.current) {
            setExtractedText(null);
            setUnclear(false);
            setErrorText((e as Error)?.message ?? "Reading failed");
          }
        } finally {
          inFlightRef.current = false;
          if (mountedRef.current) {
            setBusy(false);
            setPhase(null);
            setStatusDetail(null);
          }
        }
      } catch (e) {
        if (!cancelled && mountedRef.current) {
          setErrorText((e as Error)?.message ?? "Reading failed");
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

  let textDisplay = extractedText ?? "";
  if (shortResponses && textDisplay.length > 400) {
    textDisplay = `${textDisplay.slice(0, 400)}…`;
  }

  return (
    <View style={styles.wrap} accessibilityLabel="Text reader">
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

      {(phase === "preparing" || phase === "reading" || statusDetail) && !errorText ? (
        <View style={styles.statusBlock}>
          {phase === "preparing" ? (
            <Text style={styles.loadingLine}>{PREPARING[langUi]}</Text>
          ) : null}
          {phase === "reading" ? (
            <Text style={styles.loadingLine}>{READING[langUi]}</Text>
          ) : null}
          {statusDetail && !phase ? (
            <Text style={styles.statusDetail}>{statusDetail}</Text>
          ) : null}
        </View>
      ) : null}

      {extractedText && !errorText ? (
        <View style={styles.resultBlock}>
          <Text style={styles.alertLabel}>{EXTRACTED_LABEL[langUi]}</Text>
          <ScrollView
            style={styles.textScroll}
            nestedScrollEnabled
            accessibilityLabel={EXTRACTED_LABEL[langUi]}
          >
            <Text style={styles.alertBody} selectable>
              {textDisplay}
            </Text>
          </ScrollView>
        </View>
      ) : null}

      {unclear && !errorText ? (
        <View style={styles.resultBlock}>
          <Text style={styles.alertBody}>{UNCLEAR_UI[langUi]}</Text>
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
  textScroll: {
    maxHeight: 280,
  },
  alertBody: {
    color: COLORS.white,
    fontSize: 20,
    lineHeight: 30,
    fontWeight: "500",
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
