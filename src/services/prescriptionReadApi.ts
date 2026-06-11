import { PRESCRIPTION_READ_TIMEOUT_MS, PRESCRIPTION_READ_URL } from "../constants/textReader";
import type { PrescriptionReadResponse } from "../types/textReader";

export function parsePrescriptionReadResponse(json: unknown): PrescriptionReadResponse {
  if (!json || typeof json !== "object") {
    return { extracted_text: "" };
  }
  const o = json as Record<string, unknown>;
  const extracted_text =
    typeof o.extracted_text === "string" ? o.extracted_text : "";
  const detected_lang =
    typeof o.detected_lang === "string" ? o.detected_lang : undefined;
  return { extracted_text, detected_lang };
}

export async function postPrescriptionReadImage(
  imageUri: string,
): Promise<PrescriptionReadResponse> {
  const form = new FormData();
  form.append(
    "file",
    {
      uri: imageUri,
      name: "frame.jpg",
      type: "image/jpeg",
    } as unknown as Blob,
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PRESCRIPTION_READ_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(PRESCRIPTION_READ_URL, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") {
      throw new Error(
        "Le serveur met trop de temps à lire le document. Réessayez ou vérifiez la connexion.",
      );
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }

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
    throw new Error(`Prescription read API ${response.status}: ${text.slice(0, 240)}`);
  }

  let bodyJson: unknown = {};
  if (text) {
    try {
      bodyJson = JSON.parse(text) as unknown;
    } catch {
      throw new Error("Prescription read API: invalid JSON response.");
    }
  }

  return parsePrescriptionReadResponse(bodyJson);
}
