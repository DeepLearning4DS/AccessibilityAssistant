import { Platform } from "react-native";
import {
  AVAudioSessionCategory,
  AVAudioSessionCategoryOptions,
  AVAudioSessionMode,
  ExpoSpeechRecognitionModule,
  addSpeechRecognitionListener,
} from "expo-speech-recognition";

import { audioSession } from "./audioSession";
import type { LanguageCode } from "./i18n";

export type ListenOptions = {
  language: LanguageCode;
  timeoutMs?: number;
  interimResults?: boolean;
  continuous?: boolean;
  /**
   * Appelé à chaque fragment (interim ou final). Si true, la reco se termine
   * immédiatement avec succès — utile pour « skip » sans attendre isFinal.
   */
  shouldAbort?: (transcript: string) => boolean;
};

export type ListenResult =
  | { ok: true; transcript: string }
  | { ok: false; reason: "timeout" | "error" | "cancelled" | "empty"; message?: string };

let isListening = false;
let permissionsGranted: boolean | null = null;

async function ensurePermissions(): Promise<boolean> {
  if (permissionsGranted === true) return true;
  try {
    const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    permissionsGranted = Boolean((result as { granted?: boolean })?.granted);
    return permissionsGranted;
  } catch {
    permissionsGranted = false;
    return false;
  }
}

export async function stopListening(): Promise<void> {
  try {
    ExpoSpeechRecognitionModule.stop();
  } catch {
    // no-op: stop can fail if recognizer is idle
  }
  isListening = false;
  await audioSession.releaseAfterListening();
}

export async function listenOnce(options: ListenOptions): Promise<ListenResult> {
  const granted = await ensurePermissions();
  if (!granted) {
    return { ok: false, reason: "error", message: "permissions_denied" };
  }

  if (isListening) {
    await stopListening();
  }

  const language = options.language;
  const timeoutMs = options.timeoutMs ?? 10000;

  await audioSession.prepareForListening();

  return new Promise<ListenResult>((resolve) => {
    let resolved = false;
    let lastTranscript = "";

    const cleanup = () => {
      resultSub?.remove?.();
      errorSub?.remove?.();
      endSub?.remove?.();
      if (timeoutHandle) clearTimeout(timeoutHandle);
      isListening = false;
    };

    const finalize = (result: ListenResult) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        // no-op
      }
      void audioSession
        .releaseAfterListening()
        .catch(() => undefined)
        .finally(() => resolve(result));
    };

    const resultSub = addSpeechRecognitionListener(
      "result",
      (event: { isFinal?: boolean; results?: Array<{ transcript?: string }> }) => {
        const transcript = (event?.results?.[0]?.transcript ?? "").trim();
        if (transcript) lastTranscript = transcript;
        if (transcript && options.shouldAbort?.(transcript)) {
          finalize({ ok: true, transcript });
          return;
        }
        if (event?.isFinal && transcript) {
          finalize({ ok: true, transcript });
        }
      },
    );

    const errorSub = addSpeechRecognitionListener(
      "error",
      (event: { error?: string; message?: string }) => {
        finalize({
          ok: false,
          reason: "error",
          message: event?.message ?? event?.error ?? "unknown_error",
        });
      },
    );

    const endSub = addSpeechRecognitionListener("end", () => {
      if (resolved) return;
      if (lastTranscript) {
        finalize({ ok: true, transcript: lastTranscript });
      } else {
        finalize({ ok: false, reason: "empty" });
      }
    });

    const timeoutHandle = setTimeout(() => {
      finalize({ ok: false, reason: "timeout" });
    }, timeoutMs);

    try {
      isListening = true;
      ExpoSpeechRecognitionModule.start({
        lang: language,
        interimResults: options.interimResults ?? true,
        continuous: options.continuous ?? false,
        maxAlternatives: 1,
        requiresOnDeviceRecognition: false,
        /**
         * Par défaut le module met `mode: measurement` → volume de sortie très bas.
         * On force `default` + `defaultToSpeaker` pour garder le haut-parleur et un niveau normal.
         */
        ...(Platform.OS === "ios"
          ? {
              iosCategory: {
                category: AVAudioSessionCategory.playAndRecord,
                categoryOptions: [
                  AVAudioSessionCategoryOptions.defaultToSpeaker,
                  AVAudioSessionCategoryOptions.allowBluetooth,
                ],
                mode: AVAudioSessionMode.default,
              },
            }
          : {}),
      });
    } catch (error) {
      finalize({
        ok: false,
        reason: "error",
        message: (error as Error)?.message ?? "start_failed",
      });
    }
  });
}

export const speechRecognition = {
  ensurePermissions,
  listenOnce,
  stopListening,
  get isAvailable() {
    return typeof ExpoSpeechRecognitionModule?.start === "function";
  },
};
