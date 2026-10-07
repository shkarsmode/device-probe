/* device-probe: shared helpers. ES5 only - this has to run on Chromium 38 (webOS 3) and older WebKit TVs. */
(function (w) {
    'use strict';

    var DP = w.DP = w.DP || {};

    DP.version = '1.0.0';
    DP.errors = [];

    DP.now = function () {
        return w.performance && w.performance.now ? w.performance.now() : new Date().getTime();
    };

    DP.t0 = DP.now();

    DP.err = function (where, e) {
        DP.errors.push(where + ': ' + (e && e.message ? e.message : String(e)));
    };

    /* run fn, record a failure instead of letting one probe kill the page */
    DP.safe = function (where, fn, fallback) {
        try {
            return fn();
        } catch (e) {
            DP.err(where, e);
            return fallback === undefined ? null : fallback;
        }
    };

    DP.each = function (list, fn) {
        if (!list) {
            return;
        }
        for (var i = 0; i < list.length; i++) {
            fn(list[i], i);
        }
    };

    DP.keys = function (o) {
        var out = [];
        for (var k in o) {
            if (Object.prototype.hasOwnProperty.call(o, k)) {
                out.push(k);
            }
        }
        return out;
    };

    DP.esc = function (s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    };

    DP.param = function (name) {
        var m = new RegExp('[?&]' + name + '(?:=([^&#]*))?(?:[&#]|$)').exec(w.location.search);
        if (!m) {
            return null;
        }
        return m[1] === undefined ? '' : decodeURIComponent(m[1].replace(/\+/g, ' '));
    };

    DP.store = {
        get: function (k) {
            try {
                return w.localStorage.getItem('dp.' + k);
            } catch (e) {
                return null;
            }
        },
        set: function (k, v) {
            try {
                if (v === null) {
                    w.localStorage.removeItem('dp.' + k);
                } else {
                    w.localStorage.setItem('dp.' + k, v);
                }
            } catch (e) {
                /* storage can be off on TVs and in private mode */
            }
        }
    };

    /* XMLHttpRequest, because fetch() only arrived in Chromium 42 */
    DP.xhr = function (method, url, body, cb, timeoutMs) {
        var x;
        var done = false;
        var t = DP.now();

        function finish(err, data) {
            if (done) {
                return;
            }
            done = true;
            cb(err, data, DP.now() - t);
        }

        try {
            x = new XMLHttpRequest();
            x.open(method, url, true);
            if (body !== null && body !== undefined) {
                x.setRequestHeader('Content-Type', 'application/json');
            }
            x.timeout = timeoutMs || 8000;
            x.onreadystatechange = function () {
                if (x.readyState !== 4) {
                    return;
                }
                if (x.status >= 200 && x.status < 300) {
                    var data = x.responseText;
                    try {
                        data = JSON.parse(x.responseText);
                    } catch (e) {
                        /* plain text */
                    }
                    finish(null, data);
                } else if (x.status) {
                    finish(new Error('HTTP ' + x.status));
                }
            };
            x.ontimeout = function () {
                finish(new Error('timeout'));
            };
            x.onerror = function () {
                finish(new Error('network error'));
            };
            x.send(body !== null && body !== undefined ? JSON.stringify(body) : null);
        } catch (e) {
            finish(e);
        }
        setTimeout(function () {
            finish(new Error('timeout'));
        }, (timeoutMs || 8000) + 1000);
    };

    /*
     * Async probes register here. Each one gets a deadline, so a TV that never answers an
     * EME or WebGPU request cannot hold the report back.
     */
    DP.pending = 0;
    DP.taskLog = {};
    DP.listeners = { change: [], idle: [] };

    DP.on = function (type, fn) {
        DP.listeners[type].push(fn);
    };

    DP.emit = function (type, arg) {
        DP.each(DP.listeners[type], function (fn) {
            DP.safe('listener ' + type, function () {
                fn(arg);
            });
        });
    };

    DP.task = function (name, timeoutMs, run) {
        var started = DP.now();
        var finished = false;

        DP.pending++;

        function done(status) {
            if (finished) {
                return;
            }
            finished = true;
            DP.taskLog[name] = { ms: Math.round(DP.now() - started), status: status || 'ok' };
            DP.pending--;
            DP.emit('change', name);
            if (DP.pending === 0) {
                DP.emit('idle');
            }
        }

        setTimeout(function () {
            done('timeout');
        }, timeoutMs);

        try {
            run(done);
        } catch (e) {
            DP.err(name, e);
            done('error');
        }
    };

    /* promise-returning API -> callback, without needing Promise in the page itself */
    DP.then = function (where, promise, ok, done) {
        if (!promise || typeof promise.then !== 'function') {
            done('unsupported');
            return;
        }
        promise.then(function (v) {
            DP.safe(where, function () {
                ok(v);
            });
            done('ok');
        }, function (e) {
            DP.err(where, e);
            done('rejected');
        });
    };

    DP.round = function (n, digits) {
        var p = Math.pow(10, digits || 0);
        return Math.round(n * p) / p;
    };
})(window);
