// Map id -> display name. Populated at runtime from fastcup's GetMaps query
// (setMaps), with a static fallback for the active CS2 pool so names render
// even before that resolves.
const SEED = {
  257: 'Dust II', 258: 'Mirage', 259: 'Overpass', 260: 'Inferno',
  261: 'Vertigo', 262: 'Anubis', 263: 'Ancient', 264: 'Nuke', 350: 'Train',
}

const cache = { ...SEED }

export function setMaps(list) {
  for (const m of list || []) {
    if (m && m.id != null && m.name) cache[m.id] = m.name
  }
}

export function mapName(id) {
  return cache[id] || `Map ${id}`
}
