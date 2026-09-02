"use client";

import { useState } from "react";
import {
  FileSearchIcon,
  PenLineIcon,
  TerminalIcon,
  type LucideIcon,
} from "lucide-react";
import { useAuiState, type PartState } from "@assistant-ui/react";
import type { ThreadGroupPart } from "@/components/assistant-ui/elements/thread.aui";
import {
  ToolTimeline,
  type TimelineStep,
} from "@/components/assistant-ui/elements/tool-timeline";
import {
  READ_FILE,
  RUN_COMMAND,
  WRITE_FILE,
} from "@/components/assistant-ui/workspace";

const TOOL_META: Record<string, { verb: string; icon: LucideIcon }> = {
  [READ_FILE]: { verb: "Read", icon: FileSearchIcon },
  [WRITE_FILE]: { verb: "Wrote", icon: PenLineIcon },
  [RUN_COMMAND]: { verb: "Ran", icon: TerminalIcon },
};

type ToolPart = Extract<PartState, { type: "tool-call" }>;
type ToolArgs = { path?: string; command?: string };

const toStep = (part: ToolPart): TimelineStep => {
  const meta = TOOL_META[part.toolName];
  const args = part.args as ToolArgs;
  return {
    verb: meta?.verb ?? part.toolName,
    chip: args.path ?? args.command ?? part.toolCallId,
    icon: meta?.icon ?? TerminalIcon,
  };
};

/**
 * Renders a run of consecutive tool calls as one timeline. Wired in as the
 * thread's `ToolGroup`, so it replaces the per-call cards for that group.
 *
 * `write_file` never reaches here: its UI is registered as `standalone`, so
 * it renders as its own artifact card outside the chain-of-thought grouping.
 */
export function SessionToolTimeline({ group }: { group: ThreadGroupPart }) {
  const [open, setOpen] = useState(false);

  const parts = useAuiState((s) => s.message.parts);
  const running = group.status.type === "running";

  const calls = group.indices.flatMap((i) => {
    const part = parts[i];
    return part?.type === "tool-call" ? [part] : [];
  });

  if (calls.length === 0) return null;

  const steps = calls.map(toStep);

  return (
    <ToolTimeline
      className="my-1 max-w-none"
      steps={steps}
      visibleSteps={steps.length}
      streaming={running}
      open={open}
      onOpenChange={setOpen}
      activeLabel="Working"
      restingLabel={`${steps.length} ${steps.length === 1 ? "step" : "steps"}`}
      stats={[]}
    />
  );
}
