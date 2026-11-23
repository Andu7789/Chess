import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { memo, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Chess } from 'chess.js';
import type { Color, PieceSymbol, Square } from 'chess.js';
import { pieceGeometries } from './pieceGeometry';
import type { BoardTheme } from './themes';

export interface Mark {
  square: Square;
  color: string;
  kind?: 'ring' | 'fill' | 'dot';
}
export interface Arrow {
  from: Square;
  to: Square;
  color: string;
}

export interface Board3DProps {
  fen: string;
  orientation: Color;
  theme: BoardTheme;
  topDown?: boolean;
  selected?: Square | null;
  legalTargets?: { square: Square; capture: boolean }[];
  lastMove?: { from: Square; to: Square } | null;
  marks?: Mark[];
  arrows?: Arrow[];
  stars?: Square[];
  onSquareClick?: (sq: Square) => void;
}

const FILES = 'abcdefgh';
export function squareToWorld(sq: Square): [number, number] {
  const f = FILES.indexOf(sq[0]);
  const r = Number(sq[1]) - 1;
  return [f - 3.5, 3.5 - r];
}

interface PlacedPiece {
  id: number;
  type: PieceSymbol;
  color: Color;
  square: Square;
}

function loadLax(fen: string): Chess {
  try {
    return new Chess(fen);
  } catch {
    return new Chess(fen, { skipValidation: true });
  }
}

