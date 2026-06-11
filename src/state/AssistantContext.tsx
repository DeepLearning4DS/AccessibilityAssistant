import React, {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { MODULES } from "../constants/modules";
import { voiceManager } from "../services/voiceManager";
import { useUserStore, type SupportedLanguage } from "./userStore";

type AssistantContextValue = {
  activeModuleIndex: number;
  shortResponses: boolean;
  isListening: boolean;
  languageSelected: boolean;
  selectedLanguage: SupportedLanguage | null;
  isOnboarded: boolean;
  setListening: (value: boolean) => void;
  toggleShortResponses: () => boolean;
  setActiveModuleByIndex: (index: number) => number;
  goNextModule: () => number;
  goPreviousModule: () => number;
};

const AssistantContext = createContext<AssistantContextValue | null>(null);

export function AssistantProvider({ children }: PropsWithChildren) {
  const [activeModuleIndex, setActiveModuleIndex] = useState(0);
  const [shortResponses, setShortResponses] = useState(false);
  const [isListening, setListening] = useState(false);

  const language = useUserStore((state) => state.profile.language);
  const isOnboarded = useUserStore((state) => state.isOnboarded);

  useEffect(() => {
    if (language) {
      voiceManager.setLanguage(language);
    }
  }, [language]);

  const setActiveModuleByIndex = (index: number) => {
    const safeIndex = ((index % MODULES.length) + MODULES.length) % MODULES.length;
    setActiveModuleIndex(safeIndex);
    return safeIndex;
  };

  const goNextModule = () => setActiveModuleByIndex(activeModuleIndex + 1);
  const goPreviousModule = () => setActiveModuleByIndex(activeModuleIndex - 1);

  const toggleShortResponses = () => {
    const next = !shortResponses;
    setShortResponses(next);
    return next;
  };

  const value = useMemo<AssistantContextValue>(
    () => ({
      activeModuleIndex,
      shortResponses,
      isListening,
      languageSelected: language !== null,
      selectedLanguage: language,
      isOnboarded,
      setListening,
      toggleShortResponses,
      setActiveModuleByIndex,
      goNextModule,
      goPreviousModule,
    }),
    [activeModuleIndex, isListening, language, isOnboarded, shortResponses],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant() {
  const context = useContext(AssistantContext);
  if (!context) {
    throw new Error("useAssistant must be used within AssistantProvider");
  }
  return context;
}
