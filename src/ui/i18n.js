/**
 * Lightweight bilingual dictionary for the extension UI.
 * Persian strings are hand-written for natural phrasing, not machine-translated.
 */

export const DICT = {
  "app.tagline": {
    en: "Bilingual type intelligence",
    fa: "هوش تایپوگرافی دوزبانه",
  },
  "master.on": {
    en: "Turn RTL Atelier on or off everywhere",
    fa: "روشن یا خاموش کردن RTL Atelier در همه‌جا",
  },
  "site.title": { en: "Current site", fa: "سایت فعلی" },
  "site.switch": {
    en: "Enable RTL Atelier on this site",
    fa: "فعال‌سازی RTL Atelier در این سایت",
  },
  "site.noPage": { en: "No page", fa: "صفحه‌ای باز نیست" },
  "stats.paragraphs": { en: "Paragraphs", fa: "پاراگراف‌ها" },
  "stats.edits": { en: "Text edits", fa: "ویرایش‌های متن" },
  "stats.inputs": { en: "Inputs", fa: "ورودی‌ها" },
  "reapply": { en: "Re-apply on this page", fa: "اعمال دوباره در این صفحه" },
  "directionMode.label": { en: "Text orientation", fa: "جهت چیدمان متن" },
  "directionMode.desc": {
    en: "Smart per-paragraph BiDi or fixed orientation",
    fa: "تشخیص هوشمند پاراگراف یا جهت ثابت",
  },
  "directionMode.auto": { en: "Auto", fa: "خودکار" },
  "directionMode.rtl": { en: "RTL", fa: "راست‌چین" },
  "directionMode.ltr": { en: "LTR", fa: "چپ‌چین" },

  "uiDirection.label": { en: "Panel orientation", fa: "جهت رابط کاربری" },
  "uiDirection.desc": {
    en: "Force panel layout direction or follow language",
    fa: "جهت چیدمان این پنجره یا هماهنگ با زبان",
  },
  "uiDirection.auto": { en: "Auto", fa: "خودکار" },
  "uiDirection.rtl": { en: "RTL", fa: "راست‌چین" },
  "uiDirection.ltr": { en: "LTR", fa: "چپ‌چین" },

  "typography.title": { en: "Typography intelligence", fa: "هوش تایپوگرافی" },
  "typography.advanced": { en: "Advanced typography", fa: "تنظیمات پیشرفتهٔ تایپوگرافی" },
  "interface.title": { en: "Interface", fa: "رابط کاربری" },

  "activation.title": { en: "Activation", fa: "فعال‌سازی" },
  "tab.site": { en: "Site", fa: "سایت" },
  "tab.typography": { en: "Typography", fa: "تایپوگرافی" },
  "tab.sites": { en: "Sites", fa: "سایت‌ها" },
  "tab.settings": { en: "Settings", fa: "تنظیمات" },
  "sites.activeTitle": { en: "Active sites", fa: "سایت‌های فعال" },
  "sites.activeDesc": {
    en: "Pages where RTL Atelier is currently running",
    fa: "صفحاتی که RTL Atelier در آن‌ها در حال اجراست",
  },
  "sites.activeEmpty": {
    en: "No pages are running RTL Atelier right now.",
    fa: "در حال حاضر هیچ صفحه‌ای RTL Atelier را اجرا نمی‌کند.",
  },
  "theme.label": { en: "Appearance", fa: "نمایش" },
  "data.title": { en: "Your data", fa: "داده‌های شما" },

  "status.running": { en: "Running", fa: "در حال اجرا" },
  "status.runningRtl": { en: "Optimized for Persian", fa: "چیدمان بهینهٔ فارسی" },
  "status.runningLtr": { en: "Optimized for English", fa: "چیدمان بهینهٔ انگلیسی" },
  "status.monitoring": { en: "Active · Watching for text", fa: "فعال · در انتظار متن" },
  "status.activating": { en: "Activating…", fa: "در حال فعال‌سازی…" },
  "status.idle": { en: "Waiting for RTL text", fa: "در انتظار متن راست‌به‌چپ" },
  "status.off": { en: "Off everywhere", fa: "همه‌جا خاموش" },
  "status.disabled": { en: "Disabled here", fa: "اینجا خاموش است" },
  "status.whitelist": { en: "Not activated", fa: "فعال نشده است" },
  "status.noData": { en: "No data yet", fa: "هنوز داده‌ای ثبت نشده" },
  "status.healthy": { en: "Healthy", fa: "سالم" },
  "status.hasErrors": { en: "{count} issues", fa: "{count} خطا" },
  "action.activateHere": { en: "Activate on this site", fa: "فعال‌سازی در این سایت" },
  "action.resetStats": { en: "Reset counters", fa: "صفر کردن شمارنده‌ها" },
  "hint.activatedSuccess": { en: "RTL Atelier activated on {host}", fa: "RTL Atelier در {host} فعال شد" },
  "error.activationFailed": { en: "Could not activate — please reload tab", fa: "فعال‌سازی انجام نشد — لطفاً تب را رفرش کنید" },
  "diag.errorsTitle": { en: "System Event Log", fa: "گزارش خطاهای سیستم" },
  "diag.clearErrors": { en: "Clear log", fa: "پاک کردن گزارش" },
  "diag.copyLog": { en: "Copy diagnostics", fa: "کپی اطلاعات تشخیصی" },
  "diag.copied": { en: "Diagnostics copied to clipboard", fa: "اطلاعات با موفقیت کپی شد" },
  "diag.noErrors": { en: "No errors logged. All systems healthy.", fa: "هیچ خطایی ثبت نشده است. سیستم کاملاً سالم است." },
  "toast.statsReset": { en: "Counters reset", fa: "شمارنده‌ها صفر شد" },
  "stats.explain": {
    en: "Counts update live while RTL Atelier runs here; pages without Persian/Arabic text stay at zero.",
    fa: "شمارنده‌ها هنگام اجرای RTL Atelier به‌روز می‌شوند؛ صفحه‌های بدون متن فارسی/عربی صفر می‌مانند.",
  },
  "sites.presets": { en: "Built-in platforms", fa: "پلتفرم‌های پیش‌فرض" },
  "sites.filterPlaceholder": { en: "Search platforms…", fa: "جستجوی پلتفرم‌ها…" },
  "sites.addCurrent": { en: "Add current site ({host})", fa: "افزودن سایت فعلی ({host})" },
  "sites.addSuccess": { en: "Added {host} to active sites", fa: "{host} به فهرست سایت‌های فعال افزوده شد" },
  "site.activeEnhancements": { en: "Active enhancements", fa: "بهینه‌سازی‌های فعال صفحه" },
  "site.bidiFlow": { en: "Smart BiDi Flow", fa: "چیدمان هوشمند دوطرفه" },
  "site.domObserver": { en: "Dynamic Stream Observer", fa: "پایش بلادرنگ استریم" },
  "site.digitsZwnj": { en: "Digits & ZWNJ Engine", fa: "تبدیل ارقام و نیم‌فاصله" },
  "site.quickFont": { en: "Font scale", fa: "اندازه قلم" },
  "footer.shortcut": { en: "Alt+Shift+X to toggle", fa: "کلید میانبر Alt+Shift+X" },
  "font.scope.label": { en: "Applies to", fa: "اعمال روی" },
  "font.scope.rtl": { en: "RTL text", fa: "متن راست‌به‌چپ" },
  "font.scope.readable": { en: "All readable text", fa: "تمام متن خوانا" },

  "coverage.title": { en: "RTL coverage", fa: "سهم راست‌به‌چپ" },
  "coverage.desc": {
    en: "Share of detected paragraphs that read right-to-left",
    fa: "سهم پاراگراف‌های تشخیص‌داده‌شده که راست‌به‌چپ خوانده می‌شوند",
  },
  "diag.status": { en: "Engine status", fa: "وضعیت موتور" },
  "diag.reason": { en: "Diagnosis", fa: "تشخیص هوشمند" },
  "diag.coverage": { en: "RTL coverage", fa: "پوشش راست‌به‌چپ" },
  "diag.virtualScroll": { en: "Virtual scroll tracking", fa: "رهگیری اسکرول مجازی" },
  "diag.virtualScrollActive": { en: "Active (monitoring scroll & viewport)", fa: "فعال (پایش پیوستهٔ اسکرول و دیدگاه)" },
  "diag.troubleshooting": { en: "Troubleshooting & Recommendations", fa: "راهنما و مراحل رفع مشکل" },
  "diag.reapplyNow": { en: "Re-apply engine now", fa: "اعمال مجدد فوری" },
  "diag.state.active": { en: "Active", fa: "فعال" },
  "diag.state.standby": { en: "Standby", fa: "در انتظار متن" },
  "diag.state.inactive": { en: "Inactive", fa: "غیرفعال" },
  "diag.state.warning": { en: "Notice", fa: "توجه" },
  "diag.state.empty": { en: "Loading", fa: "در انتظار محتوا" },
  "diag.title": { en: "Page analysis", fa: "تحلیل صفحه" },
  "diag.run": { en: "Analyze this page", fa: "تحلیل این صفحه" },
  "diag.centerTitle": { en: "Diagnostics & Troubleshooting", fa: "مرکز عیب‌یابی و پایش هوشمند" },
  "diag.centerDesc": { en: "Live page inspection, font & CSP check, and instant fix", fa: "پایش زندهٔ صفحه، بررسی قلم و امنیت CSP، و رفع فوری اختلال" },
  "diag.openCenter": { en: "Inspect & Fix", fa: "عیب‌یابی و رفع مشکل" },
  "diag.tabLive": { en: "Live Inspection", fa: "بررسی زندهٔ صفحه" },
  "diag.tabLiveDesc": { en: "Live page inspection, font & CSP check, and instant fix", fa: "پایش زندهٔ صفحه، بررسی قلم و امنیت CSP، و رفع فوری اختلال" },
  "diag.tabLogs": { en: "Event Log", fa: "گزارش رویدادها" },
  "diag.tabLogsDesc": { en: "System event log, recovered runtime faults, and technical telemetry", fa: "گزارش رویدادهای سیستم، خطاهای ترمیم‌شده و تله‌متری فنی" },
  "diag.subsystemsHealthy": { en: "All Subsystems Nominal", fa: "تمام سیستم‌ها کاملاً سالم هستند" },
  "diag.subsystemsDesc": { en: "0 runtime exceptions or faults recorded. All background and content pipelines are running normally.", fa: "هیچ خطا یا نقصی ثبت نشده است. تمامی خط‌لوله‌های پردازش و بارگذاری قلم بدون اشکال فعال هستند." },
  "diag.chkEngine": { en: "BiDi Typography Engine: Active & Nominal", fa: "موتور تایپوگرافی دوجهته: فعال و پایدار" },
  "diag.chkFonts": { en: "FontFace In-Memory Loader: CSP-Immune", fa: "بارگذاری قلم در حافظه: مصون از CSP" },
  "diag.chkScheduler": { en: "Frame-Budget Scheduler: 60fps Nominal", fa: "زمان‌بند فریم: ۶۰ فریم بر ثانیه" },
  "diag.chkPatches": { en: "DOM Patch Store: 100% Reversible", fa: "حافظهٔ تغییرات: ۱۰۰٪ معکوس‌پذیر" },
  "diag.logBufferHint": { en: "Circular event buffer (bounded memory)", fa: "بافر حلقوی رویدادها (حافظهٔ کنترل‌شده)" },
  "diag.logStatusNominal": { en: "0 Faults Recorded", fa: "۰ خطا ثبت‌شده" },
  "diag.deepScanFix": { en: "Run Deep Scan & Quick Fix", fa: "اسکن عمیق و رفع فوری مشکل" },
  "diag.copyReport": { en: "Copy Full Report", fa: "کپی گزارش کامل" },
  "diag.fontStatus": { en: "Font & CSP Status", fa: "وضعیت قلم و امنیت CSP" },
  "diag.fontLoaded": { en: "Loaded via FontFace API (CSP-immune)", fa: "بارگذاری‌شده با FontFace (مصون از CSP)" },
  "diag.fontNotLoaded": { en: "Font not active or pending", fa: "قلم فعال نیست یا در انتظار بارگذاری است" },
  "diag.fontDefault": { en: "Site default font in use", fa: "قلم پیش‌فرض سایت در حال استفاده است" },
  "diag.fontActive": { en: "FontFace: Active", fa: "بارگذاری‌شده: فعال" },
  "diag.fontPending": { en: "Pending", fa: "در انتظار" },
  "diag.fontSiteDefault": { en: "Site Default", fa: "پیش‌فرض سایت" },
  "diag.modeAutoDesc": { en: "Smart Text Flow", fa: "جریان هوشمند متن" },
  "diag.modeRtlDesc": { en: "Full Persian UI", fa: "چیدمان تمام‌فارسی" },
  "diag.modeLtrDesc": { en: "English LTR", fa: "چیدمان انگلیسی LTR" },
  "diag.containersFound": { en: "Chat message containers", fa: "کانتینرهای پیام چت" },
  "diag.queueState": { en: "Pending queue", fa: "صف پردازش موتور" },
  "diag.queueItems": { en: "{n} item(s) pending", fa: "{n} مورد در صف" },
  "diag.queueClean": { en: "0 items (idle & ready)", fa: "خالی (آماده و فعال)" },
  "diag.healthyText": { en: "All systems healthy. Text orientation and fonts are active.", fa: "تمام بخش‌ها فعال و سالم هستند. جهت و قلم با موفقیت اعمال شده‌اند." },
  "diag.adapter": { en: "Adapter", fa: "سازگار" },
  "diag.units": { en: "Paragraph units", fa: "واحدهای پاراگراف" },
  "diag.rtl": { en: "RTL blocks", fa: "بلوک‌های راست‌به‌چپ" },
  "diag.edits": { en: "Text edits", fa: "ویرایش‌های متن" },
  "diag.inputs": { en: "Tracked inputs", fa: "ورودی‌های رهگیری‌شده" },
  "diag.scanMs": { en: "Last scan time", fa: "زمان آخرین اسکن" },
  "diag.scans": { en: "Scans performed", fa: "تعداد اسکن‌ها" },
  "diag.errors": { en: "Recovered faults", fa: "خطاهای ترمیم‌شده" },
  "diag.faultKinds": { en: "Fault types", fa: "انواع خطا" },
  "diag.inactive": {
    en: "RTL Atelier is not running on this page.",
    fa: "RTL Atelier در این صفحه اجرا نمی‌شود.",
  },
  "diag.unreachable": {
    en: "Could not reach the page — try reloading it.",
    fa: "ارتباط با صفحه ممکن نشد — صفحه را دوباره بارگذاری کنید.",
  },
  "font.ui.weight.label": { en: "Panel weight", fa: "وزن قلم پنل" },
  "font.ui.weight.desc": { en: "Text weight inside this panel", fa: "ضخامت متن داخل همین پنجره" },

  "hint.running": {
    en: "RTL Atelier is running on this page.",
    fa: "RTL Atelier در این صفحه فعال است.",
  },
  "hint.disabled": {
    en: "Turned off for this site — switch on above.",
    fa: "برای این سایت خاموش است — از بالا روشنش کنید.",
  },
  "hint.notWhitelisted": {
    en: "Smart mode: add this domain to the site list to activate it here.",
    fa: "حالت هوشمند: برای فعال‌سازی در این سایت، دامنه را به فهرست سایت‌ها اضافه کنید.",
  },
  "hint.masterOff": {
    en: "RTL Atelier is off everywhere — use the top switch.",
    fa: "RTL Atelier همه‌جا خاموش است — از کلید بالای صفحه استفاده کنید.",
  },
  "activation.smart": { en: "Smart", fa: "هوشمند" },
  "activation.everywhere": { en: "Everywhere", fa: "همه‌جا" },
  "activation.smart.desc": {
    en: "Runs only on AI platforms and sites you allow",
    fa: "فقط روی پلتفرم‌های هوش مصنوعی و سایت‌های مجاز شما",
  },
  "activation.everywhere.desc": {
    en: "Runs on every site you visit",
    fa: "روی تمام سایت‌هایی که باز می‌کنید",
  },
  "sites.manage": { en: "Site list", fa: "فهرست سایت‌ها" },
  "sites.add": { en: "Add", fa: "افزودن" },
  "sites.addPlaceholder": { en: "example.com", fa: "مثلاً example.com" },
  "sites.addAria": { en: "Domain to whitelist", fa: "دامنه برای افزودن به فهرست" },
  "sites.empty": { en: "No custom sites yet.", fa: "هنوز سایتی اضافه نشده است." },
  "sites.remove": { en: "Remove from list", fa: "حذف از فهرست" },
  "sites.invalid": { en: "Enter a valid domain", fa: "یک دامنهٔ معتبر وارد کنید" },

  "font.weight.label": { en: "Weight", fa: "وزن قلم" },
  "weight.auto": { en: "Auto", fa: "خودکار" },
  "weight.300": { en: "Light · 300", fa: "نازک · ۳۰۰" },
  "weight.400": { en: "Regular · 400", fa: "معمولی · ۴۰۰" },
  "weight.500": { en: "Medium · 500", fa: "متوسط · ۵۰۰" },
  "weight.600": { en: "SemiBold · 600", fa: "نیمه‌ضخیم · ۶۰۰" },
  "weight.700": { en: "Bold · 700", fa: "ضخیم · ۷۰۰" },
  "size.page.label": { en: "Text size", fa: "اندازهٔ متن" },
  "size.ui.label": { en: "Panel size", fa: "اندازهٔ پنل" },
  "size.decrease": { en: "Decrease size", fa: "کوچک‌تر" },
  "size.increase": { en: "Increase size", fa: "بزرگ‌تر" },

  "fonts.custom": { en: "Custom fonts", fa: "قلم‌های دلخواه" },
  "fonts.upload": { en: "Upload font", fa: "بارگذاری قلم" },
  "fonts.dropHint": {
    en: "Drop font files (.woff2, .woff, .ttf, .otf) here or",
    fa: "فایل‌های فونت (woff2، woff، ttf، otf) را اینجا رها کنید یا",
  },
  "fonts.openTab": { en: "Open in new tab", fa: "باز کردن در تب جداگانه" },
  "fonts.customEmpty": { en: "No custom fonts uploaded yet.", fa: "هنوز قلمی بارگذاری نشده است." },
  "fonts.replaceTitle": { en: "Replace this font?", fa: "این قلم جایگزین شود؟" },
  "fonts.replaceDesc": {
    en: "“{name}” already exists in your library.",
    fa: "«{name}» از قبل در کتابخانهٔ شما موجود است.",
  },
  "fonts.replace": { en: "Replace", fa: "جایگزینی" },
  "fonts.skip": { en: "Skip", fa: "رد کردن" },
  "fonts.uploaded": { en: "Font added", fa: "قلم افزوده شد" },
  "fonts.replaced": { en: "Font replaced", fa: "قلم جایگزین شد" },
  "fonts.skipped": { en: "Kept existing font", fa: "قلم قبلی حفظ شد" },
  "fonts.removed": { en: "Font removed", fa: "قلم حذف شد" },
  "fonts.invalid": {
    en: "Unsupported or oversized file (max 8 MB)",
    fa: "فایل نامعتبر یا بیش از حد بزرگ (حداکثر ۸ مگابایت)",
  },
  "fonts.storageFull": {
    en: "Storage is full — remove a font first",
    fa: "حجم ذخیره‌سازی پر است — ابتدا یک قلم را حذف کنید",
  },

  "feature.normalizeChars.label": { en: "Letter unification", fa: "یکسان‌سازی حروف" },
  "feature.normalizeChars.desc": {
    en: "Arabic ي/ك become Persian ی/ک",
    fa: "«ي» و «ك» عربی به «ی» و «ک» فارسی تبدیل می‌شوند",
  },
  "feature.zwnj.label": { en: "Smart half-spacing", fa: "نیم‌فاصلهٔ هوشمند" },
  "feature.zwnj.desc": {
    en: "می‌رود، کتاب‌ها — joined with an invisible seam",
    fa: "«می‌رود» و «کتاب‌ها» با نیم‌فاصلهٔ استاندارد جدا می‌شوند",
  },
  "feature.punctuation.label": { en: "Punctuation spacing", fa: "فاصله‌گذاری نشانه‌ها" },
  "feature.punctuation.desc": {
    en: "Puts ، ؛ : ! ? and . next to the right words",
    fa: "ویرگول، نقطه‌ویرگول و علامت سؤال را در جای درست خود می‌نشاند",
  },
  "feature.whitespace.label": { en: "Whitespace tidy", fa: "مرتب‌سازی فاصله‌ها" },
  "feature.whitespace.desc": {
    en: "Collapses repeated spaces into one",
    fa: "فاصله‌های پشت سر هم به یکی تبدیل می‌شوند",
  },
  "feature.alignRtl.label": { en: "RTL direction & alignment", fa: "جهت و چینش راست‌به‌چپ" },
  "feature.alignRtl.desc": {
    en: "Persian and Arabic paragraphs flow right-to-left",
    fa: "پاراگراف‌های فارسی و عربی راست‌به‌چپ می‌شوند",
  },
  "feature.keepCenter.label": { en: "Respect centered blocks", fa: "حفظ وسط‌چین‌ها" },
  "feature.keepCenter.desc": {
    en: "Centered headings stay centered",
    fa: "عنوان‌های وسط‌چین وسط می‌مانند",
  },
  "feature.smartRuns.label": { en: "Smart run isolation", fa: "جداسازی هوشمند بخش‌ها" },
  "feature.smartRuns.desc": {
    en: "English phrases inside Persian (and vice versa) keep their own word order without flipping the block",
    fa: "عبارت‌های لاتین داخل فارسی (و برعکس) ترتیب کلمات خود را حفظ می‌کنند، بدون واژگونی بلوک",
  },
  "feature.mostlyRtl.label": { en: "Mixed-text detection", fa: "تشخیص متن ترکیبی" },
  "feature.mostlyRtl.desc": {
    en: "Lines opening with Latin words (“ChatGPT چیست؟”) still read as RTL",
    fa: "جمله‌هایی که با نام لاتین شروع می‌شوند («ChatGPT چیست؟») راست‌به‌چپ می‌شوند",
  },
  "feature.forceCodeLtr.label": { en: "Protect code", fa: "محافظت از کدها" },
  "feature.forceCodeLtr.desc": {
    en: "Code, keys and snippets stay left LTR",
    fa: "کدها و دستورها همیشه چپ‌به‌راست می‌مانند",
  },
  "feature.autoDirInputs.label": { en: "Live input direction", fa: "جهت خودکار نوشتن" },
  "feature.autoDirInputs.desc": {
    en: "Chat boxes switch direction as you type",
    fa: "کادر گفت‌وگو هم‌گام با تایپ شما جهت عوض می‌کند",
  },
  "feature.processEditable.label": { en: "Edit rich-text areas", fa: "ویرایش بخش‌های غنی" },
  "feature.processEditable.desc": {
    en: "Apply inside contenteditable regions (careful)",
    fa: "اعمال تغییرات داخل بخش‌های قابل ویرایش (با احتیاط)",
  },
  "feature.layoutSafe.label": { en: "Protect flexible layouts", fa: "محافظت از چیدمان منعطف" },
  "feature.layoutSafe.desc": {
    en: "Skip direction flips on flex/grid containers so host layouts stay intact",
    fa: "تغییر جهت در کانتینرهای flex/grid اعمال نمی‌شود تا چیدمان سایت میزبان سالم بماند",
  },

  "digits.label": { en: "Digits in Persian text", fa: "ارقام در متن فارسی" },
  "digits.desc": { en: "Context-aware conversion of 0-9 ⇄ ۰-۹", fa: "تبدیل هوشمند ارقام بر پایهٔ بافت متن" },
  "digits.keep": { en: "Keep", fa: "بدون تغییر" },
  "digits.latin": { en: "Latin", fa: "لاتین" },
  "digits.persian": { en: "Farsi", fa: "فارسی" },

  "font.page.label": { en: "Page font", fa: "قلم صفحه" },
  "font.family.label": { en: "Family", fa: "خانوادهٔ قلم" },
  "font.page.desc.bundled": {
    en: "{n} bundled typefaces for right-to-left text",
    fa: "{n} قلم فارسی برای متن راست‌به‌چپ",
  },
  "font.ui.label": { en: "Extension font", fa: "قلم افزونه" },
  "font.ui.desc": {
    en: "Typeface of this panel — independent from page font",
    fa: "قلم همین پنجره؛ مستقل از قلم صفحه",
  },
  "lang.label": { en: "Language", fa: "زبان" },
  "lang.auto": { en: "Auto", fa: "خودکار" },
  "font.default": { en: "Site default", fa: "پیش‌فرض سایت" },
  "font.system": { en: "System default", fa: "پیش‌فرض سیستم" },
  "weights.count": { en: "{n} weights", fa: "{n} وزن" },

  "preview.title": { en: "Live preview", fa: "پیش‌نمایش زنده" },
  "preview.apply": { en: "Apply", fa: "اعمال" },
  "preview.note.changed": {
    en: "Your settings are applied below — every change is reversible.",
    fa: "تنظیمات شما روی نمونهٔ زیر اعمال شده — هر تغییری قابل بازگشت است.",
  },
  "preview.note.clean": {
    en: "This sample is already clean under your current settings.",
    fa: "این نمونه با تنظیمات فعلی شما نیازی به تغییر ندارد.",
  },

  "theme.auto": { en: "Auto", fa: "خودکار" },
  "theme.light": { en: "Light", fa: "روشن" },
  "theme.dark": { en: "dark", fa: "تیره" },
  "action.export": { en: "Export settings", fa: "برون‌بری تنظیمات" },
  "action.import": { en: "Import settings", fa: "درون‌بری تنظیمات" },
  "action.reset": { en: "Reset everything", fa: "بازنشانی همه‌چیز" },
  "action.about": { en: "About", fa: "درباره" },

  "about.tagline": {
    en: "Adaptive, local-first bilingual typography engine for Persian/Arabic + English.",
    fa: "موتور تایپوگرافی دوزبانهٔ تطبیقی و کاملاً محلی برای فارسی/عربی و انگلیسی.",
  },
  "about.local": {
    en: "Local-first. No analytics, no network calls — your text never leaves the page.",
    fa: "کاملاً محلی؛ بدون آمارگیری و تماس شبکه‌ای — متن شما هرگز از صفحه خارج نمی‌شود.",
  },
  "about.reversible": {
    en: "Reversible. Every DOM edit is recorded and restored when you switch off.",
    fa: "بازگشت‌پذیر؛ تمام تغییرات ثبت و هنگام خاموش کردن بازگردانده می‌شوند.",
  },
  "about.adapters": {
    en: "Adaptive. Purpose-built adapters for ChatGPT, Claude, Gemini and 20+ AI platforms.",
    fa: "تطبیقی؛ سازگارسازی اختصاصی برای ChatGPT، Claude، Gemini و بیش از ۲۰ پلتفرم هوش مصنوعی.",
  },
  "about.shortcuts": {
    en: "Shortcuts.",
    fa: "کلیدهای میان‌بر:",
  },
  "about.close": { en: "Close", fa: "بستن" },
  "license.note": { en: "MIT License", fa: "پروانهٔ MIT" },

  "scratchpad.title": { en: "Instant formatter & scratchpad", fa: "قالب‌بندی آنی و چرک‌نویس" },
  "scratchpad.copy": { en: "Copy", fa: "کپی متن" },
  "scratchpad.reset": { en: "Sample", fa: "متن نمونه" },
  "scratchpad.placeholder": {
    en: "Type or paste mixed Persian + English text here...",
    fa: "متن ترکیبی فارسی و انگلیسی را اینجا بنویسید یا بچسبانید...",
  },
  "toast.copied": { en: "Formatted text copied to clipboard", fa: "متن قالب‌بندی‌شده کپی شد" },
  "toast.exported": { en: "Settings exported", fa: "تنظیمات برون‌بری شد" },
  "toast.imported": { en: "Settings imported", fa: "تنظیمات درون‌بری شد" },
  "toast.reset": { en: "Everything reset", fa: "همه‌چیز بازنشانی شد" },
  "toast.openPage": { en: "Open a regular web page first", fa: "ابتدا یک صفحهٔ وب معمولی باز کنید" },
  "fault.title": {
    en: "{count} processing faults recovered on this page — view analysis",
    fa: "{count} خطای ترمیم‌شده در این صفحه — مشاهدهٔ تحلیل",
  },
  "fault.kind.csp-blocked": { en: "blocked by site security policy", fa: "مسدودشده توسط سیاست امنیتی سایت" },
  "fault.kind.detached-node": { en: "elements removed mid-processing", fa: "عناصر حین پردازش حذف شدند" },
  "fault.kind.dom-mismatch": { en: "unexpected DOM structure", fa: "ساختار غیرمنتظرهٔ صفحه" },
  "fault.kind.generic": { en: "general processing errors", fa: "خطاهای عمومی پردازش" },
  "toast.unreachable": {
    en: "Page unreachable — reload it and try again",
    fa: "ارتباط با صفحه ممکن نشد — صفحه را دوباره بارگذاری کنید",
  },
  "toast.readFail": { en: "Could not read that file", fa: "خواندن این فایل ممکن نبود" },
  "toast.reapplied": { en: "Re-applied on this page", fa: "در این صفحه دوباره اعمال شد" },
};

