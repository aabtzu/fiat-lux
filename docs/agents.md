# fiat-lux-agents in Fiat Lux

Fiat Lux uses the [fiat-lux-agents](https://github.com/aabtzu/fiat-lux-agents) package for all AI-powered functionality. The package provides a set of composable agents built on top of the Claude API.

## Package

```bash
pip install git+https://github.com/aabtzu/fiat-lux-agents
```

## How it's used here

The app uses a single agent — **`DocumentBot`** — for all chat and visualization work. It's instantiated per-request (stateless) and called in one of four modes depending on what the user is doing.

### DocumentBot routing logic

```
POST /api/chat/<file_id>
         │
         ├─ mentions "re-read", "original data", etc?  ──► full process path
         │
         ├─ new files just dropped in?  ──────────────────► incorporate path
         │
         ├─ simple chart request + data JSON available?  ──► fast chart path
         │
         └─ existing visualization + chat message?  ──────► refine path
```

### The four paths

| Path | Method | Model | When |
|---|---|---|---|
| **Full process** | `bot.process(text, message)` | Sonnet | No existing viz, or user asks to "start over" / "re-read" |
| **Incorporate** | `bot.refine(html, message + source_data)` | Sonnet | New files dropped onto an existing viz |
| **Refine** | `bot.refine(html, message)` | Sonnet | Follow-up chat on existing viz |
| **Fast chart** | `bot.generate_chart_append(data_json, message)` | Haiku | Simple chart request when structured data is available |

The fast chart path (Haiku) is significantly cheaper and faster — it's used when the message looks like a chart request ("show me a bar chart", "add a pie chart") and the existing visualization has extractable JSON data embedded in it.

### Export to Python

```python
bot.to_python(current_html)
# → {'code': '...', 'message': '...'}
```

Called by `POST /api/export-python/<file_id>` to convert a visualization's HTML into reproducible Python code.

### Style references

Any source file marked as a style reference (`is_style_ref=1` in the DB) is passed to `bot.process()` and `bot.refine()` as `style_refs=`. The bot uses these to guide the visual layout and formatting of new visualizations — useful when duplicating a document and dropping in a fresh dataset.

## Package source

The agents package lives in a separate repo and is pip-installed from GitHub:

- **Repo:** https://github.com/aabtzu/fiat-lux-agents
- **Agents available:** `LLMBase`, `DocumentBot`, `FilterBot`, `FilterEngine`, `ChatBot`, `QueryEngine`, `FilterChatBot`
- **Fiat Lux uses:** `DocumentBot` only (other agents are used in wsu-eiav and odin-data-explorer)

## Persistent instructions

Each file row has an `instructions` column that holds a freeform CLAUDE.md-style block of rules. Before any `DocumentBot` call, `view_routes.chat` sets:

```python
bot = DocumentBot()
bot.instructions = file.get('instructions') or None
```

`LLMBase.call_api` appends the instructions to the system prompt on every call, so every chat turn — `process`, `refine`, `generate_chart_append` — honors the pinned rules without per-method plumbing. Anyone forking this pattern just needs the same one-line assignment after constructing the bot.
