import "react-native-gesture-handler";

import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";

import { GlobalGestureLayer } from "../src/gestures/GlobalGestureLayer";
import { audioSession } from "../src/services/audioSession";
import { AssistantProvider } from "../src/state/AssistantContext";

export default function RootLayout() {
  useEffect(() => {
    void audioSession.primePlayback();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AssistantProvider>
        <GlobalGestureLayer>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
        </GlobalGestureLayer>
      </AssistantProvider>
    </GestureHandlerRootView>
  );
}
