import type { Level } from './world';

const MOVES = ['chod_dopredu', 'otoc_vlavo', 'otoc_vpravo'];
const MINE = [...MOVES, 'vykop'];
const LOOPS = [...MINE, 'opakuj'];
const UNTIL = [...LOOPS, 'opakuj_kym'];
const IFS = [...UNTIL, 'ak'];
const IF_ELSE = [...IFS, 'ak_inak'];
const DRAW = [...MOVES, 'namaluj', 'farba'];
const DRAW_LOOPS = [...DRAW, 'opakuj'];

export const LEVELS: Level[] = [
  {
    id: 'l1',
    chapter: 'maze',
    title: 'Prvé kroky',
    hint: 'Ahoj! Toto je Kubo. Dostaň ho do fialového portálu. Chyť blok „choď dopredu“ v ľavom paneli, prilep ho pod blok „keď spustím“ a stlač ▶ Spusti!',
    map: [
      'TTTTTTT',
      'TWWWWWT',
      'T>.D.GT',
      'TWWWWWT',
      'TTTTTTT',
    ],
    toolbox: ['chod_dopredu'],
    par: 4,
    solution: 'chodDopredu(); chodDopredu(); chodDopredu(); chodDopredu();',
  },
  {
    id: 'l2',
    chapter: 'maze',
    title: 'Zákruta',
    hint: 'Cesta zatáča! Kubo sa vie otočiť doľava a doprava. Pozor: otočí sa na mieste, ale nepohne sa. Sleduj bielu šípku – ukazuje, kam sa Kubo pozerá.',
    map: [
      'TTTTTTT',
      'T>..TTT',
      'TTT.TTT',
      'TTT.TTT',
      'TTT..GT',
      'TTTTTTT',
    ],
    toolbox: MOVES,
    par: 9,
    solution: `
      chodDopredu(); chodDopredu(); otocVpravo();
      chodDopredu(); chodDopredu(); chodDopredu(); otocVlavo();
      chodDopredu(); chodDopredu();`,
  },
  {
    id: 'l3',
    chapter: 'maze',
    title: 'Okolo jazierka',
    hint: 'Na ceste leží diamant 💎. Keď cezeň Kubo prejde, zoberie ho. Za všetky diamanty v úrovni dostaneš hviezdičku!',
    map: [
      'TTTTTTT',
      'TD...TT',
      'T.WW.TT',
      'T.WW.GT',
      'T^TTTTT',
      'TTTTTTT',
    ],
    toolbox: MOVES,
    par: 12,
    solution: `
      chodDopredu(); chodDopredu(); chodDopredu(); otocVpravo();
      chodDopredu(); chodDopredu(); chodDopredu(); otocVpravo();
      chodDopredu(); chodDopredu(); otocVlavo(); chodDopredu();`,
  },
  {
    id: 'l4',
    chapter: 'maze',
    title: 'Krompáč',
    hint: 'Cestu blokuje kameň. Postav sa pred neho a použi „vykop kameň“ ⛏. A hlavne – nestúpaj do lávy!',
    map: [
      'BBBBBBB',
      'BLLLLLB',
      'B>.S.GB',
      'BLLLLLB',
      'BBBBBBB',
    ],
    toolbox: MINE,
    par: 5,
    solution: 'chodDopredu(); vykop(); chodDopredu(); chodDopredu(); chodDopredu();',
  },
  {
    id: 'l5',
    chapter: 'maze',
    title: 'Dlhý most',
    hint: 'Toľko blokov „choď dopredu“? Programátori sú leniví 😎. Použi „opakuj“: vlož dovnútra jeden krok a nastav číslo, koľkokrát sa má zopakovať.',
    map: [
      'TTTTTTTTTT',
      'TWWWWWWWWT',
      'T>...D..GT',
      'TWWWWWWWWT',
      'TTTTTTTTTT',
    ],
    toolbox: LOOPS,
    par: 2,
    solution: 'for (let i = 0; i < 7; i++) { chodDopredu(); }',
  },
  {
    id: 'l6',
    chapter: 'maze',
    title: 'Schody',
    hint: 'Kubo ide po schodoch: dopredu, doľava, dopredu, doprava… a znova. Nájdi kúsok, ktorý sa opakuje, a daj ho do „opakuj“.',
    map: [
      'TTTTTTTT',
      'TTTTTTTT',
      'TTTTTGTT',
      'TTTT..TT',
      'TTTD.TTT',
      'TT..TTTT',
      'T>.TTTTT',
      'TTTTTTTT',
    ],
    toolbox: LOOPS,
    par: 5,
    solution: 'for (let i = 0; i < 4; i++) { chodDopredu(); otocVlavo(); chodDopredu(); otocVpravo(); }',
  },
  {
    id: 'l7',
    chapter: 'maze',
    title: 'Tunel',
    hint: 'Hlboko pod zemou! Vykop tunel až k portálu. Vzor je: vykop, choď dopredu… Koľkokrát? Tip: vykopávať tam, kde nie je kameň, nevadí.',
    map: [
      'BBBBBBBBB',
      'BSSSSSSSB',
      'B>SSSSSGB',
      'BSSSSSSSB',
      'BBBBBBBBB',
    ],
    toolbox: LOOPS,
    par: 3,
    solution: 'for (let i = 0; i < 6; i++) { vykop(); chodDopredu(); }',
  },
  {
    id: 'l8',
    chapter: 'maze',
    title: 'Nekonečné schody',
    hint: 'Nechce sa ti počítať schody? Blok „opakuj, kým nie som v cieli“ opakuje, až kým Kubo nedorazí do portálu.',
    map: [
      'TTTTTTTTTT',
      'TTTTTTTTTT',
      'TTTTTTTGTT',
      'TTTTTTD.TT',
      'TTTTT..TTT',
      'TTTTD.TTTT',
      'TTT..TTTTT',
      'TT..TTTTTT',
      'T>.TTTTTTT',
      'TTTTTTTTTT',
    ],
    toolbox: UNTIL,
    par: 5,
    solution: 'while (!somVCieli()) { chodDopredu(); otocVlavo(); chodDopredu(); otocVpravo(); }',
  },
  {
    id: 'l9',
    chapter: 'maze',
    title: 'Kamene na ceste',
    hint: 'Kamene sú len niekde. Kubo sa musí rozhodnúť: „ak je vpredu kameň“, tak ho vykope. Potom vždy urobí krok dopredu.',
    map: [
      'BBBBBBBBBBBB',
      'BLLLLLLLLLLB',
      'B>.SSD.S..GB',
      'BLLLLLLLLLLB',
      'BBBBBBBBBBBB',
    ],
    toolbox: IFS,
    par: 4,
    solution: 'while (!somVCieli()) { if (jeKamenVpredu()) { vykop(); } chodDopredu(); }',
  },
  {
    id: 'l10',
    chapter: 'maze',
    title: 'Špirála',
    hint: 'Kubo má zabočiť len vtedy, keď je vľavo cesta. Daj blok „ak“ dovnútra bloku „opakuj, kým…“.',
    map: [
      'TTTTTTTTT',
      'TTT.....T',
      'TTT.TTT.T',
      'TTT.TTT.T',
      'TTT.TTT.T',
      'TTT.DGT.T',
      'TTTTTTT.T',
      'T>......T',
      'TTTTTTTTT',
    ],
    toolbox: IFS,
    par: 4,
    solution: 'while (!somVCieli()) { if (jeCestaVlavo()) { otocVlavo(); } chodDopredu(); }',
  },
  {
    id: 'l11',
    chapter: 'maze',
    title: 'Kľukatá cesta',
    hint: 'Ak je vpredu cesta, choď. Inak sa rozhodni: doľava, alebo doprava? Blok „ak … inak“ vie urobiť dve rôzne veci. A môžeš ho dať aj do iného „ak … inak“!',
    map: [
      'TTTTTTTTT',
      'TTTTT..GT',
      'TTTTT.TTT',
      'TTT.D.TTT',
      'TTT.TTTTT',
      'T...TTTTT',
      'T.TTTTTTT',
      'T^TTTTTTT',
      'TTTTTTTTT',
    ],
    toolbox: IF_ELSE,
    par: 6,
    solution: `
      while (!somVCieli()) {
        if (jeCestaVpredu()) { chodDopredu(); }
        else { if (jeCestaVlavo()) { otocVlavo(); } else { otocVpravo(); } }
      }`,
  },
  {
    id: 'l12',
    chapter: 'maze',
    title: 'Labyrint',
    hint: 'Skutočný labyrint! Tajný trik: drž sa ľavej steny. Ak je vľavo cesta, otoč sa doľava a choď. Inak, ak je vpredu cesta, choď. Inak sa otoč doprava.',
    map: [
      'TTTTTTTTT',
      'T...T...T',
      'T.T.T.T.T',
      'TDT...TDT',
      'T.TTTTT.T',
      'T.....T.T',
      'TTTT.TT.T',
      'T>...TTGT',
      'TTTTTTTTT',
    ],
    toolbox: IF_ELSE,
    par: 7,
    solution: `
      while (!somVCieli()) {
        if (jeCestaVlavo()) { otocVlavo(); chodDopredu(); }
        else { if (jeCestaVpredu()) { chodDopredu(); } else { otocVpravo(); } }
      }`,
  },

  // ---- Drawing chapter ------------------------------------------------------
  {
    id: 'd7',
    chapter: 'draw',
    title: 'Voľné kreslenie',
    hint: 'Kubo vie maľovať! „namaľuj“ zafarbí políčko, na ktorom Kubo stojí, a „farba“ mu vymení farbu. Nakresli, čo chceš – robota, dúhu, svoje meno… Hotový obrázok si stiahneš tlačidlom 🖼.',
    map: canvas(16, 12, 1, 1, '>'),
    free: true,
    toolbox: [...DRAW_LOOPS, 'ak', 'ak_inak'],
    par: 0,
    solution: 'namaluj();',
  },
];

/** An empty drawing canvas with Kubo at (x, y) facing dir (^ > v <). */
function canvas(width: number, height: number, x: number, y: number, dir: string): string[] {
  return Array.from({ length: height }, (_, ry) =>
    Array.from({ length: width }, (_, rx) => (rx === x && ry === y ? dir : '.')).join(''),
  );
}
