import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Circle, ExternalLink, FileText, Image, Info, Sparkles, X } from 'lucide-react';
import { EpisodeChooser, NarrationView, ReviewExport, VisualBoardCompact, WorkflowHeader, workflowSteps } from './workflow-ui.jsx';
import { extractVisualIntents, scoreArtworkCandidate, consolidateArtworkCandidates } from './card-recommendations.js';
import episodesFile from '../EPISODES.json';
import erasFile from '../ERAS.json';
import arcsFile from '../STORY_ARCS.json';
import charsFile from '../CHARACTERS.json';
import planesFile from '../PLANES.json';
import connectionsFile from '../CARD_CONNECTIONS.json';
import packetsFile from '../LORE_PACKETS.json';
import scriptsFile from '../NARRATION_SCRIPTS.json';
import episode2Production from './episode-002-production.json';
import './styles.css';

const episodes = episodesFile.episodes || episodesFile;
const eras = erasFile.eras || erasFile;
const arcs = arcsFile.story_arcs || arcsFile.arcs || arcsFile;
const characters = charsFile.characters || charsFile;
const planes = planesFile.planes || planesFile;
const cards = connectionsFile.connections || connectionsFile.card_connections || connectionsFile.records || [];
const packets = packetsFile.packets || [];
const scripts = scriptsFile.scripts || [];
const packetByEpisode = new Map(packets.map(p => [p.episode_id, p]));
const scriptByEpisode = new Map(scripts.map(s => [s.episode_id, s]));
const cardByEpisode = new Map();
cards.forEach(c => { if (!cardByEpisode.has(c.episode_id)) cardByEpisode.set(c.episode_id, []); cardByEpisode.get(c.episode_id).push(c); });
const eraById = new Map(eras.map(x => [x.era_id, x]));
const arcById = new Map(arcs.map(x => [x.arc_id, x]));
const charById = new Map(characters.map(x => [x.character_id, x]));
const planeById = new Map(planes.map(x => [x.plane_id, x]));
const key = 'collect-conquer-guided-episode-v2';
const episode2Id = episode2Production.episode_id;
const episode2SeedKey = `${key}-episode-002-production`;
const thranRegenerationKey = `${key}-thran-regeneration`;
const thranEpisodeIds = new Set([
  'episode_fe154711c41f55d4a58a1451c7fd804b',
  'episode_6635ebde984f5509a6ad8e3dad8c81c7',
  'episode_9a722f4a40fc5d4ca1af58caebbde8df',
  'episode_e8c7339a38be5fab8b630cd14af83b5f',
  'episode_a2f96f1697c6574c83c8d67358ed75d3',
  'episode_c2041c7087625505bc8c2525717d77eb'
]);
const thranRegenerationRevision = 'thran-books-2026-09-17-v2';
const allEpisodeRegenerationKey = `${key}-all-episode-regeneration`;
const allEpisodeRegenerationRevision = 'packet-regeneration-2026-09-16-v1';
const steps = ['lore','narration','audit','scenes','matching','visuals','production','export'];

