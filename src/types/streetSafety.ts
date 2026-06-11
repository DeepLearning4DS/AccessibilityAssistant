export type StreetDangerLevel = "RED" | "YELLOW" | "GREEN";

export type StreetSafetyObject = {
  label: string;
  confidence: number;
  proximity: string | number;
};

export type StreetSafetyAnalyzeResponse = {
  danger_level: StreetDangerLevel;
  alert_fr: string;
  alert_ar: string;
  objects: StreetSafetyObject[];
  processing_time_ms: number;
};
