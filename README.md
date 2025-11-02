# Local Chapter Grammar Checker and Translator

Local-first grammar and translation workbench that keeps every request on your machine. The project pairs a Vite + React frontend with an Express backend that streams responses from [Ollama](https://ollama.com/) models for quick feedback.

## Overview

- Ships with sensible defaults (`gemma3`) but works with any chat-capable Ollama model, including hosted variants that end with `-cloud`.
- Ollama can run locally (`ollama serve`) or the server can start it automatically; simply add the model ID to `project.config.json`.
- Grammar fixes arrive through an inline diff viewer, while translation mode handles auto language detection, punctuation preferences, and paragraph chunking.

## Features

- Inline diff review before you copy a grammar fix.
- Translator mode with language detection, tone and strictness controls, and customizable punctuation.
- Persistent settings for preferred models, spelling style, and measurement units.
- Express server streaming incremental responses, exposing health/config endpoints, and optionally auto-starting Ollama.
- Configurable host, port, concurrency, and timeouts via environment variables or `server/config.json`.

## Requirements

- Node.js 18+ (latest LTS recommended) and npm
- [Ollama](https://ollama.com/download) with at least one chat-capable model (defaults to `gemma3`)

## Quick Start

### 1. Install dependencies

```bash
git clone https://github.com/vadondaniel/local-grammar-translate
cd local-grammar-translate
npm install --prefix server
npm install --prefix client
```

Prefer a classic workflow? Run `npm install` in each directory instead of using `--prefix`.

### 2. Prepare Ollama

```bash
ollama pull gemma3
```

Swap `gemma3` with any grammar- or translation-friendly model you plan to use.

### 3. Run the dev servers

```bash
# Terminal 1
cd server
node server.js

# Terminal 2
cd client
npm run dev
```

Visit <http://localhost:5173>. Both processes watch for file changes and hot-reload. Press `Ctrl+C` in each terminal to stop them.

## Configuration

### Project-level settings (`project.config.json`)

- Sets the Express server port, Vite dev/preview port, and the model catalog shown in the UI (`id` must match the Ollama identifier; `name` is the label).
- Both server and client read this file during startup; restart your dev processes after editing it.
- The first listed model becomes the default for both Grammar and Translator modes; user choices persist in `localStorage`.

### Server settings (`server/config.json`)

- Controls Ollama connectivity (`OLLAMA_HOST`, `OLLAMA_PORT`, autostart, concurrency, timeouts).
- Appears in the app under **Settings > Server** where you can tweak values live and optionally persist them back to disk.
- Configuration precedence (later entries win):
  1. Built-in defaults
  2. Environment variables (`OLLAMA_HOST`, `OLLAMA_PORT`, `OLLAMA_AUTOSTART`, `OLLAMA_START_TIMEOUT_MS`, `OLLAMA_RUN_TIMEOUT_MS`, `OLLAMA_CONCURRENCY`)
  3. `server/config.json`

Example `server/config.json`:

```json
{
  "OLLAMA_HOST": "127.0.0.1",
  "OLLAMA_PORT": 11434,
  "OLLAMA_AUTOSTART": true,
  "OLLAMA_START_TIMEOUT_MS": 15000,
  "OLLAMA_RUN_TIMEOUT_MS": 120000,
  "OLLAMA_CONCURRENCY": 3
}
```

Set `OLLAMA_AUTOSTART` to `false` if you prefer to run `ollama serve` yourself. The server validates model IDs on each request and falls back to the default if an unknown model is requested.

## Model Selection Tips

- Both modes share the same model list from `project.config.json`; Grammar uses `defaultModel`, Translator uses `translatorDefaultModel`.
- Changes made in Settings update `localStorage` so the app reopens with your last choice. Check **Persist** to push server-side changes (timeouts, ports) back to `server/config.json`.
- Lightweight (~4 GB) models usually handle grammar cleanup; larger models shine when translating long or multiple paragraphs together.
- Explore Ollama's catalog for alternatives: <https://ollama.com/search>. Hosted models ending in `-cloud` require at least a free Ollama account and have usage limits but remove local hardware requirements.

## Using the UI

- Paste text, pick **Grammar Fixer** or **Translator**, and click the action button.
- Translation mode lets you pick source/target languages, punctuation style, and chunking rules.
- The diff viewer shows original vs. revised text; use the copy button to grab results.
- The gear icon opens settings for models, tone/strictness, units, spelling style, and server connectivity.

## Production Build

```bash
npm run build --prefix client
```

Build artifacts land in `client/dist`. Serve them with your preferred host and keep `server/server.js` running behind the same or a proxied origin. Adjust CORS or reverse-proxy rules to suit your deployment target.

## Project Layout

- `client/` - React + Vite frontend (TypeScript)
- `server/` - Express backend plus Ollama integration
- `project.config.json` - Shared ports and model catalog
- `README.md` - Project overview and usage guide

## Next Steps

- Point the server at a different Ollama host/port via `server/config.json` or environment variables.
- Customize default models, tone, and translator preferences through the in-app settings dialog.
- Run `npm run lint --prefix client` before committing to catch TypeScript or JSX issues.
