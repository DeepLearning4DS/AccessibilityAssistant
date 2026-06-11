import { DANGER_DETECT_URL } from "../constants/dangerDetection";
import type { DangerDetectResponse } from "../types/dangerDetection";

export async function postDangerDetectFrame(imageUri: string): Promise<DangerDetectResponse> {
  const form = new FormData();
  form.append(
    "file",
    {
      uri: imageUri,
      name: "frame.jpg",
      type: "image/jpeg",
    } as unknown as Blob,
  );

  const response = await fetch(DANGER_DETECT_URL, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Danger API ${response.status}: ${text.slice(0, 240)}`);
  }

  return (await response.json()) as DangerDetectResponse;
}