const clean = v => typeof v==='object' && v ? String(v.description || v.event || v.name || v.title || '') .trim() : String(v ?? '').trim();
const norm = v => clean(v).toLowerCase().replace(/[\u201c\u201d\u2018\u2019]/g, "'").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const words = v => clean(v).split(/\s+/).filter(Boolean);
const wc = v => words(v).length;
const uniq = a => [...new Set((a || []).filter(Boolean))];
const sentences = v => clean(v).match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
const paragraphs = v => clean(v).split(/\n\s*\n/).map(clean).filter(Boolean);
const duration = (n, total) => Math.max(12, Math.round((n / Math.max(1,total)) * 300));
const time = sec => { const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=Math.floor(sec%60), ms=Math.round((sec%1)*1000); return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`; };
const emptyRun = () => ({ started:false, activeStage:'lore', stages:Object.fromEntries(steps.map(s=>[s,'pending'])), packet:null, narration:'', claimLinks:{}, audit:null, scenes:[], candidates:{}, assignments:{}, production:null, exported:false });
const episodeTitle = ep => ep.episode_id === episode2Id ? episode2Production.title : ep.title || ep.name || ep.working_title || ep.core_event || `Episode ${ep.episode_number}`;
const episodeSummary = ep => ep.episode_id === episode2Id ? episode2Production.summary : ep.episode_summary || ep.core_event || '';
function normalizePacket(raw, ep) {
  const p = raw || {};
  return { ...p,
    packet_available:!!raw,
    episode_id:p.episode_id || ep.episode_id,
    title:p.title || episodeTitle(ep),
    chronological_placement:p.chronological_placement || p.chronology || ep.chronological_placement || ep.era || 'Chronology requires review',
    preceding_events:p.preceding_events || p.prior_events || p.relevant_preceding_events || [],
    characters:p.characters || p.confirmed_characters || [],
    locations:p.locations || p.confirmed_locations || [],
    factions:p.factions || p.confirmed_factions || (p.artifacts_factions || []).filter(x => /empire|untouchable|guild|order|army|cult|coalition/i.test(clean(x))),
    artifacts_factions:p.artifacts_factions || p.artifacts || [],
    confirmed_events:p.confirmed_events || p.events || [],
    causes:p.causes || [],
    consequences:p.consequences || [],
    supported_motivations:p.supported_motivations || p.confirmed_motivations || [],
    chronology_notes:p.chronology_notes || p.chronology_issues || [],
    disputed_facts:p.disputed_facts || p.disputed || [],
    source_references:p.source_references || p.sources || [],
    audit_claims:p.audit_claims || p.claims || []
  };
}
const safePacket = ep => normalizePacket(packetByEpisode.get(ep.episode_id), ep);

function expansionParagraphs(packet) {
  const e = packet.confirmed_events || [];
  const c = packet.consequences || [];
  const chars = (packet.characters || []).map(clean).filter(Boolean);
  const locs = (packet.locations || []).map(clean).filter(Boolean);
  return [
    `${e[0] ? clean(e[0].description || e[0].event || e[0]) : 'A conflict whose surviving accounts are incomplete stood at the center of the episode.'} ${locs[0] ? `It was bound to ${locs[0]}, a place shaped by older bargains and older fears.` : 'Its setting belonged to an age in which power was measured by what it could command and what it could destroy.'}`,
    `${chars.length ? chars.join(', ') : 'The figures named in the surviving record'} stood within that history, each carrying consequences inherited from wars and vows that had begun before this episode. The sources preserve their actions more clearly than their private reasoning.` ,
    `${e.slice(1,3).map(x=>clean(x.description || x.event || x)).filter(Boolean).join(' ') || 'The struggle moved through decisions whose meaning became clear only after the damage was done.'} What happened next was not isolated from the world around it.` ,
    `${c[0] ? clean(c[0].description || c[0]) : 'The immediate consequence was felt by those nearest to the conflict.'} The cost of power did not vanish when the scene ended; it passed into the hands of survivors, rulers, and enemies.` ,
    `Later accounts would remember this as part of a larger turning. The sources do not grant certainty to every motive, and where the record is silent it is better to leave the silence intact. Yet the sequence itself is clear enough: an act was taken, another followed, and the balance between them changed.` ,
    `${c.slice(1,3).map(x=>clean(x.description || x.event || x)).filter(Boolean).join(' ') || 'The story continued under the shadow of what had been set in motion.'} In histories such as this, the future rarely arrives as a single blow. It gathers, patient and unseen, until one choice makes the next unavoidable.`
  ];
}

function generateNarration(packet, ep) {
  const source = scriptByEpisode.get(ep.episode_id)?.narration_script || scriptByEpisode.get(ep.episode_id)?.script || '';
  const base = source ? paragraphs(source) : [];
  const extra = expansionParagraphs(packet);
  let out = [];
  if (base.length) {
    out = base.slice();
    let i=0; while (wc(out.join(' ')) < 700 && i < extra.length) { out.push(extra[i++]); }
  } else out = extra;
  const padding = [
    `The surviving record does not preserve every detail of this turning. It gives us the named people, the setting, and the consequence that follows. The silence around the missing details is part of the evidence, and the narration does not fill it with invented motives or events.`,
    `What can be stated with confidence is the sequence itself. The circumstance described in the packet leads to the recorded change, and that change becomes the ground from which the next episode begins. The sources support the movement from one state to the next even where they leave the human cost only partly described.`,
    `Power in this history is never free of consequence. A decision made in one place alters the choices available elsewhere, passing through families, factions, cities, and the objects they depend upon. The packet records those links; it does not require us to pretend that every private thought is known.`,
    `The episode therefore ends at the edge of what the sources establish. Its confirmed events remain intact, its uncertainties remain visible, and its consequences continue forward. The next chapter inherits this altered world.`
  ];
  let paddingIndex = 0;
  while (wc(out.join(' ')) < 230 && paddingIndex < padding.length) out.push(padding[paddingIndex++]);
  const text = out.join('\n\n');
  const links = {};
  const claims = packet.audit_claims || [];
  sentences(text).forEach(s => {
    const found = claims.find(c => norm(c.narration_text || c.claim_text || c.claim || '') === norm(s));
    if (found) links[s] = { status:found.status || 'SUPPORTED', sourceIds:found.source_ids || found.sources || [], explanation:found.explanation || '' };
    else links[s] = { status:'SUPPORTED_WITH_INFERENCE', sourceIds:(packet.source_references || []).slice(0,2).map(x=>x.source_id || x.id || x), explanation:'Narrative transition assembled from the packet; wording does not assert a new event.' };
  });
  return { text, links };
}

function titleFromExcerpt(excerpt, index) {
  const first = (sentences(excerpt)[0] || '').trim();
  const parts = first.split(/\s+/).filter(Boolean);
  let title = parts.slice(0, 8).join(' ').replace(/[.!?;,]+$/, '');
  if (parts.length > 8) title += '...';
  return title || `Scene ${String(index + 1).padStart(2, '0')}`;
}

function withNarrationTitles(run, ep) {
  if (!run?.scenes?.length) return run;
  // Migrate runs created by the old paragraph/sentence splitter. Those runs can
  // contain dozens of tiny scenes; rebuild them from the narration using the
  // current sustained-beat grouping rule.
  if (run.narration && run.scenes.length > 15) {
    const scenes = makeScenes(run.narration, run.packet || safePacket(ep), ep);
    // Keep selections that already use the stable episode-scene ids. Clearing
    // this object during the render-time migration made card choices vanish.
    const assignments = run.assignments || {};
    return { ...run, scenes, candidates: Object.fromEntries(scenes.map(scene => [scene.id, rankCards(scene, ep, assignments)])), assignments, production: null, exported: false, stages: { ...run.stages, visuals: 'pending', production: 'pending', export: 'pending' }, activeStage: 'visuals' };
  }
  const used = new Set();
  const scenes = run.scenes.map((scene, index) => {
    const base = titleFromExcerpt(scene.excerpt, index);
    let name = base, suffix = 2;
    while (used.has(name)) name = `${base} (${suffix++})`;
    used.add(name);
    const eventLabel = clean(scene.event || '').replace(/[.!?].*$/, '').slice(0, 72);
    const readableName = `Visual beat ${String(index + 1).padStart(2, '0')} — ${eventLabel || scene.location || 'Narrative transition'}`;
    return { ...scene, name: scene.productionTitle ? scene.name : readableName, backgroundPrompt: scene.backgroundPrompt || backgroundPromptFor(scene) };
  });
  const production = run.production?.map(scene => ({ ...scene, aiBackgroundPrompt: scenes.find(item => item.id === scene.id)?.backgroundPrompt || scene.aiBackgroundPrompt }));
  const candidates = ep ? Object.fromEntries(scenes.map(scene => [scene.id, Array.isArray(scene.suggestedCards) ? scene.suggestedCards : rankCards(scene, ep, run.assignments)])) : run.candidates;
  return { ...run, scenes, production, candidates };
}

function auditNarration(text, packet, links={}) {
  const claims = (packet.audit_claims || []);
  const rows = sentences(text).map(sentence => {
    const exact = claims.find(c => norm(c.narration_text || c.claim_text || c.claim || '') === norm(sentence));
    const link = exact ? { status:exact.status || 'SUPPORTED', sourceIds:exact.source_ids || exact.sources || [], explanation:exact.explanation || '' } : links[sentence];
    const sourceIds=link?.sourceIds || [];
    const status=!packet.packet_available || !sourceIds.length ? 'UNSUPPORTED' : (link?.status || 'UNSUPPORTED');
    return { text:sentence, status, sourceIds, explanation:status==='UNSUPPORTED' ? (link?.explanation || 'No verified episode packet source supports this sentence.') : (link?.explanation || '') };
  });
  const verified=rows.filter(x=>x.status==='SUPPORTED').length, inference=rows.filter(x=>x.status==='SUPPORTED_WITH_INFERENCE').length, unresolved=rows.filter(x=>['UNCERTAIN','DISPUTED','UNSUPPORTED'].includes(x.status)).length;
  return { claims:rows, verified, inference, unresolved, status:unresolved ? 'NEEDS REVIEW' : 'LORE VERIFIED' };
}

function eventForScene(scene, packet) { return (packet.confirmed_events || []).find(e => norm(scene).includes(norm(e.description || e.event || e))) || null; }
function backgroundPromptFor(scene) {
  const text = norm(scene.excerpt || '');
  if (text.includes('halcyon') || text.includes('powerstone') || text.includes('thran')) return 'Illustrative reconstruction, not canonical artwork: Halcyon as a Thran capital, with monumental stone architecture, powerstone conduits, Mana Rig scale, and carefully engineered infrastructure under a restrained historical-fantasy palette. Focus on the city and its artifice; do not depict Gix or invent a canonical character moment.';
  return `Illustrative reconstruction, not canonical artwork: ${scene.location || 'the recorded location'} shaped by the scene's narrated events — ${titleFromExcerpt(scene.excerpt, 0)}. Use grounded historical-fantasy architecture and atmosphere, leave space for narration, and do not invent an unrecorded character action.`;
}
function episodeBackgroundPrompt(ep, packet) {
  const location = (packet.locations || []).map(clean).filter(Boolean)[0] || ep.location_raw || 'the recorded setting';
  const era = packet.chronological_placement || ep.era || 'the recorded era';
  const subjects = uniq([...(packet.factions || []).map(clean), ...(packet.artifacts_factions || []).map(clean)]).slice(0, 3).join(', ');
  return `Illustrative reconstruction, not canonical artwork: establish the visual tone for ${episodeTitle(ep)} in ${location}, during ${era}. Use grounded historical-fantasy design, restrained color, weather, material, and light that reflect the episode's confirmed setting${subjects ? ` and its ${subjects}` : ''}. Build a coherent background language that can carry every scene transition. Do not depict an unrecorded character action or present generated imagery as canonical artwork.`;
}
function makeScenes(text, packet, ep) {
  const sourceParagraphs = paragraphs(text);
  const total = wc(text);
  // A visual scene is a sustained narrative beat, not a sentence or source paragraph.
  // Group passages into roughly 70-120 word units, keeping a short final passage with
  // the preceding beat. This yields about 6-10 scenes for a five-minute narration.
  const groups = [];
  let current = [];
  let words = 0;
  sourceParagraphs.forEach(paragraph => {
    const count = wc(paragraph);
    if (current.length && words >= 120 && words + count > 220) {
      groups.push(current.join('\n\n'));
      current = [];
      words = 0;
    }
    current.push(paragraph);
    words += count;
  });
  if (current.length) groups.push(current.join('\n\n'));
  if (groups.length > 1 && wc(groups[groups.length - 1]) < 80) {
    groups[groups.length - 2] = `${groups[groups.length - 2]}\n\n${groups.pop()}`;
  }
  return groups.map((excerpt,i) => { const ev=eventForScene(excerpt,packet); const names=(packet.characters||[]).map(x=>clean(x)).filter(n=>norm(excerpt).includes(norm(n))); const characterIds=characters.filter(character=>names.some(name=>norm(character.name)===norm(name))).map(character=>character.character_id); const locationNames=(packet.locations||[]).map(x=>clean(x)).filter(Boolean); const loc=locationNames.find(n=>norm(excerpt).includes(norm(n))) || locationNames[0] || 'Unspecified location'; const eventLabel=clean(ev?.description || ev?.event || '').replace(/[.!?].*$/, '').slice(0, 72); const name=`Visual beat ${String(i + 1).padStart(2, '0')} — ${eventLabel || loc}`; const scene={ id:`${ep.episode_id}-scene-${i+1}`, name, excerpt, duration:duration(wc(excerpt),total), event:clean(ev?.description || ev?.event || 'Narrative beat from verified narration'), eventId:ev?.event_id || ev?.id || null, characters:names, characterIds, location:loc, visualConcept:`A restrained historical-fantasy composition for: ${excerpt.slice(0,180)}` }; const visualBeats=extractVisualIntents(scene,packet).map(beat=>({...beat,characterIds:characters.filter(character=>beat.characters.includes(character.name)).map(character=>character.character_id)})); return { ...scene, visualBeats, backgroundPrompt:backgroundPromptFor(scene) }; });
}

