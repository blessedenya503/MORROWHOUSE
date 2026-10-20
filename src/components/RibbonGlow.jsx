import { useEffect, useRef } from 'react'

const MAX_DPR = 1.5
const LAYERS = 64
const TWIST = 1.25
const DRAG = 0.18

const VERT_SRC = `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() { gl_Position = vec4(P[gl_VertexID], 0.0, 1.0); }
`

const FIELD_SRC = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uC1;
uniform vec3 uC2;
uniform float uSize;
uniform float uAngle;
uniform vec2 uMouse;
uniform float uOn;
uniform float uReach;
uniform vec2 uVel;
out vec4 o;

const float TAU = 6.28318530718;
const float LAYERS = ${LAYERS.toFixed(1)};
const float TWIST = ${TWIST.toFixed(3)};
const float DRAG = ${DRAG.toFixed(3)};
const float GAIN = 0.62;
const vec2 CENTRE = vec2(-0.62, 0.24);
const float TILT = 0.6;
const float ZOOM = 1.05;
const float THETA = 2.13;
const float SHEAR = 0.963;
const float SHRINK = 0.953;
const vec2 WARP_FREQ = vec2(0.42, 2.4);
const vec2 WARP_AMP = vec2(0.13, 0.027);
const vec2 ASPECT = vec2(2.1, 0.17);
const float OFFSET = 0.36;
const float GLOW = 0.0021;
const float SOFT = 0.0019;
const float FALLOFF = 0.37;
const float PHASE = 12.0;
const float CYCLE = 0.16;
const float HUE_TRAVEL = 2.0;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

void main() {
  vec2 R = uRes;
  vec2 pos = (gl_FragCoord.xy - 0.5 * R) / R.y;
  vec2 d = pos - uMouse;
  float w = uOn * exp(-dot(d, d) / (uReach * uReach));
  if (w > 1e-4) pos = uMouse + rot(w * TWIST) * d * (1.0 - 0.3 * min(w, 1.0)) - uVel * min(w, 1.0) * DRAG;
  pos = rot(uAngle) * pos / uSize;
  float t = uTime * 0.49 + PHASE;
  float breath = (-sin(uTime * 0.735) + sin(uTime * 0.49 + 1.0)) * 0.25 + 0.5;
  vec2 u = rot(TILT) * ((pos - CENTRE) * (ZOOM - breath * 0.085));
  mat2 fold = mat2(cos(THETA), sin(THETA), -SHEAR, cos(THETA));
  vec3 col = vec3(0.0);
  for (float i = 1.0; i <= LAYERS; i += 1.0) {
    u.x -= sin(u.y * WARP_FREQ.x + t + i * 0.007) * WARP_AMP.x;
    u.y -= sin(u.x * WARP_FREQ.y - t + i * 0.02) * WARP_AMP.y;
    u = fold * u * SHRINK;
    vec2 q = (u - vec2(OFFSET + breath * 0.1, 0.0)) * ASPECT;
    float g = GLOW / (dot(q, q) + SOFT) * (0.25 + breath * 0.4);
    float r = length(u);
    float k = sin(i * CYCLE + t * 1.2 + r * HUE_TRAVEL) * 0.5 + 0.5;
    col += g * mix(uC1, uC2, k) * (0.62 + 0.5 * k) * exp2(-r * FALLOFF);
  }
  vec3 x = max(col * GAIN, 0.0);
  col = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  col = pow(clamp(col, 0.0, 1.0), vec3(0.85, 0.92, 0.98));
  col *= 1.0 - smoothstep(0.5, 1.6, length(pos)) * 0.07;
  o = vec4(col, 1.0);
}
`

const FINISH_SRC = `#version 300 es
precision highp float;
uniform sampler2D uField;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uBg;
uniform float uPaper;
out vec4 o;

