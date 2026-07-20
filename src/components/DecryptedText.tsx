import { useEffect, useRef, useState } from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'

const styles = {
  wrapper: {
    display: 'inline-block',
    whiteSpace: 'pre-wrap',
  } as const,
  srOnly: {
    position: 'absolute' as const,
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0,0,0,0)',
    border: 0,
  } as const,
}

interface DecryptedTextProps extends HTMLMotionProps<'span'> {
  text: string
  speed?: number
  maxIterations?: number
  sequential?: boolean
  revealDirection?: 'start' | 'end' | 'center'
  useOriginalCharsOnly?: boolean
  characters?: string
  className?: string
  parentClassName?: string
  encryptedClassName?: string
  animateOn?: 'view' | 'hover' | 'both'
}

export default function DecryptedText({
  text,
  speed = 50,
  maxIterations = 10,
  sequential = false,
  revealDirection = 'start',
  useOriginalCharsOnly = false,
  characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()_+',
  className = '',
  parentClassName = '',
  encryptedClassName = '',
  animateOn = 'hover',
  ...props
}: DecryptedTextProps) {
  const [displayText, setDisplayText] = useState(text)
  const [isHovering, setIsHovering] = useState(false)
  const [isScrambling, setIsScrambling] = useState(false)
  const [revealedIndices, setRevealedIndices] = useState<Set<number>>(new Set())
  const [hasAnimated, setHasAnimated] = useState(false)
  const containerRef = useRef<HTMLSpanElement>(null)

  /* eslint-disable react-hooks/set-state-in-effect -- This effect is the animation
     controller: interaction deliberately resets scrambling state before timers run. */
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>
    let currentIteration = 0

    const getNextIndex = (revealedSet: Set<number>) => {
      const textLength = text.length

      switch (revealDirection) {
        case 'start':
          return revealedSet.size
        case 'end':
          return textLength - 1 - revealedSet.size
        case 'center': {
          const middle = Math.floor(textLength / 2)
          const offset = Math.floor(revealedSet.size / 2)
          const nextIndex =
            revealedSet.size % 2 === 0 ? middle + offset : middle - offset - 1

          if (nextIndex >= 0 && nextIndex < textLength && !revealedSet.has(nextIndex)) {
            return nextIndex
          }

          for (let i = 0; i < textLength; i += 1) {
            if (!revealedSet.has(i)) return i
          }
          return 0
        }
        default:
          return revealedSet.size
      }
    }

    const availableChars = useOriginalCharsOnly
      ? Array.from(new Set(text.split(''))).filter(char => char !== ' ')
      : characters.split('')

    const shuffleText = (originalText: string, currentRevealed: Set<number>) => {
      if (useOriginalCharsOnly) {
        const positions = originalText.split('').map((char, index) => ({
          char,
          isSpace: char === ' ',
          index,
          isRevealed: currentRevealed.has(index),
        }))

        const nonSpaceChars = positions
          .filter(position => !position.isSpace && !position.isRevealed)
          .map(position => position.char)

        for (let i = nonSpaceChars.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[nonSpaceChars[i], nonSpaceChars[j]] = [nonSpaceChars[j], nonSpaceChars[i]]
        }

        let charIndex = 0

        return positions
          .map(position => {
            if (position.isSpace) return ' '
            if (position.isRevealed) return originalText[position.index]
            const nextChar = nonSpaceChars[charIndex]
            charIndex += 1
            return nextChar
          })
          .join('')
      }

      return originalText
        .split('')
        .map((char, index) => {
          if (char === ' ') return ' '
          if (currentRevealed.has(index)) return originalText[index]
          return availableChars[Math.floor(Math.random() * availableChars.length)]
        })
        .join('')
    }

    if (isHovering) {
      setIsScrambling(true)
      interval = setInterval(() => {
        setRevealedIndices(previousRevealed => {
          if (sequential) {
            if (previousRevealed.size < text.length) {
              const nextIndex = getNextIndex(previousRevealed)
              const nextRevealed = new Set(previousRevealed)
              nextRevealed.add(nextIndex)
              setDisplayText(shuffleText(text, nextRevealed))
              return nextRevealed
            }

            clearInterval(interval)
            setIsScrambling(false)
            return previousRevealed
          }

          setDisplayText(shuffleText(text, previousRevealed))
          currentIteration += 1

          if (currentIteration >= maxIterations) {
            clearInterval(interval)
            setIsScrambling(false)
            setDisplayText(text)
          }

          return previousRevealed
        })
      }, speed)
    } else {
      setDisplayText(text)
      setRevealedIndices(new Set())
      setIsScrambling(false)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [
    characters,
    isHovering,
    maxIterations,
    revealDirection,
    sequential,
    speed,
    text,
    useOriginalCharsOnly,
  ])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (animateOn !== 'view' && animateOn !== 'both') return

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting && !hasAnimated) {
            setIsHovering(true)
            setHasAnimated(true)
          }
        })
      },
      {
        root: null,
        rootMargin: '0px',
        threshold: 0.1,
      },
    )

    const currentElement = containerRef.current
    if (currentElement) observer.observe(currentElement)

    return () => {
      if (currentElement) observer.unobserve(currentElement)
    }
  }, [animateOn, hasAnimated])

  const hoverProps =
    animateOn === 'hover' || animateOn === 'both'
      ? {
          onMouseEnter: () => setIsHovering(true),
          onMouseLeave: () => setIsHovering(false),
        }
      : {}

  return (
    <motion.span
      ref={containerRef}
      className={parentClassName}
      style={styles.wrapper}
      {...hoverProps}
      {...props}
    >
      <span style={styles.srOnly}>{displayText}</span>
      <span aria-hidden="true">
        {displayText.split('').map((char, index) => {
          const isRevealedOrDone =
            revealedIndices.has(index) || !isScrambling || !isHovering

          return (
            <span
              key={`${index}-${char}`}
              className={isRevealedOrDone ? className : encryptedClassName}
            >
              {char}
            </span>
          )
        })}
      </span>
    </motion.span>
  )
}