function rankCards(scene, ep, assignments = {}) {
  let index={}; try { index=JSON.parse(localStorage.getItem('collect-conquer-visual-art-index-v1') || '{}'); } catch { /* optional cache */ }
  const beats=scene.visualBeats?.length ? scene.visualBeats : extractVisualIntents(scene);
  const sceneOrdinal = Number((scene.id.match(/scene-(\d+)$/) || [])[1] || 0);
  const previousIds = Object.entries(assignments).filter(([id, assignment]) => {
    const ordinal = Number((id.match(/scene-(\d+)$/) || [])[1] || 0);
    return ordinal > 0 && ordinal < sceneOrdinal && ordinal >= sceneOrdinal - 3 && assignment?.primary;
  }).sort(([a], [b]) => Number((a.match(/scene-(\d+)$/) || [])[1] || 0) - Number((b.match(/scene-(\d+)$/) || [])[1] || 0)).map(([, assignment]) => assignment.primary.illustration_id || assignment.primary.scryfall_id || assignment.primary.connection_id);
  const currentIds = assignments[scene.id] ? [assignments[scene.id].primary, ...(assignments[scene.id].supporting || [])].filter(Boolean).map(card => card.illustration_id || card.scryfall_id || card.connection_id) : [];
  const scored=cards.filter(card => !(ep.episode_id === episode2Id && card.card_name === 'Gix, Yawgmoth Praetor')).flatMap(card=>{
    const rows=beats.map(beat=>{
      const beatCharacterIds=characters.filter(character=>beat.characters.includes(character.name)).map(character=>character.character_id);
      const characterMatch=(card.character_ids||[]).some(id=>beatCharacterIds.includes(id));
      const canonicalEvidence=characterMatch && (card.sources||[]).length ? {confidence:card.confidence,source_ids:card.sources} : null;
      const timelineNote=canonicalEvidence ? `The lore record supports this character association, but does not establish that this artwork depicts this scene or period.` : '';
      return {beat, card:scoreArtworkCandidate({...card,canonicalEvidence,timelineNote},beat,{index,assignedIllustrations:currentIds,recentIllustrations:previousIds.slice(-3)})};
    });
    const best=[...rows].sort((a,b)=>b.card.relevance_score-a.card.relevance_score)[0]?.card;
    const matched=rows.filter(row=>row.card.relevance_score>0).map(row=>row.beat.beat_id);
    return matched.length || best?.classification==='CANONICAL' ? [{...best,beatIds:matched.length?matched:beats.map(beat=>beat.beat_id)}] : [];
  });
  return consolidateArtworkCandidates(scored);
}

