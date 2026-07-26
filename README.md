# Floating notes — nested sticky-note board

An exploration of a collaborative brainstorm board: sticky notes on an infinite canvas that nest
inside one another according to type rules, with per-user dot voting. Built to be lifted into a
larger Angular app later, so the transferable logic is isolated from the demo scaffolding.

```
npm start        # http://localhost:4200
npm test         # vitest, no browser needed
```

## What it does

- **Infinite canvas.** Drag the background to pan, wheel to zoom (anchored at the cursor).
- **Typed notes.** Theme → Idea → Action / Question. A note may only be nested where the rules allow.
- **Nesting by drag.** Dropping a note onto a valid parent puts it *inside* that parent; the parent
  grows and moving it moves the whole subtree.
- **Live drop feedback.** Valid parents get an accent ring and an insertion line; invalid ones get a
  red ring and a banner explaining which rule refused the drop.
- **Editing.** Double-click a note. Escape cancels, ⌘/Ctrl+Enter commits, blur commits.
- **Voting.** One toggleable vote per user, shown as coloured pins. Switch the simulated user in the
  top-right to see votes from more than one person.
- **Persistence.** The board is written to localStorage; "Reset board" restores the seed.

## Layout

```
src/app/core/     transferable: models, type rules, store, drag, viewport, sync seam
src/app/board/    demo UI: board surface, recursive note card, palette, vote pins, user switcher
```

`core/` imports nothing from `board/` — the future project can take `core/` and bring its own UI.

## The parts that matter for integration

**`core/note-types.ts`** — the attachment rules as pure config. `canAttach(childType, parentType)`
is the only rule check in the codebase; swapping this file changes the semantics of the whole board.

**`core/board.store.ts`** — a signal store whose only mutation path is the pure reducer
`applyEvent(state, event)`. Locally-dispatched events and events arriving from the network go
through the same reducer, which is what makes real collaboration a drop-in rather than a rewrite.
Validation (type rules, cycle guard, cascade delete) lives here, not in components.

**`core/sync/sync-adapter.ts`** — the seam. `SyncAdapter` is three members: `remote$`, `snapshot()`,
`publish()`. The demo provides `LocalSyncAdapter` (localStorage, no peers). A WebSocket or CRDT
backend implements the same interface and is swapped at one provider line in `app.config.ts`.

**`core/drag.service.ts`** — pointer drag with containment drops. Drop targets are resolved by
hit-testing the live DOM (`elementsFromPoint`) rather than cached rectangles, because nesting reflows
the layout on every hover and the canvas pans and zooms underneath. The DOM contract is two data
attributes: `[data-note-id]` on a card and `[data-children-of]` on its children container.

**`core/viewport.service.ts`** — the world↔screen transform. Every stored coordinate is a world
coordinate; every pointer coordinate is a screen coordinate, and all drag maths goes through
`screenToWorld`, which is what keeps dragging exact at any zoom level.

## Known limits of the demo

- Single browser. `remote$` never emits, so conflict resolution is untested by construction — that
  is the next thing to explore, not something this demo settles.
- No selection model, so there is no multi-select or keyboard delete (each card has a × button).
- No virtualization; every note is a DOM node.
