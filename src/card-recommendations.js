const clean = value => String(value ?? '').trim();
const normalize = value => clean(value).toLowerCase().replace(/[â€™â€˜]/g, "'").replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));

export const MATCH_WEIGHTS = Object.freeze({
  canonical: 0.20, environment: 0.20, subject: 0.20, action: 0.10,
  atmosphere: 0.10, artStyle: 0.10, composition: 0.05, diversity: 0.05
});

const INTENT_TERMS = {
  environment: [
    ['desert', /\b(desert|barren|arid|dun[e]?|wasteland|scorched)\b/i],
    ['volcano', /\b(volcan(?:o|ic)|lava|basalt|crater)\b/i],
    ['mountain', /\b(mountain|highway|road|pass|rocky|cliff)\b/i],
    ['cavern', /\b(cave|cavern|underground|shaft|darkness|stalactite|stalagmite)\b/i],
    ['city', /\b(city|capital|terrace|street|gate|empire|architecture)\b/i],
    ['infirmary', /\b(infirmary|healer|patient|hospital|medical)\b/i]
  ],
  objects: [
    ['airship', /\b(skyship|airship|cargo vessel|flying ship|airborne vessel)\b/i],
    ['vehicle', /\b(sedan chair|vehicle|transport|craft|ship)\b/i],
    ['powerstone', /\b(powerstone|crystal|mana rig|artifact|machine|machinery)\b/i]
  ],
  actions: [
    ['travel', /\b(walk(?:ed|ing)?|journey|travel|cross(?:ed|ing)?|descend(?:ed|ing)?)\b/i],
    ['flight', /\b(fly|flew|flying|crossed the sky|hover(?:ed|ing)?)\b/i],
    ['healing', /\b(heal(?:er|ing)?|treat(?:ed|ment)?|examin(?:e|ed|ing))\b/i],
    ['conflict', /\b(battle|fight|attack|riot|war|confront)\b/i]
  ],
  mood: [
    ['isolation', /\b(alone|isolat(?:ed|ion)|exile|no escort|lonely)\b/i],
    ['grandeur', /\b(empire|capital|monumental|grand|temple|triumph|glory)\b/i],
    ['foreboding', /\b(danger|cost|threat(?:ening)?|ominous|foreboding|burn|fear|dread|consequence)\b/i],
    ['grief', /\b(dying|ill|sick|death|wound|disease|pain)\b/i]
  ]
};

const wordsFor = (text, terms) => terms.filter(([tag, regex]) => {
  const match = regex.exec(text);
  if (!match) return false;
  const before = text.slice(0, match.index);
  return !new RegExp(`\\b(no|not|without|never)\\s+(?:[\\w'-]+\\s+){0,2}$`, 'i').test(before);
}).map(([tag]) => tag);

// Keep exact source spans. Split only when a sentence contains two independently
// drawable clauses joined by a contrast/temporal connector and both sides have
// visual nouns or actions; otherwise the sentence stays in the current beat.
export function splitIntoVisualSpans(text) {
  const source = clean(text);
  const sentenceRows = [...source.matchAll(/[^.!?]+[.!?]+|[^.!?]+$/g)];
  const spans = [];
  for (const match of sentenceRows) {
    const sentence = match[0];
    const start = match.index + sentence.search(/\S/);
    const split = sentence.match(/^(.*?\b(?:while|whereas|but)\b)\s+(.+)$/i);
    if (split && /\b(walk|road|highway|travell|journey|alone|ship|vessel|sky|fly|cargo|city|gate|mountain|volcano|cave|powerstone|machine|temple|infirmary|patient|riot|attack)\b/i.test(split[1]) && /\b(walk|road|highway|travell|journey|alone|ship|vessel|sky|fly|cargo|city|gate|mountain|volcano|cave|powerstone|machine|temple|infirmary|patient|riot|attack)\b/i.test(split[2])) {
      const connector = split[1].match(/\b(?:while|whereas|but)\b/i);
      const left = split[1].slice(0, connector.index).trim();
      const right = split[2].trim();
      const leftStart = match.index + sentence.indexOf(left);
      const rightStart = match.index + sentence.indexOf(right);
      spans.push({ text: left, start: leftStart, end: leftStart + left.length, split: true });
      spans.push({ text: right, start: rightStart, end: rightStart + right.length, split: true });
    } else {
      spans.push({ text: sentence.trim(), start, end: start + sentence.trim().length });
    }
  }
  // Sentence and clause spans become visual opportunities inside existing scenes.
  // The episode scene model remains unchanged; several opportunities can be
  // reviewed together without forcing an edit cut for every sentence.
  return spans;
}

