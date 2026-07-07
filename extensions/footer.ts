import { basename, relative } from "node:path";
import { truncateToWidth } from "@earendil-works/pi-tui";
import type { WorktreeState } from "./state.js";

const RESET = "\x1b[0m";
const DIM = "\x1b[38;5;244m";
const CYAN = "\x1b[38;2;0;175;175m";
const GREEN = "\x1b[38;2;95;175;95m";
const YELLOW = "\x1b[38;2;254;188;56m";
const RED = "\x1b[38;2;215;95;95m";
const MAGENTA = "\x1b[38;2;215;135;215m";
const BLUE = "\x1b[38;2;95;135;175m";

interface FooterOptions {
  getThinkingLevel?: () => string | undefined;
}

interface FooterRenderOptions {
  gitBranch?: string | null;
  thinkingLevel?: string;
}

function paint(color: string, text: string): string {
  return `${color}${text}${RESET}`;
}

function separator(): string {
  return paint(DIM, " | ");
}

function formatTokens(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "0";
  if (count < 1000) return Math.round(count).toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

function compactPath(state: WorktreeState): string {
  if (!state.worktreeRoot) return "";
  const rel = relative(state.repoRoot, state.worktreeRoot);
  return rel && !rel.startsWith("..") ? rel : state.worktreeRoot;
}

function pathAlreadyNamesBranch(path: string, branch: string): boolean {
  if (!path || !branch || branch === "unknown") return false;
  return path === branch || path.endsWith(`/${branch}`);
}

function modelName(ctx: any): string {
  let name = ctx?.model?.name || ctx?.model?.id || "no-model";
  if (typeof name === "string" && name.startsWith("Claude ")) name = name.slice(7);
  return String(name);
}

function contextUsageText(ctx: any): string {
  const usage = ctx?.getContextUsage?.();
  const contextWindow = usage?.contextWindow ?? ctx?.model?.contextWindow ?? 0;
  const percent = usage?.percent;
  const percentText = percent === null || percent === undefined ? "?" : Number(percent).toFixed(1);
  const autoCompact = ctx?.settingsManager?.getCompactionSettings?.()?.enabled ?? true;
  return `◫ ${percentText}%/${formatTokens(contextWindow)}${autoCompact ? " AC" : ""}`;
}

function cacheRead(ctx: any): number {
  let total = 0;
  for (const entry of ctx?.sessionManager?.getEntries?.() ?? []) {
    const message = entry?.type === "message" ? entry.message : undefined;
    if (message?.role === "assistant") total += Number(message.usage?.cacheRead ?? 0);
  }
  return total;
}

// Latest prompt cache hit rate as a percentage (0-100), mirroring Pi's built-in footer.
// Algorithm: cacheRead / (input + cacheRead + cacheWrite) * 100, taken from the most
// recent assistant message. Returns undefined when no usable assistant usage exists.
function cacheHitRate(ctx: any): number | undefined {
  const entries = ctx?.sessionManager?.getEntries?.() ?? [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const message = entries[i]?.type === "message" ? entries[i].message : undefined;
    if (message?.role !== "assistant") continue;
    const usage = message.usage;
    const input = Number(usage?.input ?? 0);
    const cacheReadVal = Number(usage?.cacheRead ?? 0);
    const cacheWrite = Number(usage?.cacheWrite ?? 0);
    const promptTokens = input + cacheReadVal + cacheWrite;
    if (promptTokens > 0) return (cacheReadVal / promptTokens) * 100;
    return undefined;
  }
  return undefined;
}

function activeBranch(state: WorktreeState, render?: FooterRenderOptions): string {
  if (state.mode === "inactive") return render?.gitBranch ?? state.branch ?? "unknown";
  return state.branch ?? render?.gitBranch ?? "unknown";
}

export function worktreeFooterText(state: WorktreeState): string | undefined {
  const branch = state.branch ?? "unknown";
  const branchPart = `${paint(GREEN, "⎇")} ${paint(GREEN, branch)}`;
  const sep = separator();

  if (state.mode === "inactive") {
    return `${paint(CYAN, "⧉")} ${paint(CYAN, "main-worktree")}${sep}${branchPart}`;
  }
  if (state.mode === "pending") return `${paint(YELLOW, "⧉")} ${paint(YELLOW, "pending")}${sep}${branchPart}`;

  const path = compactPath(state);
  const repo = basename(state.repoRoot);
  const location = path || repo;
  const worktreePart = `${paint(CYAN, "⧉")} ${paint(CYAN, location)}`;

  const fullWorktreePart = pathAlreadyNamesBranch(path, branch)
    ? worktreePart
    : `${worktreePart}${sep}${branchPart}`;

  if (state.mode === "conflict") return `${paint(RED, "⚠")} ${fullWorktreePart}`;
  return fullWorktreePart;
}

function worktreeOnlyText(state: WorktreeState): string {
  if (state.mode === "inactive") return `${paint(CYAN, "⧉")} ${paint(CYAN, "main-worktree")}`;
  if (state.mode === "pending") return `${paint(YELLOW, "⧉")} ${paint(YELLOW, "pending")}`;

  const path = compactPath(state);
  const repo = basename(state.repoRoot);
  const worktreePart = `${paint(CYAN, "⧉")} ${paint(CYAN, path || repo)}`;
  return state.mode === "conflict" ? `${paint(RED, "⚠")} ${worktreePart}` : worktreePart;
}

export function worktreeCompactFooterText(ctx: any, state: WorktreeState, render?: FooterRenderOptions): string {
  const branch = activeBranch(state, render);
  const dir = basename(ctx?.cwd ?? state.repoRoot) || ctx?.cwd || state.repoRoot;
  const thinkingLevel = render?.thinkingLevel ?? "off";
  const cacheIn = cacheRead(ctx);
  const worktreeAndBranch = `${worktreeOnlyText(state)} ${paint(DIM, "@")} ${paint(GREEN, "⎇")} ${paint(GREEN, branch)}`;
  const parts = [
    worktreeAndBranch,
    paint(CYAN, dir),
    `${paint(MAGENTA, modelName(ctx))} ${paint(MAGENTA, `think:${thinkingLevel}`)}`,
    paint(BLUE, contextUsageText(ctx).replace(/^◫ /, "ctx ")),
  ];

  if (cacheIn > 0) {
    const hitRate = cacheHitRate(ctx);
    const cacheText = hitRate === undefined
      ? `cache ${formatTokens(cacheIn)}`
      : `cache ${formatTokens(cacheIn)} CH${hitRate.toFixed(1)}%`;
    parts.push(paint(BLUE, cacheText));
  }

  return parts.filter(Boolean).join(separator());
}

export function setWorktreeFooter(ctx: any, state: WorktreeState, options: FooterOptions = {}): void {
  if (!ctx?.ui?.setFooter) {
    ctx?.ui?.setStatus?.("pi-worktree", worktreeFooterText(state));
    return;
  }

  ctx.ui.setStatus?.("pi-worktree", undefined);
  ctx.ui.setFooter((tui: any, _theme: any, footerData: any) => {
    const disposeBranchWatcher = footerData?.onBranchChange?.(() => tui?.requestRender?.());
    return {
      invalidate() {},
      render(width: number): string[] {
        const line = worktreeCompactFooterText(ctx, state, {
          gitBranch: footerData?.getGitBranch?.(),
          thinkingLevel: options.getThinkingLevel?.(),
        });
        return [truncateToWidth(line, width, paint(DIM, "…"))];
      },
      dispose() {
        disposeBranchWatcher?.();
      },
    };
  });
}
