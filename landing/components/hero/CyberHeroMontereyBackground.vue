<script setup lang="ts">
import type { NeatConfig, NeatController } from "@firecms/neat";

const canvasRef = ref<HTMLCanvasElement | null>(null);
const isLive = ref(false);

let gradient: NeatController | null = null;
let heroObserver: IntersectionObserver | null = null;
let motionQuery: MediaQueryList | null = null;
let mobileQuery: MediaQueryList | null = null;
let isVisible = false;
let isInitializing = false;
let initToken = 0;
let revealTimer: number | null = null;

const montereyConfig: NeatConfig = {
  colors: [
    { color: "#130437", enabled: true },
    { color: "#B34BD0", enabled: true },
    { color: "#210751", enabled: true },
    { color: "#3511A5", enabled: true },
    { color: "#8F3E8D", enabled: false },
    { color: "#FF9A9E", enabled: false },
  ],
  speed: 4.8,
  horizontalPressure: 7,
  verticalPressure: 3,
  waveFrequencyX: 0,
  waveFrequencyY: 0,
  waveAmplitude: 0,
  shadows: 4,
  highlights: 0,
  colorBrightness: 1.92,
  colorSaturation: 2.18,
  wireframe: false,
  colorBlending: 9,
  backgroundColor: "#030012",
  backgroundAlpha: 1,
  grainScale: 6,
  grainSparsity: 0,
  grainIntensity: 0.1,
  grainSpeed: 0,
  resolution: 0.32,
  yOffset: 150,
  flowDistortionA: 0.4,
  flowDistortionB: 10,
  flowScale: 3.3,
  flowEase: 0.37,
  enableProceduralTexture: false,
  textureVoidLikelihood: 0.06,
  textureVoidWidthMin: 10,
  textureVoidWidthMax: 500,
  textureBandDensity: 0.8,
  textureColorBlending: 0.06,
  textureSeed: 333,
  textureEase: 0.38,
  proceduralBackgroundColor: "#003FFF",
  textureShapeTriangles: 20,
  textureShapeCircles: 15,
  textureShapeBars: 15,
  textureShapeSquiggles: 10,
  yOffsetWaveMultiplier: 4.5,
  yOffsetColorMultiplier: 4.8,
  yOffsetFlowMultiplier: 5.2,
  flowEnabled: true,
};

function supportsWebGl() {
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2") || canvas.getContext("webgl");
    const isSupported = Boolean(context);
    context?.getExtension("WEBGL_lose_context")?.loseContext();
    return isSupported;
  } catch {
    return false;
  }
}

function shouldUseLiveGradient() {
  return Boolean(
    canvasRef.value &&
      isVisible &&
      !motionQuery?.matches &&
      !mobileQuery?.matches &&
      supportsWebGl(),
  );
}

function destroyGradient() {
  initToken += 1;
  if (revealTimer !== null) {
    window.clearTimeout(revealTimer);
    revealTimer = null;
  }
  gradient?.destroy();
  gradient = null;
  isLive.value = false;
}

async function initGradient() {
  if (gradient || isInitializing || !shouldUseLiveGradient()) return;

  const token = initToken;
  isInitializing = true;

  try {
    const { NeatGradient } = await import("@firecms/neat");

    if (token !== initToken || !canvasRef.value || !shouldUseLiveGradient()) return;

    gradient = new NeatGradient({
      ref: canvasRef.value,
      ...montereyConfig,
      resolution: window.devicePixelRatio > 1 ? 0.24 : 0.34,
    });
    revealTimer = window.setTimeout(() => {
      revealTimer = null;
      if (token === initToken && gradient && shouldUseLiveGradient()) {
        isLive.value = true;
      }
    }, 180);
  } catch (error) {
    console.warn("Monterey hero background is unavailable", error);
    destroyGradient();
  } finally {
    isInitializing = false;
  }
}

function syncGradient() {
  if (shouldUseLiveGradient()) {
    void initGradient();
    return;
  }

  destroyGradient();
}

onMounted(() => {
  motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  mobileQuery = window.matchMedia("(max-width: 700px)");
  motionQuery.addEventListener("change", syncGradient);
  mobileQuery.addEventListener("change", syncGradient);

  heroObserver = new IntersectionObserver(
    ([entry]) => {
      isVisible = Boolean(entry?.isIntersecting);
      syncGradient();
    },
    { rootMargin: "160px 0px", threshold: 0.01 },
  );

  const target = canvasRef.value?.closest(".cyber-hero");
  if (target) heroObserver.observe(target);
});

onBeforeUnmount(() => {
  heroObserver?.disconnect();
  motionQuery?.removeEventListener("change", syncGradient);
  mobileQuery?.removeEventListener("change", syncGradient);
  destroyGradient();
});
</script>

<template>
  <div
    class="cyber-hero__monterey"
    :class="{ 'cyber-hero__monterey--live': isLive }"
    aria-hidden="true"
  >
    <canvas ref="canvasRef" class="cyber-hero__monterey-canvas" />
  </div>
</template>
