import type {
  Autonomy,
  Contract,
  Hunter,
  HunterState,
  PermissionMode,
  RegionSlot,
  Rite,
  VillageStage,
} from "../../shared/world.js"

/** Each rite as the world names it. */
const RITES: Record<Rite, string> = {
  "implement-slice": "Take the contract",
  interview: "Hear the villagers",
  "write-spec": "Draft the bounty",
  "write-slices": "Post contracts",
  "make-verify": "Set the proof of kill",
  "sign-off": "Inspect the trophy",
}

/** What a hunter is out for, as a phrase after "out": `on S3`, or `to post contracts`. */
function errand(hunter: Pick<Hunter, "rite" | "contract">): string {
  switch (hunter.rite) {
    case undefined:
      return "on an errand of its own"
    case "implement-slice":
      return `on ${hunter.contract ?? "a contract"}`
    case "sign-off":
      return `to inspect the trophy of ${hunter.contract ?? "a contract"}`
    default:
      return `to ${RITES[hunter.rite].toLowerCase()}`
  }
}

/** What a region's list, a card or a board says of the hunter sent on it once it has come back. */
function returned(hunter: Pick<Hunter, "name" | "state">): string | undefined {
  switch (hunter.state) {
    case "returned-trophy":
      return `${hunter.name} returned with a trophy`
    case "returned-wounded":
      return `${hunter.name} returned wounded`
    default:
      return undefined
  }
}

/**
 * Every word Guslar's map says, keyed by what it means rather than where it stands, so a theme can
 * say the same things in its own words. A phrase with something in it is a function of that.
 */
