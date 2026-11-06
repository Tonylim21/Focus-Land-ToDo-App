'use client'

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, Sky, useGLTF } from '@react-three/drei'
import { Vector3, type Group, type Material, type Mesh, type MeshStandardMaterial, type Object3D } from 'three'
import type { LandItem, TownItem } from '@/types/town'
import {
  LAYER_HEIGHT,
  MAX_LANDS,
  PLOT_SIZE,
  WORLD_SIZE,
  buildWalkable,
  footprint,
  isValidPlacement,
  landBounds,
  modelPath,
  plotOrigin,
} from '@/utils/town'
import { Model, ModelBoundary } from '@/components/town/Model'
import Villagers from '@/components/town/Villagers'

const P = PLOT_SIZE
const W = WORLD_SIZE
const H = W / 2 // semua isi dunia digeser -H supaya pusat dunia berada di titik (0,0,0)

/** Item yang sedang "dipegang" untuk dipasang / dipindah */
export interface Cursor {
  landId: string
  item: TownItem
  rotation: number
  layer: number
}

/** Kendali kamera yang bisa dipanggil dari luar scene (tombol panah, keyboard) */
export interface CameraApi {
  pan: (forward: number, right: number) => void
  reset: () => void
}

interface TownSceneProps {
  catalog: Record<string, TownItem>
  placed: LandItem[]
  landCount?: number
  interactive?: boolean // false = mode preview (putar otomatis, tidak bisa diklik)
  villagers?: boolean // penduduk yang berjalan-jalan
  selectedId?: string | null
  cursor?: Cursor | null
  apiRef?: React.MutableRefObject<CameraApi | null>
  markerRef?: React.RefObject<HTMLButtonElement | null> // tombol (+) lahan berikutnya (elemen DOM milik halaman)
  onSelect?: (landId: string | null) => void
  onPlace?: (x: number, y: number) => void
}

// Pengacak yang hasilnya selalu sama, supaya pemandangan tidak berubah tiap render
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

/* ---------------------------- Latar belakang ---------------------------- */

// Arah matahari (rendah di cakrawala = suasana senja)
const SUN_DIR: [number, number, number] = [-26, 20, -112]

