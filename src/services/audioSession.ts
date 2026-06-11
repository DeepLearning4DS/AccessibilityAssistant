import { Platform } from "react-native";

/**
 * Gestion centralisée de la session audio (TTS vs micro).
 *
 * Sur iOS, après `expo-speech-recognition`, la session reste souvent en
 * `playAndRecord` avec route « receiver » → TTS très faible. On combine :
 *  - `setCategoryIOS` du module speech (même pile native que la reco)
 *  - `expo-av` `setAudioModeAsync` (`allowsRecordingIOS: false`)
 *  - délais courts + double application après écoute
 */

export type AudioMode = "idle" | "speaking" | "listening";

type AvAudioApi = {
  setAudioModeAsync: (mode: Record<string, unknown>) => Promise<void>;
  InterruptionModeIOS?: { DoNotMix?: number; MixWithOthers?: number };
  InterruptionModeAndroid?: { DoNotMix?: number; DuckOthers?: number };
};

let avAudio: AvAudioApi | null | undefined;
let avLoadFailed = false;

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const TRANSITION_MS = 320;
const POST_LISTEN_EXTRA_MS = 380;

async function resolveAvAudio(): Promise<AvAudioApi | null> {
  if (Platform.OS === "web") return null;
  if (avLoadFailed) return null;
  if (avAudio !== undefined) return avAudio;
  try {
    const mod = await import("expo-av");
    avAudio = mod.Audio ?? null;
    if (!avAudio) avLoadFailed = true;
    return avAudio;
  } catch {
    avLoadFailed = true;
    avAudio = null;
    return null;
  }
}

/** Réinitialise la route iOS vers lecture haut-parleur (API native du module reco). */
async function iosSetPlaybackCategory(): Promise<void> {
  if (Platform.OS !== "ios") return;
  try {
    const sr = await import("expo-speech-recognition");
    try {
      sr.setCategoryIOS({
        category: sr.AVAudioSessionCategory.playback,
        categoryOptions: [],
        mode: sr.AVAudioSessionMode.default,
      });
    } catch {
      /** Caméra / reco tiennent souvent `playAndRecord` : le passage direct en `playback` peut échouer (OSStatus 561017449). */
      sr.setCategoryIOS({
        category: sr.AVAudioSessionCategory.playAndRecord,
        categoryOptions: [
          sr.AVAudioSessionCategoryOptions.defaultToSpeaker,
          sr.AVAudioSessionCategoryOptions.mixWithOthers,
        ],
        mode: sr.AVAudioSessionMode.default,
      });
    }
  } catch (error) {
    if (__DEV__) {
      console.warn("[audioSession] iosSetPlaybackCategory failed", error);
    }
  }
}

/** Avant le micro : playAndRecord + defaultToSpeaker pour garder la sortie sur le speaker. */
async function iosSetRecordingCategory(): Promise<void> {
  if (Platform.OS !== "ios") return;
  try {
    const sr = await import("expo-speech-recognition");
    sr.setCategoryIOS({
      category: sr.AVAudioSessionCategory.playAndRecord,
      categoryOptions: [sr.AVAudioSessionCategoryOptions.defaultToSpeaker],
      mode: sr.AVAudioSessionMode.default,
    });
  } catch (error) {
    if (__DEV__) {
      console.warn("[audioSession] iosSetRecordingCategory failed", error);
    }
  }
}

const applyPlaybackModeAv = async () => {
  if (Platform.OS === "web") return;
  const audio = await resolveAvAudio();
  if (!audio) return;
  try {
    await audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      interruptionModeIOS: audio.InterruptionModeIOS?.DoNotMix ?? 1,
      interruptionModeAndroid: audio.InterruptionModeAndroid?.DoNotMix ?? 1,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
    });
  } catch (error) {
    if (__DEV__) {
      console.warn("[audioSession] applyPlaybackModeAv failed", error);
    }
  }
};

const applyRecordingModeAv = async () => {
  if (Platform.OS === "web") return;
  const audio = await resolveAvAudio();
  if (!audio) return;
  try {
    await audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      interruptionModeIOS: audio.InterruptionModeIOS?.DoNotMix ?? 1,
      interruptionModeAndroid: audio.InterruptionModeAndroid?.DoNotMix ?? 1,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
    });
  } catch (error) {
    if (__DEV__) {
      console.warn("[audioSession] applyRecordingModeAv failed", error);
    }
  }
};

/** Playback complet : catégorie iOS + mode expo-av (souvent les deux sont nécessaires). */
const forcePlaybackRoute = async () => {
  await iosSetPlaybackCategory();
  await applyPlaybackModeAv();
};

/** Enregistrement : catégorie iOS (speaker par défaut) puis mode AV. */
const forceRecordingRoute = async () => {
  await iosSetRecordingCategory();
  await applyRecordingModeAv();
};

let currentMode: AudioMode = "idle";
let transitionQueue: Promise<unknown> = Promise.resolve();

const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
  const next = transitionQueue.then(task, task);
  transitionQueue = next.catch(() => undefined);
  return next;
};

export const audioSession = {
  getMode(): AudioMode {
    return currentMode;
  },

  async prepareForSpeaking(): Promise<void> {
    return enqueue(async () => {
      const wasListening = currentMode === "listening";
      if (wasListening) {
        await wait(TRANSITION_MS);
      }
      await forcePlaybackRoute();
      currentMode = "speaking";
    });
  },

  async releaseAfterSpeaking(): Promise<void> {
    return enqueue(async () => {
      await forcePlaybackRoute();
      currentMode = "idle";
    });
  },

  async prepareForListening(): Promise<void> {
    return enqueue(async () => {
      const wasSpeaking = currentMode === "speaking";
      if (wasSpeaking) {
        await wait(TRANSITION_MS);
      }
      await forceRecordingRoute();
      currentMode = "listening";
    });
  },

  /**
   * Après le micro : critique pour le volume TTS — on applique deux fois
   * playback + pause, pour laisser iOS libérer la route « receiver ».
   */
  async releaseAfterListening(): Promise<void> {
    return enqueue(async () => {
      await forcePlaybackRoute();
      await wait(POST_LISTEN_EXTRA_MS);
      await forcePlaybackRoute();
      await wait(TRANSITION_MS);
      currentMode = "idle";
    });
  },

  async primePlayback(): Promise<void> {
    return enqueue(async () => {
      await forcePlaybackRoute();
      currentMode = "idle";
    });
  },
};
