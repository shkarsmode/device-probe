'use strict';

/* Smallest possible answer for round-trip measurements to the fra1 function region. */
module.exports = (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send('pong');
};
