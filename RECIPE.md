# Pomodoro

A pomodoro timer that lives in Herdr's window. A small chip in the top-right corner of the tab bar
shows the current phase's icon and the time left, ticking while you work; clicking it opens a side
panel next to Files and Changes. The panel has two interfaces: **Simple** (focus, short break, long
break after every 4th focus) and **Session** (a planned run of focus and break steps that start one
after another by themselves). Lengths are set once in Settings and followed everywhere unless a
step or a session says otherwise. Today's finished focus blocks and focused time sit in the footer.

![Pomodoro](preview.png)

## What you see

- **Corner chip** (layout block 92px wide, tab bar height 42px, `chrome` background, 1px `border`
  bottom line so it continues the tab bar). Inside, right-aligned: a 26px-high pill (8px side
  padding, 6px radius, 12px text) with a 14px phase icon and the time left as `mm:ss` in the
  terminal font. While running, the icon is the phase color and the text `foreground`; paused or
  not started, both are `muted`. When the panel shows Pomodoro, the pill has the `selected` background.
- **Side panel card** (fills the layout's side panel, 10px radius, 1px `border`, `background` fill):
  - Header, 42px: "Pomodoro" (13px semibold), a small badge **Ready / Running / Paused**
    (10px, bordered), then a gear button (Settings) and × (hides the panel).
  - Body, 16px padding, scrolls: a segmented switch **Simple | Session** (`raised` track, the
    chosen side on `background`), then the chosen view.
  - Footer, 36px, top border, 11px `dim` text: dots on the left (Simple: 4 dots, one filled per
    focus done in the current round; Session: one dot per step, filled up to the current one) and
    `Today: N done · 1h 05m focused` on the right.
- **Simple view**: three phase tabs with icons (Focus ◎, Short break ☕, Long break 🛋) — the
  current one on `selected` with its icon in the phase color; a 46px semibold clock in the terminal
  font with − / + beside it (only before the phase starts); a 4px progress bar in the phase color;
  buttons **Start / Pause / Resume**, **Reset**, **Skip** (30px high, 7px radius; the first is the
  `solid` primary button).
- **Session view**:
  - List: one bordered row per session — name (13px semibold), a **Built-in** tag for the three
    built-ins, a 📌 for locked ones, a row of 11px phase icons and `4 focus · 2h 10m`; on the right
    **Clone** (built-ins) or ✎ (your own), and ▶ Start. **New session** below.
  - Editor: **‹ Sessions** back button (left) and **Lock times / Times locked** (right, accent when
    locked); the name field; one 30px row per step: phase icon (click to change type), label,
    − time +, ↺ (only on steps with their own time), ↑ ↓ ×; a one-line hint; buttons
    + Focus / + Short break / + Long break; bottom row: Delete session, total, ▶ Start.
  - Running: session name and `Step 2 of 6`, the clock and bar, **Pause/Resume**, **Skip**,
    **End session**, and every step (current on `selected`, finished ones `dim` and marked "done").
- **Settings view** (gear): a row per phase — icon, name, `default 25` when changed, − [number
  field] + `min` — then **Restore defaults (25 / 5 / 15)** and **Done**.
- **Floating window** (`mod.open:pomodoro`): the same views in a 340px window on `popover`, with
  the gear at the top left and × at the top right.

## How it behaves

- **Phases and colors**: Focus uses the theme's `accent`, Short break `done`, Long break `working`.
- **Simple**: each phase waits for Start. When focus ends: sound + toast, round +1, then a short
  break, or a long break after the 4th focus (round resets). When a break ends: back to focus.
  Picking a phase tab switches to it (and ends a running session). Skip: focus → short break, any break → focus.
- **Sessions**: Start runs the steps in order; each next step starts by itself the moment the
  previous one ends, with sound + toast (`Next: Short break, 5 min (step 2 of 8)`). After the last
  step: "Session complete" and back to a Simple focus. Skip jumps to the next step (keeps running if
  it was), End session stops it.
- **Built-ins** — Classic (4 × focus/short, last break long; follows Settings), Deep work (50 → 10 →
  50 → 20) and 52 / 17 (52 → 17, twice) — can't be edited or deleted; **Clone** makes an editable
  copy (`Classic copy`, `Classic copy 2`, …) and opens it.
- **Lengths** (gear): Focus 25, Short break 5, Long break 15 by default, 1–180 min. They drive Simple
  and every session step that hasn't got its own time. A waiting Simple phase updates at once; a
  running or paused one keeps its length. During a session, changes apply to the steps still to come.
- **Step times**: grey = follows Settings. − / + (±5, ±1 below 5 min) gives a step its own time
  (white) and shows ↺, which makes it follow Settings again.
- **Lock times**: freezes the session's times as they are now — −/+ and ↺ disappear and Settings
  changes no longer affect it. Unlock to edit again (steps that followed Settings follow again).
  Name and steps (add/remove/reorder/type) still change while locked.
- **Closed panel**: the timer is stored as an end time, so it keeps going with nothing open. A phase
  that ended while no copy was shown is noticed when one opens: toast "… while Pomodoro was closed",
  no sound, and a session then waits on that next step for Resume.
- **Today**: focused time counts while a focus runs (including partial ones paused, reset or
  skipped); "done" counts finished focus phases. Both reset at local midnight; a focus crossing
  midnight counts from midnight.
- **Keys** (optional, `keys.json`): `pomodoro.toggle`, `pomodoro.reset`, `pomodoro.skip`,
  `pomodoro.stop`, `pomodoro.more`, `pomodoro.less`; e.g. `"cmd-alt-p": "mod.open:pomodoro"`.

## Built from

- `mods/pomodoro/main.js` (views), `timer.js` (state, actions, sessions), `mod.json`
  (`place: none`; overlay `kind: window`, `key: pomodoro`, `keep: true`, `width: 340`), and the
  icons `focus short long gear pin reset copy pen play plus back up down x .svg` (Lucide, drawn with
  `svg()` so they take the text color).
- One mod, three roles by props: `{ compact: true }` → the corner chip; `{ panel: true }` → the
  panel card; overlay (`props().overlay`) → the floating window. A plain pane (`pane.split
  {mod: "pomodoro"}`) shows the window view without ×.
- State in shared values: `pomodoro` (phase, running, endsAt, left, total, round, minutes,
  day, sessions, focusMs, run, cmd) and `pomodoro.sessions` (only your own sessions; built-ins live
  in the code). A 1 s `cx.timer` redraws only while running and finishes expired phases.
- `herdr`: `shared`, `setShared`, `notify`, `playSound("done")`, `nextCommand`, `layout`, `run`
  (`layout.select`, `layout.show`, `layout.hide`, `mod.open`), `props().overlay` + `closeOverlay`, `theme`, `settings().font_family`. `gpui-base`: `h_flex`, `v_flex`,
  `InputState`/`Input` (session name, minute fields).
- No network, no programs, no files outside its folder.
- **Adding it to a layout** (clone a shipped one first: `herdr-app do layout.clone
  '{"name":"main","as":"my-main"}'`). In the clone, replace the `tabs` block with this row:
  ```json
  { "id": "tabbar", "type": "row", "size": { "px": 42 }, "resizable": false, "children": [
    { "id": "tabs", "type": "block", "content": { "mod": "tabs" }, "window_drag": true, "size": { "weight": 1 } },
    { "id": "pomodoro-chip", "type": "block", "size": { "px": 92 }, "window_drag": true,
      "content": { "mod": "pomodoro", "props": { "compact": true } } } ] }
  ```
  and add this child to the `panel-body` stack, after `files` and `changes`:
  ```json
  { "id": "pomodoro", "type": "block", "content": { "mod": "pomodoro", "props": { "panel": true } } }
  ```

## Watch out

- Herdr's shipped layouts and mods are read-only; put the blocks in a clone, never in `main.json`.
- The chip finds the panel by the node ids `panel` and `panel-body` (Herdr main's). Without them,
  clicking the chip opens the floating window instead.
- The panel copy adds `"pomodoro"` to the shared `workspace.panels` list so the shipped tab bar
  remembers it per space like Files and Changes; without that, switching spaces closes it.
- `pomodoro.*` key commands reach only shown copies, and every shown copy gets them: actions drop
  a repeat of the same command within 150 ms so one press acts once.
- A phase end is only noticed while some copy is alive (chip, panel, window or pane).
- `herdr-app shot` returns the last painted frame; with Herdr in the background it can be stale.
- Clock math uses end timestamps, never counted ticks; keep it that way or paused/closed time drifts.

## Done when

- `herdr-app check ~/.config/herdr-app/mods/pomodoro` passes.
- The corner chip counts down with the panel hidden, and its icon matches the phase.
- Set Focus to 1 min in the gear, Start: after a minute there is exactly one toast and one sound,
  "Today" counts one more done and one more minute focused, and the timer is on a ready short break.
- Start a session of Focus 1 → Short break 1: the break starts by itself after the focus, then
  "Session complete".
- Lock a session, change Focus in Settings: its total doesn't change; unlock: it does.
- Built-ins show Built-in + Clone and no ✎; Clone opens an editable "… copy".
