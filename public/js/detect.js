/* device-probe: turns raw signals into "what is this device" + which Boosteroid client fits it. ES5. */
(function (w) {
    'use strict';

    var DP = w.DP;

    /* Samsung ships one Tizen release per TV model year */
    var TIZEN_YEAR = {
        '2.3': '2015', '2.4': '2016', '3.0': '2017', '4.0': '2018', '5.0': '2019', '5.5': '2020',
        '6.0': '2021', '6.5': '2022', '7.0': '2023', '8.0': '2024', '9.0': '2025'
    };

    /* LG pins the webOS browser engine per release; [min Chromium, webOS, model years] */
    var WEBOS_BY_CHROMIUM = [
        [120, 'webOS 25', '2025'],
        [108, 'webOS 24', '2024'],
        [94, 'webOS 23', '2023'],
        [87, 'webOS 22', '2022'],
        [79, 'webOS 6', '2021'],
        [68, 'webOS 5', '2020'],
        [53, 'webOS 4.x', '2018-2019'],
        [38, 'webOS 3.x', '2016-2017']
    ];

    var FIRE_TV = {
        AFTB: 'Fire TV (1st gen, 2014)',
        AFTM: 'Fire TV Stick (1st gen, 2014)',
        AFTS: 'Fire TV (2nd gen, 2015)',
        AFTT: 'Fire TV Stick (2nd gen, 2016)',
        AFTN: 'Fire TV (3rd gen, 2017)',
        AFTA: 'Fire TV Cube (1st gen, 2018)',
        AFTMM: 'Fire TV Stick 4K (2018)',
        AFTR: 'Fire TV Cube (2nd gen, 2019)',
        AFTSS: 'Fire TV Stick Lite (2020)',
        AFTSSS: 'Fire TV Stick (3rd gen, 2020)',
        AFTKA: 'Fire TV Stick 4K Max (2021)',
        AFTGAZL: 'Fire TV Cube (3rd gen, 2022)',
        AFTKM: 'Fire TV Stick 4K (2nd gen, 2023)',
        AFTKRT: 'Fire TV Stick 4K Max (2nd gen, 2023)'
    };

    var ANDROID_TV_HINT = /\bTV\b|Android ?TV|Google ?TV|BRAVIA|SHIELD|MIBOX|Mi ?Box|MiTV|Chromecast|Nexus Player|\bDTV\b|\bSTB\b|\bBOX\b|Smart ?TV|TPM\d|\bATV\b/i;

    /* models that end in TV: "BeyondTV" (TCL), "AndroidTV"; case-sensitive on purpose */
    var TV_MODEL = /[a-z0-9]TV\b/;

    /* Android WebViews name their app in X-Requested-With; TV makers' browsers give the vendor away */
    var VENDOR_BY_APP = {
        tcl: 'TCL', hisense: 'Hisense', xiaomi: 'Xiaomi', sony: 'Sony', tpvision: 'Philips', philips: 'Philips',
        skyworth: 'Skyworth', haier: 'Haier', changhong: 'Changhong', konka: 'Konka', sharp: 'Sharp', toshiba: 'Toshiba'
    };

    var SMART_TV_TOKENS = [
        [/NetCast/i, 'LG', 'LG NetCast TV'],
        [/NETTV|PhilipsTV|Philips/i, 'Philips', 'Philips Smart TV'],
        [/Saphi/i, 'Philips', 'Philips Saphi TV'],
        [/Titan ?OS/i, 'Philips', 'Titan OS TV'],
        [/WhaleTV|ZEASN/i, 'Zeasn', 'Whale OS TV'],
        [/Foxxum/i, 'Foxxum', 'Foxxum TV'],
        [/Opera TV|OMI\/|Vewd/i, 'Vewd', 'Vewd / Opera TV'],
        [/Viera|Panasonic/i, 'Panasonic', 'Panasonic TV'],
        [/Toshiba/i, 'Toshiba', 'Toshiba TV'],
        [/AQUOS|Sharp/i, 'Sharp', 'Sharp TV'],
        [/Roku/i, 'Roku', 'Roku'],
        [/WPE/, 'RDK', 'WPE / RDK set-top box'],
        [/Freebox/i, 'Free', 'Freebox'],
        [/TiVo/i, 'TiVo', 'TiVo'],
        [/SkyQ|Sky_STB|Sky ?Glass/i, 'Sky', 'Sky box'],
        [/Arcelik|Beko|Grundig|Vestel/i, 'Vestel', 'Vestel-based TV'],
        [/SmartTV|SMART-TV|Smart TV/i, null, 'Smart TV']
    ];

    function match(re, s, i) {
        var m = re.exec(s);
        return m ? m[i === undefined ? 1 : i] : null;
    }

    /* a model has digits; words like "SmartTV" are just marketing tokens */
    function model(v) {
        return v && /\d/.test(v) && !/^(SmartTV|Smart TV|TV|Linux|Android)$/i.test(v) ? v : null;
    }

    function dots(v) {
        return v ? v.replace(/_/g, '.') : v;
    }

    function major(v) {
        return v ? parseInt(v, 10) : NaN;
    }

    /*
     * Since iOS 26 the OS in the user agent is frozen at 18.x. Safari ships with the system, so its
     * Version/ is the real release; other iOS browsers carry no Version/ and leave it unknown.
     */
    function appleVersion(ua, d) {
        var os = dots(match(/OS ([\d_]+) like Mac/, ua));
        var safari = match(/Version\/([\d.]+)/, ua);
        if (safari && (major(safari) >= 26 || !os)) {
            if (os && major(safari) >= 26) {
                d.notes.push('the user agent says ' + os + ' (frozen since iOS 26); Safari ' + safari + ' gives the real release');
            }
            return safari;
        }
        if (os && major(os) >= 18 && !safari) {
            d.notes.push('the user agent says ' + os + ', frozen since iOS 26: the real release may be newer');
        }
        return os;
    }

    /* HbbTV/1.5.1 (+DRM; Samsung; SmartTV2020; T-KSU2EDEUC-1460.2; ; ) - vendor, model and firmware in one place */
    function parseHbbtv(ua) {
        var m = /HbbTV\/([\d.]+)\s*\(([^)]*)\)/i.exec(ua);
        if (!m) {
            return null;
        }
        var f = m[2].split(';');
        for (var i = 0; i < f.length; i++) {
            f[i] = f[i].replace(/^\s+|\s+$/g, '');
        }
        return {
            version: m[1],
            capabilities: f[0] || null,
            vendor: f[1] || null,
            model: f[2] || null,
            software: f[3] || null,
            hardware: f[4] || null,
            family: f[5] || null
        };
    }

    function engineOf(ua, isApple) {
        var v;
        if (isApple) {
            return { name: 'WebKit', version: match(/AppleWebKit\/([\d.]+)/, ua) };
        }
        v = match(/\) (\d+\.\d+\.\d+\.\d+)\/[\d.]+ TV Safari/, ua);
        if (v) {
            return { name: 'Blink', version: v };
        }
        v = match(/(?:Chrome|Chromium|HeadlessChrome)\/([\d.]+)/, ua);
        if (v) {
            return { name: 'Blink', version: v };
        }
        v = match(/Edge\/([\d.]+)/, ua);
        if (v) {
            return { name: 'EdgeHTML', version: v };
        }
        v = match(/Gecko\/[\d.]+.*Firefox\/([\d.]+)/, ua) || match(/rv:([\d.]+)\) Gecko/, ua);
        if (v) {
            return { name: 'Gecko', version: v };
        }
        v = match(/Presto\/([\d.]+)/, ua);
        if (v) {
            return { name: 'Presto', version: v };
        }
        v = match(/Trident\/([\d.]+)/, ua);
        if (v) {
            return { name: 'Trident', version: v };
        }
        v = match(/AppleWebKit\/([\d.]+)/, ua);
        if (v) {
            return { name: 'WebKit', version: v };
        }
        return { name: null, version: null };
    }

    /* the most specific real browser name from UA-CH brands, e.g. "Brave" over "Chromium" */
    function brandName(brands) {
        var best = null;
        DP.each(brands, function (b) {
            if (!b || !b.brand || /Not.?A.?Brand/i.test(b.brand)) {
                return;
            }
            if (b.brand === 'Chromium') {
                best = best || b;
            } else {
                best = b;
            }
        });
        return best;
    }

    function browserOf(ua, d, uaData) {
        var rules = [
            [/Edg(?:e|A|iOS)?\/([\d.]+)/, 'Edge'],
            [/OPR\/([\d.]+)/, 'Opera'],
            [/SamsungBrowser\/([\d.]+)/, 'Samsung Internet'],
            [/YaBrowser\/([\d.]+)/, 'Yandex Browser'],
            [/Silk\/([\d.]+)/, 'Amazon Silk'],
            [/OculusBrowser\/([\d.]+)/, 'Meta Quest Browser'],
            [/Vivaldi\/([\d.]+)/, 'Vivaldi'],
            [/UCBrowser\/([\d.]+)/, 'UC Browser'],
            [/MiuiBrowser\/([\d.]+)/, 'Mi Browser'],
            [/HuaweiBrowser\/([\d.]+)/, 'Huawei Browser'],
            [/CriOS\/([\d.]+)/, 'Chrome (iOS)'],
            [/FxiOS\/([\d.]+)/, 'Firefox (iOS)'],
            [/Firefox\/([\d.]+)/, 'Firefox']
        ];
        for (var i = 0; i < rules.length; i++) {
            var v = match(rules[i][0], ua);
            if (v) {
                return { name: rules[i][1], version: v };
            }
        }
        if (d.family === 'tizen') {
            return { name: 'Samsung TV browser', version: match(/(?:SamsungBrowser|Version)\/([\d.]+)/, ua) };
        }
        if (d.family === 'webos') {
            return { name: 'LG webOS browser', version: null };
        }
        if (d.family === 'vidaa') {
            return { name: 'VIDAA browser', version: null };
        }
        if (/; wv\)/.test(ua) || /Version\/[\d.]+ Chrome\//.test(ua)) {
            return { name: 'Android WebView', version: match(/Chrome\/([\d.]+)/, ua) };
        }
        var brand = brandName(uaData && uaData.brands);
        if (brand && brand.brand !== 'Chromium') {
            return { name: brand.brand, version: brand.version };
        }
        if (/Chrome\/([\d.]+)/.test(ua)) {
            return { name: 'Chrome', version: match(/Chrome\/([\d.]+)/, ua) };
        }
        if (/Version\/([\d.]+).*Safari/.test(ua)) {
            return { name: 'Safari', version: match(/Version\/([\d.]+)/, ua) };
        }
        return { name: null, version: null };
    }

    /*
     * input: { ua, platform, maxTouchPoints, screenW, screenH, uaData (low + high entropy merged),
     *          webglRenderer, apis (report.platformApis), requestedWith (X-Requested-With) }
     */
    DP.detect = function (input) {
        var ua = input.ua || '';
        var uaData = input.uaData || null;
        var hi = uaData || {};
        var touch = input.maxTouchPoints || 0;
        var sw = Math.max(input.screenW || 0, input.screenH || 0);
        var sh = Math.min(input.screenW || 0, input.screenH || 0);
        var plat = input.platform || '';
        var apis = input.apis || {};
        var globals = apis.globals || {};
        var extra = apis.nonStandardGlobals || [];

        function hasGlobal(re) {
            var k;
            for (k in globals) {
                if (Object.prototype.hasOwnProperty.call(globals, k) && re.test(k)) {
                    return true;
                }
            }
            for (k = 0; k < extra.length; k++) {
                if (re.test(extra[k])) {
                    return true;
                }
            }
            return false;
        }

        /*
         * Some TV browsers pose as desktop Chrome: LG's webOS browser (Naver Whale) sends a Windows
         * user agent, Hisense VIDAA a bare Linux one. navigator.platform and the vendor globals
         * still tell the truth.
         */
        var spoofed = !!plat && ((/Windows NT/.test(ua) && !/^Win/i.test(plat)) || (/Macintosh/.test(ua) && !/^Mac/i.test(plat)));
        var lgApi = hasGlobal(/^(webOS|webOSSystem|webOSDev|PalmSystem|PalmServiceBridge)$|^onwebOS|^lgcrw_/);
        var hisenseApi = !!apis.hisense || hasGlobal(/^(Hisense|hisense|vidaa|VIDAA)$|^Hisense_/);
        var tizenApi = hasGlobal(/^(tizen|tizentvwasm)$/);
        var d = {
            family: 'unknown',
            cls: 'unknown',
            vendor: null,
            name: 'Unknown device',
            os: null,
            osVersion: null,
            year: null,
            model: null,
            modelSource: null,
            arch: hi.architecture ? hi.architecture + (hi.bitness ? '/' + hi.bitness : '') : null,
            browser: null,
            browserVersion: null,
            engine: null,
            engineVersion: null,
            hbbtv: parseHbbtv(ua),
            confidence: 'high',
            notes: []
        };
        var v;
        var isApple = /iPhone|iPad|iPod/.test(ua) || (input.platform === 'MacIntel' && touch > 1);

        function set(family, cls, vendor, name) {
            d.family = family;
            d.cls = cls;
            d.vendor = vendor;
            d.name = name;
        }

        if (/Tizen/i.test(ua) || tizenApi) {
            v = match(/Tizen ?([\d.]+)/i, ua);
            if (/SMART-TV|SmartTV|Smart TV|TV Safari/i.test(ua) || hasGlobal(/^tizentvwasm$/) || globals.webapis) {
                set('tizen', 'tv', 'Samsung', 'Samsung Smart TV (Tizen)');
                d.year = v ? TIZEN_YEAR[v] || null : null;
            } else {
                set('tizen', /Mobile/i.test(ua) ? 'mobile' : 'unknown', 'Samsung', 'Tizen device');
            }
            d.os = 'Tizen';
            d.osVersion = v;
        } else if ((/Web0S|webOS|WebOS/.test(ua) && !/hpwOS/.test(ua)) || lgApi || (spoofed && /Whale\//.test(ua))) {
            set('webos', 'tv', 'LG', 'LG Smart TV (webOS)');
            d.os = 'webOS';
            if (!/Web0S|webOS|WebOS/.test(ua)) {
                d.notes.push(spoofed ? 'the browser poses as ' + (/Windows/.test(ua) ? 'Windows' : 'macOS') + ' Chrome; navigator.platform "' + plat + '"' +
                    (lgApi ? ' and the LG globals (onwebOS*, lgcrw_*)' : ' and the Whale engine') + ' give the TV away' : 'recognised by the LG globals, not by the user agent');
                if (!lgApi) {
                    d.confidence = 'medium';
                }
            }
            v = major(match(/Chrome\/([\d.]+)/, ua));
            if (!isNaN(v)) {
                for (var i = 0; i < WEBOS_BY_CHROMIUM.length; i++) {
                    if (v >= WEBOS_BY_CHROMIUM[i][0]) {
                        d.osVersion = WEBOS_BY_CHROMIUM[i][1].replace('webOS ', '');
                        d.year = WEBOS_BY_CHROMIUM[i][2];
                        d.notes.push('webOS release inferred from Chromium ' + v);
                        break;
                    }
                }
            } else if (/AppleWebKit\/537\.41/.test(ua)) {
                d.osVersion = '1.x-2.x';
                d.year = '2014-2015';
            }
        } else if (/VIDAA/i.test(ua) || ((/Hisense|HiSmartTV/i.test(ua) || hisenseApi) && !/Android/i.test(ua))) {
            set('vidaa', 'tv', 'Hisense', 'Hisense Smart TV (VIDAA)');
            d.os = 'VIDAA';
            d.osVersion = match(/VIDAA[\/ ]?([\d.]+)/i, ua);
            /* the Hisense_* API knows the model and the VIDAA release ("U07.60") */
            var hs = apis.hisense || {};
            var info = hs.Hisense_GetDeviceInfo && typeof hs.Hisense_GetDeviceInfo === 'object' ? hs.Hisense_GetDeviceInfo : {};
            v = typeof hs.Hisense_GetOSVersion === 'string' ? hs.Hisense_GetOSVersion : info.os_version;
            if (v && !d.osVersion) {
                d.osVersion = String(v).replace(/^VIDAA\s*/i, '');
            }
            v = info.model_name || (typeof hs.Hisense_GetModelName === 'string' ? hs.Hisense_GetModelName : null);
            if (v) {
                d.model = v;
                d.modelSource = 'Hisense API';
            }
            if (!/VIDAA|Hisense|HiSmartTV/i.test(ua)) {
                d.notes.push('the browser poses as ' + (/X11|Linux/.test(ua) ? 'Linux desktop' : 'desktop') + ' Chrome; the Hisense_* API gives the TV away');
            }
        } else if (/\bAFT[A-Z0-9]{1,8}\b/.test(ua)) {
            v = match(/\b(AFT[A-Z0-9]{1,8})\b/, ua);
            set('firetv', 'tv', 'Amazon', FIRE_TV[v] || 'Fire TV device (' + v + ')');
            d.model = v;
            d.modelSource = 'UA';
            d.os = 'Fire OS';
            v = match(/Android ([\d.]+)/, ua);
            d.osVersion = v ? { '5': '5', '7': '6', '9': '7', '11': '8', '14': '9' }[v.split('.')[0]] || null : null;
            if (v) {
                d.notes.push('Fire OS ' + (d.osVersion || '?') + ' is built on Android ' + v);
            }
        } else if (/CrKey\//.test(ua)) {
            set('chromecast', 'tv', 'Google', 'Chromecast (Cast receiver)');
            d.os = 'Cast';
            d.osVersion = match(/CrKey\/([\d.]+)/, ua);
        } else if (/Android/i.test(ua) && (ANDROID_TV_HINT.test(ua) || TV_MODEL.test(ua) || TV_MODEL.test(hi.model || '') || (input.maxTouchPoints === 0 && sw >= 960 && sw > sh))) {
            set('androidtv', 'tv', null, 'Android TV / Google TV');
            d.os = 'Android TV';
            d.osVersion = match(/Android ([\d.]+)/, ua);
            if (!ANDROID_TV_HINT.test(ua) && !TV_MODEL.test(ua) && !TV_MODEL.test(hi.model || '')) {
                d.confidence = 'medium';
                d.notes.push('Android without touch on a landscape screen: TV or set-top box');
            }
            if (/Mobile/.test(ua) || hi.mobile) {
                d.notes.push('the TV browser calls itself "Mobile" (user agent / client hints)' + (input.maxTouchPoints === 0 ? ', yet it has no touch points, which every phone has' : ''));
            }
        } else if (d.hbbtv) {
            set('hbbtv', 'tv', d.hbbtv.vendor, (d.hbbtv.vendor || 'HbbTV') + ' TV (HbbTV ' + d.hbbtv.version + ')');
        } else if (/Xbox/i.test(ua)) {
            set('xbox', 'console', 'Microsoft', /Xbox Series/i.test(ua) ? 'Xbox Series X|S' : 'Xbox');
            d.os = 'Xbox OS';
        } else if (/PlayStation/i.test(ua)) {
            v = match(/PlayStation ?(\d)/i, ua);
            set('playstation', 'console', 'Sony', 'PlayStation ' + (v || ''));
            d.os = 'PlayStation';
            d.osVersion = match(/PlayStation ?\d[^;)]* ([\d.]+)/i, ua);
        } else if (/Nintendo/i.test(ua)) {
            set('switch', 'console', 'Nintendo', 'Nintendo ' + (match(/Nintendo ([\w]+)/, ua) || ''));
        } else if (/OculusBrowser|Quest|Pico|Wolvic/i.test(ua)) {
            set('quest', 'xr', /Pico/i.test(ua) ? 'Pico' : 'Meta', /Pico/i.test(ua) ? 'Pico headset' : 'Meta Quest');
            d.os = 'Android (XR)';
            d.osVersion = match(/Android ([\d.]+)/, ua);
        } else if (/iPhone|iPod/.test(ua)) {
            set('ios', 'mobile', 'Apple', 'iPhone');
            d.os = 'iOS';
            d.osVersion = appleVersion(ua, d);
        } else if (/iPad/.test(ua) || (input.platform === 'MacIntel' && touch > 1)) {
            set('ios', 'tablet', 'Apple', 'iPad');
            d.os = 'iPadOS';
            d.osVersion = appleVersion(ua, d);
            if (!/iPad/.test(ua)) {
                d.notes.push('iPad in desktop mode: reports itself as a Mac with touch');
            }
        } else if (/Android/i.test(ua)) {
            set('android', /Mobile/.test(ua) ? 'mobile' : 'tablet', null, /Mobile/.test(ua) ? 'Android phone' : 'Android tablet');
            d.os = 'Android';
            d.osVersion = match(/Android ([\d.]+)/, ua);
        } else if (/HarmonyOS|OpenHarmony/i.test(ua)) {
            set('harmonyos', /Mobile|Phone/i.test(ua) ? 'mobile' : 'desktop', 'Huawei', 'HarmonyOS device');
            d.os = 'HarmonyOS';
            d.osVersion = match(/(?:HarmonyOS|OpenHarmony) ?([\d.]+)/i, ua);
        } else if (/KAIOS/i.test(ua)) {
            set('kaios', 'mobile', null, 'KaiOS phone');
            d.os = 'KaiOS';
            d.osVersion = match(/KAIOS\/([\d.]+)/i, ua);
        } else if (/CrOS/.test(ua)) {
            set('chromeos', 'desktop', null, 'Chromebook');
            d.os = 'ChromeOS';
            d.osVersion = match(/CrOS \S+ ([\d.]+)/, ua);
        } else if (spoofed) {
            d.notes.push('the user agent claims ' + (/Windows/.test(ua) ? 'Windows' : 'macOS') + ', but navigator.platform is "' + plat + '": a TV or a box behind a desktop user agent');
        } else if (/Windows/.test(ua)) {
            set('windows', 'desktop', null, 'Windows PC');
            d.os = 'Windows';
            v = match(/Windows NT ([\d.]+)/, ua);
            d.osVersion = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7', '6.0': 'Vista', '5.1': 'XP' }[v] || v;
        } else if (/Macintosh|Mac OS X/.test(ua)) {
            set('macos', 'desktop', 'Apple', 'Mac');
            d.os = 'macOS';
            d.osVersion = dots(match(/Mac OS X ([\d_.]+)/, ua));
        } else if (/Linux|X11/.test(ua)) {
            set('linux', 'desktop', null, 'Linux PC');
            d.os = 'Linux';
            if (sw === 1280 && sh === 800 && touch > 0) {
                set('steamdeck', 'handheld', 'Valve', 'Steam Deck (likely)');
                d.os = 'SteamOS / Linux';
                d.confidence = 'medium';
                d.notes.push('Linux + 1280x800 touch screen: Steam Deck signature');
            }
        }

        /* other smart TV stacks that only show up as UA tokens */
        if (d.family === 'unknown' || d.family === 'linux') {
            for (var t = 0; t < SMART_TV_TOKENS.length; t++) {
                if (SMART_TV_TOKENS[t][0].test(ua)) {
                    set('smarttv', 'tv', SMART_TV_TOKENS[t][1], SMART_TV_TOKENS[t][2]);
                    break;
                }
            }
        }

        /* UA-CH tells the truth that the frozen UA string no longer does */
        if (hi.platformVersion) {
            if (d.family === 'windows') {
                v = major(hi.platformVersion);
                d.osVersion = v >= 13 ? '11' : v > 0 ? '10' : '7/8/8.1';
            } else if (d.family === 'macos' || d.family === 'android' || d.family === 'chromeos' || d.family === 'androidtv') {
                d.osVersion = hi.platformVersion.replace(/(\.0)+$/, '') || d.osVersion;
            }
        }
        if (hi.model) {
            d.model = hi.model;
            d.modelSource = 'UA-CH';
        }
        if (!d.model) {
            v = match(/Android [\d.]+; (?:[a-z]{2}[-_][a-z]{2}; )?([^;)]+?)(?: Build\/|\)| wv\))/i, ua);
            if (v && v !== 'K' && !/^(Linux|U|wv|Mobile)$/i.test(v)) {
                d.model = v;
                d.modelSource = 'UA';
            }
        }
        if (!d.model && d.hbbtv && d.hbbtv.model) {
            d.model = d.hbbtv.model;
            d.modelSource = 'HbbTV UA';
            if (!d.vendor) {
                d.vendor = d.hbbtv.vendor;
            }
            v = match(/(20\d\d)/, d.hbbtv.model);
            if (v && !d.year) {
                d.year = v;
            }
        }
        if (!d.model) {
            v = model(match(/LGE; ([^;]+);/, ua)) || model(match(/Model\/([\w.-]+)/, ua)) || model(match(/Hisense[;\s]+([A-Z0-9][\w-]{4,})/, ua));
            if (v) {
                d.model = v;
                d.modelSource = 'UA';
            }
        }
        if (d.family === 'macos') {
            if (hi.architecture === 'arm' || /Apple M\d|Apple GPU/i.test(input.webglRenderer || '')) {
                d.arch = 'arm64';
                d.name = 'Mac (Apple Silicon)';
            } else if (hi.architecture === 'x86' || /Intel|AMD|Radeon|NVIDIA/i.test(input.webglRenderer || '')) {
                d.arch = 'x86_64';
                d.name = 'Mac (Intel)';
            }
        }
        /* an Android WebView names its app: com.tcl.browser means a TCL TV */
        v = match(/^com\.([a-z]+)\./i, input.requestedWith || '');
        if (v) {
            d.notes.push('opened inside the app ' + input.requestedWith);
            if (VENDOR_BY_APP[v.toLowerCase()] && !d.vendor) {
                d.vendor = VENDOR_BY_APP[v.toLowerCase()];
                if (d.family === 'androidtv') {
                    d.name = d.vendor + ' Android TV';
                }
            }
        }
        if (d.cls === 'tv' && !d.model) {
            d.notes.push('the TV browser does not expose the model; only installed TV apps can read it');
        }

        var eng = engineOf(ua, isApple);
        d.engine = eng.name;
        d.engineVersion = eng.version;
        var br = browserOf(ua, d, uaData);
        d.browser = br.name;
        d.browserVersion = br.version;
        if (hi.fullVersionList && d.browser && !/WebView|TV|webOS|VIDAA/.test(d.browser)) {
            DP.each(hi.fullVersionList, function (b) {
                if (b.brand && d.browser.indexOf(b.brand.replace('Google ', '').replace('Microsoft ', '')) === 0) {
                    d.browserVersion = b.version;
                }
            });
        }
        if (d.family === 'unknown') {
            d.confidence = 'low';
        }
        return d;
    };

    /* Boosteroid client for the detected device (links from boosteroid.com/download) */
    DP.clientFor = function (d) {
        var web = { label: 'Web client', url: 'https://cloud.boosteroid.com' };
        var C = {
            windows: { name: 'Boosteroid for Windows', links: [
                { label: 'Win 10+ 64-bit', url: 'https://boosteroid.com/win/installer/boosteroid-install-x64.zip' },
                { label: 'Portable', url: 'https://boosteroid.com/win/installer/boosteroid-install-portable.zip' }
            ] },
            macArm: { name: 'Boosteroid for Mac (Apple Silicon)', links: [
                { label: 'M1+', url: 'https://boosteroid.com/macos_ARM/installer/boosteroid-install-arm64.dmg' }
            ] },
            macIntel: { name: 'Boosteroid for Mac (Intel)', links: [
                { label: 'Intel', url: 'https://boosteroid.com/macos/installer/boosteroid-install-x64.dmg' }
            ] },
            linux: { name: 'Boosteroid for Linux', links: [
                { label: 'Debian / Ubuntu (.deb)', url: 'https://boosteroid.com/linux/installer/boosteroid-install-x64.deb' },
                { label: 'Fedora (.rpm)', url: 'https://boosteroid.com/linux/installer/boosteroid-install-x64.rpm' },
                { label: 'Flatpak', url: 'https://boosteroid.com/linux/installer/Boosteroid.flatpak' }
            ] },
            chromeos: { name: 'Boosteroid for Chromebook', links: [
                { label: 'Add to Chromebook', url: 'https://apps.chrome/getit/47d105e2-b45e-43c4-a686-d67171f755b9' },
                { label: 'Google Play', url: 'https://play.google.com/store/apps/details?id=com.boosteroid.cloud.twa' }
            ] },
            android: { name: 'Boosteroid for Android', links: [
                { label: 'Google Play', url: 'https://play.google.com/store/apps/details?id=com.boosteroid.streaming' }
            ] },
            androidtv: { name: 'Boosteroid for Android TV', links: [
                { label: 'Google Play', url: 'https://play.google.com/store/apps/details?id=com.boosteroidtv.streaming' }
            ] },
            firetv: { name: 'Boosteroid for Fire TV', links: [
                { label: 'Amazon Appstore', url: 'https://www.amazon.com/dp/B0FBS2TJ5F/' }
            ] },
            webos: { name: 'Boosteroid for LG TV', links: [
                { label: 'LG Content Store', url: 'https://ua.lgappstv.com/main/tvapp/detail?appId=1202498' }
            ] },
            tizen: { name: 'Boosteroid for Samsung TV', links: [
                { label: 'Samsung Apps: search "Boosteroid"', url: null }
            ] },
            ios: { name: 'Boosteroid on iPhone / iPad', links: [
                { label: 'Quick access setup', url: 'https://help.boosteroid.com/en/content/how-to-set-up-quick-access-to-boosteroid-on-ios' },
                web
            ] },
            steamdeck: { name: 'Boosteroid for Steam Deck', links: [
                { label: 'Flatpak', url: 'https://boosteroid.com/linux/installer/Boosteroid.flatpak' }
            ] }
        };
        var key = d.family;
        if (key === 'macos') {
            key = d.arch === 'x86_64' ? 'macIntel' : d.arch === 'arm64' ? 'macArm' : null;
            if (!key) {
                return { name: 'Boosteroid for Mac', links: C.macArm.links.concat(C.macIntel.links), note: 'CPU type unknown: both builds' };
            }
        }
        if (C[key]) {
            return C[key];
        }
        return { name: 'No native client for this device', links: [web], note: 'boosteroid.com lists no app for it; the web client may work' };
    };

    /*
     * Store deep links to try from this browser. Only Android TV and Fire TV have documented
     * schemes; the rest are experiments whose outcome is exactly what this page records.
     */
    DP.benchFor = function (d, cfg) {
        var list = [];
        var sid = cfg.samsungAppId;
        var playTv = 'com.boosteroidtv.streaming';
        var play = 'com.boosteroid.streaming';

        function add(id, label, url, note) {
            list.push({ id: id, label: label, url: url, note: note || '' });
        }

        if (d.family === 'tizen' || cfg.all) {
            if (sid) {
                add('tizen-samsungapps', 'samsungapps://ProductDetail/' + sid, 'samsungapps://ProductDetail/' + sid, 'Galaxy Store scheme; unknown on TV');
                add('tizen-tizenstore', 'tizenstore://ProductDetail/' + sid, 'tizenstore://ProductDetail/' + sid, 'old Tizen Store scheme; unknown on TV');
            } else {
                add('tizen-noid', 'Samsung app id missing: add ?samsungAppId=<id> to the URL', null, '');
            }
            add('tizen-appcontrol', 'tizen.application.launchAppControl(org.volt.apps)', 'js:tizen', 'works only where the page can reach the tizen API');
        }
        if (d.family === 'webos' || cfg.all) {
            add('webos-store-target', 'luna: LG Content Store, target=/apps/details/1202498', 'js:webos-target', 'needs PalmServiceBridge (installed apps only)');
            add('webos-store-query', 'luna: LG Content Store, query=category/GAME_APPS/1202498', 'js:webos-query', 'needs PalmServiceBridge (installed apps only)');
            add('webos-web', 'LG Content Store web page', 'https://ua.lgappstv.com/main/tvapp/detail?appId=1202498', 'opens as a web page');
        }
        if (d.family === 'androidtv' || d.family === 'android' || cfg.all) {
            var pkg = d.family === 'android' ? play : playTv;
            add('android-market', 'market://details?id=' + pkg, 'market://details?id=' + pkg, 'documented');
            add('android-intent', 'intent:// -> Play Store', 'intent://details?id=' + pkg + '#Intent;scheme=market;package=com.android.vending;end', 'Chrome intent syntax');
            add('android-https', 'play.google.com link', 'https://play.google.com/store/apps/details?id=' + pkg, 'may be intercepted by the Play Store');
        }
        if (d.family === 'firetv' || cfg.all) {
            add('firetv-amzn', 'amzn://apps/android?asin=B0FBS2TJ5F', 'amzn://apps/android?asin=B0FBS2TJ5F', 'Amazon Appstore scheme');
            add('firetv-https', 'amazon.com/dp/B0FBS2TJ5F', 'https://www.amazon.com/dp/B0FBS2TJ5F/', 'web page');
        }
        if (d.family === 'vidaa' || cfg.all) {
            add('vidaa-none', 'no known VIDAA store scheme yet', null, 'Hisense_* globals are listed under platform APIs');
        }
        return list;
    };
})(window);
