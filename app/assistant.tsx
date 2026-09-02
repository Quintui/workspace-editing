"use client";

import { useCallback, useEffect, useState } from "react";
import { AssistantRuntimeProvider, useAuiState } from "@assistant-ui/react";
import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/ai-sdk";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { ThreadList } from "@/components/assistant-ui/elements/thread-list.aui";
import { Canvas } from "@/components/assistant-ui/canvas";
import {
  OpenFileProvider,
  useArtifactCard,
} from "@/components/assistant-ui/artifact";
import { SessionToolTimeline } from "@/components/assistant-ui/tool-timeline";
import {
  useWorkspaceFiles,
  WorkspaceTree,
} from "@/components/assistant-ui/workspace";
import { cn } from "@/lib/utils";

const THREAD_COMPONENTS = { ToolGroup: SessionToolTimeline };

export const Assistant = () => {
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({ api: "/api/chat" }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Workbench />
    </AssistantRuntimeProvider>
  );
};

const Workbench = () => {
  const files = useWorkspaceFiles();
  const [openPath, setOpenPath] = useState<string>();
  const [treeExpanded, setTreeExpanded] = useState(true);

  // Nothing to show a workspace for on the new-chat screen.
  const isNewChat = useAuiState((s) => s.thread.messages.length === 0);

  useArtifactCard();

  // The canvas needs the room, so opening a file folds the tree to its pill.
  const openFile = useCallback((path: string) => {
    setOpenPath(path);
    setTreeExpanded(false);
  }, []);

  const closeCanvas = useCallback(() => {
    setOpenPath(undefined);
    setTreeExpanded(true);
  }, []);

  // A file the agent has started writing takes the canvas straight away.
  const writingPath = files.find((f) => f.writing)?.path;
  useEffect(() => {
    if (writingPath) openFile(writingPath);
  }, [writingPath, openFile]);

  const selected = files.find((f) => f.path === openPath);

  return (
    <OpenFileProvider value={openFile}>
      <div className="bg-background flex h-dvh">
        <aside className="border-border/60 hidden w-64 shrink-0 flex-col gap-2 border-r p-2 md:flex">
          <div className="px-2.5 py-2 text-sm font-medium">Conversations</div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ThreadList />
          </div>
        </aside>

        {/* The thread, with the workspace tree floating on top of it. The
            band clears the collapsed pill; an expanded tree floats over. */}
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className={cn("min-h-0 flex-1", !isNewChat && "pt-12")}>
            <Thread components={THREAD_COMPONENTS} />
          </div>
          {!isNewChat && (
            <WorkspaceTree
              className="absolute end-4 top-4 z-20 max-h-[calc(100%-2rem)] overflow-y-auto"
              files={files}
              selectedPath={openPath}
              onSelectFile={openFile}
              expanded={treeExpanded}
              onExpandedChange={setTreeExpanded}
            />
          )}
        </main>

        {selected && (
          <aside className="border-border/60 hidden w-[26rem] shrink-0 border-s lg:block xl:w-[34rem]">
            <Canvas file={selected} onClose={closeCanvas} />
          </aside>
        )}
      </div>
    </OpenFileProvider>
  );
};
