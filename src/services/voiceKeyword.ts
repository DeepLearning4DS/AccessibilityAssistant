import type { LanguageCode } from "./i18n";
import { listenOnce } from "./speechRecognition";
import { voiceManager } from "./voiceManager";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Pause après une consigne TTS avant d’ouvrir le micro. */
export const VOICE_POST_TTS_LISTEN_MS = 1400;

/** Laisse la session audio se stabiliser avant chaque écoute. */
const VOICE_PRE_LISTEN_SETTLE_MS = 500;

/** Si la reco se coupe sans texte (souvent TTS encore actif), réessayer sans parler. */
const VOICE_EMPTY_RETRY_MS = 900;

export type WaitForVoiceKeywordOptions = {
  lang: LanguageCode;
  isCancelled: () => boolean;
  setStatusDetail: (s: string | null) => void;
  matches: (transcript: string) => boolean;
  listeningHint: string;
  repromptMessage: string;
  timeoutMs: number;
};

/**
 * Attend un mot-clé vocal sans boucler sur les erreurs STT vides
 * (conflit micro / haut-parleur).
 */
export async function waitForVoiceKeyword(
  options: WaitForVoiceKeywordOptions,
): Promise<boolean> {
  const {
    lang,
    isCancelled,
    setStatusDetail,
    matches,
    listeningHint,
    repromptMessage,
    timeoutMs,
  } = options;

  while (!isCancelled()) {
    await wait(VOICE_PRE_LISTEN_SETTLE_MS);
    if (isCancelled()) return false;

    setStatusDetail(listeningHint);
    const result = await listenOnce({
      language: lang,
      timeoutMs,
      interimResults: true,
      shouldAbort: matches,
    });

    if (isCancelled()) return false;

    if (result.ok && matches(result.transcript)) {
      return true;
    }

    if (!result.ok && result.reason === "timeout") {
      setStatusDetail(repromptMessage);
      await voiceManager.speak(repromptMessage, true, lang);
      await wait(VOICE_POST_TTS_LISTEN_MS);
      continue;
    }

    if (!result.ok && result.reason === "error" && result.message === "permissions_denied") {
      throw new Error(
        "Autorisez le micro et la reconnaissance vocale dans Réglages pour continuer.",
      );
    }

    if (!result.ok && (result.reason === "empty" || result.reason === "error")) {
      await wait(VOICE_EMPTY_RETRY_MS);
      continue;
    }

    if (result.ok && !matches(result.transcript)) {
      setStatusDetail(repromptMessage);
      await voiceManager.speak(repromptMessage, true, lang);
      await wait(VOICE_POST_TTS_LISTEN_MS);
    }
  }

  return false;
}
