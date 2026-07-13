// carrot 照片堆叠卡（微信风格：堆叠 + 拖拽/快滑翻页）
//
// 移植 / 改编自 Wren036/PhotoStack —— https://github.com/Wren036/PhotoStack
// 交互与数学（三层恒定可见、peek/旋转/缩放分层、拖拽 scrub、fling 翻页阈值、
// object-fit cover 固定舞台）皆参考该仓库。致谢原作者 Wren036。
// 原仓库许可证：PolyForm Noncommercial 1.0.0（个人 / 研究 / 非商用免费；商用需原作者书面授权）。
// carrot 为个人非商用项目，按此许可证使用并在此署名。

const DEFAULTS = {
    width: 190,       // 舞台宽（px）
    height: 240,      // 舞台高（px）
    peek: 15,         // 第一层露出的偏移
    peekStep: 12,     // 每深一层再多露出的偏移
    rotStep: 2.2,     // 每层旋转角度
    scaleStep: 0.06,  // 每层缩小比例
    flingVel: 0.4,    // 快滑翻页速度阈值（px/ms）
    counter: true,    // 右下角数量角标
};

export class CarrotPhotoStack {
    constructor(container, images, options = {}) {
        this.opt = { ...DEFAULTS, ...options };
        this.doc = container.ownerDocument || document;
        this.container = container;
        this.images = Array.isArray(images) ? images.slice() : [];
        this.cur = 0;
        this.onTap = typeof options.onTap === 'function' ? options.onTap : null;
        this._drag = null;
        this._build();
        this._bind();
        this._apply();
    }

    _build() {
        const { width, height, counter } = this.opt;
        const stage = this.doc.createElement('div');
        stage.className = 'pstack-stage';
        stage.style.width = `${width}px`;
        stage.style.height = `${height}px`;

        this.cards = this.images.map((src) => {
            const card = this.doc.createElement('div');
            card.className = 'pstack-card';
            const img = this.doc.createElement('img');
            img.src = src;
            img.alt = '';
            img.loading = 'lazy';
            img.draggable = false;
            card.appendChild(img);
            stage.appendChild(card);
            return card;
        });

        if (counter && this.images.length > 1) {
            this.badge = this.doc.createElement('div');
            this.badge.className = 'pstack-badge';
            this.badge.textContent = `1 / ${this.images.length}`;
            stage.appendChild(this.badge);
        }

        this.stage = stage;
        this.container.appendChild(stage);
    }

    // 三层恒定可见：正常左右各留 1 张 peek；到边界时向另一侧借额度，凑够两侧共 2 张
    _lr() {
        const n = this.images.length;
        const maxSide = Math.min(2, n - 1);
        let left = Math.min(1, this.cur);
        let right = Math.min(1, n - 1 - this.cur);
        while (left + right < maxSide) {
            if (this.cur - (left + 1) >= 0 && left <= right) left += 1;
            else if (this.cur + (right + 1) <= n - 1) right += 1;
            else if (this.cur - (left + 1) >= 0) left += 1;
            else break;
        }
        return { left, right };
    }

    _apply() {
        const { peek, peekStep, rotStep, scaleStep } = this.opt;
        const { left, right } = this._lr();
        this.cards.forEach((card, i) => {
            const d = i - this.cur;
            let tx = 0;
            let rot = 0;
            let sc = 1;
            let z = 100;
            let op = 1;
            if (d !== 0) {
                const k = Math.abs(d);
                const dir = d < 0 ? -1 : 1;
                const within = d < 0 ? k <= left : k <= right;
                if (!within) {
                    op = 0;
                    z = 1;
                } else {
                    tx = dir * (peek + (k - 1) * peekStep);
                    rot = dir * rotStep * k;
                    sc = 1 - scaleStep * k;
                    z = 100 - k;
                }
            }
            card.style.transform = `translateX(${tx}px) rotate(${rot}deg) scale(${sc})`;
            card.style.zIndex = String(z);
            card.style.opacity = String(op);
        });
        if (this.badge) this.badge.textContent = `${this.cur + 1} / ${this.images.length}`;
    }

    _bind() {
        const stage = this.stage;
        const onDown = (e) => {
            if (this.images.length < 2) {
                // 单图：点一下看大图
                return;
            }
            const top = this.cards[this.cur];
            this._drag = {
                id: e.pointerId,
                x0: e.clientX,
                y0: e.clientY,
                x: e.clientX,
                t: performance.now(),
                vel: 0,
                moved: false,
            };
            stage.classList.add('pstack-dragging');
            top?.classList.add('pstack-dragging');
            try { stage.setPointerCapture(e.pointerId); } catch {}
        };
        const onMove = (e) => {
            const drag = this._drag;
            if (!drag || e.pointerId !== drag.id) return;
            const now = performance.now();
            const dx = e.clientX - drag.x0;
            const dy = e.clientY - drag.y0;
            if (!drag.moved && Math.abs(dx) < 8 && Math.abs(dx) < Math.abs(dy)) {
                // 还没确定是横向拖拽，纵向优先则不劫持（让页面滚动）
                return;
            }
            drag.moved = true;
            const dt = Math.max(1, now - drag.t);
            const instV = (e.clientX - drag.x) / dt;
            drag.vel = 0.7 * instV + 0.3 * drag.vel; // 指数平滑
            drag.x = e.clientX;
            drag.t = now;
            const top = this.cards[this.cur];
            if (top) {
                top.style.transform = `translateX(${dx * 0.92}px) rotate(${dx * 0.03}deg) scale(1)`;
            }
            e.preventDefault();
        };
        const onUp = (e) => {
            const drag = this._drag;
            if (!drag || e.pointerId !== drag.id) return;
            this._drag = null;
            stage.classList.remove('pstack-dragging');
            this.cards[this.cur]?.classList.remove('pstack-dragging');
            try { stage.releasePointerCapture(e.pointerId); } catch {}

            const dx = e.clientX - drag.x0;
            if (!drag.moved || Math.abs(dx) < 6) {
                // 视作点击：看大图
                if (this.onTap) this.onTap(this.cur, this.images);
                this._apply();
                return;
            }
            const { width, flingVel } = this.opt;
            const fling = Math.abs(drag.vel) > flingVel && Math.sign(drag.vel) === Math.sign(dx);
            const advance = Math.abs(dx) > width * 0.4 || fling;
            if (advance) {
                if (dx < 0) this.next();
                else this.prev();
            } else {
                this._apply(); // 回弹
            }
        };
        stage.addEventListener('pointerdown', onDown);
        stage.addEventListener('pointermove', onMove);
        stage.addEventListener('pointerup', onUp);
        stage.addEventListener('pointercancel', onUp);
        // 单图或点击（未拖动）时也能看大图
        stage.addEventListener('click', () => {
            if (this.images.length < 2 && this.onTap) this.onTap(this.cur, this.images);
        });
        this._handlers = { onDown, onMove, onUp };
    }

    next() {
        if (this.cur < this.images.length - 1) this.cur += 1;
        this._apply();
    }

    prev() {
        if (this.cur > 0) this.cur -= 1;
        this._apply();
    }

    goto(i) {
        this.cur = Math.min(this.images.length - 1, Math.max(0, i | 0));
        this._apply();
    }

    get index() { return this.cur; }

    destroy() {
        try { this.stage?.remove(); } catch {}
        this.cards = [];
    }
}
