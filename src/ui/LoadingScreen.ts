// Loading screen overlay — shows during world generation / save loading

export class LoadingScreen {
  private root: HTMLDivElement;
  private statusEl: HTMLSpanElement | null = null;
  private progressEl: HTMLDivElement | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'loading-screen';
    this.root.innerHTML = this.buildHTML();
    this.injectCSS();
    document.body.appendChild(this.root);
    this.root.style.display = 'none';
    this.statusEl = this.root.querySelector('.loading-status');
    this.progressEl = this.root.querySelector('.loading-bar-fill');
  }

  show(status = 'Loading...'): void {
    this.root.style.display = 'flex';
    this.setStatus(status);
    this.setProgress(0);
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  setStatus(text: string): void {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  setProgress(pct: number): void {
    if (this.progressEl) {
      this.progressEl.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    }
  }

  private buildHTML(): string {
    return `
      <div class="loading-backdrop"></div>
      <div class="loading-content">
        <div class="loading-spinner">
          <div class="spinner-ring"></div>
          <div class="spinner-ring inner"></div>
        </div>
        <span class="loading-status">Loading...</span>
        <div class="loading-bar">
          <div class="loading-bar-fill"></div>
        </div>
      </div>
    `;
  }

  private injectCSS(): void {
    const style = document.createElement('style');
    style.textContent = `
      #loading-screen {
        position: fixed; inset: 0; z-index: 10001;
        display: flex; align-items: center; justify-content: center;
        font-family: 'Inter', system-ui, sans-serif;
      }
      #loading-screen .loading-backdrop {
        position: absolute; inset: 0;
        background: radial-gradient(ellipse at 50% 40%, #12122a 0%, #080812 100%);
      }
      #loading-screen .loading-content {
        position: relative; z-index: 1;
        display: flex; flex-direction: column; align-items: center; gap: 24px;
      }

      #loading-screen .loading-spinner {
        position: relative; width: 64px; height: 64px;
      }
      #loading-screen .spinner-ring {
        position: absolute; inset: 0;
        border: 3px solid rgba(100,140,255,0.1);
        border-top-color: rgba(100,160,255,0.8);
        border-radius: 50%;
        animation: spin 1.2s linear infinite;
      }
      #loading-screen .spinner-ring.inner {
        inset: 10px;
        border-top-color: rgba(200,140,255,0.7);
        animation-duration: 0.8s;
        animation-direction: reverse;
      }
      @keyframes spin { to { transform: rotate(360deg); } }

      #loading-screen .loading-status {
        color: rgba(180,200,255,0.7);
        font-size: 14px; letter-spacing: 1px;
      }

      #loading-screen .loading-bar {
        width: 240px; height: 4px;
        background: rgba(255,255,255,0.06);
        border-radius: 2px; overflow: hidden;
      }
      #loading-screen .loading-bar-fill {
        height: 100%; width: 0%;
        background: linear-gradient(90deg, #4a7cf7, #a78bfa);
        border-radius: 2px;
        transition: width 0.3s ease;
      }
    `;
    document.head.appendChild(style);
  }
}
