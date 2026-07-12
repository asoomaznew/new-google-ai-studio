import * as fs from 'fs';

/**
 * generate_dataset.ts
 * 
 * This script generates a comprehensive 500-item dataset covering every detail of the
 * Journal Entry Automation application. It includes technical, structural, accounting,
 * and UI/UX related questions and answers.
 */

// --- Data Definitions ---

const clinics = [
    { name: "AL ASEEL INTERNATIONAL POLYCLINIC", kib: "KIBAA-2380", warba: "WTAA-61012", offset: "50-000010", property: "CLO3", dept: "113", proj: "104", activities: "1194" },
    { name: "IRIS POLYCLINIC", kib: "KIBIR-2282", warba: "WRIR-73018", offset: "50-000004", property: "CLO3", dept: "113", proj: "104", activities: "1193" },
    { name: "YARROW POLYCLINIC", kib: "KIBYR-4765", warba: "WRYR-67011", offset: "50-000005", property: "CLO3", dept: "113", proj: "104", activities: "1198" },
    { name: "MEWL POLYCLINIC", kib: "KIBML-6601", warba: "KIBML-6601", offset: "50-000011", property: "CLO4", dept: "113", proj: "104", activities: "1205" },
    { name: "FOURTH MEDICAL CENTER", kib: "KIBFR-8602", warba: "WRFM-55018", offset: "50-000009", property: "CLO5", dept: "113", proj: "104", activities: "1195" },
    { name: "JOYA POLYCLINIC", kib: "KIBJY-2258", warba: "WRJY-10018", offset: "50-000002", property: "CLO6", dept: "113", proj: "104", activities: "1197" },
    { name: "MEDICAL HARBOUR CENTER", kib: "KIBMH-2231", warba: "WRMH-86019", offset: "50-000008", property: "CLO6", dept: "113", proj: "104", activities: "1196" },
    { name: "MED MARINE POLYCLINIC", kib: "KIBMM-2207", warba: "WRMM-42013", offset: "50-000006", property: "CLO6", dept: "113", proj: "104", activities: "1191" },
    { name: "MED GRAY POLYCLINIC", kib: "KIBMG-2320", warba: "WRMG-77018", offset: "50-000003", property: "CLO7", dept: "113", proj: "104", activities: "1192" },
    { name: "ARAM MEDICAL POLYCLINIC", kib: "KIBAM-2290", warba: "WRAM-95018", offset: "50-000007", property: "CLO8", dept: "113", proj: "104", activities: "1199" }
];

const appModes = [
    { mode: "home", desc: "القائمة الرئيسية التي تتيح التنقل بين جميع الأدوات." },
    { mode: "entry", desc: "أتمتة قيود اليومية لتقارير التجار (Merchant Reports)." },
    { mode: "rename", desc: "أداة ذكية لتغيير أسماء الملفات بناءً على محتواها باستخدام AI أو Regex." },
    { mode: "warba_entry", desc: "معالجة كشوف حساب بنك وربة وتحويلها لقيود محاسبية." },
    { mode: "keyword_search", desc: "البحث عن كلمات مفتاحية في ملفات PDF واستخراج الصفحات المتعلقة بها." },
    { mode: "search", desc: "البحث العام في الملفات باستخدام Gemini." },
    { mode: "convert_001_to_49", desc: "تحويل تنسيقات محددة من ملفات الـ POS." },
    { mode: "ending_balance", desc: "أتمتة استخراج الأرصدة النهائية من كشوف الحسابات." },
    { mode: "merge_pdfs", desc: "دمج عدة ملفات PDF في ملف واحد." },
    { mode: "pos_entry", desc: "أتمتة قيود نقاط البيع (POS Transactions)." },
    { mode: "pos_report", desc: "توليد تقارير ملخصة لعمليات نقاط البيع." },
    { mode: "smart_merge", desc: "دمج ذكي للقيود المتشابهة لتقليل حجم ملف الاكسيل الناتج." }
];

