// Tipos de tests/corpus/compare.mjs para importarlo desde los tests unitarios
export declare function readNet(path: string): string;
export declare function normalizeLtspice(text: string): string;
export declare function compareNetlists(ref: string, ours: string): { exact: boolean; equivalent: boolean; reason?: string };
