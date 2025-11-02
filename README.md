# Local Chapter Grammar Checker and Translator

Local-first grammar and translation workbench that keeps all language processing on your machine. The project combines a React + Vite client with an Express server that streams requests to an Ollama model for fast feedback.

## Ollama in a Nutshell

[Ollama](https://ollama.com/) runs large-language models locally and exposes a simple HTTP API (`ollama serve`). Once you install it and pull a model (this app defaults to `gemma3`), the server can stream grammar fixes and translations entirely on your machine. If you prefer not to download weights, Ollama also offers hosted models that end with `-cloud`; those require an Ollama account(even free) but spare your hardware from the heavy lifting. Either way, add the model ID to the project configuration and you’re ready to go.

## Features

- Grammar fixer with an inline diff viewer so you can review every change before copying the result.
- Translator mode with auto language detection, configurable punctuation style, and paragraph chunking support.
- Settings dialog that remembers preferred models, tone/strictness, unit, and spelling choices in the browser.
- Express server that can auto-start Ollama, stream incremental responses, and expose health/config endpoints.
- Configurable concurrency, timeouts, and Ollama host/port via environment variables or `server/config.json`.

## Project Configuration

- `project.config.json` in the repo root drives the Express server port, Vite dev/preview port, and the model catalog shown in the UI (`id` must match the Ollama identifier; `name` is the friendly label).
- Both the server and client read it during startup—restart your dev processes after changing the file so they reload the settings.
- The first model in that list becomes the default for Grammar and Translator modes. Users can switch models in the toolbar or Settings modal; choices persist in `localStorage`.

`server/config.json` still controls Ollama connectivity (host, port, autostart, timeouts, concurrency). Those values surface inside the Settings dialog’s **Server** tab, where you can tweak them live and optionally persist back to disk.

## Requirements

- Node.js 18+ (latest LTS recommended) and npm
- [Ollama](https://ollama.com/download) installed locally with a chat-capable model (defaults to `gemma3`)

## Setup

```bash
git clone https://github.com/vadondaniel/local-grammar-translate
cd local-grammar-translate
npm install --prefix server
npm install --prefix client
ollama pull gemma3
```

If you prefer, run `npm install` inside each directory instead of using `--prefix`.

## Running the App

Start the API server from the `server` directory:

```bash
cd server
node server.js
```

In a second terminal, start the React client:

```bash
cd client
npm run dev
```

Visit <http://localhost:5173> to use the app. Both processes watch for file changes and reload automatically. Press `Ctrl+C` in each terminal to stop them.

### Using the UI

- Enter or paste text, choose **Grammar Fixer** or **Translator**, then click the action button.
- Switch to **Translator** to pick source/target languages, punctuation style, and chunking rules.
- The gear icon button opens settings where you can change default models, tone/strictness, units, and spelling. Values persist in `localStorage`.
- The diff viewer displays original and revised text side by side; use the copy button to grab the generated output.

## Configuration

The server builds its configuration in this order (later entries win):

1. Built-in defaults
2. Environment variables (`OLLAMA_HOST`, `OLLAMA_PORT`, `OLLAMA_AUTOSTART`, `OLLAMA_START_TIMEOUT_MS`, `OLLAMA_RUN_TIMEOUT_MS`, `OLLAMA_CONCURRENCY`)
3. `server/config.json`

Example `server/config.json` (one ships with the project):

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

Set `OLLAMA_AUTOSTART` to `false` if you prefer to run `ollama serve` yourself. The server checks connectivity before every request and streams paragraph-level updates back to the client.

### Model Selection Basics

- The model dropdown in the toolbar is populated from `project.config.json`. Grammar and Translator modes share the same list.
- Grammar mode remembers its preferred model under `defaultModel`; Translator mode uses `translatorDefaultModel`. Both are synced to `localStorage` so the app reopens with your last choice.
- The Settings dialog lets you change these defaults (along with tone, strictness, punctuation style, units, etc.). Saving writes the selections locally and, if "Persist" is ticked, pushes server-side changes (timeouts, ports) to `server/config.json`.
- The server always validates incoming model IDs; if a request includes a model that isn't listed, it falls back to the default from `project.config.json`.
- Ollama offers both local models and cloud-hosted ones that end with `-cloud`. Cloud models require an Ollama account, follow the provider’s quotas, and spare your hardware from downloading or running the weights—handy if your machine struggles with larger LLMs.
- For grammar cleanup, lightweight (~4 GB) models are usually enough, but translation—especially with larger paragraph batches—benefits from smarter (and often bigger) models. Experiment using Ollama’s model search to find grammar- or translation-focused options: <https://ollama.com/search>.

## Building for Production

```bash
npm run build --prefix client
```

The build output appears in `client/dist`. Serve those static files with your preferred host and keep `server/server.js` running behind the same or a proxied origin. Adjust CORS or reverse-proxy rules as needed for your deployment target.

## Project Layout

- `client/` - React + Vite front end (TypeScript)
- `server/` - Express backend and Ollama integration
- `project.config.json` - Shared ports and model list used by both halves
- `README.md` - Project overview and usage guide

## Next Steps

- Tweak `server/config.json` or environment variables to point at a different Ollama host/port.
- Customize default models, tone, and translator preferences through the in-app settings dialog.
- Run `npm run lint --prefix client` before committing to catch TypeScript or JSX issues.
