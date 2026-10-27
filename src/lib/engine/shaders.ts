/** Triunghi pe tot ecranul, fără atribute (gl_VertexID). */
export const FULLSCREEN_VS = /* glsl */ `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Copiere simplă (folosită la micșorarea sursei cu mipmap-uri). */
export const COPY_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
uniform sampler2D uSrc;
out vec4 outColor;
void main() {
  outColor = vec4(texture(uSrc, vUv).rgb, 1.0);
}`;

/** Blur gaussian separabil. */
export const BLUR_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uDir;     // pas în UV (texel * direcție)
uniform float uSigma;  // în texeli
out vec4 outColor;
void main() {
  vec3 sum = vec3(0.0);
  float wsum = 0.0;
  for (int i = -12; i <= 12; i++) {
    float x = float(i);
    float w = exp(-(x * x) / (2.0 * uSigma * uSigma));
    sum += texture(uSrc, vUv + uDir * x).rgb * w;
    wsum += w;
  }
  outColor = vec4(sum / wsum, 1.0);
}`;

/**
 * Pasul principal de "developare" (similar Lightroom): toate ajustările de
 * culoare/ton într-un singur shader, aplicate pe imaginea sursă.
 */
export const DEVELOP_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;
precision highp sampler3D;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uImage;
uniform sampler2D uBlur;
uniform sampler2D uCurves;
uniform sampler3D uLut;

uniform vec2 uTexel;
uniform float uExposure;
uniform vec3 uWb;
uniform float uContrast;
uniform float uHighlights;
uniform float uShadows;
uniform float uWhites;
uniform float uBlacks;
uniform float uClarity;
uniform float uDehaze;
uniform float uSharpen;
uniform float uDenoise;
uniform float uVibrance;
uniform float uSaturation;
uniform vec3 uHsl[8];
uniform bool uUseHsl;
uniform vec3 uGradeS;
uniform vec3 uGradeM;
uniform vec3 uGradeH;
uniform float uGradeBalance;
uniform float uFade;
uniform bool uUseCurves;
uniform bool uUseLut;
uniform float uLutSize;
uniform float uLutAmount;
uniform vec3 uLutDomainMin;
uniform vec3 uLutDomainMax;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

float luma(vec3 c) { return dot(c, LUMA); }

vec3 toLinear(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

vec3 toSrgb(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

const float CENTERS[9] = float[9](0.0, 30.0, 60.0, 120.0, 180.0, 240.0, 270.0, 300.0, 360.0);

vec3 hslWeights(float hueDeg) {
  for (int i = 0; i < 8; i++) {
    float a = CENTERS[i];
    float b = CENTERS[i + 1];
    if (hueDeg < b || i == 7) {
      float t = clamp((hueDeg - a) / (b - a), 0.0, 1.0);
      t = t * t * (3.0 - 2.0 * t);
      return mix(uHsl[i], uHsl[(i + 1) % 8], t);
    }
  }
  return uHsl[0];
}

float curve(float x, int ch) {
  float v = texture(uCurves, vec2(clamp(x, 0.0, 1.0) * (255.0 / 256.0) + 0.5 / 256.0, 0.5))[ch];
  return v;
}

void main() {
  vec3 src = texture(uImage, vUv).rgb;

  // --- reducere zgomot (filtru bilateral 5x5) ---
  if (uDenoise > 0.0) {
    vec3 sum = vec3(0.0);
    float wsum = 0.0;
    float sr = 0.015 + uDenoise * 0.11;
    float inv = 1.0 / (2.0 * sr * sr);
    for (int y = -2; y <= 2; y++) {
      for (int x = -2; x <= 2; x++) {
        vec2 o = vec2(float(x), float(y));
        vec3 s = texture(uImage, vUv + o * uTexel).rgb;
        vec3 d = s - src;
        float w = exp(-dot(o, o) / 4.5 - dot(d, d) * inv);
        sum += s * w;
        wsum += w;
      }
    }
    src = sum / wsum;
  }

  // --- sharpen (unsharp mask pe luminanță) ---
  if (uSharpen > 0.0) {
    vec3 n = texture(uImage, vUv + vec2(uTexel.x, 0.0)).rgb
           + texture(uImage, vUv - vec2(uTexel.x, 0.0)).rgb
           + texture(uImage, vUv + vec2(0.0, uTexel.y)).rgb
           + texture(uImage, vUv - vec2(0.0, uTexel.y)).rgb;
    vec3 dg = texture(uImage, vUv + uTexel).rgb
            + texture(uImage, vUv - uTexel).rgb
            + texture(uImage, vUv + vec2(uTexel.x, -uTexel.y)).rgb
            + texture(uImage, vUv + vec2(-uTexel.x, uTexel.y)).rgb;
    vec3 blurred = (texture(uImage, vUv).rgb * 4.0 + n * 2.0 + dg) / 16.0;
    float detail = luma(src) - luma(blurred);
    src = clamp(src + detail * uSharpen * 2.2, 0.0, 1.0);
  }

  // --- spațiu liniar: balans de alb + expunere ---
  float gain = exp2(uExposure);
  vec3 c = toLinear(src) * uWb * gain;
  vec3 bl = toLinear(texture(uBlur, vUv).rgb) * uWb * gain;

  // --- anti-ceață ---
  if (uDehaze > 0.0) {
    float dark = min(min(bl.r, bl.g), bl.b);
    float h = clamp(dark * uDehaze * 0.95, 0.0, 0.9);
    c = max(c - h, 0.0) / (1.0 - h);
    bl = max(bl - h, 0.0) / (1.0 - h);
  } else if (uDehaze < 0.0) {
    float h = -uDehaze * 0.55;
    vec3 veil = vec3(0.72);
    c = mix(c, veil, h * (0.4 + 0.6 * (1.0 - luma(c))));
    bl = mix(bl, veil, h * (0.4 + 0.6 * (1.0 - luma(bl))));
  }

  // --- spațiu perceptual (sRGB) pentru tonuri ---
  vec3 p = toSrgb(c);
  float Lb = luma(toSrgb(bl));

  // punct de alb / negru
  float bp = -uBlacks * 0.12;
  float wp = 1.0 - uWhites * 0.22;
  p = (p - bp) / (wp - bp);
  Lb = (Lb - bp) / (wp - bp);

  // detaliu local pentru claritate (înainte de umbre/lumini)
  float detail = luma(p) - Lb;

  // umbre / lumini
  float L = luma(p);
  float Lc = clamp(L, 0.0, 1.0);
  float delta = uShadows * 2.4 * Lc * pow(1.0 - Lc, 3.0);
  if (uHighlights > 0.0) {
    delta += uHighlights * 2.4 * pow(Lc, 3.0) * (1.0 - Lc);
  } else {
    delta += uHighlights * smoothstep(0.45, 1.0, L) * max(L - 0.45, 0.0) * 0.6;
  }
  float Ln = max(L + delta, 0.0);
  float ratio = min(Ln / max(L, 1e-4), 4.0);
  p = mix(p * ratio, p + (Ln - L), 0.5);

  // claritate (contrast local în tonurile medii)
  if (uClarity != 0.0) {
    float lm = clamp(luma(p), 0.0, 1.0);
    float mid = 1.0 - pow(abs(2.0 * lm - 1.0), 2.0);
    p += detail * uClarity * mid * 1.3;
  }

  p = clamp(p, 0.0, 1.0);

  // contrast (curbă S în jurul tonurilor medii)
  if (uContrast != 0.0) {
    float k = exp2(uContrast * 1.1);
    vec3 lo = 0.5 * pow(2.0 * p, vec3(k));
    vec3 hi = 1.0 - 0.5 * pow(2.0 * (1.0 - p), vec3(k));
    p = mix(lo, hi, step(0.5, p));
  }

  // vibranță + saturație
  {
    float l = luma(p);
    float mx = max(p.r, max(p.g, p.b));
    float mn = min(p.r, min(p.g, p.b));
    float sat = mx - mn;
    float vib = uVibrance * (1.0 - smoothstep(0.0, 0.75, sat));
    if (uVibrance > 0.0) {
      // protejează tonurile pielii (portocaliu)
      float hue = rgb2hsv(p).x * 360.0;
      float skin = smoothstep(10.0, 25.0, hue) * (1.0 - smoothstep(45.0, 60.0, hue));
      vib *= 1.0 - 0.5 * skin;
    }
    p = mix(vec3(l), p, max(0.0, 1.0 + uSaturation + vib));
  }

  p = clamp(p, 0.0, 1.0);

  // HSL pe benzi de culoare
  if (uUseHsl) {
    vec3 hsv = rgb2hsv(p);
    vec3 a = hslWeights(hsv.x * 360.0);
    float sw = smoothstep(0.02, 0.25, hsv.y);
    hsv.x = fract(hsv.x + a.x * sw * (30.0 / 360.0) + 1.0);
    hsv.y = clamp(hsv.y * (1.0 + a.y * sw), 0.0, 1.0);
    vec3 rgb = hsv2rgb(hsv);
    rgb *= 1.0 + a.z * sw * 0.6;
    p = clamp(rgb, 0.0, 1.0);
  }

  // color grading (umbre / tonuri medii / lumini)
  {
    float lg = clamp(luma(p), 0.0, 1.0);
    float b = 0.5 + uGradeBalance * 0.25;
    float wS = 1.0 - smoothstep(0.0, b, lg);
    float wH = smoothstep(b, 1.0, lg);
    float wM = clamp(1.0 - wS - wH, 0.0, 1.0);
    p += uGradeS * wS + uGradeM * wM + uGradeH * wH;
  }

  p = clamp(p, 0.0, 1.0);

  // curbe: master (A) apoi pe canale
  if (uUseCurves) {
    p = vec3(curve(p.r, 3), curve(p.g, 3), curve(p.b, 3));
    p = vec3(curve(p.r, 0), curve(p.g, 1), curve(p.b, 2));
  }

  // LUT 3D (.cube)
  if (uUseLut) {
    vec3 q = clamp((p - uLutDomainMin) / (uLutDomainMax - uLutDomainMin), 0.0, 1.0);
    vec3 lc = texture(uLut, q * ((uLutSize - 1.0) / uLutSize) + 0.5 / uLutSize).rgb;
    p = mix(p, lc, uLutAmount);
  }

  // decolorare (fade)
  p = mix(p, p * 0.86 + 0.09, uFade);

  outColor = vec4(clamp(p, 0.0, 1.0), 1.0);
}`;

