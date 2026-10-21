import { readFileSync, existsSync } from 'node:fs';
const S = process.argv[2];
const r = JSON.parse(readFileSync(S + '/report.json', 'utf8'));
const asc = {}, ltn = {};
const txt = c => asc[c.src] ??= (existsSync(c.src) ? ((b)=>b.includes(0)?b.toString('utf16le'):b.toString('latin1'))(readFileSync(c.src)) : '');
const net = c => { if (ltn[c.id] === undefined) { const p = `${S}/res/${c.id}.ts.json`; ltn[c.id] = existsSync(p) ? (JSON.parse(readFileSync(p,'utf8')).ltNet ?? '') : ''; } return ltn[c.id]; };
const log = c => [...(c.errors??[]), ...(c.logTail??[])].join('\n');
const miss = c => (c.missing ?? []).join('\n');
const T = {
  startup: c => /^TEXT .*!\.tran\b[^\n]*\bstartup/im.test(txt(c)),
  flotante: c => /singular matrix|floating|no dc path|gmin stepping failed|source stepping failed/i.test(log(c)),
  icFlotante: c => /^SYMATTR (Value|Value2|SpiceLine) .*\bIC=/im.test(txt(c)) && !/\.tran[^\n]*\buic/i.test(txt(c)),
  temp: c => /^FLAG -?\d+ -?\d+ (temp|temper)\s*$/im.test(txt(c)),
  cd4046: c => /CD4046B/i.test(txt(c)),
  digital: c => /^SYMBOL Digital\\|charge_pump/im.test(txt(c)) || (c.missing ?? []).some(m => /^Digital\\/i.test(m)),
  universal: c => /UniversalOpAmp/i.test(txt(c)),
  incompleto: c => c.sim === 'incompleto',
  p001: c => /\bP\d{3}\b/.test(net(c)),
  laplace: c => /laplace\s*=/i.test(txt(c)),
};
for (const [k, f] of Object.entries(T)) {
  const m = r.filter(f), src = new Set(m.map(c => c.src)), sim = m.filter(c => c.hasSim);
  const cls = {}; for (const c of sim) cls[c.sim] = (cls[c.sim]||0)+1;
  const g = {}; for (const c of m) g[c.group] = (g[c.group]||0)+1;
  console.log(k, JSON.stringify({ casos: m.length, asc: src.size, conSim: sim.length, ltOk: sim.filter(c=>c.ltOk).length, errTsLtOk: sim.filter(c=>c.ltOk&&c.sim==='error-ts').length, cls, g }));
}
