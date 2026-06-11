export type ModuleDefinition = {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  confidence: string;
  mockOutput: string[];
};

export const MODULES: ModuleDefinition[] = [
  {
    id: "obstacle-detection",
    title: "Obstacle Detection",
    subtitle: "Real-time path awareness",
    status: "Scanning nearby objects",
    confidence: "High confidence",
    mockOutput: [
      "Detected object: Chair at 1.8 meters.",
      "Open path on your right side.",
      "Step slowly, floor remains stable.",
    ],
  },
  {
    id: "danger-detection",
    title: "Danger Detection",
    subtitle: "Hazard awareness in the camera view",
    status: "Scanning for hazards",
    confidence: "Live detection",
    mockOutput: [
      "Hazard cues from the current frame.",
      "Top alert summarizes the highest risk.",
      "Danger level updates as the scene changes.",
    ],
  },
  {
    id: "text-reader",
    title: "Text Reader - analysing images",
    subtitle: "Read printed text aloud",
    status: "Reading frame content",
    confidence: "Stable recognition",
    mockOutput: [
      "Detected heading: Main Entrance.",
      "Detected line: Pharmacy open until 8 PM.",
      "Short summary ready in one sentence.",
    ],
  },
  {
    id: "medical-assistant",
    title: "medical assistant",
    subtitle: "Medication and safety reminders",
    status: "Checking health context",
    confidence: "Advisory mode",
    mockOutput: [
      "Reminder: Hydration check recommended now.",
      "Potential medicine conflict not detected.",
      "If symptoms persist, contact a clinician.",
    ],
  },
  {
    id: "family-recognition",
    title: "Family Recognition",
    subtitle: "Trusted contact awareness",
    status: "Comparing known faces",
    confidence: "Recognition ready",
    mockOutput: [
      "Possible match: Mother, confidence 92 percent.",
      "Voice greeting can be sent on request.",
      "No unknown person alert right now.",
    ],
  },
  {
    id: "street-safety",
    title: "Street Safety",
    subtitle: "Urban mobility guidance",
    status: "Monitoring crossing conditions",
    confidence: "Live traffic estimate",
    mockOutput: [
      "Crosswalk signal appears red.",
      "Vehicle movement detected from left lane.",
      "Wait. Safer crossing expected in 6 seconds.",
    ],
  },
  {
    id: "outfit-recommandation",
    title: "outfit recommandation",
    subtitle: "Style and color pairing",
    status: "Analysing clothing combination",
    confidence: "Style confidence medium",
    mockOutput: [
      "Detected navy top with light trousers.",
      "Suggested add-on: neutral jacket.",
      "Overall style: clean and professional.",
    ],
  },
  {
    id: "emotion-detection",
    title: "emotion detection",
    subtitle: "Social emotional cues",
    status: "Interpreting facial expression",
    confidence: "Context sensitive",
    mockOutput: [
      "Person ahead seems calm.",
      "Detected slight smile in conversation.",
      "No stress warning in current frame.",
    ],
  },
];

export const getModuleById = (id: string) => MODULES.find((module) => module.id === id);
