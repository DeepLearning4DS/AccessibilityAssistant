import { STREET_SAFETY_ANALYZE_URL } from "../constants/streetSafety";
import type { StreetSafetyAnalyzeResponse } from "../types/streetSafety";

export async function postStreetSafetyFrame(imageUri: string): Promise<StreetSafetyAnalyzeResponse> {
  const form = new FormData();
  form.append("file", {
    uri: imageUri,
    name: "frame.jpg",
    type: "image/jpeg",
  } as unknown as Blob);

  const response = await fetch(STREET_SAFETY_ANALYZE_URL, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Street safety API ${response.status}: ${text.slice(0, 200)}`);
  }

  return (await response.json()) as StreetSafetyAnalyzeResponse;
}
