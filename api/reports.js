'use strict';

/* GET /api/reports -> every stored device, newest first (one row per device configuration) */

const lib = require('./_lib');

module.exports = async (req, res) => {
    try {
        const index = await lib.readJson(lib.INDEX);
        const items = index && index.data.items ? index.data.items.slice() : [];
        items.sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).json({ count: items.length, updated: index ? index.data.updated : null, items: items });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e && e.message ? e.message : 'server error' });
    }
};
