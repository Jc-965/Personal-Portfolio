import { Box3, Matrix4, Vector3, type Mesh, type Object3D, type InstancedMesh } from 'three'
import { PLATFORMS, WALK_BOUNDS, SKY_DECK } from '../gridConfig'
import type { Collider, CollisionWorld, WalkSurface } from './collision'

/** Static rendered solids are the collision source, including instanced buildings. */
export function collectCollisionWorld(scene: Object3D): CollisionWorld {
  const colliders: Collider[] = []
  const box = new Box3()
  const matrix = new Matrix4()
  const combined = new Matrix4()
  scene.updateMatrixWorld(true)
  const addBox = (mesh: Mesh, transform: Matrix4) => {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
    if (!mesh.geometry.boundingBox) return
    box.copy(mesh.geometry.boundingBox).applyMatrix4(transform)
    if (box.max.y - box.min.y < 0.04 || !Number.isFinite(box.min.x)) return
    colliders.push({ min: box.min.toArray(), max: box.max.toArray(), name: mesh.name })
  }
  scene.traverse(object => {
    const mesh = object as Mesh
    if (!mesh.isMesh || !mesh.geometry || mesh.userData.noCollision) return
    const instanced = mesh as InstancedMesh
    if (instanced.isInstancedMesh && mesh.geometry.getAttribute('aDims')) {
      for (let i = 0; i < instanced.count; i++) {
        instanced.getMatrixAt(i, matrix)
        combined.multiplyMatrices(mesh.matrixWorld, matrix)
        addBox(mesh, combined)
      }
    } else if (mesh.castShadow && !instanced.isInstancedMesh && /Box|Cylinder/.test(mesh.geometry.type)) {
      // Decorative translucent holograms are never movement blockers.
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      if (materials.some(material => material.transparent && material.opacity < 0.65)) return
      addBox(mesh, mesh.matrixWorld)
    }
  })
  const surfaces: WalkSurface[] = [
    ...[-1, 1].map(side => ({ minX: side < 0 ? -12.2 : 9.7, maxX: side < 0 ? -9.7 : 12.2, minZ: -235, maxZ: 46, y: 0.22 })),
    ...PLATFORMS.flatMap(platform => [platform.stair,
      { minX: 3.5, maxX: 11.6, minZ: platform.z - 5, maxZ: platform.z + 8, y: platform.y },
    ]),
    { minX: SKY_DECK.x - SKY_DECK.size / 2, maxX: SKY_DECK.x + SKY_DECK.size / 2, minZ: SKY_DECK.z - SKY_DECK.size / 2, maxZ: SKY_DECK.z + SKY_DECK.size / 2, y: 35.5 },
  ]
  return { bounds: WALK_BOUNDS, colliders, surfaces }
}

/** First-person rays can pick floors but never target the back of a wall. */
export const groundNormal = new Vector3(0, 1, 0)
