# Anthill

**Raise an ant colony from a handful of workers to an underground empire.**

Anthill is a small strategy game about ants that runs right in your browser. Your workers find
food on their own by following scent trails — you decide how the colony grows: what to dig under
the ground, what to research, how many soldiers to raise and when to go to war with the red
colony next door.

## How to play

Open **`index.html`** in Chrome, Edge or Firefox — just double-click it. Nothing to install, no
internet needed. Pick a difficulty and press **Start colony**.

| Difficulty | What to expect |
| --- | --- |
| **Peaceful** | No enemies. Watch the colony grow and experiment. |
| **Normal** | A rival red colony and the occasional hungry spider. |
| **Hard** | A stronger rival that attacks sooner, and more spiders. |

You lose if your queen dies or every ant is gone. On Normal and Hard you win by destroying the
red colony's queen.

## Your colony

**Ants find food by themselves.** Searching ants leave a **blue** scent that leads home; ants
carrying food leave a **green** one that leads back to the food. Others follow these scents, so
busy ant roads appear on their own. Wounded ants release a **red** alarm scent that calls
soldiers. Rain washes trails away. If a trail leads nowhere, ants eventually give up on it and
explore elsewhere.

**Three kinds of ants:**

- **Workers** gather food. Some of them stay inside the nest to nurse the brood, dig chambers and
  tend gardens — the young ones; old workers go out to forage.
- **Soldiers** guard the nest, fight spiders and raiders, and go wherever you place a rally point.
- **The queen** lays the eggs. Egg → larva → pupa → ant takes about half a minute. Protect her: if
  she dies, the game is over.

**Food is everything.** Every ant, every larva and the queen eat all the time. The resource bar at
the top shows how much food you have and your **net income per minute** — hover over it to see
what comes in (foraging, gardens) and what goes out (eating, eggs, digging, research). The queen
lays eggs on her own as long as there is food to spare.

## The nest

Press **Tab** (or the *Nest* button) to look at your nest in cross-section. Pick a chamber in the
bottom-right panel and click the soil to dig it. Workers inside dig it out; the cost is paid little
by little as they dig.

| Chamber | What it does |
| --- | --- |
| **Granary** | Stores more food |
| **Nursery** | Room for more eggs and larvae |
| **Living Quarters** | Raises the population limit |
| **Fungus Garden** | Grows food on its own while two workers tend it |
| **Infirmary** | Wounded ants near the nest heal |
| **Guard Post** | The queen takes less damage during raids |
| **Scent Hall** | Unlocks research; more halls research faster |

You can only dig close to the existing tunnels and inside the lit area — research **Deep Tunnels**
to open up more of the underground.

## Research

Build a **Scent Hall**, then press **R**. Twelve upgrades in four groups, many with several levels:

- **Combat** — stronger bites, tougher armour, drilled soldiers.
- **Foraging** — faster legs, keener antennae, longer-lasting trails, bigger loads.
- **Colony** — a more fertile queen, longer-living ants.
- **Nest** — faster digging, richer fungus gardens, Deep Tunnels.

Research is paid gradually while it runs and pauses when you run out of spare food.

## Orders

The **Colony orders** panel at the bottom sets how the colony behaves:

- **Foragers** — how many workers go outside. The rest work inside (nursing, digging, gardens).
  At 100% nobody works in the nest!
- **Soldiers among new ants** — how many of the new ants become soldiers.
- **Building budget** — while something is being dug or researched, this share of the incoming
  food is set aside for it; the rest goes to new eggs.
- **Auto-lay**, plus buttons to lay a worker or soldier egg right now, and **Recall** to call
  soldiers back home.

## Tools

