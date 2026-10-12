import type { ChapterStory } from '../../components/chapter/types.ts'
import { AGORIAI } from './agoriai.ts'
import { TAROCCHI } from './tarocchi.ts'

/** Projects told as a generic chapter, by portfolio.json project id. ParkiWell keeps its own teardown (TEARDOWNS). */
export const CHAPTERS: Readonly<Record<string, ChapterStory>> = { agoriai: AGORIAI, tarocchi: TAROCCHI }
