import portfolio from './portfolio.json' with { type: 'json' }

export interface ProjectImage { src: string; label: string; alt: string; aspect: string }
export interface ProjectStat { label: string; value: string }
export interface StoryStep { step: string; image?: number }
export interface Story {
  role: string
  problem: { was: string[]; needed: string[] }
  build: StoryStep[]
  proof: string[]
  links?: { live?: string; repo?: string }
}
export interface Project {
  id: string
  name: string
  tag: string
  accent: string
  accentRgb: string
  kind: 'media' | 'code'
  lead: string
  blurb: string
  bullets: string[]
  tech: string[]
  stats: ProjectStat[]
  images?: ProjectImage[]
  terminal?: string[]
  frame?: 'window' | 'phone'
  imageVariant?: 'browser' | 'terminal'
  story: Story
}

export const projects = portfolio.projects as unknown as Project[]
export const profile = portfolio.profile

const isText = (value: unknown) => typeof value === 'string' && value.trim().length > 0
const isTextList = (value: unknown, min: number) => Array.isArray(value) && value.length >= min && value.every(isText)

/** Returns the problems with a project's content, empty when it is complete. */
export function validateProject(input: unknown): string[] {
  const problems: string[] = []
  const project = (input ?? {}) as Partial<Project>
  const where = project.id ?? '(no id)'
  if (!isText(project.blurb)) problems.push(`${where}: blurb is missing`)
  if ((project.blurb ?? '').split(/[.!?]\s/).length > 2) problems.push(`${where}: blurb is longer than two sentences`)
  const story = (project.story ?? {}) as Partial<Story>
  if (!isText(story.role)) problems.push(`${where}: story.role is missing`)
  if (!isTextList(story.problem?.was, 1)) problems.push(`${where}: story.problem.was needs one to three lines`)
  if (!isTextList(story.problem?.needed, 1)) problems.push(`${where}: story.problem.needed needs one to three lines`)
  const build = Array.isArray(story.build) ? story.build : []
  if (build.length < 2 || build.length > 4) problems.push(`${where}: story.build needs two to four steps`)
  build.forEach((step, i) => {
    if (!isText(step?.step)) problems.push(`${where}: story.build[${i}].step is missing`)
    if (step?.image !== undefined && !(project.images ?? [])[step.image]) problems.push(`${where}: story.build[${i}].image points at no screenshot`)
  })
  if (!isTextList(story.proof, 1)) problems.push(`${where}: story.proof needs at least one line`)
  return problems
}

/** What a row or a next panel shows for the project. */
export function coverOf(project: Project) {
  const first = project.images?.[0]
  if (first) {
    const [w, h] = first.aspect.split('/').map(Number)
    return { src: first.src, alt: first.alt, aspect: first.aspect, portrait: h > w }
  }
  return { alt: `${project.name} terminal`, aspect: '16 / 10', portrait: false, terminal: project.terminal ?? [] }
}