float ign(vec2 p, float f) { p += 5.588238 * mod(f, 64.0); return fract(52.9829189 * fract(0.06711056 * p.x + 0.00583715 * p.y)); }

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec3 L = max(texture(uField, frag / uRes).rgb, 0.0);
  vec3 dark = uBg + L * (1.0 - uBg);
  float strength = clamp(max(L.r, max(L.g, L.b)), 0.0, 1.0);
  vec3 paper = uBg * (1.0 - strength) + L * 0.96;
  vec3 col = mix(dark, paper, uPaper);
  col += (ign(frag, floor(uTime * 24.0)) - 0.5) / 255.0;
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`

function parseHex(input, fallback) {
  const value = input?.trim().replace('#', '') || fallback.replace('#', '')
  const hex = value.length === 3 ? value.split('').map((part) => part + part).join('') : value
  const channels = [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
  return channels.every(Number.isFinite) ? channels : parseHex(fallback, '#fbfaf7')
}

function createProgram(gl, fragmentSource) {
  const compile = (type, source) => {
    const shader = gl.createShader(type)
    if (!shader) return null
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader)
      return null
    }
    return shader
  }

  const vertex = compile(gl.VERTEX_SHADER, VERT_SRC)
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource)
  if (!vertex || !fragment) {
    if (vertex) gl.deleteShader(vertex)
    if (fragment) gl.deleteShader(fragment)
    return null
  }

  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return null
  }
  return program
}

function createTarget(gl) {
  const framebuffer = gl.createFramebuffer()
  let texture = null
  let width = 0
  let height = 0

  return {
    framebuffer,
    texture: () => texture,
    resize(nextWidth, nextHeight) {
      if (nextWidth === width && nextHeight === height && texture) return
      if (texture) gl.deleteTexture(texture)
      texture = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, nextWidth, nextHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      width = nextWidth
      height = nextHeight
    },
    dispose() {
      if (texture) gl.deleteTexture(texture)
      if (framebuffer) gl.deleteFramebuffer(framebuffer)
    },
  }
}

function trackPointer(root) {
  const pointer = { x: 0, y: 0, inside: false }
  const read = (event) => {
    const rect = root.getBoundingClientRect()
    pointer.x = event.clientX - rect.left
    pointer.y = event.clientY - rect.top
    pointer.inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
  }
  const clear = (event) => {
    if (!event.relatedTarget) pointer.inside = false
  }
  window.addEventListener('pointermove', read, { passive: true })
  document.addEventListener('pointerout', clear)
  return {
    pointer,
    dispose() {
      window.removeEventListener('pointermove', read)
      document.removeEventListener('pointerout', clear)
    },
  }
}

export default function RibbonGlow({
  style,
  background = '#fbfaf7',
  color1 = '#a57e63',
  color2 = '#743f3b',
  speed = 1,
  size = 1,
  angle = -Math.PI,
  hover = 1,
  reach = 240,
}) {
  const rootRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    if (!root || !canvas) return

    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false })
    if (!gl) return

    const field = createProgram(gl, FIELD_SRC)
    const finish = createProgram(gl, FINISH_SRC)
    if (!field || !finish) {
      if (field) gl.deleteProgram(field)
      if (finish) gl.deleteProgram(finish)
      return
    }

    const fieldUniforms = Object.fromEntries(['uRes', 'uTime', 'uC1', 'uC2', 'uSize', 'uAngle', 'uMouse', 'uOn', 'uReach', 'uVel'].map((name) => [name, gl.getUniformLocation(field, name)]))
    const finishUniforms = Object.fromEntries(['uField', 'uRes', 'uTime', 'uBg', 'uPaper'].map((name) => [name, gl.getUniformLocation(finish, name)]))
    const vertexArray = gl.createVertexArray()
    gl.bindVertexArray(vertexArray)
    const target = createTarget(gl)
    const pointerTrack = trackPointer(root)
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let lastTime = -1
    let clock = 0
    let visible = true
    let disposed = false

    const render = (now) => {
      frame = 0
      if (disposed) return
      const delta = lastTime < 0 ? 0 : Math.min((now - lastTime) / 1000, 0.05)
      lastTime = now
      if (!media.matches) clock = (clock + delta * Math.max(0, speed)) % 3600

      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      const width = Math.max(1, Math.round(root.clientWidth * dpr))
      const height = Math.max(1, Math.round(root.clientHeight * dpr))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      const fieldWidth = Math.max(1, Math.round(width / 2))
      const fieldHeight = Math.max(1, Math.round(height / 2))
      target.resize(fieldWidth, fieldHeight)

      const pointer = pointerTrack.pointer
      const mouseX = pointer.inside ? pointer.x : root.clientWidth / 2
      const mouseY = pointer.inside ? pointer.y : root.clientHeight / 2
      const bg = parseHex(background, '#fbfaf7')
      const first = parseHex(color1, '#a57e63')
      const second = parseHex(color2, '#743f3b')
      const bgLum = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer)
      gl.viewport(0, 0, fieldWidth, fieldHeight)
      gl.useProgram(field)
      gl.uniform2f(fieldUniforms.uRes, fieldWidth, fieldHeight)
      gl.uniform1f(fieldUniforms.uTime, clock)
      gl.uniform3f(fieldUniforms.uC1, ...first)
      gl.uniform3f(fieldUniforms.uC2, ...second)
      gl.uniform1f(fieldUniforms.uSize, Math.max(0.5, size))
      gl.uniform1f(fieldUniforms.uAngle, angle)
      gl.uniform2f(fieldUniforms.uMouse, (mouseX - root.clientWidth / 2) / root.clientHeight, (root.clientHeight / 2 - mouseY) / root.clientHeight)
      gl.uniform1f(fieldUniforms.uOn, (pointer.inside ? hover : 0) * (media.matches ? 0 : 1))
      gl.uniform1f(fieldUniforms.uReach, reach / root.clientHeight)
      gl.uniform2f(fieldUniforms.uVel, 0, 0)
      gl.drawArrays(gl.TRIANGLES, 0, 3)

      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, width, height)
      gl.useProgram(finish)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, target.texture())
      gl.uniform1i(finishUniforms.uField, 0)
      gl.uniform2f(finishUniforms.uRes, width, height)
      gl.uniform1f(finishUniforms.uTime, clock)
      gl.uniform3f(finishUniforms.uBg, ...bg)
      gl.uniform1f(finishUniforms.uPaper, Math.min(1, Math.max(0, (bgLum - 0.35) / 0.3)))
      gl.drawArrays(gl.TRIANGLES, 0, 3)

      if (!media.matches && !document.hidden && visible) frame = requestAnimationFrame(render)
    }

    const schedule = () => {
      if (!disposed && !frame && !document.hidden && visible) frame = requestAnimationFrame(render)
    }
    const observer = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting
          if (visible) schedule()
          else if (frame) {
            cancelAnimationFrame(frame)
            frame = 0
          }
        })
    observer?.observe(root)

    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    resizeObserver?.observe(root)
    const handleVisibility = () => schedule()
    const handleMotionPreference = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      lastTime = -1
      schedule()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    media.addEventListener?.('change', handleMotionPreference)
    schedule()

    return () => {
      disposed = true
      if (frame) cancelAnimationFrame(frame)
      observer?.disconnect()
      resizeObserver?.disconnect()
      document.removeEventListener('visibilitychange', handleVisibility)
      media.removeEventListener?.('change', handleMotionPreference)
      pointerTrack.dispose()
      target.dispose()
      gl.deleteVertexArray(vertexArray)
      gl.deleteProgram(field)
      gl.deleteProgram(finish)
    }
  }, [angle, background, color1, color2, hover, reach, size, speed])

  return (
    <div ref={rootRef} className="ribbon-glow" aria-hidden="true" style={{ background, ...style }}>
      <canvas ref={canvasRef} />
    </div>
  )
}
