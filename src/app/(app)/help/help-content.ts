// The words of the Help page, in English and Hindi (Devanagari). One list per language, same section ids.
// The "Help" button in the top bar opens the section that matches the screen you are on.
// Keep every step short and true to what the screens really do (button names are quoted in English because
// the buttons on screen are still in English).

export type HelpSection = {
  id: string;
  title: string;
  short: string;
  intro: string;
  steps: string[];
  tips?: string[];
};

const EN: HelpSection[] = [
  {
    id: "start", title: "First time: sign in and your place", short: "Start",
    intro: "Everything works for your 'working place' (a warehouse or a shop).",
    steps: [
      "Sign in with your email and password. If you forgot the password, ask the admin to set a new one.",
      "At the top you see 'Working in' with your place. If you work in more than one place, you can change it there.",
      "The menu on the left (the menu button at the top on a phone) shows only the things you are allowed to do.",
      "Cannot see a button or menu? It means you have not been given permission for it. Ask the admin.",
    ],
    tips: ["Look at the top first to be sure the right place is selected before you start."],
  },
  {
    id: "search", title: "Search anything fast (Ctrl+K) and the phone bar", short: "Search",
    intro: "One search box finds items and takes you to any page. You never have to hunt through the menu.",
    steps: [
      "Press Ctrl+K (or the / key) anywhere, or tap 'Search or jump to...' at the top.",
      "Type an item code, part of the name, or scan the barcode: the item opens straight away.",
      "Or type a page name (for example 'receipts') or a job (for example 'new purchase order') and press Enter.",
      "Use the up and down keys to choose, Enter to open, Esc to close. Pages you opened recently are listed first.",
      "On a phone, the bar at the bottom has the four things used most. The menu button at the top has everything else.",
    ],
    tips: ["The search only shows what you are allowed to open."],
  },
  {
    id: "items", title: "Making and finding items", short: "Items",
    intro: "An item is your product (for example a BNC connector). Every item has a unique code.",
    steps: [
      "Open Items. Type a code or name in the search box, or scan a barcode. A scan opens that item straight away.",
      "New item: press 'New item'. Required: Internal item code, Item name, Selling item name (the name printed on the customer's bill) and Unit.",
      "Choose the unit: PCS (counted), MTR (metre, up to 3 decimals), KG, BOX, SET.",
      "After saving, open the item to make a barcode and to add photos or a datasheet.",
      "Many items at once: 'Import Excel'. First press 'Check file (nothing is saved yet)': it shows problems with row and column. Nothing is saved until you press 'Import ... items'.",
    ],
    tips: ["An item cannot be deleted. If you do not need it, press 'Archive item'; 'Restore item' brings it back."],
  },
  {
    id: "labels", title: "Printing barcode labels", short: "Labels",
    intro: "A label shows the item's barcode and code.",
    steps: [
      "On the item page press 'Print labels', or after receiving goods use 'Print labels for these items' on the receipt.",
      "Choose the label size and how many copies, then press Print.",
      "Any printer works. If the label is cut off, change 'Scale' or 'Margins' in the print window.",
    ],
  },
  {
    id: "orders", title: "Ordering goods (Purchase order)", short: "Orders",
    intro: "A purchase order is the order you give a supplier. It tells you how much you ordered and how much has arrived.",
    steps: [
      "Purchase orders > New order. Choose the supplier, add items by scan or search and enter quantities.",
      "'Save draft' only saves. You can change a draft any time.",
      "When ready press 'Send order' (needs the approve permission). A sent order cannot be changed.",
      "'Print order' gives an A4 page for the supplier.",
      "The order shows Ordered, Received and Still open for each item. When everything has arrived the status becomes 'Completed'.",
      "If the supplier will not send the rest: press 'Close order' and write the reason.",
    ],
    tips: [
      "Sent order is wrong? If nothing was received, press 'Cancel order' and make a new one.",
      "A person who makes orders also needs the 'items.view' permission, otherwise items will not show.",
    ],
  },
  {
    id: "receiving", title: "Goods arriving (Goods receipt)", short: "Receiving",
    intro: "A receipt is made when goods arrive. Stock goes up only when you 'post' the receipt.",
    steps: [
      "Receipts > New receipt. If the goods have a purchase order, pick the order from the list at the top: supplier and quantities are filled in.",
      "No order? Choose the supplier and add items by scan (each scan adds 1 piece) or search. Type the quantity yourself for metre or kg items.",
      "Write the supplier invoice number. The same supplier invoice cannot be received twice.",
      "Count that what you typed is what arrived. Then press 'Save draft' (stock does not change yet) or 'Save and post' (stock goes up now).",
      "After posting a receipt cannot be changed.",
      "You cannot receive more than the order. More goods came? Make a separate receipt without an order, or ask the admin.",
    ],
    tips: [
      "Found a mistake in a posted receipt? It cannot be edited. Fix the stock with 'Count stock' and write the reason.",
      "A draft receipt can be removed with 'Cancel draft'.",
    ],
  },
  {
    id: "count", title: "Counting stock", short: "Counting",
    intro: "Counting makes the system stock equal to the real stock. Every change is recorded.",
    steps: [
      "Open Stock: it shows the stock of your place.",
      "'Scan count': scan each item. Every scan adds 1 piece. Type the quantity yourself for metre or kg items.",
      "'Count stock': type the counted number next to each item.",
      "At the end write a reason (for example 'monthly count') and save. Only the numbers that changed are recorded.",
      "For the very first stock entry tick 'opening stock'.",
    ],
    tips: ["Stock can never go below zero."],
  },
  {
    id: "entry", title: "Quick Stock In / Out (sold in Zoho, sample, damage, return)", short: "Stock In/Out",
    intro: "For goods that leave or come back without a receipt or a bill in this system. While bills are made in Zoho, enter the day's sales here so the stock stays right.",
    steps: [
      "Open 'Stock In / Out' in the menu (or the button on the Stock page).",
      "Press the big 'Stock Out' or 'Stock In' button.",
      "Choose why: Sold (billed in Zoho), Sample, Damaged, Own use, Lost, Returned to supplier, or Found, Customer return. 'Other' needs a remark.",
      "Scan the items (each scan adds 1 piece) or search them. Type the quantity for metre or kg items.",
      "Optionally write the Zoho bill number as Reference. Press 'Save entry'. Stock changes at once.",
    ],
    tips: [
      "You cannot take out more than is in stock; the screen tells you which item is short.",
      "An entry cannot be changed. If you made a mistake, make the opposite entry (Stock In for a wrong Stock Out).",
    ],
  },
  {
    id: "reorder", title: "What to order (Reorder)", short: "Reorder",
    intro: "The system works out what to order from how fast each item really goes, like the shop sheet did.",
    steps: [
      "Fill 'Reorder planning' on each item once: lead time in days (from order to arrival), safety factor (empty = 1.5) and MOQ if the supplier has one.",
      "Open 'Reorder' in the menu. Choose the place and the period for the average (30, 60 or 90 days).",
      "Target = average daily use x lead time x safety factor. Order = target minus what is in stock, on order and on the way, rounded up to the MOQ.",
      "'Days left' in red means the stock will run out before a new order can arrive.",
      "Tick the items, choose a supplier and press 'Create draft order'. A draft purchase order opens: check it, add prices, then send it.",
    ],
    tips: ["Items without a lead time use the manual maximum from the Stock page, if one is set."],
  },
  {
    id: "transfers", title: "Sending goods to another place (Transfer)", short: "Transfers",
    intro: "Moving goods from one place to another. While on the way they are 'On the way' (in transit).",
    steps: [
      "Transfers > New transfer. Choose where to send, add items and quantities.",
      "Pressing 'Save and send (stock leaves)' reduces your place's stock and the transfer shows 'On the way'.",
      "At the other place the user opens the transfer, types how much really arrived and receives it.",
      "If less arrived it is noted as a 'shortage'; goods lost on the way leave the stock.",
      "Sent by mistake and not yet received? The sender can press 'Recall'.",
    ],
  },
  {
    id: "billing", title: "Making a bill (in the shop)", short: "Billing",
    intro: "Billing works only when the admin has switched billing ON in Settings. Tax (GST) is not added yet: this is not a tax invoice.",
    steps: [
      "Choose your shop at the top. Open Billing in the menu.",
      "Scan the item barcode or search. You can change the quantity.",
      "Enter a discount if any. Choose payment: Cash, UPI, Card or Other. Customer name and phone are optional.",
      "Press 'Complete bill'. The bill is made and stock goes down by itself. Then you can print the receipt.",
      "Wrong bill? Open it in Bills and 'Void' it with a reason. The goods go back to stock and the bill stays as 'Voided'.",
    ],
    tips: [
      "An item without a selling price cannot be billed. Ask for the price to be entered on the item page.",
      "If you also bill in Zoho, never make the same sale in both places.",
    ],
  },
  {
    id: "reports", title: "Reports and downloading to Excel", short: "Reports",
    intro: "Reports tell you what you have, what is low and what sold.",
    steps: [
      "Open Reports and choose a report: Stock by place, Low stock, Sales per day, What sold, Slow stock.",
      "Choose the place and dates and press 'Show'.",
      "'Download CSV' gives a file that opens straight in Excel (needs the export permission).",
    ],
    tips: ["Sales reports fill up only when bills are made in this system."],
  },
  {
    id: "places", title: "Warehouses and shops (Locations)", short: "Places",
    intro: "Every godown and shop is a 'place'. The admin creates them and decides who works where.",
    steps: [
      "Locations > New warehouse or shop. Write a code (a short name like WH1) and a name.",
      "In Admin > Users give each user their place and permissions.",
    ],
  },
  {
    id: "suppliers", title: "Suppliers", short: "Suppliers",
    intro: "The list of people you buy goods from.",
    steps: [
      "Suppliers > New supplier. The name is required; phone, address and GSTIN (15 letters/digits) are optional.",
      "If you no longer need a supplier press 'Archive'.",
    ],
  },
  {
    id: "users", title: "Users and permissions (admin only)", short: "Users",
    intro: "Give each person only the jobs that are theirs.",
    steps: [
      "A new login is created in the Supabase dashboard (Authentication > Users) for now: the admin or developer does this. Then tick 'Active' next to that name in Admin > Users.",
      "Choose their place (location) and switch ON the permissions: for example view items, make receipts, post receipts, make bills.",
      "Seeing buying prices needs a separate permission: 'receipts.cost'. Give it only to those who need it.",
    ],
    tips: ["To remove someone, untick 'Active'. The old records stay safe."],
  },
  {
    id: "settings", title: "Settings (admin only)", short: "Settings",
    intro: "At the moment this has the billing ON/OFF switch.",
    steps: [
      "Switch billing ON only when you want to bill from this system.",
      "Every ON/OFF change is recorded (who changed it and when).",
    ],
  },
  {
    id: "scanner", title: "Scanner tips", short: "Scanner",
    intro: "A USB scanner works like a keyboard: it types the barcode and presses Enter.",
    steps: [
      "Click in the box that says 'Scan here' (the cursor should blink), then scan.",
      "A good beep = the item was found. A different, harsh beep = the barcode is not in the system or the item is archived.",
      "If the same barcode is scanned twice very quickly, the second one is ignored (to avoid doubles).",
    ],
    tips: ["Barcode not working? Search by code or name and add the item that way."],
  },
  {
    id: "mistakes", title: "I made a mistake, what now?", short: "Mistakes",
    intro: "Old records are never erased, so mistakes are corrected in a different way.",
    steps: [
      "Draft receipt, draft order, draft transfer: change it directly or cancel it.",
      "A posted receipt was wrong: use 'Count stock', type the right quantity and write the reason.",
      "A wrong bill: 'Void' it (a reason is required).",
      "A sent transfer that is not received yet: 'Recall' it.",
      "A sent order: if nothing came, cancel it; if some came, 'Close order'.",
    ],
    tips: ["If you are not sure, change nothing and show a screenshot to the admin."],
  },
  {
    id: "words", title: "What the words mean", short: "Words",
    intro: "Some words you will see on screen.",
    steps: [
      "Draft: only written down, stock does not change. Can be edited.",
      "Post / Posted: final, stock has changed. Cannot be edited any more.",
      "Receipt (GRN): the slip for goods that arrived.",
      "Purchase order (PO): the order given to a supplier.",
      "Transfer: sending goods from one place to another. In transit = on the way.",
      "Void / Voided: a bill was cancelled (stock came back, the record stays).",
      "Minimum level: if stock falls below it, 'Low' is shown.",
      "Unit: how the item is measured: PCS, MTR, KG, BOX, SET.",
      "Archive: the item or supplier is no longer used but the record stays.",
      "Colours: green = fine/complete, yellow = work pending, red = attention or cancelled, grey = closed/old.",
    ],
  },
];

