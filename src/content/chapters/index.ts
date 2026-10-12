import type { ChapterStory } from '../../components/chapter/types.ts'
import { TAROCCHI } from './tarocchi.ts'

/** Projects told as a generic chapter, by portfolio.json project id. ParkiWell keeps its own teardown (TEARDOWNS). */
export const CHAPTERS: Readonly<Record<string, ChapterStory>> = { tarocchi: TAROCCHI }
