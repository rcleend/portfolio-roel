// Injected before any page script by scripts/perf/flights.mjs: what every display frame of a camera flight was, and
// what else ran in it. Needs nothing from the app but `window.__room` (a production build opened with `?debug`), so
// the same probe measures any build. Per display frame (a `requestAnimationFrame` timestamp): when its callbacks
// started and ended, whether the room drew, the camera it drew from (read off the `cameraPosition` and `projectionMatrix`
// uniforms three.js uploads), and the one-time work WebGL was asked for in it (programs, buffers, textures, targets,
// anything that waits for the GPU). Beside the frames: idle callbacks and timers that ran long, worker messages,
// resources fetched, long tasks and long animation frames with their scripts, and the room's own view changes.
// `window.__flightConfig`: { leaveAfterMs } leaves the TV that long after the room is handed out (`ready`),
// { leaveAfterWholeMs } that long after the whole room is lit, { finishAtWhole } waits there for the GPU first
// (a one-pixel read) and marks how long that took; { rafHz } caps the page's frames at that many a second.
(() => {
  const config = window.__flightConfig ?? {};
  const now = () => performance.now();
  const F = {
    ticks: [],
    gl: [],
    tasks: [],
    marks: [],
    resources: [],
    longTasks: [],
    longFrames: [],
    events: [],
    /** Running totals, so a flight's share is the difference of two readings. */
    totals: { programs: 0, shaders: 0, bufferBytes: 0, buffers: 0, texturePixels: 0, textures: 0, targets: 0, vaos: 0 },
  };
  window.__flight = F;

  F.mark = (name) => {
    F.marks.push({ at: now(), name, totals: { ...F.totals } });
    performance.mark(`flight:${name}`);
  };

  // --- Frames -----------------------------------------------------------------------------------------------------
  let tick = null;
  let inFrame = 0;
  // `rafHz`: a display that hands out that many frames a second at most (Safari in Low Power Mode: 30), stood in for
  // by running the page's frame callbacks only on the display frames that far apart; the others pass unseen.
  const realRaf = window.requestAnimationFrame.bind(window);
  const capMs = config.rafHz ? 1000 / config.rafHz : 0;
  // A display link's frames come on a grid, and so do the times it tells the page. Where this browser's own frames
  // sit on that grid (Chromium's 120 or 60 a second under a cap of 30), the callbacks run on the first display frame
  // of each cell of it (it starts a little ahead of a display frame, so one that comes a moment early or late stays
  // in its cell), a request made later in a cell waits for the next tick, and every callback is told its tick's
  // time. Where they do not (Playwright's WebKit ticks on a timer of its own, a little over sixty times a second:
  // `rafEvery`), every nth display frame is a tick, so no frame comes sooner than the cap allows. Taking the first
  // frame "at least a cap after the last" lets the display's jitter add up to a tick skipped now and then, and
  // telling the callbacks a frame's own time gives intervals of 25 and 42 ms on a 120 Hz display whose page is busy:
  // frames no capped display shows, which the room's governor rightly reads as a display that is not capped.
  let capOrigin = null;
  let capSlot = -1;
  let capFrames = 0;
  const capEvery = config.rafEvery ?? 0;
  let waiting = new Map();
  let nextHandle = 1e9;
  const tickOf = (t) => {
    capFrames++;
    if (capEvery > 0) return capFrames % capEvery === 0 ? t : null;
    capOrigin ??= t - 4;
    const slot = Math.floor((t - capOrigin) / capMs);
    if (slot <= capSlot || t - capOrigin - slot * capMs > 8) return null;
    capSlot = slot;
    return capOrigin + 4 + slot * capMs;
  };
  // Every display frame is seen, so they can be counted; the page's callbacks run on the ticks only.
  const capped = (t) => {
    realRaf(capped);
    const tick = tickOf(t);
    if (tick === null || waiting.size === 0) return;
    const run = waiting;
    waiting = new Map();
    for (const callback of run.values()) callback(tick);
  };
  if (capMs) realRaf(capped);
  const nativeRaf = capMs
    ? (callback) => {
        waiting.set(++nextHandle, callback);
        return nextHandle;
      }
    : realRaf;
  if (capMs) {
    const realCancel = window.cancelAnimationFrame.bind(window);
    window.cancelAnimationFrame = (handle) => {
      if (!waiting.delete(handle)) realCancel(handle);
    };
  }
  window.requestAnimationFrame = (callback) =>
    nativeRaf((t) => {
      if (!tick || tick.t !== t) {
        tick = { t, start: now(), end: 0, draws: 0, eye: null, projection: null, glMs: 0, work: null };
        F.ticks.push(tick);
      }
      inFrame++;
      try {
        callback(t);
      } finally {
        inFrame--;
        tick.end = now();
      }
    });

  // --- WebGL ------------------------------------------------------------------------------------------------------
  const proto = WebGL2RenderingContext.prototype;
  const uniformNames = new WeakMap();
  const getUniformLocation = proto.getUniformLocation;
  proto.getUniformLocation = function (program, name) {
    const start = now();
    const location = getUniformLocation.call(this, program, name);
    timed('getUniformLocation', now() - start, 0);
    if (location && (name === 'cameraPosition' || name === 'projectionMatrix')) uniformNames.set(location, name);
    return location;
  };
  // The room's surfaces are varnished by where the eye is (`cameraPosition`), which three.js uploads to a program
  // whenever it changed: the first upload of a frame is the camera the frame was drawn from, and a frame without one
  // was drawn from where the last stood.
  let eye = null;
  const uniform3f = proto.uniform3f;
  proto.uniform3f = function (location, x, y, z) {
    if (inFrame > 0 && tick && tick.eye === null && location && uniformNames.get(location) === 'cameraPosition') {
      eye = [x, y, z];
      tick.eye = eye;
    }
    return uniform3f.call(this, location, x, y, z);
  };
  const uniformMatrix4fv = proto.uniformMatrix4fv;
  proto.uniformMatrix4fv = function (location, transpose, value, ...rest) {
    // A perspective projection is the room's own camera: the finish's passes draw two triangles without one.
    if (inFrame > 0 && tick && tick.projection === null && value[11] === -1 && location) {
      if (uniformNames.get(location) === 'projectionMatrix') tick.projection = [value[0], value[5]];
    }
    return uniformMatrix4fv.call(this, location, transpose, value, ...rest);
  };

  /** A call's time on the main thread, and what it made, in the frame or between frames. */
  function timed(name, ms, amount) {
    if (inFrame > 0 && tick) {
      tick.glMs += ms;
      if (amount > 0 || ms >= 0.3) {
        tick.work ??= {};
        tick.work[name] ??= { calls: 0, ms: 0, amount: 0 };
        const entry = tick.work[name];
        entry.calls++;
        entry.ms += ms;
        entry.amount += amount;
      }
    }
    if (amount > 0 || ms >= 0.5) {
      const entry = { at: now() - ms, name, ms, amount, inFrame: inFrame > 0 };
      // `stacks`: who made a buffer (for an unminified build: `vite build --minify false`).
      if (window.__perfConfig?.stacks && name === 'bufferData')
        entry.stack = new Error().stack.split('\n').slice(3, 16);
      F.gl.push(entry);
    }
  }
  const bytesOf = (data) => (typeof data === 'number' ? data : (data?.byteLength ?? 0));
  const sizeOf = (source) => (source?.width ?? source?.videoWidth ?? 0) * (source?.height ?? source?.videoHeight ?? 0);
  /** name → [what it adds to the totals, how much a call makes]. */
  const WORK = {
    linkProgram: ['programs', () => 1],
    compileShader: ['shaders', () => 1],
    bufferData: ['bufferBytes', (args) => bytesOf(args[1])],
    bufferSubData: ['bufferBytes', (args) => bytesOf(args[2])],
    createVertexArray: ['vaos', () => 1],
    texImage2D: ['texturePixels', (args) => (args.length >= 9 ? args[3] * args[4] : sizeOf(args[5]))],
    texSubImage2D: ['texturePixels', (args) => (args.length >= 9 ? args[4] * args[5] : sizeOf(args[6]))],
    texStorage2D: ['texturePixels', (args) => args[3] * args[4]],
    texImage3D: ['texturePixels', (args) => args[3] * args[4] * args[5]],
    texStorage3D: ['texturePixels', (args) => args[3] * args[4] * args[5]],
    generateMipmap: ['textures', () => 1],
    renderbufferStorage: ['targets', () => 1],
    renderbufferStorageMultisample: ['targets', () => 1],
    framebufferTexture2D: ['targets', () => 1],
    // Calls that wait for the GPU or the driver: only their time counts.
    getProgramParameter: [null, () => 0],
    getShaderParameter: [null, () => 0],
    getProgramInfoLog: [null, () => 0],
    getActiveUniform: [null, () => 0],
    getActiveAttrib: [null, () => 0],
    getAttribLocation: [null, () => 0],
    readPixels: [null, () => 0],
    clientWaitSync: [null, () => 0],
    getSyncParameter: [null, () => 0],
    getQueryParameter: [null, () => 0],
    getBufferSubData: [null, () => 0],
    checkFramebufferStatus: [null, () => 0],
    finish: [null, () => 0],
  };
  for (const [name, [total, amountOf]] of Object.entries(WORK)) {
    const inner = proto[name];
    if (!inner) continue;
    proto[name] = function (...args) {
      const start = now();
      try {
        return inner.apply(this, args);
      } finally {
        const amount = amountOf(args) || 0;
        if (total) F.totals[total] += amount;
        if (name === 'bufferData') F.totals.buffers++;
        if (name.startsWith('tex')) F.totals.textures++;
        timed(name, now() - start, amount);
      }
    };
  }
  for (const name of [
    'drawElements',
    'drawArrays',
    'drawElementsInstanced',
    'drawArraysInstanced',
    'drawRangeElements',
  ]) {
    const inner = proto[name];
    proto[name] = function (...args) {
      if (inFrame > 0 && tick) tick.draws++;
      return inner.apply(this, args);
    };
  }

  // --- Everything else that takes the main thread ------------------------------------------------------------------
  const task = (kind, start, extra) => {
    const ms = now() - start;
    if (ms >= 0.5) F.tasks.push({ at: start, kind, ms, ...extra });
  };
  if (window.requestIdleCallback) {
    const nativeIdle = window.requestIdleCallback.bind(window);
    window.requestIdleCallback = (callback, options) =>
      nativeIdle((deadline) => {
        const start = now();
        const left = deadline.timeRemaining();
        try {
          callback(deadline);
        } finally {
          task('idle', start, { left, timedOut: deadline.didTimeout });
        }
      }, options);
  }
  const nativeTimeout = window.setTimeout.bind(window);
  window.setTimeout = (callback, delay, ...args) =>
    nativeTimeout(
      typeof callback === 'function'
        ? (...inner) => {
            const start = now();
            try {
              callback(...inner);
            } finally {
              task('timeout', start, { delay: delay ?? 0 });
            }
          }
        : callback,
      delay,
      ...args,
    );
  const NativeWorker = window.Worker;
  if (NativeWorker) {
    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        const name = String(url).split('/').pop()?.split('?')[0] ?? 'worker';
        F.events.push({ at: now(), kind: 'worker-start', name });
        this.addEventListener('message', () => F.events.push({ at: now(), kind: 'worker-message', name }));
      }
    };
  }
  const observe = (type, each, options = {}) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(each)).observe({ type, buffered: true, ...options });
    } catch {}
  };
  observe('longtask', (entry) => F.longTasks.push({ at: entry.startTime, ms: entry.duration }));
  observe('long-animation-frame', (entry) =>
    F.longFrames.push({
      at: entry.startTime,
      ms: entry.duration,
      blocking: entry.blockingDuration,
      render: entry.renderStart,
      style: entry.styleAndLayoutStart,
      scripts: entry.scripts.map((script) => ({
        invoker: script.invoker,
        fn: script.sourceFunctionName,
        url: script.sourceURL.split('/').pop(),
        at: script.startTime,
        ms: script.duration,
        layout: script.forcedStyleAndLayoutDuration,
      })),
    }),
  );
  observe('resource', (entry) =>
    F.resources.push({
      at: entry.startTime,
      end: entry.responseEnd,
      name: entry.name.split('/').pop(),
      kind: entry.initiatorType,
      bytes: entry.encodedBodySize,
    }),
  );
  observe(
    'event',
    (entry) =>
      F.events.push({
        at: entry.startTime,
        kind: `event:${entry.name}`,
        ms: entry.duration,
        handling: entry.processingEnd - entry.processingStart,
      }),
    { durationThreshold: 16 },
  );

  // --- The room ---------------------------------------------------------------------------------------------------
  /** Leaves the TV the way a visitor's key on the way out does (the button's own click handler). */
  F.leave = () => {
    const button = document.querySelector('.tv-way-out, .way-out');
    if (!button) throw new Error('No way out of the TV');
    F.mark('click:room');
    button.click();
  };
  let room;
  Object.defineProperty(window, '__room', {
    configurable: true,
    get: () => room,
    set(value) {
      room = value;
      if (!value) return;
      F.mark('room-ready');
      // The quality the room draws at, each time it changes (a change is a resize).
      let drawnAt = '';
      const watchQuality = () => {
        const stats = room?.stats;
        if (!stats) return;
        const now = `${stats.quality.tier}×${stats.quality.scale}`;
        if (now !== drawnAt) F.mark(`quality:${now}`);
        drawnAt = now;
        nativeTimeout(watchQuality, 200);
      };
      watchQuality();
      value.onViewChange((view) => F.mark(`change:${view}`));
      value.onSettle((view) => F.mark(`settle:${view}`));
      value.generatedReady?.then(() => {
        F.mark('room-whole');
        if (config.finishAtWhole) {
          // What the GPU still has to do of what it was handed, as the room says it is whole: the wait for it.
          const gl = document.querySelector('.room-host canvas')?.getContext('webgl2');
          const start = now();
          if (gl) {
            // A read of one pixel returns when the GPU has done everything before it (`finish()` is a flush in Chromium).
            const draw = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
            const read = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, draw);
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read);
          }
          F.mark(`gpu-finished-in:${(now() - start).toFixed(1)}`);
        }
        if (typeof config.leaveAfterWholeMs === 'number') nativeTimeout(F.leave, config.leaveAfterWholeMs);
      });
      if (typeof config.leaveAfterMs === 'number') nativeTimeout(F.leave, config.leaveAfterMs);
    },
  });

  /** Everything recorded so far, the frames from `since` (ms on the page's clock) on. */
  F.read = (since = 0) => ({
    ticks: F.ticks.filter((entry) => entry.t >= since),
    gl: F.gl.filter((entry) => entry.at >= since),
    tasks: F.tasks.filter((entry) => entry.at >= since),
    marks: F.marks,
    resources: F.resources,
    longTasks: F.longTasks.filter((entry) => entry.at >= since),
    longFrames: F.longFrames.filter((entry) => entry.at >= since),
    events: F.events.filter((entry) => entry.at >= since),
    totals: { ...F.totals },
    stats: room
      ? {
          quality: { ...room.stats.quality },
          display: room.stats.display ? { ...room.stats.display } : null,
          qualityChanges: room.stats.qualityChanges ?? null,
          programs: room.stats.programs,
          generated: room.stats.generated,
          posters: room.stats.posters,
          spotlight: room.stats.spotlight,
          radioReady: room.stats.radioReady,
          backgroundPending: room.stats.backgroundPending,
          pixelRatio: room.stats.pixelRatio,
          bake: room.stats.generatedStats,
        }
      : null,
  });
})();
