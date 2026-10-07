'use strict';

/* Shared server helpers. Files starting with "_" are not deployed as functions. */

const crypto = require('crypto');
const { get, put } = require('@vercel/blob');

const MAX_BODY = 400 * 1024;
const MAX_RECORDS = 5000;
const INDEX = 'index.json';

/* headers that are secrets, routing internals, the visitor's address, or our own response
   headers that Vercel copies onto the function request (accept-ch, x-robots-tag, ...) */
const DROP_HEADER = /^(cookie|authorization|forwarded|x-real-ip|x-forwarded-for|x-vercel-forwarded-for|x-vercel-proxy-signature.*|x-vercel-oidc-token|x-vercel-sc-.*|x-vercel-internal-.*|x-middleware-.*|x-vercel-deployment-url|x-vercel-proxied-for|x-vercel-ip-.*|x-invocation-id|x-vercel-enable-rewrite-caching|accept-ch|referrer-policy|x-content-type-options|x-robots-tag)$/i;

function headersOf(req) {
    const out = {};
    Object.keys(req.headers).sort().forEach((k) => {
        if (!DROP_HEADER.test(k)) {
            out[k] = String(req.headers[k]);
        }
    });
    return out;
}

function decode(v) {
    if (!v) {
        return null;
    }
    try {
        return decodeURIComponent(v);
    } catch (e) {
        return v;
    }
}

function geoOf(req) {
    const h = req.headers;
    return {
        country: h['x-vercel-ip-country'] || null,
        region: decode(h['x-vercel-ip-country-region']),
        city: decode(h['x-vercel-ip-city']),
        continent: h['x-vercel-ip-continent'] || null,
        timezone: h['x-vercel-ip-timezone'] || null
    };
}

function ipOf(req) {
    const h = req.headers;
    return h['x-real-ip'] || (h['x-forwarded-for'] || '').split(',')[0].trim() || null;
}

/* the same device configuration maps to the same record */
function deviceId(r) {
    const s = (r.display && r.display.screen) || {};
    const u = r.uaData || {};
    const g = r.graphics || {};
    const sig = [
        r.identity && r.identity.userAgent,
        r.identity && r.identity.platform,
        s.width + 'x' + s.height,
        r.display && r.display.devicePixelRatio,
        g.unmaskedRenderer || g.renderer,
        u.platformVersion,
        u.model
    ].join('|');
    return crypto.createHash('sha256').update(sig).digest('hex').slice(0, 10);
}

const DIGEST_KEYS = ['cls', 'device', 'vendor', 'os', 'year', 'model', 'browser', 'engine', 'screen', 'hdr', 'h264', 'hevc', 'vp9', 'av1', 'rtcAv1', 'rtcH265', 'widevine', 'playready', 'gamepad', 'keys', 'bench'];

function cleanDigest(d) {
    const out = {};
    DIGEST_KEYS.forEach((k) => {
        const v = d ? d[k] : null;
        if (typeof v === 'string') {
            out[k] = v.slice(0, 80);
        } else if (typeof v === 'number' || typeof v === 'boolean') {
            out[k] = v;
        } else {
            out[k] = null;
        }
    });
    return out;
}

/* nothing that points at a person is stored: no IP, no city, no referrer */
function sanitize(r) {
    if (r.server) {
        delete r.server.ip;
        r.server.geo = r.server.geo ? { country: r.server.geo.country || null } : null;
        if (r.server.headers) {
            Object.keys(r.server.headers).forEach((k) => {
                if (DROP_HEADER.test(k)) {
                    delete r.server.headers[k];
                }
            });
        }
    }
    if (r.identity) {
        delete r.identity.referrer;
    }
    return r;
}

function mergeList(a, b, keyFn, merge) {
    const map = {};
    const out = [];
    (a || []).concat(b || []).forEach((x) => {
        if (!x || typeof x !== 'object') {
            return;
        }
        const k = keyFn(x);
        if (map[k]) {
            if (merge) {
                merge(map[k], x);
            }
            return;
        }
        map[k] = x;
        out.push(x);
    });
    return out.slice(0, 500);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* the Blob service answers an occasional 5xx; those are worth a second try */
async function retry(fn) {
    let last;
    for (let i = 0; i < 3; i++) {
        try {
            return await fn();
        } catch (e) {
            last = e;
            if (!/\b5\d\d\b|ECONNRESET|ETIMEDOUT|fetch failed|unavailable|rate.?limit/i.test(e.name + ' ' + e.message)) {
                throw e;
            }
            await sleep(200 * (i + 1) + Math.random() * 100);
        }
    }
    throw last;
}

async function readJson(pathname) {
    let r;
    try {
        r = await retry(() => get(pathname, { access: 'private', useCache: false }));
    } catch (e) {
        if (e && /not.?found/i.test(e.name + ' ' + e.message)) {
            return null;
        }
        throw e;
    }
    if (!r || r.statusCode !== 200 || !r.stream) {
        return null;
    }
    const text = await new Response(r.stream).text();
    /* get() hands back the CDN's weak ETag (W/"..."); conditional put() wants the strong one */
    return { data: JSON.parse(text), etag: String(r.blob.etag || '').replace(/^W\//, '') };
}

async function writeJson(pathname, data, ifMatch) {
    const opts = {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        cacheControlMaxAge: 60
    };
    if (ifMatch) {
        opts.ifMatch = ifMatch;
    }
    return retry(() => put(pathname, JSON.stringify(data), opts));
}

/* read-modify-write of the index with an ETag check, so parallel saves do not drop rows */
async function updateIndex(mutate) {
    for (let attempt = 0; attempt < 8; attempt++) {
        const cur = await readJson(INDEX);
        const index = cur ? cur.data : { items: [] };
        const result = mutate(index);
        if (result === false) {
            return index;
        }
        index.updated = new Date().toISOString();
        try {
            await writeJson(INDEX, index, cur ? cur.etag : null);
            return index;
        } catch (e) {
            if (e && /precondition|etag|conflict/i.test(e.name + ' ' + e.message)) {
                await sleep(40 + Math.random() * 160);
                continue;
            }
            throw e;
        }
    }
    throw new Error('index is busy, try again');
}

function hostOf(req) {
    return req.headers['x-forwarded-host'] || req.headers.host;
}

module.exports = {
    MAX_BODY,
    MAX_RECORDS,
    INDEX,
    headersOf,
    geoOf,
    ipOf,
    deviceId,
    cleanDigest,
    sanitize,
    mergeList,
    readJson,
    writeJson,
    updateIndex,
    hostOf
};
