'use strict';

/*
 * POST /api/report  { session, report, digest }  -> stores or updates the device record
 * GET  /api/report?id=<id>                        -> one stored record
 *
 * One record per device configuration (UA + screen + GPU + UA-CH). Visits count once per page
 * session; keys, gamepads and deep link attempts accumulate across visits.
 */

const lib = require('./_lib');

function bad(res, code, msg) {
    res.status(code).json({ error: msg });
}

async function getOne(req, res) {
    const id = String(req.query.id || '');
    if (!/^[a-f0-9]{10}$/.test(id)) {
        return bad(res, 400, 'bad id');
    }
    const rec = await lib.readJson('reports/' + id + '.json');
    if (!rec) {
        return bad(res, 404, 'not found');
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(rec.data);
}

async function save(req, res) {
    const body = req.body;
    if (!body || typeof body !== 'object' || !body.report || typeof body.report !== 'object') {
        return bad(res, 400, 'expected { session, report }');
    }
    if (JSON.stringify(body).length > lib.MAX_BODY) {
        return bad(res, 413, 'report too large');
    }
    const report = lib.sanitize(body.report);
    const session = String(body.session || '').slice(0, 32);
    const id = lib.deviceId(report);
    const path = 'reports/' + id + '.json';
    const now = new Date().toISOString();
    const country = req.headers['x-vercel-ip-country'] || null;

    const prev = await lib.readJson(path);
    const rec = prev ? prev.data : { id: id, firstSeen: now, visits: 0, sessions: [] };
    if (!prev) {
        const index = await lib.readJson(lib.INDEX);
        if (index && index.data.items && index.data.items.length >= lib.MAX_RECORDS) {
            return bad(res, 507, 'device table is full');
        }
    }
    if (rec.sessions.indexOf(session) < 0) {
        rec.visits += 1;
        rec.sessions = [session].concat(rec.sessions).slice(0, 50);
    }
    const old = rec.report || {};
    report.input = report.input || {};
    report.input.keysSeen = lib.mergeList(old.input && old.input.keysSeen, report.input.keysSeen, (k) => k.keyCode + '|' + k.key, (a, b) => {
        a.count = Math.max(a.count || 1, b.count || 1);
    });
    report.input.gamepadsSeen = lib.mergeList(old.input && old.input.gamepadsSeen, report.input.gamepadsSeen, (g) => g.id);
    report.bench = lib.mergeList(old.bench, report.bench, (b) => b.id + '|' + b.ts);

    rec.lastSeen = now;
    rec.country = country || rec.country || null;
    rec.digest = lib.cleanDigest(body.digest);
    rec.digest.keys = report.input.keysSeen.length;
    rec.digest.bench = report.bench.length;
    rec.report = report;

    await lib.writeJson(path, rec);
    await lib.updateIndex((index) => {
        index.items = index.items || [];
        const row = { id: id, firstSeen: rec.firstSeen, lastSeen: rec.lastSeen, visits: rec.visits, country: rec.country, digest: rec.digest };
        const at = index.items.findIndex((x) => x.id === id);
        if (at >= 0) {
            index.items[at] = row;
        } else {
            index.items.push(row);
        }
    });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ id: id, visits: rec.visits, firstSeen: rec.firstSeen, lastSeen: rec.lastSeen, url: 'https://' + lib.hostOf(req) + '/r/' + id });
}

module.exports = async (req, res) => {
    try {
        if (req.method === 'GET') {
            return await getOne(req, res);
        }
        if (req.method === 'POST') {
            return await save(req, res);
        }
        res.setHeader('Allow', 'GET, POST');
        return bad(res, 405, 'method not allowed');
    } catch (e) {
        console.error(e);
        return bad(res, 500, e && e.message ? e.message : 'server error');
    }
};
