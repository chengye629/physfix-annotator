import { videoUrl } from './core.js';

// Keep only a few unmodified video files in memory. Annotation data uses its
// existing, separate localStorage key and is never removed by this cache.
export class VideoDelivery {
  constructor(video, {
    baseURL = globalThis.location?.href || 'http://localhost/',
    manifest = {},
    getNextId = () => null,
    onStatus = () => {},
    fetchVideo = (...args) => fetch(...args),
    urls = URL,
    maxItems = 3,
    maxBytes = 40 * 1024 * 1024,
    slowTimeout = 9000,
    prefetchTimeout = 45000,
  } = {}) {
    Object.assign(this, {video,baseURL,manifest,getNextId,onStatus,fetchVideo,urls,maxItems,maxBytes,slowTimeout,prefetchTimeout});
    this.mode = 'auto';
    this.cache = new Map();
    this.epoch = 0;
    this.active = null;
    this.warming = null;
  }

  setManifest(manifest) { this.manifest = manifest?.videos || {}; }

  targets(id) {
    const mirror = this.manifest[id];
    const targets = [];
    if (mirror && this.mode !== 'original') {
      const url = new URL(mirror.file, this.baseURL);
      // The versioned URL also lets the browser reuse a complete prefetched
      // HTTP response after a refresh, without stale files after data updates.
      url.searchParams.set('v', mirror.sha256.slice(0, 12));
      targets.push({url:url.href,source:'网站线路'});
    }
    if (this.mode !== 'site' || !targets.length) targets.push({url:videoUrl(id),source:'HF 原站'});
    return targets;
  }

  emit(kind, text) {
    if (this.active) this.onStatus({kind,text,source:this.active.targets[this.active.index]?.source});
  }

  capture() { return {time:this.video.currentTime || 0,rate:this.video.playbackRate || 1,playing:!this.video.paused}; }

  load(id, {preserve = false} = {}) {
    const restore = preserve ? this.capture() : {time:0,rate:this.video.playbackRate || 1,playing:false};
    this.cancelWarmup();
    this.clearWatchdog();
    this.listeners?.abort();
    this.epoch += 1;
    this.video.pause();
    this.active = {id,index:0,targets:this.targets(id),restore};
    this.assign(0, restore);
  }

  assign(index, restore) {
    this.listeners?.abort();
    this.clearWatchdog();
    const active = this.active;
    active.index = index;
    const epoch = this.epoch;
    const target = active.targets[index];
    const cached = this.cache.get(target.url);
    if (cached) {
      this.cache.delete(target.url);
      this.cache.set(target.url, cached);
    }
    active.cached = !!cached;
    const src = cached?.objectURL || target.url;
    this.video.pause();
    // Stop the old network request and clear old duration before displaying a
    // new task, so a fast submission cannot use the preceding video's length.
    this.video.removeAttribute('src');
    this.video.load();
    this.listeners = new AbortController();
    const valid = () => this.epoch === epoch && this.active === active && (!this.video.currentSrc || this.video.currentSrc === src);
    const listen = (name, fn) => this.video.addEventListener(name, () => {if(valid()) fn();}, {signal:this.listeners.signal});
    listen('loadedmetadata', () => {
      this.video.playbackRate = restore.rate;
      if (restore.time > 0 && Number.isFinite(this.video.duration)) this.video.currentTime = Math.min(restore.time,Math.max(0,this.video.duration-0.01));
      if (restore.playing) this.video.play()?.catch(() => {});
    });
    const ready = () => {this.clearWatchdog();this.emit('ready',active.cached?'本机缓存 · 原画':'原画已就绪');};
    listen('loadeddata', ready);
    listen('playing', ready);
    listen('canplaythrough', () => {ready();this.warmNext(epoch);});
    listen('waiting', () => {this.emit('buffering','正在缓冲…');this.armWatchdog(epoch);});
    listen('stalled', () => {this.emit('buffering','正在等待视频数据…');this.armWatchdog(epoch);});
    listen('error', () => this.fallback(epoch));
    this.video.preload = 'auto';
    this.video.src = src;
    this.video.playbackRate = restore.rate;
    this.video.load();
    this.emit('loading',cached?'正在读取本机缓存…':`正在连接${target.source}…`);
    this.armWatchdog(epoch);
  }

