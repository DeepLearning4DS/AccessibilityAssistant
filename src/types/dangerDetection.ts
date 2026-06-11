export type DangerHazard = {
  object: string;
  tracker_id: number;
  zone_h: string;
  zone_v: string;
  proximity: string;
  confidence: number;
  risk_score: number;
  urgency: string;
  alert_text: string;
  /** Profondeur normalisée (0–1) si fournie par l’API. */
  depth_value?: number;
  motion_factor?: number;
  /** Boîte englobante [x1, y1, x2, y2] en pixels. */
  bbox?: number[];
};

export type DangerDetectResponse = {
  hazards: DangerHazard[];
  top_alert: string;
  danger_level: string;
  detection_count: number;
  frame_width: number;
  frame_height: number;
  /** Synthèse textuelle optionnelle (LLM). */
  llm_analysis?: string;
};
