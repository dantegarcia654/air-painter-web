const video         = document.getElementById('webcam');
const paintCanvas   = document.getElementById('paintCanvas');
const overlayCanvas = document.getElementById('overlay');
const pCtx = paintCanvas.getContext('2d');
const oCtx = overlayCanvas.getContext('2d');

const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17],
];

// ── Constants ────────────────────────────────────────────────────────────────

const DRAW_STABILIZE  = 5;
const HOVER_STABILIZE = 5;
const FIST_CLEAR      = 45;
const GESTURE_FIRE    = 15;
const SCREENSHOT_FIRE = 75;  // 5× GESTURE_FIRE
const REPEAT_INTERVAL = 12;  // frames between repeat-fires for continuous gestures
const MIN_BRUSH       = 2;
const MAX_BRUSH       = 20;
const TOAST_MS        = 2200;

// ── Color config ─────────────────────────────────────────────────────────────

const COLOR_ORDER = ['#3b82f6', '#ef4444', '#22c55e', '#facc15', '#a855f7'];
const COLOR_NAMES = {
  '#3b82f6': 'Blue',
  '#ef4444': 'Red',
  '#22c55e': 'Green',
  '#facc15': 'Yellow',
  '#a855f7': 'Purple',
};

// ── Drawing state ────────────────────────────────────────────────────────────

let activeColor = '#3b82f6';
let isErasing   = false;
let isDrawing   = false;
let lastPos     = null;
let brushSize   = 5;

// ── Gesture state ────────────────────────────────────────────────────────────

let drawFrames  = 0;
let hoverFrames = 0;

// Each entry: { frames, fired }. fired prevents re-triggering for one-shot gestures.
const gState = {
  fist:         { frames: 0, fired: false },
  threeFingers: { frames: 0, fired: false },
  peace:        { frames: 0, fired: false },
  middleFinger: { frames: 0, fired: false },
  pinkyUp:      { frames: 0, fired: false },
};

// These gestures fire repeatedly while held (every REPEAT_INTERVAL frames after initial trigger).
const CONTINUOUS_GESTURES = new Set(['threeFingers', 'middleFinger', 'pinkyUp']);

// ── Toast state ──────────────────────────────────────────────────────────────

let toastText    = '';
let toastEndTime = 0;

// ── Canvas sizing ────────────────────────────────────────────────────────────

function resizeCanvases() {
  paintCanvas.width  = overlayCanvas.width  = window.innerWidth;
  paintCanvas.height = overlayCanvas.height = window.innerHeight;
}
resizeCanvases();
window.addEventListener('resize', resizeCanvases);

// ── Coordinate mapping ───────────────────────────────────────────────────────

function toScreen(lm) {
  const vw = video.videoWidth  || 1280;
  const vh = video.videoHeight || 720;
  const cw = overlayCanvas.width;
  const ch = overlayCanvas.height;
  const scale = Math.max(cw / vw, ch / vh);
  const rw = vw * scale;
  const rh = vh * scale;
  const ox = (cw - rw) / 2;
  const oy = (ch - rh) / 2;
  return {
    x: (1 - lm.x) * rw + ox,
    y: lm.y       * rh + oy,
  };
}

// ── Gesture classification ───────────────────────────────────────────────────

function isFingerUp(lm, tip, pip) {
  return lm[tip].y < lm[pip].y;
}

function getFingers(lm) {
  return {
    index:  isFingerUp(lm, 8,  6),
    middle: isFingerUp(lm, 12, 10),
    ring:   isFingerUp(lm, 16, 14),
    pinky:  isFingerUp(lm, 20, 18),
  };
}

// Returns one of: 'draw' | 'fist' | 'threeFingers' | 'peace' | 'middleFinger' | 'pinkyUp' | 'hover'
function classifyGesture(lm) {
  const f      = getFingers(lm);
  const noFour = !f.index && !f.middle && !f.ring && !f.pinky;

  if (f.index && f.middle && f.ring  && !f.pinky)  return 'threeFingers';
  if (f.index && f.middle && !f.ring && !f.pinky)  return 'peace';
  if (!f.index && f.middle && !f.ring && !f.pinky) return 'middleFinger';
  if (!f.index && !f.middle && !f.ring && f.pinky) return 'pinkyUp';
  if (noFour)                                       return 'fist';
  if (f.index && !f.middle && !f.ring && !f.pinky) return 'draw';
  return 'hover';
}

// ── Toolbar ──────────────────────────────────────────────────────────────────

let prevHoveredBtn = null;

function hitTestToolbar(screenPos) {
  const btns = document.querySelectorAll('.tool-btn');
  for (const btn of btns) {
    const r = btn.getBoundingClientRect();
    if (screenPos.x >= r.left && screenPos.x <= r.right &&
        screenPos.y >= r.top  && screenPos.y <= r.bottom) {
      return btn;
    }
  }
  return null;
}

