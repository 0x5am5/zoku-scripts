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
 *   data-halftone-fit       fill | cover   (default: fill)
 *                           cover scales/crops the source to fill the wrapper while
 *                           preserving aspect (like object-fit: cover). Use for full-bleed
 *                           wrappers whose aspect differs from the source (e.g. the home hero).
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
 *
 * ── Public API ──────────────────────────────────────────────────────────────────
 *   window.ZokuHalftone.setProgress(el, p)   Set a scrubbed sprite's progress (0–1).
 *
 * Requires WebGL2 (for fwidth-based anti-aliasing). Where WebGL2 is unavailable the
 * original <img> is left visible untouched. Honours prefers-reduced-motion by freezing
 * auto-played sprites on their first frame. One shared WebGL2 context is multiplexed
 * across every instance on the page (browsers cap live contexts at ~16).
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
uniform bool coverFit;
uniform float srcAspect;

out vec4 outColor;

float getLuma(vec3 color) {
  const vec3 LUMA_WEIGHTS = vec3(0.299, 0.587, 0.114);
  return dot(color, LUMA_WEIGHTS);
}

// object-fit: cover — scale the source UV so it fills the canvas, cropping the
// overflowing axis (centred). Returns uv unchanged when coverFit is off (fill).
vec2 fitUV(vec2 uv) {
  if (!coverFit) return uv;
  float canvasAspect = 1.0 / aspectRatio;   // aspectRatio = h/w → canvasAspect = w/h
  vec2 scale = vec2(1.0);
  if (canvasAspect > srcAspect) {
    scale.y = srcAspect / canvasAspect;      // canvas wider than source → crop top/bottom
  } else {
    scale.x = canvasAspect / srcAspect;      // canvas taller than source → crop sides
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
  vec4 sampledColor = texture(tex, fitUV(sampleUV));

  outColor = vec4(sampledColor.rgb, sampledColor.a * mask);
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

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

    /** Read a numeric data-halftone-<name>, falling back when absent/invalid. */
    function numAttr(el, name, fallback) {
        const n = parseFloat(el.getAttribute('data-halftone-' + name));
        return Number.isFinite(n) ? n : fallback;
    }

    /** Read the config for one wrapper element. */
    function readConfig(el) {
        return {
            type: el.getAttribute('data-halftone-type') || 'auto',   // image | sprite | auto
            fit: el.getAttribute('data-halftone-fit') === 'cover' ? 'cover' : 'fill', // object-fit behaviour
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
                coverFit: gl.getUniformLocation(program, 'coverFit'),
                srcAspect: gl.getUniformLocation(program, 'srcAspect'),
            };
            return true;
        }

        renderer.createTexture = () => gl.createTexture();

        /** Render one instance and blit the framebuffer into its visible 2D canvas. */
        renderer.drawInstance = function (inst) {
            if (renderer.lost || !renderer.program || !inst.texture) return;
            const w = Math.max(1, inst.pixelW);
            const h = Math.max(1, inst.pixelH);
            if (glCanvas.width !== w) glCanvas.width = w;
            if (glCanvas.height !== h) glCanvas.height = h;

            gl.viewport(0, 0, w, h);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);

            gl.useProgram(renderer.program);
            gl.bindVertexArray(renderer.vao);

            const u = renderer.uniforms;
            gl.uniform1i(u.tex, 0);
            gl.uniform1f(u.numSquares, inst.density);
            gl.uniform1i(u.depth, inst.config.depth);
            gl.uniform1f(u.aspectRatio, h / w);
            gl.uniform1i(u.sizeByLuma, inst.config.luma ? 1 : 0);
            gl.uniform1f(u.fixedRadius, inst.config.radius);
            gl.uniform1i(u.coverFit, inst.config.fit === 'cover' ? 1 : 0);
            // Source aspect (cell for sprites, natural size for stills) drives the cover crop.
            let sw = 1, sh = 1;
            if (inst.sprite) { sw = inst.sprite.cellW; sh = inst.sprite.cellH; }
            else if (inst.still) { sw = inst.still.naturalWidth; sh = inst.still.naturalHeight; }
            gl.uniform1f(u.srcAspect, sh > 0 ? sw / sh : 1);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, inst.texture);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            gl.bindVertexArray(null);

            // Blit the shared GL canvas into the instance's own visible canvas.
            const out = inst.outCanvas;
            if (out.width !== w) out.width = w;
            if (out.height !== h) out.height = h;
            inst.outCtx.clearRect(0, 0, w, h);
            inst.outCtx.drawImage(glCanvas, 0, 0);
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
            revealed: false,
            // Sprite playback.
            spriteFrameF: 0,
            lastDrawnFrame: -1,
            scrubProgress: 0,          // 0–1, set via setProgress() for scrub sprites
            // Lifecycle.
            active: false,
            dirty: true,
        };

        // The output canvas is positioned absolutely, so the wrapper needs a position context.
        if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
        el.appendChild(outCanvas);

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
                drawSpriteFrame(inst.sprite, 0);
            } else {
                inst.still = source;
            }
            inst.loaded = true;
            inst.dirty = true;
            renderLoopKick();
        }

        /** Kick off image loading (idempotent). */
        inst.loadSource = function () {
            if (inst.loaded || inst.loading || !img) return;
            inst.loading = true;
            if (img.complete && img.naturalWidth) {
                onImageReady(img);
            } else {
                img.addEventListener('load', () => onImageReady(img), { once: true });
                img.addEventListener('error', () => { inst.loading = false; }, { once: true });
            }
        };

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
            return !!(inst.sprite && inst.sprite.frames > 1);
        };

        /** Advance source state for this frame and render if anything changed. */
        inst.tick = function (dt) {
            if (!inst.loaded || renderer.lost) return;

            if (inst.sprite) {
                const frames = inst.sprite.frames;
                let idx;
                if (config.scrub) {
                    idx = Math.round(clamp(inst.scrubProgress, 0, 1) * (frames - 1));
                } else if (inst.isAnimated()) {
                    inst.spriteFrameF += dt * config.fps;
                    if (inst.spriteFrameF >= frames) {
                        inst.spriteFrameF = config.loop
                            ? inst.spriteFrameF % frames
                            : frames - 1;
                    }
                    idx = Math.floor(inst.spriteFrameF);
                } else {
                    idx = 0;
                }
                if (idx !== inst.lastDrawnFrame) {
                    drawSpriteFrame(inst.sprite, idx);
                    uploadSource(renderer.gl, inst.texture, inst.sprite.canvas);
                    inst.lastDrawnFrame = idx;
                    inst.dirty = true;
                }
            } else if (inst.still && inst.dirty) {
                uploadSource(renderer.gl, inst.texture, inst.still);
            }

            if (inst.dirty || inst.isAnimated()) {
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
            inst.lastDrawnFrame = -1;
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
            if (inst.isAnimated() || inst.dirty) {
                inst.tick(dt);
                if (inst.isAnimated()) hasWork = true;
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
         * @param {Element} el  The [data-halftone][data-halftone-scrub] wrapper.
         * @param {number}  p   Normalised progress, 0 = first frame, 1 = last frame.
         */
        setProgress(el, p) {
            const inst = instanceFor(el);
            if (!inst) return;
            const next = clamp(p, 0, 1);
            if (next === inst.scrubProgress && inst.loaded) return;
            inst.scrubProgress = next;
            inst.dirty = true;
            if (!inst.active) {
                activate(inst);
            } else if (inst.loaded && !renderer.lost) {
                // Draw synchronously so the frame lands in the same scroll frame —
                // no extra rAF hop that would leave the sprite a beat behind.
                inst.tick(0);
            } else {
                renderLoopKick();
            }
        },
        /** Re-scan a scope for halftone wrappers (used by the SPA navigation). */
        scan,
    };

    // Re-run per page (Barba): init = scan the freshly-swapped <main>.
    if (window.ZokuPage) window.ZokuPage.register({ init: scan });
    else scan(document);
})();
