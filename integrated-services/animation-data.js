// ADAM Integrated Services — normalized Spline Timeline 2 adapter
// Source data lives in timeline-v2.js. This module exposes the schema expected
// by the Three.js calibrator without relying on the previous giant generated
// object literal, which had become syntactically fragile during repo writes.

import { SPLINE_TIMELINE as RAW_TIMELINE } from './timeline-v2.js?v=services-timeline-source-v3';

const GROUP_TRACKS = new Set([
  'b2f3',
  'b2r1',
  'b2r2',
  'b2r3',
  'b2r4',
  'b2r5',
  'rope',
  'crane m part'
]);

const PATH_BY_TYPE = {
  shape: 'shape size.value',
  scale: 'scale.value',
  position: 'position.value',
  opacity: 'opacity'
};

function vectorValue(value) {
  if (!Array.isArray(value)) return value;
  return {
    x: Number(value[0] ?? 0),
    y: Number(value[1] ?? 0),
    z: Number(value[2] ?? 0)
  };
}

function normalizeTrack(track) {
  return {
    id: `gltf-node-${track.node}`,
    name: track.name,
    kind: GROUP_TRACKS.has(track.name) ? 'group' : 'mesh',
    gltfCandidates: [track.node],
    base: {
      position: Array.isArray(track.base?.position) ? [...track.base.position] : [0, 0, 0],
      scale: Array.isArray(track.base?.scale) ? [...track.base.scale] : [1, 1, 1],
      shapeSize: Array.isArray(track.base?.shape) ? [...track.base.shape] : [1, 1, 1]
    },
    properties: (track.props || []).map(prop => ({
      path: PATH_BY_TYPE[prop.type] || prop.type,
      keyframes: (prop.keys || []).map(([time, value]) => ({
        time: Number(time),
        value: vectorValue(value),
        c1: [0.42, 0],
        c2: [0.58, 1]
      }))
    }))
  };
}

export const SPLINE_TIMELINE = {
  timelineId: RAW_TIMELINE.id,
  name: RAW_TIMELINE.name,
  duration: RAW_TIMELINE.duration,
  tracks: RAW_TIMELINE.tracks.map(normalizeTrack),
  ignoredStaleMappings: 6
};
