'use strict';

/* GET /api/qr?id=<id> -> SVG QR code of the report URL, so a TV report opens on a phone.
   Only report ids are accepted: this is not a general QR generator. */

const QRCode = require('qrcode');
const { hostOf } = require('./_lib');

module.exports = async (req, res) => {
    const id = String(req.query.id || '');
    if (!/^[a-f0-9]{10}$/.test(id)) {
        res.status(400).send('bad id');
        return;
    }
    const svg = await QRCode.toString('https://' + hostOf(req) + '/r/' + id, {
        type: 'svg',
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#000000', light: '#ffffff' }
    });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(200).send(svg);
};
