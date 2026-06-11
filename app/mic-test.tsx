import React, { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  addSpeechRecognitionListener,
  ExpoSpeechRecognitionModule,
} from "expo-speech-recognition";

type PermissionState = "unknown" | "granted" | "denied";

export default function MicTestScreen() {
  const [permissionState, setPermissionState] = useState<PermissionState>("unknown");
  const [isListening, setIsListening] = useState(false);
  const [recognizedText, setRecognizedText] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const mountedRef = useRef(true);

  const pushLog = (message: string) => {
    setLogs((prev) => [`${new Date().toLocaleTimeString()} - ${message}`, ...prev].slice(0, 20));
  };

  useEffect(() => {
    mountedRef.current = true;

    const resultSub = addSpeechRecognitionListener("result", (event) => {
      const transcript = event?.results?.[0]?.transcript ?? "";
      if (!mountedRef.current) return;
      setRecognizedText(transcript);
      pushLog(`Result: ${transcript || "(empty)"}`);
      if (event?.isFinal) {
        setIsListening(false);
      }
    });

    const errorSub = addSpeechRecognitionListener("error", (event) => {
      if (!mountedRef.current) return;
      pushLog(`Error: ${event?.error ?? "unknown"} - ${event?.message ?? ""}`);
      setIsListening(false);
    });

    const endSub = addSpeechRecognitionListener("end", () => {
      if (!mountedRef.current) return;
      pushLog("Recognition ended");
      setIsListening(false);
    });

    void requestPermissions();

    return () => {
      mountedRef.current = false;
      resultSub.remove();
      errorSub.remove();
      endSub.remove();
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        // no-op
      }
    };
  }, []);

  const requestPermissions = async () => {
    try {
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      const granted = Boolean(result?.granted);
      setPermissionState(granted ? "granted" : "denied");
      pushLog(granted ? "Microphone + speech permissions granted" : "Permissions denied");
      return granted;
    } catch (error) {
      setPermissionState("denied");
      pushLog(`Permission request failed: ${(error as Error).message}`);
      return false;
    }
  };

  const startRecognition = async () => {
    if (permissionState !== "granted") {
      const granted = await requestPermissions();
      if (!granted) return;
    }

    try {
      setRecognizedText("");
      setIsListening(true);
      pushLog("Starting recognition...");
      ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
      });
    } catch (error) {
      setIsListening(false);
      pushLog(`Start failed: ${(error as Error).message}`);
    }
  };

  const stopRecognition = () => {
    try {
      ExpoSpeechRecognitionModule.stop();
      setIsListening(false);
      pushLog("Stop requested");
    } catch (error) {
      pushLog(`Stop failed: ${(error as Error).message}`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Microphone Test (iOS Dev Client)</Text>
        <Text style={styles.subtitle}>
          Permission: {permissionState} | Listening: {isListening ? "yes" : "no"}
        </Text>

        <View style={styles.actions}>
          <Pressable style={styles.button} onPress={() => void requestPermissions()}>
            <Text style={styles.buttonText}>Request Permission</Text>
          </Pressable>
          <Pressable style={styles.button} onPress={() => void startRecognition()}>
            <Text style={styles.buttonText}>Start Recognition</Text>
          </Pressable>
          <Pressable style={styles.button} onPress={stopRecognition}>
            <Text style={styles.buttonText}>Stop</Text>
          </Pressable>
        </View>

        <Text style={styles.section}>Recognized Text</Text>
        <Text style={styles.output}>{recognizedText || "Say something after pressing Start..."}</Text>

        <Text style={styles.section}>Logs</Text>
        {logs.map((line) => (
          <Text key={line} style={styles.logLine}>
            {line}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0C1A2A" },
  content: { padding: 20, gap: 12 },
  title: { color: "#fff", fontSize: 28, fontWeight: "700" },
  subtitle: { color: "#c8d4e2", fontSize: 16 },
  actions: { gap: 10 },
  button: {
    backgroundColor: "#1C4668",
    borderRadius: 14,
    minHeight: 54,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  section: { color: "#fff", fontSize: 20, fontWeight: "700", marginTop: 10 },
  output: { color: "#F6F4EB", fontSize: 18, lineHeight: 26 },
  logLine: { color: "#b9c7d8", fontSize: 14, lineHeight: 20 },
});