export const guslar = {
  app: {
    heading: "Guslar",
    reconnecting: "The road to the server is cut. Reconnecting…",
  },

  server: {
    answered: (status: number) => `The server answered ${status}.`,
    unreachable: "The road to the server is cut. Try again once it is back.",
  },

  map: {
    regions: "Regions",
    /** A slot by itself, as a region's item and a fogged one name it: `river town`. */
    slots: {
      forest: "forest",
      marsh: "marsh",
      mountains: "mountains",
      "river-town": "river town",
      mines: "mines",
      ruins: "ruins",
    } satisfies Record<RegionSlot, string>,
    unclaimed: (slot: string) => `Unclaimed ${slot}, under fog`,
    villages: "Villages",
    /** Said after a village's title on its button: `, village in Bogwater Reach`. */
    villageIn: (region: string) => `, village in ${region}`,
    stages: {
      "bounty-drafted": "Bounty drafted",
      "contracts-posted": "Contracts posted",
      cleared: "Cleared",
    } satisfies Record<VillageStage, string>,
    hunters: "Hunters",
    regionRites: "Region rites",
  },

  hunter: {
    /** A hunter's state in words, as the map's list and the journal say it. */
    states: {
      "riding-out": "riding out",
      hunting: "hunting",
      "awaiting-you": "awaiting you",
      "returned-trophy": "returned with a trophy",
      "returned-wounded": "returned wounded",
    } satisfies Record<HunterState, string>,
    errand,
    returned,
    /** Out on one of its region's or village's rites, other than hunting or inspecting a contract. */
    out: (hunter: Pick<Hunter, "name" | "rite" | "contract">) => `${hunter.name} is out ${errand(hunter)}`,
    hunts: (name: string) => `${name} hunts it`,
    inspects: (name: string) => `${name} inspects it`,
    /**
     * A village takes one hunter at a time, and so does a region for its own rites; this is what
     * either says to a second one.
     */
    refusal: (place: string, holder: Pick<Hunter, "name" | "rite" | "contract">) =>
      `${place} refuses a second hunter: ${holder.name} is out ${errand(holder)}.`,
  },

  /** What a hunter is bound to and out for, as its journal, its petitions and the map's list say it. */
  bound: {
    outside: "A session started outside Guslar",
    signOff: (contract: string) => `${RITES["sign-off"]} of ${contract}`,
    /** After the state in the map's list: ` on S3 of Drain the bog`. */
    hunt: (errand: string, where: string) => ` ${errand} of ${where}`,
    /** After the state in the map's list, for a rite: `, sent to post contracts for Drain the bog`. */
    sent: (errand: string, where: string, inRegion: boolean) => `, sent ${errand} ${inRegion ? "in" : "for"} ${where}`,
    /** A session started outside Guslar not yet seen on a contract: ` in Bogwater Reach`. */
    outsideIn: (where: string) => ` in ${where}`,
    outsideSuffix: ", started outside Guslar",
  },

  rites: {
    names: RITES,
    /** The rites a region performs itself, before or beside any one village, as its dialog describes them. */
    details: {
      interview: "A hunter asks what the region needs, until nothing is left unsettled.",
      "write-spec": "A hunter writes the bounty a new village is founded on.",
      "make-verify": "A hunter sets how a kill in this region is proven.",
    } satisfies Partial<Record<Rite, string>>,
    /** Hidden before the region's name in the dialog's heading, so it is named `Rites of <region>`. */
    of: "Rites of ",
    /** The plaque's name, and the dialog's. */
    ofRegion: (region: string) => `Rites of ${region}`,
    slot: (slot: string) => `The ${slot}`,
    ask: "Which rite will you have a hunter perform here?",
    list: "Rites",
    close: "Close the rites",
    /** What the chooser asks before it asks how far, on an interview. */
    interview: {
      label: "What shall the hunter ask you about?",
      hint: "Leave it empty and it asks what the region needs.",
    },
  },

  chooser: {
    /** The chooser's heading: what the hunter is sent for, `on S3` or `to post contracts`. */
    send: (errand: string) => `Send a hunter ${errand}`,
    ask: "How far may the hunter go without asking you?",
    modesList: "Permission modes",
    /** How far a hunter may go without asking you, as the chooser offers it. */
    modes: {
      default: { label: "Ask before every tool", detail: "It stops for you at each step." },
      acceptEdits: { label: "Edit files freely", detail: "It asks before anything else." },
      auto: { label: "Let Claude judge", detail: "It asks only when a step looks risky." },
      bypassPermissions: { label: "Never ask", detail: "It rides alone and asks nothing." },
    } satisfies Record<PermissionMode, { label: string; detail: string }>,
    cancel: "Cancel",
  },

  board: {
    /** afk: the hunter rides alone. hitl: the alderman summons you before it is paid. */
    autonomy: { afk: "rides alone", hitl: "summons you" } satisfies Record<Autonomy, string>,
    states: {
      done: "Done",
      pending: "Pending",
      ready: "Ready",
    } satisfies Record<Exclude<Contract["state"], "sealed">, string>,
    sealed: (by: string[]) => `Sealed by ${by.join(", ")}`,
    take: "Take",
    takeContract: (id: string) => `Take ${id}`,
    inspect: "Inspect",
    inspectContract: (id: string) => `${RITES["sign-off"]} of ${id}`,
    /** Hidden before the village's title in the board's heading, so it is named `Notice board of <village>`. */
    of: "Notice board of ",
    close: "Close the notice board",
    unreadable: (problem: string) => `The contracts cannot be read. ${problem}`,
    empty: "No contracts are posted yet.",
    contracts: "Contracts",
  },

  journal: {
    of: "Journal of ",
    you: "You",
    turnEnds: "The turn ends.",
    turnFails: (text: string) => `The turn ends in failure${text ? `: ${text}` : "."}`,
    stillOut: (name: string) => `${name} is still out: it can only be sent home once it is back.`,
    notBegun: (name: string) => `${name}'s session has not begun yet.`,
    openTerminal: "Open in terminal",
    sendHome: "Send home",
    close: "Close the journal",
    entries: "Entries",
    /** In place of the reply line, in the journal of a session started outside Guslar. */
    outside: (name: string) => `Started outside Guslar: write to ${name} in its own terminal.`,
    reply: (name: string) => `Reply to ${name}`,
    draft: (name: string) => `Write to ${name}…`,
    send: "Send",
  },

  petition: {
    requests: "Requests",
    /** Between the hunter's name and the tool in a petition's heading: `Wojmir asks to use Bash`. */
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
    cut: "The road to the terminal is cut.",
  },

  /** The visible word on every button that puts a dialog away; its accessible name says which. */
  close: "Close",
}
