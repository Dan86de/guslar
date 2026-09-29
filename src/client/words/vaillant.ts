import type {
  Autonomy,
  Contract,
  ContractState,
  Hunter,
  HunterState,
  PermissionMode,
  RegionSlot,
  Rite,
  VillageStage,
} from "../../shared/world.js"
import { OFFICES } from "../../shared/theme.js"
import type { Refusals, Words } from "./index.js"

/** Each job as the heat-pump world names it. */
const JOBS: Record<Rite, string> = {
  "implement-slice": "Take the work order",
  interview: "Site survey",
  "write-spec": "Draw up the plan",
  "write-slices": "Issue work orders",
  "make-verify": "Set the commissioning test",
  "sign-off": "Commissioning check",
}

/** What a job sends a technician out for, as a phrase after "out" or "sent": `for a site survey`. */
const ERRANDS: Record<Exclude<Rite, "implement-slice" | "sign-off">, string> = {
  interview: "for a site survey",
  "write-spec": "to draw up the plan",
  "write-slices": "to issue work orders",
  "make-verify": "to set the commissioning test",
}

/** What a technician is out for, as a phrase after "out": `on S3`, or `to issue work orders`. */
function errand(hunter: Pick<Hunter, "rite" | "contract">): string {
  switch (hunter.rite) {
    case undefined:
      return "on a call of its own"
    case "implement-slice":
      return `on ${hunter.contract ?? "a work order"}`
    case "sign-off":
      return `for the commissioning check of ${hunter.contract ?? "a work order"}`
    default:
      return ERRANDS[hunter.rite]
  }
}

/** What an office's list, a work order or a board says of the technician sent on it once it is back. */
function returned(hunter: Pick<Hunter, "name" | "state">): string | undefined {
  switch (hunter.state) {
    case "returned-trophy":
      return `${hunter.name} came back commissioned`
    case "returned-wounded":
      return `${hunter.name} came back with a fault code`
    default:
      return undefined
  }
}

/** The landscape each office stands in, as its item and its jobs say it: `Rhône and Saône`. */
const LANDSCAPES: Record<RegionSlot, string> = {
  forest: "Bergisch woods",
  marsh: "Dutch polders",
  mountains: "Swiss Alps",
  "river-town": "Rhône and Saône",
  mines: "Silesian pit-heads",
  ruins: "Bosphorus ruins",
}

/** A work order's state as a refusal says it: `S4 of Fit the unit is waiting on parts`. */
const ORDER_STATES: Record<ContractState, string> = {
  done: "done",
  pending: "pending",
  ready: "ready",
  sealed: "waiting on parts",
}

/**
 * Every word Guslar's map says, in a Vaillant world: a heat-pump world in deep winter, where offices
 * send technicians out to install heat pumps. Keyed exactly as Guslar's table is.
 */
