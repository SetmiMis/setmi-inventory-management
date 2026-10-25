// Words on screen in two languages. English is the master list; the Hindi list must have the same keys
// (TypeScript checks this). Only shell screens are translated so far: menu, top bar, login and home.
// The deeper screens (forms, tables) are still English; see docs/features/FEATURE-012-LANGUAGES.md.

const en = {
  // menu
  nav_home: "Home", nav_items: "Items", nav_stock: "Stock", nav_purchase: "Purchase orders", nav_receipts: "Receipts",
  nav_transfers: "Transfers", nav_billing: "Billing", nav_bills: "Bills", nav_suppliers: "Suppliers", nav_reports: "Reports",
  nav_locations: "Locations", nav_users: "Users", nav_settings: "Settings", nav_help: "Help",
  // top bar
  top_signout: "Sign out", top_help: "Help", top_loading: "Loading...", top_working_in: "Working in",
  top_menu_open: "Open menu", top_menu_close: "Close menu", top_inactive: "Your account is created but not active yet. Please ask an administrator to activate it.",
  top_language: "Language",
  // login
  login_subtitle: "Inventory Management System", login_email: "Email", login_password: "Password",
  login_button: "Sign in", login_busy: "Signing in...",
  // home
  home_welcome: "Welcome", home_ask: "What do you want to do today?",
  home_denied: "You do not have access to that page. If you need it, ask your administrator.",
  home_no_perm: "You have not been given permission for any job yet. Ask your administrator to give you permissions and a place.",
  home_help_title: "Not sure what to do?", home_help_text: "Help has simple steps for every job. There is also a Help button at the top of every screen.", home_help_button: "Open Help",
  home_perm_title: "Your permissions", home_perm_admin: "Administrator: everything.", home_perm_none: "No permission has been given yet.",
  home_setup_title: "Getting started", home_setup_of: "done",
  task_items: "Find an item", task_items_hint: "Search by code, name or scan a barcode",
  task_receive: "Receive goods", task_receive_hint: "Goods have arrived: add them to stock",
  task_order: "Order goods from a supplier", task_order_hint: "Make a purchase order",
  task_count: "Count stock by scanning", task_count_hint: "Scan items to count them",
  task_stock: "See stock", task_stock_hint: "What is there, what is low",
  task_transfer: "Send goods to another place", task_transfer_hint: "Move goods between warehouses and shops",
  task_bill: "Make a bill", task_bill_hint: "Scan, bill, print",
  task_bills: "Bills", task_bills_hint: "See today's bills or void one",
  task_reports: "Reports", task_reports_hint: "Stock, sales, low stock, Excel download",
  task_suppliers: "Suppliers", task_suppliers_hint: "People you buy from",
  task_places: "Warehouses and shops", task_places_hint: "Create and see places",
  step_places: "Add your warehouses and shops", step_places_hint: "Locations > New warehouse or shop",
  step_staff: "Add your staff and give permissions", step_staff_hint: "Admin > Users (a new login is created in the Supabase dashboard)",
  step_items: "Add your items", step_items_hint: "Items > New item, or import from Excel",
  step_suppliers: "Add your suppliers", step_suppliers_hint: "Suppliers > New supplier",
  step_stock: "Enter opening stock", step_stock_hint: "Stock > Scan count, tick 'opening stock'",
  // help page
  help_title: "Help", help_intro: "Simple steps for every job. The Help button at the top always opens the part for the screen you are on.",
} as const;

export type MessageKey = keyof typeof en;

