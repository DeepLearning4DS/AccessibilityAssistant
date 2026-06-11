/** Backend émotions (LAN). */
export const EMOTION_DETECT_URL = "http://10.12.232.195:5858/detect-emotion";

/** Intervalle entre deux analyses (ms), après activation vocale. */
export const EMOTION_DETECT_POLL_MS = 5000;

/** Durée max d’une tentative d’écoute du mot d’activation. */
export const EMOTION_VOICE_LISTEN_TIMEOUT_MS = 90000;

export const EMOTION_CAMERA_POLL_MS = 120;
export const EMOTION_CAMERA_WAIT_MAX_MS = 20000;
