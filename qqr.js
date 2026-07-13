function normalizeDescription(value) {
    return String(value || '')
        .trim()
        .replace(/\.qqr$/i, '')
        .trim();
}

export function buildQqrLookup(qqrData) {
    const lookup = new Map();
    if (!Array.isArray(qqrData)) return lookup;
    qqrData.forEach((item) => {
        const desc = normalizeDescription(item?.desc);
        const url = String(item?.url || '').trim();
        if (desc && url) lookup.set(desc, url);
    });
    return lookup;
}

export function resolveQqrImageReference(value, qqrLookup) {
    const reference = String(value || '').trim();
    const match = reference.match(/^<!--\s*([^<>]+?)\.qqr\s*-->$/i);
    if (!match) return reference;
    return qqrLookup?.get(normalizeDescription(match[1])) || '';
}

function createQqrImage(documentRef, description, url) {
    const img = documentRef.createElement('img');
    img.src = url;
    img.alt = description;
    img.className = 'carrot-qqr-image';
    img.dataset.carrotQqrKey = description;
    img.setAttribute('description', description);
    img.style.setProperty('display', 'block', 'important');
    img.style.setProperty('width', 'auto', 'important');
    img.style.setProperty('height', 'auto', 'important');
    img.style.setProperty('max-width', 'min(160px, 55vw)', 'important');
    img.style.setProperty('max-height', '220px', 'important');
    img.style.setProperty('object-fit', 'contain', 'important');
    img.style.setProperty('border-radius', '0', 'important');
    return img;
}

function createQqrPlaceholder(documentRef, description) {
    const placeholder = documentRef.createElement('span');
    placeholder.className = 'carrot-qqr-placeholder';
    placeholder.dataset.carrotQqrPlaceholder = description;
    placeholder.setAttribute('aria-hidden', 'true');
    return placeholder;
}

export function replaceQqrPlaceholders({
    element,
    qqrLookup,
    replacePlaceholderWithNode,
    documentRef = document,
}) {
    if (!element || !qqrLookup?.size) return false;
    let replacedAny = false;
    element.querySelectorAll?.('[data-carrot-qqr-placeholder]').forEach((placeholder) => {
        const description = normalizeDescription(placeholder.dataset.carrotQqrPlaceholder);
        const url = qqrLookup.get(description);
        if (!description || !url) return;
        placeholder.replaceWith(createQqrImage(documentRef, description, url));
        replacedAny = true;
    });

    const text = element.textContent || element.innerText || '';
    const matches = Array.from(text.matchAll(/<!--\s*([^<>]+?)\.qqr\s*-->/gi));
    for (const match of matches) {
        const description = normalizeDescription(match[1]);
        const url = qqrLookup.get(description);
        if (!description || !url) continue;
        const replaced = replacePlaceholderWithNode(
            element,
            match[0],
            createQqrImage(documentRef, description, url),
        );
        replacedAny = replaced || replacedAny;
    }
    return replacedAny;
}

export function reprocessQqrPlaceholders({
    qqrLookup,
    replacePlaceholderWithNode,
    documentRef = document,
}) {
    const chatContainer = documentRef.getElementById('chat');
    if (!chatContainer) return;
    chatContainer.querySelectorAll('.mes_text').forEach((element) => {
        element.querySelectorAll('img[data-carrot-qqr-key]').forEach((img) => {
            const description = normalizeDescription(img.dataset.carrotQqrKey);
            const url = qqrLookup.get(description);
            if (url) {
                if (img.getAttribute('src') !== url) img.src = url;
            } else {
                img.replaceWith(createQqrPlaceholder(documentRef, description));
            }
        });
        replaceQqrPlaceholders({
            element,
            qqrLookup,
            replacePlaceholderWithNode,
            documentRef,
        });
    });
}