  armWatchdog(epoch) {
    if (this.watchdog) return;
    this.watchdog = setTimeout(() => {
      this.watchdog = null;
      if (epoch !== this.epoch) return;
      if (this.mode === 'auto' && this.active.index+1 < this.active.targets.length) this.fallback(epoch);
      else this.emit('slow','连接较慢，可切换视频线路');
    },this.slowTimeout);
  }

  clearWatchdog() { clearTimeout(this.watchdog);this.watchdog = null; }

  fallback(epoch) {
    if (epoch !== this.epoch || !this.active) return;
    this.cancelWarmup();
    this.clearWatchdog();
    const active = this.active;
    const target = active.targets[active.index];
    if (active.cached) this.remove(target.url);
    if (active.index+1 < active.targets.length) {
      this.assign(active.index+1,this.capture());
    } else this.emit('error','视频加载失败，请重试或切换线路');
  }

  setMode(mode) {
    if (!['auto','site','original'].includes(mode)) return;
    this.mode = mode;
    if (this.active) this.load(this.active.id,{preserve:true});
  }

  retry() { if (this.active) this.load(this.active.id,{preserve:true}); }

  remove(url) {
    const cached = this.cache.get(url);
    if (cached) this.urls.revokeObjectURL(cached.objectURL);
    this.cache.delete(url);
  }

  remember(url, blob) {
    this.remove(url);
    this.cache.set(url,{objectURL:this.urls.createObjectURL(blob),bytes:blob.size});
    const total = () => [...this.cache.values()].reduce((sum,v) => sum+v.bytes,0);
    const currentURL = this.active?.targets[this.active.index]?.url;
    while (this.cache.size > this.maxItems || total() > this.maxBytes) {
      const victim = [...this.cache.keys()].find(k => k !== currentURL);
      if (!victim) break;
      this.remove(victim);
    }
  }

  async warmNext(epoch) {
    const id = this.getNextId();
    if (!id || id === this.active?.id || epoch !== this.epoch || globalThis.navigator?.connection?.saveData) return;
    const target = this.targets(id)[0];
    if (this.cache.has(target.url) || this.warming?.url === target.url) return;
    this.cancelWarmup();
    const controller = new AbortController();
    this.warming = {url:target.url,controller};
    const timer = setTimeout(() => controller.abort(),this.prefetchTimeout);
    try {
      // Start only after the current video can play through. A task switch
      // aborts this low-priority request so it cannot slow current playback.
      const response = await this.fetchVideo(target.url,{cache:'force-cache',credentials:'omit',signal:controller.signal,priority:'low'});
      if (!response.ok) return;
      let blob = await response.blob();
      if (controller.signal.aborted || epoch !== this.epoch || blob.size < 8 || blob.size > this.maxBytes) return;
      const signature = new Uint8Array(await blob.slice(4,8).arrayBuffer());
      if (String.fromCharCode(...signature) !== 'ftyp') return;
      if (!blob.type.startsWith('video/')) blob = new Blob([blob],{type:'video/mp4'});
      this.remember(target.url,blob);
      if (this.cache.has(target.url) && !this.watchdog) this.emit('ready','原画已就绪 · 下一条已预加载');
    } catch { /* Prefetch is optional; foreground streaming remains available. */ }
    finally {
      clearTimeout(timer);
      if (this.warming?.controller === controller) this.warming = null;
    }
  }

  cancelWarmup() { this.warming?.controller.abort();this.warming = null; }

  dispose() {
    this.epoch += 1;
    this.cancelWarmup();this.clearWatchdog();this.listeners?.abort();
    for (const url of [...this.cache.keys()]) this.remove(url);
  }
}
