// ADAM calibrator Three.js bridge
//
// Three r160 assigns WebGLRenderer.render as an OWN instance function inside
// the constructor. Patching WebGLRenderer.prototype.render therefore never
// intercepts actual renderer.render(...) calls.
//
// This wrapper keeps the real r160 renderer unchanged, but wraps that OWN render
// function once at construction time and runs explicit calibrator hooks before
// the native render. Modules opt in through window.__ADAM_BEFORE_RENDER_HOOKS.

import * as THREE_BASE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
export * from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export class WebGLRenderer extends THREE_BASE.WebGLRenderer {
  constructor(parameters = {}) {
    super(parameters);

    const nativeRender = this.render.bind(this);
    this.__adamNativeRender = nativeRender;

    this.render = (scene, camera) => {
      const hooks = window.__ADAM_BEFORE_RENDER_HOOKS;
      if (Array.isArray(hooks)) {
        for (const hook of [...hooks]) {
          try {
            hook(this, scene, camera);
          } catch (error) {
            console.error('[ADAM renderer bridge] before-render hook failed', error);
          }
        }
      }
      return nativeRender(scene, camera);
    };

    window.__ADAM_RENDERER_BRIDGE = {
      version:1,
      renderer:this,
      nativeRender
    };

    console.info('[ADAM renderer bridge] active — explicit render hooks enabled');
  }
}
