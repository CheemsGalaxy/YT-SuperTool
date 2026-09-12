// content/observer.js

class ObserverManager {
  constructor(target = document.body, delay = 300) {
    this.target = target;
    this.delay = delay;
    this.callbacks = new Set();
    this.timer = 0;
    this.observer = new MutationObserver(mutations => {
      this.pendingMutations = (this.pendingMutations || []).concat(mutations);
      if (this.pendingMutations.length > 2000) this.pendingMutations.splice(0, 1000);
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), this.delay);
    });
  }
  onMutation(callback) { return this.add(callback); }
  add(callback) { if (typeof callback === 'function') this.callbacks.add(callback); return this; }
  remove(callback) { this.callbacks.delete(callback); return this; }
  flush() {
    const mutations = (this.pendingMutations || []).filter(mutation =>
      mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0 || mutation.type === 'attributes'
    );
    this.pendingMutations = [];
    if (!mutations.length) return;
    this.callbacks.forEach(callback => {
      try { callback(mutations); } catch (error) { console.warn('YT SuperTool observer:', error); }
    });
  }
  start() {
    if (this.target) this.observer.observe(this.target, { childList: true, subtree: true });
    return this;
  }
  stop() {
    clearTimeout(this.timer);
    this.observer.disconnect();
    return this;
  }
}
window.YTSuperTool = window.YTSuperTool || {};
window.YTSuperTool.ObserverManager = ObserverManager;
