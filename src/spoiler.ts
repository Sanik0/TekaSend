type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
  phase: number;
};

type ParticleField = {
  width: number;
  height: number;
  particles: Particle[];
};

type LineRect = { left: number; top: number; width: number; height: number };

/** Paints one moving spoiler field per rendered line, without changing text layout. */
export class SpoilerRenderer {
  private readonly canvas = document.createElement('canvas');
  private readonly context: CanvasRenderingContext2D | null;
  private readonly targets = new Map<HTMLElement, ParticleField[]>();
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private frame = 0;
  private lastPaint = 0;

  public constructor(shadow: ShadowRoot) {
    this.canvas.className = 'spoiler-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    shadow.append(this.canvas);
    this.context = this.canvas.getContext('2d');

    window.addEventListener('scroll', () => this.schedule(), true);
    window.addEventListener('resize', () => this.schedule());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        cancelAnimationFrame(this.frame);
        this.frame = 0;
      } else {
        this.lastPaint = 0;
        this.schedule();
      }
    });
    this.reducedMotion.addEventListener('change', () => this.schedule());
  }

  public add(element: HTMLElement): void {
    this.targets.set(element, []);
    this.schedule();
  }

  public remove(element: HTMLElement): void {
    this.targets.delete(element);
    this.schedule();
  }

  private schedule(): void {
    if (this.frame || document.hidden || !this.context) return;
    this.frame = requestAnimationFrame(time => this.paint(time));
  }

  private textRects(element: HTMLElement): LineRect[] {
    const pieces: LineRect[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (!node.nodeValue?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.width > 0 && rect.height > 0) {
          pieces.push({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
        }
      }
    }

    pieces.sort((a, b) => a.top - b.top || a.left - b.left);
    const lines: LineRect[] = [];
    for (const piece of pieces) {
      const previous = lines[lines.length - 1];
      if (previous && Math.abs(previous.top - piece.top) < 3 &&
          Math.abs(previous.height - piece.height) < 4 &&
          piece.left - (previous.left + previous.width) < 12) {
        const right = Math.max(previous.left + previous.width, piece.left + piece.width);
        previous.width = right - previous.left;
      } else {
        lines.push({ ...piece });
      }
    }
    return lines;
  }

  private createField(width: number, height: number): ParticleField {
    const count = Math.min(500, Math.max(8, Math.round(width * height / 50)));
    const particles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - .5) * 20,
        vy: 9 + Math.random() * 20,
        radius: .45 + Math.random() * .75,
        opacity: .3 + Math.random() * .55,
        phase: Math.random() * Math.PI * 2
      });
    }
    return { width, height, particles };
  }

  private paint(time: number): void {
    this.frame = 0;
    const context = this.context;
    if (!context) return;

    if (this.targets.size && !this.reducedMotion.matches && time - this.lastPaint < 30) {
      this.schedule();
      return;
    }
    const dt = this.lastPaint && !this.reducedMotion.matches
      ? Math.min(.06, (time - this.lastPaint) / 1000)
      : 0;
    this.lastPaint = time;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const scale = Math.min(2, window.devicePixelRatio || 1);
    if (this.canvas.width !== Math.round(width * scale) || this.canvas.height !== Math.round(height * scale)) {
      this.canvas.width = Math.round(width * scale);
      this.canvas.height = Math.round(height * scale);
    }
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, width, height);

    for (const [element, oldFields] of this.targets) {
      if (!element.isConnected || !element.matches('.pl-spoiler')) {
        this.targets.delete(element);
        continue;
      }
      const rects = this.textRects(element);
      const fields: ParticleField[] = [];
      for (let i = 0; i < rects.length; i++) {
        const rect = rects[i];
        const old = oldFields[i];
        const field = old && Math.abs(old.width - rect.width) < 2 && Math.abs(old.height - rect.height) < 2
          ? old
          : this.createField(rect.width, rect.height);
        fields.push(field);
        if (rect.left >= width || rect.top >= height || rect.left + rect.width <= 0 || rect.top + rect.height <= 0) continue;

        context.save();
        context.beginPath();
        context.rect(rect.left, rect.top, rect.width, rect.height);
        context.clip();
        context.fillStyle = '#f9f9fa';
        context.fillRect(rect.left, rect.top, rect.width, rect.height);

        for (const particle of field.particles) {
          particle.x += particle.vx * dt;
          particle.y -= particle.vy * dt;
          if (particle.x < -2) particle.x = rect.width + 2;
          if (particle.x > rect.width + 2) particle.x = -2;
          if (particle.y < -2) particle.y = rect.height + 2;
          const sway = Math.sin(time * .003 + particle.phase) * 2;
          const shimmer = .82 + Math.sin(time * .004 + particle.phase) * .18;
          context.fillStyle = `rgba(38,43,50,${particle.opacity * shimmer})`;
          context.beginPath();
          context.arc(rect.left + particle.x + sway, rect.top + particle.y, particle.radius, 0, Math.PI * 2);
          context.fill();
        }
        context.restore();
      }
      this.targets.set(element, fields);
    }

    if (this.targets.size && !this.reducedMotion.matches) this.schedule();
  }
}
