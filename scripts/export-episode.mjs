import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const episodesFile = readJson('EPISODES.json');
const erasFile = readJson('ERAS.json');
const arcsFile = readJson('STORY_ARCS.json');
const charactersFile = readJson('CHARACTERS.json');
const planesFile = readJson('PLANES.json');
const cardsFile = readJson('CARD_CONNECTIONS.json');
const narrationFile = readJson('NARRATION_SCRIPTS.json');
const lorePacketsFile = readJson('LORE_PACKETS.json');

const getArg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const episodeNumber = Number(getArg('--episode', '20'));
const outputRoot = path.resolve(root, getArg('--output', 'episodes'));
const episode = episodesFile.episodes.find((item) => Number(item.episode_number) === episodeNumber);
if (!episode) throw new Error(`Episode ${episodeNumber} was not found in EPISODES.json`);
const narrationRecord = narrationFile.scripts.find((item) => item.episode_id === episode.episode_id);
const lorePacket = lorePacketsFile.packets.find((item) => item.episode_id === episode.episode_id);

const era = erasFile.eras.find((item) => item.era_id === episode.era_id);
const arc = arcsFile.story_arcs.find((item) => item.arc_id === episode.arc_id);
const sourceById = new Map(erasFile.source_catalog.map((item) => [item.source_id, item]));
const characterById = new Map(charactersFile.characters.map((item) => [item.character_id, item]));
const planeById = new Map(planesFile.planes.map((item) => [item.plane_id, item]));
const connections = cardsFile.records.filter((item) => item.episode_id === episode.episode_id);
const event = episodesFile.important_events.find((item) => item.event_id === episode.important_event_ids?.[0]);
const clean = (value) => String(value || '').replace(/\r?\n/g, ' ').trim();
const characters = (episode.character_ids || []).map((id) => characterById.get(id)?.name).filter(Boolean);
const planes = (episode.plane_ids || []).map((id) => planeById.get(id)?.name).filter(Boolean);
const narrationParts = (narrationRecord?.script ? narrationRecord.script.split(/\n\s*\n/) : [episode.beginning_state, episode.core_event, episode.ending_state])
  .map(clean)
  .filter((value, index, values) => value && values.indexOf(value) === index);
const totalWords = narrationParts.join(' ').split(/\s+/).filter(Boolean).length;
const totalDuration = Math.max(30, Math.ceil(totalWords / 2.2));
const padTime = (seconds) => `00:${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')},000`;
const primary = connections.slice().sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0] || null;
const alternatives = connections.filter((item) => item.connection_id !== primary?.connection_id);
const aiNeeded = !primary || primary.connection_type === 'ATMOSPHERIC';
const aiPrompt = aiNeeded ? `A cinematic environment plate of ${clean(episode.location_raw || planes.join(', ') || 'the story location')}, focused on architecture, landscape, and atmosphere; lore-consistent Magic: The Gathering setting, no characters, no card frame, no readable text, designed to sit behind narration.` : '';
const visualEffect = primary ? (primary.connection_type === 'EXACT_EVENT' ? 'card reveal' : primary.connection_type === 'LOCATION_DEPICTION' ? 'slow pan right' : 'art crop push-in') : 'slow zoom in';
const audio = primary?.connection_type === 'EXACT_EVENT' ? 'battlefield ambience; low rumble' : primary ? 'ominous drone; reveal rise' : 'chamber ambience; magical shimmer';
const transition = primary?.connection_type === 'EXACT_EVENT' ? 'Crossfade from the previous scene, then hold the card art through the event name.' : 'Crossfade into the visual and leave a clean beat before the next scene.';