function updateToolbarHover(btn) {
  if (btn === prevHoveredBtn) return;
  if (prevHoveredBtn) prevHoveredBtn.classList.remove('hovered');
  if (btn) btn.classList.add('hovered');
  prevHoveredBtn = btn;
}

function selectColor(color) {
  if (color === activeColor) return;
  activeColor = color;
  isErasing   = (color === 'eraser');
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === color);
  });
}

// ── Actions ──────────────────────────────────────────────────────────────────

function clearCanvas() {
  pCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'c' || e.key === 'C') clearCanvas();
});

function cycleColor() {
  const idx  = COLOR_ORDER.indexOf(activeColor);
  const next = COLOR_ORDER[(idx + 1) % COLOR_ORDER.length];
  selectColor(next);
  showToast(COLOR_NAMES[next]);
}

function adjustBrush(delta) {
  brushSize = Math.max(MIN_BRUSH, Math.min(MAX_BRUSH, brushSize + delta));
  showToast(`Brush: ${brushSize}px`);
}

function captureScreenshot() {
  const temp = document.createElement('canvas');
  temp.width  = paintCanvas.width;
  temp.height = paintCanvas.height;
  const tCtx  = temp.getContext('2d');

  // Replicate object-fit:cover sizing
  const vw    = video.videoWidth  || 1280;
  const vh    = video.videoHeight || 720;
  const cw    = temp.width;
  const ch    = temp.height;
  const scale = Math.max(cw / vw, ch / vh);
  const rw    = vw * scale;
  const rh    = vh * scale;
  const ox    = (cw - rw) / 2;
  const oy    = (ch - rh) / 2;

  // Draw video mirrored to match the CSS scaleX(-1) transform
  tCtx.save();
  tCtx.translate(ox + rw, oy);
  tCtx.scale(-1, 1);
  tCtx.drawImage(video, 0, 0, rw, rh);
  tCtx.restore();

  // Composite paint strokes on top
  tCtx.drawImage(paintCanvas, 0, 0);

  temp.toBlob((blob) => {
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = 'air-painter-screenshot.png';
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }, 'image/png');

  showToast('Screenshot saved!');
}

// ── Toast ────────────────────────────────────────────────────────────────────

function showToast(text) {
  toastText    = text;
  toastEndTime = Date.now() + TOAST_MS;
}

// ── Stroke drawing ───────────────────────────────────────────────────────────

function drawStroke(from, to) {
  pCtx.save();
  pCtx.lineCap  = 'round';
  pCtx.lineJoin = 'round';
  if (isErasing) {
    pCtx.globalCompositeOperation = 'destination-out';
    pCtx.strokeStyle = 'rgba(0,0,0,1)';
    pCtx.lineWidth   = 40;
  } else {
    pCtx.globalCompositeOperation = 'source-over';
    pCtx.strokeStyle = activeColor;
    pCtx.lineWidth   = brushSize;
  }
  pCtx.beginPath();
  pCtx.moveTo(from.x, from.y);
  pCtx.lineTo(to.x,   to.y);
  pCtx.stroke();
  pCtx.restore();
}

// ── Overlay rendering ────────────────────────────────────────────────────────

function drawSkeleton(lm) {
  oCtx.strokeStyle = 'rgba(0,255,136,0.55)';
  oCtx.lineWidth   = 2;
  oCtx.beginPath();
  for (const [a, b] of CONNECTIONS) {
    const p1 = toScreen(lm[a]);
    const p2 = toScreen(lm[b]);
    oCtx.moveTo(p1.x, p1.y);
    oCtx.lineTo(p2.x, p2.y);
  }
  oCtx.stroke();

  for (const point of lm) {
    const { x, y } = toScreen(point);
    oCtx.beginPath();
    oCtx.arc(x, y, 4, 0, Math.PI * 2);
    oCtx.fillStyle   = '#fff';
    oCtx.fill();
    oCtx.strokeStyle = '#00ff88';
    oCtx.lineWidth   = 1.5;
    oCtx.stroke();
  }
}

