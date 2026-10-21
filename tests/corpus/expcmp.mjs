import { readFileSync } from "node:fs";
const load = (f) => { const m = new Map(); for (const r of JSON.parse(readFileSync(f, "utf8"))) if (r.hasSim) m.set(r.id, r.sim); return m; };
const vars = ["base", "rshunt", "tmax", "ambos"];
const maps = Object.fromEntries(vars.map((v) => [v, load(`r_${v}.json`)]));
const ids = [...maps.base.keys()];
const tally = (m) => { const o = {}; for (const s of m.values()) o[s] = (o[s] || 0) + 1; return o; };
console.log("esquematicos comparados:", ids.length);
for (const v of vars) console.log(String(v).padEnd(8), JSON.stringify(tally(maps[v])));
const score = (s) => (s === "igual" ? 3 : s === "parecido" || s === "parecido-forma" ? 2 : s === "distinto" ? 1 : 0);
const cnt = (s) => /igual|parecido/.test(s);
console.log("\n-- simulan igual o parecido --");
for (const v of vars) console.log(String(v).padEnd(8), ids.filter((i) => cnt(maps[v].get(i) ?? "")).length);
console.log("\n-- cambia el estado respecto de base --");
const diff = {};
for (const i of ids) for (const v of vars.slice(1)) if (maps[v].get(i) !== maps.base.get(i)) { const k = `${maps.base.get(i)} -> ${maps[v].get(i)}`; diff[k] = (diff[k] || 0) + 1; }
for (const [k, v] of Object.entries(diff).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log("  " + String(v).padStart(4) + "  " + k);
