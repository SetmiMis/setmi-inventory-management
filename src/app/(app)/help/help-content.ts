// The words of the Help page, in simple Hinglish. One list drives both the Help page and the
// "Help" button in the top bar (which opens the section that matches the screen you are on).
// Keep every step short and true to what the screens really do.

export type HelpSection = {
  id: string;
  title: string;
  intro: string;
  steps: string[];
  tips?: string[];
};

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: "start",
    title: "Pehli baar: login aur apni jagah",
    intro: "Sab kuch aapki 'working jagah' (warehouse ya shop) ke hisaab se chalta hai.",
    steps: [
      "Email aur password se login karein. Password bhool gaye to admin se naya banwayein.",
      "Upar (top bar) mein 'Working in' mein apni jagah dikhti hai. Agar aap ek se zyada jagah par kaam karte hain to wahan se jagah badal sakte hain.",
      "Left menu (phone par upar ka menu button) mein wahi cheezein dikhti hain jinki aapko permission hai.",
      "Koi button ya menu nahi dikh raha? Matlab aapko us kaam ki permission nahi di gayi. Admin se kahein.",
    ],
    tips: ["Galat jagah par kaam na ho, isliye pehle upar dekh lein ki 'Working in' mein sahi jagah hai."],
  },
  {
    id: "items",
    title: "Item banana aur dhoondhna",
    intro: "Item matlab aapka maal (jaise BNC connector). Har item ka ek unique code hota hai.",
    steps: [
      "Items par jayein. Upar search box mein code ya naam likhein, ya barcode scan karein. Scan karne par seedha wahi item khul jata hai.",
      "Naya item: 'New item' dabayein. Zaroori: Internal item code, Item name, Selling item name (jo naam customer ke bill par aayega) aur Unit.",
      "Unit chunein: PCS (gin kar), MTR (meter, 3 decimal tak), KG, BOX, SET.",
      "Item save hone ke baad uske page par barcode bana sakte hain aur photo ya datasheet laga sakte hain.",
      "Bahut saare items ek saath: 'Import Excel' se. Pehle 'Check file (nothing is saved yet)' dabayein: system row aur column ke saath galti batata hai. Kuch tab hi save hota hai jab aap 'Import ... items' dabayein.",
    ],
    tips: ["Item ko delete nahi kar sakte. Zaroorat na ho to 'Archive item' karein; 'Restore item' se wapas aa jata hai."],
  },
  {
    id: "labels",
    title: "Barcode label print karna",
    intro: "Label par item ka barcode aur code chhapta hai.",
    steps: [
      "Item ke page par 'Print labels' dabayein, ya maal receive karne ke baad receipt ke page se 'Print labels for these items'.",
      "Label ka size aur kitne label chahiye wo chunein, phir Print dabayein.",
      "Printer ka koi bhi size chalega. Agar label kat raha hai to print window mein 'Scale' ya 'Margins' badal lein.",
    ],
  },
  {
    id: "orders",
    title: "Maal mangwana (Purchase order)",
    intro: "Purchase order supplier ko diya jaane wala order hai. Isse pata rehta hai ki kitna mangwaya aur kitna aaya.",
    steps: [
      "Purchase orders > New order. Supplier chunein, items scan ya search karke jodein aur quantity likhein.",
      "'Save draft' se sirf save hota hai. Draft mein kabhi bhi badlav kar sakte hain.",
      "Taiyar hone par 'Send order' dabayein (iske liye approve permission chahiye). Bheje hue order mein badlav nahi hota.",
      "Print order se supplier ko dene ke liye A4 page milta hai.",
      "Order mein dikhta hai: kitna Ordered, kitna Received, kitna Still open. Jab sab aa jata hai to status 'Completed' ho jata hai.",
      "Agar supplier baaki maal nahi bhejega: 'Close order' dabayein aur wajah likhein.",
    ],
    tips: [
      "Bheja hua order galat hai? Agar kuch receive nahi hua to 'Cancel order' karke naya banayein.",
      "Order banane wale ko 'items.view' ki permission bhi chahiye, warna item nahi dikhenge.",
    ],
  },
  {
    id: "receiving",
    title: "Maal aana (Goods receipt)",
    intro: "Jab supplier ka maal godown mein aata hai tab receipt banti hai. Receipt 'post' karte hi stock badhta hai.",
    steps: [
      "Receipts > New receipt. Agar is maal ka purchase order hai to upar ki list se order chunein: supplier aur quantity apne aap bhar jati hain.",
      "Order nahi hai? Supplier chunein, items scan karein (har scan 1 piece jodta hai) ya search se jodein. Meter ya kg wale item ki quantity khud likhein.",
      "Supplier invoice number likh dein. Ek hi supplier ka ek hi invoice dobara receive nahi ho sakta.",
      "Gin lein ki jitna likha hai utna hi aaya hai. Phir 'Save draft' (abhi stock nahi badhega) ya 'Save and post' (stock abhi badhega).",
      "Post hone ke baad receipt badal nahi sakti.",
      "Order se zyada quantity receive nahi hoti. Zyada maal aaya hai? Alag receipt (bina order) banayein ya admin se poochein.",
    ],
    tips: [
      "Post ho gayi receipt mein galti mili? Receipt edit nahi hoti. Stock sahi karne ke liye 'Count stock' karein aur wajah likhein.",
      "Draft receipt ko 'Cancel draft' se hata sakte hain.",
    ],
  },
  {
    id: "count",
    title: "Stock ginna (Count)",
    intro: "Ginti se system ka stock asli stock ke barabar hota hai. Har badlav ka record rehta hai.",
    steps: [
      "Stock par jayein: wahan apni jagah ka stock dikhta hai.",
      "'Scan count': har item ko scan karte jayein. Har scan 1 piece jodta hai. Meter ya kg wale item ki quantity khud likhein.",
      "'Count stock': list mein har item ke saamne gina hua number likhein.",
      "Aakhir mein wajah likhein (jaise 'mahine ki ginti') aur save karein. Jo number badla, sirf usi ka record banta hai.",
      "Pehli baar stock daal rahe hain to 'opening stock' chunein.",
    ],
    tips: ["Stock kabhi minus nahi ho sakta."],
  },
  {
    id: "transfers",
    title: "Maal bhejna (Transfer)",
    intro: "Ek jagah se doosri jagah maal bhejna. Beech ke raaste mein maal 'In transit' kehlata hai.",
    steps: [
      "Transfers > New transfer. Kahan bhejna hai wo chunein, items aur quantity jodein.",
      "'Save and send (stock leaves)' dabate hi aapki jagah ka stock ghat jata hai aur transfer 'On the way' dikhta hai.",
      "Jahan maal pahunch gaya, wahan ka user transfer kholkar kitna asli mein mila wo likhta hai aur receive karta hai.",
      "Kam mila to wo 'shortage' ke roop mein likha jata hai; raaste mein kam hua maal stock se hat jata hai.",
      "Galti se bhej diya aur abhi receive nahi hua? Bhejne wala 'Recall' kar sakta hai.",
    ],
  },
  {
    id: "billing",
    title: "Bill banana (shop par)",
    intro: "Billing tabhi chalti hai jab admin ne Settings mein billing ON ki ho. Abhi tax (GST) nahi judha hai, ye tax invoice nahi hai.",
    steps: [
      "Upar apni shop chunein. Menu mein Billing kholein.",
      "Item ka barcode scan karein ya search karein. Quantity badal sakte hain.",
      "Discount (agar ho) likhein. Payment: Cash, UPI, Card ya Other chunein. Customer ka naam aur phone likhna zaroori nahi.",
      "'Complete bill' dabayein. Bill ban jata hai aur stock apne aap ghat jata hai. Phir receipt print kar sakte hain.",
      "Galat bill? Bills mein bill kholein aur 'Void' karein, wajah likhein. Maal wapas stock mein aa jata hai aur bill 'Voided' dikhta rehta hai.",
    ],
    tips: [
      "Jis item ka selling price nahi bhara, wo bill nahi ho sakta. Item ke page par price bharwayein.",
      "Agar Zoho mein bhi bill kar rahe hain to ek hi bikri dono jagah mat banayein.",
    ],
  },
  {
    id: "reports",
    title: "Reports aur Excel mein download",
    intro: "Reports se pata chalta hai kya kitna hai, kya kam hai aur kya bika.",
    steps: [
      "Reports kholein aur upar se report chunein: Stock by place, Low stock, Sales per day, What sold, Slow stock.",
      "Jagah aur tareekh chunein, 'Show' dabayein.",
      "'Download CSV' se file milti hai jo seedha Excel mein khulti hai (iske liye export ki permission chahiye).",
    ],
    tips: ["Sales ki report tabhi bharti hai jab bills is system mein bane hon."],
  },
  {
    id: "places",
    title: "Warehouse aur shop (Locations)",
    intro: "Har godown aur dukaan ek 'place' hai. Admin inhe banata hai aur batata hai ki kaun kahan kaam kare.",
    steps: [
      "Locations > New warehouse or shop. Code (chhota naam, jaise WH1) aur naam likhein.",
      "Admin > Users mein har user ko uski jagah aur permissions dein.",
    ],
  },
  {
    id: "suppliers",
    title: "Suppliers",
    intro: "Jinse aap maal kharidte hain unki list.",
    steps: [
      "Suppliers > New supplier. Naam zaroori hai; phone, address aur GSTIN (15 akshar/ank) likh sakte hain.",
      "Purana supplier ab nahi chahiye to 'Archive' karein.",
    ],
  },
  {
    id: "users",
    title: "Users aur permissions (sirf admin)",
    intro: "Har aadmi ko wahi kaam dein jo uska hai.",
    steps: [
      "Naya login abhi Supabase dashboard (Authentication > Users) mein banta hai: ye kaam admin ya developer karta hai. Phir Admin > Users mein us naam ke saamne 'Active' tick karein.",
      "Uski jagah (location) chunein aur permission ke toggle ON karein: jaise items dekhna, receipt banana, receipt post karna, bill banana.",
      "Daam (buying price) dekhne ki alag permission hai: 'receipts.cost'. Sirf jise zaroori ho use dein.",
    ],
    tips: ["Kisi ko hatana ho to 'Active' band karein. Purana record safe rehta hai."],
  },
  {
    id: "settings",
    title: "Settings (sirf admin)",
    intro: "Abhi yahan billing ON/OFF ka switch hai.",
    steps: [
      "Billing sirf tab ON karein jab aap is system se bill karna chahte hain.",
      "Billing ON/OFF har baar record hota hai (kisne kab badla).",
    ],
  },
  {
    id: "scanner",
    title: "Scanner ke tips",
    intro: "USB scanner keyboard ki tarah kaam karta hai: barcode likhta hai aur Enter dabata hai.",
    steps: [
      "Jis box mein 'Scan here' likha ho use dabakar rakhein (cursor chamakta dikhe), phir scan karein.",
      "Achhi beep = item mil gaya. Alag, kharab beep = barcode system mein nahi hai ya item archive hai.",
      "Ek hi barcode bahut jaldi do baar scan ho jaye to doosra ignore hota hai (galti se double na ho).",
    ],
    tips: ["Barcode nahi chal raha? Code ya naam se search karke item jod lein."],
  },
  {
    id: "mistakes",
    title: "Galti ho gayi to kya karein?",
    intro: "System mein purana record mitaya nahi jata, isliye galti ko sudharne ka tareeka alag hai.",
    steps: [
      "Draft receipt, draft order, draft transfer: seedha badal sakte hain ya cancel kar sakte hain.",
      "Post ho gayi receipt galat thi: 'Count stock' karke sahi quantity likhein aur wajah likhein.",
      "Galat bill: 'Void' karein (wajah likhna zaroori).",
      "Bheja hua transfer jo abhi receive nahi hua: 'Recall' karein.",
      "Bheja hua order: kuch receive nahi hua to cancel karein; kuch aa chuka hai to 'Close order' karein.",
    ],
    tips: ["Samajh na aaye to kuch na badlein aur admin ko screenshot dikhayein."],
  },
  {
    id: "words",
    title: "Shabdon ka matlab",
    intro: "Screen par aane wale kuch shabd.",
    steps: [
      "Draft: abhi sirf likha hai, stock par asar nahi. Badla ja sakta hai.",
      "Post / Posted: pakka ho gaya, stock badh gaya. Ab badla nahi ja sakta.",
      "Receipt (GRN): maal aane ki parchi.",
      "Purchase order (PO): supplier ko diya order.",
      "Transfer: ek jagah se doosri jagah maal bhejna. In transit = raaste mein.",
      "Void / Voided: bill raddh kiya gaya (stock wapas aaya, record bacha).",
      "Minimum level: isse neeche stock jaaye to 'Low' dikhta hai.",
      "Unit: maal kis naap mein hai: PCS, MTR, KG, BOX, SET.",
      "Archive: item/supplier ab use nahi hota par record rehta hai.",
      "Rang: hara = theek/pura, peela = baaki kaam, laal = dhyan do ya raddh, dhusar = band/purana.",
    ],
  },
];

// Which help section belongs to which screen (first match wins).
export function helpSectionFor(pathname: string): string {
  const rules: [string, string][] = [
    ["/items/import", "items"],
    ["/items/categories", "items"],
    ["/labels", "labels"],
    ["/items", "items"],
    ["/stock/scan", "count"],
    ["/stock/count", "count"],
    ["/stock", "count"],
    ["/receipts", "receiving"],
    ["/purchase-orders", "orders"],
    ["/transfers", "transfers"],
    ["/billing", "billing"],
    ["/bills", "billing"],
    ["/reports", "reports"],
    ["/locations", "places"],
    ["/suppliers", "suppliers"],
    ["/admin/users", "users"],
    ["/admin/settings", "settings"],
  ];
  const hit = rules.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.includes(prefix));
  return hit ? hit[1] : "start";
}
