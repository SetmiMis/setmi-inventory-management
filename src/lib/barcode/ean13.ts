// EAN-13 barcode maths and bar pattern. Pure functions with no imports, so they can be unit
// tested and checked against an independent barcode reader (see docs/features/FEATURE-003-BARCODE.md).
//
// A printed EAN-13 is 95 "modules" (thin columns): 3 start guard, 6 left digits, 5 centre guard,
// 6 right digits, 3 end guard. The first of the 13 digits is not drawn as bars; it is hidden in
// WHICH of two spellings (L or G) the six left digits use.

// How each digit is spelled with bars on the LEFT half, set A ("L"). 1 = black module.
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
// RIGHT half spelling is the opposite colours of L; set B ("G") is the right spelling read backwards.
const R = L.map((c) => [...c].map((b) => (b === "0" ? "1" : "0")).join(""));
const G = R.map((c) => [...c].reverse().join(""));
// Spelling pattern for the six left digits, chosen by the first digit.
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export function ean13CheckDigit(first12: string): number {
  if (!/^[0-9]{12}$/.test(first12)) throw new Error("EAN-13 needs exactly 12 digits");
  let total = 0;
  for (let i = 0; i < 12; i++) total += Number(first12[i]) * (i % 2 === 1 ? 3 : 1);
  return (10 - (total % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^[0-9]{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

// 95 characters of "0" (white) and "1" (black).
export function ean13Modules(code: string): string {
  if (!isValidEan13(code)) throw new Error("Not a valid EAN-13 number");
  const parity = PARITY[Number(code[0])];
  let out = "101";
  for (let i = 0; i < 6; i++) {
    const digit = Number(code[1 + i]);
    out += parity[i] === "L" ? L[digit] : G[digit];
  }
  out += "01010";
  for (let i = 0; i < 6; i++) out += R[Number(code[7 + i])];
  return out + "101";
}

// Merge neighbouring black modules into runs, so the SVG has few rectangles.
export function blackRuns(modules: string): { start: number; width: number }[] {
  const runs: { start: number; width: number }[] = [];
  let start = -1;
  for (let i = 0; i <= modules.length; i++) {
    const black = modules[i] === "1";
    if (black && start < 0) start = i;
    if (!black && start >= 0) {
      runs.push({ start, width: i - start });
      start = -1;
    }
  }
  return runs;
}

// Quiet zones (blank margin) that scanners need: 11 modules left, 7 right.
export const QUIET_LEFT = 11;
export const QUIET_RIGHT = 7;
export const TOTAL_MODULES = QUIET_LEFT + 95 + QUIET_RIGHT;
