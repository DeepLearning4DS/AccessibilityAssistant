/** Backend prescription / document OCR (LAN). */
export const PRESCRIPTION_READ_URL =
  "http://10.12.232.172:12719/api/medical/prescription/read";

/** Timeout HTTP pour l’OCR (réponse parfois lente). */
export const PRESCRIPTION_READ_TIMEOUT_MS = 120_000;

/** Délai après consigne vocale avant la capture. */
export const TEXT_READER_COUNTDOWN_MS = 3000;

export const TEXT_READER_VOICE_LISTEN_TIMEOUT_MS = 90000;

export const TEXT_READER_CAMERA_POLL_MS = 120;
export const TEXT_READER_CAMERA_WAIT_MAX_MS = 20000;

/** Après TTS avant écoute du mot « yes » / « oui ». */
export const TEXT_READER_POST_TTS_LISTEN_MS = 1100;
