import "server-only";
import { cookies } from "next/headers";
import { MESSAGES, type MessageKey } from "./messages";

// Two screen languages: English and Hindi (Devanagari). The choice is a plain cookie; it only
// changes words on screen and never touches data or permissions.
export type Lang = "en" | "hi";
export const LANG_COOKIE = "ims_lang";

export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return v === "hi" ? "hi" : "en";
}

export function tr(lang: Lang, key: MessageKey): string {
  return MESSAGES[lang][key];
}

export type { MessageKey };
