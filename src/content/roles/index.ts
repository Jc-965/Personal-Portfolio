import type { RoleStory } from '../../components/roles/types.ts'
import { SCOTTYLABS_AI } from './scottylabs-ai.ts'
import { BLUE_SHIELD } from './blue-shield.ts'
import { SORCEA } from './sorcea.ts'
import { CMUMAPS } from './cmumaps.ts'
import { GCS } from './gcs.ts'
import { CODING_MINDS } from './coding-minds.ts'
import { SOFTCOM } from './softcom.ts'

/** Every role's story, by portfolio.json experience id. The section joins each to its portfolio.json facts. */
export const ROLE_STORIES: Readonly<Record<string, RoleStory>> = { 'scottylabs-ai': SCOTTYLABS_AI, 'blue-shield': BLUE_SHIELD, 'sorcea': SORCEA, 'cmumaps': CMUMAPS, 'gcs': GCS, 'coding-minds': CODING_MINDS, 'softcom': SOFTCOM }
