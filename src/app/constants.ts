// Constantes de la app: claves de almacenamiento, ejemplos de public/examples y nombres de vistas
import { t } from '../i18n/i18n.ts';

/** Resultados más grandes que esto no se guardan en el navegador al simular */
export const MAX_CACHED_BYTES = 256 * 1024 ** 2;

/** Nombre de un proyecto nuevo; con sesión de Google pasa a «Project 2», «Project 3»… si ya está en el Drive */
export const DEFAULT_PROJECT = 'Project';
export const DEFAULT_NAME = /^project( \d+)?$/i;

export const BASE = import.meta.env.BASE_URL;
export const REPO = 'https://github.com/TC-II/TurboSpice';
/** El skin de los símbolos elegido en Configuración (#329) */
export const SKIN_KEY = 'turbospice.skin';
/** La letra del esquemático elegida en Configuración (#328) */
export const SCH_FONT_KEY = 'turbospice.schFont';
// public/examples (scripts/make-examples.ts): el proyecto de muestra, que se abre la primera vez
export const SAMPLE = 'Sample Project.turbo';
/** simulación mixta (#209, scripts/make-adc.ts): un workbench por ADC, una sola entrada en el menú */
export const ADC = 'ADC.turbo';
/** las transferencias de 1er y 2do orden con RC y RLC: un workbench cada una (scripts/make-examples.ts) */
export const TRANSFER = 'Transfer functions.turbo';
/** emisor común, degenerado, colector común y base común, BJT contra MOSFET (scripts/make-examples.ts) */
export const AMPS = 'Transistor amplifiers.turbo';
/** ganancia de lazo (.stb) con la sonda simple y la diferencial (scripts/make-examples.ts) */
export const STABILITY = 'Loop stability.turbo';
/** transistores del PDK sky130 en varias esquinas (scripts/make-examples.ts, docs/pdk.md) */
export const SKY130 = 'sky130.turbo';
export const GF180 = 'gf180.turbo';

/** Nombre de cada vista del panel de resultados (en el botón Resultados) */
export const PANEL_NAMES = { plot: t('Plot'), netlist: 'Netlist', log: 'Log', problems: t('Errors'), meas: t('Measurements') };