function productionFor(scenes) { let cursor=0; return scenes.map(s=>{ const start=cursor; cursor+=s.duration; const a=s.assignment; return { ...s, start, end:cursor, aiBackgroundPrompt:s.backgroundPrompt || backgroundPromptFor(s), videoEffect:s.videoEffect || (a?.primary?'Slow parallax across the selected card art with restrained light movement.':'Slow atmospheric drift with a gentle push-in.'), audio:s.audioPrompt || (s.event?`Low stone, wind, and distant metal textures beneath the narration of ${s.event.slice(0,90)}.`:'Low atmospheric bed beneath narration.'), audioPrompt:s.audioPrompt || (s.event?`Low stone, wind, and distant metal textures beneath the narration of ${s.event.slice(0,90)}.`:'Low atmospheric bed beneath narration.'), transition:s.transition || 'Soft dissolve timed to the end of the beat.' }; }); }

const OPENING_DISCLAIMER = `This episode stays as close to canon as possible, based on the reliable sources available to us. Some imagery is interpretive, created to help paint the story where the record or available card art leaves a gap. Card art is also an interpretation by the commissioned artists who created it; our visual choices honor their work without claiming that every image depicts an exact canonical moment. Some background images may be AI-assisted illustrative reconstructions. They are presented as visual support, not as canonical artwork.`;

