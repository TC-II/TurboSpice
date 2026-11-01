/**
 * rough_pen.js
 *
 * Turns clean skin SVG artwork into freehand "ink pen" artwork.
 *
 * Ported to TurboSpice (#330) from ASC-Parser engine/rough_pen.js, commit a98a57e: only the
 * UMD wrapper became an ES module (default export). No dependencies.
 *
 * THE ONE HARD GUARANTEE: every `.asy` PIN coordinate that lies on the traced
 * geometry is reproduced EXACTLY in the output, and the stroke approaches it in
 * a straight line, so schematic wires still meet their terminals.
 *
 * Coordinates are LTSpice symbol units throughout. The PDF renderer ignores the
 * skin viewBox (pdf_renderer.js:188), so (0,0) is the component anchor and
 * geometry may sit outside the box or go negative.
 *
 * Output is pure M/L polylines: the renderer flattens cubics to 12 steps, so
 * straight segments are the only way preview and PDF agree vertex for vertex. A
 * stroke-only path never carries `Z` and always carries fill="none", because a
 * closed path with no declared fill is painted solid black (pdf_renderer.js:317).
 *
 * -- What gets traced ------------------------------------------------------
 * The Default skin draws plenty of LINES as filled shapes: arrow's shaft is a
 * 66.7 x 1 rect, cell's plates are 1.8-thick rects, flag's ring is an annulus,
 * and every diode is a filled triangle outline. Those are ink, not blobs, so
 * resolveFigures() recovers what was drawn before the pen ever runs:
 *
 *   ribbon  a filled sliver whose outline is two long sides joined by two short
 *           caps -> collapsed to its centreline and stroked at the measured
 *           thickness. The caps are not drawn at all.
 *   ring    two nested contours (flag's ring, diode's triangle) -> the
 *           centreline between them, stroked at the measured gap.
 *   outline a solid polygon with 3-6 corners (every arrowhead) -> traced round
 *           all its corners, unfilled.
 *   mark    anything else - junction dots, +/- glyphs, white masking discs -
 *           keeps its fill and only rides the warp.
 *
 * -- The pen ---------------------------------------------------------------
 * Three effects compose, in this order:
 *
 *   1. WARP - one smooth 2-D vector field per symbol, sampled at each vertex's
 *      position. Because it depends on WHERE a vertex is and not which shape it
 *      belongs to, everything that touches stays touching.
 *
 *   2. BOW + TREMOR - per stroke, along the normal. A freehand "straight" line
 *      is a shallow arc (bow) carrying a slow unsteadiness (tremor). Both fade
 *      to zero at the stroke's own endpoints, so junctions stay coherent and
 *      only the warp moves them.
 *
 *   3. ANCHOR TAPER - the sum of 1 and 2 is scaled by a smoothstep of the
 *      distance to the nearest pin, reaching 0 at the pin itself.
 */

