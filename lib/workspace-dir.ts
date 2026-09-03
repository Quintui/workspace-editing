import { join, resolve } from "node:path";

/** Everything the agent writes lives under this directory, one folder per thread. */
export const WORKSPACE_ROOT = resolve(process.cwd(), "workspace");

/**
 * A conversation's workspace on disk. Thread ids come from Mastra memory, but
 * this also runs on ids that arrived over HTTP, so anything that could climb
 * out of the root is rejected rather than sanitised into a different folder.
 */
export function workspaceDir(threadId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(threadId)) {
    throw new Error(`Invalid thread id: ${threadId}`);
  }
  return join(WORKSPACE_ROOT, threadId);
}
