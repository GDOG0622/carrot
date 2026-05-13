const UNSPLASH_CACHE_PREFIX = 'cip_unsplash_cache_v1:';
const UNSPLASH_PENDING_REQUESTS = new Map();
const UNSPLASH_MAX_RETRIES = 2;
const unsplashPlaceholderRegex = /\[([^\[\]]+?)\.jpg\]/gi;

function getUnsplashCacheKey(query) {
    return `${UNSPLASH_CACHE_PREFIX}${query}`;
}

function readUnsplashCache(query) {
    try {
        const raw = localStorage.getItem(getUnsplashCacheKey(query));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.imageUrl !== 'string') return null;
        return parsed;
    } catch (error) {
        console.error('胡萝卜插件：读取Unsplash缓存失败', error);
        return null;
    }
}

function writeUnsplashCache(query, data) {
    try {
        localStorage.setItem(
            getUnsplashCacheKey(query),
            JSON.stringify(data),
        );
    } catch (error) {
        console.error('胡萝卜插件：写入Unsplash缓存失败', error);
    }
}

async function requestUnsplashImage(query, unsplashAccessKey) {
    if (!unsplashAccessKey) return null;

    const cached = readUnsplashCache(query);
    if (cached) return cached;

    if (UNSPLASH_PENDING_REQUESTS.has(query)) {
        return UNSPLASH_PENDING_REQUESTS.get(query);
    }

    const fetchPromise = (async () => {
        try {
            const url = new URL('https://api.unsplash.com/photos/random');
            url.searchParams.set('query', query);
            url.searchParams.set('orientation', 'squarish');
            url.searchParams.set('content_filter', 'high');

            const res = await fetch(url.toString(), {
                headers: {
                    Authorization: `Client-ID ${unsplashAccessKey}`,
                },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const imageUrl =
                data?.urls?.small_s3 ||
                data?.urls?.small ||
                data?.urls?.thumb ||
                data?.urls?.regular ||
                '';
            if (!imageUrl) return null;
            const payload = {
                imageUrl,
                altText:
                    data?.description ||
                    data?.alt_description ||
                    query,
            };
            writeUnsplashCache(query, payload);
            return payload;
        } catch (error) {
            console.error('胡萝卜插件：获取Unsplash图片失败', error);
            return null;
        } finally {
            UNSPLASH_PENDING_REQUESTS.delete(query);
        }
    })();

    UNSPLASH_PENDING_REQUESTS.set(query, fetchPromise);
    return fetchPromise;
}

export function createUnsplashProcessor({
    replacePlaceholderWithNode,
    getUnsplashAccessKey,
    documentRef = document,
}) {
    const processedMessages = new WeakSet();

    async function processMessageElement(element) {
        if (!element) return;

        const text = element.textContent || element.innerText || '';
        const hasUnsplashPlaceholder = unsplashPlaceholderRegex.test(text);
        unsplashPlaceholderRegex.lastIndex = 0;

        if (!hasUnsplashPlaceholder) {
            delete element.dataset.unsplashSignature;
            processedMessages.delete(element);
            return;
        }

        if (!getUnsplashAccessKey()) {
            delete element.dataset.unsplashSignature;
            processedMessages.delete(element);
            return;
        }

        const matches = Array.from(text.matchAll(unsplashPlaceholderRegex));
        const signature = matches.map((match) => match[0]).join('|');
        const previousSignature = element.dataset.unsplashSignature || '';

        let attempts = Number(element.dataset.unsplashAttempts || '0');
        if (previousSignature !== signature) {
            attempts = 0;
        } else if (attempts >= UNSPLASH_MAX_RETRIES) {
            return;
        }

        if (processedMessages.has(element) && previousSignature === signature) {
            return;
        }

        element.dataset.unsplashSignature = signature;
        processedMessages.add(element);
        element.dataset.unsplashAttempts = String(attempts + 1);

        let replacedAny = false;
        for (const match of matches) {
            const placeholder = match[0];
            const description = match[1]?.trim();
            if (!description) continue;

            const unsplashData = await requestUnsplashImage(
                description,
                getUnsplashAccessKey(),
            );
            if (!unsplashData?.imageUrl) continue;

            const img = documentRef.createElement('img');
            img.src = unsplashData.imageUrl;
            img.alt = `${description}.jpg`;
            img.style.display = 'block';
            img.style.width = '100px';
            img.style.height = '100px';
            img.style.objectFit = 'contain';
            img.style.borderRadius = '0px';

            const replaced = replacePlaceholderWithNode(
                element,
                placeholder,
                img,
            );
            replacedAny = replaced || replacedAny;
        }

        if (!replacedAny) {
            processedMessages.delete(element);
            delete element.dataset.unsplashSignature;
            if (attempts + 1 < UNSPLASH_MAX_RETRIES) {
                setTimeout(() => processMessageElement(element), 1500);
            }
        }
    }

    function observeChatContainer(chatContainer) {
        if (!chatContainer) return;

        const processExisting = () => {
            chatContainer.querySelectorAll('.mes_text').forEach((el) => {
                processMessageElement(el);
            });
        };

        processExisting();

        const observer = new MutationObserver((mutations) => {
            const pending = new Set();

            const queueElement = (element) => {
                if (!element) return;
                if (!element.classList?.contains('mes_text')) {
                    element = element.closest?.('.mes_text');
                }
                if (element) {
                    pending.add(element);
                }
            };

            mutations.forEach((mutation) => {
                if (mutation.type === 'characterData') {
                    const parent = mutation.target?.parentElement;
                    queueElement(parent);
                    return;
                }

                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType !== Node.ELEMENT_NODE) {
                            queueElement(node.parentElement);
                            return;
                        }
                        if (node.classList?.contains('mes_text')) {
                            queueElement(node);
                        } else {
                            node
                                .querySelectorAll?.('.mes_text')
                                .forEach((el) => queueElement(el));
                        }
                    });

                    queueElement(mutation.target);
                }
            });

            pending.forEach((element) => processMessageElement(element));
        });

        observer.observe(chatContainer, {
            childList: true,
            subtree: true,
            characterData: true,
        });
    }

    function init() {
        const setup = () => {
            const chatContainer = documentRef.getElementById('chat');
            if (chatContainer) {
                observeChatContainer(chatContainer);
                return true;
            }
            return false;
        };

        if (setup()) return;

        const bodyObserver = new MutationObserver(() => {
            if (setup()) {
                bodyObserver.disconnect();
            }
        });

        bodyObserver.observe(documentRef.body, {
            childList: true,
            subtree: true,
        });
    }

    function reprocess() {
        const chatContainer = documentRef.getElementById('chat');
        if (!chatContainer) return;

        chatContainer.querySelectorAll('.mes_text').forEach((element) => {
            delete element.dataset.unsplashAttempts;
            delete element.dataset.unsplashSignature;
            processedMessages.delete(element);
            processMessageElement(element);
        });
    }

    return {
        init,
        processMessageElement,
        reprocess,
    };
}
