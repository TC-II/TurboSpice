// Categorías del buscador de componentes (P): cada una con sus subcategorías y, en cada subcategoría,
// los símbolos de la biblioteca en el orden en que se muestran (el común antes que sus variantes).
// Un símbolo puede estar en más de una; su categoría principal (el chip de los resultados de la
// búsqueda) es la primera en la que aparece, sin contar Básicos. Un patrón con * (sky130/nfet_*)
// toma todos los que coinciden, en orden alfabético. Las carpetas ocultas (OpAmps sin modelo,
// Characters) y los símbolos de HIDDEN_SYMBOLS no van en ninguna: se ven sólo en «Todos». Los símbolos del proyecto y los del
// usuario van solos a «Mis componentes». tests/unit/categories.test.ts avisa si un símbolo de la
// biblioteca queda sin categoría.
import { t } from '../i18n/i18n.ts';
import { PROJECT_DIR, USER_DIR } from './library.ts';

export interface Subcategory {
  id: string;
  label: string;
  /** rutas de la biblioteca (TCLib/OA_Ideal) o patrones con * */
  items: string[];
}
export interface Category {
  id: string;
  label: string;
  subs: Subcategory[];
}

const TC = 'TCLib/';
const SP = 'TCLib/Special/';
const sub = (id: string, label: string, items: string[]): Subcategory => ({ id, label, items });
const dsp = (names: string) => names.split(' ').map((n) => `DSP/dsp_${n}`);
const pdk = (pdkName: string, subs: [string, string, string[]][]) => subs.map(([id, kind, items]) => sub(`${pdkName}-${id}`, `${pdkName} · ${kind}`, items.map((i) => `${pdkName}/${i}`)));

/** Símbolos sueltos que no van en ninguna categoría ni salen al buscar: se ven sólo recorriendo «Todos» */
export const HIDDEN_SYMBOLS = ['npn2', 'npn3', 'pnp2'];

export const BASICS = 'basics';
export const MINE = 'mine';
export const PDK = 'pdk';

