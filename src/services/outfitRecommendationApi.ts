import {
  OUTFIT_ANALYZE_QUESTION_KEY,
  OUTFIT_ANALYZE_URL,
} from "../constants/outfitRecommendation";
import type { OutfitAnalyzeResponse } from "../types/outfitRecommendation";

export async function postOutfitAnalyze(imageUri: string): Promise<OutfitAnalyzeResponse> {
  const form = new FormData();
  form.append(
    "file",
    {
      uri: imageUri,
      name: "outfit.jpg",
      type: "image/jpeg",
    } as unknown as Blob,
  );
  form.append("question_key", OUTFIT_ANALYZE_QUESTION_KEY);
  form.append("user_text", "");

  const response = await fetch(OUTFIT_ANALYZE_URL, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Outfit API ${response.status}: ${text.slice(0, 240)}`);
  }

  return (await response.json()) as OutfitAnalyzeResponse;
}
