'use strict';
// All tunable game constants live here.

const CFG = {
  WORLD_W: 2400,
  WORLD_H: 1500,
  NEST: {
    W: 2000, H: 1200, surfaceY: 120, // underground cross-section, in nest units
    // Diggable zone per Deep Tunnels level: half-width around the entrance and depth below the surface.
    zones: [{ halfW: 420, depth: 470 }, { halfW: 620, depth: 700 }, { halfW: 820, depth: 900 }, { halfW: 1000, depth: 1080 }],
  },
  NATURAL_FOOD: 14, // max natural food piles per 1600x1000 of meadow
  FOOD_PILE: [220, 420], // size range of natural food piles
  CELL: 5, // pheromone / wall grid cell size in world units
  TICK: 1 / 60,
  DAY_LENGTH: 150, // seconds per in-game day

  PHERO_EVAP_EVERY: 12, // evaporate every N ticks
  PHERO: {
    home: { halfLife: 40, tau: 22 },
    food: { halfLife: 28, tau: 22 },
    alarm: { halfLife: 2.5 },
  },
  SENSOR_DIST: 14,
  SENSOR_ANGLE: 0.6,
  WANDER: 4,
  FOOD_SENSE: 42,
  MAX_SEARCH: 45, // seconds a forager searches before heading home empty-handed
  TRAIL_MIN: 0.25, // weakest food scent (3x3 sum) a searching ant still follows; stale trails stop luring
  TRAIL_PATIENCE: 25, // seconds on a food scent without finding food before an ant gives up
  CARRY: 1,
  CORPSE_FOOD: 2,
  NEST_R: 16,
  PATROL_R: 120,
  SOLDIER_SENSE: 75,
  RAID_DMG: 0.18, // share of a raider's bite that reaches the queen through the nest entrance

  CASTE: {
    worker: { name: 'Worker', speed: 44, hp: 10, dmg: 2.5, life: [480, 640], upkeep: 0.008, cost: 6, len: 7 },
    soldier: { name: 'Soldier', speed: 38, hp: 34, dmg: 8, life: [540, 700], upkeep: 0.02, cost: 18, len: 10 },
  },
  BROOD: { egg: 8, larva: 12, pupa: 9, larvaUpkeep: 0.015 },
  QUEEN: { hp: 400, upkeep: 0.05, layInterval: 2.5, regen: 1.5, starve: 3 },
  CHRONICLE: { every: 10, cap: 2000 }, // history sample interval (s); past the cap, samples halve and the interval doubles
  RESERVE_SECONDS: 20, // eggs, digging and research leave this many seconds of upkeep untouched
  BUILD_SHARE: 0.4, // share of incoming food set aside for digging and research while any is running
  BUILD_FUND_CAP: 80, // set-aside food stops accumulating beyond this
  BUILD_FREE_ABOVE: 60, // food above reserve + this is free for digging and research too
  STARVE_DMG: 0.3,

  CHAMBERS: {
    queen: { name: 'Royal Chamber', cost: 0, work: 0, rx: 72, ry: 36, food: 100, brood: 6, pop: 30,
      desc: 'Home of the queen. Holds a little food and brood.' },
    storage: { name: 'Granary', cost: 25, work: 60, rx: 54, ry: 28, food: 200,
      desc: '+200 food storage' },
    nursery: { name: 'Nursery', cost: 30, work: 70, rx: 56, ry: 30, brood: 8,
      desc: '+8 brood slots' },
    barracks: { name: 'Living Quarters', cost: 30, work: 70, rx: 58, ry: 28, pop: 40,
      desc: '+40 population cap' },
    garden: { name: 'Fungus Garden', cost: 60, work: 110, rx: 60, ry: 30, farm: 15, gardeners: 2,
      desc: 'Grows +15 food/min when 2 workers inside tend it' },
    infirmary: { name: 'Infirmary', cost: 45, work: 90, rx: 50, ry: 26, heal: 1.2,
      desc: 'Ants in or near the nest heal +1.2 HP/s' },
    guard: { name: 'Guard Post', cost: 50, work: 90, rx: 48, ry: 26, guard: 0.25,
      desc: '−25% raid damage to the queen (max −75%)' },
    hall: { name: 'Scent Hall', cost: 80, work: 130, rx: 62, ry: 32, halls: 1,
      desc: 'Unlocks research; each extra hall researches 60% faster' },
  },
  RESEARCH_HALL_BONUS: 0.6, // research speed per Scent Hall beyond the first

  // Research tree. Each level costs cost[i] food (paid as it runs) and time[i] seconds; mod values add up per level.
  RESEARCH: [
    { id: 'mandibles', name: 'Strong Mandibles', group: 'Combat', cost: [60, 120], time: [60, 90], mod: { dmg: 0.2 }, desc: '+20% bite damage per level' },
    { id: 'chitin', name: 'Thick Chitin', group: 'Combat', cost: [60, 120], time: [60, 90], mod: { hp: 0.25 }, desc: '+25% health per level' },
    { id: 'drill', name: 'Soldier Drill', group: 'Combat', cost: [100], time: [90], mod: { soldier: 0.3 }, req: { chitin: 1 }, desc: 'Soldiers get +30% damage and health' },
    { id: 'legs', name: 'Swift Legs', group: 'Foraging', cost: [70, 140], time: [70, 100], mod: { speed: 0.1 }, desc: '+10% walking speed per level' },
    { id: 'antennae', name: 'Keen Antennae', group: 'Foraging', cost: [70], time: [70], mod: { sense: 0.4 }, desc: 'Workers smell food 40% further away' },
    { id: 'trails', name: 'Lasting Trails', group: 'Foraging', cost: [60], time: [60], mod: { trail: 0.5 }, desc: 'Pheromone trails last 50% longer' },
    { id: 'loads', name: 'Heavy Loads', group: 'Foraging', cost: [120], time: [100], mod: { carry: 0.5 }, req: { mandibles: 1 }, desc: 'Workers carry 50% more food per trip' },
    { id: 'fertility', name: 'Fertile Queen', group: 'Colony', cost: [80, 160], time: [80, 110], mod: { lay: 0.25, dev: 0.15 }, desc: 'Queen lays 25% faster and brood grows 15% faster per level' },
    { id: 'longevity', name: 'Longevity', group: 'Colony', cost: [90], time: [80], mod: { life: 0.3 }, desc: 'Ants live 30% longer' },
    { id: 'digging', name: 'Efficient Digging', group: 'Nest', cost: [50], time: [50], mod: { dig: 0.5 }, desc: 'Chambers are dug 50% faster' },
    { id: 'fungus', name: 'Fungus Farming', group: 'Nest', cost: [80, 140], time: [70, 100], mod: { farm: 0.4 }, reqChamber: 'garden', desc: 'Fungus Gardens grow 40% more per level' },
    { id: 'deep', name: 'Deep Tunnels', group: 'Nest', cost: [50, 110, 200], time: [50, 80, 120], mod: { zone: 1 }, desc: 'Each level widens and deepens the area you can dig' },
  ],
  DIG: { base: 0.3, perWorker: 0.8, tunnelWorkPerUnit: 0.25, maxTunnel: 260, maxQueue: 3 },

  SPIDER: { hp: 120, speed: 30, dmg: 10, sense: 170, corpseFood: 120, r: 9, maxEaten: 6 },

  FEED: { amount: 120 }, // player "drop food" tool

  DIFFICULTY: {
    peaceful: {
      name: 'Peaceful', desc: 'No rivals, no spiders. Just watch your colony grow.',
      rival: false, spiders: false, feedCooldown: 3,
      player: { workers: 22, soldiers: 2, food: 80 },
    },
    normal: {
      name: 'Normal', desc: 'A rival colony and the occasional hungry spider.',
      rival: true, spiders: true, feedCooldown: 30,
      spiderFirst: 180, spiderEvery: [150, 220],
      player: { workers: 20, soldiers: 3, food: 60 },
      ai: { workers: 14, soldiers: 2, food: 40, forageMul: 1.1, researchEvery: 210, soldierRatio: 0.2, raidGrace: 600, raidSize: 6, raidGrowth: 3, raidMax: 24 },
    },
    hard: {
      name: 'Hard', desc: 'An aggressive rival and frequent spider attacks.',
      rival: true, spiders: true, feedCooldown: 45,
      spiderFirst: 110, spiderEvery: [90, 150],
      player: { workers: 16, soldiers: 2, food: 45 },
      ai: { workers: 20, soldiers: 4, food: 80, forageMul: 1.4, researchEvery: 150, soldierRatio: 0.3, raidGrace: 360, raidSize: 9, raidGrowth: 4, raidMax: 32 },
    },
  },
};
