export type ModelOption = {
  id: string;
  name: string;
};

export type ProjectConfig = {
  serverPort: number;
  clientPort: number;
  models: ModelOption[];
  defaultModel: string;
};

declare const __PROJECT_CONFIG__: {
  serverPort?: number;
  clientPort?: number;
  models?: ModelOption[];
} | undefined;

const FALLBACK_MODELS: ModelOption[] = [
  { id: "gemma3", name: "Gemma 3 4B" },
  { id: "deepseek-v3.1:671b-cloud", name: "DeepSeek 671B (Cloud)" },
  { id: "gpt-oss:120b-cloud", name: "GPT-OSS 120B (Cloud)" },
  { id: "llama3.2", name: "Llama 3.2 3B" },
  { id: "llama2-uncensored", name: "Llama 2 7B" },
  { id: "deepseek-llm", name: "DeepSeek 7B" },
  { id: "mistral", name: "Mistral 7B" },
  { id: "thinkverse/towerinstruct:latest", name: "TowerInstruct 7B" },
];

const raw = __PROJECT_CONFIG__ ?? {};

const normalizedModels =
  Array.isArray(raw.models) && raw.models.length > 0
    ? raw.models.map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
      }))
    : FALLBACK_MODELS;

const SERVER_PORT =
  typeof raw.serverPort === "number" && Number.isFinite(raw.serverPort) && raw.serverPort > 0
    ? raw.serverPort
    : 3001;

const CLIENT_PORT =
  typeof raw.clientPort === "number" && Number.isFinite(raw.clientPort) && raw.clientPort > 0
    ? raw.clientPort
    : 5173;

const DEFAULT_MODEL = normalizedModels[0]?.id ?? FALLBACK_MODELS[0].id;

export const PROJECT_CONFIG: ProjectConfig = {
  serverPort: SERVER_PORT,
  clientPort: CLIENT_PORT,
  models: normalizedModels,
  defaultModel: DEFAULT_MODEL,
};

export const MODEL_OPTIONS = PROJECT_CONFIG.models;
export const MODEL_IDS = MODEL_OPTIONS.map((model) => model.id);
export const DEFAULT_MODEL_ID = PROJECT_CONFIG.defaultModel;
export const API_BASE_URL = "/api";

export const isKnownModel = (value: string | null | undefined): value is string =>
  typeof value === "string" && MODEL_IDS.includes(value);

export const normalizeModelId = (value: string | null | undefined): string =>
  isKnownModel(value) ? value : DEFAULT_MODEL_ID;
