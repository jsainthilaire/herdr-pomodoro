// A pomodoro timer with two interfaces: Simple (focus, short break, long
// break after every 4th) and Session (a saved list of focus and break steps
// that run one after another). The timer itself is in ./timer.js.
// Open it with mod.open:pomodoro (a window), pane.split {mod: "pomodoro"}, as a
// layout block with props {panel: true} (a side panel card) or {compact: true}
// (a small timer that opens the panel).

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { theme, settings, props, shared, setShared, closeOverlay, notify, playSound, nextCommand, layout, run } from "herdr";
import { KEY, PHASES, DEFAULT_MINUTES, ROUNDS, ACTIONS, load, save, remaining, untouched, clock, hours, focusedSoFar,
  finish, sessions, saveSessions, summary, stepMin, lengthsOf, clone, MAX_MINUTES } from "./timer.js";

const KEYED = ["toggle", "reset", "skip", "stop", "more", "less"];
const ORDER = ["focus", "short", "long"];
const icon = (name) => `mods/pomodoro/${name}.svg`;

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class Pomodoro extends View {
  init(_props, cx) {
    // The tab bar remembers each space's open panel, but only panels listed here.
    const panels = shared("workspace.panels");
    if (props()?.panel && Array.isArray(panels) && !panels.includes("pomodoro")) setShared("workspace.panels", [...panels, "pomodoro"]);
    this.tab = null;
    this.editing = null;
    this.name = InputState.new({ placeholder: "Session name" });
    this.name.on("change", () => this.edit((se) => { se.name = this.name.value(); }));
    // Settings: one number field per phase length.
    this.settings = false;
    this.lengths = {};
    for (const phase of ORDER) {
      const input = InputState.new({ placeholder: String(DEFAULT_MINUTES[phase]) });
      input.on("change", () => {
        const min = parseInt(input.value(), 10);
        if (min > 0 && min !== load().minutes[phase]) this.act("minutes", { phase, min });
      });
      input.on("blur", () => input.set_value(String(load().minutes[phase])));
      this.lengths[phase] = input;
    }
    this.tick();
    cx.timer.every(1000, (cx) => {
      if (this.tick()) cx.notify();
    });
    // keys.json: "pomodoro.toggle" | reset | skip | stop | more | less. Every shown
    // copy gets the key, so one press acts once: copies drop a repeat within 150 ms.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (KEYED.includes(c)) this.act(c, undefined, true);
        cx.notify();
      }
    });
  }

  // Finishes a phase whose time is up (whichever copy sees it first) and
  // says whether the clock is running, so the copy redraws its seconds.
  tick() {
    const s = load();
    if (shared(KEY) && s.day !== shared(KEY).day) save(s);
    if (!s.running) return false;
    if (Date.now() < s.endsAt) return true;
    const toast = finish(s, Date.now());
    save(s);
    if (toast) {
      if (!toast.late) playSound("done");
      notify({ title: toast.title, body: toast.body, level: toast.level, timeout: 8000 });
    }
    return s.running;
  }

  act(name, arg, key = false) {
    this.tick();
    const s = load();
    const now = Date.now();
    if (key) {
      if (s.cmd && s.cmd.name === name && now - s.cmd.at < 150) return;
      s.cmd = { name, at: now };
    }
    ACTIONS[name](s, now, arg);
    save(s);
  }

  // Changes the session being edited, in the saved list. Built-ins never are.
  edit(change) {
    const list = sessions().map((se) => ({ ...se, steps: se.steps.map((st) => ({ ...st })) }));
    const se = list.find((x) => x.id === this.editing && !x.builtin);
    if (!se) return;
    change(se, list);
    saveSessions(list.filter((x) => !x.deleted));
  }

  open(id, name) {
    this.editing = id;
    this.name.set_value(name);
  }

  create() {
    const list = sessions();
    const id = `s${Date.now()}`, name = `Session ${list.filter((x) => !x.builtin).length + 1}`;
    saveSessions([...list, { id, name, v: 2, steps: [{ phase: "focus", min: null }, { phase: "short", min: null }] }]);
    this.open(id, name);
  }

  // A built-in's editable copy, opened in the editor.
  copy(se) {
    const list = sessions(), copy = clone(se, list);
    saveSessions([...list, copy]);
    this.open(copy.id, copy.name);
  }

  // Shows the Pomodoro panel in the layout's side panel, or hides it if it's showing.
  togglePanel() {
    const panel = find(layout(), "panel"), body = find(layout(), "panel-body");
    if (!panel || !body?.children?.some((c) => c.id === "pomodoro")) return run("mod.open", { name: "pomodoro" });
    if (!panel.hidden && body.active === "pomodoro") return run("layout.hide", { id: "panel" });
    run("layout.select", { stack: "panel-body", child: "pomodoro" });
    run("layout.show", { id: "panel" });
  }

  render() {
    const p = props() ?? {};
    if (p.compact) return this.chip();
    const t = theme();
    const s = load();
    const now = Date.now();
    const tab = this.tab ?? (s.run ? "session" : "simple");
    const focusedToday = s.focusMs + (s.running ? focusedSoFar(s, now) : 0);
    const ui = this.kit(t);

    const tabs = h_flex().p(3).gap(2).rounded(8).bg(t.raised).self_center().children(["simple", "session"].map((k) =>
      ui.press(div().id(`tab-${k}`).px(14).py(4).rounded(6).cursor_pointer()
        .when(tab === k, (el) => el.bg(t.background).text_color(t.foreground))
        .when(tab !== k, (el) => el.text_color(t.muted).hover((st) => st.text_color(t.foreground)))
        .on_click((_e, cx) => { this.tab = k; cx.notify(); })
        .child(k === "simple" ? "Simple" : "Session"))));
    const content = this.settings ? [this.config(t, s, ui)]
      : [tabs, tab === "simple" ? this.simple(t, s, ui) : s.run ? this.running(t, s, ui) : this.editing && sessions().some((x) => x.id === this.editing && !x.builtin) ? this.editor(t, s, ui) : this.list(t, s, ui)];
    const gear = ui.small("settings", svg(icon("gear")).size(13).when(this.settings, (el) => el.text_color(t.foreground)), () => this.toggleSettings());
    const dots = s.run
      ? h_flex().gap(3).children(s.run.steps.map((st, i) => div().size(6).rounded(3).bg(i <= s.run.step ? t[PHASES[st.phase].color] ?? t.accent : t.border)))
      : h_flex().gap(3).children(Array.from({ length: ROUNDS }, (_, i) => div().size(6).rounded(3).bg(i < s.round ? t[PHASES[s.phase].color] ?? t.accent : t.border)));
    const today = `Today: ${s.sessions} done · ${hours(focusedToday)} focused`;
    const idle = untouched(s);

    // In the side panel: a card like Files and Changes.
    if (p.panel) {
      return v_flex().id("root").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border)
        .text_size(12).text_color(t.foreground)
        .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
          .child(div().text_size(13).font_semibold().child("Pomodoro"))
          .child(div().px(5).py(1).rounded(4).border_1().border_color(t.border).text_size(10).text_color(t.muted)
            .child(s.running ? "Running" : idle ? "Ready" : "Paused"))
          .child(div().flex_1())
          .child(gear)
          .child(ui.small("close", svg(icon("x")).size(13), () => run("layout.hide", { id: "panel" }))))
        .child(v_flex().id("body").flex_1().min_h(0).overflow_y_scrollbar().p(16).gap(14).children(content))
        .child(h_flex().flex_none().px(14).h(36).items_center().gap(8).border_t(1).border_color(t.border).text_size(11).text_color(t.dim)
          .child(dots).child(div().flex_1()).child(today));
    }

    const overlay = p.overlay;
    return v_flex().id("root").size_full().min_w(240).p(14).gap(12).bg(t.popover).text_size(12).text_color(t.foreground)
      .child(h_flex().items_center().child(gear).child(div().flex_1().flex().justify_center().when(!this.settings, (el) => el.child(tabs)))
        .child(overlay ? ui.small("close", svg(icon("x")).size(13), () => closeOverlay(overlay)) : div().w(22)))
      .children(content.slice(this.settings ? 0 : 1))
      .child(h_flex().items_center().gap(6).text_size(11).text_color(t.dim).child(dots).child(div().flex_1()).child(today));
  }

  toggleSettings() {
    this.settings = !this.settings;
    const { minutes } = load();
    if (this.settings) for (const phase of ORDER) this.lengths[phase].set_value(String(minutes[phase]));
  }

  // Each phase's length for Simple and for new session steps; 25 / 5 / 15 unless changed.
  config(t, s, ui) {
    const step = (phase, delta) => {
      this.act("minutes", { phase, min: load().minutes[phase] + delta });
      this.lengths[phase].set_value(String(load().minutes[phase]));
    };
    const changed = ORDER.some((phase) => s.minutes[phase] !== DEFAULT_MINUTES[phase]);
    return v_flex().gap(12)
      .child(v_flex().gap(3)
        .child(div().text_size(13).font_semibold().child("Lengths"))
        .child(div().text_size(11).text_color(t.dim).child("For Simple and every session step that isn't pinned. Pinned steps (Deep work, 52 / 17) keep their own.")))
      .child(v_flex().gap(4).children(ORDER.map((phase) =>
        h_flex().h(34).px(8).gap(6).items_center().rounded(7).border_1().border_color(t.border)
          .child(svg(icon(phase)).size(14).text_color(t[PHASES[phase].color] ?? t.accent))
          .child(div().flex_1().min_w(0).truncate().child(PHASES[phase].label))
          .when(s.minutes[phase] !== DEFAULT_MINUTES[phase], (el) => el.child(div().text_size(10).text_color(t.dim).child(`default ${DEFAULT_MINUTES[phase]}`)))
          .child(ui.small(`len-less-${phase}`, "−", () => step(phase, -1)))
          .child(ui.press(div().id(`len-${phase}`).w(40).h(24).px(6).flex().items_center().rounded(5)
            .border_1().border_color(t.input).cursor_text().font_family(settings().font_family ?? "JetBrains Mono")
            .child(Input.new(this.lengths[phase]).h_full().text_size(12).text_color(t.foreground))))
          .child(ui.small(`len-more-${phase}`, "+", () => step(phase, 1)))
          .child(div().w(24).text_size(11).text_color(t.dim).child("min")))))
      .child(h_flex().gap(8).items_center()
        .child(ui.press(div().id("defaults").py(6).text_size(11).cursor_pointer()
          .text_color(changed ? t.muted : t.dim).hover((x) => x.text_color(t.foreground))
          .on_click((_e, cx) => {
            this.act("defaults");
            for (const phase of ORDER) this.lengths[phase].set_value(String(DEFAULT_MINUTES[phase]));
            cx.notify();
          })
          .child(`Restore defaults (${ORDER.map((p) => DEFAULT_MINUTES[p]).join(" / ")})`)))
        .child(div().flex_1())
        .child(ui.button("settings-done", "Done", true, () => { this.settings = false; })));
  }

  // Shared bits of UI. Controls stop the press, so a window is dragged only by its background.
  kit(t) {
    const press = (el) => el.on_mouse_down("left", (_e, cx) => cx.stop_propagation());
    return {
      press,
      button: (id, label, primary, onClick) =>
        press(h_flex().id(id).h(30).px(12).gap(6).items_center().justify_center().rounded(7).cursor_pointer()
          .bg(primary ? t.solid : t.raised).text_color(primary ? t.solid_foreground : t.foreground)
          .hover((st) => st.opacity(0.88)).on_click((_e, cx) => { onClick(); cx.notify(); }).children([].concat(label))),
      small: (id, label, onClick) =>
        press(h_flex().id(id).size(22).flex_none().items_center().justify_center().rounded(5).cursor_pointer()
          .text_color(t.muted).hover((st) => st.bg(t.hover).text_color(t.foreground)).on_click((_e, cx) => { onClick(); cx.notify(); }).child(label)),
    };
  }

  // The big clock, its progress bar and (Simple, before it starts) −/+ for its length.
  clockFace(t, s, ui, adjustable) {
    const left = remaining(s);
    const done = Math.min(1, Math.max(0, 1 - left / s.total));
    return [
      h_flex().items_center().justify_center().gap(8)
        .child(ui.small("less", adjustable ? "−" : "", () => this.act("less")))
        .child(div().text_size(46).font_semibold().font_family(settings().font_family ?? "JetBrains Mono")
          .text_color(s.running ? t.foreground : t.muted).child(clock(left)))
        .child(ui.small("more", adjustable ? "+" : "", () => this.act("more"))),
      div().w_full().h(4).rounded(2).bg(t.raised)
        .child(div().h_full().w(`${(done * 100).toFixed(2)}%`).rounded(2).bg(t[PHASES[s.phase].color] ?? t.accent)),
    ];
  }

  simple(t, s, ui) {
    const phases = h_flex().items_center().justify_center().gap(4)
      .children(ORDER.map((key) =>
        ui.press(h_flex().id(`phase-${key}`).px(8).py(3).gap(5).items_center().rounded(6).cursor_pointer()
          .when(s.phase === key && !s.run, (el) => el.bg(t.selected))
          .text_color(s.phase === key && !s.run ? t.foreground : t.muted)
          .hover((st) => st.bg(t.hover)).on_click(() => this.act("pick", key))
          .child(svg(icon(key)).size(12).text_color(s.phase === key && !s.run ? t[PHASES[key].color] ?? t.accent : t.dim))
          .child(PHASES[key].label))));
    return v_flex().gap(14)
      .child(phases)
      .when(Boolean(s.run), (el) => el.child(div().text_size(11).text_color(t.dim).text_center()
        .child(`Session “${s.run.name}” is running. Picking a phase ends it.`)))
      .children(this.clockFace(t, s, ui, !s.run && untouched(s)))
      .child(h_flex().gap(8).justify_center()
        .child(ui.button("toggle", s.running ? "Pause" : untouched(s) ? "Start" : "Resume", true, () => this.act("toggle")))
        .child(ui.button("reset", "Reset", false, () => this.act("reset")))
        .child(ui.button("skip", "Skip", false, () => this.act("skip"))));
  }

  // A session in progress: its clock and every step, the current one marked.
  running(t, s, ui) {
    const { name, steps, step } = s.run;
    return v_flex().gap(14)
      .child(h_flex().items_center().gap(8)
        .child(div().flex_1().min_w(0).truncate().text_size(13).font_semibold().child(name))
        .child(div().text_size(11).text_color(t.dim).child(`Step ${step + 1} of ${steps.length}`)))
      .children(this.clockFace(t, s, ui, false))
      .child(h_flex().gap(8).justify_center()
        .child(ui.button("toggle", s.running ? "Pause" : "Resume", true, () => this.act("toggle")))
        .child(ui.button("skip", "Skip", false, () => this.act("skip")))
        .child(ui.button("stop", "End session", false, () => this.act("stop"))))
      .child(v_flex().gap(2).children(steps.map((st, i) => {
        const color = t[PHASES[st.phase].color] ?? t.accent;
        return h_flex().h(26).px(8).gap(8).items_center().rounded(6)
          .when(i === step, (el) => el.bg(t.selected))
          .text_color(i < step ? t.dim : i === step ? t.foreground : t.muted)
          .child(svg(icon(st.phase)).size(13).text_color(i === step ? color : i < step ? t.dim : t.muted))
          .child(div().flex_1().child(PHASES[st.phase].label))
          .child(div().text_color(t.dim).child(i < step ? "done" : `${i === step ? s.total / 60000 : stepMin(s.minutes, st)} min`));
      })));
  }

  list(t, s, ui) {
    const list = sessions();
    return v_flex().gap(6)
      .children(list.map((se) => h_flex().id(`session-${se.id}`).px(10).py(8).gap(8).items_center().rounded(8)
        .border_1().border_color(t.border)
        .child(v_flex().flex_1().min_w(0).gap(4)
          .child(h_flex().gap(6).items_center().min_w(0)
            .child(div().truncate().text_size(13).font_semibold().child(se.name || "Untitled"))
            .when(Boolean(se.locked), (el) => el.child(svg(icon("pin")).size(11).flex_none().text_color(t.muted)))
            .when(Boolean(se.builtin), (el) => el.child(div().flex_none().px(5).rounded(4).border_1().border_color(t.border)
              .text_size(10).text_color(t.dim).child("Built-in"))))
          .child(h_flex().gap(3).items_center()
            .children(se.steps.slice(0, 12).map((st) => svg(icon(st.phase)).size(11).text_color(t[PHASES[st.phase].color] ?? t.accent)))
            .child(div().pl(4).text_size(11).text_color(t.dim).child(summary(se, s.minutes)))))
        .child(se.builtin
          ? ui.button(`clone-${se.id}`, [svg(icon("copy")).size(12), "Clone"], false, () => this.copy(se))
          : ui.small(`edit-${se.id}`, svg(icon("pen")).size(13), () => this.open(se.id, se.name)))
        .child(ui.button(`start-${se.id}`, svg(icon("play")).size(12), true, () => {
          this.act("begin", se);
          this.tab = "session";
        }))))
      .when(!list.length, (el) => el.child(div().py(6).text_color(t.dim).text_center().child("No sessions yet")))
      .child(h_flex().justify_center().pt(4)
        .child(ui.button("new", [svg(icon("plus")).size(13), "New session"], false, () => this.create())));
  }

  editor(t, s, ui) {
    const se = sessions().find((x) => x.id === this.editing && !x.builtin);
    const set = (i, change) => this.edit((x) => change(x.steps[i], x.steps));
    const lengths = lengthsOf(se, s.minutes);
    const locked = Boolean(se.locked);
    const add = (phase) => this.edit((x) => x.steps.push({ phase, min: null }));
    const lock = () => this.edit((x) => {
      if (x.locked) delete x.locked;
      else x.locked = { ...load().minutes };
    });
    // −/+ gives a step its own length; ↺ makes it follow Settings again.
    const nudge = (i, up) => set(i, (x) => {
      const min = stepMin(lengths, x);
      x.min = up ? Math.min(MAX_MINUTES, min < 5 ? min + 1 : min + 5) : Math.max(1, min > 5 ? min - 5 : min - 1);
    });
    return v_flex().gap(10)
      .child(h_flex().items_center().justify_between()
        .child(ui.press(h_flex().id("back").h(26).pl(4).pr(10).gap(4).items_center().rounded(6).cursor_pointer()
          .text_color(t.muted).hover((x) => x.bg(t.hover).text_color(t.foreground))
          .on_click((_e, cx) => { this.editing = null; cx.notify(); })
          .child(svg(icon("back")).size(14)).child("Sessions")))
        .child(ui.press(h_flex().id("lock").h(26).px(8).gap(5).items_center().rounded(6).cursor_pointer().border_1()
          .border_color(locked ? t.accent : t.border).text_color(locked ? t.accent : t.muted)
          .hover((x) => x.bg(t.hover)).on_click((_e, cx) => { lock(); cx.notify(); })
          .child(svg(icon("pin")).size(12)).child(locked ? "Times locked" : "Lock times"))))
      .child(ui.press(div().id("name").w_full().h(30).px(10).flex().items_center().rounded(7)
        .border_1().border_color(t.input).cursor_text()
        .child(Input.new(this.name).h_full().text_size(13).text_color(t.foreground))))
      .child(v_flex().gap(2).children(se.steps.map((st, i) =>
        h_flex().h(30).px(4).gap(4).items_center().rounded(6).hover((x) => x.bg(t.hover))
          .child(ui.small(`phase-${i}`, svg(icon(st.phase)).size(13).text_color(t[PHASES[st.phase].color] ?? t.accent), () => set(i, (x) => {
            x.phase = ORDER[(ORDER.indexOf(x.phase) + 1) % ORDER.length];
          })))
          .child(div().flex_1().min_w(0).truncate().child(PHASES[st.phase].label))
          .child(locked ? div().w(22).flex_none() : ui.small(`less-${i}`, "−", () => nudge(i, false)))
          .child(div().w(42).text_center().font_family(settings().font_family ?? "JetBrains Mono")
            .text_color(locked || st.min != null ? t.foreground : t.muted).child(`${stepMin(lengths, st)}m`))
          .child(locked ? div().w(22).flex_none() : ui.small(`more-${i}`, "+", () => nudge(i, true)))
          .child(locked || st.min == null ? div().w(22).flex_none()
            : ui.small(`follow-${i}`, svg(icon("reset")).size(12), () => set(i, (x) => { x.min = null; })))
          .child(ui.small(`up-${i}`, svg(icon("up")).size(13), () => set(i, (_x, all) => { if (i > 0) [all[i - 1], all[i]] = [all[i], all[i - 1]]; })))
          .child(ui.small(`down-${i}`, svg(icon("down")).size(13), () => set(i, (_x, all) => { if (i < all.length - 1) [all[i + 1], all[i]] = [all[i], all[i + 1]]; })))
          .child(ui.small(`remove-${i}`, svg(icon("x")).size(13), () => this.edit((x) => x.steps.splice(i, 1)))))))
      .when(!se.steps.length, (el) => el.child(div().py(4).text_color(t.dim).text_center().child("Add a step to begin")))
      .when(se.steps.length > 0, (el) => el.child(div().text_size(11).text_color(t.dim)
        .child(locked ? "Times are locked. Settings changes won't affect them."
          : "Grey times follow Settings. −/+ sets a step's own time; ↺ undoes it.")))
      .child(h_flex().gap(6).justify_center()
        .children(ORDER.map((phase) => ui.button(`add-${phase}`, [svg(icon(phase)).size(12).text_color(t[PHASES[phase].color] ?? t.accent), `+ ${PHASES[phase].label}`], false, () => add(phase)))))
      .child(h_flex().items_center().gap(8).pt(4).border_t(1).border_color(t.border)
        .child(ui.press(div().id("delete").py(6).text_size(11).text_color(t.dim).cursor_pointer().hover((x) => x.text_color(t.blocked))
          .on_click((_e, cx) => { this.edit((x) => { x.deleted = true; }); this.editing = null; cx.notify(); }).child("Delete session")))
        .child(div().flex_1())
        .child(div().text_size(11).text_color(t.dim).child(summary(se, lengths)))
        .when(se.steps.length > 0, (el) => el.child(ui.button("start", [svg(icon("play")).size(12), "Start"], true, () => {
          this.editing = null;
          this.act("begin", se);
        }))));
  }

  // The tab bar's corner: the phase's icon and the time left, in the phase's color while it runs.
  // A click opens or closes the panel.
  chip() {
    const t = theme();
    const s = load();
    const color = t[PHASES[s.phase].color] ?? t.accent;
    const panel = find(layout(), "panel"), body = find(layout(), "panel-body");
    const on = panel && !panel.hidden && body?.active === "pomodoro";
    return h_flex().id("root").size_full().pr(10).items_center().justify_end().bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id("chip").h(26).px(8).gap(6).flex_none().items_center().rounded(6).cursor_pointer()
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(s.running ? t.foreground : t.muted)
        .hover((st) => st.bg(t.hover))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(() => this.togglePanel())
        .child(svg(icon(s.phase)).size(14).text_color(s.running ? color : t.muted))
        .child(div().font_family(settings().font_family ?? "JetBrains Mono").child(clock(remaining(s)))));
  }
}