| Tool | Key | What it does |
| --- | --- | --- |
| Inspect | 1 | Click an ant, spider, food pile or nest to see details |
| Drop food | 2 | Drops a pile of sugar (needs time to recharge) |
| Scent trail | 3 | Paint a food scent — ants follow it in the direction you drag |
| Rocks | 4 | Place rocks; ants walk around them |
| Erase | 5 | Remove rocks and your scent marks |
| Rally point | 6 | Send soldiers somewhere. Put it on the red nest to raid it |

## Dangers

- **Spiders** wander in from the edges and eat ants. A crowd of ants can bring one down — the
  carcass is a feast.
- **The red colony** grows just like yours. From about the tenth minute it starts sending raiding
  parties to your nest, a little bigger each time. Keep some soldiers, dig Guard Posts, and when
  you are strong enough, raid them back.
- **Night** falls every couple of minutes; **rain** washes away the scent trails.

## Controls

| Action | Mouse / keyboard |
| --- | --- |
| Move the view | Right-drag, drag with Inspect, or W A S D / arrows |
| Zoom | Mouse wheel |
| Switch surface / nest | Tab |
| Pause / speed | Space / F (or the buttons at the top) |
| Commands | 1 – 6 on the surface, 1 – 7 to pick a chamber in the nest |
| Brush size | [ and ] |
| Research | R |
| Save / load | L |
| Pheromone trails on/off | P |
| Mute | M |
| Help | H |
| Cancel / deselect | Esc, right-click |

Click or drag on the **minimap** to jump around the meadow.

**On a phone or tablet:** drag with one finger to move, pinch to zoom, tap to select or use a tool,
and press and hold instead of right-clicking (cancel, recall soldiers, deselect). In the nest, the
first tap shows where a chamber would go and a second tap places it. The bottom panel has four
pages — minimap, selection, orders, commands — swipe sideways or tap the dots. Saving, display,
sound and help are under the **⋯** button.

## Saving

The game **saves itself every minute**. Press **L** for three save slots, and to export a save to
a file or load one back. On the start screen, **Continue** resumes your latest game. Saves live
in your browser, so clearing site data removes them — export the important ones.

## Tips

- Early on, dig **Living Quarters** and a **Nursery** — the starting nest fills up fast.
- If the food number in the bar is red, stop digging or researching for a while, or lower the
  building budget.
- Before minute ten, raise a few more soldiers and dig a **Guard Post**.
- A **Fungus Garden** is a steady income that no spider can steal.
- Hover anything in the resource bar for a breakdown of where the numbers come from.

## Questions

**There's no sound.** Browsers only start audio after you click or press a key. Check the
speaker button at the top.

**The game is slow.** Lower the speed, or hide pheromone trails with **P**.

**Where are the save files?** In your browser's storage for this page. Use *Export to file* to keep
a copy.

## Roadmap

What's coming next, roughly in this order:

- [x] **Touch controls** — play on a phone or tablet: drag to move, pinch to zoom, a layout that fits
  small screens.
- [ ] **Chronicle** — graphs of your population and food over the whole game, on the end screen and
  any time from the top bar.
- [ ] **Map settings** — choose the map size, how much food and how many rocks there are, and fight
  up to three rival colonies.
- [ ] **Seasons and winter** — plenty of food in spring and summer, less in autumn; in winter
  nothing grows and the colony lives on its stores.
- [ ] **Scouts** — a fast new caste that explores far away and marks the food it finds.
- [ ] **Fog of war** — you only see what your ants see. Scouts and patrols become essential.
- [ ] **Aphids and ladybugs** — herd aphids on plants and milk them for honeydew; defend them from
  ladybugs and the red colony.
- [ ] **Scenarios** — *Survive three winters*, *Hold five aphid herds*, *Destroy two colonies*.

Ideas for later: more castes (big carriers, honeypot ants, winged queens that found new nests),
more creatures (antlions, beetles, birds, floods), different ant species to play, direct control
of soldier squads, a short tutorial, and a Russian translation.

---

Want to tinker with the game itself? See [DEVELOPMENT.md](DEVELOPMENT.md).
