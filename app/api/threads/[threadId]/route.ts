import { rm } from "node:fs/promises";
import { NextResponse } from "next/server";
import { memory } from "@/mastra";
import { workspaceDir } from "@/lib/workspace-dir";

type Params = { params: Promise<{ threadId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { threadId } = await params;
  const { title, archived } = await req.json();

  await (await memory()).updateThread({
    id: threadId,
    ...(title !== undefined && { title }),
    ...(archived !== undefined && { metadata: { archived } }),
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { threadId } = await params;
  await (await memory()).deleteThread(threadId);
  // The conversation and its computer go together.
  await rm(workspaceDir(threadId), { recursive: true, force: true });
  return NextResponse.json({ ok: true });
}
