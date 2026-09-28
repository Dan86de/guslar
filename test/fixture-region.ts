import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { tempDir } from "./guslar.js"

/** A repo the way the skills leave it: specs, a slices file, and a `slices/<slug>` branch carrying trailers. */
export type FixtureRegion = {
  repo: string
  /** Commits on the current branch, with the given message paragraphs. */
  commit(...paragraphs: string[]): void
  git(...args: string[]): string
  write(file: string, content: string): void
}

export function fixtureRegion(): FixtureRegion {
  const repo = path.join(tempDir(), "bogwater")
  mkdirSync(repo)
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: repo,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        HOME: repo,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_AUTHOR_NAME: "Fixture",
        GIT_AUTHOR_EMAIL: "fixture@guslar.invalid",
        GIT_COMMITTER_NAME: "Fixture",
        GIT_COMMITTER_EMAIL: "fixture@guslar.invalid",
      },
    }).trim()
  const write = (file: string, content: string) => {
    mkdirSync(path.dirname(path.join(repo, file)), { recursive: true })
    writeFileSync(path.join(repo, file), content)
  }
  git("init", "--quiet", "--initial-branch=main")
  return {
    repo,
    git,
    write,
    commit: (...paragraphs) => git("commit", "--quiet", "--allow-empty", ...paragraphs.flatMap((p) => ["-m", p])),
  }
}

export const DRAIN_THE_BOG = [
  { id: "S1", title: "Dig the first ditch", autonomy: "afk", blocked_by: [] },
  { id: "S2", title: "Raise the dyke", autonomy: "hitl", blocked_by: ["S1"] },
  { id: "S3", title: "Lay the plank road", autonomy: "afk", blocked_by: ["S1"] },
  { id: "S4", title: "Drive out the utopiec", autonomy: "hitl", blocked_by: ["S2", "S3"] },
  { id: "S5", title: "Build the sluice", autonomy: "afk", blocked_by: ["S2"] },
]

/**
 * Bogwater: two specs, one of them sliced. On `slices/drain-the-bog`, S1 is done and S2
 * pending, so S3 is ready, S4 is sealed by S2 and S3, and S5 by S2.
 */
export function bogwater(): FixtureRegion {
  const region = fixtureRegion()
  region.write(".scratch/specs/drain-the-bog.md", "# Drain the bog\n\nA fixture spec.\n")
  region.write(".scratch/specs/ward-the-well.md", "# Ward the well\n\nNot sliced yet.\n")
  region.git("add", ".")
  region.commit("Add the specs")
  const base = region.git("rev-parse", "HEAD")
  region.write(
    ".scratch/slices/drain-the-bog.json",
    `${JSON.stringify({ spec: ".scratch/specs/drain-the-bog.md", commit: base, branch: "main", slices: DRAIN_THE_BOG }, null, 2)}\n`,
  )
  region.git("switch", "--quiet", "--create", "slices/drain-the-bog")
  region.commit("Dig the first ditch", "Slice S1 of .scratch/specs/drain-the-bog.md.", "Slice: S1")
  region.commit("Raise the dyke", "Awaiting sign-off:\n- the dyke holds", "Slice-Pending: S2")
  return region
}
