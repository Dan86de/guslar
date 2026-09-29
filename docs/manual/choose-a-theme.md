# Choose a world's theme

A user who runs two Guslars side by side, one for their own repos and one for work, tells them apart by giving each world its own theme.
A `world.json` that says `"theme": "vaillant"` opens a Vaillant world, whose browser tab carries the Vaillant logo head and the title `Guslar · Vaillant`.
Everything the Vaillant map says is said in a heat-pump world's words: its regions are offices, named after the office their slot stands for unless `world.json` names them, its villages are heat pumps, its hunters are technicians, and a refusal reads as a technician's.
A world with no theme, or with `"theme": "guslar"`, opens as Guslar always has, and a theme Guslar does not have is refused before anything starts.

## Entry points

- The `theme` field of a `world.json`, read from wherever [Configure the world](./configure-the-world.md) says Guslar reads it: `--world`, `GUSLAR_WORLD` or `~/.guslar/world.json`.
- The themes are `guslar`, the default, and `vaillant`.
- An office's plaque on the map, which opens its jobs, and a heat pump, which opens its job board, as a region's plaque and a village do in Guslar.
- The world broadcast on `/ws` (and `/api/world`), which names each region.

## Steps

Start the run with the Vaillant world the manual keeps: `verify start --world docs/manual/worlds/vaillant.json`.
It is the default run's world with `"theme": "vaillant"` added: `forest` is `./repos/bogwater` named `Bogwater Reach`, and `river-town` is `./repos/kettle` with no name.

Preconditions: lay down a heat pump with its work orders at the unnamed office, make every claude replay a site survey, then load the map with the first step.

- Run `verify write repos/kettle/.scratch/specs/fit-the-unit.md '# Fit the unit'`.
- Run `verify write repos/kettle/.scratch/slices/fit-the-unit.json '{"spec":".scratch/specs/fit-the-unit.md","branch":"main","slices":[{"id":"S1","title":"Lay the base","autonomy":"afk","blocked_by":[]},{"id":"S2","title":"Pipe the unit","autonomy":"hitl","blocked_by":["S1"]}]}'`.
- Run `verify replay test/fixtures/transcripts/survey.jsonl`. It prints `it waits at: gates/survey, gates/end`.

The steps, in this order:

