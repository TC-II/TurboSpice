import { t } from '../i18n/i18n.ts';

/** El error de carga de un motor (Yosys o Icarus) indica que sus archivos no están en el servidor */
export function engineMissing(msg: string): boolean {
  return /Failed to fetch dynamically imported module|HTTP 404/i.test(msg);
}

/** Texto para el usuario cuando el motor de Verilog (`behavioral`: Icarus; si no, Yosys) no pudo correr */
export function engineErrorText(msg: string, behavioral: boolean): string {
  if (engineMissing(msg)) return behavioral ? t('The Icarus engine is not installed on this server') : t('The Yosys engine is not installed on this server');
  return behavioral ? t('Icarus could not run: {msg}', { msg }) : t('Yosys could not run: {msg}', { msg });
}
