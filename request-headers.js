import { getRequestHeaders } from '/script.js';

export function jsonRequestHeaders() {
    return {
        ...getRequestHeaders(),
        'Content-Type': 'application/json',
    };
}
