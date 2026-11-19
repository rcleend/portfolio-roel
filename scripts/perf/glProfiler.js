// Injected before any page script by scripts/perf/profile.mjs: a WebGL frame profiler that needs nothing from the app,
// so the same tool measures any build. Per animation frame that draws: CPU time of the callback, GPU time (a timer
// query where the browser has one, and optionally the wait for a 1 × 1 readback, which blocks until the GPU has
// finished the frame), draw calls and the pixels of every render target drawn into.
// `window.__perfConfig` (set first by the script) may ask for counterfactuals: shader source patches and no MSAA.
(() => {
  const config = window.__perfConfig ?? {};
  // The room does not govern its quality under automation (its clock is a test's); this is a measurement of what a
  // visitor's browser does, so it says it is one.
  Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
  const P = {
    frames: [],
    rafTimes: [],
    rafCpu: [],
    longTasks: [],
    recording: false,
    shaders: [],
    msaa: [],
    timerQuery: null,
    renderer: null,
    patched: {},
  };
  window.__perf = P;

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) P.longTasks.push({ start: entry.startTime, duration: entry.duration });
    }).observe({ type: 'longtask', buffered: true });
  } catch {}

  const proto = WebGL2RenderingContext.prototype;
  if (config.noCanvasAA) {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, attributes) {
      return getContext.call(this, type, type === 'webgl2' ? { ...attributes, antialias: false } : attributes);
    };
  }
  if (config.cpuGameCanvas || config.cpuAllCanvases) {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, attributes) {
      const cpu = type === '2d' && (config.cpuAllCanvases || (this.width === 320 && this.height === 240));
      return getContext.call(this, type, cpu ? { ...attributes, willReadFrequently: true } : attributes);
    };
  }
  if (config.noFloat) {
    const getExtension = proto.getExtension;
    proto.getExtension = function (name) {
      return name === 'EXT_color_buffer_float' || name === 'EXT_color_buffer_half_float'
        ? null
        : getExtension.call(this, name);
    };
  }
  let gl = null;
  let ext = null;
  let inRaf = false;
  let frame = null;
  let query = null;
  const pending = [];
  const framebufferIds = new WeakMap();
  let nextFramebuffer = 1;
  let target = 'screen';
  let viewport = [0, 0];
  let sceneTarget = null;

  const adopt = (context) => {
    if (gl || !(context instanceof WebGL2RenderingContext)) return;
    gl = context;
    ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    P.timerQuery = Boolean(ext);
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    P.renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  };

  // What a frame asks of the GPU, kept so it can be asked again (`repeat`, `slowGpu`): the state and draw calls WebGL
  // gets inside a frame callback, with their arguments. Calling the frame callback a second time instead no longer
  // works: the room's paced loop (RenderLoop.pace) refuses a second frame for the same timestamp, so a resting view
  // drew once however often it was called. Uploads, queries and readbacks are not kept (they are the main thread's
  // cost, or the profiler's own), and what a counterfactual below skips never reaches this layer, so it is not replayed
  // either. A replay starts from the state the frame left, which is the state it started from once a view has settled.
  const REPLAYED = [
    'bindFramebuffer',
    'viewport',
    'scissor',
    'enable',
    'disable',
    'clear',
    'clearColor',
    'clearDepth',
    'clearStencil',
    'colorMask',
    'depthMask',
    'depthFunc',
    'depthRange',
    'blendFunc',
    'blendFuncSeparate',
    'blendEquation',
    'blendEquationSeparate',
    'blendColor',
    'cullFace',
    'frontFace',
    'lineWidth',
    'polygonOffset',
    'stencilFunc',
    'stencilFuncSeparate',
    'stencilOp',
    'stencilOpSeparate',
    'stencilMask',
    'stencilMaskSeparate',
    'useProgram',
    'uniform1i',
    'uniform1f',
    'uniform2f',
    'uniform3f',
    'uniform4f',
    'uniform2i',
    'uniform3i',
    'uniform4i',
    'uniform1ui',
    'uniform1fv',
    'uniform2fv',
    'uniform3fv',
    'uniform4fv',
    'uniform1iv',
    'uniform2iv',
    'uniform3iv',
    'uniform4iv',
    'uniform1uiv',
    'uniformMatrix2fv',
    'uniformMatrix3fv',
    'uniformMatrix4fv',
    'activeTexture',
    'bindTexture',
    'bindVertexArray',
    'bindBuffer',
    'bindBufferBase',
    'drawElements',
    'drawArrays',
    'drawElementsInstanced',
    'drawArraysInstanced',
    'drawRangeElements',
    'blitFramebuffer',
    'drawBuffers',
    'readBuffer',
    'invalidateFramebuffer',
    'bindSampler',
    'generateMipmap',
    'clearBufferfv',
    'clearBufferiv',
    'clearBufferuiv',
    'clearBufferfi',
    'bindRenderbuffer',
  ];
  const DRAWS = new Set([
    'drawElements',
    'drawArrays',
    'drawElementsInstanced',
    'drawArraysInstanced',
    'drawRangeElements',
  ]);
  const replays = Math.max(1, config.repeat ?? 1, config.slowGpu ?? 1) > 1;
  // `slowBake`: the room's bake draws outside any frame callback, so `slowGpu` does not slow it. This draws each of
  // those draws that many times, the extra ones blended as source × 0 + target: the shaders run, the picture stays.
  const slowBake = Math.max(1, config.slowBake ?? 1);
  const BLEND = 0x0be2;
  const blend = { on: false, func: [1, 0, 1, 0], color: [0, 0, 0, 0] };
  const native = {};
  /** The calls of the frame callback that is running, when they are wanted. */
  let calls = null;
  if (replays || slowBake > 1)
    for (const name of REPLAYED) {
      const inner = proto[name];
      if (!inner) continue;
      native[name] = inner;
      proto[name] = function (...args) {
        if (name === 'enable' && args[0] === BLEND) blend.on = true;
        else if (name === 'disable' && args[0] === BLEND) blend.on = false;
        else if (name === 'blendFunc') blend.func = [args[0], args[1], args[0], args[1]];
        else if (name === 'blendFuncSeparate') blend.func = [...args];
        else if (name === 'blendColor') blend.color = [...args];
        // A typed array may be the caller's scratch: the replay needs what it held now.
        if (calls) calls.push([inner, args.map((arg) => (ArrayBuffer.isView(arg) ? arg.slice() : arg))]);
        const result = inner.apply(this, args);
        if (slowBake > 1 && !inRaf && !replaying && DRAWS.has(name)) {
          native.enable.call(this, BLEND);
          native.blendFuncSeparate.call(this, 0x8001, 1, 0x8003, 1); // CONSTANT_COLOR, ONE, CONSTANT_ALPHA, ONE
          native.blendColor.call(this, 0, 0, 0, 0);
          for (let i = 1; i < slowBake; i++) inner.apply(this, args);
          if (!blend.on) native.disable.call(this, BLEND);
          native.blendFuncSeparate.call(this, ...blend.func);
          native.blendColor.call(this, ...blend.color);
        }
        return result;
      };
    }
  let replaying = false;
  /** Asks the GPU for the frame just drawn again, `times` times. */
  const replay = (recorded, times) => {
    replaying = true;
    try {
      for (let i = 0; i < times; i++) for (const [fn, args] of recorded) fn.apply(gl, args);
    } finally {
      replaying = false;
    }
  };

  const original = {};
  const wrap = (name, before) => {
    original[name] = proto[name];
    proto[name] = function (...args) {
      const replaced = before.call(this, args);
      if (replaced === false) return undefined;
      return original[name].apply(this, replaced ?? args);
    };
  };

  for (const name of [
    'drawElements',
    'drawArrays',
    'drawElementsInstanced',
    'drawArraysInstanced',
    'drawRangeElements',
  ])
    wrap(name, function (args) {
      adopt(this);
      sceneTarget ??= target === 'screen' ? null : target;
      if (!inRaf || this !== gl) return;
      if (!frame) {
        frame = { draws: 0, targets: {}, blits: 0 };
        if (ext && P.recording && !config.noTimerQuery) {
          query = gl.createQuery();
          gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
        }
      }
      frame.draws++;
      frame.vertices = (frame.vertices ?? 0) + (name === 'drawArrays' ? args[2] : args[1]);
      if (config.skipDraws && (config.skipDraws === 'scene') === (target === sceneTarget)) return false;
      const key = `${target}:${viewport[0]}x${viewport[1]}`;
      frame.targets[key] = (frame.targets[key] ?? 0) + 1;
    });
  wrap('bindFramebuffer', (args) => {
    const framebuffer = args[1];
    if (args[0] === 0x8ca8) return; // READ_FRAMEBUFFER
    if (!framebuffer) target = 'screen';
    else {
      if (!framebufferIds.has(framebuffer)) framebufferIds.set(framebuffer, nextFramebuffer++);
      target = `fb${framebufferIds.get(framebuffer)}`;
    }
  });
  wrap('viewport', (args) => {
    viewport = [args[2], args[3]];
  });
  wrap('blitFramebuffer', () => {
    if (frame) frame.blits++;
  });
  wrap('renderbufferStorageMultisample', (args) => {
    P.msaa.push({ samples: args[1], width: args[3], height: args[4], format: args[2] });
    if (config.noMsaa) return [args[0], 0, args[2], args[3], args[4]];
  });
  if (config.skipUploads) wrap('texSubImage2D', () => false);
  if (config.skipMips) wrap('generateMipmap', () => false);
  wrap('shaderSource', (args) => {
    let source = args[1];
    for (const [name, patch] of Object.entries(config.shaderPatches ?? {})) {
      const next = source.replace(new RegExp(patch.find, patch.flags ?? ''), patch.replace);
      if (next !== source) P.patched[name] = (P.patched[name] ?? 0) + 1;
      source = next;
    }
    if (config.keepShaders) P.shaders.push(source);
    return [args[0], source];
  });

  // `timeGl`: where the main thread's time inside WebGL goes, by call name (a GPU-canvas upload or a mip chain can
  // block it far longer than the draws).
  P.glTime = {};
  if (config.timeGl) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      const descriptor = Object.getOwnPropertyDescriptor(proto, name);
      if (typeof descriptor.value !== 'function' || name === 'constructor') continue;
      const inner = proto[name];
      proto[name] = function (...args) {
        const start = performance.now();
        try {
          return inner.apply(this, args);
        } finally {
          if (P.recording) {
            P.glTime[name] ??= { ms: 0, calls: 0, max: 0 };
            const entry = P.glTime[name];
            const took = performance.now() - start;
            entry.ms += took;
            entry.calls++;
            if (took > entry.max) entry.max = took;
          }
        }
      };
    }
  }

  const pollQueries = () => {
    if (!gl || !ext) return;
    while (pending.length > 0) {
      const head = pending[0];
      if (!gl.getQueryParameter(head.query, gl.QUERY_RESULT_AVAILABLE)) break;
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      if (!disjoint) head.frame.gpuMs = gl.getQueryParameter(head.query, gl.QUERY_RESULT) / 1e6 / repeat;
      gl.deleteQuery(head.query);
      pending.shift();
    }
  };

  const pixel = new Uint8Array(4);
  const nativeRaf = window.requestAnimationFrame.bind(window);
  // `repeat`: every frame that draws is drawn that many times over (its WebGL calls asked again, each a whole frame
  // with its own passes), inside the frame's timer query, so its GPU time rises well clear of the timer's noise and of
  // an idle GPU's low clock; the time reported is one frame's.
  const repeat = Math.max(1, config.repeat ?? 1);
  // `slowGpu`: a GPU that many times slower, stood in for by drawing each frame that many times, the extra ones after
  // the frame's own query has ended: the timer still reports one frame, and the page's frames come as late as the pile
  // makes them, which is what its quality governor sees. The replays' WebGL calls cost the main thread too (a frame's
  // few hundred calls, that many times).
  const slowGpu = Math.max(1, config.slowGpu ?? 1);
  window.requestAnimationFrame = (callback) =>
    nativeRaf((now) => {
      if (P.recording && P.rafTimes[P.rafTimes.length - 1] !== now) {
        P.rafTimes.push(now);
        P.rafCpu.push(0);
      }
      pollQueries();
      const outer = calls;
      const mine = replays ? [] : null;
      calls = mine;
      inRaf = true;
      frame = null;
      const start = performance.now();
      try {
        callback(now);
      } finally {
        inRaf = false;
        calls = outer;
        // Everything the page does in a frame's callbacks: the game's step and 2D drawing as well as the room's frame.
        if (P.recording && repeat === 1) P.rafCpu[P.rafCpu.length - 1] += performance.now() - start;
        const drew = frame;
        frame = null;
        if (drew) {
          drew.cpuMs = performance.now() - start;
          if (repeat > 1 && mine) {
            replay(mine, repeat - 1);
            drew.repeat = repeat;
          }
          if (query) {
            gl.endQuery(ext.TIME_ELAPSED_EXT);
            pending.push({ query, frame: drew });
            query = null;
          }
          if (slowGpu > 1 && mine) replay(mine, slowGpu - 1);
          if (config.sync && P.recording) {
            const before = performance.now();
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            drew.syncMs = (performance.now() - before) / repeat;
          }
          drew.at = now;
          if (P.recording) P.frames.push(drew);
        }
      }
    });

  P.start = () => {
    P.frames = [];
    P.rafTimes = [];
    P.rafCpu = [];
    P.glTime = {};
    P.recording = true;
  };
  P.stop = () => {
    P.recording = false;
    pollQueries();
    return { frames: P.frames, rafTimes: P.rafTimes, rafCpu: P.rafCpu, longTasks: P.longTasks, glTime: P.glTime };
  };
  P.canvasSize = () => (gl ? [gl.drawingBufferWidth, gl.drawingBufferHeight] : null);
})();
