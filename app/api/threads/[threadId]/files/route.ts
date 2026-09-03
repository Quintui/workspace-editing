import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { workspaceDir } from "@/lib/workspace-dir";

/** Anything larger is a build artifact or a binary, not a document. Also the
 * ceiling on what can be added, so the tree shows everything it accepts. */
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

/**
 * Adds files the user drops into the conversation's workspace, alongside
 * whatever the agent has written. They land as plain files in the same
 * directory, so the agent reaches them with its ordinary file tools.
 */
export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const root = workspaceDir(threadId);

  const form = await req.formData();
  const uploads = form.getAll("file").filter((f): f is File => f instanceof File);
  if (uploads.length === 0) {
    return NextResponse.json({ error: "No files given" }, { status: 400 });
  }

  await mkdir(root, { recursive: true });

  const written: string[] = [];
  for (const upload of uploads) {
    // Browsers send a name, not a path, but a crafted request can send either.
    const name = upload.name.split(/[\\/]/).pop()?.trim();
    if (!name || name.startsWith(".")) {
      return NextResponse.json({ error: `Unsupported name: ${upload.name}` }, { status: 400 });
    }
    if (upload.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `${name} is over ${MAX_BYTES / 1000}KB` },
        { status: 413 },
      );
    }

    const bytes = Buffer.from(await upload.arrayBuffer());
    // The agent reads and edits text, and the canvas renders it. A binary
    // would land as a file it can neither read nor show.
    if (bytes.includes(0)) {
      return NextResponse.json({ error: `${name} is not a text file` }, { status: 400 });
    }

    // Never overwrite what the agent has already written.
    let target = name;
    for (let n = 2; existsSync(join(root, target)); n++) {
      const dot = name.lastIndexOf(".");
      target =
        dot > 0 ? `${name.slice(0, dot)}-${n}${name.slice(dot)}` : `${name}-${n}`;
    }

    await writeFile(join(root, target), bytes);
    written.push(target);
  }

  return NextResponse.json({ files: written });
}
