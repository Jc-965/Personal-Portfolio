import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mulberry32 } from './rand'
import { content, gantryZ, PROJECT_SITES, STREET, WALL_EXCLUSIONS } from '../gridConfig'

/**
 * Vertical katakana/kanji neon banners hung down the avenue's walls — the
 * signature texture of a Japanese cyberpunk street. Text renders vertically
 * (one glyph per line) into canvas textures; a handful of banner designs are
 * instanced along both kerbs, each with its own accent, flicker phase, and
 * subtle emissive pulse.
 */

const BANNER_TEXTS = ['ネオン', '電脳都市', 'データ', '未来', '夜市', '歓迎', 'ラーメン', '接続中']
const BANNER_COLORS = ['#ff2d78', '#00ffff', '#ffcc00', '#7efcff', '#ff8a3c', '#b287ff', '#00ff9d', '#ff5a5a']

interface BannerDesign {
  texture: THREE.CanvasTexture
  aspect: number
}

function makeBannerTexture(text: string, accent: string): BannerDesign {
  const glyphs = [...text]
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128 * (glyphs.length + 1)
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = 'rgba(4, 8, 14, 0.92)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = accent
    ctx.lineWidth = 5
    ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12)
    ctx.font = '700 92px "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = accent
    ctx.shadowBlur = 26
    ctx.fillStyle = '#f4ffff'
    glyphs.forEach((glyph, i) => {
      ctx.fillText(glyph, canvas.width / 2, 128 * (i + 1))
      ctx.fillText(glyph, canvas.width / 2, 128 * (i + 1))
    })
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return { texture, aspect: canvas.width / canvas.height }
}

interface BannerPlacement {
  x: number
  y: number
  z: number
  rotationY: number
  design: number
  scale: number
  flicker: number
}

export default function NeonBanners() {
  const { group, materials, designs } = useMemo(() => {
    const rng = mulberry32(60606)
    const designs = BANNER_TEXTS.map((text, i) => makeBannerTexture(text, BANNER_COLORS[i]))
    const materials = designs.map(
      design =>
        new THREE.MeshBasicMaterial({
          map: design.texture,
          transparent: true,
          side: THREE.DoubleSide,
        }),
    )

    const placements: BannerPlacement[] = []
    // Signage keeps clear of the story landmarks: role gantries, project
    // marquees, and the frontages signature structures own.
    const gantryZs = content.experiences.map((_, i) => gantryZ(i))
    const clearOfLandmarks = (side: number, z: number) => {
      if (gantryZs.some(gz => Math.abs(z - gz) < 2.6)) return false
      if (PROJECT_SITES.some(site => site.side === side && Math.abs(z - site.z) < 7)) return false
      if (WALL_EXCLUSIONS.some(rect => rect.side === side && z > rect.zMin - 2 && z < rect.zMax + 2)) return false
      return true
    }

    // March both sidewalks, banners bracketed off the wall faces at varied
    // heights — the dense perpendicular shop signage of a night market street.
    for (let z = 44; z > STREET.zEnd; z -= 6.5) {
      for (const side of [-1, 1]) {
        if (rng() > 0.68) continue
        if (!clearOfLandmarks(side, z)) continue
        const x = side * (9.9 + rng() * 1.6)
        placements.push({
          x,
          y: 3.2 + rng() * 6.8,
          z,
          rotationY: side > 0 ? -Math.PI / 2 : Math.PI / 2,
          design: Math.floor(rng() * designs.length),
          scale: 0.8 + rng() * 0.7,
          flicker: rng() * 10,
        })
      }
    }

    const group = new THREE.Group()
    for (const p of placements) {
      const design = designs[p.design]
      const height = 4.6 * p.scale
      const geometry = new THREE.PlaneGeometry(height * design.aspect, height)
      const mesh = new THREE.Mesh(geometry, materials[p.design])
      mesh.position.set(p.x, p.y + height / 2, p.z)
      mesh.rotation.y = p.rotationY
      mesh.userData.flicker = p.flicker
      group.add(mesh)
    }
    return { group, materials, designs }
  }, [])

  useEffect(() => () => {
    group.traverse(o => {
      if (o instanceof THREE.Mesh) o.geometry.dispose()
    })
    for (const material of materials) material.dispose()
    for (const design of designs) design.texture.dispose()
  }, [group, materials, designs])

  // Two banner designs flicker like dying tubes — city texture, not strobe.
  useFrame(state => {
    const t = state.clock.elapsedTime
    materials[1].opacity = 0.7 + 0.3 * Math.max(0.25, Math.sin(t * 6.7) * Math.sin(t * 1.3))
    materials[4].opacity = 0.7 + 0.3 * Math.max(0.2, Math.sin(t * 8.1 + 2.0) * Math.sin(t * 0.9 + 1.0))
  })

  return <primitive object={group} />
}
