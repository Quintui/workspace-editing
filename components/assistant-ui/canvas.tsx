"use client";

import {
  CanvasSplitBody,
  CanvasSplitDocument,
  CanvasSplitHeader,
  CanvasSplitLine,
} from "@/components/assistant-ui/elements/canvas-split";
import type { WorkspaceFile } from "@/components/assistant-ui/workspace";

export function Canvas({
  file,
  onClose,
}: {
  file: WorkspaceFile | undefined;
  onClose?: () => void;
}) {
  if (!file) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center px-8 text-center text-sm">
        Select a file to open it here.
      </div>
    );
  }

  return (
    <CanvasSplitDocument className="h-full min-h-0">
      <CanvasSplitHeader
        title={file.path}
        saved={!file.writing}
        onCopy={() => navigator.clipboard.writeText(file.content)}
        onClose={onClose}
      />
      <CanvasSplitBody writing={file.writing}>
        {file.content.split("\n").map((line, i) =>
          line.trim() === "" ? (
            <div key={i} aria-hidden className="h-2" />
          ) : (
            <CanvasSplitLine key={i} heading={line.startsWith("#")}>
              {line.replace(/^#+\s*/, "")}
            </CanvasSplitLine>
          ),
        )}
      </CanvasSplitBody>
    </CanvasSplitDocument>
  );
}