export const CATEGORIES: Category[] = [
  {
    id: BASICS,
    label: t('Basics'),
    subs: [
      sub('passives', t('Passives'), ['res', 'cap', 'ind', `${TC}pot`]),
      sub('semis', t('Semiconductors'), ['diode', 'zener', 'npn', 'pnp', 'nmos', 'pmos', 'nm_ic', 'pm_ic', 'njf', 'pjf']),
      sub('sources', t('Sources'), ['voltage', 'current', 'signal', `${TC}square`, `${TC}triangular`, `${TC}Vcc`, `${TC}supply`, 'cell']),
      sub('amps', t('Amplifiers and switches'), [`${TC}OA_Ideal`, `${TC}switch`, `${SP}bypass`]),
    ],
  },
  {
    id: 'passives',
    label: t('Passives'),
    subs: [
      sub('resistors', t('Resistors'), ['res', 'res2', 'Misc/EuropeanResistor', `${TC}pot`, `${SP}res_rec`, `${SP}res_45`, `${SP}res_45_spring`, `${SP}res_60`, `${SP}res_60_spring`, `${SP}res_spring`, `${SP}res_pipe`]),
      sub('capacitors', t('Capacitors'), ['cap', 'polcap', 'Misc/EuropeanPolcap']),
      sub('inductors', t('Inductors and transformers'), ['ind', 'ind2', 'Misc/fixedind', `${SP}L_Tap`, `${TC}PowerElectronics/transformer1`, `${TC}PowerElectronics/transformer2`]),
      sub('crystals', t('Crystals'), ['xtal', `${SP}xtal_`]),
      sub('lines', t('Transmission lines'), ['tline', 'ltline', 'Misc/urc2']),
      sub('ideal', t('Ideal elements'), [`${SP}gyrator`, `${SP}fdnr`]),
      sub('other', t('Others'), ['Misc/xvaristor', `${SP}lamp`, 'Misc/neonbulb']),
    ],
  },
  {
    id: 'semis',
    label: t('Semiconductors'),
    subs: [
      sub('diodes', t('Diodes'), ['diode', 'zener', 'schottky', 'LED', 'TVSdiode', 'varactor', `${SP}diode_45`]),
      sub('bjt', t('BJT'), ['npn', 'npn4', 'pnp', 'pnp4', 'lpnp', `${TC}NPN_ideal`, `${TC}PNP_ideal`]),
      sub('mosfet', t('MOSFET'), ['nmos', 'pmos', 'nmos4', 'pmos4', 'nm_ic', 'nm_ic_4', 'pm_ic', 'pm_ic_4', 'agnostic_mos_ic']),
      sub('jfet', t('JFET and MESFET'), ['njf', 'pjf', 'mesfet']),
      sub('power', t('Power'), [`${TC}PowerElectronics/BUZ80A`, `${TC}Darlington_Triac/TIP110`, `${TC}Darlington_Triac/TIP115`, `${TC}Darlington_Triac/Dnpn`, `${TC}Darlington_Triac/Dpnp`, 'Misc/NIGBT', 'Misc/PIGBT']),
      sub('thyristors', t('Thyristors'), ['Misc/SCR', 'Misc/TRIAC', 'Misc/DIAC', `${TC}Darlington_Triac/BT_TRIAC`]),
      sub('tubes', t('Vacuum tubes'), ['Misc/triode', 'Misc/tetrode', 'Misc/pentode']),
    ],
  },
  {
    id: 'sources',
    label: t('Sources'),
    subs: [
      sub('voltage', t('Voltage'), ['voltage', 'voltage2', `${TC}Vcc`, `${TC}supply`, 'cell', 'Misc/battery', `${TC}v_cell`]),
      sub('current', t('Current'), ['current', 'load', 'load2']),
      sub('signals', t('Signals'), ['signal', `${TC}square`, `${TC}triangular`, `${TC}PLL/RBS`, `${TC}PLL/FSK`]),
      sub('controlled', t('Controlled'), ['e', 'e2', 'f', 'g', 'g2', 'h', 'Misc/Epoly', 'Misc/Gpoly', `${TC}Amp_Current`, `${TC}Amp_Transimpedance`]),
      sub('behavioral', t('Behavioral'), ['bv', 'bi', 'bi2']),
    ],
  },
  {
    id: 'analog',
    label: t('Analog'),
    subs: [
      sub('ideal-opamps', t('Ideal op amps'), [
        `${TC}OA_Ideal`,
        `${TC}OA_param`,
        `${TC}OA_param2`,
        `${SP}OA_Signal`,
        `${SP}OA_Signal2`,
        `${SP}Gain_Block`,
        `${SP}Black_Box`,
        `${SP}dif`,
        `${SP}OA_Box`,
        `${SP}OA_Yiu`,
        `${SP}OA_escaleno`,
      ]),
      sub('opamps', t('Commercial op amps'), [`${TC}LM741`, `${TC}LM324`, `${TC}LMX24`, `${TC}LM833`, `${TC}TL072`, `${TC}TL082`]),
      sub('comparators', t('Comparators'), [`${TC}Ideal_Comp`, `${TC}LM311`]),
      sub('sh', t('Sample and hold'), [`${TC}LF398`, `${TC}ASSD/ASSD_LF398`, 'SpecialFunctions/sample']),
      sub('switches', t('Switches'), [`${TC}switch`, 'sw', 'csw', `${TC}ASSD/ASSD_CD4016B`]),
      sub('regulators', t('Regulators'), ['7805', '7812', '7815', '7905', 'LM317', 'LM337'].map((n) => `${TC}Regulators/${n}`)),
      sub('pll', t('PLL'), [`${TC}PLL/CD4046B`, `${TC}PLL/VCO`, `${TC}PLL/Phase_Comp_XOR`, `${TC}PLL/Phase_Comp_Type3`, 'Digital/phidet', `${TC}PLL/Charge_Pump`, `${TC}PLL/Charge_Pump_Current`, `${TC}PLL/RBS`, `${TC}PLL/FSK`]),
      sub('special', t('Modulators and special functions'), ['SpecialFunctions/modulate', 'SpecialFunctions/modulate2', 'SpecialFunctions/varistor']),
    ],
  },
  {
    id: 'digital',
    label: t('Digital'),
    subs: [
      sub('gates', t('Gates'), ['Digital/and', 'Digital/or', 'Digital/xor', 'Digital/inv', 'Digital/buf', 'Digital/buf1', `${SP}74HCU04 Not`]),
      sub('schmitt', t('Schmitt triggers'), ['Digital/schmitt', 'Digital/schmtbuf', 'Digital/schmtinv', 'Digital/diffschmitt', 'Digital/diffschmtbuf', 'Digital/diffschmtinv']),
      sub('flipflops', t('Flip-flops and counters'), ['Digital/dflop', 'Digital/srflop', 'Digital/counter']),
      sub('phase', t('Phase detectors'), ['Digital/phidet', `${TC}PLL/Phase_Comp_XOR`, `${TC}PLL/Phase_Comp_Type3`]),
    ],
  },
  {
    id: 'dsp',
    label: t('DSP'),
    subs: [
      sub('generators', t('Generators'), dsp('clock const step impulse ramp nco lfsr')),
      sub('conversion', t('Conversion'), dsp('adc dac sdm pwm requant')),
      sub('arithmetic', t('Arithmetic'), dsp('add sub sum4 neg abs mul div sqrt mac cmul tap minmax cmp cordic magphase')),
      sub('filters', t('Filters'), dsp('fir8 biquad cic movavg integrator diff envelope')),
      sub('multirate', t('Multirate'), dsp('upsample downsample clkdiv')),
      sub('bits', t('Bits and logic'), dsp('and or xor not mask shift rotate bitrev popcount clz parity prienc decoder bin2gray gray2bin split join')),
      sub('memory', t('Memory and control'), dsp('delay shiftreg piso fifo ram mux2 mux4 demux2 counter edge oneshot debounce sync')),
    ],
  },
  {
    id: 'measure',
    label: t('Measurement'),
    subs: [sub('stability', t('Stability'), ['Stability/LoopProbe', 'Stability/LoopProbe_Dif', 'Stability/Balun']), sub('instruments', t('Instruments'), [`${SP}ampmeter`])],
  },
  {
    id: PDK,
    label: t('PDK'),
    subs: [
      ...pdk('sky130', [
        ['mosfet', t('MOSFET'), ['nfet_*', 'pfet_*']],
        ['bjt', t('BJT'), ['npn_*', 'pnp_*']],
        ['diodes', t('Diodes'), ['diode_*']],
        ['resistors', t('Resistors'), ['res_*']],
        ['capacitors', t('Capacitors'), ['cap_*']],
        ['esd', t('ESD and special'), ['esd_*', 'special_*']],
      ]),
      ...pdk('gf180', [
        ['mosfet', t('MOSFET'), ['nfet_*', 'pfet_*']],
        ['bjt', t('BJT'), ['npn_*', 'pnp_*']],
        ['diodes', t('Diodes'), ['diode_*']],
        ['resistors', t('Resistors'), ['nplus_*', 'ppolyf_*']],
        ['capacitors', t('Capacitors'), ['cap_*']],
      ]),
    ],
  },
  {
    id: 'drawing',
    label: t('Drawing'),
    subs: [
      sub('arrows', t('Arrows'), [`${SP}arrow`, `${SP}arrow_Z`, `${SP}arrow_Z2`, `${SP}arrow_curve`]),
      sub('rotated', t('Rotated and styled'), [`${SP}res_45`, `${SP}res_45_spring`, `${SP}res_60`, `${SP}res_60_spring`, `${SP}res_spring`, `${SP}res_pipe`, `${SP}res_rec`, `${SP}diode_45`]),
      sub('other', t('Others'), [`${SP}node`, `${SP}switch_sch`, `${SP}bypass`, 'agnostic_mos_ic']),
    ],
  },
];