const RoughPen = (function () {
'use strict';

// -- Tunables ---------------------------------------------------------------
// Units are LTSpice symbol units (1u = 1pt). A resistor body is 22 x 58u.

var DEFAULTS = {
    warp:        0.8,   // amplitude of the per-symbol 2-D distortion field
    warpPeriod:  115,   // its wavelength, comparable to a symbol so it bends
    tremor:      0.18,  // hand unsteadiness along a stroke
    bow:         0.3,   // arc of a nominally straight line, per 48u of length
    overshoot:   1.2,   // how far the pen slides past a free end
    overshootP:  0.1,   // fraction of free ends that overshoot at all
    lock:        8.5,   // straight, undisplaced approach around a pin
    step:        5.5,   // arc-length resample step
    edgeFade:    3.0,   // distance over which tremor fades out at a stroke end
    cornerAngle: 55,    // turn (deg) that breaks a stroke in two
    rotateMax:   2.0,   // max rigid rotation (deg) of a small filled mark
    rotateBelow: 24,    // ... applied only to marks smaller than this
    markWobble:  0.25,  // how far a filled mark's outline strays from perfect
    seamOverlap: 24,    // deg a closed smooth stroke overlaps its own start
    pinTol:      1.0,   // how near geometry must pass a pin to be snapped to it
    precision:   2,     // output decimals

    // One pen draws the whole symbol. The Default artwork mixes 0.5, 0.55, 1.0,
    // 1.5 and 1.8-unit ink; a hand redrawing it would not swap nibs.
    penWidth:    2.5,

    // Shape-role resolution
    ribbonMax:   2.2,   // widest filled sliver still read as a drawn line
    ribbonCap:   1.8,   // a cap edge is at most this many times the width
    outlineMin:  10.5,  // smallest solid shape traced as an outline
    outlineMax:  6,     // most corners a traced outline may have
    cornerWin:   3.0,   // distance window for corner detection
    cornerMin:   28,    // degrees of turn that counts as a corner
    simplifyTol: 1.2,   // max deviation allowed when squaring off rounded corners
    markBelow:   4.0,   // filled shapes smaller than this stay marks

    ink:         '#000' // one pen: traced strokes ignore the source's colours
};

// -- Deterministic randomness -----------------------------------------------

function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        var t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// -- Small helpers ----------------------------------------------------------

function smoothstep(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
function dist(a, b) { var dx = a[0] - b[0], dy = a[1] - b[1]; return Math.sqrt(dx * dx + dy * dy); }

function bbox(pts) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (var i = 0; i < pts.length; i++) {
        if (pts[i][0] < x0) x0 = pts[i][0];
        if (pts[i][0] > x1) x1 = pts[i][0];
        if (pts[i][1] < y0) y0 = pts[i][1];
        if (pts[i][1] > y1) y1 = pts[i][1];
    }
    return { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0, h: y1 - y0 };
}

function figPoints(fig) {
    var out = [];
    for (var i = 0; i < fig.subs.length; i++) out = out.concat(fig.subs[i].pts);
    return out;
}

function closestOnSegment(p, a, b) {
    var vx = b[0] - a[0], vy = b[1] - a[1];
    var len2 = vx * vx + vy * vy;
    var t = len2 === 0 ? 0 : ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var q = [a[0] + t * vx, a[1] + t * vy];
    return { t: t, point: q, d: dist(p, q) };
}

function turnAngle(a, b, c) {
    var v1x = b[0] - a[0], v1y = b[1] - a[1];
    var v2x = c[0] - b[0], v2y = c[1] - b[1];
    var l1 = Math.sqrt(v1x * v1x + v1y * v1y), l2 = Math.sqrt(v2x * v2x + v2y * v2y);
    if (!l1 || !l2) return 0;
    var cos = (v1x * v2x + v1y * v2y) / (l1 * l2);
    return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
}

function polyArea(pts) {
    var a = 0;
    for (var i = 0, n = pts.length; i < n; i++) {
        var b = pts[(i + 1) % n];
        a += pts[i][0] * b[1] - b[0] * pts[i][1];
    }
    return Math.abs(a) / 2;
}

function pathLength(pts, closed) {
    var s = 0;
    for (var i = 0; i + 1 < pts.length; i++) s += dist(pts[i], pts[i + 1]);
    if (closed && pts.length > 1) s += dist(pts[pts.length - 1], pts[0]);
    return s;
}

function median(xs) {
    if (!xs.length) return 0;
    var s = xs.slice().sort(function (a, b) { return a - b; });
    return s[s.length >> 1];
}

// Uniform arc-length resample of an OPEN polyline to exactly M points.
function resampleTo(pts, M) {
    if (pts.length < 2 || M < 2) return pts.slice();
    var cum = [0];
    for (var i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
    var total = cum[cum.length - 1];
    if (!total) return [pts[0].slice(), pts[0].slice()];
    var out = [], j = 0;
    for (var m = 0; m < M; m++) {
        var target = total * m / (M - 1);
        while (j < cum.length - 2 && cum[j + 1] < target) j++;
        var seg = cum[j + 1] - cum[j];
        var t = seg ? (target - cum[j]) / seg : 0;
        out.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * t,
                  pts[j][1] + (pts[j + 1][1] - pts[j][1]) * t]);
    }
    return out;
}

// Shortens a polyline by `d` at both ends. A round-capped stroke reaches d past
// its endpoint, so trimming reproduces the filled bar's true extent.
function trimEnds(pts, d) {
    if (d <= 0 || pts.length < 2) return pts;
    if (pathLength(pts, false) <= 2 * d + 0.5) return pts;
    function eat(list) {
        var left = d;
        while (list.length > 2) {
            var seg = dist(list[0], list[1]);
            if (seg > left) {
                var t = left / seg;
                list[0] = [list[0][0] + (list[1][0] - list[0][0]) * t,
                           list[0][1] + (list[1][1] - list[0][1]) * t];
                return;
            }
            left -= seg; list.shift();
        }
    }
    eat(pts); pts.reverse(); eat(pts); pts.reverse();
    return pts;
}

/**
 * Corners measured over a DISTANCE window rather than between adjacent
 * vertices. The arrowheads in npn/nmos have their corners rounded off by a
 * small bezier fillet, so a per-vertex turn test dissolves them into the curve
 * and reports a triangle as having one corner.
 */
function cornersOf(pts, closed, win, minAngle, nms) {
    var n = pts.length;
    if (!(nms > 0)) nms = win;
    if (n < 3) return [];
    var cum = [0];
    for (var i = 1; i < n; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
    var total = cum[n - 1] + (closed ? dist(pts[n - 1], pts[0]) : 0);

    function arcGap(a, b) {
        var d = Math.abs(cum[a] - cum[b]);
        return closed ? Math.min(d, total - d) : d;
    }
    function far(i, dir) {
        var j = i;
        for (var k = 0; k < n; k++) {
            var nj = j + dir;
            if (closed) nj = (nj + n) % n;
            else if (nj < 0 || nj >= n) break;
            j = nj;
            if (arcGap(i, j) >= win) break;
        }
        return pts[j];
    }

    var score = new Array(n);
    for (var a2 = 0; a2 < n; a2++) {
        score[a2] = (!closed && (a2 === 0 || a2 === n - 1))
            ? 180 : turnAngle(far(a2, -1), pts[a2], far(a2, 1));
    }

    var order = [];
    for (var b2 = 0; b2 < n; b2++) if (score[b2] >= minAngle) order.push(b2);
    order.sort(function (x, y) { return score[y] - score[x] || x - y; });

    var keep = [];
    for (var q = 0; q < order.length; q++) {
        var ok = true;
        for (var r = 0; r < keep.length; r++) {
            if (arcGap(order[q], keep[r]) < nms) { ok = false; break; }
        }
        if (ok) keep.push(order[q]);
    }
    return keep.sort(function (x, y) { return x - y; });
}

/**
 * A filled shape that is really a drawn LINE: arrow's 66.7 x 1 shaft, cell's
 * plates, the minus glyphs, zener's bent bar. Its outline is two long sides
 * joined by two short caps; the result is the centreline between the sides,
 * with the caps dropped and the thickness measured for the stroke width.
 */
function detectRibbon(pts, opt) {
    var A = polyArea(pts), Pm = pathLength(pts, true);
    if (!A || !Pm) return null;
    var t = 2 * A / Pm;                                  // effective width
    if (t > opt.ribbonMax || t <= 0) return null;
    if (Pm < 6 * t) return null;                         // too stubby to be a line

    // The detection window has to be wide enough to see a turn, but suppression
    // must be narrower than a cap edge - otherwise the two corners at each end of
    // arrow's 1u-wide shaft cancel each other out and the ribbon is never found.
    var win = Math.max(1.0, t * 1.5);
    var cor = cornersOf(pts, true, win, opt.cornerMin, Math.max(0.25, t * 0.5));
    if (cor.length < 3 || cor.length > 40) return null;

    var n = pts.length, edges = [], caps = [];
    for (var i = 0; i < cor.length; i++) {
        var from = cor[i], to = cor[(i + 1) % cor.length], len = 0, j = from;
        while (j !== to) { var nj = (j + 1) % n; len += dist(pts[j], pts[nj]); j = nj; }
        edges.push({ from: from, to: to, len: len });
        if (len <= t * opt.ribbonCap) caps.push(i);
    }
    // Group adjacent cap edges: arrow_curve's far end is chamfered into three
    // short edges but is still ONE cap. Exactly two caps must remain - a plus
    // glyph has four arms and must never collapse to a line.
    var isCap = [];
    for (var ci = 0; ci < caps.length; ci++) isCap[caps[ci]] = true;
    var chains = [];
    for (var ei = 0; ei < edges.length; ei++) {
        if (!isCap[ei]) continue;
        var tail = chains[chains.length - 1];
        if (tail && tail[tail.length - 1] === ei - 1) tail.push(ei);
        else chains.push([ei]);
    }
    if (chains.length > 1) {                      // a cap straddling index 0
        var f0 = chains[0], l0 = chains[chains.length - 1];
        if (f0[0] === 0 && l0[l0.length - 1] === edges.length - 1) {
            chains[chains.length - 1] = l0.concat(f0);
            chains.shift();
        }
    }
    if (chains.length !== 2) return null;

    function collect(from, to) {
        var out = [], j2 = from;
        for (;;) { out.push(pts[j2]); if (j2 === to) break; j2 = (j2 + 1) % n; }
        return out;
    }
    var ch0 = chains[0], ch1 = chains[1];
    var sideA = collect(edges[ch0[ch0.length - 1]].to, edges[ch1[0]].from);
    var sideB = collect(edges[ch1[ch1.length - 1]].to, edges[ch0[0]].from).reverse();
    if (sideA.length < 2 || sideB.length < 2) return null;

    var lenA = pathLength(sideA, false), lenB = pathLength(sideB, false);
    if (!lenA || !lenB) return null;
    if (Math.max(lenA, lenB) / Math.min(lenA, lenB) > 3) return null;

    var M = Math.max(2, Math.round(Math.max(lenA, lenB) / Math.max(0.6, opt.step * 0.5)) + 1);
    var ra = resampleTo(sideA, M), rb = resampleTo(sideB, M);
    var mid = [], gaps = [];
    for (var m = 0; m < Math.min(ra.length, rb.length); m++) {
        mid.push([(ra[m][0] + rb[m][0]) / 2, (ra[m][1] + rb[m][1]) / 2]);
        gaps.push(dist(ra[m], rb[m]));
    }
    if (mid.length < 2) return null;
    var width = median(gaps) || t;
    trimEnds(mid, width / 2);
    return { pts: mid, width: width };
}

// Two nested contours are an outline someone filled: flag's ring, every diode's
// triangle. The centreline between them is what the pen should draw.
function annulusCenterline(outer, inner, opt) {
    var M = Math.max(24, Math.round(pathLength(outer, true) / Math.max(0.8, opt.step * 0.6)));
    var loop = outer.concat([outer[0]]);
    var ro = resampleTo(loop, M + 1);
    ro.pop();
    var mid = [], gaps = [];
    for (var i = 0; i < ro.length; i++) {
        var best = null;
        for (var j = 0; j < inner.length; j++) {
            var c = closestOnSegment(ro[i], inner[j], inner[(j + 1) % inner.length]);
            if (!best || c.d < best.d) best = c;
        }
        mid.push([(ro[i][0] + best.point[0]) / 2, (ro[i][1] + best.point[1]) / 2]);
        gaps.push(best.d);
    }
    return { pts: mid, width: median(gaps) };
}

// Squares off rounded corners, but only when doing so barely moves the outline.
function simplifyToCorners(pts, cor, opt) {
    if (cor.length < 3) return pts;
    var poly = cor.map(function (i) { return pts[i]; });
    var worst = 0;
    for (var i = 0; i < pts.length; i++) {
        var d = Infinity;
        for (var j = 0; j < poly.length; j++) {
            d = Math.min(d, closestOnSegment(pts[i], poly[j], poly[(j + 1) % poly.length]).d);
        }
        if (d > worst) worst = d;
    }
    return worst <= opt.simplifyTol ? poly : pts;
}

function isLight(color) {
    if (!color || color.charAt(0) !== '#') return false;
    var hex = color.slice(1);
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (hex.length !== 6) return false;
    var r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 200;
}

// -- SVG reading ------------------------------------------------------------
// Deliberately mirrors drawSvgToPdf's flat regex sweep, including its attribute
// defaults, so the generator can never see geometry differently from the code
// that will draw it.

function parseStyleClasses(svgText) {
    var styles = {};
    var sm = svgText.match(/<style[^>]*>([\s\S]*?)<\/style>/);
    if (!sm) return styles;
    var ruleRe = /([^{}]+)\{([^{}]*)\}/g, m;
    while ((m = ruleRe.exec(sm[1]))) {
        var selectors = m[1].split(',').map(function (s) { return s.trim().replace(/^\./, ''); });
        var decl = m[2];
        var sw = decl.match(/stroke-width\s*:\s*([\d.]+)px/);
        var fl = decl.match(/(?:^|;)\s*fill\s*:\s*([^;}]+)/);
        var st = decl.match(/(?:^|;)\s*stroke\s*:\s*([^;}]+)/);
        for (var i = 0; i < selectors.length; i++) {
            var sel = selectors[i];
            if (!sel) continue;
            var e = styles[sel] || (styles[sel] = {});
            if (sw) e.strokeWidth = parseFloat(sw[1]);
            if (fl) e.fill = fl[1].trim();
            if (st) e.stroke = st[1].trim();
        }
    }
    return styles;
}

