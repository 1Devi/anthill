# Anthill — developer notes

Plain HTML + JavaScript, no build step and no dependencies. Scripts are classic `<script>` tags
(not modules) so the game also runs from `file://`.

## Code layout

| File | Purpose |
| --- | --- |
| `js/config.js` | Every tunable number: castes, chambers, research tree, difficulty, map options, rivals, nest sizes |
| `js/world.js` | Terrain, pheromone grids, food, combat, random events, win/lose |
| `js/ant.js`, `js/spider.js` | Agent behaviour |
| `js/colony.js` | Economy, brood, task allocation, research, rival AI |
| `js/nest.js` | Underground chambers, digging, diggable zone |
| `js/save.js` | Save/load serialisation and localStorage slots |
| `js/audio.js` | Procedural Web Audio sound effects and ambience |
| `js/minimap.js` | Minimap |
| `js/sprites.js`, `js/render-*.js` | Procedural graphics. The nest view bakes its soil once and keeps chambers and tunnels in a cached layer that is redrawn only around a dig in progress |
| `js/ui.js`, `js/game.js` | Resource bar, HUD, dialogs, input, camera, main loop |
| `js/autoplayer.js` | Scripted player for balance runs and tests (not used in normal play) |
| `js/balance.js`, `balance.html` | Balance sheet |

The simulation files (`util`, `config`, `world`, `ant`, `spider`, `nest`, `colony`, `autoplayer`)
never touch the DOM, so they run in Node for tests and on the balance page.

## Map options and rivals

`new World({ difficulty, seed, settings })` takes the start-screen options as keys —
`{ size, food, rocks, rivals }` — and `mapSettings()` in `world.js` fills in `CFG.MAP.defaults`
(Peaceful always gets 0 rivals). The numbers behind the keys live in `CFG.MAP`: map sizes, the food
multiplier (natural pile density and pile size) and the rock noise threshold. Natural food regrows
at `CFG.FOOD_REGROW` seconds per 1600×1000 of meadow, so every map size has the same food per area.

Rivals are `w.rivals` (`w.rival` is the first one, kept for code that only knows one). Their names,
nest spots and palette keys are `CFG.RIVALS`, in the order they join; each waits
`CFG.RIVAL_STAGGER` seconds longer than the previous one before its first raid. A lone rival always
raids the player; with several, each raid picks a living colony at random, the player weighted by
`CFG.RAID_PLAYER_WEIGHT`, so rivals also wear each other down. Colours live with the ant sprites in `Sprites.PAL` (`map` for the minimap, `mound`
for the nest mound), so a fourth rival needs a `CFG.RIVALS` entry and a palette. The start screen
remembers its last choice in `localStorage` (`anthill.newGame`).

## Balancing

Open `balance.html` next to `index.html`. It reads `js/config.js` directly and shows every number
with derived metrics: lifetime cost of each caste, forager yield by distance, dig times, research
costs, spider scaling, raid sizes and how long the queen lasts, difficulty side by side and all
constants. Every table has a “Copy CSV” button for spreadsheets. The Simulation section runs the
real game headless with the scripted player over several seeds and prints per-minute averages —
change a number in `config.js`, reload, run, compare. Pick the map options there too; the Map
options section lists what each choice means, including how far away each rival nest is.

## Tests

```bash
node tests/sim-test.js normal 15 3
```

Runs a game headless with the scripted player — `[peaceful|normal|hard] [minutes] [seed]`, optionally
followed by map options such as `size=large food=scarce rocks=many rivals=3` — and prints colony
stats every game minute plus the bot's actions. The seed sets the terrain; the ants themselves use
`Math.random`, so two runs with the same seed still differ.

```bash
node tests/save-test.js
```

Checks that a save loads back identically, including research and map options (a large map with
three rivals), and that old-format saves (smaller map, no sizes or map options stored) still load.

## Deploying

The game is published to GitHub Pages by `.github/workflows/pages.yml` on every push to `main`
(or by hand from the Actions tab). It copies only what the browser needs — `index.html`,
`balance.html`, the icons (`favicon.svg`, `apple-touch-icon.png`), `css/` and `js/` — into `_site`
and deploys that. Add any new top-level file the pages load to that list.

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**. With the
old "Deploy from a branch" source, GitHub runs its own `pages-build-deployment` workflow instead,
which still uses Node 20 actions and prints a deprecation warning.

Live: https://1devi.github.io/anthill/ · balance sheet: https://1devi.github.io/anthill/balance.html

## Saves

Saves are compact JSON (~40–70 KB, up to ~120 KB on a large map with three rivals): grids are
byte-packed with zero-run compression, ants are arrays. Each save stores the map and nest sizes and
the map option keys (`settings`), so changing `CFG.MAP` or `CFG.NEST` doesn't break older saves;
saves without `settings` load with the defaults (one rival on Normal and Hard). `SAVE_VERSION` in
`js/save.js` guards incompatible formats.
