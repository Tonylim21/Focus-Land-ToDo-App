'use client'

import React, { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import type { Mesh, Object3D } from 'three'

// Kalau satu file model gagal dimuat, hanya item itu yang diganti kotak abu-abu
export class ModelBoundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export function Model({ path }: { path: string }) {
  const { scene } = useGLTF(path)
  // clone supaya model yang sama bisa dipakai berkali-kali
  const obj = useMemo(() => {
    const c = scene.clone(true)
    c.traverse((o: Object3D) => {
      const m = o as Mesh
      if (m.isMesh) {
        m.castShadow = true
        m.receiveShadow = true
      }
    })
    return c
  }, [scene])
  return <primitive object={obj} />
}
