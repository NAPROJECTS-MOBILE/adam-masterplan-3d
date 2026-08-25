// ADAM Webflow Three.js bridge
// Forces a stencil buffer for the locked architectural glow de-stacking pass,
// and exposes explicit before-render hooks for shadows / strip pulse modules.

import * as THREE_BASE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
export * from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export class WebGLRenderer extends THREE_BASE.WebGLRenderer {
  constructor(parameters = {}) {
    super({ ...parameters, stencil:true });

    const nativeRender = this.render.bind(this);
    this.__adamNativeRender = nativeRender;

    this.render = (scene, camera) => {
      const hooks = window.__ADAM_BEFORE_RENDER_HOOKS;
      if (Array.isArray(hooks)) {
        for (const hook of [...hooks]) {
          try {
            hook(this, scene, camera);
          } catch (error) {
            console.error('[ADAM Webflow renderer bridge] before-render hook failed', error);
          }
        }
      }
      return nativeRender(scene, camera);
    };

    window.__ADAM_RENDERER_BRIDGE = {
      version:2,
      renderer:this,
      nativeRender
    };
  }
}
