import React, { useState } from 'react';
import { scoreArtworkCandidate } from './card-recommendations.js';
import { searchIntentCards } from './scryfall.js';
import { ArrowLeft, ArrowRight, Check, ChevronDown, FileText, Image, Info, Sparkles, X } from 'lucide-react';

export const workflowSteps = ['choose', 'narration', 'visuals', 'review'];
export const workflowLabels = { choose: 'Choose Episode', narration: 'Narration', visuals: 'Choose Visuals', review: 'Review & Export' };
const readable = value => String(value || '').replaceAll('\u00c2\u00b7', ' - ').replaceAll('\u00e2\u0080\u00a6', '...').replaceAll('\u00c3\u0097', '');

export function WorkflowHeader({ current, run, onStep }) {
  return <div className="workflow-header"><div><span className="workflow-eyebrow">EPISODE WORKSHOP</span><h1>{workflowLabels[current]}</h1></div><nav className="workflow-steps" aria-label="Episode workflow">{workflowSteps.map((step, i) => <button key={step} className={current === step ? 'current' : ''} disabled={step !== 'choose' && !run.started} onClick={() => onStep(step)}><span>{i + 1}</span>{workflowLabels[step]}</button>)}</nav></div>;
}

export function EpisodeChooser({ ep, packet, run, title, summary, episodePrompt, onGenerate, onContinue }) {
  return <div className="workflow-card chooser-card"><div className="workflow-kicker"><Sparkles size={15} /> Selected episode</div><h2>{title(ep)}</h2><p className="chooser-summary">{summary || ep.episode_summary || ep.core_event || 'This outline is ready to become a narrated episode.'}</p><div className="prompt-callout"><strong>Episode tone background</strong><p>{episodePrompt}</p></div><div className="chooser-meta"><span>{ep.target_duration_minutes || 5} minute target</span><span>{run.started ? 'Saved progress available' : 'Outline only'}</span></div><div className="chooser-actions">{run.started ? <button className="button primary" onClick={onContinue}>CONTINUE TO NARRATION <ArrowRight size={15} /></button> : <button className="button primary" onClick={onGenerate}>GENERATE EPISODE <ArrowRight size={15} /></button>}</div><details className="technical-details"><summary><ChevronDown size={14} /> Sources and technical details</summary><div className="details-body"><p><strong>Chronology:</strong> {packet.chronological_placement || 'Requires review'}</p><p><strong>Sources:</strong> {(packet.source_references || []).map(x => x.title || x.source_id).filter(Boolean).join(', ') || 'Prepared during generation'}</p></div></details></div>;
}

export function NarrationView({ run, onEdit }) {
  const count = (run.narration || '').trim().split(/\s+/).filter(Boolean).length;
  return <div className="workflow-card narration-view"><div className="view-heading"><div><span className="workflow-kicker"><FileText size={15} /> Spoken story</span><h2>Narration</h2></div><span className={`word-count ${count >= 650 && count <= 850 ? 'good' : ''}`}>{count} words</span></div>{run.openingNote && <details className="technical-details opening-note"><summary><Info size={14} /> Spoken opening note</summary><p>{run.openingNote}</p></details>}{run.audit?.unresolved > 0 && <div className="attention"><Info size={17} /><div><strong>Review needed before visuals</strong><p>{run.audit.unresolved} factual claim(s) need attention before the episode can advance.</p></div></div>}<textarea className="narration-editor" value={run.narration || ''} onChange={e => onEdit(e.target.value)} /><p className="quiet-note">The episode summary stays separate from this spoken script. Changes save automatically.</p>{run.legacySavedDraft?.narration && <details className="technical-details legacy-draft"><summary><ChevronDown size={14} /> Previous saved draft (preserved)</summary><p className="quiet-note">This is the draft that was in the workshop before the source-based regeneration.</p><pre>{run.legacySavedDraft.narration}</pre></details>}<details className="technical-details canon-counts"><summary><ChevronDown size={14} /> Canon review · {run.audit?.status || 'Not reviewed'}</summary><p>Verified claims: {run.audit?.verified || 0} · Inference-based claims: {run.audit?.inference || 0} · Unresolved claims: {run.audit?.unresolved || 0}</p><p>Episode 2 sources: The Thran, chapters 2–4. Claim-level chapter references are attached to the audit entries.</p></details></div>;
}

