# Anthill — developer notes

Plain HTML + JavaScript, no build step and no dependencies. Scripts are classic `<script>` tags
(not modules) so the game also runs from `file://`.

## Code layout

| File | Purpose |
| --- | --- |
| `js/config.js` | Every tunable number: castes, chambers, research tree, difficulty, map and nest sizes |
| `js/world.js` | Terrain, pheromone grids, food, combat, random events, win/lose |
| `js/ant.js`, `js/spider.js` | Agent behaviour |
| `js/colony.js` | Economy, brood, task allocation, research, rival AI |
| `js/nest.js` | Underground chambers, digging, diggable zone |
| `js/save.js` | Save/load serialisation and localStorage slots |
| `js/audio.js` | Procedural Web Audio sound effects and ambience |
| `js/minimap.js` | Minimap |
| `js/sprites.js`, `js/render-*.js` | Procedural graphics |
| `js/ui.js`, `js/game.js` | Resource bar, HUD, dialogs, input, camera, main loop |
| `js/autoplayer.js` | Scripted player for balance runs and tests (not used in normal play) |
| `js/balance.js`, `balance.html` | Balance sheet |

The simulation files (`util`, `config`, `world`, `ant`, `spider`, `nest`, `colony`, `autoplayer`)
never touch the DOM, so they run in Node for tests and on the balance page.

## Balancing

Open `balance.html` next to `index.html`. It reads `js/config.js` directly and shows every number
with derived metrics: lifetime cost of each caste, forager yield by distance, dig times, research
costs, spider scaling, raid sizes and how long the queen lasts, difficulty side by side and all
constants. Every table has a “Copy CSV” button for spreadsheets. The Simulation section runs the
real game headless with the scripted player over several seeds and prints per-minute averages —
change a number in `config.js`, reload, run, compare.

## Tests

```bash
node tests/sim-test.js normal 15 3
```

Runs a game headless with the scripted player — `[peaceful|normal|hard] [minutes] [seed]` — and
prints colony stats every game minute plus the bot's actions.

```bash
node tests/save-test.js
```

Checks that a save loads back identically, including research, and that old-format saves
(smaller map, no sizes stored) still load.

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

Saves are compact JSON (~40–70 KB): grids are byte-packed with zero-run compression, ants are
arrays. Each save stores the map and nest sizes, so changing `CFG.WORLD_W/H` or `CFG.NEST` doesn't
break older saves. `SAVE_VERSION` in `js/save.js` guards incompatible formats.