let cursorSeconds = 0;
const scenes = narrationParts.map((sceneNarration, index) => {
  const remainingScenes = narrationParts.length - index;
  const proportional = Math.round((sceneNarration.split(/\s+/).filter(Boolean).length / Math.max(totalWords, 1)) * totalDuration);
  const sceneDuration = index === narrationParts.length - 1 ? totalDuration - cursorSeconds : Math.max(8, Math.min(proportional, totalDuration - cursorSeconds - (remainingScenes - 1) * 8));
  const startSeconds = cursorSeconds;
  const endSeconds = startSeconds + sceneDuration;
  cursorSeconds = endSeconds;
  const isCoreScene = sceneNarration === clean(episode.core_event);
  const scenePrimary = isCoreScene ? primary : null;
  const sceneAlternatives = isCoreScene ? alternatives : [];
  const sceneAiNeeded = !scenePrimary;
  const scenePrompt = sceneAiNeeded ? `A cinematic environment plate of ${clean(episode.location_raw || planes.join(', ') || 'the story location')}, focused on architecture, landscape, and atmosphere; lore-consistent Magic: The Gathering setting, no characters, no card frame, no readable text, designed to sit behind narration.` : '';
  return {
    scene_number: index + 1,
    start: padTime(startSeconds).replace(',000', ''),
    end: padTime(endSeconds).replace(',000', ''),
    estimated_duration_seconds: endSeconds - startSeconds,
    narration: sceneNarration,
    event: event?.title || episode.working_title,
    characters,
    plane_location: episode.location_raw || planes.join(', ') || null,
    selected_primary_card: scenePrimary ? { card_name: scenePrimary.card_name, scryfall_id: scenePrimary.scryfall_id, connection_type: scenePrimary.connection_type, confidence: scenePrimary.confidence } : null,
    alternative_cards: sceneAlternatives.map((item) => ({ card_name: item.card_name, scryfall_id: item.scryfall_id, connection_type: item.connection_type, confidence: item.confidence })),
    ai_background_needed: sceneAiNeeded,
    ai_background_prompt: scenePrompt,
    video_effect: scenePrimary ? visualEffect : (index === 0 ? 'slow zoom in' : 'crossfade'),
    audio_sfx: scenePrimary ? audio : (index === 0 ? 'ominous drone' : 'low rumble'),
    transition_note: scenePrimary ? transition : 'Crossfade into the environment plate and keep the narration clear before the next scene.',
  };
});
const narration = scenes.map((item) => item.narration).join('\n\n');
const openingDisclaimer = `This episode stays as close to canon as possible, based on the reliable sources available to us. Some imagery is interpretive, created to help paint the story where the record or available card art leaves a gap. Card art is also an interpretation by the commissioned artists who created it; our visual choices honor their work without claiming that every image depicts an exact canonical moment. Some background images may be AI-assisted illustrative reconstructions. They are presented as visual support, not as canonical artwork.`;

const folder = path.join(outputRoot, `E${String(episodeNumber).padStart(3, '0')}`);
fs.mkdirSync(path.join(folder, 'artwork'), { recursive: true });
const write = (name, content) => fs.writeFileSync(path.join(folder, name), content, 'utf8');