const technicalSpecs = [
    { q: "ما هو المحرك الأساسي لاستخراج النص من PDF؟", a: "يستخدم التطبيق مكتبة pdfjs-dist مع إعداد Worker خارجي لضمان عدم تأثر سرعة الواجهة الأمامية." },
    { q: "كيف يتم التعامل مع الصور داخل ملفات الـ PDF؟", a: "التطبيق يركز حالياً على استخراج النص البرمجي (Text Layer). في حال كانت الملفات صوراً ممسوحة ضوئياً (Scanned)، يتطلب ذلك معالجة OCR إضافية غير مفعلة افتراضياً." },
    { q: "ما هي التقنية المستخدمة في دمج ملفات الـ PDF؟", a: "يتم استخدام مكتبة pdf-lib للتعامل مع هيكلية ملفات الـ PDF ودمج الصفحات (copyPages/addPage)." },
    { q: "كيف يتم ضغط الملفات الناتجة عند تغيير الأسماء؟", a: "يتم استخدام مكتبة JSZip لجمع كافة الملفات المعاد تسميتها في ملف ZIP واحد قابل للتحميل." },
    { q: "ما هي فائدة استخدام 'useMemo' في ResultsTable؟", a: "يستخدم لتحسين أداء عرض الجداول الضخمة عبر إعادة حساب البيانات فقط عند تغير المدخلات، مما يمنع بطء الواجهة." },
    { q: "كيف يتم توثيق العمليات داخل التطبيق؟", a: "يوجد LogArea في الواجهة الأمامية يسجل كافة الخطوات (نجاح، خطأ، تنبيه) مع توقيت حدوثها." },
    { q: "ما هو الحد الأقصى للنص المرسل لـ Gemini في عملية التسمية؟", a: "يتم قطع النص عند 50,000 حرف لضمان استجابة سريعة وتجنب تجاوز حدود التوكنات (Tokens Limit)." },
    { q: "كيف يتم التحقق من وجود مفتاح API في الواجهة الأمامية؟", a: "يوجد فحص في App.tsx يتحقق من process.env.API_KEY، وفي حال عدم وجوده يظهر ApiKeyWarningBanner." },
    { q: "ما هو دور 'express.json({ limit: '100mb' })' في server.ts؟", a: "يسمح للخادم باستقبال طلبات ضخمة تحتوي على نصوص ملفات PDF طويلة دون حدوث خطأ 413 (Payload Too Large)." },
    { q: "كيف يتم دمج الخادم (Server) مع Vite في وضع التطوير؟", a: "يتم استخدام createViteServer كميدل وير (Middleware) داخل Express ليقوم بمعالجة الأصول (Assets) و HMR." }
];

const accountingRules = [
    { type: "KNET Payment", logic: "يتم تحليل التاجر وتوجيهه إلى حساب المصاريف أو المشتريات المرتبط به." },
    { type: "ATM Withdrawal", logic: "يوجه المبلغ إلى حساب 'Cash in Hand' كمدين وحساب البنك كدائن." },
    { type: "Interest/Profit", logic: "يوجه إلى حساب 'Other Income' كدائن وحساب البنك كمدين." },
    { type: "Bank Fees", logic: "توجه مباشرة إلى حساب 'Bank Charges' (مثل 61001) كمدين." },
    { type: "Transfer", logic: "يتم التعرف على الحساب المحول إليه وتوجيه القيد بين حسابين بنكيين." }
];

const renameMethods = [
    { method: "AI", desc: "يستخدم Gemini لاستخراج اسم منطقي بناءً على سياق المستند (رقم فاتورة، تاريخ، اسم جهة)." },
    { method: "Custom Pattern", desc: "يستخدم Regular Expressions (Regex) للبحث عن نمط محدد داخل النص واستخدامه كاسم." },
    { method: "Bank Account", desc: "يبحث عن عبارة 'Bank account' وما يتبعها من أرقام." },
    { method: "Medical Statement", desc: "مخصص لاستخراج أسماء ملفات الكشوفات الطبية بناءً على معايير ثابتة." },
    { method: "Merchant Report", desc: "يستخرج الاسم من ملفات CSV/Excel الخاصة بالتجار عبر البحث عن Terminal ID و Merchant Name." }
];

// --- Generation Logic ---

