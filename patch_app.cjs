const fs = require('fs');
const file = 'App.tsx';
let code = fs.readFileSync(file, 'utf8');

const oldAppMode = `type AppMode =
  | "home"
  | "entry"
  | "rename"
  | "warba_entry"
  | "keyword_search"
  | "search"
  | "convert_001_to_49"
  | "ending_balance"
  | "merge_pdfs"
  | "pos_entry"
  | "pos_report"
  | "smart_merge";`;

const newAppMode = `type AppMode =
  | "home"
  | "entry"
  | "rename"
  | "warba_entry"
  | "keyword_search"
  | "search"
  | "convert_001_to_49"
  | "ending_balance"
  | "merge_pdfs"
  | "pos_entry"
  | "pos_report"
  | "smart_merge"
  | "bahrain_cust_payment";`;

if (code.includes(oldAppMode)) {
  code = code.replace(oldAppMode, newAppMode);
  console.log("Patched AppMode");
} else {
  console.log("Could not find AppMode");
}

const oldTools = `{ id: "smart_merge", name: "Smart Merge", icon: <Sparkles className="w-8 h-8"/>, desc: "AI-powered PDF merging and sorting" },
    ];`;

const newTools = `{ id: "smart_merge", name: "Smart Merge", icon: <Sparkles className="w-8 h-8"/>, desc: "AI-powered PDF merging and sorting" },
      { id: "bahrain_cust_payment", name: "Bahrain CustPayment", icon: <FileText className="w-8 h-8"/>, desc: "Process emails to Excel for Bahrain CustPayment" },
    ];`;

if (code.includes(oldTools)) {
  code = code.replace(oldTools, newTools);
  console.log("Patched tools");
} else {
  console.log("Could not find tools");
}

const oldRoutes = `{mode === "smart_merge" && <SmartMergeAutomation />}`;
const newRoutes = `{mode === "smart_merge" && <SmartMergeAutomation />}
        {mode === "bahrain_cust_payment" && <BahrainCustPaymentAutomation />}`;

if (code.includes(oldRoutes)) {
  code = code.replace(oldRoutes, newRoutes);
  console.log("Patched routes");
} else {
  console.log("Could not find routes");
}

const importStatement = `import SmartMergeAutomation from "./components/SmartMergeAutomation";`;
const newImportStatement = `import SmartMergeAutomation from "./components/SmartMergeAutomation";\nimport BahrainCustPaymentAutomation from "./components/BahrainCustPaymentAutomation";`;

if (code.includes(importStatement)) {
  code = code.replace(importStatement, newImportStatement);
  console.log("Patched imports");
} else {
  console.log("Could not find imports");
}

fs.writeFileSync(file, code);

