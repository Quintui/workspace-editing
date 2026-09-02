# workspace-editing

A chat interface that is a window onto an agent's workspace, built with
[assistant-ui](https://assistant-ui.com) primitives.

Instead of giving the model a growing pile of bespoke tools, the agent gets a
computer: a filesystem it reads, writes, and runs commands against. A document
is not a special object owned by the frontend — it is a file in the agent's
workspace, and the canvas is a view onto that file.

> **Status:** UI only. The chat endpoint is a placeholder that streams a scripted
> run so the interface can be built without a model or a sandbox. The agent
> (Mastra) and the sandbox (Daytona) are not wired up yet.

## What's here

| Area | Built from |
| --- | --- |
| Conversation list | `ThreadListPrimitive`, `ThreadListItemPrimitive` |
| Thread, composer, messages | `ThreadPrimitive`, `MessagePrimitive`, `ComposerPrimitive`, `ActionBarPrimitive`, `BranchPickerPrimitive` |
| Reasoning | the `reasoning` element, restyled to match the tool timeline |
| Tool calls | the `tool-timeline` element |
| Created files | the `artifact-card` element |
| Workspace tree | the `file-tree` element, floating over the thread |
| Document canvas | the `canvas-split` element |

Each conversation has its own workspace. Thread state is already per
conversation, so the file list is simply that thread's `write_file` calls.

A file the agent starts writing opens on the canvas immediately and streams in.
Files can also be opened from the floating workspace tree or from the artifact
card in the conversation.

There is no cloud persistence — threads live in memory for the life of the page.

## Running it

```bash
npm install
npm run dev
```

No API key is needed while the placeholder endpoint is in place.

## Replacing the placeholder

`app/api/chat/route.ts` streams a canned run over the AI SDK UI message stream.
Swap the body of `execute` for the Mastra agent; the wire format stays the same.
The frontend recognises three tools:

- `write_file` (`path`, `content`) — renders an artifact card and the canvas
- `read_file` (`path`) — a timeline step
- `run_command` (`command`) — a timeline step

## Notes on the vendored elements

assistant-ui registry components are copied into `components/assistant-ui/` and
are meant to be edited. A few carry local changes:

- `tool-timeline.tsx` — rows were keyed by chip text, which collides when a run
  reads and writes the same file; keyed by index instead.
- `file-tree.tsx` — added row selection, an optional header action, and made the
  diff totals optional, since this is a file browser rather than a diff summary.
- `reasoning.tsx` — defaults to the borderless `ghost` variant with a
  timeline-style trigger.
- `tool-fallback.aui.tsx` — the registry ships ahead of the published
  `@assistant-ui/react`; local shims cover approval fields that aren't in the
  released types yet. Remove them when the package catches up.