let nextId = 1;
/** Match pieces between positions so that moved pieces keep their identity (and animate). */
function trackPieces(prev: PlacedPiece[], fen: string): PlacedPiece[] {
  const chess = loadLax(fen);
  const now: { type: PieceSymbol; color: Color; square: Square }[] = [];
  for (const row of chess.board()) for (const p of row) if (p) now.push({ type: p.type, color: p.color, square: p.square });
  const unused = new Set(prev);
  const result: (PlacedPiece | null)[] = now.map(() => null);
  // 1. exact matches
  now.forEach((p, i) => {
    const m = [...unused].find((o) => o.square === p.square && o.type === p.type && o.color === p.color);
    if (m) {
      unused.delete(m);
      result[i] = { ...m };
    }
  });
  // 2. same piece moved (nearest)
  now.forEach((p, i) => {
    if (result[i]) return;
    const [x, z] = squareToWorld(p.square);
    let best: PlacedPiece | null = null;
    let bestD = Infinity;
    for (const o of unused) {
      if (o.color !== p.color) continue;
      if (o.type !== p.type && !(o.type === 'p' && 'qrbn'.includes(p.type))) continue;
      const [ox, oz] = squareToWorld(o.square);
      const d = Math.hypot(ox - x, oz - z);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    if (best && bestD < 12) {
      unused.delete(best);
      result[i] = { ...best, type: p.type, square: p.square };
    }
  });
  return now.map((p, i) => result[i] ?? { id: nextId++, ...p });
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

const PieceMesh = memo(function PieceMesh({
  piece,
  theme,
  onClick,
}: {
  piece: PlacedPiece;
  theme: BoardTheme;
  onClick: (e: ThreeEvent<MouseEvent>, sq: Square) => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const anim = useRef<{ from: THREE.Vector3; to: THREE.Vector3; start: number } | null>(null);
  const [tx, tz] = squareToWorld(piece.square);
  const geo = pieceGeometries()[piece.type];

  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    const target = new THREE.Vector3(tx, 0, tz);
    if (g.position.distanceTo(target) > 0.01 && g.userData.placed) {
      anim.current = { from: g.position.clone(), to: target, start: performance.now() };
    } else {
      g.position.copy(target);
      g.userData.placed = true;
    }
  }, [tx, tz]);

  useFrame(() => {
    const g = ref.current;
    const a = anim.current;
    if (!g || !a) return;
    const dur = piece.type === 'n' ? 380 : 300;
    const t = Math.min(1, (performance.now() - a.start) / dur);
    const e = easeInOut(t);
    g.position.lerpVectors(a.from, a.to, e);
    const hop = piece.type === 'n' ? 0.7 : 0.12;
    g.position.y = Math.sin(t * Math.PI) * hop;
    if (t >= 1) {
      g.position.copy(a.to);
      anim.current = null;
    }
  });

  const color = piece.color === 'w' ? theme.whitePiece : theme.blackPiece;
  // knights shown in profile so their shape reads from the player's seat
  const rotY = piece.type === 'n' ? (piece.color === 'w' ? Math.PI * 0.82 : -Math.PI * 0.18) : 0;
  return (
    <group ref={ref} onClick={(e) => onClick(e, piece.square)}>
      <mesh geometry={geo} castShadow receiveShadow rotation={[0, rotY, 0]}>
        <meshPhysicalMaterial
          color={color}
          roughness={piece.color === 'w' ? 0.38 : 0.3}
          metalness={0.02}
          clearcoat={0.6}
          clearcoatRoughness={0.25}
        />
      </mesh>
    </group>
  );
});

function makeLabelTexture(theme: BoardTheme, orientation: Color): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const unit = size / 9.2;
  ctx.fillStyle = theme.label;
  ctx.font = `bold ${Math.round(unit * 0.32)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const toPx = (x: number, z: number): [number, number] => [(x + 4.6) * unit, (z + 4.6) * unit];
  const draw = (text: string, x: number, z: number) => {
    const [px, py] = toPx(x, z);
    ctx.save();
    ctx.translate(px, py);
    if (orientation === 'b') ctx.rotate(Math.PI);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };
  for (let i = 0; i < 8; i++) {
    const x = i - 3.5;
    draw(FILES[i], x, 4.3);
    draw(FILES[i], x, -4.3);
    const z = 3.5 - i;
    draw(String(i + 1), -4.3, z);
    draw(String(i + 1), 4.3, z);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function ArrowMesh({ from, to, color }: Arrow) {
  const geo = useMemo(() => {
    const [x1, z1] = squareToWorld(from);
    const [x2, z2] = squareToWorld(to);
    const len = Math.hypot(x2 - x1, z2 - z1);
    const head = 0.42;
    const w = 0.11;
    const s = new THREE.Shape();
    // arrow along +x from 0 to len
    const start = 0.25;
    s.moveTo(start, -w);
    s.lineTo(len - head, -w);
    s.lineTo(len - head, -w * 2.8);
    s.lineTo(len - 0.05, 0);
    s.lineTo(len - head, w * 2.8);
    s.lineTo(len - head, w);
    s.lineTo(start, w);
    s.closePath();
    const g = new THREE.ShapeGeometry(s);
    g.rotateX(-Math.PI / 2); // into XZ plane (shape y -> -z)
    const angle = Math.atan2(-(z2 - z1), x2 - x1);
    g.rotateY(angle);
    g.translate(x1, 0.04, z1);
    return g;
  }, [from, to]);
  return (
    <mesh geometry={geo} renderOrder={5}>
      <meshBasicMaterial color={color} transparent opacity={0.82} depthWrite={false} />
    </mesh>
  );
}

function SquareOverlay({ square, color, kind = 'fill', opacity = 0.5 }: { square: Square; color: string; kind?: Mark['kind']; opacity?: number }) {
  const [x, z] = squareToWorld(square);
  if (kind === 'ring')
    return (
      <mesh position={[x, 0.012, z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
        <ringGeometry args={[0.36, 0.46, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} depthWrite={false} />
      </mesh>
    );
  if (kind === 'dot')
    return (
      <mesh position={[x, 0.012, z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
        <circleGeometry args={[0.15, 28]} />
        <meshBasicMaterial color={color} transparent opacity={0.7} depthWrite={false} />
      </mesh>
    );
  return (
    <mesh position={[x, 0.006, z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

function Star({ square }: { square: Square }) {
  const ref = useRef<THREE.Mesh>(null);
  const [x, z] = squareToWorld(square);
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 0.3 : 0.13;
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      if (i === 0) s.moveTo(r * Math.cos(a), r * Math.sin(a));
      else s.lineTo(r * Math.cos(a), r * Math.sin(a));
    }
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false });
  }, []);
  useFrame((st) => {
    if (ref.current) {
      ref.current.rotation.y = st.clock.elapsedTime * 1.5;
      ref.current.position.y = 0.45 + Math.sin(st.clock.elapsedTime * 2 + x) * 0.06;
    }
  });
  return (
    <mesh ref={ref} geometry={geo} position={[x, 0.45, z]} castShadow>
      <meshStandardMaterial color="#ffcc33" emissive="#a06800" emissiveIntensity={0.5} metalness={0.3} roughness={0.3} />
    </mesh>
  );
}

function CameraRig({ orientation, topDown }: { orientation: Color; topDown?: boolean }) {
  const { camera } = useThree();
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  useEffect(() => {
    const dir = orientation === 'w' ? 1 : -1;
    if (topDown) camera.position.set(0, 13.5, 0.001 * dir);
    else camera.position.set(0, 10.4, 8.9 * dir);
    camera.lookAt(0, 0, 0);
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.update();
    }
  }, [orientation, topDown, camera, controls]);
  return null;
}

function KingInCheck({ fen }: { fen: string }) {
  const sq = useMemo(() => {
    try {
      const c = new Chess(fen);
      if (!c.inCheck()) return null;
      return c.findPiece({ type: 'k', color: c.turn() })[0] ?? null;
    } catch {
      return null; // practice positions without kings
    }
  }, [fen]);
  const ref = useRef<THREE.Mesh>(null);
  useFrame((st) => {
    if (ref.current) (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.45 + Math.sin(st.clock.elapsedTime * 6) * 0.2;
  });
  if (!sq) return null;
  const [x, z] = squareToWorld(sq);
  return (
    <mesh ref={ref} position={[x, 0.008, z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
      <circleGeometry args={[0.5, 40]} />
      <meshBasicMaterial color="#ff2a2a" transparent opacity={0.55} depthWrite={false} />
    </mesh>
  );
}

/** Test-only hook (enabled with ?test in the URL): lets automated tests find squares on screen. */
function TestHook() {
  const { camera, gl } = useThree();
  useEffect(() => {
    if (!window.location.search.includes('test')) return;
    (window as unknown as Record<string, unknown>).__squareToScreen = (sq: Square) => {
      const [x, z] = squareToWorld(sq);
      const v = new THREE.Vector3(x, 0, z).project(camera);
      const r = gl.domElement.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    };
  }, [camera, gl]);
  return null;
}

function Scene(props: Board3DProps) {
  const { fen, theme, orientation, onSquareClick } = props;
  const prev = useRef<PlacedPiece[]>([]);
  const pieces = useMemo(() => {
    const next = trackPieces(prev.current, fen);
    prev.current = next;
    return next;
  }, [fen]);
  const labelTex = useMemo(() => makeLabelTexture(theme, orientation), [theme, orientation]);

  const click = (e: ThreeEvent<MouseEvent>, sq: Square) => {
    e.stopPropagation();
    if (e.delta > 6) return; // was a drag/orbit
    onSquareClick?.(sq);
  };

  const squares = useMemo(() => {
    const out: { sq: Square; x: number; z: number; light: boolean }[] = [];
    for (let f = 0; f < 8; f++)
      for (let r = 0; r < 8; r++) {
        const sq = (FILES[f] + (r + 1)) as Square;
        const [x, z] = squareToWorld(sq);
        out.push({ sq, x, z, light: (f + r) % 2 === 1 });
      }
    return out;
  }, []);

  return (
    <>
      <color attach="background" args={[theme.table]} />
      <fog attach="fog" args={[theme.table, 18, 34]} />
      <hemisphereLight args={['#fff6e8', '#3a2f28', 0.75]} />
      <directionalLight
        position={[4, 11, 6]}
        intensity={2.1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-6, 6, -4]} intensity={0.5} color="#cfe0ff" />

      {/* table */}
      <mesh position={[0, -0.36, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[16, 64]} />
        <meshStandardMaterial color={theme.table} roughness={0.9} />
      </mesh>
      {/* frame */}
      <mesh position={[0, -0.2, 0]} receiveShadow castShadow>
        <boxGeometry args={[9.2, 0.32, 9.2]} />
        <meshStandardMaterial color={theme.frame} roughness={0.45} />
      </mesh>
      <mesh position={[0, -0.039, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[9.2, 9.2]} />
        <meshBasicMaterial map={labelTex} transparent depthWrite={false} />
      </mesh>
      {squares.map(({ sq, x, z, light }) => (
        <mesh key={sq} position={[x, -0.05, z]} receiveShadow onClick={(e) => click(e, sq)}>
          <boxGeometry args={[1, 0.1, 1]} />
          <meshStandardMaterial color={light ? theme.light : theme.dark} roughness={0.55} />
        </mesh>
      ))}

      {props.lastMove && (
        <>
          <SquareOverlay square={props.lastMove.from} color="#f6d743" opacity={0.35} />
          <SquareOverlay square={props.lastMove.to} color="#f6d743" opacity={0.45} />
        </>
      )}
      {props.selected && <SquareOverlay square={props.selected} color="#40c4ff" opacity={0.5} />}
      {props.legalTargets?.map((t) =>
        t.capture ? (
          <SquareOverlay key={`lt${t.square}`} square={t.square} color="#ff6b4a" kind="ring" />
        ) : (
          <SquareOverlay key={`lt${t.square}`} square={t.square} color="#1e88e5" kind="dot" />
        ),
      )}
      {props.marks?.map((m, i) => (
        <SquareOverlay key={`m${i}${m.square}`} square={m.square} color={m.color} kind={m.kind ?? 'ring'} />
      ))}
      <KingInCheck fen={fen} />
      {props.arrows?.map((a, i) => <ArrowMesh key={`a${i}${a.from}${a.to}`} {...a} />)}
      {props.stars?.map((s) => <Star key={`s${s}`} square={s} />)}

      {pieces.map((p) => (
        <PieceMesh key={p.id} piece={p} theme={theme} onClick={click} />
      ))}
    </>
  );
}

export default function Board3D(props: Board3DProps) {
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ fov: 42, position: [0, 10.4, 8.9], near: 0.1, far: 100 }}>
      <Scene {...props} />
      <OrbitControls
        makeDefault
        enablePan={false}
        minDistance={7}
        maxDistance={20}
        minPolarAngle={0}
        maxPolarAngle={Math.PI / 2.25}
      />
      <CameraRig orientation={props.orientation} topDown={props.topDown} />
      <TestHook />
    </Canvas>
  );
}
