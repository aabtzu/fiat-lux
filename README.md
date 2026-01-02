# Fiat Lux

*"Let there be light"* — the motto of UC Berkeley

A visual document summarizer that sheds light on information that's otherwise hard to see.

## What it does

Upload documents (schedules, invoices, healthcare bills, etc.) and get interactive visualizations powered by AI. Refine the visualization through natural conversation until it shows exactly what you need.

## Features

- **Multi-format support** — PDF, Word docs, images, text files
- **AI-powered extraction** — Uses Claude to intelligently parse document content
- **Dynamic visualizations** — No hardcoded templates; each visualization is generated based on your data
- **Conversational refinement** — Chat to adjust colors, layout, emphasis, and more
- **Persistent state** — Visualizations are cached for instant reload
- **Cancellable requests** — Press ESC or click Cancel to interrupt generation

## Getting Started

### Prerequisites

- Node.js 18+
- An Anthropic API key

### Installation

```bash
cd visualizer
npm install
```

### Configuration

Set your Anthropic API key:

```bash
export ANTHROPIC_API_KEY=your-api-key-here
```

### Running

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Usage

1. **Import a file** — Drag and drop or click to upload
2. **View the visualization** — AI generates an initial view based on document type
3. **Refine with chat** — Describe changes you want:
   - "Make it more colorful"
   - "Show as a timeline"
   - "Highlight the totals"
   - "Use a calendar grid layout"
4. **Close sidebar** — Click the arrow to see the full visualization

## Tech Stack

- **Next.js 16** with App Router
- **TypeScript**
- **Tailwind CSS**
- **Claude API** (Anthropic) for document extraction and visualization generation

## Project Structure

```
fiat-lux/
├── data/                    # Imported files and storage
│   ├── imports/            # Uploaded document content
│   └── storage.json        # File metadata and cached visualizations
└── visualizer/             # Next.js application
    └── src/
        ├── app/            # Pages and API routes
        ├── components/     # React components
        └── lib/            # Utilities (storage, parsing, extraction)
```

## License

MIT
