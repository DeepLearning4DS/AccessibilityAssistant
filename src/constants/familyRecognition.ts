/** Backend family / face recognition (LAN). */
export const FAMILY_RECOGNIZE_URL =
  "http://10.12.232.195:8765/api/recognize/image";

/** Délai après consigne vocale avant de pointer la caméra (capture). */
export const FAMILY_COUNTDOWN_MS = 3000;

export const FAMILY_VOICE_LISTEN_TIMEOUT_MS = 90000;

export const FAMILY_CAMERA_POLL_MS = 120;
export const FAMILY_CAMERA_WAIT_MAX_MS = 20000;

/** Après TTS avant écoute du mot « ready » / « prêt ». */
export const FAMILY_POST_TTS_LISTEN_MS = 1100;
