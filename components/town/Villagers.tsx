'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { WORLD_SIZE, type Walkable } from '@/utils/town'

const W = WORLD_SIZE
const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const SHIRTS = ['#b4443a', '#3f6fb0', '#4b8f4f', '#c9922e', '#7b4fa3', '#2f8f8f']
const HATS = ['#5a3b24', '#2f3f5f', '#7a2e2e', '#3d5a34']
const SKINS = ['#f0c9a3', '#d9a477', '#b98055', '#f5d7bd']

function seeded(seed: number) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

interface State {
  init: boolean
  cx: number
  cy: number
  fx: number
  fy: number
  tx: number
  ty: number
  t: number
  moving: boolean
  wait: number
  phase: number
  ang: number
}

// Pilih sel tetangga berikutnya: suka jalan, suka lurus, jarang berbalik
function pickNext(s: State, walk: Walkable, rnd: () => number): [number, number] | null {
  const opts: { x: number; y: number; w: number }[] = []
  for (const [dx, dy] of DIRS) {
    const x = s.cx + dx
    const y = s.cy + dy
    if (x < 0 || y < 0 || x >= W || y >= W || walk.grid[y * W + x] === 0) continue
    let w = 1 + (walk.roads[y * W + x] ? 3 : 0)
    if (dx === s.fx && dy === s.fy) w += 2
    if (dx === -s.fx && dy === -s.fy) w *= 0.2
    opts.push({ x, y, w })
  }
  if (opts.length === 0) return null
  let r = rnd() * opts.reduce((a, o) => a + o.w, 0)
  for (const o of opts) {
    r -= o.w
    if (r <= 0) return [o.x, o.y]
  }
  const last = opts[opts.length - 1]
  return [last.x, last.y]
}

function Villager({ seed, walk, shadows }: { seed: number; walk: Walkable; shadows: boolean }) {
  const root = useRef<Group>(null)
  const armL = useRef<Group>(null)
  const armR = useRef<Group>(null)
  const legL = useRef<Group>(null)
  const legR = useRef<Group>(null)
  const rnd = useMemo(() => seeded(seed * 7919 + 13), [seed])
  const look = useMemo(() => {
    const r = seeded(seed * 31 + 5)
    return {
      shirt: SHIRTS[Math.floor(r() * SHIRTS.length)],
      hat: HATS[Math.floor(r() * HATS.length)],
      skin: SKINS[Math.floor(r() * SKINS.length)],
    }
  }, [seed])
  const st = useRef<State>({ init: false, cx: 0, cy: 0, fx: 0, fy: 1, tx: 0, ty: 0, t: 0, moving: false, wait: 0, phase: 0, ang: 0 })

  useFrame((_, delta) => {
    const g = root.current
    if (!g) return
    const s = st.current
    const dt = Math.min(delta, 0.05)

    if (walk.cells.length === 0) {
      g.visible = false
      return
    }
    g.visible = true

    // Muncul di sel acak jika belum ada, atau sel tempatnya sekarang terhalang bangunan baru
    if (!s.init || walk.grid[s.cy * W + s.cx] === 0) {
      const idx = walk.cells[Math.floor(rnd() * walk.cells.length)]
      s.cx = idx % W
      s.cy = Math.floor(idx / W)
      s.moving = false
      s.wait = rnd()
      s.init = true
    }

    if (!s.moving) {
      s.wait -= dt
      if (s.wait <= 0) {
        const next = pickNext(s, walk, rnd)
        if (next) {
          s.tx = next[0]
          s.ty = next[1]
          s.fx = s.tx - s.cx
          s.fy = s.ty - s.cy
          s.t = 0
          s.moving = true
        } else {
          s.wait = 1
        }
      }
    } else {
      s.t += dt * 0.9 // sel per detik
      if (s.t >= 1) {
        s.cx = s.tx
        s.cy = s.ty
        s.moving = false
        s.wait = rnd() < 0.3 ? 0.6 + rnd() * 2 : 0 // kadang berhenti sebentar
      }
    }

    const x = s.cx + (s.moving ? (s.tx - s.cx) * s.t : 0) + 0.5
    const z = s.cy + (s.moving ? (s.ty - s.cy) * s.t : 0) + 0.5

    // menghadap arah jalan (dihaluskan lewat sudut terpendek)
    const target = Math.atan2(s.fx, s.fy)
    let diff = target - s.ang
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    s.ang += diff * Math.min(1, dt * 8)

    if (s.moving) s.phase += dt * 9
    const swing = s.moving ? Math.sin(s.phase) * 0.7 : 0

    g.position.set(x, s.moving ? Math.abs(Math.sin(s.phase)) * 0.025 : 0, z)
    g.rotation.y = s.ang
    if (legL.current) legL.current.rotation.x = swing
    if (legR.current) legR.current.rotation.x = -swing
    if (armL.current) armL.current.rotation.x = -swing
    if (armR.current) armR.current.rotation.x = swing
  })

  return (
    <group ref={root} visible={false}>
      {/* kaki */}
      <group ref={legL} position={[-0.05, 0.18, 0]}>
        <mesh position={[0, -0.09, 0]} castShadow={shadows}>
          <boxGeometry args={[0.06, 0.18, 0.07]} />
          <meshStandardMaterial color="#3b3b4a" />
        </mesh>
      </group>
      <group ref={legR} position={[0.05, 0.18, 0]}>
        <mesh position={[0, -0.09, 0]} castShadow={shadows}>
          <boxGeometry args={[0.06, 0.18, 0.07]} />
          <meshStandardMaterial color="#3b3b4a" />
        </mesh>
      </group>
      {/* badan */}
      <mesh position={[0, 0.3, 0]} castShadow={shadows}>
        <boxGeometry args={[0.19, 0.22, 0.11]} />
        <meshStandardMaterial color={look.shirt} />
      </mesh>
      {/* lengan */}
      <group ref={armL} position={[-0.125, 0.38, 0]}>
        <mesh position={[0, -0.08, 0]} castShadow={shadows}>
          <boxGeometry args={[0.05, 0.17, 0.05]} />
          <meshStandardMaterial color={look.shirt} />
        </mesh>
      </group>
      <group ref={armR} position={[0.125, 0.38, 0]}>
        <mesh position={[0, -0.08, 0]} castShadow={shadows}>
          <boxGeometry args={[0.05, 0.17, 0.05]} />
          <meshStandardMaterial color={look.shirt} />
        </mesh>
      </group>
      {/* kepala dan topi */}
      <mesh position={[0, 0.48, 0]} castShadow={shadows}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial color={look.skin} />
      </mesh>
      <mesh position={[0, 0.57, 0]} castShadow={shadows}>
        <coneGeometry args={[0.095, 0.1, 10]} />
        <meshStandardMaterial color={look.hat} />
      </mesh>
    </group>
  )
}

export default function Villagers({ walk, count, shadows = false }: { walk: Walkable; count: number; shadows?: boolean }) {
  // jangan terlalu ramai jika lahan yang bisa dilewati sempit
  const n = Math.max(0, Math.min(count, Math.floor(walk.cells.length / 5)))
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <Villager key={i} seed={i + 1} walk={walk} shadows={shadows} />
      ))}
    </>
  )
}
