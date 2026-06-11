import type { SupportedLanguage } from "../state/userStore";

export type LanguageCode = SupportedLanguage;

type OnboardingPhrases = {
  greeting: string;
  askLanguage: string;
  unrecognizedLanguage: string;
  languageConfirmed: string;
  startProfile: string;
  askFirstName: string;
  askLastName: string;
  askAge: string;
  confirmFirstName: (value: string) => string;
  confirmLastName: (value: string) => string;
  confirmAge: (value: number) => string;
  unrecognizedAnswer: string;
  unrecognizedAge: string;
  signInSuccess: (firstName: string) => string;
  demoSkipHint: string;
  demoIntro: string;
  demoStep1: string;
  demoStep2: string;
  demoStep3: string;
  demoStep4: string;
  featuresIntro: string;
  featureObstacle: string;
  featureTextReader: string;
  featureMedical: string;
  featureFamily: string;
  featureStreet: string;
  featureOutfit: string;
  featureEmotion: string;
  demoSkipped: string;
  onboardingComplete: string;
  skipKeyword: string[];
};

const ENGLISH: OnboardingPhrases = {
  greeting: "Welcome to your accessibility assistant.",
  askLanguage: "Please choose your language. You can say English, French, or Arabic.",
  unrecognizedLanguage:
    "I did not catch that. Please say English, French, or Arabic.",
  languageConfirmed: "English selected.",
  startProfile: "Let's create your profile.",
  askFirstName: "What is your first name?",
  askLastName: "What is your last name?",
  askAge: "What is your age?",
  confirmFirstName: (value) => `Thank you ${value}.`,
  confirmLastName: (value) => `Got it. Your last name is ${value}.`,
  confirmAge: (value) => `I have recorded your age as ${value}.`,
  unrecognizedAnswer: "I did not catch that. Could you please repeat?",
  unrecognizedAge: "I did not catch a number. Please tell me your age.",
  signInSuccess: (firstName) => `Sign in successful. Welcome ${firstName}.`,
  demoSkipHint:
    "Say skip if you want to pass the demo. You can also swipe up on the screen at any time.",
  demoIntro: "I will now show you how to use your assistant.",
  demoStep1: "Swipe left or right to change modules.",
  demoStep2: "Double tap to repeat my last message.",
  demoStep3: "Long press to talk with me.",
  demoStep4: "Swipe down to receive shorter responses.",
  featuresIntro: "Here are the features you can use.",
  featureObstacle: "Obstacle detection helps you avoid objects on your path.",
  featureTextReader: "Text reader reads printed text and signs out loud.",
  featureMedical: "Medical assistant gives you medication and safety reminders.",
  featureFamily: "Family recognition tells you when a known person is nearby.",
  featureStreet: "Street safety guides you safely across roads and crossings.",
  featureOutfit: "Outfit recommendation helps you choose matching clothes.",
  featureEmotion: "Emotion detection describes the mood of people around you.",
  demoSkipped: "Demo skipped. You are now ready to use the application.",
  onboardingComplete: "You are now ready to use the application.",
  skipKeyword: [
    "skip",
    "skip it",
    "skip the demo",
    "skip demo",
    "please skip",
    "pass",
    "ignore",
    "stop",
    "stop it",
    "end demo",
    "quit",
    "next",
  ],
};

