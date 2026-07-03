---
name: browser-tool
description: |
  Default browser automation CLI — simple commands for open, click, fill, screenshot, ingest page text via `read`. Clean output, no wrapper noise. For diagnostics (Lighthouse, network inspect) → chrome-devtools-cli. For E2E testing with TypeScript or multi-browser → playwright-cli.
---

# agent_browser Tool
Browser automation tool. Commands are JSON arrays (one per line), not bash commands

# Essential Workflows

## Information gathering (page contents, not interaction)

```json
["read", "<url>"]
```
Renders JS, handles SPAs, respects cookies/sessions. Replaces `web_fetch`.

## Interaction / testing (click, fill, navigate)

**⚠️ Multi-step requires `--session <session-id>`** on every invocation. Choose your own `session-id`.

```json
["--session", "sess1", "open", "<url>"]
["--session", "sess1", "snapshot", "-i"]
["--session", "sess1", "click", "e5"]
```

**⚠️ The tool never prints or returns its session ID.** `sessionMode=auto` defaults to a session named `"default"` but silently resets to `about:blank` between commands. You must pass `--session <session-id>` **every** multi-step command to maintain state.

One-shot commands (`read <url>`) don't need session ID.

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
- `dblclick <ref>`, `hover <ref>`, `focus <ref>`
- `press <key>`, `check/uncheck <ref>`
- `select <ref> <val...>` — dropdown option
- `drag <src> <dst>` — drag and drop
- `upload <ref> <files...>`, `download <ref> <path>`
- `keyboard type <text>` — real keystrokes (no selector)
- `keyboard inserttext <text>` — insert without key events
- `scroll up/down/left/right [px]`, `scrollintoview <ref>`
- `wait <sel|ms>` — CSS selector or milliseconds (refs NOT supported; use CSS selectors like `h1`, `button.submit`)
- `close [--all]` — close browser (--all closes every session)

### Extraction
> `read <url>` — **canonical command for information gathering.** Renders JS, handles SPAs, respects cookies/sessions. Replaces `web_fetch`. Omit URL to re-read current page.