// Shared arc-progress widget used by all timed gestures.
function drawProgressRing(cx, cy, radius, progress, strokeColor, label, sublabel) {
  const alpha = 0.45 + 0.55 * progress;
  oCtx.save();

  // Dark fill
  oCtx.beginPath();
  oCtx.arc(cx, cy, radius, 0, Math.PI * 2);
  oCtx.fillStyle = `rgba(0,0,0,${0.4 * progress})`;
  oCtx.fill();

  // Track
  oCtx.beginPath();
  oCtx.arc(cx, cy, radius, 0, Math.PI * 2);
  oCtx.strokeStyle = 'rgba(255,255,255,0.1)';
  oCtx.lineWidth   = 6;
  oCtx.stroke();

  // Progress arc
  oCtx.beginPath();
  oCtx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
  oCtx.strokeStyle = strokeColor;
  oCtx.lineWidth   = 6;
  oCtx.lineCap     = 'round';
  oCtx.stroke();

  // Centre label
  oCtx.font         = 'bold 16px system-ui,sans-serif';
  oCtx.textAlign    = 'center';
  oCtx.textBaseline = 'middle';
  oCtx.fillStyle    = `rgba(255,255,255,${alpha})`;
  oCtx.fillText(label, cx, cy);

  // Sub-label below ring
  if (sublabel) {
    oCtx.font      = '12px system-ui,sans-serif';
    oCtx.fillStyle = `rgba(220,220,220,${alpha})`;
    oCtx.fillText(sublabel, cx, cy + radius + 16);
  }

  oCtx.restore();
}

function drawFistProgress(frames) {
  const cx  = overlayCanvas.width  / 2;
  const cy  = overlayCanvas.height / 2;
  const pct = Math.round((frames / FIST_CLEAR) * 100);
  drawProgressRing(
    cx, cy, 64,
    frames / FIST_CLEAR,
    `rgba(255,80,80,${0.5 + 0.5 * frames / FIST_CLEAR})`,
    `${pct}%`,
    'Hold fist to clear',
  );
}

const GESTURE_META = {
  threeFingers: { label: 'Next color', color: 'rgba(100,220,255,0.9)', hint: '3 fingers → cycle color' },
  peace:        { label: 'Capture',    color: 'rgba(255,215,0,0.9)',   hint: 'Peace → screenshot'     },
  middleFinger: { label: 'Brush +',   color: 'rgba(160,255,160,0.9)', hint: 'Middle → brush up'      },
  pinkyUp:      { label: 'Brush −',   color: 'rgba(160,255,160,0.9)', hint: 'Pinky → brush down'     },
};

function drawGestureProgress(gesture, frames, threshold) {
  const cx   = overlayCanvas.width  / 2;
  const cy   = overlayCanvas.height / 2;
  const meta = GESTURE_META[gesture];
  drawProgressRing(
    cx, cy, 48,
    Math.min(frames / threshold, 1),
    meta.color,
    meta.label,
    meta.hint,
  );
}

function drawCursor(pos, drawing) {
  oCtx.save();
  oCtx.beginPath();
  oCtx.arc(pos.x, pos.y, drawing ? 11 : 8, 0, Math.PI * 2);
  if (drawing) {
    oCtx.fillStyle   = isErasing ? 'rgba(255,255,255,0.25)' : activeColor + '55';
    oCtx.fill();
    oCtx.strokeStyle = isErasing ? '#fff' : activeColor;
    oCtx.lineWidth   = 3;
  } else {
    oCtx.strokeStyle = 'rgba(255,255,255,0.45)';
    oCtx.lineWidth   = 2;
  }
  oCtx.stroke();
  oCtx.restore();
}

function drawToast() {
  if (!toastText || Date.now() >= toastEndTime) return;
  const remaining = toastEndTime - Date.now();
  const alpha     = Math.min(1, remaining / 350);
  const cx        = overlayCanvas.width  / 2;
  const cy        = overlayCanvas.height - 110;

  oCtx.save();
  oCtx.font             = 'bold 20px system-ui,sans-serif';
  oCtx.textAlign        = 'center';
  oCtx.textBaseline     = 'middle';
  const tw = oCtx.measureText(toastText).width + 40;
  const th = 46;

  oCtx.fillStyle = `rgba(0,0,0,${0.62 * alpha})`;
  oCtx.beginPath();
  oCtx.roundRect(cx - tw / 2, cy - th / 2, tw, th, 23);
  oCtx.fill();

  oCtx.fillStyle = `rgba(255,255,255,${alpha})`;
  oCtx.fillText(toastText, cx, cy);
  oCtx.restore();
}

function drawBrushIndicator() {
  const cx  = 34;
  const cy  = overlayCanvas.height - 40;
  const r   = brushSize / 2;
  const bx  = cx - 22;
  const by  = cy - 30;

  oCtx.save();

  // Panel
  oCtx.fillStyle = 'rgba(0,0,0,0.48)';
  oCtx.beginPath();
  oCtx.roundRect(bx, by, 44, 52, 8);
  oCtx.fill();

  // Brush preview circle (actual size, min 2px radius for visibility)
  oCtx.beginPath();
  oCtx.arc(cx, cy - 10, Math.max(r, 2), 0, Math.PI * 2);
  oCtx.fillStyle = isErasing ? 'rgba(255,255,255,0.75)' : activeColor;
  oCtx.fill();

  // Pixel label
  oCtx.font         = 'bold 11px system-ui,sans-serif';
  oCtx.textAlign    = 'center';
  oCtx.textBaseline = 'middle';
  oCtx.fillStyle    = 'rgba(255,255,255,0.78)';
  oCtx.fillText(`${brushSize}px`, cx, cy + 15);

  oCtx.restore();
}

