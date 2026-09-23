import test from 'node:test';
import assert from 'node:assert/strict';
import {
  consolidateArtworkCandidates, extractVisualIntents, getScryfallSearchConcepts,
  scoreArtworkCandidate, splitIntoVisualSpans, validateVisualIntent
} from '../src/card-recommendations.js';
import { candidateNamesForIntent } from '../src/scryfall.js';

const yawgmothReturn = 'Yawgmoth walked alone along the desert road, while a cargo vessel crossed the sky above him.';

test('visual opportunities preserve source text and structured fields', () => {
  const scene = { id: 'E002-scene-1', excerpt: yawgmothReturn };
  const beats = extractVisualIntents(scene, { chronological_placement: 'The Thran, Chapter 2' });
  assert.equal(beats.length, 2);
  for (const beat of beats) {
    assert.equal(validateVisualIntent(beat).valid, true);
    assert.equal(yawgmothReturn.slice(beat.narration_span.start, beat.narration_span.end), beat.narration_text);
  }
  assert.ok(beats[0].mood.includes('isolation'));
  assert.ok(beats[1].objects.includes('airship'), 'cargo-vessel imagery is a search expansion');
  assert.equal(beats[1].evidence.inferred.some(row => row.tag === 'airship'), false);
});

test('negative wording excludes absent visual subjects', () => {
  const beat = extractVisualIntents({ id: 's', excerpt: 'The traveler crossed the desert with no skyship overhead.' })[0];
  assert.deepEqual(beat.vehicles, []);
  assert.deepEqual(beat.visual_exclusions, ['Explicitly absent from this narration span; do not depict.']);
});

test('episode association alone never establishes canon or scene appearance', () => {
  const intent = extractVisualIntents({ id: 's', excerpt: 'Halcyon rose above the Thran road.' })[0];
  const result = scoreArtworkCandidate({ card_name: 'Gix', episode_id: 'E002' }, intent);
  assert.equal(result.classification, 'UNVERIFIED');
  assert.match(result.reason, /not been visually analyzed/i);
});

test('evidence labels distinguish canonical association, indexed analogue, atmosphere, and unknown art', () => {
  const intent = extractVisualIntents({ id: 's', excerpt: 'A traveler crossed the desert beneath a foreboding sky.' })[0];
  const canonical = scoreArtworkCandidate({ card_name: 'Traveler', canonicalEvidence: { confidence: 0.8 }, timelineNote: 'Association only.' }, intent);
  const analogue = scoreArtworkCandidate({ card_name: 'Desert art', illustration_id: 'desert-art' }, intent, { index: { 'desert-art': { descriptors: ['desert'], provider: 'human-reviewed', verified_at: '2026-01-01' } } });
  const atmospheric = scoreArtworkCandidate({ card_name: 'Storm art', illustration_id: 'storm-art' }, intent, { index: { 'storm-art': { descriptors: ['foreboding'], provider: 'human-reviewed', verified_at: '2026-01-01' } } });
  const unknown = scoreArtworkCandidate({ card_name: 'Unknown art' }, intent);
  assert.equal(canonical.classification, 'CANONICAL');
  assert.match(canonical.reason, /Association only/);
  assert.equal(analogue.classification, 'VISUAL ANALOGUE');
  assert.equal(analogue.evidence_basis, 'VISUALLY_ANALYZED');
  assert.equal(atmospheric.classification, 'ATMOSPHERIC');
  assert.equal(unknown.classification, 'UNVERIFIED');
  assert.ok(unknown.relevance_score >= 0 && unknown.relevance_score <= 100);
  Object.values(unknown.score_metrics).forEach(value => assert.ok(value >= 0 && value <= 1));
});

test('Scryfall search concepts and card suggestions include landscape and vehicle opportunities', () => {
  const desert = extractVisualIntents({ id: 's', excerpt: 'An exhausted traveler crossed the barren desert.' })[0];
  const ship = extractVisualIntents({ id: 's', excerpt: 'A cargo vessel crossed the sky.' })[0];
  assert.ok(getScryfallSearchConcepts(desert).includes('desert'));
  assert.ok(candidateNamesForIntent(desert).some(name => /desert|dunes|sands/i.test(name)));
  assert.ok(candidateNamesForIntent(ship).some(name => /skysovereign|harvester/i.test(name)));
});

test('repeat avoidance lowers repeated art and candidate consolidation removes printing duplicates', () => {
  const intent = extractVisualIntents({ id: 's', excerpt: 'A traveler crossed the desert.' })[0];
  const candidate = { card_name: 'Desert', illustration_id: 'same-art' };
  const fresh = scoreArtworkCandidate(candidate, intent, { index: { 'same-art': { descriptors: ['desert'], provider: 'human-reviewed', verified_at: 'now' } } });
  const repeated = scoreArtworkCandidate(candidate, intent, { assignedIllustrations: ['same-art'], index: { 'same-art': { descriptors: ['desert'], provider: 'human-reviewed', verified_at: 'now' } } });
  assert.ok(repeated.relevance_score < fresh.relevance_score);
  assert.equal(repeated.score_metrics.diversity, 0);
  assert.equal(consolidateArtworkCandidates([{ ...fresh, scryfall_id: 'print-1' }, { ...fresh, scryfall_id: 'print-2' }]).length, 1);
});

test('clause splitting is stable without turning every sentence into an automatic scene', () => {
  const text = 'The council summoned him. He crossed the desert alone, while the cargo vessel passed above.';
  const spans = splitIntoVisualSpans(text);
  assert.equal(spans.length, 3);
  assert.equal(spans[0].text, 'The council summoned him.');
  assert.equal(spans[1].text, 'He crossed the desert alone,');
  assert.equal(spans[2].text, 'the cargo vessel passed above.');
});
