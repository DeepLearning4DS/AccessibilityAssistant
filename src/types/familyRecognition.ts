export type FamilyRecognizeEvent = {
  track_id: number;
  identity: string;
  confidence: number;
  speak: boolean;
  phrase: string;
  bbox: [number, number, number, number];
};

export type FamilyRecognizeResponse = {
  events: FamilyRecognizeEvent[];
  annotated_image?: string;
};
