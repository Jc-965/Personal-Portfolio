/** Small WebGL2 helpers. Every function throws on failure so the caller can fall back. */

export function createProgram(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const program = gl.createProgram()
  if (!program) throw new Error('createProgram failed')
  const shaders: WebGLShader[] = []
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
      const shader = gl.createShader(type)
      if (!shader) throw new Error('createShader failed')
      shaders.push(shader)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(`shader compile failed: ${gl.getShaderInfoLog(shader)}`)
      }
      gl.attachShader(program, shader)
    }
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`program link failed: ${gl.getProgramInfoLog(program)}`)
    return program
  } catch (error) {
    gl.deleteProgram(program)
    throw error
  } finally {
    for (const shader of shaders) gl.deleteShader(shader)
  }
}

export function createTexture(gl: WebGL2RenderingContext, filter: number): WebGLTexture {
  const texture = gl.createTexture()
  if (!texture) throw new Error('createTexture failed')
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return texture
}

/** Collects uniform locations once so the frame loop never queries by name. */
export function uniformsOf<K extends string>(gl: WebGL2RenderingContext, program: WebGLProgram, names: readonly K[]): Record<K, WebGLUniformLocation | null> {
  const out = {} as Record<K, WebGLUniformLocation | null>
  for (const name of names) out[name] = gl.getUniformLocation(program, name)
  return out
}
