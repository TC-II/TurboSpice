// Raíces del árbol de subcircuitos de la jerarquía

/**
 * Las raíces: los subcircuitos que no usa ningún otro. Los que quedan sin alcanzar desde ninguna
 * raíz (un ciclo A→B→A o A→A, que puede entrar por un .turbo, un zip o un link) también son raíz,
 * el primero de cada ciclo, para que no desaparezcan del árbol y se puedan abrir a arreglar.
 */
export function treeRoots<T extends { name: string; children: string[] }>(subs: T[]): T[] {
  const byName = new Map(subs.map((s) => [s.name.toLowerCase(), s]));
  const nested = new Set(subs.flatMap((s) => s.children.map((c) => c.toLowerCase())));
  const roots = subs.filter((s) => !nested.has(s.name.toLowerCase()));
  const reached = new Set<string>();
  const reach = (s: T) => {
    const k = s.name.toLowerCase();
    if (reached.has(k)) return;
    reached.add(k);
    for (const c of s.children) {
      const child = byName.get(c.toLowerCase());
      if (child) reach(child);
    }
  };
  roots.forEach(reach);
  for (const s of subs) {
    if (reached.has(s.name.toLowerCase())) continue;
    roots.push(s);
    reach(s);
  }
  return roots;
}
