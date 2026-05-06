const CARROT_SELECT_SCOPE = [
    '#cip-input-panel',
    '#cip-settings-panel',
    '#cip-extension-container',
    '#cip-add-category-modal',
    '#cip-add-stickers-modal',
].join(',');

function findCarrotSelect(target) {
    const select = target?.closest?.('select');
    if (!select) return null;
    return select.closest(CARROT_SELECT_SCOPE) ? select : null;
}

function getVisibleSize(select) {
    return Math.min(6, Math.max(select.options.length, 1));
}

function expandSelect(select) {
    if (!select || select.disabled || select.dataset.cipSelectOpen === '1') {
        return;
    }

    select.dataset.cipSelectOpen = '1';
    select.dataset.cipOriginalSize = select.getAttribute('size') || '';
    select.classList.add('cip-select-expanded');
    select.size = getVisibleSize(select);
    select.focus({ preventScroll: true });
}

function collapseSelect(select) {
    if (!select || select.dataset.cipSelectOpen !== '1') return;

    const originalSize = select.dataset.cipOriginalSize;
    if (originalSize) {
        select.setAttribute('size', originalSize);
    } else {
        select.removeAttribute('size');
        select.size = 0;
    }

    select.classList.remove('cip-select-expanded');
    delete select.dataset.cipSelectOpen;
    delete select.dataset.cipOriginalSize;
}

export function initCompactSelectDropdowns(documentRef = document) {
    documentRef.addEventListener(
        'pointerdown',
        (event) => {
            const select = findCarrotSelect(event.target);
            documentRef
                .querySelectorAll('select.cip-select-expanded')
                .forEach((openSelect) => {
                    if (openSelect !== select) collapseSelect(openSelect);
                });

            if (!select) return;
            if (select.dataset.cipSelectOpen === '1') return;

            event.preventDefault();
            expandSelect(select);
        },
        true,
    );

    documentRef.addEventListener('change', (event) => {
        const select = findCarrotSelect(event.target);
        if (select) collapseSelect(select);
    });

    documentRef.addEventListener(
        'focusout',
        (event) => {
            const select = findCarrotSelect(event.target);
            if (!select) return;
            setTimeout(() => collapseSelect(select), 0);
        },
        true,
    );

    documentRef.addEventListener('keydown', (event) => {
        const select = findCarrotSelect(event.target);
        if (!select) return;

        if (event.key === 'Escape' || event.key === 'Enter') {
            collapseSelect(select);
            return;
        }

        if (event.altKey && event.key === 'ArrowDown') {
            event.preventDefault();
            expandSelect(select);
        }
    });
}
