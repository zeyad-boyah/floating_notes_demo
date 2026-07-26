# Floating notes — nested sticky-note board

An exploration of a collaborative brainstorm board: square sticky notes on an infinite canvas that
attach to each other's edges according to type rules, with per-user dot voting. Built to be lifted
into a larger Angular app later, so the transferable logic is isolated from the demo scaffolding.

```
npm start        # http://localhost:4200
npm test         # vitest, no browser needed
```

## What it does

- **Infinite canvas.** Drag the background to pan, wheel to zoom (anchored at the cursor).
- **Typed notes.** Theme → Idea → Action / Question. A note may only attach where the rules allow.
- **Edge docking.** Drop a note on a parent's left, right, top or bottom half and it snaps flush to
  that edge, joining the stack there. Stacks are centred on the parent, docking is recursive, and
  dragging a note takes everything attached to it along.
- **Live drop feedback.** The edge you would dock to lights up before you release; a refused drop
  gets a red outline and a banner naming the rule that refused it.
- **Fixed squares.** Every note is 180×180. Long text steps down a font size or two, then clips
  under a fade — the square never resizes, so the layout stays predictable.
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

**`core/layout.ts`** — pure function from board state to a position per note. Only roots store
coordinates; a docked note's position is derived from its parent, side and index, which is why
moving a parent moves its whole cluster for free and why there is no per-note position to keep in
sync across clients.

**`core/drag.service.ts`** — pointer drag with edge docking. Because positions are derived, drop
resolution is pure geometry against `layout()` — which square is under the pointer, which edge it
leans towards, where in that stack it lands. No DOM measuring, so pan, zoom and reflow can't
desynchronise it.

**`core/viewport.service.ts`** — the world↔screen transform. Every stored coordinate is a world
coordinate; every pointer coordinate is a screen coordinate, and all drag maths goes through
`screenToWorld`, which is what keeps dragging exact at any zoom level.

## Known limits of the demo

- Single browser. `remote$` never emits, so conflict resolution is untested by construction — that
  is the next thing to explore, not something this demo settles.
- No selection model, so there is no multi-select or keyboard delete (each card has a × button).
- No virtualization; every note is a DOM node.
- **Docking is relative to the parent only — it does not avoid collisions elsewhere.** A cluster
  that folds back on itself (a note docked right, with its own child docked right again after the
  parent was moved left) can overlap another branch. Proper tree layout, where each node reserves
  the bounding box of its whole subtree, is the fix if this becomes annoying.
- Persistence is keyed `floating-notes:board:v2`; changing the note shape means bumping that key.
