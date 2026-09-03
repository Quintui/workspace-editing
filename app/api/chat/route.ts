import { handleChatStream } from "@mastra/ai-sdk";
import { createUIMessageStreamResponse } from "ai";
import { RequestContext, MASTRA_THREAD_ID_KEY } from "@mastra/core/request-context";
import { AGENT_ID, mastra, RESOURCE_ID } from "@/mastra";

export const maxDuration = 300;

export async function POST(req: Request) {
  const { id, ...params } = await req.json();

  // `AssistantChatTransport` sends the thread's remote id as `id`, which is the
  // Mastra thread. The workspace resolver reads it off the request context to
  // pick this conversation's directory.
  const requestContext = new RequestContext();
  requestContext.set(MASTRA_THREAD_ID_KEY, id);

  const stream = await handleChatStream({
    mastra,
    agentId: AGENT_ID,
    version: "v7",
    sendReasoning: true,
    params: {
      ...params,
      requestContext,
      memory: { thread: id, resource: RESOURCE_ID },
    },
  });

  return createUIMessageStreamResponse({ stream });
}
