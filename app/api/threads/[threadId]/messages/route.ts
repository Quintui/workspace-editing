import { NextResponse } from "next/server";
import { toAISdkMessages } from "@mastra/ai-sdk/ui";
import { memory, RESOURCE_ID } from "@/mastra";

/** Replays a thread's history so switching conversations restores the chat. */
export async function GET(_req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;

  const recalled = await (await memory()).recall({
    threadId,
    resourceId: RESOURCE_ID,
    perPage: false,
  });

  return NextResponse.json(toAISdkMessages(recalled.messages, { version: "v7" }));
}
