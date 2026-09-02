import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
  type UIMessageStreamWriter,
} from "ai";

/**
 * Placeholder backend so the UI can be built without a model or a sandbox.
 * Replace the body of `execute` with the Mastra agent stream later — the
 * wire format (AI SDK UI message stream) stays the same.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const promptText = (message: UIMessage | undefined) =>
  message?.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join(" ")
    .trim() ?? "";

const PROPOSAL = (title: string) => `# ${title}

## Overview

This document lives in the agent's workspace as a real file. The agent wrote it
with the same primitives it uses for everything else: read, write, edit, run.

## Requirements

- The agent owns a filesystem, not a document API
- The canvas is a view onto a file, not a separate store
- Both the user and the agent edit the same artifact

## Next steps

- Wire the Mastra agent behind this endpoint
- Point the workspace at a Daytona sandbox
- Stream file changes back into the canvas
`;

const ACTION_ITEMS = `# Action items

- Wire the Mastra agent behind the chat endpoint
- Point the workspace at a Daytona sandbox
- Stream file changes back into the canvas
- Let the user edit a file and hand the diff back to the agent
`;

const streamText = async (
  writer: UIMessageStreamWriter,
  id: string,
  text: string,
  delay = 30,
) => {
  writer.write({ type: "text-start", id });
  for (const word of text.split(" ")) {
    writer.write({ type: "text-delta", id, delta: word + " " });
    await sleep(delay);
  }
  writer.write({ type: "text-end", id });
};

const streamReasoning = async (
  writer: UIMessageStreamWriter,
  id: string,
  text: string,
) => {
  writer.write({ type: "reasoning-start", id });
  for (const word of text.split(" ")) {
    writer.write({ type: "reasoning-delta", id, delta: word + " " });
    await sleep(18);
  }
  writer.write({ type: "reasoning-end", id });
};

const streamToolCall = async (
  writer: UIMessageStreamWriter,
  {
    toolCallId,
    toolName,
    input,
    output,
  }: {
    toolCallId: string;
    toolName: string;
    input: Record<string, unknown>;
    output: unknown;
  },
) => {
  writer.write({ type: "tool-input-start", toolCallId, toolName });

  const argsText = JSON.stringify(input);
  for (let i = 0; i < argsText.length; i += 16) {
    writer.write({
      type: "tool-input-delta",
      toolCallId,
      inputTextDelta: argsText.slice(i, i + 16),
    });
    await sleep(10);
  }

  writer.write({ type: "tool-input-available", toolCallId, toolName, input });
  await sleep(120);
  writer.write({ type: "tool-output-available", toolCallId, output });
};

const lines = (text: string) => text.replace(/\n$/, "").split("\n").length;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const title = promptText(messages.at(-1)) || "Untitled";

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      await streamReasoning(
        writer,
        "r1",
        "The user wants a proposal. I'll check what's already in the workspace, write the proposal as a file, then split the action items into their own file so they can be reused.",
      );

      await streamToolCall(writer, {
        toolCallId: "c1",
        toolName: "run_command",
        input: { command: "ls -1" },
        output: { stdout: "", exitCode: 0 },
      });

      await streamText(
        writer,
        "t1",
        "The workspace is empty, so I'll start the proposal from scratch.",
      );

      const proposal = PROPOSAL(title);
      await streamToolCall(writer, {
        toolCallId: "c2",
        toolName: "write_file",
        input: { path: "project-proposal.md", content: proposal },
        output: { path: "project-proposal.md", added: lines(proposal) },
      });

      await streamToolCall(writer, {
        toolCallId: "c3",
        toolName: "read_file",
        input: { path: "project-proposal.md" },
        output: { bytes: proposal.length },
      });

      await streamToolCall(writer, {
        toolCallId: "c4",
        toolName: "write_file",
        input: { path: "notes/action-items.md", content: ACTION_ITEMS },
        output: { path: "notes/action-items.md", added: lines(ACTION_ITEMS) },
      });

      await streamText(
        writer,
        "t2",
        "Wrote `project-proposal.md` and pulled the action items out into `notes/action-items.md`. Both are in the workspace on the right — open either one and edit it there.",
      );
    },
  });

  return createUIMessageStreamResponse({ stream });
}