export function extractVisualIntents(scene, packet = {}) {
  const source = clean(scene?.excerpt || scene?.narration || '');
  const spans = splitIntoVisualSpans(source);
  const chars = (packet.characters || packet.confirmed_characters || []).map(x => typeof x === 'string' ? x : x.name).filter(Boolean);
  const locations = (packet.locations || packet.confirmed_locations || []).map(x => typeof x === 'string' ? x : x.name).filter(Boolean);
  const period = clean(packet.chronological_placement || packet.chronology || '');
  return spans.map((span, index) => {
    const text = span.text;
    const explicitCharacters = chars.filter(name => normalize(text).includes(normalize(name)));
    const explicitLocations = locations.filter(name => normalize(text).includes(normalize(name)));
    const loreCharacters = chars.filter(name => !explicitCharacters.includes(name) && normalize(source).includes(normalize(name)));
    const explicit = wordsFor(text, Object.values(INTENT_TERMS).flatMap(category => category));
    const infer = [];
    if (/\bhighway\b/i.test(text)) infer.push('mountain');
    if (/\bskyship\b/i.test(text)) infer.push('airship');
    const distinct = wordsFor(text, INTENT_TERMS.objects);
    const primary = distinct[0] || explicit[0] || (explicitLocations.length ? 'location' : explicitCharacters.length ? 'character' : 'atmosphere');
    return {
      scene_id: scene.id,
      beat_id: `${scene.id}-beat-${index + 1}`,
      narration_text: text,
      narration_span: { start: span.start, end: span.end },
      scene_type: primary,
      characters: explicitCharacters,
      locations: explicitLocations,
      historical_period: period,
      environment: wordsFor(text, INTENT_TERMS.environment),
      objects: wordsFor(text, INTENT_TERMS.objects),
      architecture: /\b(gate|city|capital|terrace|temple|tower|building)\b/i.test(text) ? ['architecture'] : [],
      technology: /\b(powerstone|mana rig|machine|machinery|artificer|crystal)\b/i.test(text) ? ['Thran artifice'] : [],
      vehicles: wordsFor(text, [['airship', INTENT_TERMS.objects[0][1]], ['vehicle', INTENT_TERMS.objects[1][1]]]),
      actions: wordsFor(text, INTENT_TERMS.actions),
      mood: wordsFor(text, INTENT_TERMS.mood),
      visual_priorities: uniq([primary, ...wordsFor(text, INTENT_TERMS.environment), ...wordsFor(text, INTENT_TERMS.objects)]),
      canonical_entities: explicitCharacters.map(name => ({ name, evidence: 'EXPLICIT_IN_NARRATION' })),
      visual_exclusions: /\b(no|not|without)\s+(?:skyship|airship|escort|vehicle|ship)\b/i.test(text) ? ['Explicitly absent from this narration span; do not depict.'] : [],
      evidence: {
        explicit: { characters: explicitCharacters, locations: explicitLocations, concepts: explicit },
        lore_supported: loreCharacters.map(name => ({ name, note: 'Mentioned elsewhere in this scene; not necessarily visible in this beat.' })),
        inferred: infer.map(tag => ({ tag, explanation: 'Search expansion only; not a claim that this feature is present.' }))
      }
    };
  });
}

function uniq(items) { return [...new Set(items.filter(Boolean))]; }

export function validateVisualIntent(intent) {
  const required = ['scene_id','beat_id','narration_text','narration_span','scene_type','characters','locations','historical_period','environment','objects','architecture','technology','vehicles','actions','mood','visual_priorities','canonical_entities','visual_exclusions','evidence'];
  const missing = required.filter(key => !(key in (intent || {})));
  const spanValid = intent?.narration_span && Number.isInteger(intent.narration_span.start) && Number.isInteger(intent.narration_span.end) && intent.narration_span.start >= 0 && intent.narration_span.end >= intent.narration_span.start;
  return { valid: missing.length === 0 && !!spanValid, missing, spanValid: !!spanValid };
}