/**
 * Pasul de ieșire: geometrie (crop/rotire/oglindire), vignetă, granulație,
 * comparare înainte/după. Folosit pentru ecran, export și miniaturi.
 */
export const OUTPUT_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D uProc;
uniform sampler2D uOrig;
uniform mat3 uPxToContent;
uniform mat3 uContentToFrame;
uniform mat3 uFrameToSource;
uniform vec4 uCrop;
uniform vec2 uCropPx;
uniform float uSplit;
uniform vec3 uBg;
uniform bool uEffects;
uniform float uVignette;
uniform float uVigMid;
uniform float uVigFeather;
uniform float uVigRound;
uniform float uGrain;
uniform float uGrainSize;

out vec4 outColor;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

float hash(vec2 p) {
  uvec2 q = uvec2(ivec2(floor(p))) * uvec2(1597334673u, 3812015801u);
  uint n = (q.x ^ q.y) * 1597334673u;
  return float(n) * (1.0 / 4294967295.0);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 cuv = (uPxToContent * vec3(gl_FragCoord.xy, 1.0)).xy;
  vec2 fuv = (uContentToFrame * vec3(cuv, 1.0)).xy;
  vec2 suv = (uFrameToSource * vec3(fuv, 1.0)).xy;
  vec2 gx = dFdx(suv);
  vec2 gy = dFdy(suv);
  vec3 after = textureGrad(uProc, suv, gx, gy).rgb;
  vec3 before = textureGrad(uOrig, suv, gx, gy).rgb;

  if (cuv.x < 0.0 || cuv.y < 0.0 || cuv.x > 1.0 || cuv.y > 1.0) {
    outColor = vec4(uBg, 1.0);
    return;
  }

  if (gl_FragCoord.x < uSplit) {
    outColor = vec4(before, 1.0);
    return;
  }

  vec3 c = after;
  if (uEffects) {
    vec2 kuv = (fuv - uCrop.xy) / uCrop.zw;
    float aspect = uCropPx.x / uCropPx.y;

    if (uVignette != 0.0) {
      vec2 v = (kuv - 0.5) * 2.0;
      float ar = mix(1.0, aspect, uVigRound);
      v.x *= ar;
      v /= min(ar, 1.0);
      float d = length(v);
      float mid = mix(0.25, 1.25, uVigMid);
      float feather = mix(0.08, 1.3, uVigFeather);
      float m = smoothstep(mid, mid + feather, d);
      if (uVignette < 0.0) c *= 1.0 + uVignette * 0.9 * m;
      else c = mix(c, vec3(1.0), uVignette * 0.9 * m);
    }

    if (uGrain > 0.0) {
      float freq = mix(1400.0, 220.0, uGrainSize);
      vec2 gp = kuv * vec2(aspect, 1.0) * freq;
      float n = vnoise(gp) + 0.5 * vnoise(gp * 2.13 + 17.0) - 0.75;
      float l = dot(c, LUMA);
      float w = 1.0 - pow(abs(2.0 * l - 1.0), 2.0) * 0.65;
      c += n * uGrain * 0.24 * w;
    }
  }

  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;