- **The world names its theme.** Run `verify read world.json`. It holds `"theme": "vaillant"` beside the two regions.
- **The tab says Vaillant.** Run `verify open`. It prints `title: Guslar · Vaillant`, `icon: /vaillant/favicon.png`, `map busy: false`, and `console:` with `(nothing)` on the line under it. The page still has the heading `Guslar`, and the list `Offices` with six items.
- **The tab's icon is the Vaillant logo head.** Run `verify http /vaillant/favicon.png --save tab-icon.png`. It prints `HTTP 200 image/png`, `bytes of image/png` and `saved`. Open `tab-icon.png`: a 128x128 square holding the Vaillant hare's black-and-white head in a white egg, on a teal rounded rectangle standing upright in the middle, with the square's sides clear either side of it.
- **The broadcast carries the theme.** Run `verify world`. It prints one message with `"type": "world"` and, under `"world"`, `"theme": "vaillant"` and six `slots` in the order forest, marsh, mountains, river-town, mines, ruins, `forest` and `river-town` regions and the other four `"kind": "fog"`.
- **An office without a name is named after its office.** In the `verify world` output of the step before, `forest` is named `Bogwater Reach`, as `world.json` names it, and `river-town` is named `Lyon`, not after its folder.
- **The offices by name.** Run `verify snapshot`. The list `Offices` has six items, in this order: `Bogwater Reach , Bergisch woods`, `Amsterdam office, under frost`, `Dietikon office, under frost`, `Lyon , Rhône and Saône`, `Katowice office, under frost`, `Istanbul office, under frost`. After it, the list `Heat pumps` has one item, the button `Fit the unit , heat pump at Lyon` with the text `Installation in progress`, and then the list `Office jobs` has two buttons, `Jobs at Bogwater Reach` and `Jobs at Lyon`.
- **An office's jobs.** Run `verify click "Jobs at Lyon"`, then `verify snapshot`: a dialog `Jobs at Lyon` with a heading `Jobs at Lyon`, the text `Rhône and Saône` and `Which job should a technician do here?`, a list `Jobs` with three buttons in this order, `Site survey A technician asks what the office needs, until nothing is left unsettled. /interview`, `Draw up the plan A technician draws up the plan a new heat pump is installed from. /write-spec` and `Set the commissioning test A technician sets how a job at this office is proven to work. /make-verify`, and a button `Close the jobs`.
- **Send a technician.** Run `verify click "Site survey"`, then `verify snapshot`: inside the jobs, a dialog `Send a technician for a site survey` with the text `Lyon`, a textbox `What should the technician ask you about?` with the text `Leave it empty and it asks what the office needs.` under it, the question `How far may the technician go without asking you?` and the list `Permission modes` with its four buttons, the last `Never ask It works solo and asks nothing. bypassPermissions`. Run `verify click "Ask before every tool"`, then `verify wait-for "Wojmir is out for a site survey"`: the jobs dialog has the text `Wojmir is out for a site survey`.
- **An office takes one technician at a time.** Run `verify click "Draw up the plan"`. `verify snapshot` shows no dialog `Send a technician to draw up the plan`, and the jobs have an alert `Lyon refuses a second technician: Wojmir is out for a site survey.` Run `verify press Escape`.
- **The technician on the map.** Run `verify snapshot`: after `Heat pumps`, the list `Technicians` has one item, `Wojmir , driving out, sent for a site survey at Lyon`.
- **A heat pump's job board.** Run `verify click "Fit the unit"`, then `verify snapshot`: a dialog `Job board of Fit the unit` with a button `Close the job board` and a list `Work orders` whose items read `S1 afk Lay the base Ready`, with a button `Take S1`, and `S2 hitl Pipe the unit Waiting on parts from S1`. Run `verify click "Take S1"` and `verify snapshot`: a dialog `Send a technician on S1` with the text `Lay the base`. Run `verify click "Cancel"`, then `verify press Escape`.
- **The service log.** Run `verify click "Wojmir"`, then `verify snapshot`: a dialog `Service log of Wojmir` with the text `Site survey, Lyon` and the state `driving out`, buttons `Open in terminal`, `Back to the depot`, disabled, with the text `Wojmir is still out: it can go back to the depot only once it is back.`, and `Close the service log`, a list `Entries` with `You: /interview`, a textbox `Reply to Wojmir` and a button `Send`. Run `verify press Escape`.
- **The technician comes back commissioned.** Run `verify write gates/survey open`, then `verify wait-for "Wojmir , on the job, sent for a site survey at Lyon"`. Run `verify write gates/end open`, then `verify wait-for "Wojmir , back, commissioned, sent for a site survey at Lyon"`. Run `verify click "Jobs at Lyon"` and `verify snapshot`: the jobs have the text `Wojmir came back commissioned`. Run `verify press Escape`.
- **No word of Guslar's fiction.** Every `snapshot` above, of the page and of each dialog opened, reads none of `hunter`, `village`, `contract`, `rite`, `bounty` or `alderman`, in any case, as a word of its own or with an `s`.
- **A world set to Guslar's own theme is Guslar.** Run `verify write guslar.json '{"theme":"guslar","regions":[{"slot":"forest","repo":"./repos/bogwater"}]}'`, then `verify guslar --world guslar.json`. It prints `Guslar reads guslar.json (1 region)` and `it started; world served at /api/world:` with `"theme":"guslar"`.
- **A world with no theme is Guslar.** Run `verify guslar`, which reads `home/.guslar/world.json`, a file that does not exist. It prints `it started; world served at /api/world:` with `"theme":"guslar"`.
- **A theme there is not is refused.** Run `verify write nonsense.json '{"theme":"nonsense","regions":[]}'`, then `verify guslar --world nonsense.json`. It prints `guslar: nonsense.json: theme must be one of guslar, vaillant` and `guslar exited by itself: 1`.

## Behind it

- **`/api/world` agrees with the broadcast.** `verify http /api/world` prints `HTTP 200 application/json` and a world whose `"theme"` is `"vaillant"`.
- **The world file is left as written.** `verify read world.json` prints what the first step printed.

## Gotchas

- A Guslar-themed world's tab is checked in [Open the world](./open-the-world.md): its `open` prints `title: Guslar` and `icon: /favicon.svg`.
- `http` prints an image only by its size; `--save` is how to look at it.
- The theme changes the tab and every word the page says so far: the map's art and colours are Guslar's in every theme.
- The words a session itself writes, in its service log, are its own: a transcript that says `rite` puts it on the page in any theme, so the steps replay a survey that does not.
- A refusal the map can see coming, such as a second technician, is worded before the server is asked; one the server sends is worded from the same table.
