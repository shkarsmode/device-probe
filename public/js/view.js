/* device-probe: renders a report (live or stored) as plain monospace tables. ES5, ASCII only. */
(function (w) {
    'use strict';

    var DP = w.DP;
    var esc = DP.esc;
    var V = DP.view = {};

    /* remote buttons we can name; everything else is shown raw */
    V.TV_KEYS = {
        8: 'Backspace (Back on some TVs)', 13: 'Enter / OK', 19: 'Pause', 27: 'Escape', 33: 'PageUp / Channel+',
        34: 'PageDown / Channel-', 37: 'Left', 38: 'Up', 39: 'Right', 40: 'Down', 166: 'BrowserBack',
        172: 'BrowserHome', 173: 'Mute', 174: 'Volume-', 175: 'Volume+', 176: 'MediaTrackNext',
        177: 'MediaTrackPrevious', 178: 'MediaStop', 179: 'MediaPlayPause', 403: 'Red', 404: 'Green',
        405: 'Yellow', 406: 'Blue', 412: 'Rewind', 413: 'Stop', 415: 'Play', 417: 'FastForward',
        427: 'Channel+', 428: 'Channel-', 447: 'Volume+', 448: 'Volume-', 449: 'Mute', 457: 'Info',
        461: 'Back (webOS / HbbTV VK_BACK)', 10009: 'Back (Tizen Return)', 10182: 'Exit (Tizen)',
        10252: 'PlayPause (Tizen)', 10232: 'PreviousTrack (Tizen)', 10233: 'NextTrack (Tizen)'
    };

    V.badge = function (v, yes, no) {
        if (v === true) {
            return '<span class="ok">' + (yes || 'yes') + '</span>';
        }
        if (v === false) {
            return '<span class="no">' + (no || 'no') + '</span>';
        }
        if (v === null || v === undefined || v === '') {
            return '<span class="na">n/a</span>';
        }
        if (v === 'probably') {
            return '<span class="ok">probably</span>';
        }
        if (v === 'maybe') {
            return '<span class="warn">maybe</span>';
        }
        return esc(v);
    };

    function val(v) {
        if (v === true || v === false || v === null || v === undefined || v === '' || v === 'probably' || v === 'maybe') {
            return V.badge(v);
        }
        if (typeof v === 'object') {
            if (v.length !== undefined) {
                return v.length ? esc(v.join(', ')) : '<span class="na">(none)</span>';
            }
            return esc(JSON.stringify(v));
        }
        return esc(v);
    }

    V.kv = function (o, order) {
        if (!o) {
            return '<p class="na">no data</p>';
        }
        var keys = order || DP.keys(o);
        var h = '<table>';
        DP.each(keys, function (k) {
            if (o[k] === undefined) {
                return;
            }
            h += '<tr><td class="k">' + esc(k) + '</td><td>' + val(o[k]) + '</td></tr>';
        });
        return h + '</table>';
    };

    V.grid = function (head, rows) {
        var h = '<table><tr>';
        DP.each(head, function (c) {
            h += '<th>' + esc(c) + '</th>';
        });
        h += '</tr>';
        DP.each(rows, function (r) {
            h += '<tr>';
            DP.each(r, function (c, i) {
                h += '<td' + (i === 0 ? ' class="k"' : '') + '>' + (i === 0 ? esc(c) : c) + '</td>';
            });
            h += '</tr>';
        });
        return h + '</table>';
    };

    /* ---------- verdicts used by the summary and the reports table ---------- */

    function support(R, name) {
        var m = R.video && R.video.mse ? R.video.mse[name] : null;
        if (m === true) {
            return true;
        }
        var c = R.video && R.video.canPlay ? R.video.canPlay[name] : null;
        if (m === false && c === 'no') {
            return false;
        }
        if (c === 'probably' || c === 'maybe') {
            return c;
        }
        return m === false ? false : null;
    }

    function cap(R, name) {
        var c = R.video && R.video.capabilities ? R.video.capabilities[name] : null;
        if (!c) {
            return null;
        }
        if (!c.supported) {
            return 'no';
        }
        if (c.smooth && c.powerEfficient) {
            return 'hw';
        }
        return c.smooth ? 'smooth' : 'slow';
    }

    function capBadge(v) {
        if (v === null) {
            return '<span class="na">n/a</span>';
        }
        var cls = v === 'hw' ? 'ok' : v === 'smooth' ? 'ok' : v === 'slow' ? 'warn' : 'no';
        return '<span class="' + cls + '">' + v + '</span>';
    }

    V.drmLevel = function (R) {
        var D = R.drm || {};
        var out = {};
        var wv = D.Widevine;
        if (wv && wv.supported) {
            out.widevine = wv.robustness.join(' ').indexOf('HW_SECURE_ALL') >= 0 ? 'L1' : wv.robustness.join(' ').indexOf('HW_SECURE') >= 0 ? 'L2' : 'L3';
        } else {
            out.widevine = wv ? false : null;
        }
        var pr = D.PlayReady;
        var prl = D['PlayReady (legacy)'];
        if (pr && pr.supported) {
            out.playready = pr.robustness.join(' ').indexOf('3000') >= 0 ? 'SL3000' : pr.robustness.join(' ').indexOf('2000') >= 0 ? 'SL2000' : 'yes';
        } else if (prl && prl.supported) {
            out.playready = 'yes';
        } else {
            out.playready = pr ? false : null;
        }
        out.fairplay = D.FairPlay ? !!(D.FairPlay.supported || (D['FairPlay 1.0'] && D['FairPlay 1.0'].supported)) : null;
        out.clearkey = D.ClearKey ? D.ClearKey.supported : null;
        return out;
    };

    V.hdr = function (R) {
        var m = R.display && R.display.media ? R.display.media : {};
        if (m['(dynamic-range: high)'] === true || m['(video-dynamic-range: high)'] === true) {
            return true;
        }
        if (m['(dynamic-range: high)'] === false) {
            return false;
        }
        return null;
    };

    /* one flat row per report; the reports table and the server index use the same shape */
    V.digest = function (R) {
        var d = R.detected || {};
        var s = R.display && R.display.screen ? R.display.screen : {};
        var drm = V.drmLevel(R);
        var rtc = R.webrtc && R.webrtc.videoReceive ? R.webrtc.videoReceive.join(' ') : '';
        return {
            cls: d.cls || null,
            device: d.name || null,
            vendor: d.vendor || null,
            os: (d.os || '') + (d.osVersion ? ' ' + d.osVersion : ''),
            year: d.year || null,
            model: d.model || null,
            browser: (d.browser || '') + (d.browserVersion ? ' ' + d.browserVersion : ''),
            engine: (d.engine || '') + (d.engineVersion ? ' ' + d.engineVersion.split('.')[0] : ''),
            screen: s.width ? s.width + 'x' + s.height + '@' + DP.round(R.display.devicePixelRatio || 1, 2) : null,
            hdr: V.hdr(R),
            h264: support(R, 'H.264 High 4.0'),
            hevc: support(R, 'HEVC Main'),
            vp9: support(R, 'VP9 profile 0'),
            av1: support(R, 'AV1 Main 8-bit'),
            rtcAv1: rtc ? rtc.indexOf('AV1') >= 0 : null,
            rtcH265: rtc ? rtc.indexOf('H265') >= 0 : null,
            widevine: drm.widevine,
            playready: drm.playready,
            gamepad: R.features ? R.features['Gamepad API'] : null,
            keys: R.input && R.input.keysSeen ? R.input.keysSeen.length : 0,
            bench: R.bench ? R.bench.length : 0
        };
    };

    /* ---------- summary block ---------- */

    function line(label, html) {
        var pad = '            '.slice(label.length);
        return '<span class="k">' + label + '</span>' + pad + html + '\n';
    }

    V.summary = function (R, live) {
        var d = R.detected || {};
        var s = R.display && R.display.screen ? R.display.screen : {};
        var h = '';
        var conf = d.confidence && d.confidence !== 'high' ? ' <span class="warn">(' + d.confidence + ' confidence)</span>' : '';
        h += line('DEVICE', '<span class="hl">' + esc(d.name || 'unknown') + '</span>  <span class="acc">[' + esc(d.cls || '?') + ']</span>' + conf);
        h += line('OS', esc((d.os || 'unknown') + (d.osVersion ? ' ' + d.osVersion : '')) + (d.year ? '  <span class="k">model year</span> ~' + esc(d.year) : '') + (d.arch ? '  <span class="k">arch</span> ' + esc(d.arch) : ''));
        h += line('MODEL', d.model ? '<span class="hl">' + esc(d.model) + '</span>  <span class="k">via ' + esc(d.modelSource) + '</span>' : '<span class="na">not exposed</span>');
        h += line('BROWSER', esc((d.browser || 'unknown') + (d.browserVersion ? ' ' + d.browserVersion : '')) + '  <span class="k">|</span>  ' + esc((d.engine || '?') + ' ' + (d.engineVersion || '')));
        h += line('SCREEN', s.width ? esc(s.width + 'x' + s.height + ' css @' + DP.round(R.display.devicePixelRatio, 2) + 'x -> ' + R.display.physicalPx + ' px') + '  <span class="k">|</span>  viewport ' + esc(R.display.viewport.inner) + '  <span class="k">|</span>  HDR ' + V.badge(V.hdr(R)) + '  <span class="k">|</span>  ' + esc(s.colorDepth) + '-bit' : '<span class="na">n/a</span>');
        h += line('DECODE', 'H.264 ' + V.badge(support(R, 'H.264 High 4.0')) + '  HEVC ' + V.badge(support(R, 'HEVC Main')) + '  VP9 ' + V.badge(support(R, 'VP9 profile 0')) + '  AV1 ' + V.badge(support(R, 'AV1 Main 8-bit')) + '  <span class="k">(MSE / canPlayType)</span>');
        if (R.video && R.video.capabilities) {
            h += line('4K60', 'H.264 ' + capBadge(cap(R, 'H.264 4K60')) + '  HEVC ' + capBadge(cap(R, 'HEVC 4K60 10-bit')) + '  VP9 ' + capBadge(cap(R, 'VP9 4K60')) + '  AV1 ' + capBadge(cap(R, 'AV1 4K60 10-bit')) + '  <span class="k">(hw = smooth + power-efficient)</span>');
            h += line('RTC DECODE', 'H.264 ' + capBadge(cap(R, 'WebRTC H.264 1080p60')) + '  H.265 ' + capBadge(cap(R, 'WebRTC H.265 1080p60')) + '  VP9 ' + capBadge(cap(R, 'WebRTC VP9 1080p60')) + '  AV1 ' + capBadge(cap(R, 'WebRTC AV1 1080p60')) + '  <span class="k">(1080p60)</span>');
        }
        var rtc = R.webrtc || {};
        h += line('WEBRTC', V.badge(rtc.RTCPeerConnection) + (rtc.videoReceive ? '  <span class="k">receive</span> ' + esc(uniqueCodecs(rtc.videoReceive).join(' ')) : ''));
        var drm = V.drmLevel(R);
        h += line('DRM', 'Widevine ' + V.badge(drm.widevine) + '  PlayReady ' + V.badge(drm.playready) + '  FairPlay ' + V.badge(drm.fairplay) + '  ClearKey ' + V.badge(drm.clearkey));
        var gp = R.input || {};
        h += line('INPUT', 'gamepad API ' + V.badge(R.features ? R.features['Gamepad API'] : null) + (live ? '  <span class="k">connected</span> <span id="gpCount">0</span>' : '  <span class="k">pads seen</span> ' + (gp.gamepadsSeen ? gp.gamepadsSeen.length : 0)) + '  <span class="k">|</span>  touch ' + esc(gp.maxTouchPoints || 0) + '  <span class="k">|</span>  pointer ' + esc(gp.pointer || 'n/a') + '  <span class="k">|</span>  keys seen <span id="keysCount">' + (gp.keysSeen ? gp.keysSeen.length : 0) + '</span>');
        var N = R.network || {};
        var rtt = N.rtt || {};
        var net = [];
        if (rtt['fra1 function'] && rtt['fra1 function'].median !== undefined) {
            net.push('RTT fra1 ' + rtt['fra1 function'].median + ' ms');
        }
        if (rtt['CDN edge'] && rtt['CDN edge'].median !== undefined) {
            net.push('edge ' + rtt['CDN edge'].median + ' ms');
        }
        if (N.connection) {
            net.push((N.connection.type || N.connection.effectiveType || '') + (N.connection.downlinkMbps ? ' ' + N.connection.downlinkMbps + ' Mb/s' : ''));
        }
        if (N.navigation && N.navigation.protocol) {
            net.push(N.navigation.protocol);
        }
        h += line('NETWORK', net.length ? esc(net.join('  |  ')) : '<span class="na">measuring...</span>');
        var P = R.perf || {};
        h += line('CPU / RAM', esc((P.hardwareConcurrency || '?') + ' threads  |  ' + (P.deviceMemoryGb ? P.deviceMemoryGb + ' GB' : 'RAM n/a') + '  |  bench ' + (P.benchmarkOpsPerMs ? P.benchmarkOpsPerMs + ' ops/ms' : '...')));
        var G = R.graphics || {};
        h += line('GPU', esc(G.unmaskedRenderer || G.renderer || 'n/a') + '  <span class="k">|</span>  WebGL2 ' + V.badge(G.webgl2) + '  WebGPU ' + V.badge(G.webgpu));
        var S = R.server;
        if (S) {
            var hd = S.headers || {};
            var bits = [];
            if (S.geo && S.geo.country) {
                bits.push('country ' + S.geo.country);
            }
            if (hd['sec-ch-ua-model'] && hd['sec-ch-ua-model'] !== '""') {
                bits.push('Sec-CH-UA-Model ' + hd['sec-ch-ua-model']);
            }
            if (hd['x-requested-with']) {
                bits.push('X-Requested-With ' + hd['x-requested-with']);
            }
            if (hd['sec-ch-ua-platform-version']) {
                bits.push('platform ' + hd['sec-ch-ua-platform'] + ' ' + hd['sec-ch-ua-platform-version']);
            }
            h += line('SERVER', bits.length ? esc(bits.join('  |  ')) : esc(S.headers ? DP.keys(S.headers).length + ' headers' : 'ok'));
        } else {
            h += line('SERVER', '<span class="na">waiting for /api/echo...</span>');
        }
        if (d.notes && d.notes.length) {
            h += line('NOTES', '<span class="warn">' + esc(d.notes.join('; ')) + '</span>');
        }
        return h;
    };

    function uniqueCodecs(list) {
        var seen = {};
        var out = [];
        DP.each(list, function (c) {
            var n = String(c).split(' ')[0].replace('video/', '').replace('audio/', '');
            if (!seen[n]) {
                seen[n] = true;
                out.push(n);
            }
        });
        return out;
    }

    V.client = function (c) {
        var h = '<span class="k">BOOSTEROID</span>  <span class="hl">' + esc(c.name) + '</span>';
        DP.each(c.links, function (l) {
            h += l.url ? '  <a href="' + esc(l.url) + '">' + esc(l.label) + '</a>' : '  <span class="warn">' + esc(l.label) + '</span>';
        });
        if (c.note) {
            h += '  <span class="k">(' + esc(c.note) + ')</span>';
        }
        return h;
    };

    /* ---------- detailed sections ---------- */

    V.sections = function (R) {
        var out = [];
        var d = R.detected || {};

        function add(id, title, html) {
            out.push({ id: id, title: title, html: html });
        }

        add('detection', 'detection', V.kv(d, ['family', 'cls', 'vendor', 'name', 'os', 'osVersion', 'year', 'model', 'modelSource', 'arch', 'browser', 'browserVersion', 'engine', 'engineVersion', 'confidence', 'notes']) + (d.hbbtv ? '<h3>HbbTV user agent</h3>' + V.kv(d.hbbtv) : ''));
        add('identity', 'identity / navigator', V.kv(R.identity));
        add('ua-ch', 'user-agent client hints', R.uaData ? V.kv(flattenUaData(R.uaData)) : '<p class="na">navigator.userAgentData is not available in this browser</p>');

        var S = R.server;
        var sh = '';
        if (S) {
            sh += V.kv({ 'function region': S.region, 'server time': S.now ? new Date(S.now).toISOString() : null, 'round trip ms': S.roundTripMs, 'clock skew ms': S.now && R.serverClientDelta !== undefined ? R.serverClientDelta : undefined });
            if (S.ip || S.geo) {
                sh += '<h3>network origin <span class="k">(shown to you only, never stored)</span></h3>' + V.kv({ ip: S.ip, geo: S.geo ? [S.geo.city, S.geo.region, S.geo.country].join(' / ') : null, timezone: S.geo ? S.geo.timezone : null, asn: S.geo ? S.geo.asn : null });
            } else if (S.geo && S.geo.country) {
                sh += V.kv({ country: S.geo.country });
            }
            sh += '<h3>request headers as the server saw them</h3>' + V.kv(S.headers);
        } else {
            sh = '<p class="na">no answer from /api/echo</p>';
        }
        add('server', 'server view', sh);

        var D = R.display || {};
        add('display', 'display', V.kv({ screen: D.screen, devicePixelRatio: D.devicePixelRatio, physicalPx: D.physicalPx, viewport: D.viewport, orientation: D.orientation, multiScreen: D.multiScreen }) + '<h3>media queries</h3>' + V.kv(D.media));

        var G = R.graphics || {};
        var gc = {};
        DP.each(DP.keys(G), function (k) {
            if (k !== 'extensions' && k !== 'webgpuAdapter') {
                gc[k] = G[k];
            }
        });
        add('graphics', 'graphics', V.kv(gc) + (G.webgpuAdapter ? '<h3>WebGPU adapter</h3>' + V.kv(G.webgpuAdapter) : '') + (G.extensions ? '<h3>WebGL extensions (' + G.extensions.length + ')</h3><p class="small">' + esc(G.extensions.join(' ')) + '</p>' : ''));

        var vrows = [];
        var Vd = R.video || {};
        DP.each(DP.keys(Vd.canPlay || {}), function (k) {
            vrows.push([k, V.badge(Vd.canPlay[k] === 'no' ? false : Vd.canPlay[k]), V.badge(Vd.mse ? Vd.mse[k] : null)]);
        });
        var vh = V.grid(['codec', 'canPlayType', 'MSE isTypeSupported'], vrows);
        if (Vd.capabilities) {
            var crow = [];
            DP.each(DP.keys(Vd.capabilities), function (k) {
                var c = Vd.capabilities[k];
                crow.push([k, V.badge(c.supported), V.badge(c.smooth), V.badge(c.powerEfficient)]);
            });
            vh += '<h3>MediaCapabilities.decodingInfo</h3>' + V.grid(['config', 'supported', 'smooth', 'power efficient'], crow);
        }
        if (Vd.webCodecsDecode) {
            vh += '<h3>WebCodecs VideoDecoder.isConfigSupported</h3>' + V.kv(Vd.webCodecsDecode);
        }
        vh += '<h3>other</h3>' + V.kv({ 'MSE API': Vd.mseApi, ManagedMediaSource: Vd.managedMediaSource, 'Picture-in-Picture': Vd.pictureInPicture, requestVideoFrameCallback: Vd.requestVideoFrameCallback, WebCodecs: Vd.webCodecs, 'Remote Playback': Vd.remotePlayback });
        add('video', 'video', vh);

        var A = R.audio || {};
        var arows = [];
        DP.each(DP.keys(A.canPlay || {}), function (k) {
            arows.push([k, V.badge(A.canPlay[k] === 'no' ? false : A.canPlay[k]), V.badge(A.mse ? A.mse[k] : null)]);
        });
        add('audio', 'audio', V.grid(['codec', 'canPlayType', 'MSE isTypeSupported'], arows) + '<h3>AudioContext</h3>' + V.kv(A.context) + (A.voices ? '<h3>speech voices</h3>' + V.kv(A.voices) : ''));

        var drows = [];
        DP.each(DP.keys(R.drm || {}), function (k) {
            var x = R.drm[k];
            drows.push([k, V.badge(x.supported), esc(x.keySystem), esc(x.robustness.join(', ') || '-')]);
        });
        add('drm', 'drm / eme', drows.length ? V.grid(['key system', 'supported', 'id', 'robustness accepted'], drows) : '<p class="na">requestMediaKeySystemAccess is not available</p>');

        add('webrtc', 'webrtc', V.kv(R.webrtc));

        var IN = R.input || {};
        var keyRows = [];
        DP.each(IN.keysSeen || [], function (k) {
            keyRows.push([String(k.keyCode), esc(k.key), esc(k.code), esc(V.TV_KEYS[k.keyCode] || ''), esc(k.count || 1)]);
        });
        var padRows = [];
        DP.each(IN.gamepadsSeen || [], function (p) {
            padRows.push([p.id, esc(p.mapping || '(none)'), esc(p.buttons), esc(p.axes)]);
        });
        add('input', 'input', V.kv({ maxTouchPoints: IN.maxTouchPoints, touchEvents: IN.touchEvents, pointerEvents: IN.pointerEvents, pointer: IN.pointer, hover: IN.hover, gamepadApi: IN.gamepadApi }) +
            '<h3>keys seen (' + keyRows.length + ')</h3>' + (keyRows.length ? V.grid(['keyCode', 'key', 'code', 'known as', 'presses'], keyRows) : '<p class="na">none yet</p>') +
            '<h3>gamepads seen (' + padRows.length + ')</h3>' + (padRows.length ? V.grid(['id', 'mapping', 'buttons', 'axes'], padRows) : '<p class="na">none yet</p>'));

        var N = R.network || {};
        add('network', 'network', V.kv({ onLine: N.onLine, connection: N.connection }) + (N.rtt ? '<h3>round trip (ms)</h3>' + V.kv(N.rtt) : '') + (N.navigation ? '<h3>this page load</h3>' + V.kv(N.navigation) : ''));
        add('storage', 'storage', V.kv(R.storage));
        add('perf', 'cpu / memory', V.kv(R.perf));
        var feats = {};
        DP.each(DP.keys(R.features || {}), function (k) {
            if (k !== 'permissions') {
                feats[k] = R.features[k];
            }
        });
        add('features', 'web platform features', V.kv(feats) + (R.features && R.features.permissions ? '<h3>permission states</h3>' + V.kv(R.features.permissions) : ''));
        add('locale', 'locale / time', V.kv(R.locale));

        var P = R.platformApis || {};
        var ph = '<h3>vendor-looking globals</h3>' + V.kv(P.globals);
        if (P.nonStandardGlobals) {
            ph += '<h3>globals not present in a clean frame (' + P.nonStandardGlobals.length + ')</h3><p class="small">' + esc(P.nonStandardGlobals.join(' ') || '(none)') + '</p>';
        }
        DP.each(['tizen', 'webapis', 'PalmSystem', 'webOSSystem', 'webOS', 'hisense', 'oipf'], function (k) {
            if (P[k]) {
                ph += '<h3>' + esc(k) + '</h3>' + V.kv(P[k]);
            }
        });
        add('platform', 'platform apis', ph);

        var brows = [];
        DP.each(R.bench || [], function (b) {
            brows.push([b.id, esc(b.result), esc(b.ms !== undefined ? b.ms + ' ms' : ''), esc(b.detail || ''), esc(b.ts || '')]);
        });
        add('bench-results', 'store deep link results', brows.length ? V.grid(['candidate', 'result', 'after', 'detail', 'when'], brows) : '<p class="na">no deep link tried yet</p>');

        var trows = [];
        DP.each(DP.keys(R.tasks || {}), function (k) {
            trows.push([k, esc(R.tasks[k].status), esc(R.tasks[k].ms + ' ms')]);
        });
        add('tasks', 'probe log', V.grid(['async probe', 'status', 'time'], trows) + '<h3>errors (' + (R.errors ? R.errors.length : 0) + ')</h3>' + (R.errors && R.errors.length ? '<p class="small">' + esc(R.errors.join('\n')).replace(/\n/g, '<br>') + '</p>' : '<p class="na">none</p>'));
        return out;
    };

    function flattenUaData(u) {
        var o = {};
        DP.each(DP.keys(u), function (k) {
            var v = u[k];
            if (v && typeof v === 'object' && v.length !== undefined) {
                var parts = [];
                DP.each(v, function (b) {
                    parts.push(typeof b === 'object' ? b.brand + ' ' + b.version : b);
                });
                o[k] = parts.join(', ') || '(empty)';
            } else {
                o[k] = v === '' ? '(empty)' : v;
            }
        });
        return o;
    }

    V.renderSections = function (el, R) {
        var list = V.sections(R);
        var nav = '';
        var html = '';
        DP.each(list, function (s, i) {
            var n = (i + 1 < 10 ? '0' : '') + (i + 1);
            nav += '<a href="#s-' + s.id + '">' + n + ' ' + esc(s.title) + '</a> ';
            html += '<section id="s-' + s.id + '"><h2><span class="n">' + n + '</span> ' + esc(s.title) + '</h2>' + s.html + '</section>';
        });
        el.innerHTML = '<nav class="nav">' + nav + '</nav>' + html;
    };
})(window);
