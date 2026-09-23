import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import production from '../src/episode-002-production.json' with { type: 'json' };

test('Episode 2 is a five-scene, source-linked production record with local backgrounds', () => {
  assert.equal(production.episode_id, 'episode_6635ebde984f5509a6ad8e3dad8c81c7');
  assert.equal(production.scenes.length, 5);
  assert.ok(production.scenes.reduce((count, scene) => count + scene.excerpt.split(/\s+/).length, 0) >= 650);
  assert.ok(production.scenes.reduce((count, scene) => count + scene.excerpt.split(/\s+/).length, 0) <= 850);
  assert.equal(new Set(production.scenes.map(scene => scene.name)).size, 5);
  assert.ok(production.scenes.every(scene => scene.excerpt.split(/\s+/).length >= 100), 'scenes are sustained narration beats');
  assert.ok(production.scenes.every(scene => scene.sourceReferences?.length && scene.sourceReferences[0].chapter));
  assert.ok(production.scenes.every(scene => existsSync(`public${scene.backgroundImage}`)));
  assert.equal(production.scenes.some(scene => scene.suggestedCards?.some(card => card.card_name === 'Gix, Yawgmoth Praetor')), false);
  assert.match(production.scenes[3].suggestedCards[0].reason, /related character artwork only/i);
  assert.match(production.scenes[4].excerpt, /hundreds of the damned behind him/);
  assert.match(production.scenes[4].excerpt, /the condemned were coming up/i);
  assert.deepEqual(production.scenes[4].sourceReferences.map(source => source.chapter), [4, 5, 6]);
  assert.equal(readFileSync(new URL('../src/episode-002-production.json', import.meta.url), 'utf8').includes('\uFFFD'), false);
});
