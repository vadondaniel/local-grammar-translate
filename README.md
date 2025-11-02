# Grammar Checker

Local-first grammar and translation workbench that keeps all language processing on your machine. The project combines a React + Vite client with an Express server that streams requests to an Ollama model for fast feedback.

## Features

- Grammar fixer with an inline diff viewer so you can review every change before copying the result.
- Translator mode with auto language detection, configurable punctuation style, and paragraph chunking support.
- Settings dialog that remembers preferred models, tone/strictness, unit, and spelling choices in the browser.
- Express server that can auto-start Ollama, stream incremental responses, and expose health/config endpoints.
- Configurable concurrency, timeouts, and Ollama host/port via environment variables or `server/config.json`.

## Requirements

- Node.js 18+ (latest LTS recommended) and npm
- [Ollama](https://ollama.com/download) installed locally with a chat-capable model (defaults to `gemma3`)

## Setup

```bash
git clone <repository-url>
cd grammar-checker
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

Project-wide options live in `project.config.json`. Use it to change the Express server port, Vite dev server port, and the available Ollama models (each entry has an `id` and human-friendly `name`). Both the server and client read this file on startup, so restart your dev processes after editing it.

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
