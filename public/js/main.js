/* device-probe: live page. Detect, render, keep listening to keys and pads, save to the shared table. ES5. */
(function (w) {
    'use strict';

    var DP = w.DP;
    var R = DP.report;
    var V = DP.view;
    var doc = document;
    var ua = R.identity.userAgent || '';
    var session = new Date().getTime().toString(36) + Math.random().toString(36).slice(2, 8);
    var idle = false;
    var savedOnce = false;
    var renderTimer = null;
    var saveTimer = null;
    var dirty = false;
    var retried = false;
    var noSave = null;
    var samsungAppId = DP.param('samsungAppId');

    function $(id) {
        return doc.getElementById(id);
    }

    if (DP.param('nosave') !== null) {
        noSave = '?nosave in the URL';
    } else if (DP.param('forcesave') === null && (R.identity.webdriver || /HeadlessChrome|\bbot\b|crawl|spider|Lighthouse|PTST|Inspection/i.test(ua))) {
        noSave = 'automated browser';
    }
    if (samsungAppId !== null) {
        DP.store.set('samsungAppId', samsungAppId || null);
    } else {
        samsungAppId = DP.store.get('samsungAppId');
    }

    function detect() {
        var s = R.display.screen || {};
        R.detected = DP.detect({
            ua: ua,
            platform: R.identity.platform,
            maxTouchPoints: R.input.maxTouchPoints,
            screenW: s.width,
            screenH: s.height,
            uaData: R.uaData,
            webglRenderer: R.graphics.unmaskedRenderer || R.graphics.renderer,
            apis: R.platformApis,
            requestedWith: R.server && R.server.headers ? R.server.headers['x-requested-with'] : null
        });
        var h = R.server && R.server.headers;
        if (h && !R.detected.model) {
            var model = (h['sec-ch-ua-model'] || '').replace(/"/g, '');
            if (model) {
                R.detected.model = model;
                R.detected.modelSource = 'Sec-CH-UA-Model header';
            }
        }
        R.client = DP.clientFor(R.detected);
        if (R.detected.cls === 'tv' && doc.documentElement.className.indexOf('tv') < 0) {
            doc.documentElement.className += ' tv';
        }
    }

    /* re-render without stealing the remote's focus */
    function keepFocus(fn) {
        var a = doc.activeElement;
        var href = a && a.getAttribute ? a.getAttribute('href') : null;
        var id = a && a.id;
        fn();
        if (id && $(id)) {
            $(id).focus();
        } else if (href) {
            var links = doc.getElementsByTagName('a');
            for (var i = 0; i < links.length; i++) {
                if (links[i].getAttribute('href') === href) {
                    links[i].focus();
                    break;
                }
            }
        }
    }

    function render() {
        detect();
        keepFocus(function () {
            $('summary').innerHTML = V.summary(R, true);
            $('client').innerHTML = V.client(R.client);
            V.renderSections($('sections'), R);
        });
    }

    function scheduleRender(ms) {
        if (renderTimer) {
            return;
        }
        renderTimer = setTimeout(function () {
            renderTimer = null;
            DP.safe('render', render);
        }, ms || 400);
    }

    /* ---------- saving ---------- */

    function setSave(html) {
        $('saveStatus').innerHTML = html;
    }

    function save(reason) {
        if (noSave) {
            setSave('<span class="k">REPORT</span>      <span class="warn">not saved: ' + DP.esc(noSave) + '</span>');
            return;
        }
        R.savedReason = reason;
        R.sessionTs = new Date().toISOString();
        /* everything changed so far goes into this payload */
        dirty = false;
        DP.xhr('POST', '/api/report', { session: session, report: R, digest: V.digest(R) }, function (err, res) {
            if (err || !res || !res.id) {
                setSave('<span class="k">REPORT</span>      <span class="no">save failed: ' + DP.esc(err ? err.message : 'no id') + '</span>');
                /* one more try for server-side hiccups; a 4xx means the request itself is wrong */
                if (!retried && !(err && /HTTP 4/.test(err.message))) {
                    retried = true;
                    dirty = true;
                    setTimeout(function () {
                        save(reason);
                    }, 4000);
                }
                return;
            }
            retried = false;
            savedOnce = true;
            R.id = res.id;
            if (dirty) {
                scheduleSave();
            }
            setSave('<span class="k">REPORT</span>      <span class="ok">saved</span> <a href="/r/' + DP.esc(res.id) + '">#' + DP.esc(res.id) + '</a>' +
                '  <span class="k">visits</span> ' + DP.esc(res.visits) + '  <span class="k">first seen</span> ' + DP.esc((res.firstSeen || '').slice(0, 16).replace('T', ' ')) +
                '  <span class="k">|</span>  <a href="/reports">all devices</a>');
            if (!$('qrImg')) {
                $('saveQr').innerHTML = '<img id="qrImg" class="qr" width="148" height="148" alt="QR code of this report" src="/api/qr?id=' + encodeURIComponent(res.id) + '">' +
                    '<span class="small">scan to open this report on a phone</span>';
            }
        }, 15000);
    }

    function scheduleSave() {
        if (noSave) {
            return;
        }
        dirty = true;
        if (!savedOnce) {
            /* the first save is still on its way; its callback picks this up */
            return;
        }
        if (saveTimer) {
            clearTimeout(saveTimer);
        }
        saveTimer = setTimeout(function () {
            saveTimer = null;
            save('update');
        }, 2500);
    }

    function copyJson() {
        var text = JSON.stringify(R, null, 2);
        function ok() {
            $('copyBtn').innerHTML = 'copied';
            setTimeout(function () {
                $('copyBtn').innerHTML = 'copy JSON';
            }, 1500);
        }
        function fallback() {
            var ta = doc.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            doc.body.appendChild(ta);
            ta.select();
            try {
                doc.execCommand('copy');
                ok();
            } catch (e) {
                DP.err('copy', e);
            }
            doc.body.removeChild(ta);
        }
        if (w.navigator.clipboard && w.navigator.clipboard.writeText) {
            w.navigator.clipboard.writeText(text).then(ok, fallback);
        } else {
            fallback();
        }
    }

    function downloadJson() {
        DP.safe('download', function () {
            var blob = new Blob([JSON.stringify(R, null, 2)], { type: 'application/json' });
            var a = doc.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'device-probe-' + (R.id || 'report') + '.json';
            doc.body.appendChild(a);
            a.click();
            doc.body.removeChild(a);
        });
    }

    function showRaw() {
        $('raw').innerHTML = '<h2><span class="n">--</span> raw report</h2><pre class="raw">' + DP.esc(JSON.stringify(R, null, 2)) + '</pre>';
    }

    /* ---------- live input: remote keys, gamepads, Back ---------- */

    function rememberKey(e, extra) {
        var code = e.keyCode || e.which || 0;
        var key = e.key === undefined ? null : e.key;
        var rec = null;
        var list = R.input.keysSeen;
        for (var i = 0; i < list.length; i++) {
            if (list[i].keyCode === code && list[i].key === key) {
                rec = list[i];
                break;
            }
        }
        var known = V.TV_KEYS[code] || '';
        $('lastKey').innerHTML = '<span class="k">key</span> ' + DP.esc(key === null ? 'n/a' : key) + '  <span class="k">code</span> ' + DP.esc(e.code || 'n/a') +
            '  <span class="k">keyCode</span> <span class="hl">' + code + '</span>' + (known ? '  <span class="acc">' + DP.esc(known) + '</span>' : '') +
            (e.repeat ? '  <span class="warn">repeat</span>' : '') + (extra ? '  <span class="warn">' + DP.esc(extra) + '</span>' : '');
        if (rec) {
            rec.count++;
            return;
        }
        list.push({ keyCode: code, key: key, code: e.code || null, location: e.location === undefined ? null : e.location, count: 1 });
        $('keysCount').innerHTML = String(list.length);
        scheduleRender(800);
        scheduleSave();
    }

    function initKeys() {
        doc.addEventListener('keydown', function (e) {
            DP.safe('keydown', function () {
                rememberKey(e);
            });
        }, true);
        var trapped = false;
        $('backBtn').onclick = function () {
            if (!w.history || !w.history.pushState) {
                $('backBtn').innerHTML = 'history API missing';
                return;
            }
            trapped = !trapped;
            if (trapped) {
                w.history.pushState({ dp: 1 }, '', w.location.href);
            }
            $('backBtn').innerHTML = trapped ? 'release Back key' : 'trap Back key';
        };
        w.addEventListener('popstate', function () {
            if (!trapped) {
                return;
            }
            DP.safe('popstate', function () {
                rememberKey({ keyCode: 0, key: 'history-back', code: 'popstate' }, 'Back pressed: browser history event');
                w.history.pushState({ dp: 1 }, '', w.location.href);
            });
        });
    }

    function initGamepads() {
        var get = w.navigator.getGamepads || w.navigator.webkitGetGamepads;
        if (!get) {
            $('pads').innerHTML = '<span class="na">Gamepad API is not available</span>';
            return;
        }
        var raf = w.requestAnimationFrame || function (f) {
            return setTimeout(f, 100);
        };
        var last = '';
        function poll() {
            DP.safe('gamepads', function () {
                var pads = get.call(w.navigator) || [];
                var lines = [];
                var count = 0;
                for (var i = 0; i < pads.length; i++) {
                    var p = pads[i];
                    if (!p) {
                        continue;
                    }
                    count++;
                    var pressed = [];
                    DP.each(p.buttons, function (b, bi) {
                        if (b && (b.pressed || b.value > 0.5)) {
                            pressed.push(bi);
                        }
                    });
                    var axes = [];
                    DP.each(p.axes, function (a) {
                        axes.push(DP.round(a, 2));
                    });
                    lines.push('#' + p.index + ' ' + p.id + '  [' + (p.mapping || 'no mapping') + ']  buttons ' + (pressed.join(',') || '-') + '  axes ' + axes.join(' '));
                    var seen = false;
                    DP.each(R.input.gamepadsSeen, function (g) {
                        if (g.id === p.id) {
                            seen = true;
                        }
                    });
                    if (!seen) {
                        R.input.gamepadsSeen.push({ id: p.id, mapping: p.mapping || null, buttons: p.buttons.length, axes: p.axes.length, vibration: !!(p.vibrationActuator) });
                        scheduleRender(800);
                        scheduleSave();
                    }
                }
                var text = lines.length ? lines.join('\n') : 'no gamepad: connect one and press a button';
                if (text !== last) {
                    last = text;
                    $('pads').innerHTML = DP.esc(text);
                    if ($('gpCount')) {
                        $('gpCount').innerHTML = String(count);
                    }
                }
            });
            raf(poll);
        }
        poll();
    }

    /* ---------- store deep link bench ---------- */

    function benchRecord(rec) {
        R.bench.push(rec);
        DP.store.set('pendingBench', null);
        scheduleRender(300);
        if (savedOnce) {
            save('deeplink');
        } else {
            scheduleSave();
        }
    }

    function tryCandidate(c, btn) {
        var started = DP.now();
        var finished = false;
        var cleanup = [];

        function finish(result, detail) {
            if (finished) {
                return;
            }
            finished = true;
            DP.each(cleanup, function (f) {
                f();
            });
            btn.innerHTML = 'try';
            benchRecord({ id: c.id, url: c.url, result: result, ms: Math.round(DP.now() - started), detail: detail || '', ts: new Date().toISOString() });
        }

        btn.innerHTML = '...';
        if (!c.url) {
            finish('skipped', 'nothing to open');
            return;
        }
        if (c.url.indexOf('js:') === 0) {
            runJsCandidate(c.url, finish);
            return;
        }
        DP.store.set('pendingBench', JSON.stringify({ id: c.id, url: c.url, t: new Date().getTime() }));
        function onVis() {
            if (doc.hidden) {
                finish('page hidden', 'something took over the screen (store or app?)');
            }
        }
        function onBlur() {
            finish('page lost focus', 'something took over the screen (store or app?)');
        }
        doc.addEventListener('visibilitychange', onVis);
        w.addEventListener('blur', onBlur);
        cleanup.push(function () {
            doc.removeEventListener('visibilitychange', onVis);
            w.removeEventListener('blur', onBlur);
        });
        setTimeout(function () {
            finish('no reaction', 'the page stayed in front for 3 s');
        }, 3000);
        try {
            w.location.href = c.url;
        } catch (e) {
            finish('error', e.message);
        }
    }

    function runJsCandidate(kind, finish) {
        if (kind === 'js:tizen') {
            if (!w.tizen || !w.tizen.application) {
                finish('unavailable', 'the tizen API is not exposed to web pages here');
                return;
            }
            if (!samsungAppId) {
                finish('skipped', 'add ?samsungAppId=<id> to the URL');
                return;
            }
            try {
                var data = [new w.tizen.ApplicationControlData('Sub_Menu', ['detail']), new w.tizen.ApplicationControlData('widget_id', [samsungAppId])];
                var ctrl = new w.tizen.ApplicationControl('http://tizen.org/appcontrol/operation/default', null, null, null, data);
                w.tizen.application.launchAppControl(ctrl, 'org.volt.apps', function () {
                    finish('launched', 'org.volt.apps accepted the request');
                }, function (e) {
                    finish('failed', e && e.message);
                });
            } catch (e) {
                finish('error', e.message);
            }
            return;
        }
        if (kind === 'js:webos-target' || kind === 'js:webos-query') {
            if (!w.PalmServiceBridge) {
                finish('unavailable', 'PalmServiceBridge is not exposed to web pages here');
                return;
            }
            try {
                var bridge = new w.PalmServiceBridge();
                var params = kind === 'js:webos-target' ? { target: '/apps/details/1202498' } : { query: 'category/GAME_APPS/1202498' };
                bridge.onservicecallback = function (msg) {
                    finish('answered', String(msg).slice(0, 200));
                };
                bridge.call('luna://com.webos.applicationManager/launch', JSON.stringify({ id: 'com.webos.app.discovery', params: params }));
                setTimeout(function () {
                    finish('no answer', 'luna call returned nothing in 4 s');
                }, 4000);
            } catch (e) {
                finish('error', e.message);
            }
            return;
        }
        finish('unknown', kind);
    }

    function renderBench() {
        var list = DP.benchFor(R.detected, { samsungAppId: samsungAppId, all: DP.param('all') !== null });
        var el = $('bench');
        if (!list.length) {
            el.innerHTML = '<span class="k">DEEP LINKS</span>  <span class="na">nothing to try on this platform</span>  <a href="?all">show every candidate</a>';
            return;
        }
        var h = '<span class="k">DEEP LINKS</span>  <span class="small">try opening the store from this browser; the result is saved with the report</span>';
        DP.each(list, function (c, i) {
            h += '<div class="row"><button id="bench' + i + '">try</button> ' + DP.esc(c.label) + (c.note ? '  <span class="k">' + DP.esc(c.note) + '</span>' : '') + '</div>';
        });
        el.innerHTML = h;
        DP.each(list, function (c, i) {
            var b = $('bench' + i);
            b.onclick = function () {
                tryCandidate(c, b);
            };
        });
    }

    /* a deep link that navigated away last time is resolved on the way back */
    function resolvePendingBench() {
        var p = DP.store.get('pendingBench');
        if (!p) {
            return;
        }
        DP.safe('pendingBench', function () {
            var o = JSON.parse(p);
            R.bench.push({ id: o.id, url: o.url, result: 'page was left', detail: 'browser navigated away or was replaced; came back ' + Math.round((new Date().getTime() - o.t) / 1000) + ' s later', ts: new Date(o.t).toISOString() });
        });
        DP.store.set('pendingBench', null);
    }

    /* ---------- boot ---------- */

    function tick() {
        var d = new Date();
        $('clock').innerHTML = d.toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
    }

    $('ver').innerHTML = 'v' + DP.version;
    tick();
    setInterval(tick, 1000);
    $('copyBtn').onclick = copyJson;
    $('downloadBtn').onclick = downloadJson;
    $('rawBtn').onclick = showRaw;
    setSave('<span class="k">REPORT</span>      <span class="na">probing...</span>' + (noSave ? '' : '  <span class="small">stored without IP or cookies to build the device table; add ?nosave to skip</span>'));

    resolvePendingBench();
    DP.safe('first render', render);
    DP.safe('bench', renderBench);
    DP.safe('keys', initKeys);
    DP.safe('pads', initGamepads);

    DP.on('change', function (name) {
        if (name === 'ua-ch' || name === 'server') {
            var before = R.detected ? R.detected.family : null;
            detect();
            if (R.detected.family !== before) {
                DP.safe('bench', renderBench);
            }
        }
        scheduleRender(idle ? 800 : 400);
    });
    DP.on('idle', function () {
        if (idle) {
            return;
        }
        idle = true;
        DP.safe('nav timing', DP.readNavigationTiming);
        R.totalProbeMs = Math.round(DP.now() - DP.t0);
        DP.safe('render', render);
        save('idle');
        DP.measureRtt(function () {
            scheduleRender(200);
            scheduleSave();
        });
    });
    setTimeout(function () {
        if (!savedOnce && !idle) {
            save('deadline');
        }
    }, 10000);

    DP.runAsync();
})(window);
