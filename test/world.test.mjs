import test from "node:test";
import assert from "node:assert/strict";
import { emptyWorld, applyAction, addObject, observe, prompt, parseAction, AGENTS } from "../shared/world.js";

test("the room starts with three agents, nothing to do and three objects", () => {
  const world = emptyWorld();
  assert.equal(world.tick, 0);
  assert.equal(world.objects.length, 3);
  assert.ok(world.objects.every((o) => o.holder === "room"));
  assert.equal(AGENTS.length, 3);
});

test("picking up moves the object into the agent's hands", () => {
  const world = applyAction(emptyWorld(), "Ada", { do: "pick_up", target: "chair", say: "mine now" });
  assert.equal(world.objects.find((o) => o.name === "a chair").holder, "Ada");
  assert.equal(world.log.at(-1).ok, true);
  assert.equal(world.tick, 1);
});

test("an object cannot be picked up twice", () => {
  let world = applyAction(emptyWorld(), "Ada", { do: "pick_up", target: "a pencil" });
  world = applyAction(world, "Bram", { do: "pick_up", target: "pencil" });
  assert.equal(world.log.at(-1).ok, false);
  assert.equal(world.objects.find((o) => o.name === "a pencil").holder, "Ada");
});

test("putting down returns the held object to the floor", () => {
  let world = applyAction(emptyWorld(), "Cy", { do: "pick_up", target: "paper" });
  world = applyAction(world, "Cy", { do: "put_down" });
  assert.equal(world.log.at(-1).ok, true);
  assert.equal(world.objects.find((o) => o.name === "a scrap of paper").holder, "room");
});

test("writing a note records it with the agent and tick", () => {
  const world = applyAction(emptyWorld(), "Bram", { do: "write_note", text: "rule: nobody sits" });
  assert.equal(world.notes.length, 1);
  assert.equal(world.notes[0].agent, "Bram");
  assert.equal(world.log.at(-1).ok, true);
});

test("an unknown action is refused instead of throwing", () => {
  const world = applyAction(emptyWorld(), "Ada", { do: "fly", target: "" });
  assert.equal(world.log.at(-1).ok, false);
  assert.match(world.log.at(-1).detail, /cannot fly/);
});

test("doing nothing still advances the tick and records the line", () => {
  const world = applyAction(emptyWorld(), "Ada", { do: "nothing", say: "hello" });
  assert.equal(world.tick, 1);
  assert.equal(world.log.at(-1).say, "hello");
});

test("adding an object normalises the name and appears on the floor", () => {
  const world = addObject(emptyWorld(), "ball");
  assert.ok(world.objects.some((o) => o.name === "a ball" && o.holder === "room"));
  const again = addObject(world, "a ball");
  assert.equal(again.objects.length, world.objects.length);
});

test("the observed state never tells the agent what to want", () => {
  const world = addObject(emptyWorld(), "radio");
  const facts = observe(world, "Ada");
  assert.equal(facts.you, "Ada");
  assert.ok(facts.on_the_floor.includes("a radio"));
  const text = JSON.stringify(facts).toLowerCase();
  for (const banned of ["goal", "win", "reward", "should", "must"]) {
    assert.ok(!text.includes(banned), `state leaked "${banned}"`);
  }
  assert.ok(prompt("Ada").includes("Nothing here was assigned"));
});

test("parseAction survives chatty models and rejects junk", () => {
  assert.deepEqual(parseAction('Sure! {"say":"hi","do":"nothing"} hope that helps'), {
    say: "hi",
    do: "nothing",
    target: "",
    text: "",
  });
  assert.equal(parseAction("no json here"), null);
  assert.deepEqual(parseAction('{"do":"pick_up","target":"chair"}'), {
    say: "",
    do: "pick_up",
    target: "chair",
    text: "",
  });
  assert.equal(parseAction('{"do":'), null);
});
