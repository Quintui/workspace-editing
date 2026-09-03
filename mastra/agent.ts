import { Agent } from "@mastra/core/agent";
import { LocalFilesystem, LocalSandbox, Workspace } from "@mastra/core/workspace";
import { MASTRA_THREAD_ID_KEY, type RequestContext } from "@mastra/core/request-context";
import { Memory } from "@mastra/memory";
import { storage } from "./storage";
import { workspaceDir } from "@/lib/workspace-dir";

// Seatbelt on macOS, bwrap on Linux. Without it the agent's commands run on the
// host with this process's permissions; with it they are confined to the
// thread's directory. Network stays on so the agent can install and fetch.
const isolation = LocalSandbox.detectIsolation();

const threadDir = ({ requestContext }: { requestContext: RequestContext }) => {
  const threadId = requestContext.get(MASTRA_THREAD_ID_KEY) as string | undefined;
  if (!threadId) throw new Error("No thread id on the request context");
  return workspaceDir(threadId);
};

export const workspaceAgent = new Agent({
  id: "workspace-agent",
  name: "Workspace agent",
  instructions: `You work on a computer of your own. Your workspace is a real directory
you can read, write, and run commands in.

Documents are files. When the user asks for a document, a plan, notes, or a draft,
write it to a markdown file in the workspace rather than answering in chat, then say
in one or two sentences what you wrote and where. Keep the chat short: the file is
the deliverable.

Read a file before you edit it. Use edit_file for small changes and write_file when
you are replacing a document wholesale.`,
  model: process.env.MASTRA_MODEL ?? "openrouter/openai/gpt-5.6-luna",
  memory: new Memory({
    storage,
    options: {
      lastMessages: 20,
      generateTitle: true,
    },
  }),
  // One workspace per conversation: the file tools and the shell both land in
  // this thread's directory, so the chat is a window onto that folder.
  workspace: new Workspace({
    filesystem: (ctx) => new LocalFilesystem({ basePath: threadDir(ctx) }),
    sandbox: async (ctx) => {
      const sandbox = new LocalSandbox({
        workingDirectory: threadDir(ctx),
        isolation: isolation.available ? isolation.backend : "none",
        nativeSandbox: { allowNetwork: true },
      });
      await sandbox.start();
      return sandbox;
    },
    sandboxCacheKey: ({ requestContext }) =>
      requestContext.get(MASTRA_THREAD_ID_KEY) as string | undefined,
  }),
});
