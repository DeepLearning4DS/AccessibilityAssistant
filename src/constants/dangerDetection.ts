/** Backend danger / hazard detection (LAN). */
export const DANGER_DETECT_URL = "http://10.12.232.221:7777/detect";

/** Attente après « prêt » / « ready » avant la capture unique. */
export const DANGER_DETECT_AFTER_VOICE_MS = 3000;

/** Durée max d’une tentative d’écoute du mot d’activation. */
export const DANGER_VOICE_LISTEN_TIMEOUT_MS = 90000;

export const DANGER_CAMERA_POLL_MS = 120;
export const DANGER_CAMERA_WAIT_MAX_MS = 20000;
