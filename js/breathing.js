/* ============================================
   Firefly Breathing Exercise — vanilla JS port
   Ported from FieldVoices BreathingExercise.tsx
   60 seconds, 5 progressive breaths, canvas fireflies.
   ============================================ */

(function () {
  "use strict";

  const BREATH_TIMINGS = [
    { exhale: 4500, inhale: 4500 },
    { exhale: 5500, inhale: 5500 },
    { exhale: 7500, inhale: 5500 },
    { exhale: 6500, inhale: 6500 },
    { exhale: 7000, inhale: 7000 },
  ];

  const PROMPTS = [
    { exhale: "Let it out", inhale: "Breathe in" },
    { exhale: "Notice where your breath is going", inhale: "" },
    { exhale: "Let it out\u2026\na little longer if you can", inhale: "Breathe in" },
    { exhale: "Let it out", inhale: "Breathe in" },
    { exhale: "Let it out", inhale: "" },
  ];

  const NUM_FIREFLIES = 30;
  const TRAIL_STEPS = 5;

  // Cumulative timeline
  const TIMELINE = (() => {
    let t = 0;
    const entries = [];
    for (let i = 0; i < BREATH_TIMINGS.length; i++) {
      const { exhale, inhale } = BREATH_TIMINGS[i];
      entries.push({ start: t, exhaleEnd: t + exhale, end: t + exhale + inhale, idx: i });
      t += exhale + inhale;
    }
    return { entries, total: t };
  })();

  function cubicBezier(t, p0, p1, p2, p3) {
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
  }

  function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function generateFireflies(ox, oy, w, h, direction, prevEnds) {
    const flies = [];
    const overX = w * 0.04;
    const overY = h * 0.04;

    for (let i = 0; i < NUM_FIREFLIES; i++) {
      const destX = -overX + Math.random() * (w + overX * 2);
      const destY = -overY + Math.random() * (h + overY * 2);
      let sx, sy, ex, ey;

      if (direction === "out") {
        sx = ox + (Math.random() - 0.5) * 10;
        sy = oy + (Math.random() - 0.5) * 10;
        ex = destX;
        ey = destY;
      } else {
        sx = prevEnds && prevEnds[i] ? prevEnds[i].x : destX;
        sy = prevEnds && prevEnds[i] ? prevEnds[i].y : destY;
        ex = ox + (Math.random() - 0.5) * 8;
        ey = oy + (Math.random() - 0.5) * 8;
      }

      const mx = (sx + ex) / 2;
      const my = (sy + ey) / 2;
      const spread = Math.max(w, h) * 0.38;

      flies.push({
        sx, sy, ex, ey,
        c1x: mx + (Math.random() - 0.5) * spread,
        c1y: my + (Math.random() - 0.5) * spread,
        c2x: mx + (Math.random() - 0.5) * spread,
        c2y: my + (Math.random() - 0.5) * spread,
        radius: 1.5 + Math.random() * 2.5,
        brightness: 0.45 + Math.random() * 0.55,
        speedOffset: (Math.random() - 0.5) * 0.18,
        wobbleAmp: 0.6 + Math.random() * 2.2,
        wobbleFreq: 1.2 + Math.random() * 2.8,
        wobblePhase: Math.random() * Math.PI * 2,
      });
    }
    return flies;
  }

  /**
   * Mount the breathing exercise inside a target container.
   * @param {HTMLElement} container - The element to fill with the overlay
   * @param {Function} onComplete - Called when the user clicks "Return to your work"
   */
  function mountBreathing(container, onComplete) {
    container.classList.add("breathing-mounted");
    container.innerHTML = `
      <div class="breathing-backdrop"></div>
      <canvas class="breathing-canvas" aria-hidden="true"></canvas>
      <div class="breathing-prompt-layer" aria-live="polite">
        <p class="breathing-prompt"></p>
      </div>
      <div class="breathing-closing" style="display:none;">
        <div class="breathing-closing-inner">
          <p class="breathing-closing-main">One task at a time.</p>
          <p class="breathing-closing-sub">If this still feels heavy, go find a human.<br>That's not weakness. That's wisdom.</p>
          <button type="button" class="breathing-close-btn">Return to your work</button>
        </div>
      </div>
      <div class="sr-only" aria-live="assertive"></div>
    `;

    const canvas = container.querySelector(".breathing-canvas");
    const promptEl = container.querySelector(".breathing-prompt");
    const promptLayer = container.querySelector(".breathing-prompt-layer");
    const closingEl = container.querySelector(".breathing-closing");
    const closeBtn = container.querySelector(".breathing-close-btn");
    const srEl = container.querySelector(".sr-only");

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const originX = w - 32;
    const originY = 24;

    const INTRO_DELAY = 900;
    let startTime = performance.now() + INTRO_DELAY;
    let fireflies = [];
    let prevBreath = -1;
    let prevPhase = null;
    let done = false;
    let rafId = 0;

    // Fade in
    requestAnimationFrame(() => {
      container.style.opacity = "1";
    });

    // Set first prompt
    const promptTimer = setTimeout(() => {
      setPrompt(PROMPTS[0].exhale);
    }, INTRO_DELAY + 200);

    function setPrompt(text) {
      promptEl.style.opacity = "0";
      setTimeout(() => {
        promptEl.innerHTML = "";
        if (!text) return;
        srEl.textContent = text;
        const lines = text.split("\n");
        lines.forEach((line, li) => {
          if (li > 0) promptEl.appendChild(document.createElement("br"));
          const words = line.split(/\s+/).filter(Boolean);
          words.forEach((word, wi) => {
            const span = document.createElement("span");
            span.className = "breath-word";
            span.textContent = word;
            span.style.animationDelay = (wi * 300) + "ms";
            promptEl.appendChild(span);
            if (wi < words.length - 1) promptEl.appendChild(document.createTextNode(" "));
          });
        });
        promptEl.style.opacity = "1";
      }, 500);
    }

    function tick() {
      if (done) return;

      const now = performance.now();
      const elapsed = now - startTime;

      if (elapsed < 0) {
        ctx.clearRect(0, 0, w, h);
        rafId = requestAnimationFrame(tick);
        return;
      }

      if (elapsed >= TIMELINE.total) {
        done = true;
        promptEl.style.opacity = "0";
        setTimeout(() => {
          closingEl.style.display = "flex";
          closingEl.style.animation = "gentle-fade-in 2.5s ease-in-out both";
        }, 600);
        return;
      }

      // Find current breath & phase
      let breathIdx = 0;
      let phase = "exhale";
      let phaseProgress = 0;

      for (const entry of TIMELINE.entries) {
        if (elapsed >= entry.start && elapsed < entry.end) {
          breathIdx = entry.idx;
          if (elapsed < entry.exhaleEnd) {
            phase = "exhale";
            phaseProgress = (elapsed - entry.start) / BREATH_TIMINGS[breathIdx].exhale;
          } else {
            phase = "inhale";
            phaseProgress = (elapsed - entry.exhaleEnd) / BREATH_TIMINGS[breathIdx].inhale;
          }
          break;
        }
      }

      // Phase transition
      if (breathIdx !== prevBreath || phase !== prevPhase) {
        if (phase === "exhale") {
          fireflies = generateFireflies(originX, originY, w, h, "out");
        } else {
          const prevEnds = fireflies.map((f) => ({ x: f.ex, y: f.ey }));
          fireflies = generateFireflies(originX, originY, w, h, "in", prevEnds);
        }
        prevBreath = breathIdx;
        prevPhase = phase;

        const prompt = PROMPTS[breathIdx];
        const newText = phase === "exhale" ? prompt.exhale : prompt.inhale;
        setPrompt(newText);
      }

      ctx.clearRect(0, 0, w, h);

      if (reducedMotion) {
        for (const fly of fireflies) {
          ctx.beginPath();
          ctx.arc(fly.ex, fly.ey, fly.radius, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(212, 184, 92, " + (fly.brightness * 0.5) + ")";
          ctx.fill();
        }
        rafId = requestAnimationFrame(tick);
        return;
      }

      const t = Math.max(0, Math.min(1, phaseProgress));
      const breathAmt = phase === "exhale" ? easeInOutQuad(t) : 1 - easeInOutQuad(t);
      const ambientAlpha = 0.015 + breathAmt * 0.035;
      const ambientGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.55);
      ambientGrad.addColorStop(0, "rgba(201, 168, 76, " + ambientAlpha + ")");
      ambientGrad.addColorStop(1, "rgba(201, 168, 76, 0)");
      ctx.fillStyle = ambientGrad;
      ctx.fillRect(0, 0, w, h);

      for (const fly of fireflies) {
        const ft = Math.max(0, Math.min(1, t + fly.speedOffset));
        const eased = easeInOutQuad(ft);

        const x = cubicBezier(eased, fly.sx, fly.c1x, fly.c2x, fly.ex);
        const y = cubicBezier(eased, fly.sy, fly.c1y, fly.c2y, fly.ey);

        const wx = Math.sin(now * 0.001 * fly.wobbleFreq + fly.wobblePhase) * fly.wobbleAmp;
        const wy = Math.cos(now * 0.001 * fly.wobbleFreq + fly.wobblePhase + 1.2) * fly.wobbleAmp;
        const fx = x + wx;
        const fy = y + wy;

        const pulse = 0.72 + 0.28 * Math.sin(now * 0.0018 + fly.wobblePhase);
        const opacity = fly.brightness * pulse;

        // Trail
        for (let ti = TRAIL_STEPS; ti >= 1; ti--) {
          const trailT = Math.max(0, Math.min(1, eased - ti * 0.022));
          const tx = cubicBezier(trailT, fly.sx, fly.c1x, fly.c2x, fly.ex) + wx * 0.4;
          const ty = cubicBezier(trailT, fly.sy, fly.c1y, fly.c2y, fly.ey) + wy * 0.4;
          const ta = opacity * (1 - ti / (TRAIL_STEPS + 1)) * 0.25;
          const tr = fly.radius * (1 - ti * 0.08);
          ctx.beginPath();
          ctx.arc(tx, ty, Math.max(0.4, tr), 0, Math.PI * 2);
          ctx.fillStyle = "rgba(201, 168, 76, " + ta + ")";
          ctx.fill();
        }

        // Bloom
        const bloomR = fly.radius * 5.5;
        const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, bloomR);
        grad.addColorStop(0, "rgba(228, 206, 120, " + (opacity * 0.45) + ")");
        grad.addColorStop(0.3, "rgba(212, 184, 92, " + (opacity * 0.12) + ")");
        grad.addColorStop(0.7, "rgba(201, 168, 76, " + (opacity * 0.03) + ")");
        grad.addColorStop(1, "rgba(201, 168, 76, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(fx - bloomR, fy - bloomR, bloomR * 2, bloomR * 2);

        // Inner halo
        ctx.beginPath();
        ctx.arc(fx, fy, fly.radius * 1.8, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(220, 195, 105, " + (opacity * 0.35) + ")";
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(fx, fy, fly.radius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(245, 225, 150, " + (opacity * 0.92) + ")";
        ctx.fill();
      }

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);

    closeBtn.addEventListener("click", () => {
      container.style.opacity = "0";
      setTimeout(() => {
        cancelAnimationFrame(rafId);
        clearTimeout(promptTimer);
        if (typeof onComplete === "function") onComplete();
      }, 1500);
    });

    // Cleanup on unload
    return function cleanup() {
      cancelAnimationFrame(rafId);
      clearTimeout(promptTimer);
      done = true;
    };
  }

  // Expose globally
  window.AidedEQBreathing = { mount: mountBreathing };
})();
