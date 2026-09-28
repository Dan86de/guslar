import { spawn } from "node:child_process"

/**
 * Opens the map in the user's browser. `BROWSER` overrides the platform opener:
 * `none` skips opening, anything else is run as a program with the URL as its argument.
 */
export function openBrowser(url: string, env: NodeJS.ProcessEnv = process.env): void {
  const override = env.BROWSER?.trim()
  if (override?.toLowerCase() === "none") return

  const [command, args] = override
    ? [override, [url]]
    : process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", '""', url]]
        : ["xdg-open", [url]]

  const child = spawn(command, args, { stdio: "ignore", detached: true })
  child.on("error", (error) => {
    console.error(`guslar: could not open a browser (${error.message}). Open ${url} yourself.`)
  })
  child.unref()
}
