'use client'

import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { Box3, Vector3, type Group } from 'three'
import { Model, ModelBoundary } from '@/components/town/Model'

// Model diskalakan dan dipusatkan otomatis, lalu berputar seperti globe
function Spinner({ path }: { path: string }) {
  const { scene } = useGLTF(path)
  const spin = useRef<Group>(null)
  const fit = useMemo(() => {
    const box = new Box3().setFromObject(scene)
    const size = box.getSize(new Vector3())
    const center = box.getCenter(new Vector3())
    const scale = 2.2 / Math.max(size.x, size.y, size.z, 0.001)
    return { scale, center }
  }, [scene])

  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.y += dt * 0.9
  })

  return (
    <group ref={spin}>
      <group
        scale={fit.scale}
        position={[-fit.center.x * fit.scale, -fit.center.y * fit.scale, -fit.center.z * fit.scale]}
      >
        <Model path={path} />
      </group>
    </group>
  )
}

export default function ItemPreview({ path }: { path: string }) {
  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [3.2, 2.6, 3.2], fov: 35 }}>
      <ambientLight intensity={0.9} />
      <hemisphereLight args={['#dbe7ff', '#6b5b3a', 0.7]} />
      <directionalLight position={[4, 6, 3]} intensity={2} color="#fff0d2" />
      <ModelBoundary fallback={null}>
        <Suspense fallback={null}>
          <Spinner key={path} path={path} />
        </Suspense>
      </ModelBoundary>
    </Canvas>
  )
}