function CardChoice({ scene, card, assignment, onAssign, onRemove, onIndexCard }) {
  const [tagText, setTagText] = useState((card.visual_index?.descriptors || []).join(', '));
  const selected = assignment?.primary?.connection_id === card.connection_id;
  const supporting = (assignment?.supporting || []).some(item => item.connection_id === card.connection_id);
  const image = card.image_uri || card.image_uris?.normal || (card.scryfall_id ? `https://api.scryfall.com/cards/${card.scryfall_id}?format=image&version=normal` : '');
  return <details className={`card-choice ${selected || supporting ? 'selected' : ''}`}>
    <summary><span>{card.card_name}</span><small>{card.classification || card.matchQuality || 'METADATA BASED'}{Number.isFinite(card.relevance_score) ? ` · ${card.relevance_score}/100` : ''} <ChevronDown size={13} /></small></summary>
    <div className="card-preview">{image ? <img src={image} alt={`${card.card_name} artwork`} loading="lazy" /> : <div className="card-art-placeholder"><Image size={24} /></div>}
      <div><p>{card.reason || 'Metadata-based candidate. Inspect the artwork before deciding whether it fits.'}</p>
        <p className="printing">{typeof card.printing === 'string' ? card.printing : (card.printing?.set_name || card.printing?.set_code || 'Printing unspecified')} · {card.artist || 'Artist credit unavailable'}</p>
        {card.scryfall_uri && <a href={card.scryfall_uri} target="_blank" rel="noreferrer">View this printing on Scryfall</a>}
        <p className="quiet-note">Evidence: {card.evidence_basis || 'METADATA_BASED'}{card.beatIds?.length ? ` · ${card.beatIds.length} matching beat(s)` : ''}</p>
        <div className="card-actions"><button type="button" onClick={event => { event.preventDefault(); event.stopPropagation(); onAssign(scene.id, card, 'primary'); }}>{selected ? 'REPLACE PRIMARY' : 'PRIMARY'}</button><button type="button" onClick={event => { event.preventDefault(); event.stopPropagation(); onAssign(scene.id, card, 'supporting'); }}>SUPPORTING</button>{selected && <button className="remove-card" onClick={() => onRemove(scene.id, card, 'primary')}>REMOVE PRIMARY</button>}{supporting && <button className="remove-card" onClick={() => onRemove(scene.id, card, 'supporting')}>REMOVE SUPPORTING</button>}</div>
        <details className="art-index-editor"><summary>Describe visible artwork</summary><p>Manual visual tags apply to this illustration only. They do not establish canon.</p><input value={tagText} onChange={e => setTagText(e.target.value)} placeholder="desert, walking traveler, airborne vessel" /><button type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); onIndexCard?.(card, tagText.split(',').map(x => x.trim()).filter(Boolean)); }}>SAVE VISUAL TAGS</button></details>
      </div>
    </div>
  </details>;
}

function CopyPromptButton({ text }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className="copy-prompt" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { setCopied(false); } }}>{copied ? 'COPIED' : 'COPY PROMPT'}</button>;
}

function PromptBlock({ title, text }) {
  return <div className="prompt-block"><div><strong>{title}</strong><CopyPromptButton text={text} /></div><p>{text}</p></div>;
}