const FRENCH: OnboardingPhrases = {
  greeting: "Bienvenue sur votre assistant d'accessibilité.",
  askLanguage:
    "Veuillez choisir votre langue. Vous pouvez dire English, Français ou Arabic.",
  unrecognizedLanguage:
    "Je n'ai pas compris. Dites English, Français ou Arabic.",
  languageConfirmed: "Français sélectionné.",
  startProfile: "Créons votre profil.",
  askFirstName: "Quel est votre prénom ?",
  askLastName: "Quel est votre nom de famille ?",
  askAge: "Quel est votre âge ?",
  confirmFirstName: (value) => `Merci ${value}.`,
  confirmLastName: (value) => `Compris. Votre nom de famille est ${value}.`,
  confirmAge: (value) => `J'ai enregistré votre âge à ${value} ans.`,
  unrecognizedAnswer: "Je n'ai pas compris. Pouvez-vous répéter ?",
  unrecognizedAge: "Je n'ai pas entendu de nombre. Dites-moi votre âge.",
  signInSuccess: (firstName) =>
    `Connexion réussie. Bienvenue ${firstName}.`,
  demoSkipHint:
    "Dites skip si vous voulez passer la démonstration. Vous pouvez aussi glisser le doigt vers le haut sur l'écran à tout moment.",
  demoIntro:
    "Je vais maintenant vous montrer comment utiliser votre assistant.",
  demoStep1: "Glissez vers la gauche ou la droite pour changer de module.",
  demoStep2: "Double-tapez pour répéter mon dernier message.",
  demoStep3: "Appui long pour me parler.",
  demoStep4: "Glissez vers le bas pour recevoir des réponses plus courtes.",
  featuresIntro: "Voici les fonctionnalités disponibles.",
  featureObstacle:
    "La détection d'obstacles vous aide à éviter les objets sur votre chemin.",
  featureTextReader:
    "Le lecteur de texte lit à voix haute les textes et panneaux imprimés.",
  featureMedical:
    "L'assistant médical vous rappelle vos médicaments et consignes de sécurité.",
  featureFamily:
    "La reconnaissance familiale vous indique quand un proche est à proximité.",
  featureStreet:
    "La sécurité urbaine vous guide pour traverser les rues en toute sécurité.",
  featureOutfit:
    "La recommandation de tenue vous aide à choisir des vêtements assortis.",
  featureEmotion:
    "La détection d'émotions décrit l'humeur des personnes autour de vous.",
  demoSkipped:
    "Démonstration ignorée. Vous êtes maintenant prêt à utiliser l'application.",
  onboardingComplete: "Vous êtes maintenant prêt à utiliser l'application.",
  skipKeyword: [
    "passer",
    "passer la démo",
    "ignorer",
    "skip",
    "suivant",
    "passe",
    "arrête",
    "arrêter",
    "arrêter la démo",
    "finir",
    "sortir",
    "stop",
  ],
};

const ARABIC: OnboardingPhrases = {
  greeting: "مرحبًا بك في مساعد الوصول الخاص بك.",
  askLanguage:
    "من فضلك اختر لغتك. يمكنك أن تقول English أو Français أو Arabic.",
  unrecognizedLanguage:
    "لم أفهم ذلك. من فضلك قل English أو Français أو Arabic.",
  languageConfirmed: "تم اختيار اللغة العربية.",
  startProfile: "هيا ننشئ ملفك الشخصي.",
  askFirstName: "ما هو اسمك الأول؟",
  askLastName: "ما هو اسم عائلتك؟",
  askAge: "كم عمرك؟",
  confirmFirstName: (value) => `شكرًا لك ${value}.`,
  confirmLastName: (value) => `تم. اسم عائلتك هو ${value}.`,
  confirmAge: (value) => `لقد سجلت عمرك ${value} سنة.`,
  unrecognizedAnswer: "لم أفهم. هل يمكنك التكرار من فضلك؟",
  unrecognizedAge: "لم أسمع رقمًا. من فضلك قل لي عمرك.",
  signInSuccess: (firstName) => `تم تسجيل الدخول بنجاح. مرحبًا ${firstName}.`,
  demoSkipHint:
    "قل skip إن أردت تخطي العرض التوضيحي. يمكنك أيضًا السحب لأعلى على الشاشة في أي وقت.",
  demoIntro: "سأريك الآن كيف تستخدم مساعدك.",
  demoStep1: "اسحب يسارًا أو يمينًا لتغيير الوحدة.",
  demoStep2: "انقر مرتين لإعادة آخر رسالة.",
  demoStep3: "اضغط مطولًا للتحدث معي.",
  demoStep4: "اسحب للأسفل لتلقي ردود أقصر.",
  featuresIntro: "إليك الميزات المتاحة.",
  featureObstacle: "كشف العوائق يساعدك على تفادي الأشياء في طريقك.",
  featureTextReader: "قارئ النصوص يقرأ النصوص واللافتات بصوت عالٍ.",
  featureMedical: "المساعد الطبي يذكرك بأدويتك وتعليمات السلامة.",
  featureFamily: "التعرف على العائلة يخبرك عندما يكون شخص معروف بالقرب منك.",
  featureStreet: "السلامة في الشارع ترشدك لعبور الطرق بأمان.",
  featureOutfit: "اقتراح الملابس يساعدك على اختيار ملابس متناسقة.",
  featureEmotion: "كشف المشاعر يصف مزاج الأشخاص من حولك.",
  demoSkipped: "تم تخطي العرض. أنت الآن جاهز لاستخدام التطبيق.",
  onboardingComplete: "أنت الآن جاهز لاستخدام التطبيق.",
  skipKeyword: ["skip", "تخطي", "تجاوز", "تخط", "تجاهل", "تخطى", "كفى", "stop"],
};

