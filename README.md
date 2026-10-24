# Anthill

**Raise an ant colony from a handful of workers to an underground empire.**

Anthill is a small strategy game about ants that runs right in your browser. Your workers find
food on their own by following scent trails — you decide how the colony grows: what to dig under
the ground, what to research, how many soldiers to raise and when to go to war with the rival
colonies next door.

## How to play

**Play online:** https://1devi.github.io/anthill/ — works on computers, phones and tablets.

Or download the project and open **`index.html`** in Chrome, Edge or Firefox — just double-click
it. Nothing to install, no internet needed. Pick a difficulty, set up the map and press **Start colony**.

| Difficulty | What to expect |
| --- | --- |
| **Peaceful** | No enemies. Watch the colony grow and experiment. |
| **Normal** | Rival colonies next door and the occasional hungry spider. |
| **Hard** | Stronger rivals that attack sooner, and more spiders. |

You lose if your queen dies or every ant is gone. On Normal and Hard you win by killing every rival
queen. With no rivals there is nothing to conquer — play as long as you like.

### Map settings

Below the difficulty you can set up the meadow. The start screen remembers your last choice.

| Setting | Choices |
| --- | --- |
| **Map size** | Small, Medium (the usual) or Large. On a bigger meadow the rivals live further away, so their raids take longer to arrive — but your foragers walk further too. |
| **Food** | Scarce, Normal or Rich: how many piles of seeds and berries grow on the meadow, and how big they are. |
| **Rocks** | Few, Normal or Many. More rocks mean winding paths and longer trips. |
| **Rival colonies** | 0 to 3. Each has its own colour — **red**, **amber** and **violet** — and starts raiding a couple of minutes after the one before it. Peaceful games have none. |

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
  When a fight is over they head back to their post, finding their way around rocks.
- **The queen** lays the eggs. Egg → larva → pupa → ant takes about half a minute. Protect her: if
  she dies, the game is over.

**Food is everything.** Every ant, every larva and the queen eat all the time. The resource bar at
the top shows how much food you have and your **net income per minute** — hover over it to see
what comes in (foraging, gardens) and what goes out (eating, eggs, digging, research). The queen
lays eggs on her own as long as there is food to spare.

**When the stores are full**, foragers leave what they bring in a pile by the entrance and carry it
in as soon as there is room. Your ants leave that pile alone until then — but rival ants may help
themselves. Only food that actually goes into the stores counts as income; the food tooltip shows how
much is piling up outside. Dig a **Granary** to make room.

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
| Rally point | 6 | Send soldiers somewhere. Put it on a rival nest to raid it |

## Dangers

- **Spiders** wander in from the edges and eat ants. A crowd of ants can bring one down — the
  carcass is a feast.
- **Rival colonies** grow just like yours. From about the tenth minute (sooner on Hard) the red
  colony starts sending raiding parties to your nest, a little bigger each time; the amber and
  violet colonies join in two and four minutes later. Keep some soldiers, dig Guard Posts, and when
  you are strong enough, raid them back. With several rivals they also fight each other: their ants
  clash when paths cross, and now and then one rival raids another instead of you — a good moment
  to strike the weakened one.
- **Night** falls every couple of minutes; **rain** washes away the scent trails (in winter it snows).
- **Puddles** gather in the low spots of the meadow while it rains, and after the spring thaw. Ants
  can't cross them, and food under water is out of reach until it dries up — usually within a minute.

## The meadow

Besides rocks, the meadow is strewn with **fallen twigs, pine cones and mushrooms** — ants walk around
them like rocks (the Rocks setting changes how many there are), and the rock tools leave them alone.
Leaves and flowers are just scenery; flowers bloom in spring and summer.

Now and then something big turns up among the seeds and berries: a **fallen fruit** (summer and
autumn) or a **dead beetle** — far more food than an ordinary pile. Whoever gets there first feasts.

## Seasons

The year turns: each season lasts two days, about five minutes, and the game starts in spring. The
season is shown above the clock at the top — hover it to see what it changes.

| Season | What changes |
| --- | --- |
| **Spring** | Fresh food sprouts across the meadow and grows back fast. |
| **Summer** | Plenty of food. |
| **Autumn** | Food grows slowly. The colony starts putting food aside for the winter, so the queen lays fewer eggs. |
| **Winter** | Snow. Nothing grows, and the seeds and berries left on the meadow rot. Ants crawl, eat less and freeze if they wander far from the nest; the queen lays slowly. Spiders and raiders stay away. |

The colony lives through the winter on its stores, and it can only keep as much as your storage
holds — dig a **Granary** or two in autumn. **Fungus Gardens** keep growing all winter. The food
tooltip shows how much is kept for the winter; the Chronicle shows winters as pale bands.

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
| Chronicle | C |
| Save / load | L |
| Pheromone trails on/off | P |
| Mute | M |
| Help | H |
| Cancel / deselect | Esc, right-click |

Click or drag on the **minimap** to jump around the meadow. Every colony has its own colour there —
yours is the pale one — and spiders are dark dots with a white rim.

**On a phone or tablet:** drag with one finger to move, pinch to zoom, tap to select or use a tool,
and press and hold instead of right-clicking (cancel, recall soldiers, deselect). In the nest, the
first tap shows where a chamber would go and a second tap places it. The bottom panel has four
pages — minimap, selection, orders, commands — swipe sideways or tap the dots. Saving, display,
sound, help and the chronicle are under the **⋯** button (also on smaller laptop screens).

## Chronicle

Press **C** (or the chart button at the top) to see your colony's story so far: how many ants you
had and how many the rivals had, how much food came in and went out each minute, and how full
your stores were. Marks along the top show events — red for danger, green for good news; hover
them or any point on a chart for details. The same graphs appear on the end screen.

## Saving

The game **saves itself every minute**. Press **L** for three save slots, and to export a save to
a file or load one back. On the start screen, **Continue** resumes your latest game. Saves live
in your browser, so clearing site data removes them — export the important ones.

## Tips

- Early on, dig **Living Quarters** and a **Nursery** — the starting nest fills up fast.
- Food piling up by the entrance means the stores are full: time for a **Granary**.
- If the food number in the bar is red, stop digging or researching for a while, or lower the
  building budget.
- Before minute ten, raise a few more soldiers and dig a **Guard Post**.
- A **Fungus Garden** is a steady income that no spider can steal — and it keeps growing in winter.
- Before winter, make room in the stores: the colony can only put aside what your granaries hold.
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
- [x] **Chronicle** — graphs of your population and food over the whole game, on the end screen and
  any time from the top bar.
- [x] **Map settings** — choose the map size, how much food and how many rocks there are, and fight
  up to three rival colonies.
- [x] **Seasons and winter** — plenty of food in spring and summer, less in autumn; in winter
  nothing grows and the colony lives on its stores.
- [ ] **Scouts** — a fast new caste that explores far away and marks the food it finds.
- [ ] **Fog of war** — you only see what your ants see. Scouts and patrols become essential.
- [ ] **Aphids and ladybugs** — herd aphids on plants and milk them for honeydew; defend them from
  ladybugs and rival colonies.
- [ ] **Scenarios** — *Survive three winters*, *Hold five aphid herds*, *Destroy two colonies*.

Ideas for later: more castes (big carriers, honeypot ants, winged queens that found new nests),
more creatures (antlions, beetles, birds, floods), different ant species to play, direct control
of soldier squads, a short tutorial, and a Russian translation.

---

Want to tinker with the game itself? See [DEVELOPMENT.md](DEVELOPMENT.md).