let current = "en";

/** Resolve "auto" against the browser's preferred languages. */
export function resolveLang(setting) {
  if (setting === "fa" || setting === "en") return setting;
  const candidates =
    typeof navigator !== "undefined" && Array.isArray(navigator.languages)
      ? navigator.languages
      : typeof navigator !== "undefined" && navigator.language
        ? [navigator.language]
        : [];
  for (const candidate of candidates) {
    const normalized = String(candidate || "").toLowerCase();
    if (normalized.startsWith("fa")) return "fa";
    if (normalized.startsWith("en")) return "en";
  }
  return "en";
}

export function lang() {
  return current;
}

/** True when a dictionary entry exists for the key. */
export function exists(key) {
  return Boolean(DICT[key]);
}

export function isRtlLang(value) {
  return resolveLang(value) === "fa";
}

/** Translate a key, interpolating {placeholders}. Falls back to English then the key. */
export function t(key, params) {
  let text = key;
  const entry = DICT[key];
  if (entry) {
    text = entry[current] ?? entry.en ?? key;
  }
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
    }
  }
  return text;
}

export function setDirAttributes(rootLang, uiDir = "auto") {
  const doc = document.documentElement;
  doc.setAttribute("lang", rootLang === "fa" ? "fa" : "en");
  const isRtl = uiDir === "rtl" ? true : uiDir === "ltr" ? false : rootLang === "fa";
  doc.setAttribute("dir", isRtl ? "rtl" : "ltr");
  doc.classList.toggle("rtla-rtl", isRtl);
}

/**
 * Apply a UI language setting ("auto" | "en" | "fa") to the document and to
 * every element carrying data-i18n / data-i18n-title / data-i18n-aria.
 * Accepts an optional uiDir ("auto" | "rtl" | "ltr") to control layout orientation.
 * Returns the resolved language so callers can rebuild dynamic content.
 */
export function applyI18n(setting, uiDir = "auto") {
  const next = resolveLang(setting);
  const changed = next !== current;
  current = next;
  if (typeof document !== "undefined") {
    setDirAttributes(next, uiDir);
    for (const el of document.querySelectorAll("[data-i18n]")) {
      el.textContent = t(el.getAttribute("data-i18n"));
    }
    for (const el of document.querySelectorAll("[data-i18n-placeholder]")) {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
    }
    for (const el of document.querySelectorAll("[data-i18n-title]")) {
      el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
    }
    for (const el of document.querySelectorAll("[data-i18n-aria]")) {
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria")));
    }
  }
  return { lang: next, changed };
}
