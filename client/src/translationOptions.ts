export type TranslatorSourceLanguage = "auto" | "english" | "hungarian" | "japanese";
export type TranslatorTargetLanguage = "english" | "hungarian" | "japanese";
export type TranslatorPunctuationStyle = "unchanged" | "auto" | "simple" | "smart";

export const SOURCE_LANGUAGE_OPTIONS: Array<{ value: TranslatorSourceLanguage; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "japanese", label: "Japanese" },
  { value: "hungarian", label: "Hungarian" },
  { value: "english", label: "English" },
];

export const TARGET_LANGUAGE_OPTIONS: Array<{ value: TranslatorTargetLanguage; label: string }> = [
  { value: "english", label: "English" },
  { value: "hungarian", label: "Hungarian" },
  { value: "japanese", label: "Japanese" },
];

export const TRANSLATOR_PUNCTUATION_OPTIONS: Array<{ value: TranslatorPunctuationStyle; label: string }> = [
  { value: "unchanged", label: "Preserve punctuation" },
  { value: "auto", label: "Auto" },
  { value: "simple", label: "Simple ASCII" },
  { value: "smart", label: "Typographic" },
];

export const DEFAULT_TRANSLATOR_MAX_PARAGRAPHS = 3;
export const DEFAULT_TRANSLATOR_MAX_CHARS = 1500;

export const STORAGE_KEYS = {
  mode: "appMode",
  translatorSource: "translatorSourceLanguage",
  translatorTarget: "translatorTargetLanguage",
  translatorMaxParagraphs: "translatorMaxParagraphs",
  translatorMaxChars: "translatorMaxChars",
  translatorDefaultModel: "translatorDefaultModel",
  translatorPunctuationStyle: "translatorPunctuationStyle",
  translatorPunctuationEnabled: "translatorPunctuationEnabled",
};
