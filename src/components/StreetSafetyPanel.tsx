import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import type { ModuleDefinition } from "../constants/modules";
import { COLORS, SPACING } from "../constants/theme";
import { postStreetSafetyFrame } from "../services/streetSafetyApi";
import { voiceManager } from "../services/voiceManager";
import type { SupportedLanguage } from "../state/userStore";
import { useUserStore } from "../state/userStore";
import type { StreetDangerLevel, StreetSafetyAnalyzeResponse } from "../types/streetSafety";

import type { CameraBackgroundHandle } from "./CameraBackground";

const POLL_INTERVAL_MS = 2000;

const DANGER_COLOR: Record<StreetDangerLevel, string> = {
  RED: "#E53935",
  YELLOW: "#FBC02D",
  GREEN: "#2E7D32",
};

function normalizeDanger(raw: unknown): StreetDangerLevel {
  const u = String(raw ?? "").toUpperCase();
  if (u === "RED" || u === "YELLOW" || u === "GREEN") return u;
  return "GREEN";
}

function pickAlertText(data: StreetSafetyAnalyzeResponse, lang: SupportedLanguage | null): string {
  if (lang === "ar-SA") {
    return (data.alert_ar || data.alert_fr || "").trim();
  }
  return (data.alert_fr || data.alert_ar || "").trim();
}

function speechLocale(lang: SupportedLanguage | null): SupportedLanguage {
  return lang ?? "fr-FR";
}

type StreetSafetyPanelProps = {
  cameraRef: React.RefObject<CameraBackgroundHandle | null>;
  module: ModuleDefinition;
  shortResponses: boolean;
};

export function StreetSafetyPanel({ cameraRef, module, shortResponses }: StreetSafetyPanelProps) {
  const language = useUserStore((s) => s.profile.language);
  const [dangerLevel, setDangerLevel] = useState<StreetDangerLevel | null>(null);
  const [lastPayload, setLastPayload] = useState<StreetSafetyAnalyzeResponse | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const previousDangerRef = useRef<StreetDangerLevel | null>(null);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const tick = async () => {
      const cam = cameraRef.current;
      if (!cam || inFlightRef.current) return;
      inFlightRef.current = true;
      setBusy(true);
      try {
        const photo = await cam.takePictureAsync({
          quality: 0.35,
          skipProcessing: true,
        });
        if (!photo?.uri || !mountedRef.current) return;

        const data = await postStreetSafetyFrame(photo.uri);
        if (!mountedRef.current) return;

        const level = normalizeDanger(data.danger_level);
        const normalized = { ...data, danger_level: level };
        setLastPayload(normalized);
        setErrorText(null);

        setDangerLevel(level);

        const alert = pickAlertText(normalized, language);
        const prev = previousDangerRef.current;
        const interrupt = level === "RED";
        const shouldSpeak = level === "RED" || prev === null || level !== prev;

        if (shouldSpeak && alert) {
          await voiceManager.speak(alert, interrupt, speechLocale(language));
        }
        previousDangerRef.current = level;
      } catch (e) {
        if (mountedRef.current) {
          setErrorText((e as Error)?.message ?? "Analysis failed");
        }
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current) setBusy(false);
      }
    };

    void tick();
    const id = setInterval(() => {
      void tick();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [cameraRef, language]);

  const objects = lastPayload?.objects ?? [];
  const shownObjects = shortResponses ? objects.slice(0, 2) : objects;

  return (
    <View style={styles.wrap} accessibilityLabel="Street safety live analysis">
      <Text style={styles.title}>{module.title}</Text>
      <Text style={styles.subtitle}>{module.subtitle}</Text>

      <View style={styles.row}>
        <Text style={styles.dangerLabel}>Danger</Text>
        <View
          style={[
            styles.dangerDot,
            { backgroundColor: dangerLevel ? DANGER_COLOR[dangerLevel] : "rgba(246,244,235,0.25)" },
          ]}
          accessibilityRole="image"
          accessibilityLabel={
            dangerLevel ? `Niveau de danger ${dangerLevel}` : "Niveau de danger inconnu"
          }
        />
        {dangerLevel ? (
          <Text style={[styles.dangerText, { color: DANGER_COLOR[dangerLevel] }]}>{dangerLevel}</Text>
        ) : (
          <Text style={styles.dangerTextMuted}>…</Text>
        )}
        {busy ? <ActivityIndicator color={COLORS.backgroundLight} style={styles.spinner} /> : null}
      </View>

      {lastPayload ? (
        <Text style={styles.meta}>
          {lastPayload.processing_time_ms} ms · {shownObjects.length} object(s)
        </Text>
      ) : null}

      {errorText ? <Text style={styles.error}>{errorText}</Text> : null}

      <Text style={styles.hint}>Analyse automatique toutes les 2 secondes (caméra active).</Text>

      {shownObjects.length > 0 ? (
        <View style={styles.list}>
          {shownObjects.map((obj, i) => (
            <Text key={`${obj.label}-${i}`} style={styles.item}>
              {`• ${obj.label} · ${Math.round(obj.confidence * 100) / 100} · ${String(obj.proximity)}`}
            </Text>
          ))}
        </View>
      ) : lastPayload && !errorText ? (
        <Text style={styles.empty}>Aucun objet détecté sur cette image.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 28,
    backgroundColor: "rgba(9,38,61,0.74)",
    borderWidth: 1,
    borderColor: "rgba(246,244,235,0.3)",
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  title: {
    color: COLORS.backgroundLight,
    fontSize: 30,
    fontWeight: "800",
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 20,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    marginTop: SPACING.sm,
  },
  dangerLabel: {
    color: COLORS.backgroundLight,
    fontSize: 20,
    fontWeight: "700",
  },
  dangerDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "rgba(246,244,235,0.5)",
  },
  dangerText: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 1,
  },
  dangerTextMuted: {
    color: COLORS.textMuted,
    fontSize: 22,
    fontWeight: "600",
  },
  spinner: {
    marginLeft: "auto",
  },
  meta: {
    color: COLORS.textMuted,
    fontSize: 16,
    fontWeight: "500",
  },
  error: {
    color: "#FFAB91",
    fontSize: 17,
    fontWeight: "600",
  },
  hint: {
    color: COLORS.textMuted,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "500",
  },
  list: {
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  item: {
    color: COLORS.white,
    fontSize: 19,
    lineHeight: 28,
    fontWeight: "500",
  },
  empty: {
    color: COLORS.textMuted,
    fontSize: 18,
    fontStyle: "italic",
  },
});
