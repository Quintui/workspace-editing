import { NextResponse } from "next/server";
import { memory, RESOURCE_ID } from "@/mastra";

/** The conversation list, newest first. */
export async function GET() {
  const { threads } = await (
    await memory()
  ).listThreads({
    filter: { resourceId: RESOURCE_ID },
    perPage: 50,
    page: 0,
    orderBy: { field: "updatedAt", direction: "DESC" },
  });

  return NextResponse.json(
    threads.map((thread) => ({
      id: thread.id,
      // A thread has no title until Mastra generates one from the first
      // exchange; the UI wants nothing rather than an empty string.
      title: thread.title || undefined,
      updatedAt: thread.updatedAt,
      archived: thread.metadata?.archived === true,
    })),
  );
}

/** Called when the user's first message needs somewhere to land. */
export async function POST() {
  const thread = await (await memory()).createThread({ resourceId: RESOURCE_ID });
  return NextResponse.json({ id: thread.id });
}