function attrNum(tag, name, dflt) {
    var m = tag.match(new RegExp('\\b' + name + '="(-?[\\d.]+)"'));
    return m ? parseFloat(m[1]) : dflt;
}

function attrStr(tag, name) {
    var m = tag.match(new RegExp('\\b' + name + '="([^"]*)"'));
    return m ? m[1] : undefined;
}

// Builds the 2x3 matrix for an element-level transform="". Four Default symbols
// place a rotated <rect> this way (bi, bv, diode_45, res_60); the renderer
// honours it, so it has to be baked into the points here.
function parseTransform(str) {
    var m = [1, 0, 0, 1, 0, 0];
    if (!str) return m;
    var re = /(translate|rotate|scale|matrix)\s*\(([^)]*)\)/g, t;
    while ((t = re.exec(str))) {
        var n = t[2].trim().split(/[\s,]+/).map(parseFloat);
        var c = [1, 0, 0, 1, 0, 0];
        if (t[1] === 'translate') c = [1, 0, 0, 1, n[0] || 0, n[1] || 0];
        else if (t[1] === 'scale') c = [n[0] || 1, 0, 0, (n.length > 1 ? n[1] : n[0]) || 1, 0, 0];
        else if (t[1] === 'matrix') c = n;
        else if (t[1] === 'rotate') {
            var a = (n[0] || 0) * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
            c = [cs, sn, -sn, cs, 0, 0];
            if (n.length >= 3) {
                c[4] = n[1] - cs * n[1] + sn * n[2];
                c[5] = n[2] - sn * n[1] - cs * n[2];
            }
        }
        m = [
            m[0] * c[0] + m[2] * c[1], m[1] * c[0] + m[3] * c[1],
            m[0] * c[2] + m[2] * c[3], m[1] * c[2] + m[3] * c[3],
            m[0] * c[4] + m[2] * c[5] + m[4], m[1] * c[4] + m[3] * c[5] + m[5]
        ];
    }
    return m;
}

