import { getRequestHeaders } from '/script.js';

export function requestHeaders() {
    return getRequestHeaders();
}

export function jsonRequestHeaders() {
    return {
        ...getRequestHeaders(),
        'Content-Type': 'application/json',
    };
}
