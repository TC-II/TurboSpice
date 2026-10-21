import { readFileSync, existsSync } from 'node:fs';
const S = process.argv[2];
const r = JSON.parse(readFileSync(S + '/report.json', 'utf8'));
const m = new Map(); const files = new Set();
for (const c of r) {
  if (!c.hasSim) continue;
  const p = `${S}/res/${c.id}.ts.json`; if (!existsSync(p)) continue;
  const t = JSON.parse(readFileSync(p, 'utf8'));
  const names = new Set();
  for (const l of t.log ?? []) for (const g of l.matchAll(/can't find model '([^']+)'/g)) names.add(g[1].toUpperCase());
  for (const w of t.warnings ?? []) for (const g of w.matchAll(/no se encontró el modelo(?: base)? "?([\w.\-+]+)/g)) names.add(g[1].toUpperCase());
  for (const n of names) { if (!m.has(n)) m.set(n, { files: new Set(), ltOk: new Set() }); m.get(n).files.add(c.src); if (c.ltOk) m.get(n).ltOk.add(c.src); files.add(c.src); }
}
const rows = [...m].sort((a, b) => b[1].files.size - a[1].files.size);
console.log(rows.length, 'modelos en', files.size, 'archivos');
console.log(rows.map(([n, v]) => `${n} ${v.files.size}/${v.ltOk.size}`).join(' · '));
const names = (dir) => { const s = new Map(); for (const f of ['bjt','dio','jft','mos','cap','ind','res','bead']) { const p = `${dir}/standard.${f}`; if (!existsSync(p)) continue; for (const g of readFileSync(p, 'latin1').matchAll(/^\s*\.model\s+(\S+)/gim)) s.set(g[1].toUpperCase(), f); } return s; };
const LT = names('C:/Users/TC2/AppData/Local/LTspice/lib/cmp'), TS = names('C:/_DATA/ITBA/Repositorios GitHub/TurboSpice/library/cmp');
const cmp = rows.filter(([n]) => LT.has(n) && !TS.has(n));
const cf = new Set(cmp.flatMap(([, v]) => [...v.files]));
console.log('\nEN LTspice/cmp Y NO EN library/cmp:', cmp.length, 'modelos en', cf.size, 'archivos');
console.log(cmp.map(([n, v]) => `${n}|${LT.get(n)}|${v.files.size}`).join('\n'));
const inTs = rows.filter(([n]) => TS.has(n)); console.log('\nYA EN library/cmp pero no encontrados:', inTs.map(([n, v]) => n + ' ' + v.files.size).join(' · '));
const junk = (n) => !/^[A-Z0-9][\w\-\/]*[A-Z0-9]$/.test(n) || /^[0-9A-F]{2}$/.test(n) || /^(N\d+|R|C|VCC|VDD|OR|AND|XOR|DFLOP|TCLIB|ANT|INT|VGA)$/.test(n);
const isFile = (n) => /\.(LIB|SUB|MOD|CIR|TXT|INC|FAM|BOYLE|\d+)$/.test(n);
const ok = rows.filter(([n, v]) => v.ltOk.size && !junk(n));
const okM = ok.filter(([n]) => !isFile(n)), okF = ok.filter(([n]) => isFile(n));
const both = rows.filter(([n, v]) => !v.ltOk.size && !junk(n) && !isFile(n));
const fs = (l) => new Set(l.flatMap(([, v]) => [...v.ltOk])).size;
console.log('\nOK_MODELOS', okM.length, fs(okM)); console.log(okM.map(([n, v]) => `${n} ${v.ltOk.size}`).join(' · '));
console.log('\nOK_ARCHIVOS', okF.length, fs(okF)); console.log(okF.map(([n, v]) => `${n} ${v.ltOk.size}`).join(' · '));
console.log('\nAMBOS', both.length, new Set(both.flatMap(([, v]) => [...v.files])).size); console.log(both.slice(0, 30).map(([n, v]) => `${n} ${v.files.size}`).join(' · '));
