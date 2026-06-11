// Parses Marg "List of Items" item/description cells into structured product data.

export type DrugSchedule = 'none' | 'schedule_h' | 'schedule_h1' | 'schedule_x' | 'narcotic';

export interface ParsedItem {
  brand: string;
  generic: string;
  strength?: string;
  form: string;
  pack: string;
  packOuter?: number;
  packInner?: number;
  baseUnit: string;
  secondaryUnit?: string;
  conversion?: number;
  schedule: DrugSchedule;
  confidence: number;
}

export function parseSaltHeader(text: string): { salt: string; schedule: DrugSchedule } {
  const trimmed = text.trim();
  const m = trimmed.match(/^\(([^)]+)\)\s*(.*)$/);
  if (!m) return { salt: trimmed, schedule: 'none' };
  const tag = m[1].toUpperCase().replace(/[\s.-]/g, '');
  const salt = m[2].trim();
  let schedule: DrugSchedule = 'none';
  if (tag === 'NRX' || tag === 'N' || tag === 'NARCOTIC') schedule = 'narcotic';
  else if (tag === 'X' || tag === 'SCHX') schedule = 'schedule_x';
  else if (tag === 'H1' || tag === 'SCHH1') schedule = 'schedule_h1';
  else if (tag === 'H' || tag === 'SCHH') schedule = 'schedule_h';
  return { salt, schedule };
}

const STRENGTH_RE = /(\d+(?:\.\d+)?)\s*(MG|MCG|GM|G|ML|IU|%|U)(?:\s*\/\s*(\d+(?:\.\d+)?)\s*(MG|ML|G))?/i;

const PACK_PATTERNS: Array<{ re: RegExp; kind: 'multi' | 'volume' | 'count' }> = [
  { re: /\s(\d+)\s*\*\s*(\d+(?:\.\d+)?)\s*(ML|GM|G|MG)?\s*$/i, kind: 'multi' },
  { re: /\s(\d+(?:\.\d+)?)\s*(ML|GM|G)\s*$/i, kind: 'volume' },
  { re: /\s(\d+)\s*$/, kind: 'count' },
];

export function extractItem(
  itemCell: string,
  descCell: string,
  currentSalt: string,
  currentSchedule: DrugSchedule,
): ParsedItem {
  const combined = `${itemCell ?? ''} ${descCell ?? ''}`.replace(/\s+/g, ' ').trim();
  let work = ' ' + combined; // leading space so end-anchored regexes can match first token

  let pack = '';
  let packOuter: number | undefined;
  let packInner: number | undefined;
  let baseUnit = 'Piece';
  let secondaryUnit: string | undefined;
  let conversion: number | undefined;

  for (const { re, kind } of PACK_PATTERNS) {
    const m = work.match(re);
    if (!m) continue;
    pack = m[0].trim();
    work = work.slice(0, m.index).trim();
    if (kind === 'multi') {
      packOuter = parseInt(m[1], 10);
      packInner = parseFloat(m[2]);
      const u = (m[3] ?? '').toUpperCase();
      if (u === 'ML') { baseUnit = 'ML'; secondaryUnit = 'Bottle'; conversion = packInner; }
      else if (u === 'GM' || u === 'G') { baseUnit = 'Gram'; secondaryUnit = 'Pack'; conversion = packInner; }
      else { baseUnit = 'Tablet'; secondaryUnit = 'Strip'; conversion = packInner; }
    } else if (kind === 'volume') {
      const n = parseFloat(m[1]);
      const u = m[2].toUpperCase();
      if (u === 'ML') { baseUnit = 'ML'; secondaryUnit = 'Bottle'; conversion = n; }
      else { baseUnit = 'Gram'; secondaryUnit = 'Pack'; conversion = n; }
    } else {
      const n = parseInt(m[1], 10);
      baseUnit = 'Tablet'; secondaryUnit = 'Strip'; conversion = n;
    }
    break;
  }

  let strength: string | undefined;
  const sm = work.match(STRENGTH_RE);
  if (sm) {
    strength = sm[0].replace(/\s+/g, '').toUpperCase();
    work = (work.slice(0, sm.index!) + ' ' + work.slice(sm.index! + sm[0].length)).replace(/\s+/g, ' ').trim();
  }

  const brand = (work.trim() || (itemCell ?? '').trim()).toUpperCase();

  const up = combined.toUpperCase();
  let form = 'Tablet';
  if (/\bDROP/.test(up)) form = 'Drops';
  else if (/SYRUP|SUSP|\bSOL\b/.test(up)) form = 'Syrup';
  else if (/\bINJ\b|INJECTION/.test(up)) form = 'Injection';
  else if (/CREAM|OINT|GEL|LOTION/.test(up)) form = 'Cream';
  else if (/\bCAP\b|CAPSULE/.test(up)) form = 'Capsule';
  else if (baseUnit === 'ML') form = 'Syrup';
  else if (baseUnit === 'Gram') form = 'Cream';

  let confidence = 0.4;
  if (strength) confidence += 0.25;
  if (pack) confidence += 0.25;
  if (brand) confidence += 0.1;

  return {
    brand,
    generic: currentSalt,
    strength,
    form,
    pack,
    packOuter,
    packInner,
    baseUnit,
    secondaryUnit,
    conversion,
    schedule: currentSchedule,
    confidence: Math.min(confidence, 1),
  };
}
