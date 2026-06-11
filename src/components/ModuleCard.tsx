import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { ModuleDefinition } from "../constants/modules";
import { COLORS, SPACING } from "../constants/theme";

type ModuleCardProps = {
  module: ModuleDefinition;
  shortResponses: boolean;
};

export function ModuleCard({ module, shortResponses }: ModuleCardProps) {
  const lines = shortResponses ? module.mockOutput.slice(0, 1) : module.mockOutput;

  return (
    <View style={styles.card} accessible accessibilityLabel={`${module.title} module`}>
      <Text style={styles.title}>{module.title}</Text>
      <Text style={styles.subtitle}>{module.subtitle}</Text>
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>{module.status}</Text>
        <Text style={styles.metaText}>{module.confidence}</Text>
      </View>
      <View style={styles.list}>
        {lines.map((line) => (
          <Text key={line} style={styles.item}>{`• ${line}`}</Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    backgroundColor: "rgba(9,38,61,0.74)",
    borderWidth: 1,
    borderColor: "rgba(246,244,235,0.3)",
    padding: SPACING.lg,
    gap: SPACING.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
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
  metaRow: {
    marginTop: 6,
    gap: 6,
  },
  metaText: {
    color: COLORS.backgroundLight,
    fontSize: 18,
    opacity: 0.95,
  },
  list: {
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  item: {
    color: COLORS.white,
    fontSize: 21,
    lineHeight: 30,
    fontWeight: "500",
  },
});