function Sun() {
  return (
    <group position={SUN_DIR}>
      <mesh>
        <sphereGeometry args={[5, 24, 24]} />
        <meshBasicMaterial color="#fff2c4" fog={false} toneMapped={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[14, 24, 24]} />
        <meshBasicMaterial color="#ffd48a" transparent opacity={0.22} depthWrite={false} fog={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

function Clouds() {
  const ref = useRef<Group>(null)
  const clusters = useMemo(() => {
    const r = seeded(21)
    return Array.from({ length: 10 }, () => {
      const a = r() * Math.PI * 2
      const dist = 35 + r() * 45
      return {
        x: Math.cos(a) * dist,
        y: 16 + r() * 14,
        z: Math.sin(a) * dist,
        puffs: Array.from({ length: 5 }, () => ({
          x: (r() - 0.5) * 9,
          y: (r() - 0.5) * 1.6,
          z: (r() - 0.5) * 4,
          s: 2.2 + r() * 2.4,
        })),
      }
    })
  }, [])

  // awan bergeser pelan mengelilingi dunia
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.012
  })

  return (
    <group ref={ref}>
      {clusters.map((c, i) => (
        <group key={i} position={[c.x, c.y, c.z]}>
          {c.puffs.map((p, j) => (
            <mesh key={j} position={[p.x, p.y, p.z]} scale={[p.s * 1.4, p.s * 0.75, p.s]}>
              <sphereGeometry args={[1, 14, 14]} />
              <meshStandardMaterial color="#ffffff" emissive="#ffe6c4" emissiveIntensity={0.45} roughness={1} transparent opacity={0.92} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

function Mountains() {
  const peaks = useMemo(() => {
    const r = seeded(7)
    return Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2 + r() * 0.3
      const dist = 78 + r() * 25
      return {
        x: Math.cos(a) * dist,
        z: Math.sin(a) * dist,
        h: 14 + r() * 20,
        rad: 10 + r() * 10,
        rot: r() * Math.PI,
        shade: r() > 0.5,
      }
    })
  }, [])

  return (
    <group>
      {peaks.map((m, i) => (
        <group key={i} position={[m.x, 0, m.z]} rotation={[0, m.rot, 0]}>
          <mesh position={[0, m.h / 2 - 0.3, 0]}>
            <coneGeometry args={[m.rad, m.h, 6]} />
            <meshStandardMaterial color={m.shade ? '#6f7b66' : '#7b8577'} flatShading roughness={1} />
          </mesh>
          <mesh position={[0, m.h - 0.3 - m.h * 0.13, 0]}>
            <coneGeometry args={[m.rad * 0.26, m.h * 0.26, 6]} />
            <meshStandardMaterial color="#f1efe8" flatShading roughness={1} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Backdrop() {
  return (
    <>
      <Sky sunPosition={SUN_DIR} turbidity={9} rayleigh={2.2} mieCoefficient={0.012} mieDirectionalG={0.92} />
      <fog attach="fog" args={['#f0c89a', 50, 160]} />
      <Sun />
      <Clouds />
      <Mountains />
      {/* padang rumput di sekeliling lahan */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.32, 0]} receiveShadow>
        <circleGeometry args={[135, 64]} />
        <meshStandardMaterial color="#6e8049" roughness={1} />
      </mesh>
    </>
  )
}

/* ------------------------------- Lahan ------------------------------- */

function Plot({ index }: { index: number }) {
  const { x, z } = plotOrigin(index)
  return (
    <group position={[x, 0, z]}>
      <mesh position={[P / 2, -0.16, P / 2]} receiveShadow>
        <boxGeometry args={[P + 0.3, 0.3, P + 0.3]} />
        <meshStandardMaterial color="#8d857a" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[P / 2, 0, P / 2]} receiveShadow>
        <planeGeometry args={[P, P]} />
        <meshStandardMaterial color="#9bb06a" roughness={1} />
      </mesh>
      <gridHelper args={[P, P, '#5d6b3d', '#7d8c55']} position={[P / 2, 0.01, P / 2]} />
    </group>
  )
}

// Petak berikutnya: area transparan. Tombol (+) digambar oleh halaman (DOM biasa) dan posisinya
// dilacak oleh MarkerTracker, supaya tidak memakai Html milik drei (yang membuat root React terpisah).
function NextPlot({ index }: { index: number }) {
  const { x, z } = plotOrigin(index)
  return (
    <group position={[x, 0, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[P / 2, 0.02, P / 2]}>
        <planeGeometry args={[P, P]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.16} depthWrite={false} />
      </mesh>
    </group>
  )
}

function MarkerTracker({ position, target }: { position: [number, number, number]; target: React.RefObject<HTMLButtonElement | null> }) {
  const v = useMemo(() => new Vector3(), [])
  useFrame(({ camera, size }) => {
    const el = target.current
    if (!el) return
    v.set(position[0], position[1], position[2]).project(camera)
    if (v.z > 1) {
      el.style.display = 'none' // di belakang kamera
      return
    }
    el.style.display = 'flex'
    el.style.left = `${(v.x * 0.5 + 0.5) * size.width}px`
    el.style.top = `${(-v.y * 0.5 + 0.5) * size.height}px`
  })
  return null
}

/* ------------------------------- Item 3D ------------------------------- */

interface PlacedItemProps {
  land: LandItem
  item: TownItem
  selected: boolean
  selectable: boolean
  onSelect?: (landId: string | null) => void
}

function PlacedItem({ land, item, selected, selectable, onSelect }: PlacedItemProps) {
  const { w, d } = footprint(item, land.rotation)
  // Asumsi pivot model ada di tengah jejaknya. Jika bergeser, sesuaikan di sini.
  const x = (land.grid_x as number) + w / 2
  const z = (land.grid_y as number) + d / 2
  const y = land.layer * LAYER_HEIGHT

  return (
    <group position={[x, y, z]}>
      <group
        rotation={[0, (land.rotation * Math.PI) / 2, 0]}
        onClick={
          selectable
            ? (e: ThreeEvent<MouseEvent>) => {
                if (e.delta > 4) return // itu seretan kamera, bukan klik
                e.stopPropagation()
                onSelect?.(String(land.id))
              }
            : undefined
        }
      >
        <ModelBoundary
          fallback={
            <mesh position={[0, 0.25, 0]}>
              <boxGeometry args={[0.8, 0.5, 0.8]} />
              <meshStandardMaterial color="#94a3b8" />
            </mesh>
          }
        >
          <Suspense fallback={null}>
            <Model path={modelPath(item)} />
          </Suspense>
        </ModelBoundary>
      </group>

      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <planeGeometry args={[w, d]} />
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.5} />
        </mesh>
      )}
    </group>
  )
}

// Bayangan penempatan berupa bentuk bangunannya sendiri: kehijauan = boleh, kemerahan = bentrok
function GhostModel({ path, valid }: { path: string; valid: boolean }) {
  const { scene } = useGLTF(path)
  const obj = useMemo(() => {
    const c = scene.clone(true)
    c.traverse((o: Object3D) => {
      const m = o as Mesh
      if (!m.isMesh) return
      const tint = (mat: Material) => {
        const g = mat.clone() as MeshStandardMaterial
        g.transparent = true
        g.opacity = 0.62
        g.depthWrite = false
        if (g.emissive) {
          g.emissive.set(valid ? '#16a34a' : '#dc2626')
          g.emissiveIntensity = 0.55
        }
        return g
      }
      m.material = Array.isArray(m.material) ? m.material.map(tint) : tint(m.material)
      m.castShadow = false
      m.receiveShadow = false
    })
    return c
  }, [scene, valid])
  return <primitive object={obj} />
}

/* -------------------------------- Scene -------------------------------- */

export default function TownScene({
  catalog,
  placed,
  landCount = 1,
  interactive = false,
  villagers = true,
  selectedId = null,
  cursor = null,
  apiRef,
  markerRef,
  onSelect,
  onPlace,
}: TownSceneProps) {
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null)
  const walk = useMemo(() => buildWalkable(placed, catalog, landCount), [placed, catalog, landCount])

  // Pusat area lahan yang sudah dibeli (dalam koordinat dunia setelah digeser)
  const bounds = landBounds(landCount)
  const cx = bounds.w / 2 - H
  const cz = bounds.d / 2 - H
  const target = useMemo<[number, number, number]>(() => [cx, 1, cz], [cx, cz])
  const [camera] = useState(() => ({
    position: [cx + 3, 5.5, cz + 11] as [number, number, number],
    fov: 50,
    near: 0.1,
    far: 400,
  }))

  // Jaga agar titik fokus kamera tidak keluar dari dunia saat digeser
  const clampTarget = () => {
    const c = controls.current
    if (!c) return
    const t = c.target
    const nx = Math.min(Math.max(t.x, -H), H)
    const nz = Math.min(Math.max(t.z, -H), H)
    const dx = nx - t.x
    const dz = nz - t.z
    if (dx !== 0 || dz !== 0) {
      t.x += dx
      t.z += dz
      c.object.position.x += dx
      c.object.position.z += dz
    }
  }

  // Dipanggil dari tombol panah / keyboard di halaman
  useEffect(() => {
    if (!apiRef) return
    apiRef.current = {
      pan: (forward: number, right: number) => {
        const c = controls.current
        if (!c) return
        const t = c.target
        const cam = c.object.position
        const a = Math.atan2(cam.x - t.x, cam.z - t.z)
        const fx = -Math.sin(a)
        const fz = -Math.cos(a)
        const dx = fx * forward - fz * right
        const dz = fz * forward + fx * right
        t.x += dx
        t.z += dz
        cam.x += dx
        cam.z += dz
        clampTarget()
        c.update()
      },
      reset: () => {
        const c = controls.current
        if (!c) return
        const offX = c.object.position.x - c.target.x
        const offY = c.object.position.y - c.target.y
        const offZ = c.object.position.z - c.target.z
        c.target.set(target[0], target[1], target[2])
        c.object.position.set(target[0] + offX, target[1] + offY, target[2] + offZ)
        c.update()
      },
    }
    return () => {
      apiRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiRef, target])

  // Titik pointer (koordinat lokal dunia) -> sel kiri-atas jejak item, dijepit ke dalam dunia
  const toCell = (px: number, pz: number) => {
    if (!cursor) return null
    const { w, d } = footprint(cursor.item, cursor.rotation)
    return {
      x: Math.min(Math.max(Math.round(px - w / 2), 0), W - w),
      y: Math.min(Math.max(Math.round(pz - d / 2), 0), W - d),
    }
  }

  const check = (cell: { x: number; y: number }) =>
    cursor
      ? isValidPlacement({
          x: cell.x,
          y: cell.y,
          layer: cursor.layer,
          rotation: cursor.rotation,
          item: cursor.item,
          placed,
          catalog,
          landCount,
          ignoreId: cursor.landId,
        })
      : false

  const ghostValid = hover ? check(hover) : false
  const ghostSize = cursor ? footprint(cursor.item, cursor.rotation) : null

  return (
    <Canvas shadows={interactive ? 'percentage' : false} dpr={[1, 1.75]} camera={camera}>
      {/* Cahaya senja: matahari hangat + pantulan langit */}
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#bcd5ff', '#6b5b3a', 0.6]} />
      <directionalLight
        position={[-14, 24, -18]}
        intensity={2.2}
        color="#ffd9a3"
        castShadow={interactive}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-26}
        shadow-camera-right={26}
        shadow-camera-top={26}
        shadow-camera-bottom={-26}
        shadow-camera-far={110}
      />
      <directionalLight position={[10, 8, 16]} intensity={0.5} color="#a8c4ff" />

      <Backdrop />

      {/* Isi dunia: titik (0,0) lokal berada di pojok kiri-atas petak pertama */}
      <group position={[-H, 0, -H]}>
        {Array.from({ length: landCount }, (_, i) => (
          <Plot key={i} index={i} />
        ))}
        {interactive && landCount < MAX_LANDS && <NextPlot index={landCount} />}

        {/* Penduduk berjalan-jalan di sel yang kosong, lebih suka lewat jalan */}
        {villagers && <Villagers walk={walk} count={Math.min(2 + landCount * 2, 10)} shadows={interactive} />}

        {/* Bidang tak terlihat yang menangkap pointer di seluruh dunia */}
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[H, 0.005, H]}
          onPointerMove={
            interactive && cursor
              ? (e: ThreeEvent<PointerEvent>) => setHover(toCell(e.point.x + H, e.point.z + H))
              : undefined
          }
          onPointerOut={interactive && cursor ? () => setHover(null) : undefined}
          onClick={
            interactive
              ? (e: ThreeEvent<MouseEvent>) => {
                  if (e.delta > 4) return
                  if (cursor) {
                    const cell = toCell(e.point.x + H, e.point.z + H)
                    if (cell && check(cell)) onPlace?.(cell.x, cell.y)
                  } else {
                    onSelect?.(null) // klik lahan kosong = batal pilih
                  }
                }
              : undefined
          }
        >
          <planeGeometry args={[W, W]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>

        {/* Item terpasang */}
        {placed.map((l) => {
          const item = catalog[String(l.item_id)]
          if (!item || l.grid_x === null || l.grid_y === null) return null
          return (
            <PlacedItem
              key={String(l.id)}
              land={l}
              item={item}
              selected={selectedId === String(l.id)}
              selectable={interactive && !cursor}
              onSelect={onSelect}
            />
          )
        })}

        {/* Pratinjau penempatan: bentuk bangunan (ikut berputar dan naik lantai) + jejak di tanah */}
        {interactive && cursor && hover && ghostSize && (
          <group position={[hover.x + ghostSize.w / 2, cursor.layer * LAYER_HEIGHT, hover.y + ghostSize.d / 2]}>
            <group rotation={[0, (cursor.rotation * Math.PI) / 2, 0]}>
              <ModelBoundary fallback={null}>
                <Suspense fallback={null}>
                  <GhostModel path={modelPath(cursor.item)} valid={ghostValid} />
                </Suspense>
              </ModelBoundary>
            </group>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
              <planeGeometry args={[ghostSize.w, ghostSize.d]} />
              <meshBasicMaterial color={ghostValid ? '#22c55e' : '#ef4444'} transparent opacity={0.4} depthWrite={false} />
            </mesh>
          </group>
        )}
      </group>

      {interactive && markerRef && landCount < MAX_LANDS && (
        <MarkerTracker
          target={markerRef}
          position={[plotOrigin(landCount).x + P / 2 - H, 0.8, plotOrigin(landCount).z + P / 2 - H]}
        />
      )}

      <OrbitControls
        ref={controls}
        target={target}
        enablePan={interactive}
        screenSpacePanning={false}
        onChange={clampTarget}
        enableZoom={interactive}
        enableRotate={interactive}
        autoRotate={!interactive}
        autoRotateSpeed={1.2}
        minDistance={6}
        maxDistance={60}
        minPolarAngle={0.25}
        maxPolarAngle={Math.PI / 2 - 0.04}
      />
    </Canvas>
  )
}