export const vaillant: Words = {
  app: {
    heading: "Guslar",
    reconnecting: "The line to the server is down. Reconnecting…",
  },

  server: {
    answered: (status: number) => `The server answered ${status}.`,
    unreachable: "The line to the server is down. Try again once it is back.",
  },

  map: {
    regions: "Offices",
    slots: LANDSCAPES,
    unclaimed: (slot: RegionSlot) => `${OFFICES[slot]} office, under frost`,
    villages: "Heat pumps",
    villageIn: (region: string) => `, heat pump at ${region}`,
    stages: {
      "bounty-drafted": "Unit delivered",
      "contracts-posted": "Installation in progress",
      cleared: "Heat pump running",
    } satisfies Record<VillageStage, string>,
    hunters: "Technicians",
    regionRites: "Office jobs",
  },

  hunter: {
    states: {
      "riding-out": "driving out",
      hunting: "on the job",
      "awaiting-you": "waiting on you",
      "returned-trophy": "back, commissioned",
      "returned-wounded": "back with a fault code",
    } satisfies Record<HunterState, string>,
    errand,
    returned,
    out: (hunter: Pick<Hunter, "name" | "rite" | "contract">) => `${hunter.name} is out ${errand(hunter)}`,
    hunts: (name: string) => `${name} is on it`,
    inspects: (name: string) => `${name} checks it`,
  },

  refusals: {
    "no-region": ({ slot }) => `No office stands in the ${slot} slot.`,
    "no-village": ({ region, village }) => `${region} has no heat pump ${village ?? "named"}.`,
    "no-contract": ({ village, contract }) =>
      `${village ?? "The heat pump"} has no work order ${contract ?? "named"} issued.`,
    busy: ({ place, holder }) => `${place} refuses a second technician: ${holder.name} is out ${errand(holder)}.`,
    "being-sent": ({ place }) => `${place} refuses a second technician: one is on the way already.`,
    "not-ready": ({ village, contract, state }) =>
      `${contract} of ${village ?? "the heat pump"} is ${ORDER_STATES[state]}, not ready to take.`,
    "not-pending": ({ village, contract, state }) =>
      `${contract} of ${village ?? "the heat pump"} is ${ORDER_STATES[state]}, not waiting on its commissioning check.`,
    "contracts-posted": ({ village }) => `${village} has its work orders issued already.`,
    "cannot-start": ({ program, problem }) => `Could not start ${program}: ${problem}`,
    "no-hunter": () => "No such technician is out.",
    outside: ({ hunter }) => `${hunter} was started outside Guslar: write to it in its own terminal.`,
    "empty-reply": () => "A reply needs words.",
    "no-session": ({ hunter }) => `${hunter} has no session to resume.`,
    "cannot-resume": ({ hunter, problem }) => `Could not resume ${hunter}'s session: ${problem}`,
    "not-listening": ({ hunter }) => `${hunter} no longer answers.`,
    "not-begun": ({ hunter }) => `${hunter}'s session has not begun yet.`,
    "cannot-open-terminal": ({ hunter, problem }) => `Could not open a terminal for ${hunter}: ${problem}`,
    "not-waiting": ({ hunter }) => `${hunter} is no longer waiting on that.`,
    "still-out": ({ hunter }) => `${hunter} is still out: it can go back to the depot only once it is back.`,
  } satisfies Refusals,

  bound: {
    outside: "A session started outside Guslar",
    signOff: (contract: string) => `${JOBS["sign-off"]} of ${contract}`,
    hunt: (errand: string, where: string) => ` ${errand} of ${where}`,
    sent: (errand: string, where: string, inRegion: boolean) => `, sent ${errand} ${inRegion ? "at" : "for"} ${where}`,
    outsideIn: (where: string) => ` at ${where}`,
    outsideSuffix: ", started outside Guslar",
  },

  rites: {
    names: JOBS,
    details: {
      interview: "A technician asks what the office needs, until nothing is left unsettled.",
      "write-spec": "A technician draws up the plan a new heat pump is installed from.",
      "make-verify": "A technician sets how a job at this office is proven to work.",
    } satisfies Partial<Record<Rite, string>>,
    of: "Jobs at ",
    ofRegion: (region: string) => `Jobs at ${region}`,
    slot: (slot: string) => slot,
    ask: "Which job should a technician do here?",
    list: "Jobs",
    close: "Close the jobs",
    interview: {
      label: "What should the technician ask you about?",
      hint: "Leave it empty and it asks what the office needs.",
    },
  },

  chooser: {
    send: (errand: string) => `Send a technician ${errand}`,
    ask: "How far may the technician go without asking you?",
    modesList: "Permission modes",
    modes: {
      default: { label: "Ask before every tool", detail: "It stops for you at each step." },
      acceptEdits: { label: "Edit files freely", detail: "It asks before anything else." },
      auto: { label: "Let Claude judge", detail: "It asks only when a step looks risky." },
      bypassPermissions: { label: "Never ask", detail: "It works solo and asks nothing." },
    } satisfies Record<PermissionMode, { label: string; detail: string }>,
    cancel: "Cancel",
  },

  board: {
    /** afk: a solo call-out. hitl: the customer is on site and signs it off with you. */
    autonomy: { afk: "solo call-out", hitl: "customer on site" } satisfies Record<Autonomy, string>,
    states: {
      done: "Done",
      pending: "Pending",
      ready: "Ready",
    } satisfies Record<Exclude<Contract["state"], "sealed">, string>,
    sealed: (by: string[]) => `Waiting on parts from ${by.join(", ")}`,
    take: "Take",
    takeContract: (id: string) => `Take ${id}`,
    inspect: "Check",
    inspectContract: (id: string) => `${JOBS["sign-off"]} of ${id}`,
    of: "Job board of ",
    close: "Close the job board",
    unreadable: (problem: string) => `The work orders cannot be read. ${problem}`,
    empty: "No work orders are issued yet.",
    contracts: "Work orders",
  },

  journal: {
    of: "Service log of ",
    you: "You",
    turnEnds: "The turn ends.",
    turnFails: (text: string) => `The turn ends in failure${text ? `: ${text}` : "."}`,
    openTerminal: "Open in terminal",
    sendHome: "Back to the depot",
    close: "Close the service log",
    entries: "Entries",
    outside: (name: string) => `Started outside Guslar: write to ${name} in its own terminal.`,
    reply: (name: string) => `Reply to ${name}`,
    draft: (name: string) => `Write to ${name}…`,
    send: "Send",
  },

  petition: {
    requests: "Sign-off requests",
    asks: " asks to use ",
    reason: (name: string) => `Reason to give ${name}`,
    reasonHint: "A reason, if you deny it",
    allow: "Allow",
    allowHunter: (name: string) => `Allow ${name}`,
    deny: "Deny",
    denyHunter: (name: string) => `Deny ${name}`,
  },

  terminal: {
    of: "Terminal of ",
    running: "running",
    ended: (exitCode: number) => `ended, exit ${exitCode}`,
    again: "Resume again",
    close: "Close the terminal",
    cut: "The line to the terminal is down.",
  },

  close: "Close",
}
