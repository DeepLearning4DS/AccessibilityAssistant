export type EmotionFaceBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type EmotionFace = {
  emotion: string;
  confidence: number;
  box: EmotionFaceBox;
};

export type EmotionDetectResponse = {
  faces: EmotionFace[];
};
