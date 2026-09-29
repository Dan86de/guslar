import flareUrl from "../../art/awaiting-flare.png"
import fogUrl from "../../art/fog.png"
import huntingUrl from "../../art/hunter-hunting.png"
import ridingUrl from "../../art/hunter-riding.png"
import trophyUrl from "../../art/hunter-trophy.png"
import woundedUrl from "../../art/hunter-wounded.png"
import faultLightUrl from "../../art/vaillant/fault-light.png"
import frostUrl from "../../art/vaillant/frost.png"
import commissionedUrl from "../../art/vaillant/hare-commissioned.png"
import drivingUrl from "../../art/vaillant/hare-driving.png"
import faultUrl from "../../art/vaillant/hare-fault.png"
import workingUrl from "../../art/vaillant/hare-working.png"
import deliveredUrl from "../../art/vaillant/heatpump-delivered.png"
import installingUrl from "../../art/vaillant/heatpump-installing.png"
import runningUrl from "../../art/vaillant/heatpump-running.png"
import vaillantMapUrl from "../../art/vaillant/world-map.png"
import bountyUrl from "../../art/village-bounty.png"
import clearedUrl from "../../art/village-cleared.png"
import contractsUrl from "../../art/village-contracts.png"
import mapUrl from "../../art/world-map.png"
import type { RegionSlot, VillageStage } from "../shared/world.js"
import type { Ellipse } from "./geometry.js"
import type { Pose } from "./hunters.js"
import { DEFAULT_THEME, isTheme, type Theme } from "../shared/theme.js"

/** An sRGB colour, each channel 0 to 255. */
export type Rgb = readonly [number, number, number]

/**
 * What a theme paints the map with. Every theme's map is painted on the same six footprints, so
 * the same geometry places everything on either one.
 */
export type ThemeArt = {
  /** The painted world, 2752×1536: the space every map coordinate lives in. */
  map: string
  /** The weather's hatching, drifting inside the veil over the unclaimed slots. */
  weather: string
  /**
   * The veil's wash, from the heart of a slot's cloud to where it thins, and the slots whose cloud
   * reaches wider than Guslar's, for a painting whose landmarks stand past its footprint's edge.
   * Only the cloud grows: the region's plaque, villages and clear zone keep their places.
   */
  veil: { heart: Rgb; rim: Rgb; reach?: Partial<Record<RegionSlot, Ellipse>> }
  /** The colour the weather's hatching is laid on the veil in. */
  ink: Rgb
  /** Each village stage's art, painted from one camera so they swap in place. */
  villages: Record<VillageStage, string>
  /** Each hunter pose's art, painted from one camera and facing right, so they swap and flip in place. */
  poses: Record<Pose, string>
  /**
   * What is planted beside a hunter awaiting you, the one strong red on the map, and how tall it
   * stands as a share of its figure: Guslar's pennant tall enough to fly beside the head.
   */
  flare: { art: string; height: number }
}

/**
 * Guslar's fog is a bone wash with dark hatching blowing through it. The Vaillant world's frost
 * is its snow's own lavender blue a shade deeper, so a frosted office reads as veiled rather than
 * as empty snow, with slate-blue rime blowing through it.
 */
export const THEME_ART: Record<Theme, ThemeArt> = {
  guslar: {
    map: mapUrl,
    weather: fogUrl,
    veil: { heart: [212, 201, 169], rim: [169, 169, 156] },
    ink: [0, 0, 0],
    villages: { "bounty-drafted": bountyUrl, "contracts-posted": contractsUrl, cleared: clearedUrl },
    poses: { riding: ridingUrl, hunting: huntingUrl, wounded: woundedUrl, trophy: trophyUrl },
    flare: { art: flareUrl, height: 0.85 },
  },
  vaillant: {
    map: vaillantMapUrl,
    weather: frostUrl,
    veil: {
      heart: [218, 221, 236],
      rim: [172, 178, 203],
      // Istanbul's Galata tower stands above its footprint, Dietikon's crags run out to the
      // border, and Katowice's sheds reach down past its own.
      reach: {
        ruins: { x: 680, y: 440, rx: 450, ry: 370 },
        mountains: { x: 2150, y: 950, rx: 510, ry: 370 },
        mines: { x: 680, y: 1010, rx: 420, ry: 360 },
      },
    },
    ink: [58, 64, 96],
    // A heat pump crated on its pallet, then with its panel off and hoses run, then running.
    villages: { "bounty-drafted": deliveredUrl, "contracts-posted": installingUrl, cleared: runningUrl },
    // The hare drives out in the van, kneels at the unit, comes back singed or waving the signed sheet.
    poses: { riding: drivingUrl, hunting: workingUrl, wounded: faultUrl, trophy: commissionedUrl },
    flare: { art: faultLightUrl, height: 0.7 },
  },
}

/**
 * The theme the page was served in. The server writes it on the root before the page loads,
 * so the map is painted in its world's art from the first frame, before any broadcast.
 */
export function pageTheme(): Theme {
  const theme = document.documentElement.dataset.theme
  return isTheme(theme) ? theme : DEFAULT_THEME
}
