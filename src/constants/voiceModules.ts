/** Modules avec flux vocal propre (pas d’annonce « activated » globale). */
export const VOICE_FLOW_MODULE_IDS = new Set([
  "danger-detection",
  "emotion-detection",
  "family-recognition",
  "outfit-recommandation",
  "street-safety",
  "text-reader",
]);

export function moduleHasVoiceFlow(moduleId: string): boolean {
  return VOICE_FLOW_MODULE_IDS.has(moduleId);
}
