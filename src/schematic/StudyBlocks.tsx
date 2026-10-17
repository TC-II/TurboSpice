// Editor de bloques del Estudio (Blockly): se carga aparte, sólo al abrir la pestaña.
import type { Study } from '../sim/study.ts';
import type { StudyInfo } from './StudyPanel.tsx';

export default function StudyBlocks(_: { study: Study; info: StudyInfo; onChange(st: Study): void }) {
  return <p className="empty pad">El editor de bloques todavía no está disponible.</p>;
}
