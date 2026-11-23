// Procedurally built chess piece geometry (lathe profiles + extrusions). No external models.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PieceSymbol } from 'chess.js';

type P = [number, number];

function arc(cx: number, cy: number, r: number, a0: number, a1: number, n = 10): P[] {
  const pts: P[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function lathe(points: P[], segments = 40): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(
    points.map(([x, y]) => new THREE.Vector2(Math.max(0, x), y)),
    segments,
  );
  g.computeVertexNormals();
  return g;
}

/** Common stepped base all pieces share. */
function base(scale = 1): P[] {
  const s = scale;
  return [
    [0, 0],
    [0.37 * s, 0],
    [0.37 * s, 0.045],
    [0.34 * s, 0.07],
    [0.34 * s, 0.095],
    [0.29 * s, 0.115],
    [0.27 * s, 0.14],
  ];
}

function pawn(): THREE.BufferGeometry {
  const pts: P[] = [
    ...base(0.92),
    [0.2, 0.17],
    [0.14, 0.27],
    [0.11, 0.35],
    [0.18, 0.37],
    [0.18, 0.395],
    [0.1, 0.42],
    ...arc(0, 0.53, 0.135, -Math.PI / 2.6, Math.PI / 2, 12),
  ];
  return lathe(pts);
}

function rook(): THREE.BufferGeometry {
  const body = lathe([
    ...base(),
    [0.23, 0.17],
    [0.2, 0.3],
    [0.2, 0.46],
    [0.24, 0.48],
    [0.27, 0.5],
    [0.27, 0.62],
    [0.2, 0.62],
    [0.2, 0.57],
    [0, 0.57],
  ]);
  const merlons: THREE.BufferGeometry[] = [body];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const m = new THREE.BoxGeometry(0.1, 0.09, 0.08);
    m.translate(0, 0.665, 0);
    const r = 0.235;
    const mat = new THREE.Matrix4().makeRotationY(-a).setPosition(r * Math.cos(a), 0, r * Math.sin(a));
    m.applyMatrix4(mat);
    merlons.push(m.toNonIndexed());
  }
  return merge(merlons);
}

function bishop(): THREE.BufferGeometry {
  const body = lathe([
    ...base(),
    [0.21, 0.17],
    [0.15, 0.3],
    [0.12, 0.45],
    [0.2, 0.48],
    [0.2, 0.505],
    [0.12, 0.53],
    // mitre (egg)
    [0.13, 0.56],
    [0.15, 0.62],
    [0.14, 0.68],
    [0.1, 0.74],
    [0.05, 0.78],
    [0.02, 0.795],
    ...arc(0, 0.83, 0.04, -Math.PI / 2, Math.PI / 2, 8),
  ]);
  // a thin collar ring under the mitre
  const ring = new THREE.TorusGeometry(0.135, 0.018, 8, 32);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, 0.55, 0);
  return merge([body, ring]);
}

function queen(): THREE.BufferGeometry {
  const body = lathe([
    ...base(1.04),
    [0.23, 0.17],
    [0.15, 0.32],
    [0.11, 0.55],
    [0.2, 0.59],
    [0.2, 0.615],
    [0.12, 0.64],
    [0.16, 0.72],
    [0.21, 0.8],
    [0.15, 0.81],
    [0.08, 0.83],
    [0.02, 0.86],
    ...arc(0, 0.9, 0.05, -Math.PI / 2, Math.PI / 2, 8),
  ]);
  const parts: THREE.BufferGeometry[] = [body];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const s = new THREE.SphereGeometry(0.035, 10, 8);
    s.translate(0.195 * Math.cos(a), 0.815, 0.195 * Math.sin(a));
    parts.push(s.toNonIndexed());
  }
  return merge(parts);
}

function king(): THREE.BufferGeometry {
  const body = lathe([
    ...base(1.06),
    [0.24, 0.17],
    [0.16, 0.33],
    [0.12, 0.58],
    [0.21, 0.62],
    [0.21, 0.645],
    [0.13, 0.67],
    [0.17, 0.78],
    [0.2, 0.84],
    [0.14, 0.86],
    [0.07, 0.88],
    [0.07, 0.9],
    [0, 0.9],
  ]);
  const v = new THREE.BoxGeometry(0.06, 0.2, 0.06);
  v.translate(0, 0.99, 0);
  const h = new THREE.BoxGeometry(0.16, 0.055, 0.06);
  h.translate(0, 1.01, 0);
  return merge([body, v.toNonIndexed(), h.toNonIndexed()]);
}

function knight(): THREE.BufferGeometry {
  const body = lathe([...base(), [0.24, 0.17], [0.22, 0.22], [0.2, 0.24], [0, 0.24]]);
  // Horse head silhouette facing +x
  const s = new THREE.Shape();
  const pts: P[] = [
    [-0.2, 0.2],
    [0.17, 0.2],
    [0.15, 0.3],
    [0.08, 0.39],
    [0.13, 0.43],
    [0.27, 0.47],
    [0.33, 0.52],
    [0.33, 0.58],
    [0.27, 0.62],
    [0.14, 0.68],
    [0.07, 0.75],
    [0.05, 0.84],
    [-0.01, 0.79],
    [-0.06, 0.8],
    [-0.09, 0.74],
    [-0.17, 0.68],
    [-0.22, 0.56],
    [-0.24, 0.42],
    [-0.23, 0.3],
  ];
  s.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) s.lineTo(x, y);
  s.closePath();
  const head = new THREE.ExtrudeGeometry(s, {
    depth: 0.16,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.03,
    bevelSegments: 3,
    curveSegments: 4,
  });
  head.translate(0, 0, -0.08);
  // Eyes
  const parts: THREE.BufferGeometry[] = [body, head.toNonIndexed()];
  for (const z of [-0.12, 0.12]) {
    const e = new THREE.SphereGeometry(0.025, 8, 6);
    e.translate(0.12, 0.66, z);
    parts.push(e.toNonIndexed());
  }
  return merge(parts);
}

function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const clean = geos.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    // ensure identical attribute sets
    for (const name of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(name)) ng.deleteAttribute(name);
    if (!ng.attributes.uv) {
      const count = ng.attributes.position.count;
      ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    return ng;
  });
  return mergeGeometries(clean, false)!;
}

let cache: Record<PieceSymbol, THREE.BufferGeometry> | null = null;
export function pieceGeometries(): Record<PieceSymbol, THREE.BufferGeometry> {
  if (!cache) {
    cache = { p: pawn(), r: rook(), n: knight(), b: bishop(), q: queen(), k: king() };
  }
  return cache;
}
