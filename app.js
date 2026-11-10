import * as pollen from "./shared/pollen.js";
import { AGENTS, emptyWorld, applyAction, addObject, observe, prompt, parseAction } from "./shared/world.js";

const MODEL = "openai/gpt-5.4-nano";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

let world = emptyWorld();
let running = false;
let autoTimer = null;
let pollTimer = null;

function render() {
  const room = $("room");
  room.replaceChildren();
  for (const agent of AGENTS) {
    const card = el("article", "agent");
    const head = el("div", "agent-head");
    head.append(el("span", "dot"), el("strong", null, agent));
    card.append(head);
    const held = world.objects.filter((o) => o.holder === agent);
    card.append(el("p", "held", held.length ? `holding ${held.map((o) => o.name).join(", ")}` : "empty-handed"));
    const last = [...world.log].reverse().find((row) => row.agent === agent);
    card.append(el("p", "last", last ? (last.say || last.detail) : "has not moved"));
    card.dataset.agent = agent;
    room.append(card);
  }

  const notes = $("notes");
  notes.replaceChildren();
  if (!world.notes.length) notes.append(el("li", "muted", "nothing written yet"));
  for (const note of world.notes.slice(-8)) {
    const li = el("li");
    li.append(el("strong", null, `${note.agent}: `), document.createTextNode(note.text));
    notes.append(li);
  }

  const floor = world.objects.filter((o) => o.holder === "room");
  $("hint").textContent = floor.length
    ? `On the floor: ${floor.map((o) => o.name).join(", ")}.`
    : "The floor is empty. They still have each other.";
  $("tick").textContent = `tick ${world.tick}`;
  $("transcript").replaceChildren();
  for (const row of [...world.log].reverse().slice(0, 40)) {
    const li = el("li", `line ${row.ok ? "" : "refused"}`.trim());
    const head = el("div", "line-head");
    head.append(el("span", `who ${row.agent === "you" ? "you" : ""}`, row.agent), el("span", "what", row.do === "nothing" ? "did nothing" : row.detail));
    li.append(head);
    if (row.say) li.append(el("p", "say", `“${row.say}”`));
    $("transcript").append(li);
  }
}

async function turn() {
  if (running) return;
  if (!pollen.connected()) {
    openConnect("Connect your Pollen first: each turn is three cheap calls.");
    return;
  }
  running = true;
  $("step").disabled = true;
  $("auto").disabled = true;
  for (const agent of AGENTS) {
    document.querySelector(`[data-agent="${agent}"]`)?.classList.add("thinking");
    try {
      const facts = observe(world, agent);
      const { text } = await pollen.ask(MODEL, `${prompt(agent)}\n\nState:\n${JSON.stringify(facts, null, 1)}`, {
        maxTokens: 400,
        temperature: 0.8,
      });
      const action = parseAction(text) || { say: "", do: "nothing", target: "", text: "" };
      world = applyAction(world, agent, action);
    } catch (error) {
      world = {
        ...world,
        log: [...world.log, { tick: world.tick, agent, say: "", do: "error", detail: error.message, ok: false }],
      };
    }
    document.querySelector(`[data-agent="${agent}"]`)?.classList.remove("thinking");
    render();
    await new Promise((r) => setTimeout(r, 350));
  }
  running = false;
  $("step").disabled = false;
  $("auto").disabled = false;
}

function toggleAuto() {
  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
    $("auto").textContent = "Leave them alone";
    $("auto").classList.remove("on");
    return;
  }
  $("auto").textContent = "Stop watching";
  $("auto").classList.add("on");
  turn();
  autoTimer = setInterval(() => {
    if (!running) turn();
  }, 9000);
}

function drop() {
  const value = $("drop").value.trim();
  if (!value) return;
  world = addObject(world, value);
  $("drop").value = "";
  render();
}

function openConnect(message) {
  if (message) $("connect-msg").textContent = message;
  const dialog = $("connect");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function syncPill() {
  const pill = $("pollen-pill");
  pill.textContent = pollen.connected() ? "Pollen connected" : "Connect Pollen";
  pill.classList.toggle("on", pollen.connected());
}

async function connectDevice() {
  if (pollTimer) clearInterval(pollTimer);
  $("connect-msg").textContent = "";
  $("device").disabled = true;
  try {
    const { userCode, verify } = await pollen.startDevice();
    const box = $("device-code");
    box.hidden = false;
    box.replaceChildren();
    box.append(el("span", "code-label", "Enter this code at the sign-in page:"), el("strong", "code-value", userCode));
    const link = el("a", "ghost wide", "Open the sign-in page");
    link.href = verify;
    link.target = "_blank";
    link.rel = "noopener";
    box.append(link);
    $("connect-msg").textContent = "Waiting for you to approve…";
    pollTimer = setInterval(async () => {
      const result = await pollen.pollDevice();
      if (result.state === "connected") {
        clearInterval(pollTimer);
        pollTimer = null;
        $("connect-msg").textContent = "Connected. This tab can spend your Pollen now.";
        syncPill();
        setTimeout(() => $("connect").close(), 1200);
      } else if (result.state === "expired" || result.state === "error") {
        clearInterval(pollTimer);
        pollTimer = null;
        $("connect-msg").textContent = result.message || "The code expired. Try again.";
      }
    }, 4000);
  } catch (error) {
    $("connect-msg").textContent = `Could not start sign-in: ${error.message}`;
  } finally {
    $("device").disabled = false;
  }
}

function useKey() {
  try {
    pollen.useKey($("sk").value);
    $("connect-msg").textContent = "Key accepted for this tab.";
    syncPill();
  } catch (error) {
    $("connect-msg").textContent = error.message;
  }
}

function init() {
  render();
  syncPill();
  $("step").addEventListener("click", turn);
  $("auto").addEventListener("click", toggleAuto);
  $("drop-btn").addEventListener("click", drop);
  $("drop").addEventListener("keydown", (event) => {
    if (event.key === "Enter") drop();
  });
  $("pollen-pill").addEventListener("click", () => openConnect());
  $("device").addEventListener("click", connectDevice);
  $("use-sk").addEventListener("click", useKey);
  $("close-connect").addEventListener("click", () => $("connect").close());
}

init();
