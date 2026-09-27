import { execFileSync } from "node:child_process"

/** The tests run the real `guslar` bin, so they run against a fresh build. */
export default function setup(): void {
  execFileSync("npm", ["run", "build"], { stdio: "inherit" })
}
