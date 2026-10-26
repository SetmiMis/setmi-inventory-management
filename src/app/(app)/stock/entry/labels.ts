import type { EntryLabels } from "./entry-form";

// Words for this screen in both languages (it is used every day at the counter).
export const ENTRY_LABELS: Record<"en" | "hi", EntryLabels & { title: string; intro: string; recent: string; none: string; when: string; what: string; lines: string }> = {
  en: {
    title: "Quick Stock In / Out", intro: "For goods that leave or come back without a receipt or a bill here: sold in Zoho, samples, damage, returns. Stock changes as soon as you save.",
    out: "Stock Out", in: "Stock In", reason: "Why?", scan: "Scan item barcode", scanHint: "Each scan adds one piece. For metre or kg items type the quantity.",
    search: "Or search by code or name", searchHint: "Type at least 2 letters", add: "Add", noItems: "No items yet. Scan or search above.",
    reference: "Reference (optional)", referenceHint: "For example Zoho bill number", remarks: "Remarks", save: "Save entry", saving: "Saving...", saved: "Saved",
    remove: "Remove", quantity: "Enter a quantity for", confirmOut: "Take these items OUT of stock now?", confirmIn: "Add these items IN to stock now?",
    recent: "Latest entries here", none: "No entries yet.", when: "When", what: "What", lines: "items",
  },
  hi: {
    title: "जल्दी स्टॉक इन / आउट", intro: "उस माल के लिए जो बिना रसीद या बिल के जाता या लौटता है: Zoho में बिका, सैंपल, ख़राब, वापसी। सेव करते ही स्टॉक बदल जाता है।",
    out: "स्टॉक आउट", in: "स्टॉक इन", reason: "क्यों?", scan: "आइटम का बारकोड स्कैन करें", scanHint: "हर स्कैन 1 पीस जोड़ता है। मीटर या किलो वाले आइटम की मात्रा लिखें।",
    search: "या कोड या नाम से खोजें", searchHint: "कम से कम 2 अक्षर लिखें", add: "जोड़ें", noItems: "अभी कोई आइटम नहीं। ऊपर स्कैन करें या खोजें।",
    reference: "रेफ़रेंस (ज़रूरी नहीं)", referenceHint: "जैसे Zoho बिल नंबर", remarks: "टिप्पणी", save: "सेव करें", saving: "सेव हो रहा है...", saved: "सेव हुआ",
    remove: "हटाएँ", quantity: "मात्रा लिखें", confirmOut: "ये आइटम अभी स्टॉक से बाहर करें?", confirmIn: "ये आइटम अभी स्टॉक में जोड़ें?",
    recent: "यहाँ की हाल की एंट्री", none: "अभी कोई एंट्री नहीं।", when: "कब", what: "क्या", lines: "आइटम",
  },
};
