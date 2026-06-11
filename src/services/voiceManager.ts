import * as Speech from "expo-speech";
import { Platform } from "react-native";

import { audioSession } from "./audioSession";
import type { LanguageCode } from "./i18n";

let lastMessage = "Assistant ready.";
let currentLanguage: LanguageCode = "en-US";
let speakSequence = 0;

const RATE_BY_LANGUAGE: Record<LanguageCode, number> = {
  "en-US": 0.95,
  "fr-FR": 0.9,
  "ar-SA": 0.85,
};

/**
 * Sur iOS, après la reco vocale, la session reste en playAndRecord. On lui dit
 * d'utiliser sa propre session audio (Playback) plutôt que celle de l'app afin
 * que le TTS sorte du haut-parleur principal, même si `audioSession` n'a pas
 * encore pu basculer le mode (cas dev client non rebuild avec expo-av).
 */
const IOS_PLATFORM_OPTIONS: Pick<Speech.SpeechOptions, "useApplicationAudioSession"> =
  Platform.OS === "ios" ? { useApplicationAudioSession: false } : {};

/** Découpe un long `extracted_text` (ordonnance, paragraphes) pour expo-speech. */
export function chunkTextForSpeech(text: string, maxLen = 380): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const blocks = normalized.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const source = blocks.length ? blocks : [normalized];
  const chunks: string[] = [];

  const pushChunk = (piece: string) => {
    const t = piece.trim();
    if (t) chunks.push(t);
  };

  for (const block of source) {
    if (block.length <= maxLen) {
      pushChunk(block);
      continue;
    }
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    let buf = "";
    for (const line of lines) {
      const candidate = buf ? `${buf}\n${line}` : line;
      if (candidate.length <= maxLen) {
        buf = candidate;
        continue;
      }
      if (buf) pushChunk(buf);
      if (line.length <= maxLen) {
        buf = line;
      } else {
        for (let i = 0; i < line.length; i += maxLen) {
          pushChunk(line.slice(i, i + maxLen));
        }
        buf = "";
      }
    }
    if (buf) pushChunk(buf);
  }

  return chunks.length ? chunks : [normalized];
}

const buildOptions = (
  language: LanguageCode,
  resolve: () => void,
): Speech.SpeechOptions => ({
  language,
  pitch: 1,
  rate: RATE_BY_LANGUAGE[language] ?? 0.9,
  ...IOS_PLATFORM_OPTIONS,
  onDone: resolve,
  onStopped: resolve,
  onError: resolve,
});

export const voiceManager = {
  setLanguage(language: LanguageCode) {
    currentLanguage = language;
  },
  getLanguage(): LanguageCode {
    return currentLanguage;
  },

  /** Lit un texte long (ex. `extracted_text` OCR) morceau par morceau. */
  async speakLong(message: string, interrupt = true, language?: LanguageCode) {
    const chunks = chunkTextForSpeech(message);
    if (!chunks.length) return;
    lastMessage = message.trim();
    for (let i = 0; i < chunks.length; i += 1) {
      await this.speak(chunks[i], interrupt && i === 0, language);
    }
  },

  async speak(message: string, interrupt = true, language?: LanguageCode) {
    if (interrupt) {
      try {
        Speech.stop();
      } catch {
        // no-op
      }
    }
    lastMessage = message;
    const targetLanguage = language ?? currentLanguage;
    const sequence = ++speakSequence;

    await audioSession.prepareForSpeaking();

    try {
      await new Promise<void>((resolve) => {
        const finish = () => {
          if (sequence === speakSequence) resolve();
          else resolve();
        };
        Speech.speak(message, buildOptions(targetLanguage, finish));
      });
    } finally {
      await audioSession.releaseAfterSpeaking();
    }
  },

  async repeatLastMessage(prefix?: string, language?: LanguageCode) {
    const text = prefix ? `${prefix} ${lastMessage}` : lastMessage;
    const targetLanguage = language ?? currentLanguage;
    if (chunkTextForSpeech(text).length > 1) {
      await this.speakLong(text, true, targetLanguage);
      return;
    }
    await this.speak(text, true, targetLanguage);
  },

  getLastMessage() {
    return lastMessage;
  },
  setLastMessage(message: string) {
    lastMessage = message;
  },
  stop() {
    try {
      Speech.stop();
    } catch {
      // no-op
    }
  },
  isSpeaking() {
    return Speech.isSpeakingAsync();
  },
};
