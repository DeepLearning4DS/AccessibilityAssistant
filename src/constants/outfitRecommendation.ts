/** Backend outfit analysis (LAN dev server). Même chemin que Swagger : POST /analyze */
export const OUTFIT_ANALYZE_URL = "http://10.12.232.226:8050/analyze";

/** Champ requis par l’API (ex. curl / Swagger). */
export const OUTFIT_ANALYZE_QUESTION_KEY = "all";

/** Délai après reconnaissance de « prêt » / « ready » avant la capture photo. */
export const OUTFIT_AFTER_VOICE_MS = 3000;

/** Durée max d’une tentative d’écoute avant nouveau prompt. */
export const OUTFIT_VOICE_LISTEN_TIMEOUT_MS = 90000;

export const OUTFIT_CAMERA_POLL_MS = 120;
export const OUTFIT_CAMERA_WAIT_MAX_MS = 20000;
