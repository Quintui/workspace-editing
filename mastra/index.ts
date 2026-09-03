import { Mastra } from "@mastra/core";
import { workspaceAgent } from "./agent";
import { storage } from "./storage";

export const mastra = new Mastra({
  agents: { workspaceAgent },
  storage,
});

export const AGENT_ID = "workspace-agent";

/** Single-user demo: every thread belongs to the same resource. */
export const RESOURCE_ID = "local-user";

export const memory = async () => {
  const m = await mastra.getAgentById(AGENT_ID).getMemory();
  if (!m) throw new Error("Agent has no memory configured");
  return m;
};
