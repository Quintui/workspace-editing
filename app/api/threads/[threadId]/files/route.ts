import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { workspaceDir } from "@/lib/workspace-dir";

/** Anything larger is a build artifact or a binary, not a document. */
const MAX_BYTES = 200_000;

const IGNORED = new Set(["node_modules", ".git", ".sandbox", ".mastra"]);

/**
 * The thread's workspace as it is on disk — the same directory the agent's file
 * tools and shell write to, so the tree shows what actually exists rather than
 * what the transcript happens to mention.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const root = workspaceDir(threadId);

  let entries: string[];
  try {
    entries = await readdir(root, { recursive: true });
  } catch {
    return NextResponse.json([]); // the agent hasn't created it yet
  }

  const files = [];
  for (const entry of entries) {
    if (entry.split("/").some((segment) => IGNORED.has(segment) || segment.startsWith("."))) {
      continue;
    }

    const full = join(root, entry);
    const info = await stat(full);
    if (!info.isFile() || info.size > MAX_BYTES) continue;

    files.push({
      path: entry,
      content: await readFile(full, "utf-8"),
      modifiedAt: info.mtimeMs,
    });
  }

  return NextResponse.json(files.sort((a, b) => a.path.localeCompare(b.path)));
}