const PHRASES: Record<LanguageCode, OnboardingPhrases> = {
  "en-US": ENGLISH,
  "fr-FR": FRENCH,
  "ar-SA": ARABIC,
};

export const t = (language: LanguageCode | null | undefined): OnboardingPhrases =>
  PHRASES[language ?? "en-US"];

export const detectLanguageFromTranscript = (
  transcript: string,
): LanguageCode | null => {
  const text = transcript.toLowerCase().trim();
  if (!text) return null;
  if (
    text.includes("english") ||
    text.includes("anglais") ||
    text.includes("إنجليزية") ||
    text.includes("الإنجليزية")
  ) {
    return "en-US";
  }
  if (
    text.includes("french") ||
    text.includes("français") ||
    text.includes("francais") ||
    text.includes("franse") ||
    text.includes("الفرنسية")
  ) {
    return "fr-FR";
  }
  if (
    text.includes("arabic") ||
    text.includes("arabe") ||
    text.includes("العربية") ||
    text.includes("عربي")
  ) {
    return "ar-SA";
  }
  return null;
};

/**
 * Détecte l'intention « passer la démo » (STT souvent partiel ou bruité).
 * - « skip » est reconnu dans toutes les langues (mot anglais courant).
 * - Normalisation légère pour ponctuation / espaces.
 */
export const isSkipPhrase = (
  transcript: string,
  language: LanguageCode,
): boolean => {
  const raw = transcript.toLowerCase().trim();
  if (!raw) return false;

  const normalized = raw
    .replace(/[''`´]/g, "'")
    .replace(/[.,!?;:()[\]{}'"«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const ascii = raw.replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim();

  if (/\bskip(s|ping|ped)?\b/i.test(raw) || /\bskip\b/i.test(ascii)) {
    return true;
  }

  const keywords = [...t(language).skipKeyword, "skip", "skip it", "skipping"];
  const seen = new Set<string>();
  for (const kw of keywords) {
    const k = kw.toLowerCase().trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    if (normalized.includes(k) || raw.includes(k)) return true;
  }
  return false;
};

const ARABIC_DIGITS: Record<string, string> = {
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
};

const ENGLISH_NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const FRENCH_NUMBER_WORDS: Record<string, number> = {
  zéro: 0,
  zero: 0,
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  onze: 11,
  douze: 12,
  treize: 13,
  quatorze: 14,
  quinze: 15,
  seize: 16,
  vingt: 20,
  trente: 30,
  quarante: 40,
  cinquante: 50,
  soixante: 60,
  "soixante-dix": 70,
  "quatre-vingts": 80,
  "quatre-vingt-dix": 90,
};

export const parseAge = (
  transcript: string,
  language: LanguageCode,
): number | null => {
  if (!transcript) return null;
  const cleaned = transcript
    .split("")
    .map((c) => ARABIC_DIGITS[c] ?? c)
    .join("")
    .toLowerCase()
    .trim();

  const numericMatch = cleaned.match(/\d{1,3}/);
  if (numericMatch) {
    const value = parseInt(numericMatch[0], 10);
    if (Number.isFinite(value) && value > 0 && value < 130) return value;
  }

  if (language === "en-US") {
    const tokens = cleaned.replace(/[-,.]/g, " ").split(/\s+/).filter(Boolean);
    let total = 0;
    let matched = false;
    for (const token of tokens) {
      const value = ENGLISH_NUMBER_WORDS[token];
      if (value !== undefined) {
        total += value;
        matched = true;
      }
    }
    if (matched && total > 0 && total < 130) return total;
  }

  if (language === "fr-FR") {
    const tokens = cleaned.replace(/[,.]/g, " ").split(/\s+/).filter(Boolean);
    let total = 0;
    let matched = false;
    for (const token of tokens) {
      const value = FRENCH_NUMBER_WORDS[token];
      if (value !== undefined) {
        total += value;
        matched = true;
      }
    }
    if (matched && total > 0 && total < 130) return total;
  }

  return null;
};

export const cleanNameFromTranscript = (transcript: string): string => {
  return transcript
    .trim()
    .replace(/^(my name is|i am|je m'appelle|je suis|اسمي|أنا)\s+/i, "")
    .replace(/[.,!?]/g, "")
    .trim();
};
