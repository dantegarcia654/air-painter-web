# Air Painter

A browser-based drawing app controlled entirely by hand gestures — no mouse, no touchscreen, no install required. Hold up your hand in front of your webcam and paint in the air using computer vision.

**Live Demo:** coming soon

---

## How It Works

Air Painter uses your device's webcam to track your hand in real time. A machine learning model detects the 21 landmarks of your hand skeleton every frame and maps their positions onto a canvas layered over the video feed. Gesture logic reads which fingers are extended each frame, applies stabilization to prevent flickering, and translates poses into drawing actions.

### Tech Stack

| Layer | Technology |
|---|---|
| Structure | HTML5 |
| Styling | CSS3 |
| Logic | Vanilla JavaScript |
| Hand tracking | [MediaPipe Hands](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker) (browser, via CDN) |

No backend. No build step. Everything runs in the browser.

---

## Gestures

| Gesture | Action |
|---|---|
| ☝️ Index finger up | **Draw** — traces a colored line as your fingertip moves |
| 🖐️ Open palm | **Hover / rest** — lifts the pen, no stroke drawn |
| ✌️ Peace sign | **Screenshot** — hold for ~2.5 seconds to save canvas as PNG |
| 🖕 Middle finger only | **Increase brush size** — hold to continuously grow (2–20px) |
| 🤙 Pinky only | **Decrease brush size** — hold to continuously shrink (2–20px) |
| 🤟 Three fingers (index + middle + ring) | **Cycle colors** — hold to step through the color palette |
| ✊ Fist | **Clear canvas** — hold for ~1.5 seconds to wipe the canvas |

**Bonus:** Hover your index fingertip over any color in the toolbar at the top of the screen to instantly switch to that color. Press **C** on your keyboard to clear the canvas instantly.

---

## Getting Started

No installation or account needed.

1. Open the live link in any modern browser (Chrome or Edge recommended)
2. Allow camera access when prompted
3. Hold your hand up in front of the webcam and start painting

Works on desktop and laptop — any device with a front-facing camera and a modern browser.

---

## What I Learned

Building Air Painter taught me how to bridge computer vision and creative tooling entirely in the browser. A few highlights:

- **MediaPipe in the browser** — running an ML hand-tracking model client-side at 30fps with no server felt like magic the first time it worked. Understanding how to consume the 21-landmark output and map it to screen coordinates (accounting for `object-fit: cover` and CSS mirror transforms) required careful coordinate math.

- **Gesture stabilization** — raw landmark data is noisy. A single misread frame would cause the drawing mode to flicker on and off. Implementing per-gesture frame counters that require N consecutive matching frames before a mode transition eliminated the jitter entirely.

- **Canvas layering** — separating the persistent paint strokes (`paintCanvas`) from the per-frame hand skeleton overlay (`overlayCanvas`) was key. Clearing and redrawing the overlay every frame for the skeleton without wiping the painting required two stacked canvases with careful z-indexing.

- **Continuous vs. one-shot gestures** — some actions (brush resize, color cycling) feel natural as held repeating inputs, while others (screenshot, clear) need a deliberate hold-to-confirm pattern with a visible progress indicator to prevent accidental triggers.

- **Screenshot compositing** — capturing the final image meant replicating the browser's `object-fit: cover` crop and `scaleX(-1)` mirror transform in a temporary off-screen canvas before merging the video frame with the paint layer.
