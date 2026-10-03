"use strict";
// Executes only with the explicit --smoke-test flag and a disposable user profile.
async function runSmokeTest(win) {
  return win.webContents.executeJavaScript(`(async () => {
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const waitFor = async (predicate, label) => {
      const until = Date.now() + 30000;
      while (!predicate()) {
        if (Date.now() > until) throw new Error('Timeout: ' + label);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    };
    await waitFor(() => window.__nexus, 'engine startup');
    assert(window.nexusDesktop, 'Preload bridge missing');
    assert(typeof window.require === 'undefined', 'Node.js is exposed to renderer');
    assert(typeof window.process === 'undefined', 'Process is exposed to renderer');
    const canvas = document.querySelector('canvas');
    assert(canvas && canvas.width > 0 && canvas.height > 0, 'Canvas has no size');
    await waitFor(() => window.__nexus.renderer.info.render.calls > 0, 'WebGL draw calls');
    const texture = await fetch('/textures/wall.png');
    assert(texture.ok && texture.headers.get('content-type').startsWith('image/'), 'Local texture unavailable');
    const missing = await fetch('/textures/__not_a_real_texture__.png');
    assert(missing.status === 404, 'Missing asset must return 404, not HTML');
    const scripts = await Promise.all([...document.querySelectorAll('script[src]')].map(async (script) => {
      const response = await fetch(script.src);
      assert(response.ok, 'Missing JS bundle');
      return response.url;
    }));
    const key = 'nexus-desktop-smoke';
    localStorage.setItem(key, 'ok');
    assert(localStorage.getItem(key) === 'ok', 'Persistent origin storage unavailable');
    localStorage.removeItem(key);
    const before = window.__nexus;
    const reactorButton = [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Reactor');
    assert(reactorButton, 'Reactor selection button missing');
    reactorButton.click();
    await waitFor(() => window.__nexus && window.__nexus !== before, 'Reactor engine');
    await waitFor(() => window.__nexus.renderer.info.render.calls > 0, 'Reactor WebGL draw calls');
    assert(localStorage.getItem('nexus-arena-map-v1') === 'reactor', 'Map selection did not persist');
    // Avoid pointer-lock in a hidden CI window; gameplay still uses the real engine.
    window.__nexus.requestLock = () => {};
    window.__nexus.beginMatch();
    assert(window.__nexus.screen === 'playing', 'Match did not start');
    window.dispatchEvent(new Event('blur'));
    await waitFor(() => window.__nexus.screen === 'paused', 'pause on focus loss');
    window.__nexus.toMenu();
    assert(window.__nexus.screen === 'menu', 'Return to menu failed');
    assert(!document.querySelector('.desktop-error'), 'Game error boundary is visible');
    return { maps: ['crucible', 'reactor'], canvas: [canvas.width, canvas.height], scripts: scripts.length, storage: true, nodeIsolated: true, focusPause: true };
  })()`, true);
}
module.exports = { runSmokeTest };