write('script-clean.md', `${narration}\n`);
write('opening-disclaimer.md', `# Opening disclaimer\n\n${openingDisclaimer}\n`);
write('scenes.json', JSON.stringify({ episode_id: episode.episode_id, episode_number: episode.episode_number, title: episode.working_title, scenes }, null, 2) + '\n');
write('lore-packet.json', JSON.stringify(lorePacket || { episode_id: episode.episode_id, title: episode.working_title, packet_quality: 'MISSING' }, null, 2) + '\n');
write('canon-review.json', JSON.stringify({ episode_id: episode.episode_id, title: episode.working_title, status: lorePacket?.audit_claims?.length && narrationRecord?.script ? 'LORE VERIFIED' : 'UNVERIFIED', verified_claims: lorePacket?.audit_claims?.filter((claim) => claim.status === 'SUPPORTED').length || 0, inference_claims: lorePacket?.audit_claims?.filter((claim) => claim.status === 'SUPPORTED_WITH_INFERENCE').length || 0, unresolved_claims: lorePacket?.audit_claims?.filter((claim) => ['UNCERTAIN', 'DISPUTED', 'UNSUPPORTED'].includes(claim.status)).length || 0, claims: lorePacket?.audit_claims || [] }, null, 2) + '\n');
write('cards.json', JSON.stringify({ episode_id: episode.episode_id, selected_primary: primary, alternatives }, null, 2) + '\n');
write('shot-list.md', `# Shot list - E${String(episodeNumber).padStart(3, '0')} ${episode.working_title}\n\n## Opening disclaimer - 00:00-00:18\n\n- Hold on a restrained title card or atmospheric establishing image while the disclaimer is spoken.\n\n${scenes.map((item) => `## Scene ${String(item.scene_number).padStart(2, '0')} - ${item.start}-${item.end}\n\n- **Spoken narration:** ${item.narration}\n- **Event:** ${item.event}\n- **Characters:** ${characters.join(', ') || 'None normalized'}\n- **Plane / location:** ${item.plane_location || 'Unresolved'}\n- **Primary card:** ${item.selected_primary_card ? `${item.selected_primary_card.card_name} (${item.selected_primary_card.connection_type}, ${Math.round(item.selected_primary_card.confidence * 100)}% confidence)` : 'No strong card connection; do not force one.'}\n- **Alternative card(s):** ${item.alternative_cards.length ? item.alternative_cards.map((card) => card.card_name).join('; ') : 'None recorded'}\n- **AI background:** ${item.ai_background_needed ? item.ai_background_prompt : 'Optional; existing card art is sufficient.'}\n- **Motion / effect:** ${item.video_effect}\n- **Audio cue:** ${item.audio_sfx}\n- **Transition:** ${item.transition_note}\n`).join('\n')}`);
write('ai-background-prompts.md', `# AI background prompts - E${String(episodeNumber).padStart(3, '0')}\n\n${scenes.filter((item) => item.ai_background_needed).map((item) => `## Scene ${String(item.scene_number).padStart(2, '0')}\n\n${item.ai_background_prompt}`).join('\n\n') || 'No AI background is required for this episode scene. Use selected official card visuals as the primary image source. Environment plates remain optional for coverage.\n'}`);
write('sfx-list.md', `# Audio / SFX list - E${String(episodeNumber).padStart(3, '0')}\n\n| Scene | Cue | Use |\n|---|---|---|\n${scenes.map((item) => `| ${String(item.scene_number).padStart(2, '0')} | ${item.audio_sfx} | Support the event without competing with narration. |`).join('\n')}\n`);
const disclaimerEnd = 18;
write('subtitles.srt', `1\n00:00:00,000 --> 00:00:${String(disclaimerEnd).padStart(2, '0')},000\n${openingDisclaimer}\n\n${scenes.map((item, index) => `${index + 2}\n${padTime((parseInt(item.start.slice(3, 5), 10) * 60) + parseInt(item.start.slice(6, 8), 10) + disclaimerEnd)} --> ${padTime((parseInt(item.end.slice(3, 5), 10) * 60) + parseInt(item.end.slice(6, 8), 10) + disclaimerEnd)}\n${item.narration}\n`).join('\n')}`);
const sources = (episode.source_ids || []).map((id) => sourceById.get(id)).filter(Boolean);
const packetSources = lorePacket?.source_references || [];
write('sources.md', `# Sources - E${String(episodeNumber).padStart(3, '0')} ${episode.working_title}\n\n- Era: ${era?.name || 'Unresolved'}\n- Arc: ${arc?.name || 'Unresolved'}\n- Research flags: ${(episode.research_flags || []).join(', ') || 'None recorded'}\n- Citation scope: ${episode.citation_scope || 'Not supplied'}\n\n## Episode lore packet sources\n\n${packetSources.map((source) => `### ${source.title}\n- ID: ${source.source_id}\n- Priority: ${source.priority}\n- Type: ${source.source_type}\n- Verification: ${source.verification}\n- Confidence: ${source.confidence}\n- Supports: ${(source.supports || []).join(', ')}\n- URL: ${source.url || 'No direct URL supplied'}`).join('\n\n')}\n\n## Inherited source records\n\n${sources.map((source) => `### ${source.title}\n- ID: ${source.source_id}\n- Type: ${source.source_type}\n- Verification: ${source.verification_status}\n- URL: ${source.url || 'No direct URL supplied'}\n- Evidence scope: ${source.evidence_scope}`).join('\n\n')}\n`);
const category = (label, color, content) => `<section class="category ${color}"><h3>${label}</h3>${content}</section>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><title>E${String(episodeNumber).padStart(3, '0')} Production Script</title><style>body{font-family:Arial,sans-serif;max-width:900px;margin:40px auto;padding:0 24px;background:#f7f4ee;color:#211d18}h1{font:400 30px Georgia,serif}.notice{background:#fff6df;border-left:4px solid #b07b25;padding:16px;line-height:1.55}.scene{background:#fffdf9;border:1px solid #e5ddd0;padding:22px;margin:20px 0}.category{padding:12px 14px;margin:10px 0;border-left:4px solid}.narration{border-color:#211d18}.card{border-color:#3f78a8;background:#edf5fb}.ai{border-color:#8157a6;background:#f3ecfa}.effect{border-color:#d7623a;background:#fff0e9}.audio{border-color:#4e775e;background:#edf6ee}.editor{border-color:#8b8175;background:#efebe5;color:#5f574e}h3{font-size:11px;letter-spacing:.12em;text-transform:uppercase;margin:0 0 8px}.meta{color:#82786c;font-size:12px}.category p{line-height:1.55;white-space:pre-wrap}</style></head><body><p class="meta">EPISODE ${String(episodeNumber).padStart(3, '0')} - ${clean(era?.name)} - ${clean(arc?.name)}</p><h1>${clean(episode.working_title)}</h1><section class="notice"><h2>Opening disclaimer</h2><p>${clean(openingDisclaimer)}</p></section>${scenes.map((item) => `<div class="scene"><p class="meta">SCENE ${String(item.scene_number).padStart(2, '0')} - ${item.start}-${item.end} - ${item.estimated_duration_seconds}s</p>${category('NARRATION','narration',`<p>${clean(item.narration)}</p>`)}${category('CARD VISUAL INSTRUCTIONS','card',`<p>Primary: ${item.selected_primary_card ? `${clean(item.selected_primary_card.card_name)} - ${item.selected_primary_card.connection_type}, ${Math.round(item.selected_primary_card.confidence * 100)}% confidence.` : 'No strong official card connection recorded; do not force one.'}</p><p>Alternatives: ${item.alternative_cards.length ? item.alternative_cards.map((card) => clean(card.card_name)).join('; ') : 'None recorded'}</p>`)}${category('AI BACKGROUND PROMPTS','ai',`<p>${item.ai_background_needed ? clean(item.ai_background_prompt) : 'Optional only. Existing card art is sufficient as the primary visual.'}</p>`)}${category('VIDEO EFFECTS','effect',`<p>${item.video_effect}</p>`)}${category('AUDIO / SFX','audio',`<p>${clean(item.audio_sfx)}</p>`)}${category('EDITOR NOTES / TRANSITIONS','editor',`<p>${clean(item.transition_note)}</p>`)}</div>`).join('')}</body></html>`;
write('script-production.html', html);
write('script-production.md', `# Production script - E${String(episodeNumber).padStart(3, '0')} ${episode.working_title}\n\n## Opening disclaimer (spoken before the episode)\n\n${openingDisclaimer}\n\n${scenes.map((item) => `## Scene ${String(item.scene_number).padStart(2, '0')} - ${item.start}-${item.end}\n\n### NARRATION\n\n${item.narration}\n\n### CARD VISUAL INSTRUCTIONS\n\nPrimary: ${item.selected_primary_card ? `${item.selected_primary_card.card_name} - ${item.selected_primary_card.connection_type}, ${Math.round(item.selected_primary_card.confidence * 100)}% confidence.` : 'No strong official card connection recorded; do not force one.'}\n\nAlternatives: ${item.alternative_cards.length ? item.alternative_cards.map((card) => card.card_name).join('; ') : 'None recorded'}\n\n### AI BACKGROUND PROMPTS\n\n${item.ai_background_needed ? item.ai_background_prompt : 'Optional only. Existing card art is sufficient as the primary visual.'}\n\n### VIDEO EFFECTS\n\n${item.video_effect}\n\n### AUDIO / SFX\n\n${item.audio_sfx}\n\n### EDITOR NOTES / TRANSITIONS\n\n${item.transition_note}\n`).join('\n')}`);
const placeholder = path.join(folder, 'artwork', '.gitkeep'); if (!fs.existsSync(placeholder)) fs.writeFileSync(placeholder, '');
console.log(`Exported E${String(episodeNumber).padStart(3, '0')} to ${folder}`);
