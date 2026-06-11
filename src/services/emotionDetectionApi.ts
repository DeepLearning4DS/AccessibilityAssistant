import { EMOTION_DETECT_URL } from "../constants/emotionDetection";
import type { EmotionDetectResponse } from "../types/emotionDetection";

export async function postEmotionDetect(imageBase64: string): Promise<EmotionDetectResponse> {
  const response = await fetch(EMOTION_DETECT_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ image_base64: imageBase64 }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Emotion API ${response.status}: ${text.slice(0, 240)}`);
  }

  return (await response.json()) as EmotionDetectResponse;
}