function applyMatrix(m, p) {
    return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}

// M L H V C S Z, absolute and relative. Cubics are flattened here; the output is
// polylines regardless, and the resampler decimates back down. No Default skin
// file uses arcs or quadratics.
function parsePathData(d) {
    var toks = d.match(/[MmLlHhVvCcSsZz]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) || [];
    var subs = [], cur = null, x = 0, y = 0, sx = 0, sy = 0;
    var lastC2 = null, i = 0, cmd = null;
    var STEPS = 24;

    function start(nx, ny) { cur = { pts: [[nx, ny]], closed: false }; subs.push(cur); }
    function add(nx, ny) { if (!cur) start(nx, ny); else cur.pts.push([nx, ny]); }
    function cubic(c1x, c1y, c2x, c2y, ex, ey) {
        for (var s = 1; s <= STEPS; s++) {
            var t = s / STEPS, mt = 1 - t;
            add(mt * mt * mt * x + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * ex,
                mt * mt * mt * y + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * ey);
        }
        x = ex; y = ey; lastC2 = [c2x, c2y];
    }
    function n() { return parseFloat(toks[i++]); }

    while (i < toks.length) {
        if (/[A-Za-z]/.test(toks[i])) { cmd = toks[i++]; if (i >= toks.length && cmd.toUpperCase() !== 'Z') break; }
        if (!cmd) { i++; continue; }
        var rel = cmd === cmd.toLowerCase();
        var C = cmd.toUpperCase();

        if (C === 'Z') {
            if (cur) cur.closed = true;
            x = sx; y = sy; lastC2 = null; cur = null; cmd = null;
        } else if (C === 'M') {
            var mx = n(), my = n();
            x = rel ? x + mx : mx; y = rel ? y + my : my;
            sx = x; sy = y; start(x, y); lastC2 = null;
            cmd = rel ? 'l' : 'L';                  // subsequent pairs are lineto
        } else if (C === 'L') {
            var lx = n(), ly = n();
            x = rel ? x + lx : lx; y = rel ? y + ly : ly; add(x, y); lastC2 = null;
        } else if (C === 'H') {
            var hx = n(); x = rel ? x + hx : hx; add(x, y); lastC2 = null;
        } else if (C === 'V') {
            var vy = n(); y = rel ? y + vy : vy; add(x, y); lastC2 = null;
        } else if (C === 'C') {
            var a1 = n(), b1 = n(), a2 = n(), b2 = n(), ex = n(), ey = n();
            cubic(rel ? x + a1 : a1, rel ? y + b1 : b1,
                  rel ? x + a2 : a2, rel ? y + b2 : b2,
                  rel ? x + ex : ex, rel ? y + ey : ey);
        } else if (C === 'S') {
            var s2 = n(), t2 = n(), sex = n(), sey = n();
            var r1x = lastC2 ? 2 * x - lastC2[0] : x;
            var r1y = lastC2 ? 2 * y - lastC2[1] : y;
            cubic(r1x, r1y, rel ? x + s2 : s2, rel ? y + t2 : t2,
                  rel ? x + sex : sex, rel ? y + sey : sey);
        } else {
            i++;                                    // unreachable for this asset set
        }
    }
    for (var k = 0; k < subs.length; k++) {
        var p = subs[k].pts;
        while (p.length > 1 && dist(p[0], p[p.length - 1]) < 1e-9) { p.pop(); subs[k].closed = true; }
    }
    return subs.filter(function (s) { return s.pts.length > 1; });
}

function pointsAttr(str) {
    var n = (str || '').trim().split(/[\s,]+/).map(parseFloat);
    var pts = [];
    for (var i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]]);
    return pts;
}

