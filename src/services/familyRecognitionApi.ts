import { FAMILY_RECOGNIZE_URL } from "../constants/familyRecognition";
import type {
  FamilyRecognizeEvent,
  FamilyRecognizeResponse,
} from "../types/familyRecognition";

function parseEvents(raw: unknown): FamilyRecognizeEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: FamilyRecognizeEvent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const trackId = Number(o.track_id);
    const identity = typeof o.identity === "string" ? o.identity : "";
    const confidence = typeof o.confidence === "number" ? o.confidence : 0;
    const speak = Boolean(o.speak);
    const phrase = typeof o.phrase === "string" ? o.phrase : "";
    const bboxRaw = o.bbox;
    let bbox: [number, number, number, number] = [0, 0, 0, 0];
    if (Array.isArray(bboxRaw) && bboxRaw.length >= 4) {
      bbox = [
        Number(bboxRaw[0]) || 0,
        Number(bboxRaw[1]) || 0,
        Number(bboxRaw[2]) || 0,
        Number(bboxRaw[3]) || 0,
      ];
    }
    if (!Number.isFinite(trackId)) continue;
    out.push({
      track_id: trackId,
      identity,
      confidence,
      speak,
      phrase,
      bbox,
    });
  }
  return out;
}

export function parseFamilyRecognizeResponse(json: unknown): FamilyRecognizeResponse {
  if (!json || typeof json !== "object") {
    return { events: [] };
  }
  const o = json as Record<string, unknown>;
  const events = parseEvents(o.events);
  const annotated =
    typeof o.annotated_image === "string" ? o.annotated_image : undefined;
  return { events, annotated_image: annotated };
}

export async function postFamilyRecognizeImage(
  imageUri: string,
): Promise<FamilyRecognizeResponse> {
  const form = new FormData();
  form.append(
    "file",
    {
      uri: imageUri,
      name: "frame.jpg",
      type: "image/jpeg",
    } as unknown as Blob,
  );

  const response = await fetch(FAMILY_RECOGNIZE_URL, {
    method: "POST",
    body: form,
  });

  const text = await response.text().catch(() => "");

  if (!response.ok) {
    const lower = text.toLowerCase();
    if (
      response.status === 400 &&
      (lower.includes("cannot decode image") || lower.includes("decode image"))
    ) {
      throw new Error(
        "The captured image could not be read by the server. Try again with better lighting.",
      );
    }
    throw new Error(`Family recognition API ${response.status}: ${text.slice(0, 240)}`);
  }

  let bodyJson: unknown = {};
  if (text) {
    try {
      bodyJson = JSON.parse(text) as unknown;
    } catch {
      throw new Error("Family recognition API: invalid JSON response.");
    }
  }

  return parseFamilyRecognizeResponse(bodyJson);
}
