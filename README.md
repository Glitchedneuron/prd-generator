# PRD Gen

An AI-powered Product Requirements Document generator that transforms vague business ideas into professional, industry-standard PRDs through an intelligent conversational discovery process. Runs entirely locally using Ollama and Llama.

## Features

- **Conversational Discovery** - An AI business analyst guides you through 7 structured phases (problem & context, users & stakeholders, goals, functional requirements, non-functional requirements, constraints, and scope)
- **Streaming Responses** - Real-time message display as the LLM generates
- **PRD Generation** - Produces an 18-section industry-standard PRD in markdown
- **Export Options** - Copy to clipboard or download as `.md` file
- **Model Selection** - Switch between any locally available Ollama models
- **Local & Private** - All processing happens on your machine via Ollama

## Tech Stack

- **Frontend:** Next.js 16, React 18, TypeScript, Tailwind CSS
- **LLM Runtime:** Ollama (local)
- **Markdown:** react-markdown with GitHub Flavored Markdown support
- **Icons:** lucide-react

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Ollama](https://ollama.ai/)

## Llama Setup

1. **Install Ollama**

   macOS (Homebrew):
   ```bash
   brew install ollama
   ```

   Or download directly from [ollama.ai](https://ollama.ai/).

2. **Start the Ollama server**

   ```bash
   ollama serve
   ```

   This runs the local inference server on `http://localhost:11434`.

3. **Pull a Llama model**

   ```bash
   ollama pull llama3.2
   ```

   Other compatible models you can use:
   ```bash
   ollama pull llama3.1
   ollama pull mistral
   ollama pull neural-chat
   ```

   The app will detect all locally available models and let you pick one from a dropdown.

## Getting Started

1. **Clone the repo**

   ```bash
   git clone <repo-url>
   cd prd-gen
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Make sure Ollama is running** (see [Llama Setup](#llama-setup) above)

4. **Start the dev server**

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. Describe your product idea or business problem in the chat.
2. The AI business analyst will guide you through a structured discovery process, asking focused questions to flesh out requirements.
3. When the discovery feels complete, click **Generate PRD** or tell the assistant you're ready.
4. View the generated PRD in the viewer modal, then **copy** or **download** it as markdown.
5. Click **Reset** at any time to start a new session.

## Project Structure

```
app/
  layout.tsx          # Root layout
  page.tsx            # Home page
  globals.css         # Markdown rendering styles
  api/chat/route.ts   # Ollama API integration (streaming)
components/
  ChatInterface.tsx   # Main chat UI and message management
  PRDViewer.tsx       # PRD viewing/export modal
lib/
  systemPrompt.ts     # AI persona and PRD template
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm start` | Run production build |

## Troubleshooting

- **"Ollama is not running" banner** - Run `ollama serve` in a separate terminal.
- **No models in dropdown** - Pull at least one model: `ollama pull llama3.2`.
- **Slow responses** - Larger models require more RAM/VRAM. Try a smaller model like `llama3.2` (3B params).