function readSvg(svgText, opt) {
    opt = opt || DEFAULTS;
    var styles = parseStyleClasses(svgText);
    var prims = [];

    var elRe = /<(rect|line|circle|path|polygon|polyline)\b[^>]*>/g, m;
    while ((m = elRe.exec(svgText))) {
        var tag = m[0], name = m[1];
        var cls = attrStr(tag, 'class');
        var cs = (cls && styles[cls]) || {};

        var fill = cs.fill;
        var inlineFill = attrStr(tag, 'fill');
        if (inlineFill !== undefined) fill = inlineFill;

        var sw = cs.strokeWidth !== undefined ? cs.strokeWidth : 1.5;
        var inlineSw = attrNum(tag, 'stroke-width', undefined);
        if (inlineSw !== undefined) sw = inlineSw;

        var mat = parseTransform(attrStr(tag, 'transform'));
        var subs = [], closedByDefault = false, isCircle = false;

        if (name === 'line') {
            subs = [{ pts: [[attrNum(tag, 'x1', 0), attrNum(tag, 'y1', 0)],
                            [attrNum(tag, 'x2', 0), attrNum(tag, 'y2', 0)]], closed: false }];
        } else if (name === 'rect') {
            var rx = attrNum(tag, 'x', 0), ry = attrNum(tag, 'y', 0);
            var rw = attrNum(tag, 'width', 0), rh = attrNum(tag, 'height', 0);
            subs = [{ pts: [[rx, ry], [rx + rw, ry], [rx + rw, ry + rh], [rx, ry + rh]], closed: true }];
            closedByDefault = true;
        } else if (name === 'circle') {
            var cx = attrNum(tag, 'cx', 0), cy = attrNum(tag, 'cy', 0), r = attrNum(tag, 'r', 0);
            var N = Math.max(24, Math.min(160, Math.round(2 * Math.PI * r / opt.step)));
            var cpts = [];
            for (var a = 0; a < N; a++) {
                var th = a / N * Math.PI * 2;
                cpts.push([cx + r * Math.cos(th), cy + r * Math.sin(th)]);
            }
            subs = [{ pts: cpts, closed: true }];
            closedByDefault = true; isCircle = true;
        } else if (name === 'polygon' || name === 'polyline') {
            var pp = pointsAttr(attrStr(tag, 'points'));
            var cl = name === 'polygon';
            while (pp.length > 1 && dist(pp[0], pp[pp.length - 1]) < 1e-9) { pp.pop(); cl = true; }
            subs = [{ pts: pp, closed: cl }];
            closedByDefault = name === 'polygon';
        } else if (name === 'path') {
            var dm = tag.match(/\bd="([^"]+)"/);
            subs = dm ? parsePathData(dm[1]) : [];
            closedByDefault = subs.some(function (s) { return s.closed; });
        }

        if (!subs.length) continue;
        for (var si = 0; si < subs.length; si++) {
            subs[si].pts = subs[si].pts.map(function (p) { return applyMatrix(mat, p); });
        }

        // resolveDrawMode, verbatim: an undeclared fill on a closed shape is black.
        var effFill = fill;
        if (effFill === undefined && closedByDefault) effFill = '#000';

        prims.push({
            tag: name, cls: cls, inlineFill: inlineFill, fillColor: effFill,
            filled: effFill !== undefined && effFill !== 'none',
            strokeWidth: sw, subs: subs, isCircle: isCircle
        });
    }

    var texts = [];
    var tRe = /<text\b[^>]*>[\s\S]*?<\/text>/g, tm;
    while ((tm = tRe.exec(svgText))) texts.push(tm[0]);

    var vb = svgText.match(/viewBox="([^"]+)"/);
    var defs = svgText.match(/<defs>[\s\S]*?<\/defs>/);

    return { prims: prims, texts: texts,
             viewBox: vb ? vb[1] : '0 0 32 32',
             defs: defs ? defs[0] : '', styles: styles };
}

// -- Shape roles ------------------------------------------------------------

function nestedPair(subs) {
    if (subs.length !== 2) return null;
    var a = subs[0].pts, b = subs[1].pts;
    var ba = bbox(a), bb = bbox(b);
    function inside(inner, outer) {
        return inner.x0 >= outer.x0 - 0.01 && inner.x1 <= outer.x1 + 0.01 &&
               inner.y0 >= outer.y0 - 0.01 && inner.y1 <= outer.y1 + 0.01;
    }
    if (inside(ba, bb) && polyArea(a) < polyArea(b)) return { outer: b, inner: a };
    if (inside(bb, ba) && polyArea(b) < polyArea(a)) return { outer: a, inner: b };
    return null;
}

/**
 * Recovers what each primitive was actually DRAWING, before any pen effect.
 * See the header for the four roles.
 */
function resolveFigures(prims, opt) {
    var figs = [];

    // A first pass resolves ribbons and rings, because a ribbon's own outline
    // must not also be considered for outline tracing.
    var pre = [];
    for (var i = 0; i < prims.length; i++) {
        var prim = prims[i];
        if (!prim.filled) { pre.push(null); continue; }
        var slot = { pair: null, ribbons: [] };
        slot.pair = nestedPair(prim.subs);
        if (slot.pair) {
            slot.ring = annulusCenterline(slot.pair.outer, slot.pair.inner, opt);
        } else {
            for (var s = 0; s < prim.subs.length; s++) {
                slot.ribbons[s] = detectRibbon(prim.subs[s].pts, opt);
            }
        }
        pre.push(slot);
    }

    for (var p = 0; p < prims.length; p++) {
        var pr = prims[p];
        var common = { cls: pr.cls, prim: pr };

        if (!pr.filled) {
            figs.push({ role: 'stroke', kind: 'source', cls: pr.cls, prim: pr,
                        strokeWidth: opt.penWidth, subs: pr.subs });
            continue;
        }

        // A white disc is a mask (flag, Vcc, node, switch_sch), not ink.
        if (isLight(pr.fillColor)) {
            figs.push({ role: 'mark', kind: 'mask', cls: pr.cls, prim: pr,
                        inlineFill: pr.inlineFill, subs: pr.subs });
            continue;
        }

        var slot2 = pre[p];

        if (slot2 && slot2.pair && slot2.ring && slot2.ring.width > 0) {
            figs.push({ role: 'stroke', kind: 'ring', cls: pr.cls, prim: pr,
                        strokeWidth: opt.penWidth,
                        subs: [{ pts: slot2.ring.pts, closed: true }] });
            continue;
        }

        for (var s2 = 0; s2 < pr.subs.length; s2++) {
            var sub = pr.subs[s2];
            var b = bbox(sub.pts);
            var maxd = Math.max(b.w, b.h);

            var rib = slot2 ? slot2.ribbons[s2] : null;
            if (rib && rib.pts.length > 1) {
                figs.push({ role: 'stroke', kind: 'ribbon', cls: pr.cls, prim: pr,
                            strokeWidth: opt.penWidth,
                            subs: [{ pts: rib.pts, closed: false }] });
                continue;
            }

            if (maxd >= opt.outlineMin) {
                var cor = cornersOf(sub.pts, true, opt.cornerWin, opt.cornerMin);
                if (cor.length >= 3 && cor.length <= opt.outlineMax) {
                    figs.push({ role: 'stroke', kind: 'outline', cls: pr.cls, prim: pr,
                                strokeWidth: opt.penWidth,
                                subs: [{ pts: simplifyToCorners(sub.pts, cor, opt), closed: true }] });
                    continue;
                }
            }

            figs.push({ role: 'mark', kind: 'mark', cls: pr.cls, prim: pr,
                        inlineFill: pr.inlineFill, subs: [sub] });
        }
    }
    return figs;
}

