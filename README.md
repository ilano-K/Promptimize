# Promptimize

A local app for finding a prompt that works instead of guessing at one.

You keep a prompt, the inputs you test it on, and an optional judge prompt that scores each output. Run the experiment, read the outputs and scores, edit the prompt, run it again, then compare the two runs. Every run records the setup it used, so a comparison shows exactly what changed between them.

Everything runs on your machine. The only outbound calls go to the model providers you configure.

## Requirements

- Node.js 22 or newer

## Install

```
npm install -g promptimize
promptimize
```

The app starts at http://127.0.0.1:4477 and opens your browser.

| Flag | Purpose |
| --- | --- |
| `--port <number>` | Use a different port (default 4477) |
| `--no-open` | Start without opening the browser |

From a clone:

```
npm install
npm run build
npm start
```

`npm run dev` runs the frontend through Vite (port 5173, proxying `/api`) with the server in watch mode, for working on the code.

## Where your data lives

| | Windows | macOS | Linux |
| --- | --- | --- | --- |
| Config and API keys | `%APPDATA%\promptimize\config.json` | `~/Library/Preferences/promptimize/config.json` | `~/.config/promptimize/config.json` |
| Database | `%LOCALAPPDATA%\promptimize\promptimize.db` | `~/Library/Application Support/promptimize/promptimize.db` | `~/.local/share/promptimize/promptimize.db` |

The database is `promptimize.db`; deleting it starts you clean. The config is `config.json`, created on first start and written with owner-only permissions where the OS supports them. It is kept outside the repo on purpose: it holds your keys in plain text, the same way most local tools do.

## Providers

Add a provider in Settings: choose its kind, add a base URL if the kind needs one, set a key, then list the models you want available. A model id is `<provider-id>/<model>`, and that is what prompts and judges select.

Supported kinds: `anthropic`, `openai`, `google`, `openrouter`, `ollama`, and `openai-compatible` for any OpenAI-style endpoint (Ollama, LM Studio, llama.cpp, 9router).

OpenAI-compatible endpoints are the best-tested path. The others go through the official SDKs and share the same code, but have not been run end to end.

Structured output depends on the model following a JSON schema. A small or heavily quantized model can return malformed JSON; when that happens the run keeps the output and marks the judge step as an error, and you can retry the judge without rerunning the prompt.

## How a run works

Each input goes through the prompt, then the judge. Results are written as they finish, so stopping or crashing loses at most the calls in flight. A run freezes a snapshot of the prompt, inputs, judge, and provider endpoints; editing the library afterward never changes an old run, which is what makes comparison meaningful.

## Optimizing the prompt

The built-in optimizer is deprecated. Optimizing now belongs to an external agent, and MCP support is planned to make that possible.

Once the app exposes its library, runs, and results over MCP, an agent can run the loop itself: read the outputs and scores, rewrite the prompt, start the next run, compare the two. The agent brings the judgement about what to change; Promptimize keeps the history, the snapshots, and the scoring.

## Repo layout

```
server/   Hono + Drizzle/SQLite API
web/      React + Vite frontend
shared/   Zod schemas and API types used by both
```
