import { lazy, Suspense } from 'react'
import type { GridTier } from '../../gridPerformance'
const Crowd = lazy(() => import('./Crowd'))
const Vehicles = lazy(() => import('./Vehicles'))
const Trains = lazy(() => import('./Vehicles').then(module => ({ default: module.Trains })))
const WeatherLife = lazy(() => import('./WeatherLife'))
const AdLife = lazy(() => import('./AdLife'))
const StreetMotion = lazy(() => import('./StreetMotion'))
export default function LivingWorld({ tier, reducedMotion }: { tier: GridTier; reducedMotion: boolean }) {
  return <Suspense fallback={null}>
    <Crowd tier={tier} />
    <Vehicles tier={tier} />
    <Trains />
    <WeatherLife tier={tier} reducedMotion={reducedMotion} />
    <AdLife />
    <StreetMotion />
  </Suspense>
}
