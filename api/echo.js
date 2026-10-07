'use strict';

/* What the server sees: request headers (incl. client hints), the visitor's IP and coarse geo.
   IP and city are only echoed back to the visitor; /api/report strips them before storing. */

const { headersOf, geoOf, ipOf } = require('./_lib');

module.exports = (req, res) => {
    const id = req.headers['x-vercel-id'] || '';
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
        now: Date.now(),
        region: process.env.VERCEL_REGION || null,
        edge: id ? id.split('::')[0] : null,
        ip: ipOf(req),
        geo: geoOf(req),
        headers: headersOf(req)
    });
};