// -- Anchors ----------------------------------------------------------------

/**
 * Snaps pin coordinates onto the traced geometry. For every figure passing
 * within `pinTol` of a pin, a vertex is inserted exactly AT the pin.
 *
 * This runs AFTER resolveFigures on purpose: once arrow's shaft has collapsed
 * from a filled bar to its centreline, the pin has to land on the centreline,
 * not on the outline that no longer exists.
 *
 * Each pin comes back with a role:
 *   'landing'   geometry reaches it, a vertex now sits exactly on it
 *   'hold'      the artwork surrounds it instead of reaching it - a marker
 *               centred on the terminal (flag, intersection, Vcc). It anchors
 *               the taper so the marker cannot drift off the wire, but no
 *               vertex is required or expected.
 *   'unreached' neither: the artwork genuinely stops short of its terminal.
 */
function insertAnchors(figs, pins, opt) {
    opt = opt || DEFAULTS;
    var anchors = [], report = [];

    var all = [];
    for (var g = 0; g < figs.length; g++) all = all.concat(figPoints(figs[g]));
    var hull = all.length ? bbox(all) : null;

    for (var pi = 0; pi < pins.length; pi++) {
        var pin = pins[pi];
        var hits = 0, best = Infinity;

        for (var k = 0; k < figs.length; k++) {
            for (var s = 0; s < figs[k].subs.length; s++) {
                var sub = figs[k].subs[s], pts = sub.pts;
                var bd = Infinity, bi = -1, bt = 0;
                var last = sub.closed ? pts.length : pts.length - 1;
                for (var i = 0; i < last; i++) {
                    var c = closestOnSegment(pin, pts[i], pts[(i + 1) % pts.length]);
                    if (c.d < bd) { bd = c.d; bi = i; bt = c.t; }
                }
                if (bd < best) best = bd;
                if (bi < 0 || bd > opt.pinTol) continue;

                var a = pts[bi], b = pts[(bi + 1) % pts.length];
                if (dist(a, pin) <= opt.pinTol && bt < 0.5) {
                    pts[bi] = [pin[0], pin[1]];
                } else if (dist(b, pin) <= opt.pinTol && bt > 0.5) {
                    pts[(bi + 1) % pts.length] = [pin[0], pin[1]];
                } else {
                    pts.splice(bi + 1, 0, [pin[0], pin[1]]);
                }
                hits++;
            }
        }

        var inside = hull &&
            pin[0] >= hull.x0 - 1 && pin[0] <= hull.x1 + 1 &&
            pin[1] >= hull.y0 - 1 && pin[1] <= hull.y1 + 1;
        var role = hits ? 'landing' : (inside ? 'hold' : 'unreached');

        if (role !== 'unreached') anchors.push([pin[0], pin[1]]);
        report.push({ pin: pin, role: role, matched: hits > 0, hits: hits, distance: best });
    }
    return { anchors: anchors, report: report };
}

// -- The pen ----------------------------------------------------------------

function makeWarp(rand, amp, period) {
    var terms = [];
    for (var k = 0; k < 3; k++) {
        terms.push({
            f: 2 * Math.PI / (period * (1 - k * 0.28)),
            px: rand() * Math.PI * 2,
            py: rand() * Math.PI * 2,
            a: 1 / (k + 1)
        });
    }
    var norm = terms.reduce(function (s, e) { return s + e.a; }, 0) || 1;
    return function (x, y) {
        var dx = 0, dy = 0;
        for (var i = 0; i < terms.length; i++) {
            var e = terms[i];
            dx += e.a * Math.sin(x * e.f + y * e.f * 0.6 + e.px);
            dy += e.a * Math.sin(y * e.f + x * e.f * 0.6 + e.py);
        }
        return [dx / norm * amp, dy / norm * amp];
    };
}

// Distance-to-nearest-pin taper. Euclidean rather than along-path, so any
// geometry near a pin is undistorted no matter which stroke it belongs to -
// which matters where two figures meet at a terminal (dif.svg's arrowhead tip
// and its circle share PIN 0 32).
function makeTaper(anchors, lock) {
    if (!anchors.length || lock <= 0) return function () { return 1; };
    return function (p) {
        var w = 1;
        for (var i = 0; i < anchors.length; i++) {
            var t = smoothstep(dist(p, anchors[i]) / lock);
            if (t < w) w = t;
        }
        return w;
    };
}

function splitAtCorners(sub, angleDeg) {
    var pts = sub.pts, n = pts.length;
    if (n < 2) return [];

    if (sub.closed) {
        var corners = [];
        for (var i = 0; i < n; i++) {
            if (turnAngle(pts[(i - 1 + n) % n], pts[i], pts[(i + 1) % n]) > angleDeg) corners.push(i);
        }
        if (corners.length < 2) return null;        // smooth loop, needs a seam
        var out = [];
        for (var k = 0; k < corners.length; k++) {
            var s = corners[k], e = corners[(k + 1) % corners.length], seg = [], j = s;
            for (;;) { seg.push(pts[j]); if (j === e) break; j = (j + 1) % n; }
            if (seg.length > 1) out.push(seg);
        }
        return out;
    }

    var res = [[pts[0]]];
    for (var q = 1; q < n; q++) {
        res[res.length - 1].push(pts[q]);
        if (q < n - 1 && turnAngle(pts[q - 1], pts[q], pts[q + 1]) > angleDeg) res.push([pts[q]]);
    }
    return res.filter(function (s) { return s.length > 1; });
}

