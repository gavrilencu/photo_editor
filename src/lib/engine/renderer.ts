import type { CropRect, Curves, EditState } from "@/lib/editor/types";
import { type Affine, toMat3 } from "./affine";
import { curveToTable } from "./curves";
import { type Lut3D, lutRegistry } from "./lut";
import { BLUR_FS, COPY_FS, DEVELOP_FS, FULLSCREEN_VS, OUTPUT_FS } from "./shaders";
import { developUniforms, effectUniforms } from "./uniforms";

interface Program {
  prog: WebGLProgram;
  loc: (name: string) => WebGLUniformLocation | null;
}

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  w: number;
  h: number;
  mips: boolean;
}

interface Pipeline {
  src: WebGLTexture;
  w: number;
  h: number;
  blurA: Target | null;
  blurB: Target | null;
  proc: Target | null;
  procMips: boolean;
}

/** Parametrii pasului de ieșire (ecran / export / miniaturi). */
export interface OutputParams {
  /** gl_FragCoord (pixeli) → conținut UV */
  pxToContent: Affine;
  contentToFrame: Affine;
  frameToSource: Affine;
  crop: CropRect;
  /** Dimensiunea crop-ului în pixeli (pentru proporția vignetei/granulației). */
  cropPx: [number, number];
  /** Coordonata x (pixeli dispozitiv) până la care se afișează originalul. */
  split: number;
  effects: boolean;
}

export interface Histogram {
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
  l: Uint32Array;
  total: number;
}

