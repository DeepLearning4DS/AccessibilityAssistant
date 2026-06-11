import React, { forwardRef, useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";

import { COLORS } from "../constants/theme";

export type CameraBackgroundHandle = InstanceType<typeof CameraView>;

export type CameraBackgroundProps = {
  /** Mis à `true` quand la caméra native est prête (`takePictureAsync` fiable). */
  sessionReadyRef?: React.MutableRefObject<boolean>;
  onCameraReady?: () => void;
};

export const CameraBackground = forwardRef<CameraBackgroundHandle, CameraBackgroundProps>(
  function CameraBackground({ sessionReadyRef, onCameraReady }, ref) {
    const [permission, requestPermission] = useCameraPermissions();

    useEffect(() => {
      if (!permission?.granted) {
        requestPermission();
      }
    }, [permission?.granted, requestPermission]);

    useEffect(() => {
      if (!permission?.granted && sessionReadyRef) {
        sessionReadyRef.current = false;
      }
    }, [permission?.granted, sessionReadyRef]);

    if (!permission?.granted) {
      return (
        <View style={[StyleSheet.absoluteFillObject, styles.permissionFallback]}>
          <Text style={styles.permissionText}>Camera access required for live guidance.</Text>
        </View>
      );
    }

    const handleCameraReady = () => {
      if (sessionReadyRef) {
        sessionReadyRef.current = true;
      }
      onCameraReady?.();
    };

    return (
      <View style={StyleSheet.absoluteFillObject}>
        <CameraView
          ref={ref}
          style={StyleSheet.absoluteFillObject}
          facing="back"
          mode="picture"
          onCameraReady={handleCameraReady}
        />
        <LinearGradient
          colors={[
            "rgba(9,38,61,0.82)",
            "rgba(28,70,104,0.66)",
            "rgba(114,6,50,0.5)",
          ]}
          style={StyleSheet.absoluteFillObject}
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  permissionFallback: {
    backgroundColor: COLORS.primaryDark,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  permissionText: {
    color: COLORS.backgroundLight,
    fontSize: 20,
    textAlign: "center",
    fontWeight: "600",
  },
});
