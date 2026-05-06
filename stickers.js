export function buildStickerLookup(stickerData) {
    const nextLookup = new Map();
    Object.values(stickerData || {}).forEach((items) => {
        if (!Array.isArray(items)) return;
        items.forEach((item) => {
            if (!item) return;
            const desc = (item.desc || '').trim();
            const url = (item.url || '').trim();
            if (!desc || !url) return;
            nextLookup.set(desc, url);
        });
    });
    return nextLookup;
}

export function replaceStickerPlaceholders({
    element,
    stickerLookup,
    stickerPlaceholderRegex,
    replacePlaceholderWithNode,
    documentRef = document,
}) {
    if (!element || !stickerLookup?.size) return false;
    const text = element.textContent || element.innerText || '';
    const matches = Array.from(text.matchAll(stickerPlaceholderRegex));
    if (!matches.length) return false;
    let replacedAny = false;
    for (const match of matches) {
        const placeholder = match[0];
        let description = match[1] ? match[1].trim() : '';
        if (!description) continue;
        if (description.startsWith('http')) continue;
        let lookupKey = description;
        let url = stickerLookup.get(lookupKey);
        if (!url) {
            const stripped = lookupKey.replace(
                /\.(?:jpe?g|png|gif|webp|svg|bmp|avif)$/i,
                '',
            );
            if (stripped !== lookupKey) {
                lookupKey = stripped;
                url = stickerLookup.get(lookupKey);
            }
        }
        if (!url) continue;
        const img = documentRef.createElement('img');
        img.src = url;
        img.alt = 'Sticker';
        img.style.display = 'block';
        img.style.width = '100px';
        img.style.height = '100px';
        img.style.objectFit = 'contain';
        img.style.borderRadius = '0px';
        img.setAttribute('description', lookupKey);
        const replaced = replacePlaceholderWithNode(
            element,
            placeholder,
            img,
        );
        replacedAny = replaced || replacedAny;
    }
    return replacedAny;
}

export function reprocessStickerPlaceholders({
    stickerLookup,
    stickerPlaceholderRegex,
    replacePlaceholderWithNode,
    documentRef = document,
}) {
    const chatContainer = documentRef.getElementById('chat');
    if (!chatContainer) return;
    chatContainer.querySelectorAll('.mes_text').forEach((element) => {
        replaceStickerPlaceholders({
            element,
            stickerLookup,
            stickerPlaceholderRegex,
            replacePlaceholderWithNode,
            documentRef,
        });
    });
}
