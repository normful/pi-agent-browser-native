/**
 * Purpose: Verify command parsing, envelope parsing, tab-correction selection, and error-text rendering helpers.
 * Responsibilities: Assert stable result facade behavior for valid envelopes, malformed output, fallback failures, command extraction, and tab list presentation.
 * Scope: Unit-style Node test-runner coverage for result/runtime helpers; richer presentation formatting lives in `agent-browser.presentation.test.ts`.
 * Usage: Run with `npm test -- test/agent-browser.results.test.ts` or via `npm run verify`.
 * Invariants/Assumptions: Tests avoid real subprocesses and use deterministic fixture payloads.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
	buildToolPresentation,
	getAgentBrowserErrorText,
	parseAgentBrowserEnvelope,
} from "../extensions/agent-browser/lib/results.js";
import {
	chooseOpenResultTabCorrection,
	extractCommandTokens,
	parseCommandInfo
} from "../extensions/agent-browser/lib/runtime.js";

const MISSING_SUCCESS_PARSE_ERROR = "agent-browser returned an invalid JSON envelope: missing boolean success field.";
const NON_BOOLEAN_SUCCESS_PARSE_ERROR = "agent-browser returned an invalid JSON envelope: success field must be boolean.";

test("parseCommandInfo skips global flags with values", () => {
	const commandInfo = parseCommandInfo(["--session", "named", "--profile", "./profile", "tab", "list"]);
	assert.deepEqual(commandInfo, { command: "tab", subcommand: "list" });
});

test("parseCommandInfo treats compatibility and launch flag values as non-command tokens", () => {
	const commandInfo = parseCommandInfo([
		"--user-agent",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
		"--args",
		"--disable-gpu,--lang=en-US",
		"open",
		"https://example.com",
	]);
	assert.deepEqual(commandInfo, { command: "open", subcommand: "https://example.com" });
});

test("extractCommandTokens strips wrapper-level global flags and keeps the command tail intact", () => {
	assert.deepEqual(extractCommandTokens(["--session", "named", "snapshot", "-i"]), ["snapshot", "-i"]);
	assert.deepEqual(
		extractCommandTokens([
			"--session",
			"named",
			"--user-agent",
			"Mozilla/5.0",
			"click",
			"@e9",
		]),
		["click", "@e9"],
	);
});

test("chooseOpenResultTabCorrection targets the navigated tab without disturbing already-correct active tabs", () => {
	assert.deepEqual(
		chooseOpenResultTabCorrection({
			tabs: [
				{ active: false, tabId: "t1", title: "Example Domain", url: "https://example.com/" },
				{ active: true, tabId: "t2", title: "Grok", url: "https://grok.com/" },
			],
			targetTitle: "Example Domain",
			targetUrl: "https://example.com",
		}),
		{ selectedTab: "t1", selectionKind: "tabId", targetTitle: "Example Domain", targetUrl: "https://example.com/" },
	);
	assert.deepEqual(
		chooseOpenResultTabCorrection({
			tabs: [
				{ active: true, tabId: "blank", title: "", url: "about:blank" },
				{ active: false, tabId: "app", title: "Example Domain", url: "https://example.com/" },
			],
			targetTitle: "Example Domain",
			targetUrl: "https://example.com/",
		}),
		{ selectedTab: "app", selectionKind: "tabId", targetTitle: "Example Domain", targetUrl: "https://example.com/" },
	);
	assert.equal(
		chooseOpenResultTabCorrection({
			tabs: [{ active: true, tabId: "t1", title: "Example Domain", url: "https://example.com/" }],
			targetTitle: "Example Domain",
			targetUrl: "https://example.com/",
		}),
		undefined,
	);
});

test("buildToolPresentation renders stable tab ids from tab list output", async () => {
	const presentation = await buildToolPresentation({
		commandInfo: { command: "tab", subcommand: "list" },
		cwd: process.cwd(),
		envelope: {
			success: true,
			data: {
				tabs: [
					{ active: false, tabId: "t1", title: "ChatGPT", url: "https://chatgpt.com/" },
					{ active: true, tabId: "t2", title: "Grok", url: "https://grok.com/" },
				],
			},
		},
	});

	assert.equal(presentation.content[0]?.type, "text");
	assert.match((presentation.content[0] as { text: string }).text, /- \[t1\] ChatGPT — https:\/\/chatgpt\.com\//);
	assert.match((presentation.content[0] as { text: string }).text, /\* \[t2\] Grok — https:\/\/grok\.com\//);
	assert.equal(presentation.summary, "Tabs: 2");
});

test("parseAgentBrowserEnvelope reports invalid JSON clearly", async () => {
	const parsed = await parseAgentBrowserEnvelope("not-json");
	assert.match(parsed.parseError ?? "", /invalid JSON/i);
});

test("parseAgentBrowserEnvelope accepts batch JSON arrays", async () => {
	const parsed = await parseAgentBrowserEnvelope(
		JSON.stringify([
			{ command: ["open", "https://developer.mozilla.org"], success: true, result: { title: "MDN Web Docs" } },
			{ command: ["get", "title"], success: true, result: { title: "MDN Web Docs" } },
		]),
	);

	assert.equal(parsed.parseError, undefined);
	assert.equal(Array.isArray(parsed.envelope?.data), true);
	assert.equal(parsed.envelope?.success, true);
});

test("parseAgentBrowserEnvelope rejects object envelopes without boolean success", async () => {
	const parsed = await parseAgentBrowserEnvelope(JSON.stringify({ error: "boom" }));

	assert.equal(parsed.envelope, undefined);
	assert.equal(parsed.parseError, MISSING_SUCCESS_PARSE_ERROR);
});

test("parseAgentBrowserEnvelope rejects object envelopes with non-boolean success", async () => {
	const parsed = await parseAgentBrowserEnvelope(JSON.stringify({ success: "true", data: { title: "ok" } }));

	assert.equal(parsed.envelope, undefined);
	assert.equal(parsed.parseError, NON_BOOLEAN_SUCCESS_PARSE_ERROR);
});

test("parseAgentBrowserEnvelope accepts valid object envelopes with boolean success", async () => {
	const parsed = await parseAgentBrowserEnvelope(JSON.stringify({ success: true, data: { title: "ok" } }));

	assert.equal(parsed.parseError, undefined);
	assert.equal(parsed.envelope?.success, true);
});

test("getAgentBrowserErrorText explains wrapper watchdog timeouts", () => {
	const errorText = getAgentBrowserErrorText({
		aborted: false,
		exitCode: 124,
		plainTextInspection: false,
		stderr: "",
		timedOut: true,
		timeoutMs: 28000,
	});

	assert.match(errorText ?? "", /28000ms wrapper watchdog/);
	assert.match(errorText ?? "", /30s IPC retry path/);
});

test("getAgentBrowserErrorText explains upstream IPC read timeouts", () => {
	for (const upstreamError of [
		"Failed to read: Resource temporarily unavailable (os error 35) (after 5 retries - daemon may be busy or unresponsive)",
		"Failed to read: Resource temporarily unavailable (os error 11) (after 5 retries - daemon may be busy or unresponsive)",
	]) {
		const errorText = getAgentBrowserErrorText({
			aborted: false,
			envelope: {
				success: false,
				error: upstreamError,
			},
			exitCode: 1,
			plainTextInspection: false,
			stderr: "",
		});

		assert.match(errorText ?? "", /30s IPC read timeout/);
		assert.match(errorText ?? "", /daemon may still be alive/);
	}
});

test("getAgentBrowserErrorText prefers envelope errors over generic exit codes", () => {
	const errorText = getAgentBrowserErrorText({
		aborted: false,
		envelope: { success: false, error: "Navigation failed: net::ERR_BLOCKED_BY_CLIENT" },
		exitCode: 1,
		plainTextInspection: false,
		stderr: "",
	});

	assert.equal(errorText, "Navigation failed: net::ERR_BLOCKED_BY_CLIENT");
});

test("getAgentBrowserErrorText adds stale-ref recovery guidance for failed @refs", () => {
	const errorText = getAgentBrowserErrorText({
		aborted: false,
		effectiveArgs: ["--json", "--session", "named", "get", "text", "@e4"],
		envelope: { success: false, error: "Could not locate element with role=heading name=Old page" },
		exitCode: 1,
		plainTextInspection: false,
		stderr: "",
	});

	assert.match(errorText ?? "", /Could not locate element/);
	assert.match(errorText ?? "", /@ref may be stale/);
	assert.match(errorText ?? "", /snapshot/);
});

test("getAgentBrowserErrorText extracts nested envelope error messages", () => {
	const errorText = getAgentBrowserErrorText({
		aborted: false,
		envelope: { success: false, error: { details: { message: "Profile directory is locked" } } },
		exitCode: 1,
		plainTextInspection: false,
		stderr: "",
	});

	assert.equal(errorText, "Profile directory is locked");
});

test("getAgentBrowserErrorText falls back to stderr or an invocation-aware message when a failed envelope has no simple error field", () => {
	const stderrFallback = getAgentBrowserErrorText({
		aborted: false,
		command: "open",
		effectiveArgs: ["--json", "open", "https://example.com"],
		envelope: { success: false, data: { title: "Wrong page" } },
		exitCode: 1,
		plainTextInspection: false,
		stderr: "Navigation failed upstream",
	});
	const invocationFallback = getAgentBrowserErrorText({
		aborted: false,
		command: "open",
		effectiveArgs: ["--json", "open", "https://example.com"],
		envelope: { success: false, data: { title: "Wrong page" } },
		exitCode: 1,
		plainTextInspection: false,
		stderr: "",
	});

	assert.equal(stderrFallback, "Navigation failed upstream");
	assert.equal(invocationFallback, "agent-browser --json open https://example.com reported failure (exit code 1).");
});

test("getAgentBrowserErrorText falls back to command-aware exit codes when no envelope error exists", () => {
	const errorText = getAgentBrowserErrorText({
		aborted: false,
		command: "snapshot",
		envelope: { success: true, data: null },
		exitCode: 1,
		plainTextInspection: false,
		stderr: "",
	});

	assert.equal(errorText, "agent-browser snapshot exited with code 1.");
});

test("getAgentBrowserErrorText appends wrapper recovery hints only to fallback messages", () => {
	const wrapperRecoveryHint = "Wrapper recovery hint: inspect details.effectiveArgs and run tab list before retrying.";
	const fallbackErrorText = getAgentBrowserErrorText({
		aborted: false,
		command: "batch",
		effectiveArgs: ["--json", "--session", "named", "batch"],
		envelope: { success: false, data: { title: "Wrong page" } },
		exitCode: 1,
		plainTextInspection: false,
		stderr: "",
		wrapperRecoveryHint,
	});
	const explicitErrorText = getAgentBrowserErrorText({
		aborted: false,
		command: "batch",
		effectiveArgs: ["--json", "--session", "named", "batch"],
		envelope: { success: false, error: "Upstream failure" },
		exitCode: 1,
		plainTextInspection: false,
		stderr: "",
		wrapperRecoveryHint,
	});

	assert.equal(
		fallbackErrorText,
		"agent-browser --json --session named batch reported failure (exit code 1).\nWrapper recovery hint: inspect details.effectiveArgs and run tab list before retrying.",
	);
	assert.equal(explicitErrorText, "Upstream failure");
});

test("getAgentBrowserErrorText defers mixed batch failures to batch rendering", () => {
	const errorText = getAgentBrowserErrorText({
		aborted: false,
		envelope: {
			success: false,
			data: [
				{ command: ["open", "https://example.com"], result: { title: "Example Domain" }, success: true },
				{ command: ["click", "@zzz"], error: "Unknown ref: zzz", success: false },
			],
		},
		exitCode: 1,
		plainTextInspection: false,
		stderr: "",
	});

	assert.equal(errorText, undefined);
});

test("getAgentBrowserErrorText prefers spill/write failures over downstream parse errors", () => {
	const errorText = getAgentBrowserErrorText({
		aborted: false,
		exitCode: 0,
		parseError: "agent-browser returned invalid JSON: Unexpected end of JSON input",
		plainTextInspection: false,
		spawnError: new Error("pi-agent-browser temp spill budget exceeded"),
		stderr: "",
	});

	assert.equal(errorText, "pi-agent-browser temp spill budget exceeded");
});


test("buildToolPresentation summarizes accessibility audits and their violations", async () => {
	const presentation = await buildToolPresentation({
		commandInfo: { command: "a11y", subcommand: undefined },
		cwd: process.cwd(),
		envelope: {
			success: true,
			data: {
				axeVersion: "4.12.1",
				counts: { inapplicable: 76, incomplete: 0, passes: 10, violations: 2 },
				incomplete: [],
				url: "http://127.0.0.1:54123/",
				violations: [
					{
						help: "Elements must meet minimum color contrast ratio thresholds",
						helpUrl: "https://dequeuniversity.com/rules/axe/4.12/color-contrast?application=axeAPI",
						id: "color-contrast",
						impact: "serious",
						nodeCount: 1,
						nodes: [{ html: "<span>low contrast</span>", target: ["span"] }],
					},
					{
						help: "Images must have alternative text",
						helpUrl: "https://dequeuniversity.com/rules/axe/4.12/image-alt?application=axeAPI",
						id: "image-alt",
						impact: "critical",
						nodeCount: 4,
						nodes: [{ html: "<img>", target: ["#wrap > img"] }],
					},
				],
			},
		},
	});

	assert.equal(presentation.summary, "A11y: 2 violations (axe 4.12.1)");
	const text = (presentation.content[0] as { text: string }).text;
	assert.match(text, /axe-core 4\.12\.1 — violations: 2, incomplete: 0, passes: 10/);
	assert.match(text, /\[serious\] color-contrast: Elements must meet minimum color contrast ratio thresholds \(1 node\)/);
	assert.match(text, /  - span/);
	assert.match(text, /\[critical\] image-alt: Images must have alternative text \(4 nodes\)/);
	assert.match(text, /  - \(\+3 more\)/);
});

test("buildToolPresentation reports a clean accessibility audit", async () => {
	const presentation = await buildToolPresentation({
		commandInfo: { command: "a11y", subcommand: undefined },
		cwd: process.cwd(),
		envelope: {
			success: true,
			data: {
				axeVersion: "4.12.1",
				counts: { inapplicable: 76, incomplete: 0, passes: 30, violations: 0 },
				incomplete: [],
				url: "https://example.com/",
				violations: [],
			},
		},
	});

	assert.equal(presentation.summary, "A11y: no violations (axe 4.12.1)");
	assert.match((presentation.content[0] as { text: string }).text, /No accessibility violations reported\./);
});

test("buildToolPresentation summarizes WebMCP tool listings and invocations", async () => {
	const listing = await buildToolPresentation({
		commandInfo: { command: "webmcp", subcommand: "list" },
		cwd: process.cwd(),
		envelope: {
			success: true,
			data: {
				experimental: true,
				tools: [
					{
						annotations: {},
						description: "Probe tool for shape capture",
						frameId: "CF466E51B14139A427B6A15B05B401F5",
						inputSchema: { properties: { q: { type: "string" } }, type: "object" },
						name: "probe_tool",
						origin: "http://127.0.0.1:54123",
					},
				],
				untrusted: true,
			},
		},
	});
	assert.equal(listing.summary, "WebMCP tools: 1");
	const listingText = (listing.content[0] as { text: string }).text;
	assert.match(listingText, /page-provided and untrusted/);
	assert.match(listingText, /- probe_tool — Probe tool for shape capture \(http:\/\/127\.0\.0\.1:54123/);

	const empty = await buildToolPresentation({
		commandInfo: { command: "webmcp", subcommand: "list" },
		cwd: process.cwd(),
		envelope: { success: true, data: { experimental: true, tools: [], untrusted: true } },
	});
	assert.equal(empty.summary, "WebMCP tools: none");
	assert.match((empty.content[0] as { text: string }).text, /No page tools exposed\./);

	const invocation = await buildToolPresentation({
		commandInfo: { command: "webmcp", subcommand: "invoke" },
		cwd: process.cwd(),
		envelope: {
			success: true,
			data: {
				durationMs: 13,
				frameId: "CF466E51B14139A427B6A15B05B401F5",
				invocationId: "46273001644B85B59F96BB5F9D012739",
				origin: "http://127.0.0.1:54123",
				output: { content: [{ text: 'echo:{"q":"hi"}', type: "text" }] },
				rawStatus: "Completed",
				status: "completed",
				toolName: "probe_tool",
			},
		},
	});
	assert.equal(invocation.summary, "WebMCP probe_tool: completed");
	const invocationText = (invocation.content[0] as { text: string }).text;
	assert.match(invocationText, /Tool: probe_tool/);
	assert.match(invocationText, /Status: completed/);
	assert.match(invocationText, /Duration: 13 ms/);
	assert.match(invocationText, /echo:\{"q":"hi"\}/);

	const pending = await buildToolPresentation({
		commandInfo: { command: "webmcp", subcommand: "invoke" },
		cwd: process.cwd(),
		envelope: {
			success: true,
			data: {
				durationMs: 0,
				frameId: "CF466E51B14139A427B6A15B05B401F5",
				invocationId: "2735BB7784D36CCB4B80A823D4BAE79F",
				status: "pending",
				toolName: "probe_tool",
			},
		},
	});
	assert.equal(pending.summary, "WebMCP probe_tool: pending");
	assert.match((pending.content[0] as { text: string }).text, /Invocation: 2735BB7784D36CCB4B80A823D4BAE79F/);
});

test("buildToolPresentation summarizes recording lifecycle and unchanged conditional screenshots", async () => {
	const started = await buildToolPresentation({
		commandInfo: { command: "record", subcommand: "start" },
		cwd: process.cwd(),
		envelope: {
			success: true,
			data: { contactSheet: false, cursor: false, fps: 10, path: "/tmp/run.webm", started: true },
		},
	});
	assert.match(started.summary, /Recording started; output will be written on stop: \/tmp\/run\.webm/);
	const startedText = (started.content[0] as { text: string }).text;
	assert.match(startedText, /Requested path: \/tmp\/run\.webm/);
	assert.match(startedText, /FPS: 10/);
	assert.match(startedText, /Cursor: false/);

	const stopped = await buildToolPresentation({
		commandInfo: { command: "record", subcommand: "stop" },
		cwd: process.cwd(),
		envelope: {
			success: true,
			data: { capturedFrames: 1, fps: 10, frames: 2, path: "/tmp/run.webm" },
		},
	});
	assert.match(stopped.summary, /Saved recording: \/tmp\/run\.webm/);
	const stoppedText = (stopped.content[0] as { text: string }).text;
	assert.match(stoppedText, /Frames: 2/);
	assert.match(stoppedText, /Captured frames: 1/);
	assert.match(stoppedText, /FPS: 10/);

	const unchanged = await buildToolPresentation({
		commandInfo: { command: "screenshot", subcommand: "--if-changed" },
		cwd: process.cwd(),
		envelope: {
			success: true,
			data: { changed: false, pixelChangeRatio: 0, revision: 2, threshold: 0 },
		},
	});
	assert.equal(unchanged.summary, "Screenshot unchanged (revision 2)");
	const unchangedText = (unchanged.content[0] as { text: string }).text;
	assert.match(unchangedText, /Changed: false/);
	assert.match(unchangedText, /Pixel change: 0%/);
	assert.equal(unchanged.imagePath, undefined);
});

test("buildToolPresentation reports an unchanged conditional screenshot instead of claiming a fresh save", async () => {
	const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");
	const tempDir = await mkdtemp(join(tmpdir(), "pi-agent-browser-shot-"));
	const imagePath = join(tempDir, "page.png");
	await writeFile(imagePath, "baseline-bytes", "utf8");
	try {
		const withoutPath = await buildToolPresentation({
			commandInfo: { command: "screenshot", subcommand: "--if-changed" },
			cwd: tempDir,
			envelope: { success: true, data: { changed: false, pixelChangeRatio: 0, revision: 2, threshold: 0.0025 } },
		});
		assert.equal(withoutPath.summary, "Screenshot unchanged (revision 2)");
		const withoutPathText = (withoutPath.content[0] as { text: string }).text;
		assert.match(withoutPathText, /Changed: false/);
		assert.match(withoutPathText, /Threshold: 0\.25%/);

		// Some upstream results keep the requested path even when nothing was rewritten.
		const withPath = await buildToolPresentation({
			artifactRequest: { absolutePath: imagePath, path: imagePath, status: "saved" },
			commandInfo: { command: "screenshot", subcommand: "--if-changed" },
			cwd: tempDir,
			envelope: {
				success: true,
				data: { changed: false, path: imagePath, pixelChangeRatio: 0, revision: 2, threshold: 0 },
			},
		});
		assert.equal(withPath.summary, "Screenshot unchanged (revision 2)");
		const withPathText = (withPath.content[0] as { text: string }).text;
		assert.match(withPathText, /Image unchanged \(previous capture kept\): /);
		assert.match(withPathText, /Requested path:/);
		assert.match(withPathText, /Changed: false/);
		assert.doesNotMatch(withPathText, /Saved image/);
		assert.doesNotMatch(withPath.summary, /Saved image/);
	} finally {
		await rm(tempDir, { force: true, recursive: true });
	}
});