| Command | Example |
|---------|---------|
| `get text <ref\|selector>` | `{"text": "Submit"}` |
| `get box <ref>` | `{height, width, x, y}` |
| `get title\|url` | `"Page Title"` |
| `get value <ref>` | `{"value": "input text"}` |
| `eval <js>` | Extract anything (only if `read` doesn't suffice) |
| `eval --stdin` | Pipe JS via stdin |

> ⚠️ `get attr` unreliable — use `eval "el.getAttribute('href')"`

**`eval --stdin` (piped JS):**
```json
{"args": ["eval", "--stdin"], "stdin": "document.querySelectorAll('a').length"}
```

### State
- `is visible|enabled|checked <ref>` → `true/false`

### Debug
- `console [--clear]` — view console logs
- `errors [--clear]` — view page errors
- `highlight <ref>` — highlight element
- `inspect` — open Chrome DevTools for active page (returns DevTools URL)
- `clipboard read|write|copy|paste` — works; in headless mode clipboard access may be denied; use headed mode for clipboard ops

### Settings
- `set viewport <w> <h>`, `set device <name>`, `set geo <lat> <lng>`
- `set media dark|light [reduced-motion]`, `set offline [on|off]`
- `set headers <json>`, `set credentials <user> <pass>`

### Network
- `network requests [--clear] [--filter <pattern>]` — inspect requests
- `network route <url> [--abort|--body <json>] [--resource-type <csv>]` — intercept/mock
- `network unroute [url]` — remove route
- `network har <start|stop> [path]` — capture HAR archive

### Tabs
- `tab [new <url>]` — open new tab
- `tab list` — list tabs (`t1`, `t2`, ...)
- `tab close <t1|t2>` — close by tab id (NOT positional int)
- `tab [<n>]` — switch to tab (by position or id)

### Multi-step (`batch`)

⚠️ Each step must be a **JSON-encoded string** (tool's `args` is `string[]`), not a nested array:

```json
["--session", "sess1", "batch", "[\"open\", \"url\"]", "[\"snapshot\", \"-i\"]"]
```

`--bail` stops on first error. Steps always start on `about:blank` — step 1 must be `open <url>`.

### Session Modes
| Mode | `--session <name>`? | Behavior |
|------|---------------------|----------|
| `auto` (default) | No | ❌ Silently opens `about:blank` — tab reuse broken. Session name is `"default"` but not printed. |
| `auto` | Yes | ✅ Reuses session. Refs go stale after nav — re-snapshot. |
| `fresh` | — | Starts on `about:blank` — must `open <url>` first. |

### Find Elements (locator-based)
Use when refs are stale or you want to locate by semantics without a prior snapshot:
```
find <role|text|label|placeholder|alt|title|testid|first|last|nth> <value> <action> [text]
```
| Example | Effect |
|---------|--------|
| `find text "Submit" click` | Click first element containing text |
| `find role button click --name "Next"` | Click button by accessible name |
| `find label "Email" fill "a@b.com"` | Fill input by associated label |
| `find placeholder "Search" type "query"` | Type into placeholder input |
| `find first` / `find last` / `find nth 3` | Position-based targeting |
| `find testid "login-btn" click` | React `data-testid` selectors |

> 📝 `find` performs the `<action>` directly — it does not resolve to a snapshot ref. The `@e…` ref system and `find` are independent locator strategies.

### Mouse
- `mouse move <x> <y>` — move pointer
- `mouse down [btn]`, `mouse up [btn]` — press/release button
- `mouse wheel <dy> [dx]` — scroll wheel

### Screenshot variants
- `screenshot [path]` — capture page screenshot
- `screenshot --full` — full-page screenshot (scrolls to capture everything)
- `screenshot --annotate` — numbered labels + legend for vision models (pass `--annotate` as top-level flag, not inside batch step args)
- `pdf <path>` — save as PDF

### Cookies & Storage
- `cookies get [--filter <pattern>]` — list cookies
- `cookies set <name> <value> [--url <url> --domain <d> --path <p> --httpOnly --secure --sameSite <s> --expires <n>]`
- `cookies set --curl <file>` — import from cookie file (auto-detects JSON/cURL/Netscape)
- `cookies clear` — clear all cookies
- `storage <local|session> [get|set|clear]` — web storage

### Diff
- `diff snapshot` — tree diff current vs last snapshot
- `diff screenshot --baseline <path>` — visual diff against baseline image
- `diff url <u1> <u2>` — compare two pages

### Session & State Persistence
Persist browser sessions across invocations:
- `--profile <name|path>` — Chrome profile for login state
- `--restore [key]` — auto-save/restore cookies + storage
- `--state <path>` — load auth state from JSON file
- `--session <name>` — isolated session namespace
- `--namespace <name>` — isolate daemon sockets

> Pass these as top-level flags or set `AGENT_BROWSER_*` env vars. They are not JSON commands — prepend them before the command in `args`.

### Pipeline commands (passthrough to agent-browser CLI)
These work as JSON commands but are typically used via direct `agent-browser` CLI:
- `session` / `session list` — inspect active sessions
- `auth save|login|list|show|delete` — credential vault
- `plugin add|list|show|run` — plugin management
- `mcp` — start MCP stdio server
- `chat <message>` — AI chat (single-shot, needs AI_GATEWAY_API_KEY)
- `dashboard [start|stop]` — observability dashboard
- `confirm <id>` / `deny <id>` — approve/deny pending actions

### Caveats
- `back` can fail with CDP errors if history is thin; `forward` is more stable.
- `tab list` may only show `about:blank` in fresh sessions after `tab new <url>`.
- `wait` with a ref (`e1`) times out — use CSS selectors (`h1`, `button.submit`) or milliseconds.
- `find role <name>` sometimes fails on simple static pages — `find text` is more reliable for text-matching.
- `clipboard` requires user gesture permission in headless — use `--headed` or skip clipboard in headless.
- `screenshot --annotate` must be passed as top-level flag (`--annotate` before `batch`), not inline in batch steps.
- `session` command works in direct CLI but may not behave as expected when called via this tool wrapper — use `AGENT_BROWSER_SESSION` env var for session management.

## Common Mistakes
| ❌ Wrong | ✅ Correct |
|---------|-----------|
| `eval "() => code"` | `eval "code"` (no arrow fn) |
| `snapshot` | `snapshot -i` |
| `get attr href e10` | `eval "e10.getAttribute('href')"` |
| `route` | `network route` |
| `tab close 1` | `tab close t1` (use tab id, not position) |
| `wait e2` | `wait h1` or `wait 2000` (refs not supported) |
| Stale refs | Re-snapshot after nav, or use `find text|label|role ...` |
| `snapshot -c` to read a URL (info gathering) | `read <url>` |
| `eval "document.body.innerText"` for page text | `read <url>` |
| `web_fetch` tool for page content | `read <url>` via browser tool |
| `auto` without `--session` (expecting tab reuse) | Prepend `--session <name>` to every multi-step command |
| Not knowing the session ID (tool never prints it) | Pass `--session <name>` explicitly; run `agent-browser session` to check |
| `batch` with nested arrays | Use JSON-encoded strings: `"[\"open\", \"url\"]"` |

# Full command reference
```json
["--help"]
```