const BLUR_LONG_SIDE = 480;
const BG: [number, number, number] = [0.063, 0.063, 0.071];

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  maxTextureSize = 4096;

  private progs!: { copy: Program; blur: Program; develop: Program; output: Program };
  private vao!: WebGLVertexArrayObject;
  private curvesTex!: WebGLTexture;
  private lutTex!: WebGLTexture;
  private preview!: Pipeline;
  private thumb: Pipeline | null = null;
  private thumbKey = "";

  private sourceImage: TexImageSource | null = null;
  private sourceSize: [number, number] = [0, 0];
  private edit: EditState | null = null;
  private display: OutputParams | null = null;
  private developDirty = true;
  private lastCurves: Curves | null = null;
  private lastLut: Lut3D | null | undefined = undefined;
  private raf = 0;
  private lost = false;

  private onDeveloped: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 nu este disponibil în acest browser.");
    this.gl = gl;
    canvas.addEventListener("webglcontextlost", this.handleLost, false);
    canvas.addEventListener("webglcontextrestored", this.handleRestored, false);
    this.init();
  }

  // ---------------------------------------------------------------- setup

  private init() {
    const gl = this.gl;
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    this.progs = {
      copy: this.program(FULLSCREEN_VS, COPY_FS),
      blur: this.program(FULLSCREEN_VS, BLUR_FS),
      develop: this.program(FULLSCREEN_VS, DEVELOP_FS),
      output: this.program(FULLSCREEN_VS, OUTPUT_FS),
    };
    this.vao = gl.createVertexArray()!;
    this.curvesTex = this.texture(gl.LINEAR, gl.LINEAR);
    this.lutTex = gl.createTexture()!;
    this.uploadIdentityLut();
    this.preview = this.pipeline(true);
    this.thumb = null;
    this.thumbKey = "";
    this.lastCurves = null;
    this.lastLut = undefined;
    this.developDirty = true;
  }

  private handleLost = (e: Event) => {
    e.preventDefault();
    this.lost = true;
    cancelAnimationFrame(this.raf);
  };

  private handleRestored = () => {
    this.lost = false;
    this.init();
    if (this.sourceImage) this.setSource(this.sourceImage, this.sourceSize[0], this.sourceSize[1]);
    this.requestRender();
  };

  private program(vsSrc: string, fsSrc: string): Program {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        gl.deleteShader(s);
        throw new Error(`Eroare shader: ${log}`);
      }
      return s;
    };
    const prog = gl.createProgram()!;
    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`Eroare link program: ${gl.getProgramInfoLog(prog)}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    const cache = new Map<string, WebGLUniformLocation | null>();
    return {
      prog,
      loc: (name) => {
        if (!cache.has(name)) cache.set(name, gl.getUniformLocation(prog, name));
        return cache.get(name)!;
      },
    };
  }

  private texture(minFilter: number, magFilter: number): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);
    return t;
  }

  private target(w: number, h: number, mips: boolean): Target {
    const gl = this.gl;
    const tex = this.texture(mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(tex);
      throw new Error(`Nu pot crea framebuffer ${w}×${h} (memorie GPU insuficientă?).`);
    }
    return { tex, fbo, w, h, mips };
  }

  private deleteTarget(t: Target | null) {
    if (!t) return;
    this.gl.deleteFramebuffer(t.fbo);
    this.gl.deleteTexture(t.tex);
  }

  private pipeline(procMips: boolean): Pipeline {
    const gl = this.gl;
    return {
      src: this.texture(gl.LINEAR_MIPMAP_LINEAR, gl.LINEAR),
      w: 0,
      h: 0,
      blurA: null,
      blurB: null,
      proc: null,
      procMips,
    };
  }

  private disposePipeline(p: Pipeline) {
    this.gl.deleteTexture(p.src);
    this.deleteTarget(p.blurA);
    this.deleteTarget(p.blurB);
    this.deleteTarget(p.proc);
  }

  private uploadIdentityLut() {
    const data = new Float32Array(2 * 2 * 2 * 3);
    let i = 0;
    for (let b = 0; b < 2; b++)
      for (let g = 0; g < 2; g++)
        for (let r = 0; r < 2; r++) {
          data[i++] = r;
          data[i++] = g;
          data[i++] = b;
        }
    this.uploadLut3D(2, data);
  }

  private uploadLut3D(size: number, data: Float32Array) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB16F, size, size, size, 0, gl.RGB, gl.FLOAT, data);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  }

  // ---------------------------------------------------------------- pipeline

  private uploadSource(p: Pipeline, img: TexImageSource, w: number, h: number) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, p.src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);

    if (p.w !== w || p.h !== h || !p.proc) {
      this.deleteTarget(p.blurA);
      this.deleteTarget(p.blurB);
      this.deleteTarget(p.proc);
      const k = Math.min(1, Math.min(BLUR_LONG_SIDE, Math.max(w, h) / 2) / Math.max(w, h));
      const bw = Math.max(1, Math.round(w * k));
      const bh = Math.max(1, Math.round(h * k));
      p.blurA = this.target(bw, bh, false);
      p.blurB = this.target(bw, bh, false);
      p.proc = this.target(w, h, p.procMips);
      p.w = w;
      p.h = h;
    }
    this.buildBlur(p);
  }

  private draw() {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private bindTex(unit: number, target: number, tex: WebGLTexture) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(target, tex);
  }

  /** Imagine micșorată + blur gaussian mare (pentru claritate și anti-ceață). */
  private buildBlur(p: Pipeline) {
    const gl = this.gl;
    const a = p.blurA!;
    const b = p.blurB!;
    gl.disable(gl.BLEND);

    gl.bindFramebuffer(gl.FRAMEBUFFER, a.fbo);
    gl.viewport(0, 0, a.w, a.h);
    gl.useProgram(this.progs.copy.prog);
    this.bindTex(0, gl.TEXTURE_2D, p.src);
    gl.uniform1i(this.progs.copy.loc("uSrc"), 0);
    this.draw();

    const sigma = 4 * (Math.max(a.w, a.h) / BLUR_LONG_SIDE);
    const blur = this.progs.blur;
    gl.useProgram(blur.prog);
    gl.uniform1i(blur.loc("uSrc"), 0);
    gl.uniform1f(blur.loc("uSigma"), Math.max(0.5, sigma));

    gl.bindFramebuffer(gl.FRAMEBUFFER, b.fbo);
    this.bindTex(0, gl.TEXTURE_2D, a.tex);
    gl.uniform2f(blur.loc("uDir"), 1 / a.w, 0);
    this.draw();

    gl.bindFramebuffer(gl.FRAMEBUFFER, a.fbo);
    this.bindTex(0, gl.TEXTURE_2D, b.tex);
    gl.uniform2f(blur.loc("uDir"), 0, 1 / a.h);
    this.draw();

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private syncCurves(curves: Curves) {
    if (curves === this.lastCurves) return;
    const gl = this.gl;
    const r = curveToTable(curves.r);
    const g = curveToTable(curves.g);
    const b = curveToTable(curves.b);
    const m = curveToTable(curves.master);
    const data = new Float32Array(256 * 4);
    for (let i = 0; i < 256; i++) {
      data[i * 4] = r[i];
      data[i * 4 + 1] = g[i];
      data[i * 4 + 2] = b[i];
      data[i * 4 + 3] = m[i];
    }
    gl.bindTexture(gl.TEXTURE_2D, this.curvesTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 256, 1, 0, gl.RGBA, gl.FLOAT, data);
    this.lastCurves = curves;
  }

  private syncLut(lut: Lut3D | null) {
    if (lut === this.lastLut) return;
    if (lut) this.uploadLut3D(lut.size, lut.data);
    else this.uploadIdentityLut();
    this.lastLut = lut;
  }

  private develop(p: Pipeline, edit: EditState) {
    const gl = this.gl;
    const u = developUniforms(edit);
    const lut = edit.lut ? (lutRegistry.get(edit.lut.id) ?? null) : null;
    this.syncCurves(edit.curves);
    this.syncLut(lut);

    const prog = this.progs.develop;
    const L = prog.loc;
    gl.bindFramebuffer(gl.FRAMEBUFFER, p.proc!.fbo);
    gl.viewport(0, 0, p.w, p.h);
    gl.useProgram(prog.prog);

    this.bindTex(0, gl.TEXTURE_2D, p.src);
    this.bindTex(1, gl.TEXTURE_2D, p.blurA!.tex);
    this.bindTex(2, gl.TEXTURE_2D, this.curvesTex);
    this.bindTex(3, gl.TEXTURE_3D, this.lutTex);
    gl.uniform1i(L("uImage"), 0);
    gl.uniform1i(L("uBlur"), 1);
    gl.uniform1i(L("uCurves"), 2);
    gl.uniform1i(L("uLut"), 3);

    gl.uniform2f(L("uTexel"), 1 / p.w, 1 / p.h);
    gl.uniform1f(L("uExposure"), u.exposure);
    gl.uniform3f(L("uWb"), ...u.wb);
    gl.uniform1f(L("uContrast"), u.contrast);
    gl.uniform1f(L("uHighlights"), u.highlights);
    gl.uniform1f(L("uShadows"), u.shadows);
    gl.uniform1f(L("uWhites"), u.whites);
    gl.uniform1f(L("uBlacks"), u.blacks);
    gl.uniform1f(L("uClarity"), u.clarity);
    gl.uniform1f(L("uDehaze"), u.dehaze);
    gl.uniform1f(L("uSharpen"), u.sharpen);
    gl.uniform1f(L("uDenoise"), u.denoise);
    gl.uniform1f(L("uVibrance"), u.vibrance);
    gl.uniform1f(L("uSaturation"), u.saturation);
    gl.uniform3fv(L("uHsl"), u.hsl);
    gl.uniform1i(L("uUseHsl"), u.useHsl ? 1 : 0);
    gl.uniform3f(L("uGradeS"), ...u.gradeS);
    gl.uniform3f(L("uGradeM"), ...u.gradeM);
    gl.uniform3f(L("uGradeH"), ...u.gradeH);
    gl.uniform1f(L("uGradeBalance"), u.gradeBalance);
    gl.uniform1f(L("uFade"), u.fade);
    gl.uniform1i(L("uUseCurves"), u.useCurves ? 1 : 0);
    gl.uniform1i(L("uUseLut"), lut ? 1 : 0);
    gl.uniform1f(L("uLutSize"), lut ? lut.size : 2);
    gl.uniform1f(L("uLutAmount"), edit.lut ? edit.lut.amount / 100 : 0);
    gl.uniform3f(L("uLutDomainMin"), ...(lut ? lut.domainMin : ([0, 0, 0] as [number, number, number])));
    gl.uniform3f(L("uLutDomainMax"), ...(lut ? lut.domainMax : ([1, 1, 1] as [number, number, number])));
    this.draw();

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (p.proc!.mips) {
      gl.bindTexture(gl.TEXTURE_2D, p.proc!.tex);
      gl.generateMipmap(gl.TEXTURE_2D);
    }
  }

  private output(p: Pipeline, target: Target | null, w: number, h: number, o: OutputParams, edit: EditState) {
    const gl = this.gl;
    const prog = this.progs.output;
    const L = prog.loc;
    const fx = effectUniforms(edit);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog.prog);
    this.bindTex(0, gl.TEXTURE_2D, p.proc!.tex);
    this.bindTex(1, gl.TEXTURE_2D, p.src);
    gl.uniform1i(L("uProc"), 0);
    gl.uniform1i(L("uOrig"), 1);
    gl.uniformMatrix3fv(L("uPxToContent"), false, toMat3(o.pxToContent));
    gl.uniformMatrix3fv(L("uContentToFrame"), false, toMat3(o.contentToFrame));
    gl.uniformMatrix3fv(L("uFrameToSource"), false, toMat3(o.frameToSource));
    gl.uniform4f(L("uCrop"), o.crop.x, o.crop.y, o.crop.w, o.crop.h);
    gl.uniform2f(L("uCropPx"), Math.max(1, o.cropPx[0]), Math.max(1, o.cropPx[1]));
    gl.uniform1f(L("uSplit"), o.split);
    gl.uniform3f(L("uBg"), ...BG);
    gl.uniform1i(L("uEffects"), o.effects ? 1 : 0);
    gl.uniform1f(L("uVignette"), fx.vignette);
    gl.uniform1f(L("uVigMid"), fx.vigMid);
    gl.uniform1f(L("uVigFeather"), fx.vigFeather);
    gl.uniform1f(L("uVigRound"), fx.vigRound);
    gl.uniform1f(L("uGrain"), fx.grain);
    gl.uniform1f(L("uGrainSize"), fx.grainSize);
    this.draw();
  }

  private readTarget(t: Target): Uint8ClampedArray<ArrayBuffer> {
    const gl = this.gl;
    const out = new Uint8ClampedArray(t.w * t.h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.readPixels(0, 0, t.w, t.h, gl.RGBA, gl.UNSIGNED_BYTE, out);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return out;
  }

  // ---------------------------------------------------------------- API public

  get hasSource() {
    return !!this.preview.proc;
  }

  /** Setează imaginea de previzualizare (proxy). */
  setSource(img: TexImageSource, w: number, h: number) {
    if (this.lost) return;
    this.sourceImage = img;
    this.sourceSize = [w, h];
    this.uploadSource(this.preview, img, w, h);
    this.thumbKey = "";
    this.developDirty = true;
    this.requestRender();
  }

  setEdit(edit: EditState) {
    const prev = this.edit;
    this.edit = edit;
    if (
      !prev ||
      prev.adj !== edit.adj ||
      prev.hsl !== edit.hsl ||
      prev.curves !== edit.curves ||
      prev.grading !== edit.grading ||
      prev.lut !== edit.lut
    ) {
      this.developDirty = true;
    }
    this.requestRender();
  }

  /** Forțează re-developarea (ex. după încărcarea unui LUT nou). */
  invalidate() {
    this.developDirty = true;
    this.lastLut = undefined;
    this.requestRender();
  }

  /** Apelat după fiecare re-developare a imaginii (ex. pentru histogramă). */
  setDevelopedListener(fn: (() => void) | null) {
    this.onDeveloped = fn;
  }

  setDisplay(params: OutputParams) {
    this.display = params;
    this.requestRender();
  }

  requestRender() {
    if (this.raf || this.lost) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.render();
    });
  }

  render() {
    if (this.lost || !this.edit || !this.display || !this.preview.proc) return;
    let developed = false;
    if (this.developDirty) {
      this.develop(this.preview, this.edit);
      this.developDirty = false;
      developed = true;
    }
    this.output(this.preview, null, this.canvas.width, this.canvas.height, this.display, this.edit);
    if (developed) this.onDeveloped?.();
  }

  /** Histograma imaginii finale (crop aplicat), calculată pe o versiune mică. */
  histogram(output: Omit<OutputParams, "pxToContent" | "split">, maxSide = 256): Histogram | null {
    if (this.lost || !this.edit || !this.preview.proc) return null;
    if (this.developDirty) {
      this.develop(this.preview, this.edit);
      this.developDirty = false;
    }
    const [cw, ch] = output.cropPx;
    const k = Math.min(1, maxSide / Math.max(cw, ch));
    const w = Math.max(1, Math.round(cw * k));
    const h = Math.max(1, Math.round(ch * k));
    const t = this.target(w, h, false);
    this.output(this.preview, t, w, h, { ...output, pxToContent: [1 / w, 0, 0, 1 / h, 0, 0], split: -1 }, this.edit);
    const px = this.readTarget(t);
    this.deleteTarget(t);
    const hist: Histogram = {
      r: new Uint32Array(256),
      g: new Uint32Array(256),
      b: new Uint32Array(256),
      l: new Uint32Array(256),
      total: w * h,
    };
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      hist.r[r]++;
      hist.g[g]++;
      hist.b[b]++;
      hist.l[Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)]++;
    }
    return hist;
  }

  /**
   * Randează o listă de variante pe o sursă mică și întoarce pixelii fiecăreia.
   * Folosit pentru miniaturile filtrelor și pentru analiza „Auto”.
   */
  renderVariants(
    key: string,
    src: TexImageSource,
    srcW: number,
    srcH: number,
    edits: EditState[],
    outW: number,
    outH: number,
    output: Omit<OutputParams, "pxToContent" | "split">,
  ): Uint8ClampedArray<ArrayBuffer>[] {
    if (this.lost) return [];
    if (!this.thumb) this.thumb = this.pipeline(false);
    if (this.thumbKey !== key) {
      this.uploadSource(this.thumb, src, srcW, srcH);
      this.thumbKey = key;
    }
    const t = this.target(outW, outH, false);
    const results: Uint8ClampedArray<ArrayBuffer>[] = [];
    for (const e of edits) {
      this.develop(this.thumb, e);
      this.output(this.thumb, t, outW, outH, { ...output, pxToContent: [1 / outW, 0, 0, 1 / outH, 0, 0], split: -1 }, e);
      results.push(this.readTarget(t));
    }
    this.deleteTarget(t);
    // texturile de curbe/LUT au fost suprascrise: forțează resincronizarea
    this.lastCurves = null;
    this.lastLut = undefined;
    return results;
  }

  /** Export la rezoluție completă: developare pe imaginea originală. */
  exportPixels(
    src: TexImageSource,
    srcW: number,
    srcH: number,
    edit: EditState,
    outW: number,
    outH: number,
    output: Omit<OutputParams, "pxToContent" | "split">,
  ): Uint8ClampedArray<ArrayBuffer> {
    if (this.lost) throw new Error("Contextul WebGL a fost pierdut. Reîncearcă.");
    const p = this.pipeline(true);
    let t: Target | null = null;
    try {
      this.uploadSource(p, src, srcW, srcH);
      this.lastCurves = null;
      this.lastLut = undefined;
      this.develop(p, edit);
      t = this.target(outW, outH, false);
      this.output(p, t, outW, outH, { ...output, pxToContent: [1 / outW, 0, 0, 1 / outH, 0, 0], split: -1 }, edit);
      return this.readTarget(t);
    } finally {
      this.deleteTarget(t);
      this.disposePipeline(p);
      this.lastCurves = null;
      this.lastLut = undefined;
      this.requestRender();
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener("webglcontextlost", this.handleLost);
    this.canvas.removeEventListener("webglcontextrestored", this.handleRestored);
    // fără loseContext(): același canvas poate fi refolosit (React StrictMode)
    if (!this.lost) {
      this.disposePipeline(this.preview);
      if (this.thumb) this.disposePipeline(this.thumb);
    }
  }
}

/** Interogare MAX_TEXTURE_SIZE fără a păstra un context. */
export function probeWebGL(): { ok: boolean; maxTextureSize: number } {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2");
    if (!gl) return { ok: false, maxTextureSize: 0 };
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return { ok: true, maxTextureSize: max };
  } catch {
    return { ok: false, maxTextureSize: 0 };
  }
}