const hi: Record<MessageKey, string> = {
  nav_home: "होम", nav_items: "आइटम", nav_stock: "स्टॉक", nav_purchase: "खरीद ऑर्डर", nav_receipts: "माल की आवक",
  nav_transfers: "ट्रांसफर", nav_billing: "बिलिंग", nav_bills: "बिल", nav_suppliers: "सप्लायर", nav_reports: "रिपोर्ट",
  nav_locations: "गोदाम और दुकान", nav_users: "यूज़र", nav_settings: "सेटिंग", nav_help: "मदद",
  top_signout: "लॉग आउट", top_help: "मदद", top_loading: "लोड हो रहा है...", top_working_in: "काम की जगह",
  top_menu_open: "मेनू खोलें", top_menu_close: "मेनू बंद करें", top_inactive: "आपका अकाउंट बन गया है पर अभी चालू नहीं हुआ है। कृपया एडमिन से चालू करवाएँ।",
  top_language: "भाषा",
  login_subtitle: "इन्वेंटरी मैनेजमेंट सिस्टम", login_email: "ईमेल", login_password: "पासवर्ड",
  login_button: "लॉग इन", login_busy: "लॉग इन हो रहा है...",
  home_welcome: "स्वागत है", home_ask: "आज आप क्या करना चाहते हैं?",
  home_denied: "आपको उस पेज की अनुमति नहीं है। ज़रूरत हो तो अपने एडमिन से कहें।",
  home_no_perm: "अभी आपको किसी काम की अनुमति नहीं मिली है। अपने एडमिन से अनुमति और जगह देने को कहें।",
  home_help_title: "समझ नहीं आ रहा?", home_help_text: "मदद में हर काम के आसान स्टेप हैं। हर स्क्रीन के ऊपर \"मदद\" बटन भी है।", home_help_button: "मदद खोलें",
  home_perm_title: "आपकी अनुमतियाँ", home_perm_admin: "एडमिन: सब कुछ।", home_perm_none: "अभी कोई अनुमति नहीं मिली है।",
  home_setup_title: "शुरुआत कैसे करें", home_setup_of: "हो गया",
  task_items: "आइटम ढूँढें", task_items_hint: "कोड, नाम से खोजें या बारकोड स्कैन करें",
  task_receive: "माल लें (आवक)", task_receive_hint: "माल आ गया है: स्टॉक में जोड़ें",
  task_order: "सप्लायर को ऑर्डर दें", task_order_hint: "खरीद ऑर्डर बनाएँ",
  task_count: "स्कैन करके स्टॉक गिनें", task_count_hint: "आइटम स्कैन करके गिनती करें",
  task_stock: "स्टॉक देखें", task_stock_hint: "क्या कितना है, क्या कम है",
  task_transfer: "दूसरी जगह माल भेजें", task_transfer_hint: "गोदाम और दुकान के बीच माल भेजें",
  task_bill: "बिल बनाएँ", task_bill_hint: "स्कैन करें, बिल बनाएँ, प्रिंट करें",
  task_bills: "बिल", task_bills_hint: "आज के बिल देखें या रद्द करें",
  task_reports: "रिपोर्ट", task_reports_hint: "स्टॉक, बिक्री, कम स्टॉक, Excel डाउनलोड",
  task_suppliers: "सप्लायर", task_suppliers_hint: "जिनसे आप माल खरीदते हैं",
  task_places: "गोदाम और दुकान", task_places_hint: "जगहें बनाएँ और देखें",
  step_places: "अपने गोदाम और दुकानें जोड़ें", step_places_hint: "Locations > New warehouse or shop",
  step_staff: "अपना स्टाफ जोड़ें और अनुमति दें", step_staff_hint: "Admin > Users (नया लॉगिन Supabase डैशबोर्ड में बनता है)",
  step_items: "अपने आइटम जोड़ें", step_items_hint: "Items > New item, या Excel से इम्पोर्ट करें",
  step_suppliers: "अपने सप्लायर जोड़ें", step_suppliers_hint: "Suppliers > New supplier",
  step_stock: "शुरुआती स्टॉक डालें", step_stock_hint: "Stock > Scan count, 'opening stock' पर टिक करें",
  help_title: "मदद", help_intro: "हर काम के आसान स्टेप। ऊपर का \"मदद\" बटन हमेशा उसी स्क्रीन का हिस्सा खोलता है जिस पर आप हैं।",
};

export const MESSAGES: Record<"en" | "hi", Record<MessageKey, string>> = { en, hi };
