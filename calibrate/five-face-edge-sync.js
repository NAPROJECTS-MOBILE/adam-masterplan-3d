import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

/*
  ADAM calibrator — persistent edge-only sync for the five thin architectural
  meshes that are styled as normal building faces but intentionally remain out
  of the native solid/glow classification.

  Important: this module does NOT add glow and does NOT change mesh transforms,
  materials, motion, camera, lighting, keyframes, slab or dots.
*/

const TARGETS = [
  { path:'Scene_1/Main_Group/clusters/cluster_2/Rectangle_2_5', name:'Rectangle_2_5', ancestor:'cluster_2' },
  { path:'Scene_1/Main_Group/clusters/cluster_2/Rectangle_10',  name:'Rectangle_10',  ancestor:'cluster_2' },
  { path:'Scene_1/Main_Group/clusters/cluster_2/Rectangle_3_2', name:'Rectangle_3_2', ancestor:'cluster_2' },
  { path:'Scene_1/Main_Group/clusters/cluster_1/floor',         name:'floor',         ancestor:'cluster_1' },
  { path:'Scene_1/Main_Group/clusters/cluster_1/b10/Rectangle_9', name:'Rectangle_9', ancestor:'b10' }
];

function pathOf(object) {
  const parts = [];
  let node = object;
  while (node) {
    if (node.name) parts.push(node.name);
    node = node.parent;
  }
  return parts.reverse().join('/');
}

function edgeControls() {
  const wraps = [...document.querySelectorAll('#edgeCtls .ctl')];
  const input = i => wraps[i]?.querySelector('input');
  const color = input(0)?.value || '#d6e296';
  const opacity = Number(input(1)?.value);
  const width = Number(input(2)?.value);
  const angle = Number(input(3)?.value);
  return {
    color,
    opacity: Number.isFinite(opacity) ? opacity : 0.52,
    width: Number.isFinite(width) ? width : 1,
    angle: Number.isFinite(angle) ? angle : 30
  };
}

function edgesVisible() {
  const button = document.getElementById('tEdges');
  return !button || button.classList.contains('on');
}

function canvasSize() {
  const canvas = document.querySelector('[data-scene3d-canvas]');
  if (!canvas) return { width:1, height:1 };
  const rect = canvas.getBoundingClientRect();
  return {
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height))
  };
}

function resolveTargets(scene) {
  const meshes = [];
  scene.traverse(object => {
    if (object?.isMesh && object.geometry?.attributes?.position) meshes.push(object);
  });

  const resolved = [];
  const used = new Set();

  for (const target of TARGETS) {
    let mesh = meshes.find(m => !used.has(m) && pathOf(m) === target.path) || null;

    if (!mesh) {
      const named = meshes.filter(m => !used.has(m) && m.name === target.name);
      const hinted = named.filter(m => {
        const path = pathOf(m);
        return path.includes(`/${target.ancestor}/`) || path.endsWith(`/${target.ancestor}/${target.name}`);
      });
      if (hinted.length === 1) mesh = hinted[0];
      else if (named.length === 1) mesh = named[0];
    }

    if (mesh) {
      used.add(mesh);
      resolved.push({ ...target, mesh });
    }
  }

  return resolved;
}

function makeGeometry(mesh, angle) {
  const edges = new THREE.EdgesGeometry(mesh.geometry, angle);
  const position = edges.attributes.position;
  if (!position || position.count < 2) {
    edges.dispose();
    return null;
  }

  const positions = new Float32Array(position.count * 3);
  positions.set(position.array);
  edges.dispose();

  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);
  return geometry;
}

const material = new LineMaterial({ transparent:true, depthTest:true, depthWrite:true });
material.toneMapped = false;

let targets = [];
let lines = [];
let resolvedScene = null;
let lastAngle = null;
let lastSignature = '';

function clearLines() {
  for (const line of lines) {
    line.removeFromParent();
    line.geometry?.dispose?.();
  }
  lines = [];
}

function rebuild(scene, angle) {
  clearLines();
  targets = resolveTargets(scene);

  for (const target of targets) {
    const mesh = target.mesh;
    const geometry = makeGeometry(mesh, angle);
    if (!geometry) continue;

    const add = instanceMatrix => {
      const line = new LineSegments2(geometry.clone(), material);
      line.userData.adamFiveFaceEdge = true;
      line.frustumCulled = false;
      line.renderOrder = 3;
      if (instanceMatrix) {
        line.matrixAutoUpdate = false;
        line.matrix.copy(instanceMatrix);
      }
      mesh.add(line);
      lines.push(line);
    };

    if (mesh.isInstancedMesh) {
      const matrix = new THREE.Matrix4();
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        add(matrix.clone());
      }
    } else {
      add(null);
    }

    geometry.dispose();
  }

  const signature = targets.map(t => `${t.path}=>${pathOf(t.mesh)}`).sort().join('|');
  if (signature !== lastSignature) {
    lastSignature = signature;
    console.info(`[ADAM five-face edges v2] resolved ${targets.length}/${TARGETS.length}; created ${lines.length} edge layer(s)`);
    const foundPaths = new Set(targets.map(t => t.path));
    const missing = TARGETS.filter(t => !foundPaths.has(t.path)).map(t => t.path);
    if (missing.length) console.warn('[ADAM five-face edges v2] unresolved targets:', missing);
  }
}

function sync(scene) {
  const controls = edgeControls();

  if (scene !== resolvedScene || lastAngle !== controls.angle || !lines.length) {
    resolvedScene = scene;
    lastAngle = controls.angle;
    rebuild(scene, controls.angle);
  }

  material.color.set(controls.color);
  material.opacity = THREE.MathUtils.clamp(controls.opacity, 0, 1);
  material.linewidth = Math.max(0.01, controls.width);
  material.transparent = true;
  material.needsUpdate = true;

  const size = canvasSize();
  material.resolution.set(size.width, size.height);

  const visible = edgesVisible();
  for (const line of lines) line.visible = visible;
}

const previousRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function render(scene, camera) {
  sync(scene);
  return previousRender.call(this, scene, camera);
};

window.__ADAM_FIVE_FACE_EDGE_TARGETS = TARGETS.map(t => t.path);
window.__ADAM_FIVE_FACE_EDGES = lines;
