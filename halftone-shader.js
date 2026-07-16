/**
 * Halftone Shader — declarative WebGL2 halftone-circle effect.
 *
 * Renders an <img> as a grid of anti-aliased circles whose colour is sampled from
 * the source, discarding the gaps to transparency so the wrapper's background shows
 * through. Two source modes:
 *
 *   1. Still image  — a normal picture.
 *   2. Sprite sheet — a grid of frames, either auto-played (fps) or scroll-scrubbed.
 *
 * Ported from the Zoku `shader-test` project (Cables.gl halftone patch) into a
 * single, dependency-free drop-in module.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────────
 *   <!-- still image -->
 *   <div data-halftone><img src="hero.webp" alt=""></div>
 *
 *   <!-- auto-playing sprite sheet (frames auto-detected at the 960×540 cell) -->
 *   <div data-halftone data-halftone-type="sprite" data-halftone-fps="12">
 *     <img src="branch.avif" alt="">
 *   </div>
 *
 *   <!-- scroll-scrubbed sprite sheet with an explicit grid (cell ≠ 960×540) -->
 *   <div data-halftone data-halftone-scrub data-halftone-cols="4" data-halftone-rows="2">
 *     <img src="scroll-sprite_4x2.webp" alt="">
 *   </div>
 *
 *   <script src="assets/scripts/halftone-shader.js" defer></script>
 *
 * ── Attributes (on the wrapper element) ─────────────────────────────────────────
 *   data-halftone           Marker — required. The effect reads the wrapper's child <img>.
 *   data-halftone-type      image | sprite | auto   (default: auto — detect a sprite grid)
 *   data-halftone-fit       fill | cover | contain   (default: fill)
 *                           cover scales/crops the source to fill the wrapper while
 *                           preserving aspect (like object-fit: cover). Use for full-bleed
 *                           wrappers whose aspect differs from the source (e.g. the home hero).
 *                           contain scales the source so ALL of it is visible (like
 *                           object-fit: contain), dropping the dots in the letterbox bars
 *                           so the wrapper's background fills the spare space.
 *   data-halftone-density   Grid cells across X (5–1000)     (default: 260)
 *   data-halftone-cell      Target dot pitch in CSS px       (default: off)
 *                           When set, density is DERIVED from the element's rendered width
 *                           (density = cssWidth / cell) and recomputed on resize, so the
 *                           dots keep a CONSTANT screen size regardless of how large the
 *                           wrapper renders. Overrides data-halftone-density.
 *   data-halftone-radius    Fixed circle radius (0.0–0.5)    (default: 0.47)
 *   data-halftone-luma      Marker — size circles by luminance instead of fixed radius.
 *   data-halftone-depth     Discrete size levels when luma   (default: 10)
 *   data-halftone-fps       Sprite playback fps              (default: 10)
 *   data-halftone-loop      "false" to play a sprite once    (default: loop)
 *   data-halftone-cols      Explicit sprite columns          (default: auto-detect)
 *   data-halftone-rows      Explicit sprite rows. Set both to override the 960×540
 *                           auto-detect for sheets packed at another cell size.
 *   data-halftone-scrub     Marker — drive the sprite frame from scroll instead of fps.
 *                           Frame is set externally via ZokuHalftone.setProgress(el, 0–1);
 *                           pair with assets/scripts/scroll-scrub.js.
 *   data-halftone-eager     Marker — render immediately instead of lazily on scroll-in.
 *   data-halftone-hover     Marker — holographic pointer glow. The whole wrapper
 *                           tints towards the hover colour while hovering, blooming
 *                           to full intensity around the cursor. The tint's luminance
 *                           follows the source's white value (highlights go bright
 *                           lavender, shadows stay deep violet). The glow trails the
 *                           pointer with an eased lag and fades out on leave.
 *   data-halftone-hover-radius  Bloom radius as a fraction of wrapper width (default: 0.5)
 *   data-halftone-hover-color   Shadow tint as #rrggbb (default: #c88dfb — deep brand purple)
 *   data-halftone-hover-color2  Highlight tint as #rrggbb (default: #e2b0ff — pale lavender)
 *   data-halftone-hover-base    Whole-area tint floor while hovering, 0–1 (default: 0.4)
 *
 * ── Public API ──────────────────────────────────────────────────────────────────
 *   window.ZokuHalftone.setProgress(el, p)   Set a scrubbed sprite's progress (0–1).
 *                                            The first call CLAIMS the instance for
 *                                            scroll: a play-once auto-play sprite then
 *                                            renders min(intro clock, scrub) — the load
 *                                            intro still plays out under the cap, and
 *                                            scrolling scrubs back from wherever the
 *                                            playback has reached, never jumping (used
 *                                            by the home hero's reverse scroll-scrub).
 *                                            Claimed looping sprites retire their clock
 *                                            and become pure scrub. Claiming is cheap and
 *                                            never forces a load: an off-screen instance
 *                                            stays lazy until the IntersectionObserver
 *                                            activates it near the viewport, then applies
 *                                            the stored progress on its first draw.
 *
 * Requires WebGL2 (for fwidth-based anti-aliasing). Where WebGL2 is unavailable the
 * original <img> is left visible untouched. Honours prefers-reduced-motion by freezing
 * auto-played sprites on their first frame. One shared WebGL2 context is multiplexed
 * across every instance on the page (browsers cap live contexts at ~16). The shared rAF
 * loop only issues a GPU draw + 2D blit when an instance's pixels actually change: an
 * auto-played sprite redraws on each new sprite frame (~10–12fps), not on every display
 * frame (~60–120Hz); a scroll-scrubbed sprite redraws only when its quantised frame
 * advances; a still redraws on resize or hover but re-uploads its texture only when the
 * source itself changes. The shared GL canvas is sized grow-only (never shrinks below the
 * largest instance seen) so its framebuffer allocation is not thrashed between draws.
 *
 * Responsive images (Webflow srcset): sprite sheets always texture from the img's
 * `src` attribute — the ORIGINAL asset — because the frame grid is defined by the
 * authored sheet and Webflow's scaled srcset variants would shrink every cell (and
 * can break the 960×540 auto-detect). Still images texture from the browser's
 * srcset pick and re-texture automatically when a LARGER variant loads (e.g. after
 * a window resize), so the halftone never keeps sampling a stale small variant.
 */
