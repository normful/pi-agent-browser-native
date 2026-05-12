---
name: browser-tool
description: |
  Default browser automation CLI — simple commands for open, click, fill, screenshot, scrape text (via eval). Clean output, no wrapper noise. For diagnostics (Lighthouse, network inspect) → chrome-devtools-cli. For E2E testing with TypeScript or multi-browser → playwright-cli.
---

# agent_browser Tool
Browser automation tool. Commands are JSON arrays (one per line), not bash commands

# Essential Workflow
```json
["open", "url"]
["snapshot", "-i"]
["click", "e5"]
```

## Commands

### Navigation
- `open <url>`, `back`, `forward`, `reload`

### Exploration
| Command | Output | Use |
|---------|--------|-----|
| `snapshot -i` | ~10 lines | **Default** — interactive elements |
| `snapshot -c` | ~15 lines | Read content, no empty elements |
| `snapshot -d N` | varies | Limit depth |
| `snapshot -s "sel"` | varies | Scope to selector |

### Interaction
- `click <ref>`, `fill <ref> <text>`, `type <ref> <text>`
- `press <key>`, `check/uncheck <ref>`
- `scroll up/down/left/right [px]`, `scrollintoview <ref>`

### Extraction
| Command | Example |
|---------|---------|
| `get text <ref\|selector>` | `{"text": "Submit"}` |
| `get box <ref>` | `{height, width, x, y}` |
| `get title\|url` | `"Page Title"` |
| `get value <ref>` | `{"value": "input text"}` |
| `eval <js>` | Extract anything |

> ⚠️ `get attr` unreliable — use `eval "el.getAttribute('href')"`

### State
- `is visible|enabled|checked <ref>` → `true/false`

### Debug
- `console`, `errors`, `highlight <ref>`, `screenshot`

### Settings
- `set viewport <w> <h>`, `set media dark|light`, `set offline on|off`

### Network
- `network requests [--clear]`, `network route <url> --body <json>`, `network unroute [url]`

### Tabs
- `tab new|list|close|select <n>`

### Multi-step
```json
["batch"]
[["open", "url"], ["snapshot", "-i"], ["click", "e3"]]
```
> ⚠️ `batch` sessions start on `about:blank` — step 1 must be `open <url>`.

### Session Modes
| Mode | Behavior |
|------|----------|
| `auto` | Reuses session — **refs go stale** after nav; re-snapshot before interacting. |
| `fresh` | Starts on `about:blank` — must `open <url>` first. |

### Caveats
- `back` can fail with CDP errors if history is thin; `forward` is more stable.
- `tab list` may only show `about:blank` in fresh sessions after `tab new <url>`.

## Common Mistakes
| ❌ Wrong | ✅ Correct |
|---------|-----------|
| `eval "() => code"` | `eval "code"` (no arrow fn) |
| `snapshot` | `snapshot -i` |
| `get attr href e10` | `eval "e10.getAttribute('href')"` |
| `route` | `network route` |
| Stale refs | Run `snapshot -i` after nav |

# Full command reference
```json
["--help"]
```