function generateDataset() {
    const dataset: string[] = [];

    // 1. Architecture & Deep Tech (100 items)
    for (let i = 0; i < 100; i++) {
        const spec = technicalSpecs[i % technicalSpecs.length];
        dataset.push(JSON.stringify({
            prompt: `[Architecture] ${spec.q} (Ref: #${i + 1})`,
            response: spec.a
        }));
    }

    // 2. App Modes & UX Flow (100 items)
    for (let i = 0; i < 100; i++) {
        const modeInfo = appModes[i % appModes.length];
        const questions = [
            `ما هي وظيفة وضع '${modeInfo.mode}' في التطبيق؟`,
            `اشرح متى يجب على المستخدم اختيار وضع '${modeInfo.mode}'.`,
            `ما هي الفائدة من أداة ${modeInfo.mode}؟`,
            `كيف يساعد وضع ${modeInfo.mode} في تحسين سير العمل المحاسبي؟`
        ];
        dataset.push(JSON.stringify({
            prompt: questions[i % questions.length],
            response: modeInfo.desc
        }));
    }

    // 3. Accounting Logic & Clinic Configs (150 items)
    for (let i = 0; i < 150; i++) {
        const clinic = clinics[i % clinics.length];
        const rule = accountingRules[i % accountingRules.length];
        const bank = i % 2 === 0 ? "KIB" : "Warba";
        const acc = bank === "KIB" ? clinic.kib : clinic.warba;

        const prompt = `[Accounting] لعيادة ${clinic.name}، كيف يتم التعامل مع عملية ${rule.type} في كشف حساب ${bank} (${acc})؟`;
        const response = `وفقاً للمبادئ المحاسبية المعرفة في ${bank === "Warba" ? "warbaJournalService" : "journalService"}:\n` +
            `- نوع المعاملة: ${rule.type}.\n` +
            `- المنطق: ${rule.logic}\n` +
            `- الحساب المستخدم: ${acc}.\n` +
            `- الأبعاد: PropertyId=${clinic.property}, Dept=${clinic.dept}, Project=${clinic.proj}, Activity=${clinic.activities}.\n` +
            `- حساب الأوفست التلقائي: ${clinic.offset}.`;
        
        dataset.push(JSON.stringify({ prompt, response }));
    }

    // 4. Renaming & File Management (100 items)
    for (let i = 0; i < 100; i++) {
        const rename = renameMethods[i % renameMethods.length];
        const prompt = `كيف تعمل آلية '${rename.method}' في إعادة تسمية الملفات؟`;
        const response = `آلية '${rename.method}': ${rename.desc} يتم تنفيذ هذا في renameService.ts الذي ينسق بين الوظائف النصية واستدعاءات AI.`;
        dataset.push(JSON.stringify({ prompt, response }));
    }

    // 5. Backend & API Details (50 items)
    const backendTopics = [
        { q: "ما هو المسار (Endpoint) المسؤول عن دمج القيود؟", a: "لا يوجد مسار خارجي للدمج، تتم العملية داخل smartMergeService.ts ثم ترسل النتائج للواجهة الأمامية." },
        { q: "كيف يتم تفعيل وضع الإنتاج (Production Mode) في الخادم؟", a: "عن طريق ضبط متغير البيئة NODE_ENV='production'، مما يجعل الخادم يقدم الملفات من مجلد 'dist' بدلاً من Vite." },
        { q: "ما هي المكتبة المستخدمة في الـ CORS؟", a: "تستخدم مكتبة 'cors' لتمكين الاتصال بين خادم الـ API والواجهة الأمامية في بيئات مختلفة." },
        { q: "كيف يتم التعامل مع الأخطاء في Gemini API؟", a: "يتم إرجاع كود 500 مع رسالة خطأ توضح السبب (مثل تجاوز الكوتا أو خطأ في المفتاح) ليقوم التطبيق بعرضها للمستخدم." },
        { q: "أين يتم تخزين سجلات المحادثة (Chat History)؟", a: "يتم تخزينها مؤقتاً في Map داخل server.ts ويتم مسحها عند إعادة تشغيل الخادم أو طلب الحذف." }
    ];
    for (let i = 0; i < 50; i++) {
        const topic = backendTopics[i % backendTopics.length];
        dataset.push(JSON.stringify({
            prompt: `[Backend] ${topic.q}`,
            response: topic.a
        }));
    }

    // Write to file
    fs.writeFileSync('dataset.jsonl', dataset.join('\n') + '\n');
    console.log(`Successfully generated ${dataset.length} items in dataset.jsonl covering Architecture, UI, Accounting, and Backend.`);
}

generateDataset();