(function () {
    'use strict';

    // Set up the shared machinery exactly once (the script is loaded on every
    // page for the SPA, but Barba never re-executes it — scan() re-scans per page).
    if (window.__zokuHalftoneInit) return;
    window.__zokuHalftoneInit = true;

    // ─────────────────────────────────────────────────────────────────────────────
    // Shader sources (ported verbatim from shader-test/src/shaders/halftoneCircle.ts)
    // ─────────────────────────────────────────────────────────────────────────────

    const VERT_SRC = `#version 300 es
precision highp float;
in vec2 position;
out vec2 texCoord;
void main() {
  texCoord = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

    const FRAG_SRC = `#version 300 es
precision highp float;

in vec2 texCoord;

uniform sampler2D tex;
uniform float numSquares;
uniform int Depth;
uniform float aspectRatio;
uniform bool sizeByLuma;
uniform float fixedRadius;
uniform int fitMode;         // 0 = fill, 1 = cover, 2 = contain
uniform float srcAspect;
uniform vec2 hoverPos;       // eased pointer position in canvas UV (y-up)
uniform float hoverStrength; // eased hover presence, 0 (idle) – 1 (hovering)
uniform float hoverRadius;   // glow radius in canvas-width units
uniform vec3 hoverColor;     // holographic tint for the shadows (deep shade)
uniform vec3 hoverColor2;    // holographic tint for the highlights (pale shade)
uniform float hoverBase;     // whole-area tint floor while hovering, 0 (off) – 1 (full)

out vec4 outColor;

float getLuma(vec3 color) {
  const vec3 LUMA_WEIGHTS = vec3(0.299, 0.587, 0.114);
  return dot(color, LUMA_WEIGHTS);
}

// object-fit behaviour — cover scales the source UV so it fills the canvas
// (cropping the overflowing axis, centred); contain scales it so the whole
// source is visible (UVs run outside 0–1 in the spare bars, which main()
// discards). Returns uv unchanged for fill.
vec2 fitUV(vec2 uv) {
  if (fitMode == 0) return uv;
  float canvasAspect = 1.0 / aspectRatio;   // aspectRatio = h/w → canvasAspect = w/h
  vec2 scale = vec2(1.0);
  // The same two scale factors serve both modes, applied on opposite branches:
  // when the canvas is wider than the source, cover crops top/bottom (scale.y < 1)
  // while contain letterboxes the sides (scale.x > 1) — and vice versa.
  if ((canvasAspect > srcAspect) == (fitMode == 1)) {
    scale.y = srcAspect / canvasAspect;
  } else {
    scale.x = canvasAspect / srcAspect;
  }
  return (uv - 0.5) * scale + 0.5;
}

void main() {
  // 1. Sample source colour at this fragment.
  vec4 pixelColor = texture(tex, fitUV(texCoord));

  // 2. Compute grid dimensions for square cells (rows scaled by aspect ratio).
  float rows = numSquares * aspectRatio;
  vec2 gridCount = vec2(numSquares, rows);
  vec2 scaledUV = texCoord * gridCount;
  vec2 cellPos = floor(scaledUV);
  vec2 localUV = fract(scaledUV);

  // 3. Circle radius — either luma-driven or fixed.
  float radius;
  if (sizeByLuma) {
    float luma = getLuma(pixelColor.rgb);
    int idx = int(clamp(luma, 0.0, 0.999) * float(max(Depth, 1)));
    if (Depth > 1) {
      radius = float(idx) / float(Depth - 1) * 0.5;
    } else {
      radius = 0.0;
    }
  } else {
    radius = clamp(fixedRadius, 0.0, 0.5);
  }

  // 4. Anti-aliased circle mask via signed distance field.
  vec2 centered = localUV - 0.5;
  float dist = length(centered);
  float d = dist - radius;
  float aa = fwidth(d) * 0.5;
  float mask = 1.0 - smoothstep(-aa, aa, d);

  // Discard fully transparent fragments so the background shows through.
  if (mask < 0.01) {
    discard;
  }

  // 5. Sample at the cell centre for a uniform fill colour per circle.
  vec2 sampleUV = (cellPos + 0.5) / gridCount;
  vec2 srcUV = fitUV(sampleUV);
  // Contain letterboxing — a cell whose centre lies outside the source has no
  // colour to show (CLAMP_TO_EDGE would smear the edge pixels across the bars);
  // drop it so the wrapper background fills the spare space.
  if (fitMode == 2 && (srcUV.x < 0.0 || srcUV.x > 1.0 || srcUV.y < 0.0 || srcUV.y > 1.0)) {
    discard;
  }
  vec4 sampledColor = texture(tex, srcUV);
  vec3 rgb = sampledColor.rgb;

  // 6. Holographic hover glow — the whole wrapper tints towards hoverColor while
  // hovering (a hoverBase floor), blooming to full intensity around the pointer.
  // The tint's luminance follows the source's white value: highlights bloom
  // towards a pale lavender, shadows sink into deep violet. sampleUV is the cell
  // centre in CANVAS space (pre-fitUV), matching hoverPos; scaling y by the
  // aspect ratio keeps the falloff circular on non-square wrappers.
  if (hoverStrength > 0.001) {
    vec2 offset = (sampleUV - hoverPos) * vec2(1.0, aspectRatio);
    float prox = 1.0 - smoothstep(0.0, hoverRadius, length(offset));
    prox *= prox;                            // sharp bloom around the pointer
    float glow = mix(hoverBase, 1.0, prox);  // floor tints everywhere, ramps to full at cursor
    float luma = getLuma(rgb);
    // Two distinct purples — shadows sink into the deep hoverColor, highlights
    // bloom into the paler, slightly pinker hoverColor2.
    vec3 holo = mix(hoverColor * 0.4, hoverColor2, luma);
    rgb = mix(rgb, holo, glow * hoverStrength);
  }

  outColor = vec4(rgb, sampledColor.a * mask);
}`;

    // ─────────────────────────────────────────────────────────────────────────────
    // Configuration
    // ─────────────────────────────────────────────────────────────────────────────

    /** Authoring cell size of the Zoku sprite sheets — sheets pack frames at 960×540. */
    const SPRITE_AUTHOR_CELL = { w: 960, h: 540 };

    /** Cap the device-pixel ratio so retina heroes don't blow out fill-rate. */
    const MAX_DPR = 2;

    /** Fade-in duration (ms) for an instance's canvas on its first painted frame. */
    const REVEAL_FADE_MS = 700;

    /** Hover-glow easing rates (per second, exponential): position trails the pointer
     *  gently, the glow blooms in fairly quickly and lingers on the way out. */
    const HOVER_FOLLOW_RATE = 6;
    const HOVER_FADE_IN_RATE = 7;
    const HOVER_FADE_OUT_RATE = 2.5;

    /** Default hover tints — deep brand purple (#c88dfb) for shadows, a paler,
     *  slightly pinker lavender (#e2b0ff) for highlights. */
    const HOVER_COLOR_DEFAULT = [200 / 255, 141 / 255, 251 / 255];
    const HOVER_COLOR2_DEFAULT = [226 / 255, 176 / 255, 255 / 255];

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

    /** Parse a #rrggbb string into [r,g,b] (0–1), falling back when absent/invalid. */
    function parseHexColor(str, fallback) {
        const m = typeof str === 'string' && str.trim().match(/^#?([0-9a-f]{6})$/i);
        if (!m) return fallback;
        const n = parseInt(m[1], 16);
        return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }

    /** Read a numeric data-halftone-<name>, falling back when absent/invalid. */
    function numAttr(el, name, fallback) {
        const n = parseFloat(el.getAttribute('data-halftone-' + name));
        return Number.isFinite(n) ? n : fallback;
    }

    /** Read the config for one wrapper element. */
    function readConfig(el) {
        return {
            type: el.getAttribute('data-halftone-type') || 'auto',   // image | sprite | auto
            fit: /^(cover|contain)$/.test(el.getAttribute('data-halftone-fit')) ? el.getAttribute('data-halftone-fit') : 'fill', // object-fit behaviour
            density: clamp(numAttr(el, 'density', 260), 5, 1000),
            cell: Math.max(0, numAttr(el, 'cell', 0)),                // >0 = constant dot pitch
            radius: clamp(numAttr(el, 'radius', 0.47), 0, 0.5),
            luma: el.hasAttribute('data-halftone-luma'),
            depth: Math.max(1, Math.round(numAttr(el, 'depth', 10))),
            fps: Math.max(1, numAttr(el, 'fps', 10)),
            loop: el.getAttribute('data-halftone-loop') !== 'false',
            cols: Math.max(0, Math.round(numAttr(el, 'cols', 0))),
            rows: Math.max(0, Math.round(numAttr(el, 'rows', 0))),
            scrub: el.hasAttribute('data-halftone-scrub'),
            eager: el.hasAttribute('data-halftone-eager'),
            hover: el.hasAttribute('data-halftone-hover'),
            hoverRadius: clamp(numAttr(el, 'hover-radius', 0.5), 0.05, 2),
            hoverColor: parseHexColor(el.getAttribute('data-halftone-hover-color'), HOVER_COLOR_DEFAULT),
            hoverColor2: parseHexColor(el.getAttribute('data-halftone-hover-color2'), HOVER_COLOR2_DEFAULT),
            hoverBase: clamp(numAttr(el, 'hover-base', 0.4), 0, 1),
        };
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Sprite-sheet helpers
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Detect a sprite-sheet grid by assuming the 960×540 authoring cell.
     * Returns null when the dimensions aren't a clean multiple (i.e. a plain still image).
     */
    function detectSpriteGrid(w, h) {
        const cols = Math.round(w / SPRITE_AUTHOR_CELL.w);
        const rows = Math.round(h / SPRITE_AUTHOR_CELL.h);
        if (cols < 1 || rows < 1 || cols * rows < 2) return null;
        if (Math.abs(cols * SPRITE_AUTHOR_CELL.w - w) > 2 || Math.abs(rows * SPRITE_AUTHOR_CELL.h - h) > 2) return null;
        return { cols, rows };
    }

    /**
     * Resolve the sprite grid for an image: explicit cols/rows win, then type, then
     * the 960×540 auto-detect. Returns null for a plain still image.
     */
    function resolveGrid(config, w, h) {
        if (config.cols > 0 && config.rows > 0) return { cols: config.cols, rows: config.rows };
        if (config.type === 'image') return null;
        return detectSpriteGrid(w, h);   // covers 'auto' and 'sprite'
    }

    /** Build a sprite-sheet wrapper with an offscreen canvas sized to a single cell. */
    function makeSpriteSheet(img, cols, rows) {
        const cellW = Math.round(img.naturalWidth / cols);
        const cellH = Math.round(img.naturalHeight / rows);
        const canvas = document.createElement('canvas');
        canvas.width = cellW;
        canvas.height = cellH;
        return { img, cols, rows, cellW, cellH, frames: cols * rows, canvas, ctx: canvas.getContext('2d') };
    }

    /** Blit one frame (row-major, top-left origin) of the sheet into its offscreen canvas. */
    function drawSpriteFrame(sheet, frame) {
        const i = clamp(Math.floor(frame), 0, sheet.frames - 1);
        const col = i % sheet.cols;
        const row = Math.floor(i / sheet.cols);
        sheet.ctx.clearRect(0, 0, sheet.cellW, sheet.cellH);
        sheet.ctx.drawImage(
            sheet.img,
            col * sheet.cellW, row * sheet.cellH, sheet.cellW, sheet.cellH,
            0, 0, sheet.cellW, sheet.cellH,
        );
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Shared WebGL2 renderer (one context multiplexed across every instance)
    // ─────────────────────────────────────────────────────────────────────────────

    function compileShader(gl, type, src) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('[halftone] shader compile error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    /** Upload an image / sprite-cell canvas into a texture (flipped to match UVs). */
    function uploadSource(gl, tex, source) {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }

    /**
     * Build the shared renderer, or return null if WebGL2 is unavailable.
     * Owns the only GL context; instances render through drawInstance() and blit the
     * result into their own visible 2D canvas (alpha preserved → gaps stay transparent).
     */
    function createRenderer() {
        const glCanvas = document.createElement('canvas');
        // premultipliedAlpha:false keeps the discarded-gap transparency clean through the 2D blit.
        const gl = glCanvas.getContext('webgl2', { premultipliedAlpha: false, antialias: false });
        if (!gl) return null;

        const renderer = { gl, glCanvas, program: null, vao: null, uniforms: null, lost: false };

        function build() {
            const vert = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
            const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
            if (!vert || !frag) return false;

            const program = gl.createProgram();
            gl.attachShader(program, vert);
            gl.attachShader(program, frag);
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                console.error('[halftone] program link error:', gl.getProgramInfoLog(program));
                return false;
            }
            gl.deleteShader(vert);
            gl.deleteShader(frag);

            // Fullscreen quad as a triangle strip.
            const vao = gl.createVertexArray();
            gl.bindVertexArray(vao);
            const buffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
            const posLoc = gl.getAttribLocation(program, 'position');
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
            gl.bindVertexArray(null);

            renderer.program = program;
            renderer.vao = vao;
            renderer.uniforms = {
                tex: gl.getUniformLocation(program, 'tex'),
                numSquares: gl.getUniformLocation(program, 'numSquares'),
                depth: gl.getUniformLocation(program, 'Depth'),
                aspectRatio: gl.getUniformLocation(program, 'aspectRatio'),
                sizeByLuma: gl.getUniformLocation(program, 'sizeByLuma'),
                fixedRadius: gl.getUniformLocation(program, 'fixedRadius'),
                fitMode: gl.getUniformLocation(program, 'fitMode'),
                srcAspect: gl.getUniformLocation(program, 'srcAspect'),
                hoverPos: gl.getUniformLocation(program, 'hoverPos'),
                hoverStrength: gl.getUniformLocation(program, 'hoverStrength'),
                hoverRadius: gl.getUniformLocation(program, 'hoverRadius'),
                hoverColor: gl.getUniformLocation(program, 'hoverColor'),
                hoverColor2: gl.getUniformLocation(program, 'hoverColor2'),
                hoverBase: gl.getUniformLocation(program, 'hoverBase'),
            };
            return true;
        }

        renderer.createTexture = () => gl.createTexture();

        /** Render one instance and blit the framebuffer into its visible 2D canvas. */
        renderer.drawInstance = function (inst) {
            if (renderer.lost || !renderer.program || !inst.texture) return;
            const w = Math.max(1, inst.pixelW);
            const h = Math.max(1, inst.pixelH);
            // Grow-only sizing. Assigning glCanvas.width/height reallocates the WebGL
            // backing store, so sizing the shared canvas to each instance in turn thrashed
            // the framebuffer whenever two differently-sized instances drew in the same
            // frame. Instead the canvas only ever ENLARGES to fit the biggest instance seen
            // and never shrinks below it, so it settles at the largest wrapper on the page
            // (≈ the hero's steady-state cost today) and every later draw reuses that
            // allocation. Each instance renders into the bottom-left w×h corner via
            // gl.viewport and blits just that sub-rect back out.
            if (glCanvas.width < w) glCanvas.width = w;
            if (glCanvas.height < h) glCanvas.height = h;

            gl.viewport(0, 0, w, h);
            // Clear only the used sub-rect. The fullscreen quad covers the whole viewport,
            // but its gap fragments discard (leaving whatever the framebuffer held), so the
            // region must start transparent or a previous LARGER instance's dots would show
            // through this instance's gaps. A scissored clear of exactly (0,0,w,h) covers
            // every pixel this draw writes and its blit later reads, and stays cheap on a
            // grown canvas (it never clears the unused overhang). With this clear there is
            // no stale-pixel path: every pixel the blit copies was either cleared to
            // transparent here or written by the quad this frame.
            gl.enable(gl.SCISSOR_TEST);
            gl.scissor(0, 0, w, h);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.disable(gl.SCISSOR_TEST);

            gl.useProgram(renderer.program);
            gl.bindVertexArray(renderer.vao);

            const u = renderer.uniforms;
            gl.uniform1i(u.tex, 0);
            gl.uniform1f(u.numSquares, inst.density);
            gl.uniform1i(u.depth, inst.config.depth);
            gl.uniform1f(u.aspectRatio, h / w);
            gl.uniform1i(u.sizeByLuma, inst.config.luma ? 1 : 0);
            gl.uniform1f(u.fixedRadius, inst.config.radius);
            gl.uniform1i(u.fitMode, inst.config.fit === 'cover' ? 1 : inst.config.fit === 'contain' ? 2 : 0);
            const hov = inst.hover;
            gl.uniform2f(u.hoverPos, hov ? hov.x : 0.5, hov ? hov.y : 0.5);
            gl.uniform1f(u.hoverStrength, hov ? hov.s : 0);
            gl.uniform1f(u.hoverRadius, inst.config.hoverRadius);
            gl.uniform3f(u.hoverColor, inst.config.hoverColor[0], inst.config.hoverColor[1], inst.config.hoverColor[2]);
            gl.uniform3f(u.hoverColor2, inst.config.hoverColor2[0], inst.config.hoverColor2[1], inst.config.hoverColor2[2]);
            gl.uniform1f(u.hoverBase, inst.config.hoverBase);
            // Source aspect (cell for sprites, natural size for stills) drives the cover/contain fit.
            let sw = 1, sh = 1;
            if (inst.sprite) { sw = inst.sprite.cellW; sh = inst.sprite.cellH; }
            else if (inst.still) { sw = inst.still.naturalWidth; sh = inst.still.naturalHeight; }
            gl.uniform1f(u.srcAspect, sh > 0 ? sw / sh : 1);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, inst.texture);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            gl.bindVertexArray(null);

            // Blit the shared GL canvas into the instance's own visible canvas. gl.viewport
            // rendered into the BOTTOM-left of the (possibly larger, grow-only) GL canvas;
            // in the 2D canvas's top-left coordinate space that region begins at
            // y = glCanvas.height - h, so copy that w×h sub-rect up to the output origin.
            const out = inst.outCanvas;
            if (out.width !== w) out.width = w;
            if (out.height !== h) out.height = h;
            inst.outCtx.clearRect(0, 0, w, h);
            inst.outCtx.drawImage(glCanvas, 0, glCanvas.height - h, w, h, 0, 0, w, h);
        };

        // Exposed so a context-restore can rebuild the program/buffers on the SAME context.
        renderer.rebuild = build;

        return build() ? renderer : null;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Per-element instance
    // ─────────────────────────────────────────────────────────────────────────────

    function createInstance(el, renderer) {
        const config = readConfig(el);
        const img = el.querySelector('img');

        // Visible output canvas — covers the wrapper; transparent gaps reveal its background.
        // Starts transparent and fades in the first time a frame paints (see reveal()),
        // so the halftone eases in once the image has loaded / the sprite starts playing
        // rather than popping. Skip the transition under reduced motion (reveal is instant).
        const outCanvas = document.createElement('canvas');
        outCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:0';
        if (!prefersReducedMotion.matches) {
            outCanvas.style.transition = 'opacity ' + REVEAL_FADE_MS + 'ms cubic-bezier(0.22, 1, 0.36, 1)';
        }
        const outCtx = outCanvas.getContext('2d');

        const inst = {
            el,
            config,
            outCanvas,
            outCtx,
            texture: renderer.createTexture(),
            density: config.density,   // live value (cell mode overrides it on resize)
            pixelW: 1,
            pixelH: 1,
            // Source state.
            sprite: null,
            still: null,               // <img> for the plain-image case
            loaded: false,
            loading: false,
            loadedSrc: '',             // URL the current texture was loaded from
            textureDirty: false,       // still case: true when the texture needs a (re)upload (source changed / new handle)
            revealed: false,
            // Sprite playback.
            spriteFrameF: 0,
            lastDrawnFrame: -1,
            scrubProgress: 0,          // 0–1, set via setProgress() for scrub sprites
            scrubOwned: false,         // true once setProgress() has taken the frame clock
            // Hover glow — eased position (x/y) chases the pointer target (tx/ty),
            // eased strength (s) chases the presence target (ts). Canvas UV, y-up.
            hover: config.hover ? { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, s: 0, ts: 0 } : null,
            // Lifecycle.
            active: false,
            dirty: true,
        };

        // The output canvas is positioned absolutely, so the wrapper needs a position context.
        if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
        el.appendChild(outCanvas);

        // Hover glow — track the pointer on the wrapper (the canvas is pointer-events:
        // none). Targets are set here; the eased chase happens per-frame in tick().
        if (inst.hover) {
            const setTarget = (e) => {
                const rect = el.getBoundingClientRect();
                if (rect.width < 1 || rect.height < 1) return;
                inst.hover.tx = clamp((e.clientX - rect.left) / rect.width, 0, 1);
                inst.hover.ty = clamp(1 - (e.clientY - rect.top) / rect.height, 0, 1); // texCoord is y-up
            };
            el.addEventListener('pointerenter', (e) => {
                setTarget(e);
                // Fully faded out → bloom at the cursor rather than sweeping in from
                // wherever the glow last died.
                if (inst.hover.s < 0.01) {
                    inst.hover.x = inst.hover.tx;
                    inst.hover.y = inst.hover.ty;
                }
                inst.hover.ts = 1;
                renderLoopKick();
            });
            el.addEventListener('pointermove', (e) => {
                setTarget(e);
                renderLoopKick();
            });
            el.addEventListener('pointerleave', () => {
                inst.hover.ts = 0;
                renderLoopKick();
            });
        }

        /**
         * On the first painted frame: hide the original <img> (graceful fallback) and
         * fade the halftone canvas in from transparent. The opacity:0 starting state was
         * committed when the canvas was appended (a prior frame), so flipping to 1 here
         * triggers the CSS transition. Under reduced motion no transition is set, so this
         * is an instant reveal.
         */
        function reveal() {
            if (inst.revealed) return;
            inst.revealed = true;
            if (img) img.style.visibility = 'hidden';
            inst.outCanvas.style.opacity = '1';
        }

        function onImageReady(source) {
            const grid = resolveGrid(config, source.naturalWidth, source.naturalHeight);
            if (grid && grid.cols * grid.rows > 1) {
                inst.sprite = makeSpriteSheet(source, grid.cols, grid.rows);
                inst.still = null;
                drawSpriteFrame(inst.sprite, 0);
            } else {
                inst.sprite = null;
                inst.still = source;
                inst.textureDirty = true;  // a fresh still source (first load or srcset upgrade) must be uploaded before the next draw
            }
            inst.lastDrawnFrame = -1;  // force a sprite frame re-upload (matters on re-loads)
            inst.loaded = true;
            inst.dirty = true;
            renderLoopKick();
        }

        /**
         * True when the element is authored as a sprite sheet: its frame grid is
         * defined by the ORIGINAL asset, so the browser's responsive-variant pick
         * (currentSrc) must be bypassed — a scaled Webflow srcset variant shrinks
         * every frame cell and can break the 960×540 auto-detect.
         */
        const spriteSource = config.scrub || config.type === 'sprite' || (config.cols > 0 && config.rows > 0);

        /**
         * Kick off image loading (idempotent per URL — re-runs load a NEW source).
         *
         * The wrapper's <img> is rendered by Webflow WITHOUT crossorigin, so it is
         * fetched under the browser's default (no-CORS) mode. Drawing that image into
         * a canvas or uploading it via texImage2D taints the canvas and throws
         * "Tainted canvases may not be loaded". We therefore never use the DOM <img>
         * as the texture source: we load a FRESH, CORS-enabled copy of the same URL
         * (Webflow's CDN, cdn.prod.website-files.com, returns Access-Control-Allow-Origin)
         * and hand that clean, un-tainted image to onImageReady instead.
         *
         * Sprites read the img's `src` attribute (the original sheet); stills take
         * the browser's srcset pick and may be re-loaded later when it upgrades.
         */
        inst.loadSource = function () {
            if (inst.loading || !img) return;
            const src = spriteSource ? (img.src || img.currentSrc) : (img.currentSrc || img.src);
            if (!src || src === inst.loadedSrc) return;
            inst.loading = true;
            const tex = new Image();
            tex.crossOrigin = 'anonymous';
            tex.decoding = 'async';
            tex.addEventListener('load', () => {
                inst.loading = false;
                inst.loadedSrc = src;
                onImageReady(tex);
            }, { once: true });
            tex.addEventListener('error', () => { inst.loading = false; }, { once: true });
            tex.src = src;
        };

        // Responsive imgs fire `load` again each time a new srcset candidate loads
        // (e.g. the browser upgrading to a larger variant after a window resize).
        // Re-texture from the upgrade so the halftone doesn't keep sampling the
        // stale small variant; never downgrade. Sprites are pinned to the original
        // src above, so their loadSource call is a no-op here.
        if (img) {
            img.addEventListener('load', () => {
                if (!inst.loaded) return;
                const have = inst.still ? inst.still.naturalWidth
                    : inst.sprite ? inst.sprite.img.naturalWidth : 0;
                if (img.naturalWidth > have) inst.loadSource();
            });
        }

        /** Measure the wrapper box, size the backing store (capped DPR), derive cell density. */
        inst.setSize = function () {
            const rect = el.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
            const w = Math.max(1, Math.round(rect.width * dpr));
            const h = Math.max(1, Math.round(rect.height * dpr));
            if (w !== inst.pixelW || h !== inst.pixelH) {
                inst.pixelW = w;
                inst.pixelH = h;
                inst.dirty = true;
            }
            // Constant-dot-pitch mode: derive density from rendered CSS width so the dot
            // size stays fixed across breakpoints / container resizes (the scaling fix).
            if (config.cell > 0 && rect.width > 0) {
                const derived = clamp(Math.round(rect.width / config.cell), 5, 1000);
                if (derived !== inst.density) {
                    inst.density = derived;
                    inst.dirty = true;
                }
            }
        };

        /** True only for clock-driven (auto-play) sprites — scrub & stills redraw on demand. */
        inst.isAnimated = function () {
            if (config.scrub || prefersReducedMotion.matches) return false;
            if (!(inst.sprite && inst.sprite.frames > 1)) return false;
            if (inst.scrubOwned) {
                // Scroll-claimed play-once sprite: the intro clock keeps ticking
                // until it completes (tick() caps the visible frame at the scrub
                // progress, so the bloom finishes under the cap — no jump).
                // Claimed looping sprites retire their clock immediately.
                return !config.loop && inst.spriteFrameF < inst.sprite.frames - 1;
            }
            return true;
        };

        /** True while the hover glow is still chasing its position/strength targets. */
        inst.hoverAnimating = function () {
            const h = inst.hover;
            if (!h) return false;
            if (Math.abs(h.ts - h.s) > 0.002) return true;
            return h.s > 0.002 && (Math.abs(h.tx - h.x) > 0.001 || Math.abs(h.ty - h.y) > 0.001);
        };

        /** Ease the hover glow towards its targets (frame-rate independent). */
        function updateHover(dt) {
            const h = inst.hover;
            if (!h || dt <= 0 || !inst.hoverAnimating()) return;
            if (prefersReducedMotion.matches) {
                // No trailing motion — the tint just appears under the cursor and
                // vanishes on leave.
                h.x = h.tx;
                h.y = h.ty;
                h.s = h.ts;
            } else {
                const kp = 1 - Math.exp(-HOVER_FOLLOW_RATE * dt);
                h.x += (h.tx - h.x) * kp;
                h.y += (h.ty - h.y) * kp;
                const rate = h.ts > h.s ? HOVER_FADE_IN_RATE : HOVER_FADE_OUT_RATE;
                h.s += (h.ts - h.s) * (1 - Math.exp(-rate * dt));
                if (Math.abs(h.ts - h.s) < 0.002) h.s = h.ts;
            }
            inst.dirty = true;
        }

        /** Advance source state for this frame and render if anything changed. */
        inst.tick = function (dt) {
            if (!inst.loaded || renderer.lost) return;

            updateHover(dt);

            if (inst.sprite) {
                const frames = inst.sprite.frames;
                const scrubIdx = Math.round(clamp(inst.scrubProgress, 0, 1) * (frames - 1));
                let idx;
                if (config.scrub) {
                    idx = scrubIdx;
                } else if (inst.isAnimated()) {
                    inst.spriteFrameF += dt * config.fps;
                    if (inst.spriteFrameF >= frames) {
                        inst.spriteFrameF = config.loop
                            ? inst.spriteFrameF % frames
                            : frames - 1;
                    }
                    idx = Math.floor(inst.spriteFrameF);
                    // A scroll-claimed play-once sprite shows min(clock, scrub):
                    // at rest (scrub = 1) the cap is a no-op and the intro plays
                    // out; scrolling mid-intro scrubs back from wherever playback
                    // has reached — never a jump to the end frame.
                    if (inst.scrubOwned) idx = Math.min(idx, scrubIdx);
                } else if (inst.scrubOwned) {
                    // Claimed sprite whose clock is done (or never ran — looping
                    // sprites hand over entirely, reduced motion never starts
                    // it): pure scrub.
                    idx = scrubIdx;
                } else {
                    idx = 0;
                }
                if (idx !== inst.lastDrawnFrame) {
                    drawSpriteFrame(inst.sprite, idx);
                    uploadSource(renderer.gl, inst.texture, inst.sprite.canvas);
                    inst.lastDrawnFrame = idx;
                    inst.dirty = true;
                }
            } else if (inst.still && inst.textureDirty) {
                // Re-upload the still's texture ONLY when the source itself changed
                // (first load, an srcset upgrade, or a context-restore mint) — not on
                // every `dirty`. A resize or hover sets `dirty` to force a re-render, but
                // the texture content is unchanged there, so re-running a full-resolution
                // texImage2D would be wasted work (an iOS URL-bar collapse firing the
                // ResizeObserver mid-scroll would otherwise re-upload every visible still
                // on each scrolled frame). The shader re-samples the existing texture at
                // the new size/aspect without a re-upload.
                uploadSource(renderer.gl, inst.texture, inst.still);
                inst.textureDirty = false;
            }

            // Draw only when something actually changed. For an auto-played sprite the
            // sprite branch above sets `dirty` whenever the visible frame advances, so
            // gating on `dirty` alone redraws at the sprite's own fps (~10–12Hz) rather
            // than once per display frame (~60–120Hz). The rAF loop still runs every frame
            // for animated sprites (renderLoop keys hasWork off isAnimated()) so the clock
            // keeps advancing, but the full shader pass + 2D blit fire only on a genuine
            // frame change. reveal() still fires on the first paint (onImageReady/refresh
            // set dirty); hover easing still redraws every frame (updateHover sets dirty
            // per frame); a scroll-claimed play-once sprite whose capped idx is unchanged
            // correctly stops drawing while that idx holds.
            if (inst.dirty) {
                renderer.drawInstance(inst);
                reveal();
                inst.dirty = false;
            }
        };

        inst.resume = function () {
            inst.active = true;
            if (!inst.loaded) inst.loadSource();
            inst.dirty = true;
        };

        /** Re-upload the current frame after a context restore. */
        inst.refresh = function () {
            inst.texture = renderer.createTexture();
            inst.lastDrawnFrame = -1;   // sprite case: forces the current frame to re-upload on next tick
            inst.textureDirty = true;   // still case: the freshly-minted texture handle needs the source re-uploaded
            inst.dirty = true;
        };

        return inst;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Lifecycle controller
    // ─────────────────────────────────────────────────────────────────────────────

    let renderer = null;
    let rendererFailed = false;
    const instances = new Map();   // element → instance (null until first activation)
    let rafId = 0;
    let lastTime = 0;

    /** Build the shared renderer on first need; cache failure so we only try once. */
    function ensureRenderer() {
        if (renderer || rendererFailed) return renderer;
        renderer = createRenderer();
        if (!renderer) {
            rendererFailed = true;
            // No WebGL2 — reveal the raw <img> on every wrapper (CSS hides sprite
            // sources by default to prevent the sheet flashing before first paint).
            document.querySelectorAll('[data-halftone]').forEach((el) => el.classList.add('no-halftone'));
            return null;
        }
        renderer.glCanvas.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            renderer.lost = true;
            stopLoop();
        }, false);
        renderer.glCanvas.addEventListener('webglcontextrestored', () => {
            // Rebuild program/buffers on the restored context, then re-mint every
            // instance's texture and re-upload its current frame.
            renderer.rebuild();
            renderer.lost = false;
            instances.forEach((inst) => { if (inst) inst.refresh(); });
            renderLoopKick();
        }, false);
        return renderer;
    }

    function instanceFor(el) {
        let inst = instances.get(el);
        if (inst) return inst;
        if (!ensureRenderer()) return null;
        inst = createInstance(el, renderer);
        instances.set(el, inst);
        return inst;
    }

    function activate(inst) {
        if (!ensureRenderer()) return;
        inst.resume();
        inst.setSize();
        renderLoopKick();
    }

    function stopLoop() {
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
        }
    }

    /** Start the shared rAF loop if there is animated or dirty work to do. */
    function renderLoopKick() {
        if (rafId) return;
        lastTime = 0;
        rafId = requestAnimationFrame(renderLoop);
    }

    function renderLoop(now) {
        const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.1) : 0;
        lastTime = now;

        let hasWork = false;
        instances.forEach((inst) => {
            if (!inst || !inst.active) return;
            if (inst.isAnimated() || inst.hoverAnimating() || inst.dirty) {
                inst.tick(dt);
                if (inst.isAnimated() || inst.hoverAnimating()) hasWork = true;
            }
        });

        rafId = hasWork ? requestAnimationFrame(renderLoop) : 0;
    }

    const io = ('IntersectionObserver' in window)
        ? new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    // Create the instance (and its GL texture) only on first entry — the
                    // observer's initial callback also fires for off-screen targets.
                    const inst = instanceFor(entry.target);
                    if (inst) activate(inst);
                } else {
                    const inst = instances.get(entry.target);
                    if (inst) inst.active = false;
                }
            });
        }, { rootMargin: '200px' })
        : null;

    const ro = ('ResizeObserver' in window)
        ? new ResizeObserver((entries) => {
            entries.forEach((entry) => {
                const inst = instances.get(entry.target);
                if (inst) {
                    inst.setSize();
                    renderLoopKick();
                }
            });
        })
        : null;

    /** Drop instances whose wrapper has left the DOM (previous page) and free their GPU texture. */
    function pruneDisconnected() {
        instances.forEach((inst, el) => {
            if (el.isConnected) return;
            if (io) io.unobserve(el);
            if (ro) ro.unobserve(el);
            if (inst && inst.texture && renderer) renderer.gl.deleteTexture(inst.texture);
            instances.delete(el);
        });
    }

    /**
     * Register + observe every [data-halftone] within `scope` not already tracked.
     * Called on first load and after each Barba swap (the new <main>); prunes the
     * outgoing page's instances first. The shared renderer/observers/rAF persist.
     */
    function scan(scope) {
        pruneDisconnected();
        const root = scope || document;
        root.querySelectorAll('[data-halftone]').forEach((el) => {
            if (instances.has(el)) return;
            instances.set(el, null); // no GL yet — instantiate + activate lazily
            if (ro) ro.observe(el);
            if (el.hasAttribute('data-halftone-eager') || !io) {
                const inst = instanceFor(el);
                if (inst) activate(inst);
            } else {
                io.observe(el);
            }
        });
    }

    // Re-evaluate when the reduced-motion preference changes at runtime: a redraw lets
    // each instance settle on its frame-0 (reduced) or resume animating.
    const onMotionChange = () => {
        instances.forEach((inst) => { if (inst && inst.active) inst.dirty = true; });
        renderLoopKick();
    };
    if (prefersReducedMotion.addEventListener) {
        prefersReducedMotion.addEventListener('change', onMotionChange);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Public API — drive scrubbed sprites from an external scroll controller.
    // ─────────────────────────────────────────────────────────────────────────────
    window.ZokuHalftone = window.ZokuHalftone || {
        /**
         * Set the playback progress (0–1) of a scroll-scrubbed sprite instance.
         *
         * The first call CLAIMS the instance for scroll. A play-once auto-play
         * sprite keeps its intro clock but renders min(clock, scrub): claiming at
         * scrub = 1 is visually a no-op (the intro plays out under the cap), and
         * lowering the scrub scrubs back from wherever playback has reached — the
         * frame can never jump. Once the clock completes (or for looping sprites,
         * immediately) the frame is pure scrub.
         *
         * Claiming is CHEAP and does NOT activate the instance: it only ensures the
         * instance object + GL texture handle exist (no network) and stores the
         * progress. An inactive instance is left for the IntersectionObserver to
         * activate (and load the sheet) near the viewport — this keeps scroll-scrub's
         * init, which calls setProgress for every track on the page, from eagerly
         * downloading far-off-screen sprite sheets. The stored progress survives on
         * the instance and is honoured on the first draw after activation. When the
         * instance is already active and loaded the new frame is drawn synchronously.
         *
         * @param {Element} el  A [data-halftone] sprite wrapper (usually also
         *                      [data-halftone-scrub], but any sprite can be claimed).
         * @param {number}  p   Normalised progress, 0 = first frame, 1 = last frame.
         */
        setProgress(el, p) {
            const inst = instanceFor(el);
            if (!inst) return;
            const takeover = !inst.scrubOwned;
            inst.scrubOwned = true;
            const next = clamp(p, 0, 1);
            if (!takeover && next === inst.scrubProgress && inst.loaded) return;
            inst.scrubProgress = next;
            // Deliberately do NOT set inst.dirty here: tick()'s sprite branch derives the
            // frame index from scrubProgress and marks dirty (redrawing the ~8-megapixel
            // hero canvas) only when the quantised frame actually crosses, so an
            // unchanged frame is a near-free no-op rather than a full redraw every
            // scrolled frame. Nor do we activate an inactive instance — activation runs
            // loadSource() (a full sprite-sheet download, some sheets ~33MB decoded),
            // which we must not trigger for off-screen tracks. The IntersectionObserver
            // already observes this element (scan ran first) and activates it near the
            // viewport; the stored scrubProgress/scrubOwned survive on the instance and
            // apply on the first draw after activation (onImageReady marks dirty and kicks
            // the loop). Only when the instance is already live do we draw the new frame.
            if (inst.active && inst.loaded && !renderer.lost) {
                // Draw synchronously so the frame lands in the same scroll frame —
                // no extra rAF hop that would leave the sprite a beat behind.
                inst.tick(0);
            }
        },
        /** Re-scan a scope for halftone wrappers (used by the SPA navigation). */
        scan,
    };

    // Re-run per page (Barba): init = scan the freshly-swapped <main>.
    if (window.ZokuPage) window.ZokuPage.register({ init: scan });
    else scan(document);
})();
