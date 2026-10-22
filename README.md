# Anthill — Ant Colony Simulator

A browser strategy sandbox about an ant colony. Workers find food on their own by following
pheromone trails; you manage the colony, dig the nest underground and fight off spiders and a
rival red colony.

## Running

Open `index.html` in any modern browser (double-click works — no build step, no server, no
dependencies).

## How it plays

- **Surface view** — top-down meadow. Searching ants lay a blue "to home" trail, ants carrying
  food lay a green "to food" trail, and wounded ants release red alarm scent that draws soldiers.
- **Nest view** (`Tab`) — cross-section of your nest. Dig Granaries (food storage), Nurseries
  (brood slots) and Living Quarters (population cap). Workers kept inside dig and nurse brood.
- **Economy** — every ant, larva and the queen eat continuously. The queen turns food into eggs
  (egg → larva → pupa → ant). Sliders set the forager share and the soldier share of new ants.
- **Chambers** — Granary (storage), Nursery (brood slots), Living Quarters (population), Fungus Garden
  (grows food while workers tend it), Infirmary (heals ants at the nest), Guard Post (less raid
  damage to the queen) and Scent Hall (unlocks research). Digging is paid gradually as it progresses.
- **Research** (`R`) — 12 topics in four groups (combat, foraging, colony, nest), up to three levels
  each, run in Scent Halls and paid gradually. Deep Tunnels widens the area you can dig.
- **Budget** — while digging or research runs, a share of income (the Building budget slider) is set
  aside for it; eggs use the rest. Everything keeps ~20 s of upkeep in reserve.
- **Threats** — spiders hunt ants (a dead spider is a big food pile); the red colony grows and
  raids your nest. You lose if your queen dies; you win by killing the red queen (place a rally
  point on the red nest to send your soldiers in).
- **Tools** — drop food (recharges), paint a scent trail, place/erase rocks, set a rally point.

- **Save & load** (`L`) — three slots plus an autosave every minute, kept in browser storage;
  export a save to a `.json` file or import one back. "Continue" on the start screen resumes the latest save.
- **Sound** — synthesised with Web Audio (no audio files): wind, rain, crickets at night, digging,
  bites, spiders, alarms. The speaker button opens mute and volume together; `M` mutes.
- **Interface** — strategy-game layout. The top resource bar shows food (with the net change per
  minute: everything brought in minus everything eaten or spent), population, workers, soldiers,
  brood and the queen; hover any of them for a breakdown. The bottom HUD holds the minimap
  (click or drag to move the camera), the selected unit with its portrait, colony orders and the
  command grid (`1`–`6` on the surface, `1`–`3` to pick a chamber in the nest view).
- **Map size** — the meadow is 2400×1500 and the nest cross-section 2000×1200; both views pan
  (drag / WASD) and zoom (wheel). Sizes live in `CFG.WORLD_W/H` and `CFG.NEST`; saves remember theirs.

Controls: right-drag or WASD to pan, wheel to zoom, `Space` pause, `F` cycle speed,
`1`–`6` commands, `[` `]` brush size, `P` trails, `L` save/load, `M` mute, `H` help, `Esc` back to Inspect.

## Code layout

| File | Purpose |
| --- | --- |
| `js/config.js` | All tunable numbers (castes, chambers, difficulty) |
| `js/world.js` | Terrain, pheromone grids, food, combat, events |
| `js/ant.js`, `js/spider.js` | Agent behaviour |
| `js/colony.js` | Economy, brood, task allocation, rival AI |
| `js/nest.js` | Underground chambers and digging |
| `js/save.js` | Save/load serialisation and localStorage slots |
| `js/audio.js` | Procedural Web Audio sound effects and ambience |
| `js/minimap.js` | Minimap overlay |
| `js/sprites.js`, `js/render-*.js` | Procedural graphics |
| `js/ui.js`, `js/game.js` | Panel/dialogs, input, camera, main loop |

`node tests/sim-test.js [peaceful|normal|hard] [minutes] [seed]` runs the simulation headless
and prints colony stats every game minute — handy when tweaking balance.
`node tests/save-test.js` checks that a save loads back identically.

## Balancing

Open `balance.html` next to `index.html`. It reads `js/config.js` directly and shows every number
with derived metrics: lifetime cost of each caste, forager yield by distance, dig times, research
costs, spider scaling, raid sizes and how long the queen lasts, difficulty side by side and all
constants. Every table has a “Copy CSV” button for spreadsheets. The Simulation section runs the
real game headless with a scripted player (`js/autoplayer.js`) over several seeds and prints
per-minute averages — change a number in `config.js`, reload, run, compare.