/** Dónde está un símbolo: categoría y subcategoría */
export interface Placement {
  cat: Category;
  sub: Subcategory;
}

/** Una sección de la lista de una categoría: la subcategoría y sus símbolos, en orden */
export interface Section {
  sub: Subcategory;
  paths: string[];
}

export interface Classification {
  /** las categorías que se muestran (Mis componentes, sólo si hay alguno) */
  categories: Category[];
  sections(catId: string): Section[];
  /** todas sus ubicaciones, en el orden de las categorías (Básicos primero) */
  placements(path: string): Placement[];
  /** la primera sin contar Básicos */
  primary(path: string): Placement | undefined;
  /** posición en el orden curado (Básicos primero); los que no están en ninguna, al final */
  order(path: string): number;
}

const globRe = (g: string) => new RegExp(`^${g.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`);

/** Reparte las rutas de la biblioteca (Library.symbolPaths) en las categorías */
export function classify(paths: string[], categories: Category[] = CATEGORIES): Classification {
  const have = new Set(paths);
  const mine: Category = {
    id: MINE,
    label: t('My components'),
    subs: [sub('project', PROJECT_DIR, paths.filter((p) => p.startsWith(`${PROJECT_DIR}/`))), sub('user', USER_DIR, paths.filter((p) => p.startsWith(`${USER_DIR}/`)))].filter(
      (s) => s.items.length,
    ),
  };
  const cats = mine.subs.length ? [...categories, mine] : categories;
  const sections = new Map<string, Section[]>();
  const where = new Map<string, Placement[]>();
  const order = new Map<string, number>();
  for (const cat of cats) {
    const list: Section[] = [];
    for (const s of cat.subs) {
      const found: string[] = [];
      for (const item of s.items) {
        if (item.includes('*')) {
          const re = globRe(item);
          found.push(...paths.filter((p) => re.test(p)));
        } else if (have.has(item)) found.push(item);
      }
      const unique = [...new Set(found)];
      if (!unique.length) continue;
      list.push({ sub: s, paths: unique });
      for (const p of unique) {
        where.set(p, [...(where.get(p) ?? []), { cat, sub: s }]);
        if (!order.has(p)) order.set(p, order.size);
      }
    }
    sections.set(cat.id, list);
  }
  return {
    categories: cats.filter((c) => sections.get(c.id)?.length),
    sections: (id) => sections.get(id) ?? [],
    placements: (p) => where.get(p) ?? [],
    primary: (p) => {
      const all = where.get(p) ?? [];
      return all.find((w) => w.cat.id !== BASICS) ?? all[0];
    },
    order: (p) => order.get(p) ?? Infinity,
  };
}
