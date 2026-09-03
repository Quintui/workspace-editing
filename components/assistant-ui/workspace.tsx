"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronUpIcon, FolderIcon } from "lucide-react";
import { useAui, useAuiState, type ToolCallMessagePart } from "@assistant-ui/react";
import {
  getPartialJsonObjectFieldState,
  getPartialJsonObjectMeta,
} from "assistant-stream/utils";
import {
  FileTree,
  type FileTreeNode,
} from "@/components/assistant-ui/elements/file-tree";
import { mono, paper } from "@/lib/surfaces";
import { cn } from "@/lib/utils";

// Mastra's workspace tools, as the model sees them.
const PREFIX = "mastra_workspace_";
export const WRITE_FILE = `${PREFIX}write_file`;
export const READ_FILE = `${PREFIX}read_file`;
export const EDIT_FILE = `${PREFIX}edit_file`;
export const LIST_FILES = `${PREFIX}list_files`;
export const GREP = `${PREFIX}grep`;
export const MKDIR = `${PREFIX}mkdir`;
export const DELETE = `${PREFIX}delete`;
export const FILE_STAT = `${PREFIX}file_stat`;
export const EXECUTE_COMMAND = `${PREFIX}execute_command`;

export type WriteFileArgs = { path?: string; content?: string };

/**
 * Tool arguments arrive as partial JSON, so a string field is a truncated
 * prefix of itself until it closes — `"competitors.md"` shows up as `"compet"`
 * first. Acting on a prefix points the canvas at a path no file has, so it
 * blanks and then reopens. Arguments that carry no streaming metadata are
 * already final.
 */
function isSettled(args: object, field: string): boolean {
  const meta = getPartialJsonObjectMeta(args as Record<symbol, unknown>);
  if (!meta) return true;
  return (
    getPartialJsonObjectFieldState(args as Record<string, unknown>, [field]) ===
    "complete"
  );
}

export type WorkspaceFile = {
  path: string;
  content: string;
  /** The agent is still streaming this file's contents. */
  writing: boolean;
};

/**
 * The conversation's files. The list is whatever is on disk in this thread's
 * workspace directory, refetched once the agent stops working, with any
 * in-flight `write_file` laid over the top so the canvas can stream.
 */
export function useWorkspaceFiles(): WorkspaceFile[] {
  const aui = useAui();
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const messages = useAuiState((s) => s.thread.messages);
  const [saved, setSaved] = useState<WorkspaceFile[]>([]);

  const refresh = useCallback(async () => {
    const item = aui.threadListItem;
    const threadId = item.source ? item.getState().remoteId : undefined;
    if (!threadId) {
      setSaved([]);
      return;
    }
    const res = await fetch(`/api/threads/${threadId}/files`);
    if (!res.ok) return;
    const files: { path: string; content: string }[] = await res.json();
    setSaved(files.map((f) => ({ ...f, writing: false })));
  }, [aui]);

  // On thread switch and again whenever a run finishes, which is when the
  // agent's writes have landed.
  useEffect(() => {
    if (!isRunning) void refresh();
  }, [isRunning, refresh]);

  // A file the agent is writing right now exists only in the tool call.
  const streaming = useMemo(() => {
    const inFlight = new Map<string, WorkspaceFile>();
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.content) {
        if (part.type !== "tool-call" || part.toolName !== WRITE_FILE) continue;
        const { args, result } = part as ToolCallMessagePart<WriteFileArgs>;
        if (!args.path || result !== undefined) continue;
        if (!isSettled(args, "path")) continue;
        inFlight.set(args.path, {
          path: args.path,
          content: args.content ?? "",
          writing: true,
        });
      }
    }
    return inFlight;
  }, [messages]);

  return useMemo(() => {
    const files = new Map(saved.map((file) => [file.path, file]));
    for (const [path, file] of streaming) files.set(path, file);
    return [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
  }, [saved, streaming]);
}

/** Folder headers plus one indented row per file, as the element expects. */
function toNodes(files: readonly WorkspaceFile[]): FileTreeNode[] {
  const nodes: FileTreeNode[] = [];
  const seenDirs = new Set<string>();

  for (const file of files) {
    const slash = file.path.lastIndexOf("/");
    const dir = slash === -1 ? "" : file.path.slice(0, slash);

    if (dir && !seenDirs.has(dir)) {
      seenDirs.add(dir);
      nodes.push({ path: `dir:${dir}`, name: dir, depth: 0, kind: "folder" });
    }

    nodes.push({
      path: file.path,
      name: slash === -1 ? file.path : file.path.slice(slash + 1),
      depth: dir ? 1 : 0,
      kind: "file",
    });
  }

  return nodes;
}

/**
 * The conversation's files, floating over the thread. Collapses to a pill so
 * it can share the screen with an open canvas.
 */
export function WorkspaceTree({
  files,
  selectedPath,
  onSelectFile,
  expanded,
  onExpandedChange,
  className,
}: {
  files: readonly WorkspaceFile[];
  selectedPath?: string;
  onSelectFile: (path: string) => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  className?: string;
}) {
  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => onExpandedChange(true)}
        aria-expanded={false}
        className={cn(
          paper,
          "flex items-center gap-2 rounded-full py-1.5 ps-3 pe-3.5 shadow-lg transition-transform hover:-translate-y-px active:scale-[0.98]",
          className,
        )}
      >
        <FolderIcon className="text-foreground/40 size-3.5" />
        <span className="text-[13px] font-medium">Workspace</span>
        {files.length > 0 && (
          <span className={cn(mono, "text-foreground/45 tabular-nums")}>
            {files.length}
          </span>
        )}
      </button>
    );
  }

  const header = (
    <button
      type="button"
      onClick={() => onExpandedChange(false)}
      aria-expanded
      aria-label="Collapse workspace"
      className="text-foreground/40 hover:text-foreground/80 -me-1 rounded p-0.5 transition-colors"
    >
      <ChevronUpIcon className="size-3.5" />
    </button>
  );

  if (files.length === 0) {
    return (
      <div className={cn(paper, "w-56 rounded-2xl p-3.5 shadow-lg", className)}>
        <div className="flex items-center justify-between px-1">
          <p className="text-[13.5px] font-medium">Workspace</p>
          {header}
        </div>
        <p className="text-muted-foreground px-1 pt-1 text-[13px]">
          Create a file to start
        </p>
      </div>
    );
  }

  const nodes = toNodes(files);

  return (
    <FileTree
      className={cn("w-56 shadow-lg", className)}
      label="Workspace"
      action={header}
      nodes={nodes}
      visibleCount={nodes.length}
      selectedPath={selectedPath}
      onSelectFile={onSelectFile}
    />
  );
}