export function VisualBoardCompact({ run, onAssign, onRemove, onNoCard, onAccept, onBuild, onIndexCard, allCards = [], episodePrompt = '', soundtrack = null, sceneGuidance = [] }) {
  const [remoteResults, setRemoteResults] = useState({});
  const [remoteLoading, setRemoteLoading] = useState({});
  const discoverForBeat = async (scene, beat) => {
    setRemoteLoading(prev => ({ ...prev, [scene.id]: true }));
    try {
      const results = await searchIntentCards(beat);
      let visualIndex = {};
      try { visualIndex = JSON.parse(localStorage.getItem('collect-conquer-visual-art-index-v1') || '{}'); } catch { /* optional */ }
      const candidates = results.map(card => {
        const beatCharacterIds = beat.characterIds || [];
        const lore = allCards.find(item => item.scryfall_id === card.scryfall_id && (item.character_ids || []).some(id => beatCharacterIds.includes(id)));
        return { ...scoreArtworkCandidate({ ...card, canonicalEvidence:lore ? { confidence:lore.confidence, source_ids:lore.sources } : null, timelineNote:'Character association is sourced; this printing and image are not verified for the narrated period.' }, beat, { index:visualIndex }), beatIds:[beat.beat_id], narration_span:beat.narration_span };
      });
      setRemoteResults(prev => ({ ...prev, [scene.id]: [...(prev[scene.id] || []), ...candidates].filter((card,index,list) => list.findIndex(item => item.illustration_id === card.illustration_id) === index) }));
    } catch (error) {
      setRemoteResults(prev => ({ ...prev, [scene.id]: [{ connection_id:`error-${beat.beat_id}`, card_name:'Scryfall unavailable', reason:error.message, matchQuality:'ERROR' }, ...(prev[scene.id] || [])] }));
    } finally { setRemoteLoading(prev => ({ ...prev, [scene.id]: false })); }
  };
  const assigned = run.scenes.filter(scene => run.assignments[scene.id]?.primary || run.assignments[scene.id]?.noCard).length;
  const ready = run.scenes.length > 0 && assigned === run.scenes.length;
  return <div className="visual-workspace">
    <div className="visual-toolbar"><div><span className="workflow-kicker"><Image size={15} /> Visual direction</span><h2>Choose visuals</h2><p>Canonical links, indexed visual matches, and metadata-only possibilities are labeled separately.</p></div><button className="button secondary" onClick={onAccept}>ACCEPT SUGGESTED</button></div>
    <section className="episode-creative-brief" aria-label="Episode image and sound prompts"><div className="creative-brief-heading"><div><span className="workflow-kicker"><Sparkles size={14} /> Episode-wide direction</span><h3>Theme, image & sound prompts</h3></div><span className="prompt-status">PROMPTS READY · AUDIO NOT GENERATED</span></div><PromptBlock title="Episode background / visual tone" text={episodePrompt || 'Illustrative reconstruction: use the episode setting, period, and established visual motifs to set a consistent tone across scene transitions.'} /><div className="theme-prompt-list"><h4>Recommended theme and soundtrack prompts</h4>{soundtrack?.mainTheme && <PromptBlock title="Main theme" text={soundtrack.mainTheme} />}{(soundtrack?.sceneCues || []).map((cue,index) => <div className="sound-cue" key={`${cue.name}-${index}`}><h5>{cue.name}</h5><PromptBlock title="Music cue prompt" text={cue.prompt} /></div>)}{!soundtrack?.sceneCues?.length && <p className="quiet-note">Scene-specific sound cues appear with each scene below.</p>}{soundtrack?.mixGuidance && <p className="mix-guidance"><strong>Mix guidance:</strong> {soundtrack.mixGuidance}</p>}</div></section>
    <div className="scene-compact-list">{run.scenes.map((scene, i) => {
      const assignment = run.assignments[scene.id] || {};
      const production = (run.production || []).find(item => item.id === scene.id);
      const guide = sceneGuidance.find(item => item.id === scene.id) || scene;
      const sceneTitle = readable(scene.name).replace(/^\d+\s*(?:-\s*)?/, '').trim();
      const remote = remoteResults[scene.id] || [];
      const combined = [...(run.candidates[scene.id] || []), ...remote];
      const allSuggestions = combined.filter((card,index,list) => list.findIndex(item => (item.illustration_id || item.connection_id) === (card.illustration_id || card.connection_id)) === index);
      const suggested = allSuggestions;
      const searchTerm = encodeURIComponent(scene.location || sceneTitle);
      return <article className="scene-compact" key={scene.id}>
        <div className="scene-compact-head"><div><span className="scene-index">{String(i + 1).padStart(2, '0')}</span><h3>{sceneTitle}</h3><small>{scene.duration}s · {scene.excerpt.trim().split(/\s+/).filter(Boolean).length} words · {readable(scene.location)}</small></div><span className={assignment.primary || assignment.noCard ? 'assigned-dot' : 'unassigned-dot'}>{assignment.primary ? 'Selected' : assignment.noCard ? 'No card' : 'Choose'}</span></div>
        <section className="scene-production-guidance"><div className="scene-brief-top"><div><span>SCENE VISUAL BRIEF</span><p><strong>Event:</strong> {readable(scene.event)} · <strong>Location:</strong> {readable(scene.location)}</p></div>{scene.backgroundImage && <a className="background-preview-link" href={scene.backgroundImage} target="_blank" rel="noreferrer"><img src={scene.backgroundImage} alt={`${scene.name} illustrative reconstruction background`} loading="lazy" /><small>{scene.backgroundLabel || 'Illustrative reconstruction — not canonical artwork'}</small></a>}</div><PromptBlock title="Image / background prompt · illustrative reconstruction" text={guide.backgroundPrompt || scene.backgroundPrompt || production?.aiBackgroundPrompt || `Illustrative reconstruction, not canonical artwork: grounded imagery for ${readable(scene.location)} based on this narrated beat.`} /><div className="scene-prompt-grid"><PromptBlock title="Suggested video effect" text={guide.videoEffect || production?.videoEffect || 'Slow atmospheric drift with a restrained push-in; keep movement subtle beneath narration.'} /><PromptBlock title="Audio / SFX prompt" text={guide.audioPrompt || production?.audioPrompt || production?.audio || `Create restrained ambient sound for ${readable(scene.location)}: low environmental texture tied to ${readable(scene.event)}, with no voices or music competing with narration.`} /><PromptBlock title="Transition suggestion" text={guide.transition || production?.transition || 'Use a slow dissolve at the end of the narration beat; let the final image hold briefly before the next scene.'} /></div></section><details className="scene-story"><summary>Read scene narration and source notes <ChevronDown size={14} /></summary><blockquote>{readable(scene.excerpt)}</blockquote><details className="technical-details scene-sources"><summary>Sources for this scene</summary>{(scene.sourceReferences || []).map((source,index)=><p key={`${source.source_id}-${index}`}>{source.title}, chapter {source.chapter} · {source.confidence} confidence</p>)}</details></details>
        {scene.visualBeats?.length > 0 && <details className="visual-intents"><summary>Visual opportunities · {scene.visualBeats.length}</summary>{scene.visualBeats.map(beat => <div className="visual-beat" key={beat.beat_id}><blockquote>{beat.narration_text}</blockquote><div className="intent-tags">{beat.characters.map(name => <span key={`c-${name}`}>Character: {name}</span>)}{beat.locations.map(name => <span key={`l-${name}`}>Location: {name}</span>)}{beat.visual_priorities.map(name => <span key={`v-${name}`}>{name}</span>)}</div><small>Explicit details come from the narration span. Inferred search terms do not establish canon.</small><button type="button" onClick={() => discoverForBeat(scene, beat)} disabled={remoteLoading[scene.id]}>{remoteLoading[scene.id] ? 'SEARCHING...' : 'FIND CARD ART FOR THIS BEAT'}</button></div>)}</details>}
        <div className="visual-columns"><div><p className="official-art-links"><strong>Other official visual sources:</strong> <a href={`https://magic.wizards.com/en/search?search=${searchTerm}`} target="_blank" rel="noreferrer">Search Wizards.com</a> <span>Use credited Wizards or commissioned artwork.</span></p>{scene.artworkNote && <p className="quiet-note artwork-note">{scene.artworkNote}</p>}<label>Suggested cards</label>
          {suggested.length > 0 && <p className="quiet-note">Each suggestion is labeled by evidence. A card association does not prove its art depicts this scene or period.</p>}
          {suggested.map(card => <CardChoice key={card.connection_id} scene={scene} card={card} assignment={assignment} onAssign={onAssign} onRemove={onRemove} onIndexCard={onIndexCard} />)}
          {remoteLoading[scene.id] && <p className="quiet-note">Finding relevant card art...</p>}
          {!suggested.length && !remoteLoading[scene.id] && <p className="quiet-note">No card suggestions for this scene. You can use its illustrative background or choose No card.</p>}
        </div><div className="selected-visuals"><label>Selected visuals</label><p>{assignment.primary?.card_name || 'None selected'}</p>{assignment.primary && <button className="remove-selection" onClick={() => onRemove(scene.id, assignment.primary, 'primary')}>REMOVE PRIMARY</button>}{(assignment.supporting || []).map(card => <span key={card.connection_id}>Supporting: {card.card_name} <button className="remove-selection" onClick={() => onRemove(scene.id, card, 'supporting')}>REMOVE</button></span>)}<button className={assignment.noCard ? 'no-card selected' : 'no-card'} onClick={() => onNoCard(scene.id)}>NO CARD</button></div></div>
      </article>;
    })}</div><div className="visual-footer"><span>{assigned} of {run.scenes.length} scenes assigned</span><button className="button primary" disabled={!ready} onClick={onBuild}>CONTINUE TO REVIEW <ArrowRight size={15} /></button></div>
  </div>;
}

export function ReviewExport({ run, onExport }) {
  const files = ['script-clean.md', 'opening-disclaimer.md', 'script-production.html', 'script-production.md', 'scenes.json', 'cards.json', 'ai-background-prompts.md', 'sfx-list.md', 'shot-list.md', 'subtitles.srt', 'sources.md'];
  return <div className="workflow-card review-view"><div className="workflow-kicker"><Check size={15} /> Final review</div><h2>Review & export</h2><p>Production timing, background prompts, effects, and source references are ready.</p><div className="review-summary"><span><strong>{run.scenes.length}</strong> scenes</span><span><strong>{(run.narration || '').trim().split(/\s+/).filter(Boolean).length}</strong> narration words</span><span><strong>{run.audit?.unresolved || 0}</strong> unresolved claims</span></div><details className="technical-details"><summary><ChevronDown size={14} /> View export files</summary><div className="file-grid">{files.map(file => <span key={file}><Check size={14} /> {file}</span>)}</div></details><button className="button primary" onClick={onExport}>{run.exported ? 'EXPORT AGAIN' : 'EXPORT PACKAGE'} <ArrowRight size={15} /></button>{run.exported && <p className="success-note">Package exported. Your browser download shelf contains the files.</p>}</div>;
}