export function scoreArtworkCandidate(candidate, intent, { assignedIllustrations = [], recentIllustrations = [], index = {} } = {}) {
  const artId = candidate.illustration_id || candidate.scryfall_id || candidate.connection_id;
  const indexed = index[artId] || candidate.visual_description || null;
  const tags = (indexed?.descriptors || candidate.visual_tags || []).map(normalize);
  const overlap = values => {
    const concepts = (values || []).map(normalize);
    return concepts.length ? clamp01(concepts.filter(concept => tags.some(tag => tag.includes(concept) || concept.includes(tag))).length / concepts.length) : 0;
  };
  const environment = overlap([...intent.environment, ...intent.architecture]);
  const subject = overlap([...intent.objects, ...intent.technology, ...intent.vehicles]);
  const action = overlap(intent.actions);
  const atmosphere = overlap(intent.mood);
  const canonical = candidate.canonicalEvidence ? clamp01(candidate.canonicalEvidence.confidence ?? 0.85) : 0;
  const artStyle = indexed ? clamp01(indexed.art_style_score ?? 0.5) : 0;
  const composition = indexed ? clamp01(indexed.composition_score ?? 0.5) : 0;
  const repeat = assignedIllustrations.includes(artId) ? 0 : recentIllustrations.includes(artId) ? 0.25 : 1;
  const weights = MATCH_WEIGHTS;
  const raw = canonical * weights.canonical + environment * weights.environment + subject * weights.subject + action * weights.action + atmosphere * weights.atmosphere + artStyle * weights.artStyle + composition * weights.composition + repeat * weights.diversity;
  const visuallyComparable = environment > 0 || subject > 0 || action > 0;
  const classification = candidate.canonicalEvidence ? 'CANONICAL' : indexed && visuallyComparable ? 'VISUAL ANALOGUE' : indexed && atmosphere > 0 ? 'ATMOSPHERIC' : 'UNVERIFIED';
  const visuallyVerified = Boolean(indexed?.verified_at && indexed?.provider);
  return {
    ...candidate,
    illustration_id: artId,
    classification,
    relevance_score: Math.round(raw * 100),
    score_metrics: { canonical, environment, subject, action, atmosphere, artStyle, composition, diversity: repeat },
    evidence_basis: visuallyVerified ? 'VISUALLY_ANALYZED' : 'METADATA_BASED',
    visual_index: indexed || null,
    repeat_penalty: repeat < 1,
    reason: candidate.canonicalEvidence
      ? `Canonical character association is supported by the lore record. ${candidate.timelineNote || 'This printing may depict a different period or form; inspect the artwork before treating it as a scene depiction.'}`
      : indexed && visuallyComparable
        ? `Visual analogue based on indexed illustration descriptors: ${tags.join(', ')}. It does not depict this canonical event.`
        : indexed && atmosphere > 0
          ? `Atmospheric match based on indexed illustration descriptors: ${tags.join(', ')}. It does not establish the event, people, or setting.`
        : 'Metadata-based possibility only. The illustration has not been visually analyzed, so its subject and scene fit remain unverified.'
  };
}

export function consolidateArtworkCandidates(candidates) {
  const byArt = new Map();
  for (const card of candidates) {
    const id = card.illustration_id || card.scryfall_id || card.connection_id;
    const current = byArt.get(id);
    // Same illustration may be represented by several printings; retain the
    // most useful printing while preserving genuinely distinct illustration IDs.
    if (!current || (card.relevance_score || 0) > (current.relevance_score || 0)) byArt.set(id, card);
  }
  return [...byArt.values()].sort((a,b) => (b.relevance_score || 0) - (a.relevance_score || 0));
}

export function getScryfallSearchConcepts(intent) {
  return uniq([
    ...intent.characters,
    ...intent.locations,
    ...intent.environment,
    ...intent.objects,
    ...intent.vehicles,
    ...intent.architecture
  ]).slice(0, 8);
}
