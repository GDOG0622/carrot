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

export function findLatestQqrImage(messages, qqrLookup) {
    if (!Array.isArray(messages) || !messages.length) return null;
    const message = messages[messages.length - 1];
    const source = typeof message?.mes === 'string'
        ? message.mes
        : typeof message?.message === 'string'
            ? message.message
            : '';
    const matches = Array.from(source.matchAll(/<!--\s*([^<>]+?)\.qqr\s*-->/gi));
    if (!matches.length) return null;
    const description = normalizeDescription(matches[matches.length - 1][1]);
    return {
        description,
        url: qqrLookup?.get(description) || '',
    };
}
