/* device-probe: every signal we can read from a browser. ES5; every probe is isolated. */
(function (w) {
    'use strict';

    var DP = w.DP;
    var nav = w.navigator || {};
    var R = DP.report = {
        v: 1,
        probeVersion: DP.version,
        ts: new Date().toISOString(),
        url: w.location.href.split('#')[0],
        identity: {},
        uaData: null,
        server: null,
        display: {},
        graphics: {},
        video: {},
        audio: {},
        drm: {},
        webrtc: {},
        input: { keysSeen: [], gamepadsSeen: [] },
        network: {},
        storage: {},
        perf: {},
        features: {},
        locale: {},
        platformApis: {},
        bench: [],
        tasks: DP.taskLog,
        errors: DP.errors
    };

    function has(path) {
        var o = w;
        var parts = path.split('.');
        for (var i = 0; i < parts.length; i++) {
            if (o === null || o === undefined) {
                return false;
            }
            try {
                o = o[parts[i]];
            } catch (e) {
                return false;
            }
        }
        return o !== undefined && o !== null;
    }

    function mq(q) {
        if (!w.matchMedia) {
            return null;
        }
        var m = w.matchMedia(q);
        if (m.media === 'not all' || m.media === 'invalid') {
            return null;
        }
        return m.matches;
    }

    /* ---------------- sync probes ---------------- */

    DP.safe('identity', function () {
        var I = R.identity;
        I.userAgent = nav.userAgent;
        I.appVersion = nav.appVersion;
        I.platform = nav.platform;
        I.vendor = nav.vendor;
        I.product = nav.product;
        I.productSub = nav.productSub;
        I.oscpu = nav.oscpu || null;
        I.buildID = nav.buildID || null;
        I.language = nav.language;
        I.languages = nav.languages ? Array.prototype.slice.call(nav.languages) : null;
        I.cookieEnabled = nav.cookieEnabled;
        I.doNotTrack = nav.doNotTrack || w.doNotTrack || null;
        I.webdriver = nav.webdriver === true;
        I.pdfViewerEnabled = nav.pdfViewerEnabled === undefined ? null : nav.pdfViewerEnabled;
        I.standalone = nav.standalone === undefined ? null : nav.standalone;
        I.plugins = [];
        DP.each(nav.plugins, function (p) {
            I.plugins.push(p.name);
        });
        I.mimeTypes = nav.mimeTypes ? nav.mimeTypes.length : null;
        I.referrer = document.referrer || null;
        if (nav.userAgentData) {
            R.uaData = {
                brands: nav.userAgentData.brands,
                mobile: nav.userAgentData.mobile,
                platform: nav.userAgentData.platform
            };
        }
    });

    DP.safe('display', function () {
        var D = R.display;
        var s = w.screen || {};
        D.screen = { width: s.width, height: s.height, availWidth: s.availWidth, availHeight: s.availHeight, colorDepth: s.colorDepth, pixelDepth: s.pixelDepth };
        D.devicePixelRatio = w.devicePixelRatio || 1;
        D.physicalPx = s.width ? Math.round(s.width * D.devicePixelRatio) + 'x' + Math.round(s.height * D.devicePixelRatio) : null;
        D.viewport = { inner: w.innerWidth + 'x' + w.innerHeight, outer: w.outerWidth + 'x' + w.outerHeight, client: document.documentElement.clientWidth + 'x' + document.documentElement.clientHeight };
        if (w.visualViewport) {
            D.viewport.visual = Math.round(w.visualViewport.width) + 'x' + Math.round(w.visualViewport.height) + ' @' + w.visualViewport.scale;
        }
        if (s.orientation) {
            D.orientation = s.orientation.type + ' ' + s.orientation.angle;
        } else if (w.orientation !== undefined) {
            D.orientation = 'angle ' + w.orientation;
        }
        if (s.isExtended !== undefined) {
            D.multiScreen = s.isExtended;
        }
        var Q = D.media = {};
        DP.each([
            '(dynamic-range: high)', '(video-dynamic-range: high)', '(color-gamut: srgb)', '(color-gamut: p3)',
            '(color-gamut: rec2020)', '(prefers-color-scheme: dark)', '(prefers-reduced-motion: reduce)',
            '(prefers-contrast: more)', '(prefers-reduced-transparency: reduce)', '(prefers-reduced-data: reduce)',
            '(forced-colors: active)', '(inverted-colors: inverted)', '(monochrome)', '(pointer: none)',
            '(pointer: coarse)', '(pointer: fine)', '(any-pointer: coarse)', '(any-pointer: fine)', '(hover: hover)',
            '(any-hover: hover)', '(display-mode: standalone)', '(display-mode: fullscreen)', '(update: slow)',
            '(update: fast)', '(scan: interlace)', '(min-resolution: 2dppx)', '(orientation: landscape)',
            '(scripting: enabled)', '(overflow-block: scroll)', '(grid: 1)'
        ], function (q) {
            Q[q] = mq(q);
        });
    });

    DP.safe('graphics', function () {
        var G = R.graphics;
        var c = document.createElement('canvas');
        var gl = null;
        G.canvas2d = !!(c.getContext && c.getContext('2d'));
        try {
            gl = c.getContext('webgl') || c.getContext('experimental-webgl');
        } catch (e) {
            gl = null;
        }
        G.webgl = !!gl;
        if (gl) {
            var dbg = gl.getExtension('WEBGL_debug_renderer_info');
            G.webglVersion = gl.getParameter(gl.VERSION);
            G.glsl = gl.getParameter(gl.SHADING_LANGUAGE_VERSION);
            G.vendor = gl.getParameter(gl.VENDOR);
            G.renderer = gl.getParameter(gl.RENDERER);
            if (dbg) {
                G.unmaskedVendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
                G.unmaskedRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
            }
            G.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
            G.maxViewport = Array.prototype.slice.call(gl.getParameter(gl.MAX_VIEWPORT_DIMS) || []).join('x');
            G.maxRenderbuffer = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
            var ext = gl.getSupportedExtensions() || [];
            G.extensionCount = ext.length;
            G.extensions = ext;
            var lose = gl.getExtension('WEBGL_lose_context');
            if (lose) {
                lose.loseContext();
            }
        }
        var c2 = document.createElement('canvas');
        var gl2 = null;
        try {
            gl2 = c2.getContext('webgl2');
        } catch (e) {
            gl2 = null;
        }
        G.webgl2 = !!gl2;
        if (gl2) {
            G.webgl2Version = gl2.getParameter(gl2.VERSION);
            var lose2 = gl2.getExtension('WEBGL_lose_context');
            if (lose2) {
                lose2.loseContext();
            }
        }
        G.webgpu = !!nav.gpu;
        G.offscreenCanvas = typeof w.OffscreenCanvas !== 'undefined';
    });

    var VIDEO_TYPES = [
        ['H.264 Baseline', 'video/mp4; codecs="avc1.42E01E"'],
        ['H.264 Main', 'video/mp4; codecs="avc1.4D401F"'],
        ['H.264 High 4.0', 'video/mp4; codecs="avc1.640028"'],
        ['H.264 High 5.1 (4K)', 'video/mp4; codecs="avc1.640033"'],
        ['HEVC Main', 'video/mp4; codecs="hvc1.1.6.L93.B0"'],
        ['HEVC Main (hev1)', 'video/mp4; codecs="hev1.1.6.L93.B0"'],
        ['HEVC Main10 4K', 'video/mp4; codecs="hvc1.2.4.L153.B0"'],
        ['VP8', 'video/webm; codecs="vp8"'],
        ['VP9', 'video/webm; codecs="vp9"'],
        ['VP9 profile 0', 'video/webm; codecs="vp09.00.10.08"'],
        ['VP9 profile 2 (10-bit)', 'video/webm; codecs="vp09.02.10.10"'],
        ['AV1 Main 8-bit', 'video/mp4; codecs="av01.0.05M.08"'],
        ['AV1 Main 10-bit 4K', 'video/mp4; codecs="av01.0.12M.10"'],
        ['AV1 in WebM', 'video/webm; codecs="av01.0.05M.08"'],
        ['Dolby Vision (dvh1)', 'video/mp4; codecs="dvh1.05.06"'],
        ['Dolby Vision (dvhe)', 'video/mp4; codecs="dvhe.05.06"'],
        ['HLS', 'application/vnd.apple.mpegurl'],
        ['DASH', 'application/dash+xml'],
        ['MPEG-TS', 'video/mp2t'],
        ['Theora', 'video/ogg; codecs="theora"']
    ];

    var AUDIO_TYPES = [
        ['AAC-LC', 'audio/mp4; codecs="mp4a.40.2"'],
        ['HE-AAC', 'audio/mp4; codecs="mp4a.40.5"'],
        ['Opus (WebM)', 'audio/webm; codecs="opus"'],
        ['Opus (MP4)', 'audio/mp4; codecs="opus"'],
        ['Vorbis', 'audio/ogg; codecs="vorbis"'],
        ['MP3', 'audio/mpeg'],
        ['FLAC', 'audio/flac'],
        ['AC-3 (Dolby Digital)', 'audio/mp4; codecs="ac-3"'],
        ['E-AC-3 (DD+)', 'audio/mp4; codecs="ec-3"'],
        ['AC-4', 'audio/mp4; codecs="ac-4.02.01.01"'],
        ['DTS', 'audio/mp4; codecs="dtsc"'],
        ['DTS:X', 'audio/mp4; codecs="dtsx"'],
        ['ALAC', 'audio/mp4; codecs="alac"'],
        ['WAV PCM', 'audio/wav; codecs="1"']
    ];

    DP.safe('media', function () {
        var v = document.createElement('video');
        var a = document.createElement('audio');
        var MS = w.MediaSource || w.WebKitMediaSource;
        var MMS = w.ManagedMediaSource;
        R.video.canPlay = {};
        R.video.mse = {};
        R.audio.canPlay = {};
        R.audio.mse = {};
        R.video.mseApi = MS ? (w.MediaSource ? 'MediaSource' : 'WebKitMediaSource') : (MMS ? 'ManagedMediaSource' : null);
        R.video.managedMediaSource = !!MMS;

        function mse(type) {
            var api = MS || MMS;
            if (!api || !api.isTypeSupported) {
                return null;
            }
            return api.isTypeSupported(type);
        }

        DP.each(VIDEO_TYPES, function (t) {
            R.video.canPlay[t[0]] = v.canPlayType ? v.canPlayType(t[1]) || 'no' : null;
            R.video.mse[t[0]] = mse(t[1]);
        });
        DP.each(AUDIO_TYPES, function (t) {
            R.audio.canPlay[t[0]] = a.canPlayType ? a.canPlayType(t[1]) || 'no' : null;
            R.audio.mse[t[0]] = mse(t[1]);
        });
        R.video.pictureInPicture = !!document.pictureInPictureEnabled;
        R.video.requestVideoFrameCallback = !!(v.requestVideoFrameCallback);
        R.video.webCodecs = typeof w.VideoDecoder !== 'undefined';
        R.video.remotePlayback = !!v.remote;
    });

    DP.safe('audioContext', function () {
        var AC = w.AudioContext || w.webkitAudioContext;
        if (!AC) {
            R.audio.context = null;
            return;
        }
        var ctx = new AC();
        R.audio.context = {
            sampleRate: ctx.sampleRate,
            baseLatency: ctx.baseLatency === undefined ? null : ctx.baseLatency,
            outputLatency: ctx.outputLatency === undefined ? null : ctx.outputLatency,
            maxChannelCount: ctx.destination ? ctx.destination.maxChannelCount : null,
            state: ctx.state
        };
        if (ctx.close) {
            ctx.close();
        }
    });

    DP.safe('webrtc', function () {
        var W = R.webrtc;
        W.RTCPeerConnection = typeof (w.RTCPeerConnection || w.webkitRTCPeerConnection) !== 'undefined';
        W.dataChannel = W.RTCPeerConnection && !!(w.RTCPeerConnection && w.RTCPeerConnection.prototype.createDataChannel);
        W.insertableStreams = !!(w.RTCRtpScriptTransform || (w.RTCRtpSender && w.RTCRtpSender.prototype.createEncodedStreams));
        function caps(kind, side) {
            var C = side === 'receiver' ? w.RTCRtpReceiver : w.RTCRtpSender;
            if (!C || !C.getCapabilities) {
                return null;
            }
            var c = C.getCapabilities(kind);
            var out = [];
            var seen = {};
            DP.each(c && c.codecs, function (codec) {
                var key = codec.mimeType + (codec.sdpFmtpLine ? ' ' + codec.sdpFmtpLine : '');
                if (/rtx|red|ulpfec|flexfec|telephone-event|CN$/i.test(codec.mimeType) || seen[key]) {
                    return;
                }
                seen[key] = true;
                out.push(key);
            });
            return out;
        }
        W.videoReceive = caps('video', 'receiver');
        W.videoSend = caps('video', 'sender');
        W.audioReceive = caps('audio', 'receiver');
    });

    DP.safe('features', function () {
        var F = R.features;
        var doc = document.documentElement;
        var list = {
            'Fullscreen API': !!(doc.requestFullscreen || doc.webkitRequestFullscreen || doc.webkitRequestFullScreen || doc.mozRequestFullScreen || doc.msRequestFullscreen),
            'Pointer Lock': !!(doc.requestPointerLock || doc.webkitRequestPointerLock || doc.mozRequestPointerLock),
            'Keyboard Lock': has('navigator.keyboard.lock'),
            'Keyboard Map': has('navigator.keyboard.getLayoutMap'),
            'Gamepad API': !!(nav.getGamepads || nav.webkitGetGamepads),
            'Gamepad vibration': has('GamepadHapticActuator'),
            'Wake Lock': has('navigator.wakeLock'),
            'WebSocket': has('WebSocket'),
            'WebTransport': has('WebTransport'),
            'WebRTC': R.webrtc.RTCPeerConnection,
            'WebCodecs': has('VideoDecoder'),
            'WebAssembly': has('WebAssembly'),
            'SharedArrayBuffer': has('SharedArrayBuffer'),
            'crossOriginIsolated': w.crossOriginIsolated === true,
            'Service Worker': has('navigator.serviceWorker'),
            'Web Worker': has('Worker'),
            'Promise': has('Promise'),
            'fetch': has('fetch'),
            'ES2015 syntax': (function () {
                try {
                    return new Function('class A {}; let b = () => 1; return `${b()}` === "1"')();
                } catch (e) {
                    return false;
                }
            })(),
            'Intl': has('Intl'),
            'WebXR': has('navigator.xr'),
            'WebHID': has('navigator.hid'),
            'WebUSB': has('navigator.usb'),
            'Web Serial': has('navigator.serial'),
            'Web Bluetooth': has('navigator.bluetooth'),
            'Web MIDI': has('navigator.requestMIDIAccess'),
            'Web Share': has('navigator.share'),
            'Clipboard API': has('navigator.clipboard'),
            'Notifications': has('Notification'),
            'Vibration': has('navigator.vibrate'),
            'Battery API': has('navigator.getBattery'),
            'Speech synthesis': has('speechSynthesis'),
            'Speech recognition': has('SpeechRecognition') || has('webkitSpeechRecognition'),
            'Media Session': has('navigator.mediaSession'),
            'Media Devices': has('navigator.mediaDevices'),
            'Screen capture': has('navigator.mediaDevices.getDisplayMedia'),
            'Picture-in-Picture': R.video.pictureInPicture,
            'Remote Playback': R.video.remotePlayback,
            'Presentation API': has('navigator.presentation'),
            'Payment Request': has('PaymentRequest'),
            'Credential Mgmt': has('navigator.credentials'),
            'WebAuthn': has('PublicKeyCredential'),
            'IntersectionObserver': has('IntersectionObserver'),
            'ResizeObserver': has('ResizeObserver'),
            'requestIdleCallback': has('requestIdleCallback'),
            'CSS grid': !!(w.CSS && w.CSS.supports && w.CSS.supports('display', 'grid')),
            'CSS custom props': !!(w.CSS && w.CSS.supports && w.CSS.supports('--a', '0')),
            'View Transitions': has('document.startViewTransition'),
            'Compression Streams': has('CompressionStream'),
            'File System Access': has('showOpenFilePicker'),
            'Idle Detection': has('IdleDetector'),
            'EyeDropper': has('EyeDropper'),
            'Window Management': has('getScreenDetails'),
            'Device Posture': has('navigator.devicePosture'),
            'secureContext': w.isSecureContext === true
        };
        var names = DP.keys(list);
        for (var i = 0; i < names.length; i++) {
            F[names[i]] = list[names[i]];
        }
        var wasm = has('WebAssembly.validate');
        if (wasm) {
            /* tiny modules: SIMD (v128.const) and threads (shared memory) */
            F['Wasm SIMD'] = DP.safe('wasm-simd', function () {
                return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 22, 1, 20, 0, 253, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 11]));
            }, false);
            F['Wasm threads'] = DP.safe('wasm-threads', function () {
                return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 5, 4, 1, 3, 1, 1]));
            }, false);
        }
    });

    DP.safe('input', function () {
        var IN = R.input;
        IN.maxTouchPoints = nav.maxTouchPoints || nav.msMaxTouchPoints || 0;
        IN.touchEvents = 'ontouchstart' in w;
        IN.pointerEvents = has('PointerEvent');
        IN.pointer = mq('(pointer: fine)') ? 'fine' : mq('(pointer: coarse)') ? 'coarse' : mq('(pointer: none)') ? 'none' : null;
        IN.hover = mq('(hover: hover)');
        IN.gamepadApi = R.features['Gamepad API'];
    });

    DP.safe('network', function () {
        var N = R.network;
        var c = nav.connection || nav.mozConnection || nav.webkitConnection;
        N.onLine = nav.onLine;
        if (c) {
            N.connection = { type: c.type || null, effectiveType: c.effectiveType || null, downlinkMbps: c.downlink === undefined ? null : c.downlink, downlinkMax: c.downlinkMax === undefined ? null : c.downlinkMax, rttMs: c.rtt === undefined ? null : c.rtt, saveData: c.saveData === undefined ? null : c.saveData };
        }
    });

    DP.readNavigationTiming = function () {
        var N = R.network;
        var t = w.performance && w.performance.getEntriesByType ? w.performance.getEntriesByType('navigation')[0] : null;
        if (t) {
            N.navigation = {
                protocol: t.nextHopProtocol || null,
                dnsMs: DP.round(t.domainLookupEnd - t.domainLookupStart, 1),
                connectMs: DP.round(t.connectEnd - t.connectStart, 1),
                tlsMs: t.secureConnectionStart ? DP.round(t.connectEnd - t.secureConnectionStart, 1) : null,
                ttfbMs: DP.round(t.responseStart - t.requestStart, 1),
                domContentLoadedMs: DP.round(t.domContentLoadedEventEnd, 1)
            };
        } else if (w.performance && w.performance.timing) {
            var tm = w.performance.timing;
            N.navigation = { ttfbMs: tm.responseStart - tm.requestStart, dnsMs: tm.domainLookupEnd - tm.domainLookupStart, connectMs: tm.connectEnd - tm.connectStart, domContentLoadedMs: tm.domContentLoadedEventEnd - tm.navigationStart };
        }
    };

    DP.safe('storage', function () {
        var S = R.storage;
        function test(store) {
            try {
                var s = w[store];
                s.setItem('dp.t', '1');
                s.removeItem('dp.t');
                return true;
            } catch (e) {
                return false;
            }
        }
        S.localStorage = test('localStorage');
        S.sessionStorage = test('sessionStorage');
        S.indexedDB = has('indexedDB');
        S.cacheStorage = has('caches');
        S.cookies = DP.safe('cookies', function () {
            document.cookie = 'dp_t=1; path=/; max-age=5; SameSite=Lax';
            var ok = document.cookie.indexOf('dp_t=1') >= 0;
            document.cookie = 'dp_t=; path=/; max-age=0';
            return ok;
        }, false);
    });

    DP.safe('perf', function () {
        var P = R.perf;
        P.hardwareConcurrency = nav.hardwareConcurrency || null;
        P.deviceMemoryGb = nav.deviceMemory || null;
        if (w.performance && w.performance.memory) {
            P.jsHeapLimitMb = Math.round(w.performance.memory.jsHeapSizeLimit / 1048576);
        }
        P.timerResolutionMs = DP.safe('timer', function () {
            var a = DP.now();
            var b = a;
            var n = 0;
            while (b === a && n < 100000) {
                b = DP.now();
                n++;
            }
            return DP.round(b - a, 4);
        });
    });

    DP.safe('locale', function () {
        var L = R.locale;
        L.timezoneOffsetMin = -new Date().getTimezoneOffset();
        L.dateString = new Date().toString();
        if (w.Intl && Intl.DateTimeFormat) {
            var o = Intl.DateTimeFormat().resolvedOptions();
            L.timeZone = o.timeZone || null;
            L.locale = o.locale;
            L.calendar = o.calendar;
            L.numberingSystem = o.numberingSystem;
            L.hourCycle = o.hourCycle || null;
        }
        L.sample = DP.safe('locale-sample', function () {
            return (1234567.891).toLocaleString() + ' / ' + new Date(Date.UTC(2026, 0, 31, 13, 5)).toLocaleString();
        });
    });

    /*
     * Platform globals. The TV vendors inject objects (tizen, webapis, PalmSystem, Hisense_*)
     * into their own app runtimes; some of them leak into the browser, and this is where we see it.
     */
    DP.safe('platformApis', function () {
        var P = R.platformApis;
        var KNOWN = ['tizen', 'webapis', 'PalmSystem', 'PalmServiceBridge', 'webOS', 'webOSSystem', 'webOSDev',
            'oipfObjectFactory', 'oipfCapabilities', 'Android', 'AndroidBridge', 'chrome', 'opr', 'opera', 'safari',
            'external', 'ReactNativeWebView', 'electron', '__TAURI__', 'netscape', 'sf', 'NetCastGetBrowserObject',
            'vidaa', 'VIDAA', 'hisense', 'Hisense', 'xbox', 'Windows', 'MSApp', 'cordova', 'Capacitor', 'nw',
            'nativeHost', 'TVJS', 'Orsay', 'samsung', 'SAMSUNG', 'lge', 'Silk', 'amazon', 'fireTV', 'vizio', 'VIZIO'];
        var found = {};
        DP.each(KNOWN, function (name) {
            var t = DP.safe('global ' + name, function () {
                return typeof w[name];
            }, 'error');
            if (t !== 'undefined') {
                found[name] = t;
            }
        });
        var vendorRe = /tizen|webapis|palm|webos|lge|netcast|hisense|vidaa|samsung|oipf|hbbtv|philips|nettv|saphi|panasonic|toshiba|sony|bravia|xiaomi|huawei|harmony|amazon|silk|vewd|opera|foxxum|zeasn|whale|tvjs|orsay|smarttv|nexus|vizio|roku|android/i;
        var names = DP.safe('global names', function () {
            return Object.getOwnPropertyNames(w);
        }, []);
        DP.each(names, function (name) {
            if (vendorRe.test(name) && !found[name]) {
                found[name] = DP.safe('global ' + name, function () {
                    return typeof w[name];
                }, 'error');
            }
        });
        P.globals = found;

        /* anything the page-level runtime adds on top of a clean frame */
        DP.safe('global diff', function () {
            var f = document.createElement('iframe');
            f.style.display = 'none';
            document.body.appendChild(f);
            var clean = {};
            DP.each(Object.getOwnPropertyNames(f.contentWindow), function (n) {
                clean[n] = true;
            });
            document.body.removeChild(f);
            var extra = [];
            DP.each(names, function (n) {
                if (!clean[n] && n !== 'DP' && !/^on/.test(n)) {
                    extra.push(n);
                }
            });
            P.nonStandardGlobals = extra.slice(0, 120);
        });

        function keysOf(o) {
            var out = [];
            DP.safe('keysOf', function () {
                for (var k in o) {
                    out.push(k);
                    if (out.length > 40) {
                        break;
                    }
                }
            });
            return out;
        }

        if (w.tizen) {
            P.tizen = { keys: keysOf(w.tizen) };
            DP.safe('tizen.systeminfo', function () {
                P.tizen.platformVersion = w.tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version');
                P.tizen.model = w.tizen.systeminfo.getCapability('http://tizen.org/system/model_name');
            });
        }
        if (w.webapis) {
            P.webapis = { keys: keysOf(w.webapis) };
            DP.safe('webapis.productinfo', function () {
                var pi = w.webapis.productinfo;
                P.webapis.model = pi.getModel ? pi.getModel() : null;
                P.webapis.realModel = pi.getRealModel ? pi.getRealModel() : null;
                P.webapis.modelCode = pi.getModelCode ? pi.getModelCode() : null;
                P.webapis.firmware = pi.getFirmware ? pi.getFirmware() : null;
                P.webapis.version = pi.getVersion ? pi.getVersion() : null;
                P.webapis.uhd = pi.isUdPanelSupported ? pi.isUdPanelSupported() : null;
                P.webapis.panel8k = pi.is8KPanelSupported ? pi.is8KPanelSupported() : null;
            });
            DP.safe('webapis.avinfo', function () {
                P.webapis.hdr = w.webapis.avinfo && w.webapis.avinfo.isHdrTvSupport ? w.webapis.avinfo.isHdrTvSupport() : null;
            });
        }
        if (w.PalmSystem) {
            P.PalmSystem = { keys: keysOf(w.PalmSystem) };
            DP.safe('PalmSystem.deviceInfo', function () {
                var di = w.PalmSystem.deviceInfo;
                P.PalmSystem.deviceInfo = typeof di === 'string' ? JSON.parse(di) : di;
            });
        }
        if (w.webOSSystem) {
            DP.safe('webOSSystem', function () {
                var di = w.webOSSystem.deviceInfo;
                P.webOSSystem = { deviceInfo: typeof di === 'string' ? JSON.parse(di) : di };
            });
        }
        if (w.webOS) {
            P.webOS = { keys: keysOf(w.webOS), platform: DP.safe('webOS.platform', function () {
                return w.webOS.platform;
            }) };
        }

        /* Hisense VIDAA exposes Hisense_Get* functions; read the harmless ones */
        var hisense = {};
        var ID_FIELD = /^(ip|ip_?addr(ess)?|mac(_?addr(ess)?)?|uuid|device_?id|serial(_?(no|number))?|ads?_?id)$/i;
        DP.each(names, function (n) {
            if (/^Hisense_Get/.test(n) && typeof w[n] === 'function') {
                if (/ID|Mac|Serial|Uuid|Token|Ip|Network/i.test(n.replace('Hisense_Get', ''))) {
                    hisense[n] = '(skipped: identifier)';
                } else if (w[n].length === 0) {
                    hisense[n] = DP.safe(n, function () {
                        return w[n]();
                    }, '(threw)');
                    /* some getters bundle an address or an id into a bigger object */
                    if (hisense[n] && typeof hisense[n] === 'object') {
                        DP.each(DP.keys(hisense[n]), function (k) {
                            if (ID_FIELD.test(k)) {
                                hisense[n][k] = '(skipped: identifier)';
                            }
                        });
                    }
                }
            }
        });
        if (DP.keys(hisense).length) {
            P.hisense = hisense;
        }
        if (w.oipfObjectFactory) {
            DP.safe('oipf', function () {
                P.oipf = { capabilitiesObject: w.oipfObjectFactory.isObjectSupported('application/oipfCapabilities') };
            });
        }
    });

    /* ---------------- async probes ---------------- */

    DP.runAsync = function () {
        DP.pending++;
        if (nav.userAgentData && nav.userAgentData.getHighEntropyValues) {
            DP.task('ua-ch', 3000, function (done) {
                DP.then('getHighEntropyValues', nav.userAgentData.getHighEntropyValues(['architecture', 'bitness', 'brands', 'formFactors', 'fullVersionList', 'model', 'platformVersion', 'uaFullVersion', 'wow64']), function (v) {
                    R.uaData = v;
                }, done);
            });
        }

        DP.task('server', 8000, function (done) {
            DP.xhr('GET', '/api/echo?t=' + new Date().getTime(), null, function (err, data, ms) {
                if (err) {
                    DP.err('echo', err);
                    done('error');
                    return;
                }
                if (!data || typeof data !== 'object') {
                    DP.err('echo', 'unexpected response');
                    done('error');
                    return;
                }
                R.server = data;
                R.server.roundTripMs = Math.round(ms);
                R.serverClientDelta = data.now ? Math.round(data.now - (new Date().getTime() - ms / 2)) : null;
                done();
            }, 8000);
        });

        if (nav.mediaCapabilities && nav.mediaCapabilities.decodingInfo) {
            DP.task('media-capabilities', 4000, function (done) {
                var mc = R.video.capabilities = {};
                var tests = [
                    ['H.264 1080p60', 'media-source', 'video/mp4; codecs="avc1.640028"', 1920, 1080, 60, 8000000],
                    ['H.264 4K60', 'media-source', 'video/mp4; codecs="avc1.640033"', 3840, 2160, 60, 40000000],
                    ['HEVC 4K60 10-bit', 'media-source', 'video/mp4; codecs="hvc1.2.4.L153.B0"', 3840, 2160, 60, 40000000],
                    ['VP9 1080p60', 'media-source', 'video/webm; codecs="vp09.00.41.08"', 1920, 1080, 60, 8000000],
                    ['VP9 4K60', 'media-source', 'video/webm; codecs="vp09.00.51.08"', 3840, 2160, 60, 40000000],
                    ['AV1 1080p60', 'media-source', 'video/mp4; codecs="av01.0.09M.08"', 1920, 1080, 60, 8000000],
                    ['AV1 4K60 10-bit', 'media-source', 'video/mp4; codecs="av01.0.13M.10"', 3840, 2160, 60, 40000000],
                    ['WebRTC H.264 1080p60', 'webrtc', 'video/H264', 1920, 1080, 60, 20000000],
                    ['WebRTC H.265 1080p60', 'webrtc', 'video/H265', 1920, 1080, 60, 20000000],
                    ['WebRTC VP9 1080p60', 'webrtc', 'video/VP9', 1920, 1080, 60, 20000000],
                    ['WebRTC AV1 1080p60', 'webrtc', 'video/AV1', 1920, 1080, 60, 20000000],
                    ['WebRTC AV1 4K60', 'webrtc', 'video/AV1', 3840, 2160, 60, 40000000]
                ];
                var left = tests.length;
                DP.each(tests, function (t) {
                    var cfg = { type: t[1], video: { contentType: t[2], width: t[3], height: t[4], framerate: t[5], bitrate: t[6] } };
                    var p = DP.safe('decodingInfo', function () {
                        return nav.mediaCapabilities.decodingInfo(cfg);
                    });
                    DP.then('decodingInfo ' + t[0], p, function (r) {
                        mc[t[0]] = { supported: r.supported, smooth: r.smooth, powerEfficient: r.powerEfficient };
                    }, function () {
                        if (!mc[t[0]]) {
                            mc[t[0]] = { supported: false, error: true };
                        }
                        left--;
                        if (left === 0) {
                            done();
                        }
                    });
                });
            });
        }

        var rmksa = nav.requestMediaKeySystemAccess;
        if (rmksa) {
            DP.task('drm', 5000, function (done) {
                var D = R.drm;
                var tests = [
                    ['Widevine', 'com.widevine.alpha', ['HW_SECURE_ALL', 'HW_SECURE_DECODE', 'HW_SECURE_CRYPTO', 'SW_SECURE_DECODE', 'SW_SECURE_CRYPTO', '']],
                    ['PlayReady', 'com.microsoft.playready.recommendation', ['3000', '2000', '']],
                    ['PlayReady (legacy)', 'com.microsoft.playready', ['']],
                    ['PlayReady HW', 'com.microsoft.playready.hardware', ['']],
                    ['FairPlay', 'com.apple.fps', ['']],
                    ['FairPlay 1.0', 'com.apple.fps.1_0', ['']],
                    ['ClearKey', 'org.w3.clearkey', ['']],
                    ['Chromecast PlayReady', 'com.chromecast.playready', ['']]
                ];
                var jobs = [];
                DP.each(tests, function (t) {
                    D[t[0]] = { keySystem: t[1], robustness: [] };
                    DP.each(t[2], function (rob) {
                        jobs.push([t[0], t[1], rob]);
                    });
                });
                var left = jobs.length;
                DP.each(jobs, function (j) {
                    var cfg = [{
                        initDataTypes: ['cenc'],
                        videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"', robustness: j[2] }],
                        audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }]
                    }];
                    var p = DP.safe('rmksa', function () {
                        return nav.requestMediaKeySystemAccess(j[1], cfg);
                    });
                    function next() {
                        left--;
                        if (left === 0) {
                            DP.each(DP.keys(D), function (k) {
                                D[k].supported = D[k].robustness.length > 0;
                            });
                            done();
                        }
                    }
                    if (!p || typeof p.then !== 'function') {
                        next();
                        return;
                    }
                    p.then(function () {
                        D[j[0]].robustness.push(j[2] || '(default)');
                        next();
                    }, next);
                });
            });
        }

        if (nav.gpu && nav.gpu.requestAdapter) {
            DP.task('webgpu', 3000, function (done) {
                DP.then('requestAdapter', nav.gpu.requestAdapter(), function (a) {
                    if (!a) {
                        R.graphics.webgpuAdapter = null;
                        return;
                    }
                    var info = a.info || {};
                    var feats = [];
                    if (a.features && a.features.forEach) {
                        a.features.forEach(function (f) {
                            feats.push(f);
                        });
                    }
                    R.graphics.webgpuAdapter = {
                        vendor: info.vendor || null,
                        architecture: info.architecture || null,
                        device: info.device || null,
                        description: info.description || null,
                        isFallback: a.isFallbackAdapter === true,
                        features: feats.sort(),
                        maxTexture2D: a.limits ? a.limits.maxTextureDimension2D : null
                    };
                }, done);
            });
        }

        if (nav.storage && nav.storage.estimate) {
            DP.task('storage', 2000, function (done) {
                DP.then('storage.estimate', nav.storage.estimate(), function (e) {
                    R.storage.quotaMb = e.quota ? Math.round(e.quota / 1048576) : null;
                    R.storage.usageMb = e.usage ? DP.round(e.usage / 1048576, 2) : 0;
                }, done);
            });
        }

        if (nav.permissions && nav.permissions.query) {
            DP.task('permissions', 2000, function (done) {
                var names = ['notifications', 'geolocation', 'camera', 'microphone', 'clipboard-read', 'persistent-storage', 'midi'];
                var left = names.length;
                R.features.permissions = {};
                DP.each(names, function (n) {
                    var p = null;
                    try {
                        p = nav.permissions.query({ name: n });
                    } catch (e) {
                        p = null;
                    }
                    if (p && p.then) {
                        /* an unknown permission name is an answer too, not an error */
                        p = p.then(null, function () {
                            return { state: 'unsupported' };
                        });
                    }
                    DP.then('permission ' + n, p, function (s) {
                        R.features.permissions[n] = s.state;
                    }, function () {
                        left--;
                        if (left === 0) {
                            done();
                        }
                    });
                });
            });
        }

        if (w.speechSynthesis) {
            DP.task('voices', 2500, function (done) {
                function read() {
                    var v = w.speechSynthesis.getVoices() || [];
                    if (!v.length) {
                        return false;
                    }
                    var langs = {};
                    DP.each(v, function (x) {
                        langs[x.lang] = true;
                    });
                    R.audio.voices = { count: v.length, languages: DP.keys(langs).sort() };
                    done();
                    return true;
                }
                if (!read()) {
                    w.speechSynthesis.onvoiceschanged = read;
                }
            });
        }

        if (nav.getBattery) {
            DP.task('battery', 2000, function (done) {
                DP.then('getBattery', nav.getBattery(), function (b) {
                    R.perf.battery = { present: !(b.charging && b.level === 1 && b.chargingTime === 0), charging: b.charging };
                }, done);
            });
        }

        if (w.VideoDecoder && w.VideoDecoder.isConfigSupported) {
            DP.task('webcodecs', 3000, function (done) {
                var codecs = [['H.264', 'avc1.640028'], ['HEVC', 'hvc1.1.6.L123.B0'], ['VP9', 'vp09.00.10.08'], ['AV1', 'av01.0.08M.08']];
                var left = codecs.length;
                R.video.webCodecsDecode = {};
                DP.each(codecs, function (c) {
                    var p = DP.safe('isConfigSupported', function () {
                        return w.VideoDecoder.isConfigSupported({ codec: c[1], codedWidth: 1920, codedHeight: 1080, hardwareAcceleration: 'prefer-hardware' });
                    });
                    DP.then('VideoDecoder ' + c[0], p, function (r) {
                        R.video.webCodecsDecode[c[0]] = r.supported;
                    }, function () {
                        left--;
                        if (left === 0) {
                            done();
                        }
                    });
                });
            });
        }

        /* the CPU micro-benchmark blocks the thread for ~150 ms, so it runs after the first paint */
        DP.task('benchmark', 6000, function (done) {
            setTimeout(function () {
                DP.safe('benchmark', function () {
                    var start = DP.now();
                    var ops = 0;
                    var x = 0;
                    var s = '';
                    while (DP.now() - start < 150) {
                        for (var i = 0; i < 2000; i++) {
                            x = (x + Math.sqrt(i * 7.3) * Math.sin(i)) % 1e6;
                            s = (s + i).slice(-16);
                        }
                        ops += 2000;
                    }
                    R.perf.benchmarkOpsPerMs = Math.round(ops / (DP.now() - start));
                    R.perf.benchmarkSink = x > -1 && s.length > 0;
                });
                done();
            }, 300);
        });

        DP.pending--;
        if (DP.pending === 0) {
            DP.emit('idle');
        }
    };

    /* round trip: Vercel function in fra1 (fixed reference) and the nearest CDN edge.
       Runs after the first save, so a slow network never holds the report back. */
    DP.measureRtt = function (done) {
        (function () {
            var targets = [['fra1 function', '/api/ping'], ['CDN edge', '/ping.txt']];
            R.network.rtt = {};
            var ti = 0;
            function nextTarget() {
                if (ti >= targets.length) {
                    done();
                    return;
                }
                var t = targets[ti++];
                var samples = [];
                var n = 0;
                function shot() {
                    DP.xhr('GET', t[1] + '?t=' + new Date().getTime() + n, null, function (err, data, ms) {
                        if (!err && n > 0) {
                            samples.push(ms);
                        }
                        n++;
                        if (n <= 6 && !err) {
                            shot();
                            return;
                        }
                        if (samples.length) {
                            samples.sort(function (a, b) {
                                return a - b;
                            });
                            R.network.rtt[t[0]] = {
                                min: DP.round(samples[0], 1),
                                median: DP.round(samples[Math.floor(samples.length / 2)], 1),
                                max: DP.round(samples[samples.length - 1], 1),
                                samples: samples.length
                            };
                        } else {
                            R.network.rtt[t[0]] = { error: err ? err.message : 'no samples' };
                        }
                        nextTarget();
                    }, 4000);
                }
                shot();
            }
            nextTarget();
        })();
    };
})(window);
