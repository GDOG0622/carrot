// carrot 多图堆叠卡
//
// 折叠态：微信风格堆叠成一摞（分层 peek + 旋转 + 缩放 + 卡片阴影）。
//   —— 堆叠卡的「视觉」参考 Wren036/PhotoStack（https://github.com/Wren036/PhotoStack，
//      许可证 PolyForm Noncommercial 1.0.0，个人 / 非商用免费），致谢原作者 Wren036。
// 交互：堆叠左侧「展开」按钮 → 把图横排铺开；末尾「收起」按钮 → 收回堆叠。
//   —— 展开 / 收起为 carrot 自实现（不用拖拽滑动，避免与酒馆「左右滑动切换生成」冲突）。
// 点单张图 → 全屏查看（由 onTap 回调处理）。

const DEFAULTS = {
    stackW: 190,     // 折叠堆叠舞台宽（px）
    stackH: 240,     // 折叠堆叠舞台高（px）
    peek: 14,        // 每层向右露出的偏移
    rotStep: 2.0,    // 每层旋转角度
    scaleStep: 0.05, // 每层缩小比例
    rowThumb: 150,   // 展开后每张缩略图高度（px）
};

export class CarrotPhotoStack {
    constructor(container, images, options = {}) {
        this.doc = container.ownerDocument || document;
        this.container = container;
        this.images = Array.isArray(images) ? images.slice() : [];
        this.opt = { ...DEFAULTS, ...options };
        this.onTap = typeof options.onTap === 'function' ? options.onTap : null;
        this._build();
    }

    _openTap(i) {
        if (this.onTap) this.onTap(i, this.images);
    }

    _build() {
        const root = this.doc.createElement('div');
        root.className = 'carrot-photos';
        root.dataset.mode = 'stack';
        root.append(this._buildStack(), this._buildRow());
        this.root = root;
        this.container.appendChild(root);
    }

    _buildStack() {
        const { stackW, stackH, peek, rotStep, scaleStep } = this.opt;

        const expand = this.doc.createElement('button');
        expand.type = 'button';
        expand.className = 'carrot-photos-expand';
        expand.title = `展开 ${this.images.length} 张图片`;
        expand.textContent = '›';
        expand.addEventListener('click', (e) => { e.stopPropagation(); this.expand(); });

        const stack = this.doc.createElement('div');
        stack.className = 'carrot-photos-stack';
        stack.style.width = `${stackW}px`;
        stack.style.height = `${stackH}px`;

        // 最多叠 3 层预览：底层先入，顶层最后（z-index 最高）
        const preview = Math.min(this.images.length, 3);
        for (let i = preview - 1; i >= 0; i -= 1) {
            const card = this.doc.createElement('div');
            card.className = 'pstack-card';
            card.style.transform = `translateX(${i * peek}px) rotate(${i * rotStep}deg) scale(${1 - i * scaleStep})`;
            card.style.zIndex = String(100 - i);
            const img = this.doc.createElement('img');
            img.src = this.images[i];
            img.alt = '';
            img.loading = 'lazy';
            img.draggable = false;
            card.appendChild(img);
            if (i === 0) {
                card.classList.add('pstack-top');
                card.addEventListener('click', (e) => { e.stopPropagation(); this._openTap(0); });
            }
            stack.appendChild(card);
        }

        const badge = this.doc.createElement('div');
        badge.className = 'pstack-badge';
        badge.textContent = String(this.images.length);
        stack.appendChild(badge);

        const box = this.doc.createElement('div');
        box.className = 'carrot-photos-stackbox';
        box.append(expand, stack);
        return box;
    }

    _buildRow() {
        const { rowThumb } = this.opt;
        const row = this.doc.createElement('div');
        row.className = 'carrot-photos-row';

        this.images.forEach((src, i) => {
            const cell = this.doc.createElement('div');
            cell.className = 'carrot-photos-cell';
            const img = this.doc.createElement('img');
            img.src = src;
            img.alt = '';
            img.loading = 'lazy';
            img.draggable = false;
            img.style.height = `${rowThumb}px`;
            cell.appendChild(img);
            cell.addEventListener('click', (e) => { e.stopPropagation(); this._openTap(i); });
            row.appendChild(cell);
        });

        // 收起按钮：放在最后一张图右边
        const collapse = this.doc.createElement('button');
        collapse.type = 'button';
        collapse.className = 'carrot-photos-collapse';
        collapse.title = '收起';
        collapse.textContent = '‹';
        collapse.addEventListener('click', (e) => { e.stopPropagation(); this.collapse(); });
        row.appendChild(collapse);
        return row;
    }

    expand() { if (this.root) this.root.dataset.mode = 'row'; }
    collapse() { if (this.root) this.root.dataset.mode = 'stack'; }

    destroy() {
        try { this.root?.remove(); } catch {}
    }
}
