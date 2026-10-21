// 气泡点击菜单与输入预览；正文仍交给酒馆输入框发送。
export function initQuoteReply({ inputPanel, mainInput, showPanel, switchTextSubType }) {
    const preview = document.getElementById('cip-reply-preview');
    const previewText = document.getElementById('cip-reply-text');
    let quotedText = null;
    let selectedBubble = null;
    const menu = document.createElement('button');
    menu.type = 'button';
    menu.className = 'cip-reply-menu';
    menu.textContent = '回复';
    menu.hidden = true;
    document.body.appendChild(menu);

    function hideMenu() {
        menu.hidden = true;
        selectedBubble = null;
    }
    function clear() {
        quotedText = null;
        preview.hidden = true;
        previewText.textContent = '';
        hideMenu();
    }
    document.getElementById('cip-reply-cancel').addEventListener('click', clear);
    document.addEventListener('click', event => {
        if (menu.contains(event.target)) return;
        const bubble = event.target.closest?.('[data-carrot-reply-body]');
        if (!bubble || event.target.closest('a, button, input, textarea, summary')
            || window.getSelection()?.toString()) {
            hideMenu();
            return;
        }
        if (selectedBubble === bubble) { hideMenu(); return; }
        selectedBubble = bubble;
        menu.hidden = false;
        const rect = bubble.getBoundingClientRect();
        menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - menu.offsetWidth - 8))}px`;
        menu.style.top = `${Math.max(8, rect.top - menu.offsetHeight - 6)}px`;
    });
    menu.addEventListener('click', event => {
        event.stopPropagation();
        if (!selectedBubble?.isConnected) { hideMenu(); return; }
        quotedText = selectedBubble.dataset.carrotReplyBody;
        previewText.textContent = quotedText;
        preview.hidden = false;
        switchTextSubType('plain');
        // 重算新增预览后的面板位置。
        inputPanel.classList.remove('active');
        showPanel();
        mainInput.focus();
        hideMenu();
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') hideMenu(); });
    window.addEventListener('resize', hideMenu);
    document.addEventListener('scroll', hideMenu, true);
    const ctx = window.SillyTavern?.getContext?.();
    const eventTypes = ctx?.eventTypes || ctx?.event_types;
    if (ctx?.eventSource && eventTypes?.CHAT_CHANGED) {
        ctx.eventSource.on(eventTypes.CHAT_CHANGED, clear);
    }
    return {
        content: text => quotedText === null ? text : `${text}>${quotedText}`,
        setType: type => { preview.hidden = quotedText === null || type !== 'plain'; },
        clear,
    };
}
