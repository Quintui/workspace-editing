"use client";

import { createContext, useContext } from "react";
import {
  useAssistantToolUI,
  useToolArgsStatus,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { ArtifactCard } from "@/components/assistant-ui/elements/artifact-card";
import { WRITE_FILE, type WriteFileArgs } from "@/components/assistant-ui/workspace";

/** Lets a card anywhere in the thread open that file on the canvas. */
const OpenFileContext = createContext<(path: string) => void>(() => {});

export const OpenFileProvider = OpenFileContext.Provider;
export const useOpenFile = () => useContext(OpenFileContext);

const countWords = (text: string) =>
  text.trim() === "" ? 0 : text.trim().split(/\s+/).length;

function WriteFileCard({ args, status }: ToolCallMessagePartProps<WriteFileArgs>) {
  const { propStatus } = useToolArgsStatus<WriteFileArgs>();
  const openFile = useOpenFile();

  const path = args.path ?? "Untitled";
  const content = args.content ?? "";
  const writing =
    propStatus.content === "streaming" || status.type === "running";

  return (
    <ArtifactCard
      className="my-1.5"
      title={path}
      meta={`Document · ${countWords(content)} words`}
      generating={writing}
      words={countWords(content)}
      role="button"
      tabIndex={0}
      onClick={() => openFile(path)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openFile(path);
        }
      }}
    />
  );
}

/**
 * Registers the card as `write_file`'s UI. `display: "standalone"` is what
 * lifts the call out of the chain-of-thought grouping, so the card sits on
 * its own in the thread instead of being folded into the tool timeline.
 *
 * `useAssistantToolUI` is deprecated in favour of a toolkit `render` entry,
 * which needs the `withAui` build plugin. Move it there when tools land.
 */
export function useArtifactCard() {
  useAssistantToolUI({
    toolName: WRITE_FILE,
    render: WriteFileCard,
    display: "standalone",
  });
}
