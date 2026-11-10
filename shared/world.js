// The world for "Empty Room". Pure: no network, no timers, so every rule is
// testable and the transcript can be rebuilt from actions alone.

export const AGENTS = ["Ada", "Bram", "Cy"];

export function emptyWorld() {
  return {
    tick: 0,
    objects: [
      { name: "a chair", holder: "room" },
      { name: "a scrap of paper", holder: "room" },
      { name: "a pencil", holder: "room" },
    ],
    notes: [],
    log: [],
  };
}

const MAX_NOTES = 40;

// One action, exactly as the model wrote it, applied only if it is possible.
export function applyAction(world, agent, action) {
  const next = {
    ...world,
    objects: world.objects.map((o) => ({ ...o })),
    notes: [...world.notes],
    log: [...world.log],
  };
  const kind = action?.do || "nothing";
  let ok = true;
  let detail = "";

  const held = next.objects.find((o) => o.holder === agent);
  if (kind === "pick_up") {
    const target = matchObject(next, action.target);
    if (!target) {
      ok = false;
      detail = `there is no ${action.target || "object"} to pick up`;
    } else if (target.holder !== "room") {
      ok = false;
      detail = `${target.name} is not on the floor`;
    } else {
      target.holder = agent;
      detail = `picked up ${target.name}`;
    }
  } else if (kind === "put_down") {
    const target = held || matchObject(next, action.target);
    if (!target) {
      ok = false;
      detail = "nothing in hand to put down";
    } else {
      target.holder = "room";
      detail = `put down ${target.name}`;
    }
  } else if (kind === "write_note") {
    const text = String(action.text || "").trim().slice(0, 140);
    if (!text) {
      ok = false;
      detail = "wrote nothing";
    } else {
      next.notes.push({ agent, text, tick: next.tick });
      if (next.notes.length > MAX_NOTES) next.notes.shift();
      detail = "wrote a note";
    }
  } else if (kind === "nothing") {
    detail = held ? `stood there holding ${held.name}` : "stood there";
  } else {
    ok = false;
    detail = `cannot ${kind}`;
  }

  const say = String(action?.say || "").trim().slice(0, 200);
  next.tick += 1;
  next.log.push({ tick: next.tick, agent, say, do: kind, detail, ok });
  return next;
}

function matchObject(world, name) {
  if (!name) return null;
  const wanted = String(name).toLowerCase().replace(/^(a|an|the)\s+/, "").trim();
  if (!wanted) return null;
  const exact = world.objects.find((o) => {
    const plain = o.name.toLowerCase().replace(/^(a|an|the)\s+/, "");
    return plain === wanted;
  });
  if (exact) return exact;
  // "paper" should still find "a scrap of paper"
  return world.objects.find((o) => o.name.toLowerCase().includes(wanted)) || null;
}

export function addObject(world, name) {
  const clean = String(name || "").trim().slice(0, 40);
  if (!clean) return world;
  const label = /^(a|an|the)\s/i.test(clean) ? clean.toLowerCase() : `a ${clean.toLowerCase()}`;
  if (world.objects.some((o) => o.name === label)) return world;
  return {
    ...world,
    objects: [...world.objects, { name: label, holder: "room" }],
    log: [...world.log, { tick: world.tick, agent: "you", say: `put ${label} in the room`, do: "add", detail: "added", ok: true }],
  };
}

// Exactly what the model sees: the room, who holds what, the notes, and the last
// few things said. No instructions about what to feel or want.
export function observe(world, agent) {
  const held = world.objects.filter((o) => o.holder === agent).map((o) => o.name);
  return {
    you: agent,
    present: AGENTS,
    tick: world.tick,
    on_the_floor: world.objects.filter((o) => o.holder === "room").map((o) => o.name),
    in_your_hands: held,
    held_by_others: world.objects
      .filter((o) => o.holder !== "room" && o.holder !== agent)
      .map((o) => `${o.name} (${o.holder})`),
    notes: world.notes.map((n) => `${n.agent}: ${n.text}`),
    recent: world.log.slice(-6).map((row) => `${row.agent} ${row.do === "nothing" ? "did nothing" : row.detail}${row.say ? `, said "${row.say}"` : ""}`),
    available: ["pick_up", "put_down", "write_note", "nothing"],
  };
}

export function prompt(agent) {
  return [
    `You are ${agent}, in a plain room with two others. Nothing here was assigned to any of you.`,
    "You can speak one line and take one action this turn.",
    "Reply with JSON only, no markdown:",
    '{"say": "at most 15 words spoken aloud", "do": "pick_up|put_down|write_note|nothing", "target": "object name if picking up or putting down", "text": "note text only for write_note"}',
    "The room checks the action: picking up something already held, or putting down nothing, is refused.",
  ].join("\n");
}

export function parseAction(text) {
  const raw = String(text || "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    if (typeof parsed !== "object" || parsed === null) return null;
    return {
      say: typeof parsed.say === "string" ? parsed.say : "",
      do: typeof parsed.do === "string" ? parsed.do : "nothing",
      target: typeof parsed.target === "string" ? parsed.target : "",
      text: typeof parsed.text === "string" ? parsed.text : "",
    };
  } catch {
    return null;
  }
}
