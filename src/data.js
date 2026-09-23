import erasFile from '../ERAS.json';
import arcsFile from '../STORY_ARCS.json';
import episodesFile from '../EPISODES.json';
import charactersFile from '../CHARACTERS.json';
import planesFile from '../PLANES.json';
import narrationFile from '../NARRATION_SCRIPTS.json';
import lorePacketsFile from '../LORE_PACKETS.json';
import workflowFile from '../EPISODE_WORKFLOW.json';

export const eras = erasFile.eras;
export const arcs = arcsFile.story_arcs;
// Keep the imported research description distinct from any spoken script.
// The alias makes that boundary explicit for future generators and exports.
export const episodes = episodesFile.episodes.map((episode) => ({
  ...episode,
  episode_summary: episode.episode_summary || episode.core_event || ''
}));
export const events = episodesFile.important_events;
export const characters = charactersFile.characters;
export const planes = planesFile.planes;
export const sourceCatalog = erasFile.source_catalog;
export const chronologyIssues = episodesFile.chronology_issues;
export const narrationScripts = narrationFile.scripts.map((record) => ({
  ...record,
  narration_script: record.narration_script || record.script || ''
}));
export const lorePackets = lorePacketsFile.packets;
export const workflowStatuses = workflowFile.statuses;
export const workflowStatusOrder = workflowFile.status_order;

export const byId = (rows, key) => new Map(rows.map((row) => [row[key], row]));
export const eraById = byId(eras, 'era_id');
export const arcById = byId(arcs, 'arc_id');
export const episodeById = byId(episodes, 'episode_id');
export const eventById = byId(events, 'event_id');
export const characterById = byId(characters, 'character_id');
export const planeById = byId(planes, 'plane_id');
export const sourceById = byId(sourceCatalog, 'source_id');
export const issueById = byId(chronologyIssues, 'issue_id');
export const narrationByEpisodeId = byId(narrationScripts, 'episode_id');
export const lorePacketByEpisodeId = byId(lorePackets, 'episode_id');

export function recordsForIds(ids = [], map) {
  return ids.map((id) => map.get(id)).filter(Boolean);
}

export function arcsForEra(eraId) {
  return arcs.filter((arc) => arc.era_id === eraId).sort((a, b) => a.watch_order - b.watch_order);
}

export function episodesForArc(arcId) {
  return episodes.filter((episode) => episode.arc_id === arcId).sort((a, b) => a.watch_order - b.watch_order);
}

export function sourceRecords(ids = []) {
  return recordsForIds(ids, sourceById);
}
