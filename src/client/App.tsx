import { useWorld } from "./useWorld.js"
import { WorldMap } from "./WorldMap.js"

export function App() {
  const { world, connected } = useWorld()
  return (
    <main>
      <h1 className="visually-hidden">Guslar</h1>
      <WorldMap world={world} />
      {world && !connected && (
        <p className="notice" role="status">
          The road to the server is cut. Reconnecting…
        </p>
      )}
    </main>
  )
}
