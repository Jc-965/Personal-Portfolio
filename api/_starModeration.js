import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity'

export const MAX_STAR_MESSAGE_LENGTH = 50

// The largest legitimate payload is a ~50-char message plus a starKey and
// sessionId, so a few KB is generous. Anything larger is rejected before we
// buffer it, so a client can't stream an unbounded body into memory.
const MAX_BODY_BYTES = 4096

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
})

// Evaders split a word into short separator-delimited fragments ("f u c k",
// "f.u.c.k", "b1 tch"). obscenity deliberately keeps word boundaries intact
// (its skipNonAlphabetic transformer is disabled upstream), so those slip past
// a plain match. This rejoins runs of short fragments and lets the matcher see
// the reconstructed word. Real sentences don't contain long runs of 1-2 char
// tokens that spell a slur, so this adds no measurable false positives.
const MAX_OBFUSCATION_FRAGMENT = 2

function collapseObfuscationRuns(message) {
  const tokens = message.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const result = []
  let run = []

  const flushRun = () => {
    if (run.length >= 2) result.push(run.join(''))
    else result.push(...run)
    run = []
  }

  for (const token of tokens) {
    if ([...token].length <= MAX_OBFUSCATION_FRAGMENT) {
      run.push(token)
    } else {
      flushRun()
      result.push(token)
    }
  }
  flushRun()

  return result.join(' ')
}

function payloadTooLarge() {
  return Object.assign(new Error('payload_too_large'), { statusCode: 413 })
}

export async function readJson(request) {
  if (request.body && typeof request.body === 'object') return request.body
  if (typeof request.body === 'string') {
    if (Buffer.byteLength(request.body) > MAX_BODY_BYTES) throw payloadTooLarge()
    return JSON.parse(request.body || '{}')
  }

  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > MAX_BODY_BYTES) throw payloadTooLarge()
    chunks.push(Buffer.from(chunk))
  }

  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

export function isAllowedStarMessage(message) {
  if (matcher.hasMatch(message)) return false

  const collapsed = collapseObfuscationRuns(message)
  if (collapsed !== message && matcher.hasMatch(collapsed)) return false

  return true
}