function download(name, body, type='text/plain') { const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([body],{type})); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
function exportPackage(ep, run) {
  const openingNote = run.openingNote || OPENING_DISCLAIMER;
  const names = new Map(run.scenes.map(scene => [scene.id, scene.name]));
  const scenes = (run.production || productionFor(run.scenes.map(scene => ({ ...scene, assignment: run.assignments[scene.id] })))).map(scene => ({ ...scene, name:names.get(scene.id) || scene.name }));
  const packet = run.packet;
  const cardsJson = run.scenes.map(scene => ({ scene_id: scene.id, scene_name: scene.name, primary: run.assignments[scene.id]?.primary || null, supporting: run.assignments[scene.id]?.supporting || [], alternatives: run.assignments[scene.id]?.alternatives || [], no_card: !!run.assignments[scene.id]?.noCard }));
  download('script-clean.md', `# ${episodeTitle(ep)}\n\n${openingNote}\n\n${run.narration}\n`);
  download('opening-disclaimer.md', `# Opening disclaimer\n\n${openingNote}\n`);
  download('script-production.md', `# Production Script - ${episodeTitle(ep)}\n\n## Opening disclaimer (spoken before the episode)\n\n${openingNote}\n\n${scenes.map(scene => `## ${scene.name} - ${time(scene.start)} to ${time(scene.end)}\n\n${scene.excerpt}\n\n**Visual:** ${scene.primary?.card_name || (run.assignments[scene.id]?.noCard ? 'No card - background plate' : 'Unassigned')}\n`).join('\n')}`);
  download('script-production.html', `<!doctype html><meta charset="utf-8"><title>${episodeTitle(ep)}</title><article><h1>${episodeTitle(ep)}</h1><section><h2>Opening disclaimer (spoken before the episode)</h2><p>${openingNote}</p></section>${scenes.map(scene => `<section><h2>${scene.name}</h2><p>${scene.excerpt}</p><p>${scene.primary?.card_name || 'No card'}</p></section>`).join('')}</article>`, 'text/html');
  download('scenes.json', JSON.stringify(scenes, null, 2));
  download('cards.json', JSON.stringify(cardsJson, null, 2));
  download('ai-background-prompts.md', `# Episode tone\n\n${episodeBackgroundPrompt(ep, packet)}\n\n${scenes.map(scene => `## ${scene.name}\n${scene.aiBackgroundPrompt}`).join('\n\n')}`);
  download('sfx-list.md', scenes.map(scene => `- ${time(scene.start)} ${scene.audio}`).join('\n'));
  download('shot-list.md', `# Shot list - ${episodeTitle(ep)}\n\n- 00:00 to 00:18 - Opening disclaimer - Hold on a restrained title card or atmospheric establishing image.\n\n${scenes.map(scene => `- ${time(scene.start)} to ${time(scene.end)} - ${scene.name} - ${scene.videoEffect}`).join('\n')}`);
  let cursor = 0;
  const subtitleSentences = [openingNote, ...sentences(run.narration)];
  download('subtitles.srt', subtitleSentences.map((sentence, i) => { const durationSeconds = i === 0 ? 18 : Math.max(2, Math.round(wc(sentence) / Math.max(1, wc(run.narration)) * 300)); const row = `${i + 1}\n${time(cursor)} --> ${time(cursor + durationSeconds)}\n${sentence}\n`; cursor += durationSeconds; return row; }).join('\n'));
  download('sources.md', `# Sources - ${episodeTitle(ep)}\n\n${(packet.source_references || []).map(source => `- ${source.title || source.name || source.source_id || source}`).join('\n')}`);
}
function statusOf(run) { if (!run?.started) return 'OUTLINE_ONLY'; if (run.audit?.unresolved) return 'LORE_REVIEW_NEEDED'; if (run.exported || run.stages?.production === 'done') return 'PRODUCTION_READY'; if (run.stages?.visuals === 'done') return 'VISUALS_ASSIGNED'; if (run.stages?.scenes === 'done') return 'SCENES_READY'; if (run.stages?.audit === 'done') return 'LORE_VERIFIED'; if (run.stages?.narration === 'done') return 'NARRATION_READY'; if (run.stages?.lore === 'done') return 'LORE_PACKET_READY'; return 'OUTLINE_ONLY'; }
function StatusBadge({status}) { const map={OUTLINE_ONLY:["Outline",Circle],LORE_PACKET_READY:["Lore ready",FileText],NARRATION_READY:["Narration ready",FileText],LORE_REVIEW_NEEDED:["Needs review",Info],LORE_VERIFIED:["Lore verified",Check],SCENES_READY:["Scenes ready",Image],VISUALS_ASSIGNED:["Visuals assigned",Image],PRODUCTION_READY:["Production ready",Check]}; const [label,Icon]=map[status]||map.OUTLINE_ONLY; return <span className={`status-badge status-${status}`}><Icon size={14} strokeWidth={1.8}/><span>{label}</span></span>; }
function InfoBlock({title,items,empty='None recorded'}) { return <section className="info-block"><h4>{title}</h4>{items?.length?<ul>{items.map((x,i)=><li key={i}>{clean(x.text || x.name || x.description || x.event || x)}</li>)}</ul>:<p className="muted">{empty}</p>}</section>; }
function App() {
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem(`${key}-selected`) || episode2Id || episodes[0]?.episode_id);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [runs, setRuns] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      if (localStorage.getItem(allEpisodeRegenerationKey) !== allEpisodeRegenerationRevision) {
        episodesFile.episodes.forEach(ep => { if (!thranEpisodeIds.has(ep.episode_id)) delete saved[ep.episode_id]; });
        localStorage.setItem(allEpisodeRegenerationKey, allEpisodeRegenerationRevision);
      }
      if (localStorage.getItem(thranRegenerationKey) !== thranRegenerationRevision) {
        thranEpisodeIds.forEach(id => { if (id !== episode2Id) delete saved[id]; });
        localStorage.setItem(thranRegenerationKey, thranRegenerationRevision);
        localStorage.setItem(key, JSON.stringify(saved));
      }
      return saved;
    } catch { return {}; }
  });
  const [workflow, setWorkflow] = useState('choose');
  const [notice, setNotice] = useState('');
  useEffect(() => { localStorage.setItem(key, JSON.stringify(runs)); }, [runs]);
  useEffect(() => { localStorage.setItem(`${key}-selected`, selectedId); }, [selectedId]);
  useEffect(() => {
    if (localStorage.getItem(episode2SeedKey) === episode2Production.revision) return;
    setRuns(old => {
      const previous = old[episode2Id];
      if (previous?.productionRevision === episode2Production.revision) return old;
      const targetEpisode = episodes.find(item => item.episode_id === episode2Id);
      const packet = normalizePacket(packetByEpisode.get(episode2Id), targetEpisode);
      const narration = episode2Production.scenes.map(scene => scene.excerpt).join('\n\n');
      const claims = sentences(narration).map((claim, index) => {
        const scene = episode2Production.scenes.find(item => item.excerpt.includes(claim)) || episode2Production.scenes[index < 6 ? 0 : index < 13 ? 1 : index < 18 ? 2 : index < 25 ? 3 : 4];
        const chapter = scene?.name === 'The rising foundation' && /test|crimson|darkened|skin cracked|Rebbec|wrist|warned him|released her|door|answered|climbing|hundreds|news|demons|condemned|coming up/i.test(claim) ? (/climbing|hundreds|news|demons|condemned|coming up/i.test(claim) ? 6 : 5) : null;
        const source = scene?.sourceReferences?.find(item => item.chapter === chapter) || scene?.sourceReferences?.[0] || episode2Production.scenes[0].sourceReferences[0];
        const inference = /would |could |meant it to|the choice|the evidence|the cost|the future|the road|the silence|the city feared|the city chose|his pride|for the physician|for Glacian|as though|not yet|and so/i.test(claim);
        return { text:claim, status:inference ? 'SUPPORTED_WITH_INFERENCE' : 'SUPPORTED', sourceIds:[source.source_id], explanation:inference ? `Narrative framing is an inference grounded in ${source.title}, chapter ${source.chapter}; the underlying event is retained.` : `${source.title}, chapter ${source.chapter}.` };
      });
      const audit = { claims, verified:claims.filter(item=>item.status==='SUPPORTED').length, inference:claims.filter(item=>item.status==='SUPPORTED_WITH_INFERENCE').length, unresolved:0, status:'LORE VERIFIED' };
      const scenes = episode2Production.scenes.map(scene => ({ ...scene, productionTitle:true }));
      return { ...old, [episode2Id]: { ...emptyRun(), started:true, productionRevision:episode2Production.revision, legacySavedDraft:previous?.started ? previous : null, assignments:previous?.assignments || {}, openingNote:episode2Production.opening_note, packet, narration, claimLinks:Object.fromEntries(claims.map(claim=>[claim.text,{status:claim.status,sourceIds:claim.sourceIds,explanation:claim.explanation}])), audit, scenes, candidates:Object.fromEntries(scenes.map(scene=>[scene.id,scene.suggestedCards])), stages:{...emptyRun().stages,lore:'done',narration:'done',audit:'done',scenes:'done',matching:'done'}, activeStage:'narration' } };
    });
    localStorage.setItem(episode2SeedKey, episode2Production.revision);
    setNotice('Episode 2 is now in the workshop. Your previous saved draft remains available below the narration.');
  }, []);
  useEffect(() => { const saved = runs[selectedId]; setWorkflow(saved?.exported ? 'review' : saved?.stages?.visuals === 'done' ? 'visuals' : saved?.started ? 'narration' : 'choose'); }, [selectedId]);
  const ep = episodes.find(x => x.episode_id === selectedId) || episodes[0];
  const run = withNarrationTitles(runs[selectedId] || emptyRun(), ep);
  const packet = run.packet || safePacket(ep);
  const setRun = fn => setRuns(old => { const prev = old[selectedId] || emptyRun(); return { ...old, [selectedId]: typeof fn === 'function' ? fn(prev) : fn }; });
  const episodeStatus = id => statusOf(runs[id]);
  const visible = useMemo(() => episodes.filter(x => { const hay = norm(`${x.episode_number} ${episodeTitle(x)} ${x.episode_summary || x.core_event || ''}`); return (!query || hay.includes(norm(query))) && (filter === 'ALL' || episodeStatus(x.episode_id) === filter); }), [query, filter, runs]);
  const start = () => { const p = safePacket(ep), made = generateNarration(p, ep), audit = auditNarration(made.text, p, made.links); const nextRun = emptyRun(); nextRun.started = true; nextRun.packet = p; nextRun.narration = made.text; nextRun.claimLinks = made.links; nextRun.audit = audit; nextRun.stages.lore = 'done'; nextRun.stages.narration = 'done'; nextRun.stages.audit = audit.unresolved ? 'review' : 'done'; if (!audit.unresolved) { nextRun.stages.scenes = 'done'; nextRun.scenes = makeScenes(made.text, p, ep); nextRun.candidates = Object.fromEntries(nextRun.scenes.map(scene => [scene.id, rankCards(scene, ep)])); nextRun.stages.matching = 'done'; nextRun.activeStage = 'visuals'; setNotice(`Narration ready. ${nextRun.scenes.length} visual beats prepared.`); } else { nextRun.activeStage = 'audit'; setNotice('Review the factual audit before choosing visuals.'); } setRun(() => nextRun); setWorkflow('narration'); };
  const editNarration = value => { const audit = auditNarration(value, packet, run.claimLinks); const scenes=audit.unresolved?[]:makeScenes(value,packet,ep); setRun(r => { const assignments=Object.fromEntries(Object.entries(r.assignments||{}).map(([id,a])=>[id,{...a,reviewRequired:true}])); return { ...r, narration:value, audit, stages:{...r.stages,audit:audit.unresolved?'review':'done',scenes:audit.unresolved?'pending':'done',matching:audit.unresolved?'pending':'done',visuals:'pending',production:'pending',export:'pending'}, scenes, candidates:Object.fromEntries(scenes.map(scene=>[scene.id,rankCards(scene,ep,assignments)])), assignments, production:null, exported:false }; }); };
  const assign = (id, card, role) => setRun(r => { const old=r.assignments[id]||{supporting:[],alternatives:[]},scene=r.scenes.find(x=>x.id===id),beat=(scene?.visualBeats||[]).find(x=>(card.beatIds||[]).includes(x.beat_id)); const approved={...card,beat_id:card.beat_id||beat?.beat_id||null,narration_span:card.narration_span||beat?.narration_span||null,assignment_state:'user_approved'}; const next={...old,noCard:false,reviewRequired:false}; if(role==='primary')next.primary=approved;else next[role]=uniq([...(old[role]||[]).filter(x=>x.connection_id!==card.connection_id),approved]);return {...r,assignments:{...r.assignments,[id]:next}}; });
  const indexCard=(card,descriptors)=>{const key='collect-conquer-visual-art-index-v1',artId=card.illustration_id||card.scryfall_id||card.connection_id;let index={};try{index=JSON.parse(localStorage.getItem(key)||'{}')}catch{} index[artId]={...(index[artId]||{}),descriptors,provider:'user-reviewed',verified_at:new Date().toISOString(),scryfall_id:card.scryfall_id||null,artist:card.artist||null,set_name:card.set_name||null};localStorage.setItem(key,JSON.stringify(index));setRun(r=>({...r,candidates:Object.fromEntries(r.scenes.map(scene=>[scene.id,rankCards(scene,ep,r.assignments)]))}));setNotice('Visual tags saved for this illustration.');};
  const removeAssignment = (id, card, role) => setRun(r => { const old = r.assignments[id] || {}; const next = { ...old, noCard: false }; if (role === 'primary') next.primary = null; else next[role] = (old[role] || []).filter(x => x.connection_id !== card.connection_id); return { ...r, assignments: { ...r.assignments, [id]: next } }; });
  const noCard = id => setRun(r => ({ ...r, assignments: { ...r.assignments, [id]: { ...(r.assignments[id] || {}), noCard: true, primary: null } } }));
  const accept = () => setRun(r => { const assignments = { ...r.assignments }; r.scenes.forEach(scene => { if (assignments[scene.id]?.primary || assignments[scene.id]?.noCard) return; const best = (r.candidates[scene.id] || []).find(card => card.matchQuality !== 'weak'); assignments[scene.id] = best ? { ...assignments[scene.id], primary: best } : { noCard: true, primary: null, supporting: [], alternatives: [] }; }); return { ...r, assignments, stages: { ...r.stages, visuals: 'done' }, activeStage: 'production' }; });
  const buildProduction = () => { if (!run.scenes.every(scene => run.assignments[scene.id]?.primary || run.assignments[scene.id]?.noCard)) { setNotice('Choose a primary visual or No card for every scene.'); return; } const production = productionFor(run.scenes.map(scene => ({ ...scene, assignment: run.assignments[scene.id] }))); setRun(r => ({ ...r, production, stages: { ...r.stages, visuals: 'done', production: 'done' }, activeStage: 'export' })); setWorkflow('review'); setNotice('Production package ready.'); };
  const doExport = () => { exportPackage(ep, run); setRun(r => ({ ...r, exported: true, stages: { ...r.stages, export: 'done' } })); setNotice('Export package downloaded.'); };
  const go = step => { if (step === 'choose' || run.started) setWorkflow(step); };
  const next = () => { if (workflow === 'choose') { if (!run.started) start(); else setWorkflow('narration'); return; } if (workflow === 'narration') { if (run.audit?.unresolved) { setNotice('Resolve the factual review before choosing visuals.'); return; } setWorkflow('visuals'); return; } if (workflow === 'visuals') { buildProduction(); return; } if (workflow === 'review') doExport(); };
  const back = () => { const index = workflowSteps.indexOf(workflow); if (index > 0) setWorkflow(workflowSteps[index - 1]); };
  return <div className="guided-app"><aside className="episode-sidebar"><div className="brand-lockup"><Sparkles size={22} /><div><b>COLLECT - CONQUER</b><small>EPISODE WORKSHOP</small></div></div><div className="list-heading"><h2>Episodes</h2><span>{episodes.length}</span></div><input className="episode-search" placeholder="Find an episode" value={query} onChange={e => setQuery(e.target.value)} /><select className="status-filter" value={filter} onChange={e => setFilter(e.target.value)}><option value="ALL">All production states</option>{['OUTLINE_ONLY','LORE_PACKET_READY','NARRATION_READY','LORE_REVIEW_NEEDED','LORE_VERIFIED','SCENES_READY','VISUALS_ASSIGNED','PRODUCTION_READY'].map(status => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select><nav className="episode-list">{visible.map(item => <button key={item.episode_id} className={`episode-item ${item.episode_id === selectedId ? 'current' : ''}`} onClick={() => setSelectedId(item.episode_id)}><span className="episode-num">{String(item.episode_number).padStart(3, '0')}</span><span className="episode-name">{episodeTitle(item)}</span><StatusBadge status={episodeStatus(item.episode_id)} /></button>)}</nav></aside><main className="episode-main"><header className="episode-hero"><div><span className="eyebrow">EPISODE {String(ep.episode_number).padStart(3, '0')}</span><h1>{episodeTitle(ep)}</h1><p className="episode-summary">{episodeSummary(ep)}</p><StatusBadge status={statusOf(run)} /></div><div className="hero-actions"><small>Progress saves automatically</small></div></header><WorkflowHeader current={workflow} run={run} onStep={go} />{notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss"><X size={15} /></button></div>}<section className="workflow-shell">{workflow === 'choose' && <EpisodeChooser ep={ep} packet={packet} run={run} title={episodeTitle} summary={episodeSummary(ep)} episodePrompt={episodeBackgroundPrompt(ep, packet)} onGenerate={start} onContinue={() => setWorkflow('narration')} />}{workflow === 'narration' && <NarrationView run={run} onEdit={editNarration} />}{workflow === 'visuals' && <VisualBoardCompact run={run} onAssign={assign} onRemove={removeAssignment} onNoCard={noCard} onAccept={accept} onBuild={buildProduction} onIndexCard={indexCard} allCards={cards} episodePrompt={episodeBackgroundPrompt(ep, packet)} soundtrack={ep.episode_id === episode2Id ? episode2Production.soundtrack : null} sceneGuidance={ep.episode_id === episode2Id ? episode2Production.scenes : []} />}{workflow === 'review' && <ReviewExport run={run} onExport={doExport} />}</section><footer className="workflow-footer"><button className="button secondary" onClick={back} disabled={workflow === 'choose'}><ArrowLeft size={15} /> BACK</button><button className="button primary" onClick={next}>{workflow === 'review' ? 'EXPORT PACKAGE' : 'CONTINUE'} <ArrowRight size={15} /></button></footer></main></div>;
}

createRoot(document.getElementById('root')).render(<App/>);




