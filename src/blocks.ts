import * as Blockly from 'blockly';
import { javascriptGenerator } from 'blockly/javascript';
import { COLORS } from './colors';
import { API_NAMES } from './runner';

const MOVE = '#4c97ff';
const MINE = '#a0703c';
const LOOP = '#ffab19';
const LOGIC = '#9966ff';
const PEN = '#0fbd8c';

const statement = { previousStatement: null, nextStatement: null };

const CONDITION = {
  type: 'field_dropdown',
  name: 'COND',
  options: [
    ['je vpredu cesta', 'jeCestaVpredu'],
    ['je vľavo cesta', 'jeCestaVlavo'],
    ['je vpravo cesta', 'jeCestaVpravo'],
    ['je vpredu kameň', 'jeKamenVpredu'],
  ],
};

export function registerBlocks() {
  Blockly.common.defineBlocksWithJsonArray([
    { type: 'chod_dopredu', message0: 'choď dopredu ⬆', colour: MOVE, tooltip: 'Kubo urobí jeden krok dopredu.', ...statement },
    { type: 'otoc_vlavo', message0: 'otoč sa doľava ↶', colour: MOVE, tooltip: 'Kubo sa otočí doľava (na mieste).', ...statement },
    { type: 'otoc_vpravo', message0: 'otoč sa doprava ↷', colour: MOVE, tooltip: 'Kubo sa otočí doprava (na mieste).', ...statement },
    { type: 'vykop', message0: 'vykop kameň ⛏', colour: MINE, tooltip: 'Kubo vykope kameň pred sebou.', ...statement },
    { type: 'namaluj', message0: 'namaľuj 🖌', colour: PEN, tooltip: 'Kubo zafarbí políčko, na ktorom stojí.', ...statement },
    {
      type: 'farba',
      message0: 'farba %1',
      args0: [{ type: 'field_dropdown', name: 'COLOR', options: COLORS.map((c) => [`${c.emoji} ${c.name}`, c.name]) }],
      colour: PEN,
      tooltip: 'Kubo bude odteraz maľovať touto farbou.',
      ...statement,
    },
    {
      type: 'opakuj',
      message0: 'opakuj %1 krát',
      args0: [{ type: 'field_number', name: 'TIMES', value: 3, min: 1, max: 20, precision: 1 }],
      message1: '%1',
      args1: [{ type: 'input_statement', name: 'DO' }],
      colour: LOOP,
      tooltip: 'Zopakuje bloky vo vnútri toľkokrát, koľko nastavíš.',
      ...statement,
    },
    {
      type: 'opakuj_kym',
      message0: 'opakuj, kým nie som v cieli',
      message1: '%1',
      args1: [{ type: 'input_statement', name: 'DO' }],
      colour: LOOP,
      tooltip: 'Opakuje bloky vo vnútri, až kým Kubo nie je v portáli.',
      ...statement,
    },
    {
      type: 'ak',
      message0: 'ak %1',
      args0: [CONDITION],
      message1: 'tak %1',
      args1: [{ type: 'input_statement', name: 'DO' }],
      colour: LOGIC,
      tooltip: 'Bloky vo vnútri sa urobia, len ak platí podmienka.',
      ...statement,
    },
    {
      type: 'ak_inak',
      message0: 'ak %1',
      args0: [CONDITION],
      message1: 'tak %1',
      args1: [{ type: 'input_statement', name: 'DO' }],
      message2: 'inak %1',
      args2: [{ type: 'input_statement', name: 'ELSE' }],
      colour: LOGIC,
      tooltip: 'Ak platí podmienka, urobí sa „tak“. Ak nie, urobí sa „inak“.',
      ...statement,
    },
  ]);

  Blockly.Blocks['start'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('▶ keď spustím');
      this.setNextStatement(true);
      this.setColour('#ff4fa3');
      this.setTooltip('Program začína tu. Prilep bloky pod mňa.');
      this.setDeletable(false);
      this.hat = 'cap';
    },
  };

  const g = javascriptGenerator;
  g.addReservedWords(['highlightBlock', 'loopTrap', ...API_NAMES].join(','));
  g.forBlock['start'] = () => '';
  g.forBlock['chod_dopredu'] = () => 'chodDopredu();\n';
  g.forBlock['otoc_vlavo'] = () => 'otocVlavo();\n';
  g.forBlock['otoc_vpravo'] = () => 'otocVpravo();\n';
  g.forBlock['vykop'] = () => 'vykop();\n';
  g.forBlock['namaluj'] = () => 'namaluj();\n';
  g.forBlock['farba'] = (block) => `farba('${block.getFieldValue('COLOR')}');\n`;
  g.forBlock['opakuj'] = (block, gen) => {
    const times = Number(block.getFieldValue('TIMES'));
    const body = gen.addLoopTrap(gen.statementToCode(block, 'DO'), block);
    const i = gen.nameDB_!.getDistinctName('i', Blockly.Names.NameType.VARIABLE);
    return `for (let ${i} = 0; ${i} < ${times}; ${i}++) {\n${body}}\n`;
  };
  g.forBlock['opakuj_kym'] = (block, gen) => {
    const body = gen.addLoopTrap(gen.statementToCode(block, 'DO'), block);
    return `while (!somVCieli()) {\n${body}}\n`;
  };
  g.forBlock['ak'] = (block, gen) =>
    `if (${block.getFieldValue('COND')}()) {\n${gen.statementToCode(block, 'DO')}}\n`;
  g.forBlock['ak_inak'] = (block, gen) =>
    `if (${block.getFieldValue('COND')}()) {\n${gen.statementToCode(block, 'DO')}} else {\n${gen.statementToCode(block, 'ELSE')}}\n`;
}

/** forRun adds block highlighting and infinite-loop protection; the displayed code stays clean. */
export function generateCode(ws: Blockly.Workspace, forRun: boolean): string {
  const g = javascriptGenerator;
  g.STATEMENT_PREFIX = forRun ? 'highlightBlock(%1);\n' : null;
  g.INFINITE_LOOP_TRAP = forRun ? 'loopTrap();\n' : null;
  return g.workspaceToCode(ws);
}

export function countBlocks(ws: Blockly.Workspace): number {
  return ws.getAllBlocks(false).filter((b) => b.type !== 'start' && b.isEnabled()).length;
}

export function toolboxFor(types: string[]): Blockly.utils.toolbox.ToolboxDefinition {
  return { kind: 'flyoutToolbox', contents: types.map((type) => ({ kind: 'block', type })) };
}

export const theme = Blockly.Theme.defineTheme('kubo', {
  name: 'kubo',
  base: Blockly.Themes.Classic,
  componentStyles: {
    workspaceBackgroundColour: '#1e2433',
    toolboxBackgroundColour: '#151a26',
    flyoutBackgroundColour: '#252c3f',
    flyoutOpacity: 1,
    scrollbarColour: '#4a5470',
    insertionMarkerColour: '#ffffff',
    insertionMarkerOpacity: 0.3,
  },
  fontStyle: { family: 'Nunito, system-ui, sans-serif', weight: '800', size: 14 },
});