// ── Main frame handler ───────────────────────────────────────────────────────

function onResults(results) {
  oCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  // Persistent UI — drawn every frame regardless of hand presence
  drawBrushIndicator();
  drawToast();

  if (!results.multiHandLandmarks?.length) {
    drawFrames  = 0;
    hoverFrames = 0;
    for (const g of Object.values(gState)) { g.frames = 0; g.fired = false; }
    isDrawing = false;
    lastPos   = null;
    updateToolbarHover(null);
    return;
  }

  const lm      = results.multiHandLandmarks[0];
  const tipPos  = toScreen(lm[8]);
  const gesture = classifyGesture(lm);

  // ── Reset all inactive gesture counters ──
  for (const [key, g] of Object.entries(gState)) {
    if (key !== gesture) { g.frames = 0; g.fired = false; }
  }

  // ── Draw mode counter (separate from one-shot gestures) ──
  if (gesture === 'draw') {
    drawFrames  = Math.min(drawFrames + 1, DRAW_STABILIZE);
    hoverFrames = 0;
  } else {
    hoverFrames = Math.min(hoverFrames + 1, HOVER_STABILIZE);
    drawFrames  = 0;
  }

  if (drawFrames  >= DRAW_STABILIZE)                    isDrawing = true;
  if (hoverFrames >= HOVER_STABILIZE && isDrawing) { isDrawing = false; lastPos = null; }

  // ── Gesture handling ──
  if (gesture in gState) {
    const g         = gState[gesture];
    const threshold = gesture === 'fist'  ? FIST_CLEAR
                    : gesture === 'peace' ? SCREENSHOT_FIRE
                    : GESTURE_FIRE;
    g.frames++;

    if (CONTINUOUS_GESTURES.has(gesture)) {
      // Continuous: fire at threshold, then every REPEAT_INTERVAL frames.
      if (g.frames >= threshold && (g.frames - threshold) % REPEAT_INTERVAL === 0) {
        switch (gesture) {
          case 'threeFingers': cycleColor();    break;
          case 'middleFinger': adjustBrush(+2); break;
          case 'pinkyUp':      adjustBrush(-2); break;
        }
      }
      // Show progress ring only during the initial build-up.
      if (g.frames < threshold) drawGestureProgress(gesture, g.frames, threshold);

    } else {
      // One-shot: fire exactly once when threshold is reached.
      if (!g.fired && g.frames >= threshold) {
        g.fired = true;
        switch (gesture) {
          case 'fist':  clearCanvas();       break;
          case 'peace': captureScreenshot(); break;
        }
      }
      if (!g.fired && g.frames > 0) {
        gesture === 'fist'
          ? drawFistProgress(g.frames)
          : drawGestureProgress(gesture, g.frames, threshold);
      }
    }
  }

  // ── Toolbar hover (disabled during active gestures) ──
  const isActiveGesture = gesture !== 'draw' && gesture !== 'hover';
  let overToolbar = false;

  if (!isActiveGesture) {
    const hitBtn = hitTestToolbar(tipPos);
    updateToolbarHover(hitBtn);
    if (hitBtn) {
      selectColor(hitBtn.dataset.color);
      overToolbar = true;
      lastPos = null;
    }
  } else {
    updateToolbarHover(null);
  }

  // ── Stroke ──
  if (isDrawing && !overToolbar) {
    if (lastPos) drawStroke(lastPos, tipPos);
    lastPos = { ...tipPos };
  } else if (!isDrawing) {
    lastPos = null;
  }

  // ── Hand overlay ──
  drawSkeleton(lm);
  drawCursor(tipPos, isDrawing && !overToolbar);
}

// ── MediaPipe setup ──────────────────────────────────────────────────────────

const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence:  0.5,
});

hands.onResults(onResults);

const camera = new Camera(video, {
  onFrame: async () => { await hands.send({ image: video }); },
  width:  1280,
  height: 720,
});

camera.start().catch((err) => {
  console.error('Camera start failed:', err);
  document.body.insertAdjacentHTML(
    'beforeend',
    '<p style="color:white;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-family:sans-serif;">Camera access denied. Please allow camera permission and reload.</p>',
  );
});