const HI: HelpSection[] = [
  {
    id: "start", title: "पहली बार: लॉग इन और आपकी जगह", short: "शुरुआत",
    intro: "सब कुछ आपकी \"काम की जगह\" (गोदाम या दुकान) के हिसाब से चलता है।",
    steps: [
      "अपने ईमेल और पासवर्ड से लॉग इन करें। पासवर्ड भूल गए हों तो एडमिन से नया बनवाएँ।",
      "ऊपर \"काम की जगह\" में आपकी जगह दिखती है। अगर आप एक से ज़्यादा जगह काम करते हैं तो वहीं से जगह बदल सकते हैं।",
      "बाईं तरफ का मेनू (फ़ोन पर ऊपर का मेनू बटन) वही चीज़ें दिखाता है जिनकी आपको अनुमति है।",
      "कोई बटन या मेनू नहीं दिख रहा? मतलब आपको उसकी अनुमति नहीं मिली है। एडमिन से कहें।",
    ],
    tips: ["काम शुरू करने से पहले ऊपर देख लें कि सही जगह चुनी हुई है।"],
  },
  {
    id: "search", title: "कुछ भी जल्दी खोजें (Ctrl+K) और फ़ोन की नीचे वाली पट्टी", short: "खोज",
    intro: "एक ही खोज बॉक्स आइटम ढूँढता है और किसी भी पेज पर ले जाता है। मेनू में ढूँढना नहीं पड़ता।",
    steps: [
      "कहीं भी Ctrl+K (या / कुंजी) दबाएँ, या ऊपर 'खोजें या कहीं भी जाएँ...' पर टैप करें।",
      "आइटम का कोड, नाम का हिस्सा लिखें या बारकोड स्कैन करें: आइटम सीधे खुल जाता है।",
      "या पेज का नाम (जैसे 'receipts') या कोई काम (जैसे 'new purchase order') लिखकर Enter दबाएँ।",
      "ऊपर-नीचे कुंजी से चुनें, Enter से खोलें, Esc से बंद करें। हाल में खोले पेज सबसे ऊपर दिखते हैं।",
      "फ़ोन पर नीचे की पट्टी में सबसे ज़्यादा इस्तेमाल होने वाली चार चीज़ें हैं। बाकी सब ऊपर के मेनू बटन में।",
    ],
    tips: ["खोज सिर्फ़ वही दिखाती है जो आप खोल सकते हैं।"],
  },
  {
    id: "items", title: "आइटम बनाना और ढूँढना", short: "आइटम",
    intro: "आइटम मतलब आपका माल (जैसे BNC कनेक्टर)। हर आइटम का एक अलग कोड होता है।",
    steps: [
      "Items खोलें। सर्च बॉक्स में कोड या नाम लिखें, या बारकोड स्कैन करें। स्कैन करते ही वही आइटम खुल जाता है।",
      "नया आइटम: 'New item' दबाएँ। ज़रूरी: Internal item code, Item name, Selling item name (जो नाम ग्राहक के बिल पर आएगा) और Unit।",
      "Unit चुनें: PCS (गिनकर), MTR (मीटर, 3 दशमलव तक), KG, BOX, SET।",
      "सेव होने के बाद आइटम के पेज पर बारकोड बना सकते हैं और फोटो या डेटाशीट लगा सकते हैं।",
      "बहुत सारे आइटम एक साथ: 'Import Excel' से। पहले 'Check file (nothing is saved yet)' दबाएँ: सिस्टम पंक्ति और कॉलम के साथ गलती बताता है। कुछ भी तभी सेव होता है जब आप 'Import ... items' दबाएँ।",
    ],
    tips: ["आइटम डिलीट नहीं हो सकता। ज़रूरत न हो तो 'Archive item' करें; 'Restore item' से वापस आ जाता है।"],
  },
  {
    id: "labels", title: "बारकोड लेबल प्रिंट करना", short: "लेबल",
    intro: "लेबल पर आइटम का बारकोड और कोड छपता है।",
    steps: [
      "आइटम के पेज पर 'Print labels' दबाएँ, या माल लेने के बाद रसीद के पेज से 'Print labels for these items'।",
      "लेबल का साइज़ और कितने लेबल चाहिए, यह चुनें, फिर Print दबाएँ।",
      "प्रिंटर कोई भी चलेगा। लेबल कट रहा हो तो प्रिंट विंडो में 'Scale' या 'Margins' बदल लें।",
    ],
  },
  {
    id: "orders", title: "माल मँगवाना (खरीद ऑर्डर)", short: "ऑर्डर",
    intro: "खरीद ऑर्डर वह ऑर्डर है जो आप सप्लायर को देते हैं। इससे पता रहता है कि कितना मँगवाया और कितना आया।",
    steps: [
      "Purchase orders > New order। सप्लायर चुनें, आइटम स्कैन या सर्च से जोड़ें और मात्रा लिखें।",
      "'Save draft' से सिर्फ़ सेव होता है। ड्राफ़्ट में कभी भी बदलाव कर सकते हैं।",
      "तैयार होने पर 'Send order' दबाएँ (इसके लिए approve की अनुमति चाहिए)। भेजे हुए ऑर्डर में बदलाव नहीं होता।",
      "'Print order' से सप्लायर को देने के लिए A4 पेज मिलता है।",
      "ऑर्डर में हर आइटम का Ordered, Received और Still open दिखता है। सब आ जाए तो स्टेटस 'Completed' हो जाता है।",
      "अगर सप्लायर बाकी माल नहीं भेजेगा: 'Close order' दबाएँ और कारण लिखें।",
    ],
    tips: [
      "भेजा हुआ ऑर्डर ग़लत है? अगर कुछ नहीं आया तो 'Cancel order' करके नया बनाएँ।",
      "ऑर्डर बनाने वाले को 'items.view' की अनुमति भी चाहिए, वरना आइटम नहीं दिखेंगे।",
    ],
  },
  {
    id: "receiving", title: "माल आना (गुड्स रसीद)", short: "आवक",
    intro: "जब माल गोदाम में आता है तब रसीद बनती है। रसीद 'post' करते ही स्टॉक बढ़ता है।",
    steps: [
      "Receipts > New receipt। अगर इस माल का खरीद ऑर्डर है तो ऊपर की सूची से ऑर्डर चुनें: सप्लायर और मात्रा अपने आप भर जाती हैं।",
      "ऑर्डर नहीं है? सप्लायर चुनें, आइटम स्कैन (हर स्कैन 1 पीस जोड़ता है) या सर्च से जोड़ें। मीटर या किलो वाले आइटम की मात्रा खुद लिखें।",
      "सप्लायर का इनवॉइस नंबर लिखें। एक ही सप्लायर का एक ही इनवॉइस दोबारा नहीं लिया जा सकता।",
      "गिनकर देख लें कि जो लिखा है वही आया है। फिर 'Save draft' (स्टॉक अभी नहीं बढ़ेगा) या 'Save and post' (स्टॉक अभी बढ़ेगा) दबाएँ।",
      "post होने के बाद रसीद बदली नहीं जा सकती।",
      "ऑर्डर से ज़्यादा मात्रा नहीं ली जा सकती। ज़्यादा माल आया है? अलग रसीद (बिना ऑर्डर) बनाएँ या एडमिन से पूछें।",
    ],
    tips: [
      "post हो चुकी रसीद में गलती मिली? रसीद edit नहीं होती। स्टॉक ठीक करने के लिए 'Count stock' करें और कारण लिखें।",
      "ड्राफ़्ट रसीद को 'Cancel draft' से हटा सकते हैं।",
    ],
  },
  {
    id: "count", title: "स्टॉक गिनना", short: "गिनती",
    intro: "गिनती से सिस्टम का स्टॉक असली स्टॉक के बराबर होता है। हर बदलाव का रिकॉर्ड रहता है।",
    steps: [
      "Stock खोलें: वहाँ आपकी जगह का स्टॉक दिखता है।",
      "'Scan count': हर आइटम को स्कैन करते जाएँ। हर स्कैन 1 पीस जोड़ता है। मीटर या किलो वाले आइटम की मात्रा खुद लिखें।",
      "'Count stock': सूची में हर आइटम के सामने गिना हुआ नंबर लिखें।",
      "आख़िर में कारण लिखें (जैसे 'महीने की गिनती') और सेव करें। जो नंबर बदला, सिर्फ़ उसी का रिकॉर्ड बनता है।",
      "पहली बार स्टॉक डाल रहे हों तो 'opening stock' पर टिक करें।",
    ],
    tips: ["स्टॉक कभी माइनस नहीं हो सकता।"],
  },
  {
    id: "entry", title: "जल्दी स्टॉक इन / आउट (Zoho में बिका, सैंपल, ख़राब, वापसी)", short: "स्टॉक इन/आउट",
    intro: "उस माल के लिए जो इस सिस्टम में बिना रसीद या बिल के जाता या लौटता है। जब तक बिल Zoho में बन रहे हैं, दिन की बिक्री यहाँ डालें ताकि स्टॉक सही रहे।",
    steps: [
      "मेनू में 'स्टॉक इन / आउट' खोलें (या Stock पेज का बटन)।",
      "बड़ा 'स्टॉक आउट' या 'स्टॉक इन' बटन दबाएँ।",
      "कारण चुनें: बिका (Zoho में बिल), सैंपल, ख़राब, अपने इस्तेमाल में, गुम, सप्लायर को वापस, या मिला, ग्राहक ने लौटाया। 'अन्य' के लिए टिप्पणी ज़रूरी है।",
      "आइटम स्कैन करें (हर स्कैन 1 पीस जोड़ता है) या खोजें। मीटर या किलो वाले आइटम की मात्रा लिखें।",
      "चाहें तो Zoho बिल नंबर रेफ़रेंस में लिखें। 'सेव करें' दबाएँ। स्टॉक तुरंत बदल जाता है।",
    ],
    tips: [
      "स्टॉक से ज़्यादा बाहर नहीं निकाल सकते; स्क्रीन बताती है कौन सा आइटम कम है।",
      "एंट्री बदली नहीं जा सकती। गलती हो तो उल्टी एंट्री करें (गलत स्टॉक आउट के लिए स्टॉक इन)।",
    ],
  },
  {
    id: "reorder", title: "क्या मँगवाना है (Reorder)", short: "रीऑर्डर",
    intro: "सिस्टम हर आइटम की असली खपत देखकर बताता है कि क्या और कितना मँगवाना है, जैसे शॉप वाली शीट करती थी।",
    steps: [
      "हर आइटम पर एक बार 'Reorder planning' भरें: लीड टाइम दिनों में (ऑर्डर से माल आने तक), सेफ़्टी फ़ैक्टर (खाली = 1.5) और सप्लायर का MOQ।",
      "मेनू में 'फिर से मँगवाएँ' खोलें। जगह और औसत का समय (30, 60 या 90 दिन) चुनें।",
      "टारगेट = रोज़ की औसत खपत x लीड टाइम x सेफ़्टी फ़ैक्टर। ऑर्डर = टारगेट में से स्टॉक, ऑर्डर पर और रास्ते का माल घटाकर, MOQ तक ऊपर।",
      "लाल 'Days left' का मतलब है नया माल आने से पहले स्टॉक ख़त्म हो जाएगा।",
      "आइटम पर टिक करें, सप्लायर चुनें और 'Create draft order' दबाएँ। ड्राफ़्ट खरीद ऑर्डर खुलता है: जाँचें, दाम डालें, फिर भेजें।",
    ],
    tips: ["जिस आइटम का लीड टाइम नहीं भरा, उसके लिए Stock पेज का मैनुअल अधिकतम (अगर भरा हो) इस्तेमाल होता है।"],
  },
  {
    id: "transfers", title: "दूसरी जगह माल भेजना (ट्रांसफर)", short: "ट्रांसफर",
    intro: "एक जगह से दूसरी जगह माल भेजना। रास्ते में माल 'On the way' (in transit) कहलाता है।",
    steps: [
      "Transfers > New transfer। कहाँ भेजना है चुनें, आइटम और मात्रा जोड़ें।",
      "'Save and send (stock leaves)' दबाते ही आपकी जगह का स्टॉक घट जाता है और ट्रांसफर 'On the way' दिखता है।",
      "जहाँ माल पहुँचा, वहाँ का यूज़र ट्रांसफर खोलकर लिखता है कि असल में कितना मिला और उसे receive करता है।",
      "कम मिला तो वह 'shortage' के रूप में लिखा जाता है; रास्ते में कम हुआ माल स्टॉक से हट जाता है।",
      "ग़लती से भेज दिया और अभी receive नहीं हुआ? भेजने वाला 'Recall' कर सकता है।",
    ],
  },
  {
    id: "billing", title: "बिल बनाना (दुकान पर)", short: "बिलिंग",
    intro: "बिलिंग तभी चलती है जब एडमिन ने Settings में बिलिंग ON की हो। अभी टैक्स (GST) नहीं जुड़ा है, यह टैक्स इनवॉइस नहीं है।",
    steps: [
      "ऊपर अपनी दुकान चुनें। मेनू में Billing खोलें।",
      "आइटम का बारकोड स्कैन करें या सर्च करें। मात्रा बदल सकते हैं।",
      "डिस्काउंट हो तो लिखें। पेमेंट चुनें: Cash, UPI, Card या Other। ग्राहक का नाम और फ़ोन लिखना ज़रूरी नहीं।",
      "'Complete bill' दबाएँ। बिल बन जाता है और स्टॉक अपने आप घट जाता है। फिर रसीद प्रिंट कर सकते हैं।",
      "गलत बिल? Bills में बिल खोलकर कारण के साथ 'Void' करें। माल वापस स्टॉक में आ जाता है और बिल 'Voided' दिखता रहता है।",
    ],
    tips: [
      "जिस आइटम का सेलिंग प्राइस नहीं भरा, उसका बिल नहीं बन सकता। आइटम के पेज पर प्राइस भरवाएँ।",
      "अगर Zoho में भी बिल कर रहे हैं तो एक ही बिक्री दोनों जगह मत बनाएँ।",
    ],
  },
  {
    id: "reports", title: "रिपोर्ट और Excel में डाउनलोड", short: "रिपोर्ट",
    intro: "रिपोर्ट से पता चलता है कि क्या कितना है, क्या कम है और क्या बिका।",
    steps: [
      "Reports खोलें और रिपोर्ट चुनें: Stock by place, Low stock, Sales per day, What sold, Slow stock।",
      "जगह और तारीख़ चुनें, 'Show' दबाएँ।",
      "'Download CSV' से फ़ाइल मिलती है जो सीधे Excel में खुलती है (इसके लिए export की अनुमति चाहिए)।",
    ],
    tips: ["बिक्री की रिपोर्ट तभी भरती है जब बिल इसी सिस्टम में बने हों।"],
  },
  {
    id: "places", title: "गोदाम और दुकान (Locations)", short: "जगहें",
    intro: "हर गोदाम और दुकान एक \"जगह\" है। एडमिन इन्हें बनाता है और तय करता है कि कौन कहाँ काम करे।",
    steps: [
      "Locations > New warehouse or shop। कोड (छोटा नाम, जैसे WH1) और नाम लिखें।",
      "Admin > Users में हर यूज़र को उसकी जगह और अनुमतियाँ दें।",
    ],
  },
  {
    id: "suppliers", title: "सप्लायर", short: "सप्लायर",
    intro: "जिनसे आप माल खरीदते हैं उनकी सूची।",
    steps: [
      "Suppliers > New supplier। नाम ज़रूरी है; फ़ोन, पता और GSTIN (15 अक्षर/अंक) लिख सकते हैं।",
      "पुराना सप्लायर अब नहीं चाहिए तो 'Archive' करें।",
    ],
  },
  {
    id: "users", title: "यूज़र और अनुमतियाँ (सिर्फ़ एडमिन)", short: "यूज़र",
    intro: "हर आदमी को वही काम दें जो उसका है।",
    steps: [
      "नया लॉगिन अभी Supabase डैशबोर्ड (Authentication > Users) में बनता है: यह काम एडमिन या डेवलपर करता है। फिर Admin > Users में उस नाम के सामने 'Active' पर टिक करें।",
      "उसकी जगह (location) चुनें और अनुमतियों के स्विच ON करें: जैसे आइटम देखना, रसीद बनाना, रसीद post करना, बिल बनाना।",
      "खरीद के दाम देखने की अलग अनुमति है: 'receipts.cost'। सिर्फ़ उसे दें जिसे ज़रूरत हो।",
    ],
    tips: ["किसी को हटाना हो तो 'Active' का टिक हटाएँ। पुराना रिकॉर्ड सुरक्षित रहता है।"],
  },
  {
    id: "settings", title: "सेटिंग (सिर्फ़ एडमिन)", short: "सेटिंग",
    intro: "अभी यहाँ बिलिंग ON/OFF का स्विच है।",
    steps: [
      "बिलिंग तभी ON करें जब आप इसी सिस्टम से बिल करना चाहते हों।",
      "बिलिंग ON/OFF हर बार रिकॉर्ड होता है (किसने कब बदला)।",
    ],
  },
  {
    id: "scanner", title: "स्कैनर के टिप्स", short: "स्कैनर",
    intro: "USB स्कैनर कीबोर्ड की तरह काम करता है: बारकोड लिखता है और Enter दबाता है।",
    steps: [
      "जिस बॉक्स में 'Scan here' लिखा हो उसमें क्लिक करें (कर्सर चमकता दिखे), फिर स्कैन करें।",
      "अच्छी बीप = आइटम मिल गया। अलग, खराब बीप = बारकोड सिस्टम में नहीं है या आइटम archive है।",
      "एक ही बारकोड बहुत जल्दी दो बार स्कैन हो जाए तो दूसरा छोड़ दिया जाता है (गलती से डबल न हो)।",
    ],
    tips: ["बारकोड नहीं चल रहा? कोड या नाम से सर्च करके आइटम जोड़ लें।"],
  },
  {
    id: "mistakes", title: "गलती हो गई तो क्या करें?", short: "गलती",
    intro: "पुराना रिकॉर्ड मिटाया नहीं जाता, इसलिए गलती सुधारने का तरीका अलग है।",
    steps: [
      "ड्राफ़्ट रसीद, ड्राफ़्ट ऑर्डर, ड्राफ़्ट ट्रांसफर: सीधे बदल सकते हैं या cancel कर सकते हैं।",
      "post हो चुकी रसीद गलत थी: 'Count stock' करके सही मात्रा लिखें और कारण लिखें।",
      "गलत बिल: 'Void' करें (कारण लिखना ज़रूरी है)।",
      "भेजा हुआ ट्रांसफर जो अभी receive नहीं हुआ: 'Recall' करें।",
      "भेजा हुआ ऑर्डर: कुछ नहीं आया तो cancel करें; कुछ आ चुका है तो 'Close order' करें।",
    ],
    tips: ["समझ न आए तो कुछ न बदलें और एडमिन को स्क्रीनशॉट दिखाएँ।"],
  },
  {
    id: "words", title: "शब्दों का मतलब", short: "शब्द",
    intro: "स्क्रीन पर आने वाले कुछ शब्द।",
    steps: [
      "Draft: अभी सिर्फ़ लिखा है, स्टॉक पर असर नहीं। बदला जा सकता है।",
      "Post / Posted: पक्का हो गया, स्टॉक बदल गया। अब बदला नहीं जा सकता।",
      "रसीद (GRN): माल आने की पर्ची।",
      "खरीद ऑर्डर (PO): सप्लायर को दिया ऑर्डर।",
      "ट्रांसफर: एक जगह से दूसरी जगह माल भेजना। In transit = रास्ते में।",
      "Void / Voided: बिल रद्द किया गया (स्टॉक वापस आया, रिकॉर्ड बचा)।",
      "Minimum level: इससे नीचे स्टॉक जाए तो 'Low' दिखता है।",
      "Unit: माल किस माप में है: PCS, MTR, KG, BOX, SET।",
      "Archive: आइटम/सप्लायर अब इस्तेमाल में नहीं पर रिकॉर्ड रहता है।",
      "रंग: हरा = ठीक/पूरा, पीला = काम बाकी, लाल = ध्यान दें या रद्द, स्लेटी = बंद/पुराना।",
    ],
  },
];

export function helpSections(lang: "en" | "hi"): HelpSection[] {
  return lang === "hi" ? HI : EN;
}

// Which help section belongs to which screen (first match wins).
export function helpSectionFor(pathname: string): string {
  const rules: [string, string][] = [
    ["/items/import", "items"],
    ["/items/categories", "items"],
    ["/labels", "labels"],
    ["/items", "items"],
    ["/stock/entry", "entry"],
    ["/reorder", "reorder"],
    ["/stock/scan", "count"],
    ["/stock/count", "count"],
    ["/stock", "count"],
    ["/receipts", "receiving"],
    ["/purchase-orders", "orders"],
    ["/transfers", "transfers"],
    ["/billing", "billing"],
    ["/bills", "billing"],
    ["/reports", "reports"],
    ["/dashboard", "reports"],
    ["/locations", "places"],
    ["/suppliers", "suppliers"],
    ["/admin/users", "users"],
    ["/admin/settings", "settings"],
  ];
  const hit = rules.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.includes(prefix));
  return hit ? hit[1] : "start";
}
