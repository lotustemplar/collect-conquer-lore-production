const CACHE_KEY = 'collect-conquer-scryfall-search-cache-v1';
const cache = new Map();
const TARGET_CARDS = {
  desert: ['Sunscorched Desert', 'Endless Sands', 'Dunes of the Dead'],
  barren: ['Sunscorched Desert', 'Endless Sands', 'Dunes of the Dead'],
  airship: ['Skysovereign, Consul Flagship', 'Aethersphere Harvester'],
  'cargo vessel': ['Skysovereign, Consul Flagship', 'Aethersphere Harvester'],
  vehicle: ['Skysovereign, Consul Flagship', 'Aethersphere Harvester'],
  volcano: ['Shivan Gorge', 'Smoldering Crater', 'Cinder Barrens'],
  volcanic: ['Shivan Gorge', 'Smoldering Crater', 'Cinder Barrens'],
  mountain: ['Shivan Gorge'],
  yawgmoth: ['Yawgmoth, Thran Physician'],
  rebbec: ['Rebbec, Architect of Ascension'],
  gix: ['Gix, Yawgmoth Praetor'],
  powerstone: ['Powerstone Shard', 'Powerstone Minefield'],
  crystal: ['Powerstone Shard']
};

function cachedSearches() {
  if (cache.size) return cache;
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    Object.entries(saved).forEach(([key, value]) => cache.set(key, value));
  } catch { /* local cache is optional */ }
  return cache;
}

export function candidateNamesForIntent(intent) {
  const terms = [...(intent.characters || []), ...(intent.locations || []), ...(intent.environment || []), ...(intent.objects || []), ...(intent.vehicles || []), ...(intent.architecture || [])].map(x => String(x).toLowerCase());
  const names = [];
  for (const term of terms) {
    for (const [key, values] of Object.entries(TARGET_CARDS)) if (term.includes(key)) names.push(...values);
    // Character names are searched broadly; returned art is still period-unverified.
    if (/^[a-z][a-z'-]+(?: [a-z][a-z'-]+)?$/i.test(term) && !Object.hasOwn(TARGET_CARDS, term)) names.push(term);
  }
  return [...new Set(names)].slice(0, 24);
}

function toCard(card) {
  const face = card.image_uris || card.card_faces?.[0]?.image_uris || {};
  return {
    connection_id: `scryfall-${card.id}`,
    scryfall_id: card.id,
    oracle_id: card.oracle_id || null,
    illustration_id: card.illustration_id || card.id,
    card_name: card.name,
    artist: card.artist || card.card_faces?.map(face => face.artist).filter(Boolean).join(', ') || 'Artist credit unavailable',
    description: card.oracle_text || card.type_line || '',
    type_line: card.type_line || '',
    printing: `${card.set_name || ''} (${String(card.set || '').toUpperCase()})`,
    set_code: card.set || null,
    set_name: card.set_name || null,
    released_at: card.released_at || null,
    image_uri: face.normal || face.large || face.png || '',
    image_uris: face,
    scryfall_uri: card.scryfall_uri || `https://scryfall.com/card/${card.set}/${card.collector_number}`,
    matchQuality: 'METADATA BASED',
    evidence_basis: 'METADATA_BASED',
    source: 'Scryfall'
  };
}

export async function searchScryfall(query, { signal } = {}) {
  const normalized = String(query || '').trim().toLowerCase();
  if (!normalized) return [];
  const searches = cachedSearches();
  if (searches.has(normalized)) return searches.get(normalized);
  const response = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=art&order=released&dir=desc`, {
    headers: { Accept: 'application/json;q=0.9,*/*;q=0.8' }, signal
  });
  const body = await response.json();
  if (!response.ok && response.status !== 404) throw new Error(body?.details || `Scryfall request failed (${response.status}).`);
  const result = (body.data || []).map(toCard);
  searches.set(normalized, result);
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(searches))); } catch { /* quota/private mode */ }
  return result;
}

export async function searchIntentCards(intent, options = {}) {
  const names = candidateNamesForIntent(intent);
  if (!names.length) return [];
  const q = names.map(name => `name:${JSON.stringify(name)}`).join(' or ');
  return searchScryfall(q, options);
}
