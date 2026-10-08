import type { TeardownStory } from './types.ts'
import { PARKIWELL } from './parkiwell.ts'

/** Projects told as a teardown chapter, by portfolio.json project id. Others keep their gallery scene. */
export const TEARDOWNS: Readonly<Record<string, TeardownStory>> = { parkiwell: PARKIWELL }
