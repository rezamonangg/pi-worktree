import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { worktreeCompactFooterText, worktreeFooterText } from "./footer.js";
import type { WorktreeState } from "./state.js";

function stripAnsi(text: string | undefined): string {
  return (text ?? "").replace(/\x1b\[[0-9;]*m/g, "");
}

test("active footer omits duplicate branch when path already contains branch", () => {
  const repoRoot = "/repo";
  const state: WorktreeState = {
    mode: "active",
    repoRoot,
    worktreeRoot: join(repoRoot, ".worktree", "docs", "scraper-service-context"),
    branch: "docs/scraper-service-context",
    originalCwd: repoRoot,
  };

  assert.equal(stripAnsi(worktreeFooterText(state)), "⧉ .worktree/docs/scraper-service-context");
});

test("active footer keeps branch when path does not contain branch", () => {
  const repoRoot = "/repo";
  const state: WorktreeState = {
    mode: "active",
    repoRoot,
    worktreeRoot: join(repoRoot, ".worktree", "custom-location"),
    branch: "feat/demo",
    originalCwd: repoRoot,
  };

  assert.equal(stripAnsi(worktreeFooterText(state)), "⧉ .worktree/custom-location | ⎇ feat/demo");
});

test("compact footer includes worktree branch dir model thinking context cache", () => {
  const repoRoot = "/repo/my-pi";
  const state: WorktreeState = {
    mode: "inactive",
    repoRoot,
    branch: "main",
    originalCwd: repoRoot,
  };
  const ctx = {
    cwd: repoRoot,
    model: { name: "GPT-5.5", contextWindow: 272000 },
    getContextUsage: () => ({ percent: 29.5, contextWindow: 272000, tokens: 80240 }),
    settingsManager: { getCompactionSettings: () => ({ enabled: true }) },
    sessionManager: {
      getEntries: () => [
        { type: "message", message: { role: "assistant", usage: { input: 200000, cacheRead: 3000000, cacheWrite: 0 } } },
      ],
    },
    modelRegistry: { isUsingOAuth: () => true },
  };

  assert.equal(
    stripAnsi(worktreeCompactFooterText(ctx, state, { thinkingLevel: "high", gitBranch: "main" })),
    "⧉ main-worktree @ ⎇ main | my-pi | GPT-5.5 think:high | ctx 29.5%/272k AC | cache 3.0M CH93.8%",
  );
});

test("compact footer cache hit rate reflects latest assistant usage", () => {
  const repoRoot = "/repo/my-pi";
  const state: WorktreeState = {
    mode: "inactive",
    repoRoot,
    branch: "main",
    originalCwd: repoRoot,
  };
  // Two assistant turns: first 50% hit rate, second 80%. Latest wins.
  const ctx = {
    cwd: repoRoot,
    model: { name: "GPT-5.5", contextWindow: 272000 },
    getContextUsage: () => ({ percent: 29.5, contextWindow: 272000, tokens: 80240 }),
    settingsManager: { getCompactionSettings: () => ({ enabled: true }) },
    sessionManager: {
      getEntries: () => [
        { type: "message", message: { role: "assistant", usage: { input: 500, cacheRead: 500, cacheWrite: 0 } } },
        { type: "message", message: { role: "assistant", usage: { input: 200, cacheRead: 800, cacheWrite: 0 } } },
      ],
    },
    modelRegistry: { isUsingOAuth: () => true },
  };

  assert.equal(
    stripAnsi(worktreeCompactFooterText(ctx, state, { thinkingLevel: "high", gitBranch: "main" })),
    "⧉ main-worktree @ ⎇ main | my-pi | GPT-5.5 think:high | ctx 29.5%/272k AC | cache 1.3k CH80.0%",
  );
});

test("compact footer omits CH when latest assistant usage has no cache activity", () => {
  const repoRoot = "/repo/my-pi";
  const state: WorktreeState = {
    mode: "inactive",
    repoRoot,
    branch: "main",
    originalCwd: repoRoot,
  };
  // cacheRead>0 on an earlier turn but the latest turn reports zero prompt tokens,
  // so no hit rate can be derived.
  const ctx = {
    cwd: repoRoot,
    model: { name: "GPT-5.5", contextWindow: 272000 },
    getContextUsage: () => ({ percent: 29.5, contextWindow: 272000, tokens: 80240 }),
    settingsManager: { getCompactionSettings: () => ({ enabled: true }) },
    sessionManager: {
      getEntries: () => [
        { type: "message", message: { role: "assistant", usage: { input: 0, cacheRead: 1000, cacheWrite: 0 } } },
        { type: "message", message: { role: "assistant", usage: { input: 0, cacheRead: 0, cacheWrite: 0 } } },
      ],
    },
    modelRegistry: { isUsingOAuth: () => true },
  };

  assert.equal(
    stripAnsi(worktreeCompactFooterText(ctx, state, { thinkingLevel: "high", gitBranch: "main" })),
    "⧉ main-worktree @ ⎇ main | my-pi | GPT-5.5 think:high | ctx 29.5%/272k AC | cache 1.0k",
  );
});
