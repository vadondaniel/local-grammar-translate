import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

type ProjectConfig = {
  serverPort: number;
  clientPort: number;
  models: Array<{ id: string; name: string }>;
};

const projectConfigPath = path.resolve(__dirname, "..", "project.config.json");

const FALLBACK_CONFIG: ProjectConfig = {
  serverPort: 3001,
  clientPort: 5173,
  models: [
    { id: "gemma3", name: "Gemma 3 4B" },
    { id: "deepseek-v3.1:671b-cloud", name: "DeepSeek 671B (Cloud)" },
    { id: "gpt-oss:120b-cloud", name: "GPT-OSS 120B (Cloud)" },
    { id: "llama3.2", name: "Llama 3.2 3B" },
    { id: "llama2-uncensored", name: "Llama 2 7B" },
    { id: "deepseek-llm", name: "DeepSeek 7B" },
    { id: "mistral", name: "Mistral 7B" },
    { id: "thinkverse/towerinstruct:latest", name: "TowerInstruct 7B" },
  ],
};

function readProjectConfig(): ProjectConfig {
  try {
    if (!fs.existsSync(projectConfigPath)) {
      return FALLBACK_CONFIG;
    }
    const raw = fs.readFileSync(projectConfigPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<ProjectConfig>;
    const serverPort = Number(parsed.serverPort);
    const clientPort = Number(parsed.clientPort);
    const models = Array.isArray(parsed.models) && parsed.models.length > 0 ? parsed.models : FALLBACK_CONFIG.models;
    return {
      serverPort: Number.isInteger(serverPort) && serverPort > 0 ? serverPort : FALLBACK_CONFIG.serverPort,
      clientPort: Number.isInteger(clientPort) && clientPort > 0 ? clientPort : FALLBACK_CONFIG.clientPort,
      models,
    };
  } catch {
    return FALLBACK_CONFIG;
  }
}

const projectConfig = readProjectConfig();

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: projectConfig.clientPort,
    proxy: {
      "/api": {
        target: `http://localhost:${projectConfig.serverPort}`,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: projectConfig.clientPort,
  },
  define: {
    __PROJECT_CONFIG__: JSON.stringify(projectConfig),
  },
});