// Opens a smooth loop at the vertex furthest from any pin and lets the pen run
// past its own start, the way a hand-drawn circle closes.
function seamOpen(pts, anchors, overlapDeg) {
    var n = pts.length, bestI = 0, bestD = -1;
    for (var i = 0; i < n; i++) {
        var d = Infinity;
        for (var a = 0; a < anchors.length; a++) d = Math.min(d, dist(pts[i], anchors[a]));
        if (d > bestD) { bestD = d; bestI = i; }
    }
    var extra = Math.max(1, Math.round(n * overlapDeg / 360));
    var out = [];
    for (var k = 0; k <= n + extra; k++) out.push(pts[(bestI + k) % n]);
    return out;
}

function resample(pts, step) {
    var out = [pts[0]];
    for (var i = 1; i < pts.length; i++) {
        var a = pts[i - 1], b = pts[i], L = dist(a, b);
        var parts = Math.max(1, Math.round(L / step));
        for (var k = 1; k <= parts; k++) {
            var t = k / parts;
            out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
    }
    return out;
}

function penStroke(pts, rand, opt, warp, taper, periodic) {
    pts = resample(pts, opt.step);
    var n = pts.length;

    var s = [0];
    for (var i = 1; i < n; i++) s.push(s[i - 1] + dist(pts[i - 1], pts[i]));
    var L = s[n - 1] || 1;

    var oct = [];
    for (var k = 0; k < 3; k++) {
        var base = [1.7, 3.3, 6.1][k] * (0.8 + rand() * 0.4);
        oct.push({
            f: periodic ? Math.max(2, Math.round(base)) : base,
            phase: rand() * Math.PI * 2,
            amp: opt.tremor / Math.pow(k + 1, 1.3)
        });
    }
    var bowAmp = (rand() < 0.5 ? -1 : 1) * opt.bow * Math.min(1.6, L / 48) * (0.5 + rand());

    var out = [];
    for (var j = 0; j < n; j++) {
        var prev = pts[Math.max(0, j - 1)], next = pts[Math.min(n - 1, j + 1)];
        var tx = next[0] - prev[0], ty = next[1] - prev[1];
        var tl = Math.sqrt(tx * tx + ty * ty) || 1;
        var nx = -ty / tl, ny = tx / tl;

        var u = s[j] / L;
        var tremor = 0;
        for (var o = 0; o < oct.length; o++) {
            tremor += oct[o].amp * Math.sin(2 * Math.PI * oct[o].f * u + oct[o].phase);
        }
        // Endpoints move by the warp alone, so anything that met here still meets.
        var fade = periodic ? 1 : smoothstep(Math.min(s[j], L - s[j]) / opt.edgeFade);
        var bow = periodic ? 0 : bowAmp * Math.sin(Math.PI * u);

        var w = taper(pts[j]);
        var wv = warp(pts[j][0], pts[j][1]);
        var off = (bow + tremor * fade) * w;

        out.push([pts[j][0] + wv[0] * w + nx * off, pts[j][1] + wv[1] * w + ny * off]);
    }

    if (!periodic) {
        addOvershoot(out, pts, taper, rand, opt, true, L);
        addOvershoot(out, pts, taper, rand, opt, false, L);
    }
    return out;
}

function addOvershoot(out, src, taper, rand, opt, atEnd, strokeLen) {
    var n = out.length;
    var tipSrc = atEnd ? src[src.length - 1] : src[0];
    if (taper(tipSrc) < 0.95) return;               // a terminal: the pen stops dead
    if (rand() > opt.overshootP) return;

    var tip = atEnd ? out[n - 1] : out[0];
    var prev = atEnd ? out[n - 2] : out[1];
    if (!prev) return;
    var dx = tip[0] - prev[0], dy = tip[1] - prev[1];
    var l = Math.sqrt(dx * dx + dy * dy);
    if (!l) return;

    var curl = (rand() - 0.5) * 12 * Math.PI / 180;
    var cs = Math.cos(curl), sn = Math.sin(curl);
    var ux = (dx / l) * cs - (dy / l) * sn;
    var uy = (dx / l) * sn + (dy / l) * cs;
    // Cap it against the stroke's own length: a fixed 1u run past the end of a
    // 5u stub (nmos has several) reads as a mistake, not as a confident hand.
    var o = Math.min(opt.overshoot, strokeLen * 0.15) * (0.35 + rand() * 0.65);
    var pt = [tip[0] + ux * o, tip[1] + uy * o];

    if (atEnd) out.push(pt); else out.unshift(pt);
}

// A mark rides the warp, plus a slight rigid rotation when it is small and a
// little irregularity around its outline.
function penMark(pts, closed, rand, opt, warp, taper, anchors) {
    var box = bbox(pts);
    var out = pts;

    if (Math.max(box.w, box.h) < opt.rotateBelow && opt.rotateMax > 0) {
        var pivot = null;
        for (var a = 0; a < anchors.length && !pivot; a++) {
            for (var i = 0; i < pts.length; i++) {
                if (dist(pts[i], anchors[a]) < 1e-9) { pivot = anchors[a]; break; }
            }
        }
        if (!pivot) pivot = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
        var ang = (rand() - 0.5) * 2 * opt.rotateMax * Math.PI / 180;
        var cs = Math.cos(ang), sn = Math.sin(ang);
        out = pts.map(function (p) {
            var dx = p[0] - pivot[0], dy = p[1] - pivot[1];
            return [pivot[0] + dx * cs - dy * sn, pivot[1] + dx * sn + dy * cs];
        });
    }

    // The warp is smooth over tens of units, so across an 8-unit junction dot it
    // is very nearly a constant: the dot just slides, and stays a flawless
    // circle, which is the one thing that gives the whole drawing away. This
    // walks the outline instead, so a filled mark comes out slightly off-round.
    // Harmonics are whole numbers of turns so the contour still closes, and the
    // amplitude is capped against the mark's own size - a 1-unit minus glyph
    // gets a nudge, not a mangling.
    // Capped against the mark's own INK width (2*area/perimeter), not its
    // bounding box: a plus glyph is 9x9 but its arms are one unit across, and
    // that is the dimension a wobble would eat into.
    var perim = pathLength(pts, true);
    var inkWidth = perim ? 2 * polyArea(pts) / perim : 0;
    var amp = Math.min(opt.markWobble, 0.25 * inkWidth);
    if (closed && amp > 0.001 && out.length > 6) {
        var n = out.length, oct = [];
        for (var k = 0; k < 2; k++) {
            oct.push({
                f: 2 + k + Math.floor(rand() * 3),
                phase: rand() * Math.PI * 2,
                amp: amp / (k + 1)
            });
        }
        out = out.map(function (p, i) {
            var prev = out[(i - 1 + n) % n], next = out[(i + 1) % n];
            var tx = next[0] - prev[0], ty = next[1] - prev[1];
            var tl = Math.sqrt(tx * tx + ty * ty) || 1;
            var u = i / n, d = 0;
            for (var o = 0; o < oct.length; o++) {
                d += oct[o].amp * Math.sin(2 * Math.PI * oct[o].f * u + oct[o].phase);
            }
            return [p[0] + (-ty / tl) * d, p[1] + (tx / tl) * d];
        });
    }

    return out.map(function (p) {
        var w = taper(p), wv = warp(p[0], p[1]);
        return [p[0] + wv[0] * w, p[1] + wv[1] * w];
    });
}

// -- Emit -------------------------------------------------------------------

function fmt(v, prec) {
    var r = +v.toFixed(prec);
    return Object.is(r, -0) ? '0' : String(r);
}

function toPathData(pts, closed, prec) {
    var d = 'M' + fmt(pts[0][0], prec) + ' ' + fmt(pts[0][1], prec);
    for (var i = 1; i < pts.length; i++) d += 'L' + fmt(pts[i][0], prec) + ' ' + fmt(pts[i][1], prec);
    return closed ? d + 'Z' : d;
}

/**
 * The whole pipeline. `pins` are `.asy` PIN coordinates as [[x,y], ...].
 * Returns the roughened SVG plus the pin report and the raw stroke list.
 */
function roughen(svgText, options) {
    var opt = {};
    for (var k in DEFAULTS) opt[k] = DEFAULTS[k];
    for (var k2 in (options || {})) if (options[k2] !== undefined) opt[k2] = options[k2];

    var doc = readSvg(svgText, opt);
    var figs = resolveFigures(doc.prims, opt);
    var pins = options && options.pins ? options.pins : [];
    var res = insertAnchors(figs, pins, opt);

    var seedStr = String((options && options.seed) || 'seed');
    var rand = mulberry32(fnv1a(seedStr));
    var warp = makeWarp(rand, opt.warp, opt.warpPeriod);
    var taper = makeTaper(res.anchors, opt.lock);

    var strokes = [];
    for (var p = 0; p < figs.length; p++) {
        var fig = figs[p];

        for (var s = 0; s < fig.subs.length; s++) {
            var sub = fig.subs[s];
            var r2 = mulberry32(fnv1a(seedStr + '|' + p + '|' + s));

            if (fig.role === 'mark') {
                strokes.push({ fig: fig, closed: sub.closed,
                               pts: penMark(sub.pts, sub.closed, r2, opt, warp, taper, res.anchors) });
                continue;
            }

            var pieces = splitAtCorners(sub, opt.cornerAngle);
            if (pieces === null) {                  // smooth loop: one sweep with a seam
                strokes.push({ fig: fig, closed: false,
                               pts: penStroke(seamOpen(sub.pts, res.anchors, opt.seamOverlap),
                                              r2, opt, warp, taper, true) });
                continue;
            }
            for (var q = 0; q < pieces.length; q++) {
                strokes.push({ fig: fig, closed: false,
                               pts: penStroke(pieces[q], r2, opt, warp, taper, false) });
            }
        }
    }

    return { svg: emit(doc, strokes, opt), strokes: strokes, doc: doc,
             figures: figs, pins: res };
}

function emit(doc, strokes, opt) {
    var body = strokes.map(function (st) {
        var f = st.fig, attrs = '';
        if (f.cls) attrs += ' class="' + f.cls + '"';
        if (f.role === 'mark') {
            if (f.inlineFill !== undefined) attrs += ' fill="' + f.inlineFill + '"';
        } else {
            attrs += ' fill="none"';                // never let a stray Z blob it black
            attrs += ' stroke="' + opt.ink + '"';    // one pen, one colour
            if (f.strokeWidth !== undefined) attrs += ' stroke-width="' + fmt(f.strokeWidth, 2) + '"';
        }
        return '  <path' + attrs + ' d="' + toPathData(st.pts, st.closed, opt.precision) + '"/>';
    }).join('\n');

    var texts = doc.texts.length ? '\n  ' + doc.texts.join('\n  ') : '';
    return '<?xml version="1.0" encoding="UTF-8"?>\n'
        + '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="' + doc.viewBox + '">\n'
        + (doc.defs ? '  ' + doc.defs + '\n' : '')
        + body + texts + '\n</svg>\n';
}

function strokesBBox(strokes) {
    var all = [];
    for (var i = 0; i < strokes.length; i++) all = all.concat(strokes[i].pts);
    return bbox(all);
}

return {
    DEFAULTS: DEFAULTS,
    fnv1a: fnv1a, mulberry32: mulberry32, smoothstep: smoothstep,
    dist: dist, bbox: bbox, figPoints: figPoints, primPoints: figPoints,
    strokesBBox: strokesBBox, closestOnSegment: closestOnSegment,
    turnAngle: turnAngle, polyArea: polyArea, pathLength: pathLength,
    cornersOf: cornersOf, detectRibbon: detectRibbon,
    annulusCenterline: annulusCenterline, nestedPair: nestedPair,
    resolveFigures: resolveFigures, resampleTo: resampleTo,
    parseStyleClasses: parseStyleClasses, parseTransform: parseTransform,
    parsePathData: parsePathData, readSvg: readSvg,
    insertAnchors: insertAnchors, makeWarp: makeWarp, makeTaper: makeTaper,
    splitAtCorners: splitAtCorners, seamOpen: seamOpen, resample: resample,
    penStroke: penStroke, penMark: penMark,
    toPathData: toPathData, roughen: roughen, emit: emit
};
})();

export default RoughPen;
