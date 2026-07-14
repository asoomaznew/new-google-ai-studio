import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import Papa from 'papaparse';
import { BATCH_MAPPING } from '../constants';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.5.136/build/pdf.worker.mjs`;

export interface ProcessingResult {
  fileName: string;
  blob: Blob;
  matched: boolean;
  matchedCsvRows: number;
  matchedEmailsCount?: number;
  matchedEmailNames?: string[];
}

interface BatchData {
  name: string;
  descId: string;
  unitId: string;
  pages: number[];
  fullText: string;
}

async function appendCsvPages(outputPdf: PDFDocument, matchedRows: any[], batchName: string) {
  const font = await outputPdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await outputPdf.embedFont(StandardFonts.HelveticaBold);

  if (matchedRows.length === 0) return;

  const colWidths = [120, 95, 45, 95, 80, 55, 75, 65, 75, 57];
  const headers = [
    "Merchant Name", "Account Number", "MCC", "KNET Reference", "KNET POS Date",
    "Amount", "Commission%", "Commission", "Net Amount", "Card Type"
  ];

  const pageWidth = 842;
  const pageHeight = 595;
  const marginX = 40;
  const marginY = 40;
  const contentWidth = pageWidth - (marginX * 2); // 762 PT

  let page = outputPdf.addPage([pageWidth, pageHeight]);
  let currentY = pageHeight - marginY;

  const drawPageHeader = (pNum: number) => {
    // Title on top left (matching screenshot)
    page.drawText("Matched POS Transactions", {
      x: marginX,
      y: currentY - 10,
      size: 16,
      font: boldFont,
      color: rgb(0, 0, 0),
    });

    // Subtitle indicating batch name
    page.drawText(`Batch: ${batchName}`, {
      x: marginX,
      y: currentY - 24,
      size: 8,
      font: font,
      color: rgb(0.4, 0.4, 0.4),
    });

    // Page indicator on top right
    page.drawText(`Page ${pNum}`, {
      x: pageWidth - marginX - 40,
      y: currentY - 10,
      size: 8,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });

    currentY -= 45;

    // Table Header Row - draw labels in Helvetica Bold
    let curX = marginX;
    headers.forEach((h, hIdx) => {
      page.drawText(h, {
        x: curX,
        y: currentY - 10,
        size: 8,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      curX += colWidths[hIdx];
    });

    currentY -= 15;

    // Line under headers matching the screenshot
    page.drawLine({
      start: { x: marginX, y: currentY },
      end: { x: pageWidth - marginX, y: currentY },
      thickness: 1,
      color: rgb(0.8, 0.8, 0.8),
    });

    currentY -= 15;
  };

  let pageIndex = 1;
  drawPageHeader(pageIndex);

  // Helper mapper to get values correctly from columns
  const extractCsvRowData = (row: any) => {
    const keys = Object.keys(row);
    const getVal = (regex: RegExp) => {
      const k = keys.find(key => regex.test(key));
      return k ? String(row[k] || '').trim() : '';
    };

    const merchantName = getVal(/Merchant\s*Name|Merch\s*Name/i) || getVal(/Description|Desc/i) || getVal(/Shop|Vendor|Customer/i);
    const accountNumber = getVal(/Account\s*(?:Number|No\.?|#|Id|Num|No)|Iban/i) || getVal(/^Acc$/i) || getVal(/Acc\s*No/i);
    const mcc = getVal(/MCC/i) || getVal(/Category/i);
    const knetReference = getVal(/KNET\s*Reference/i) || getVal(/KNET\s*Ref/i) || getVal(/Trace|Auth/i) || getVal(/Ref|Reference/i);
    const knetPosDate = getVal(/POS\s*Date/i) || getVal(/KNET\s*Date/i) || getVal(/Date/i) || getVal(/Time/i);

    const amtKey = keys.find(k => {
      const kl = k.toLowerCase();
      return (kl.includes('amount') || kl.includes('amt')) && !kl.includes('net') && !kl.includes('commission') && !kl.includes('comm') && !kl.includes('fee') && !kl.includes('%');
    }) || keys.find(k => /^[^\w]*amount[^\w]*$/i.test(k) || /^[^\w]*amt[^\w]*$/i.test(k));
    const amount = amtKey ? String(row[amtKey] || '').trim() : '';

    const commissionPct = getVal(/Commission\s*%/i) || getVal(/Comm\s*%/i) || getVal(/Fee\s*%/i);

    const commKey = keys.find(k => {
      const kl = k.toLowerCase();
      return (kl.includes('commission') || kl.includes('comm') || kl.includes('fee')) && !kl.includes('%');
    });
    const commission = commKey ? String(row[commKey] || '').trim() : '';

    const netAmount = getVal(/Net\s*(?:Amount|Amt)/i) || getVal(/Net/i);
    const cardType = getVal(/Card\s*Type|Card/i) || getVal(/Type/i);

    return {
      merchantName,
      accountNumber,
      mcc,
      knetReference,
      knetPosDate,
      amount,
      commissionPct,
      commission,
      netAmount,
      cardType
    };
  };

  // Calculate Net Amount Total
  let totalNetSum = 0;
  matchedRows.forEach(row => {
    const data = extractCsvRowData(row);
    const valClean = data.netAmount.replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(valClean);
    if (!isNaN(parsed)) {
      totalNetSum += parsed;
    }
  });

  const rowHeight = 22;

  // Render rows
  for (let rIdx = 0; rIdx < matchedRows.length; rIdx++) {
    const row = matchedRows[rIdx];
    const data = extractCsvRowData(row);

    if (currentY - rowHeight < marginY + 30) {
      page = outputPdf.addPage([pageWidth, pageHeight]);
      currentY = pageHeight - marginY;
      pageIndex++;
      drawPageHeader(pageIndex);
    }

    const vals = [
      data.merchantName,
      data.accountNumber,
      data.mcc,
      data.knetReference,
      data.knetPosDate,
      data.amount,
      data.commissionPct,
      data.commission,
      data.netAmount,
      data.cardType
    ];

    let curX = marginX;
    vals.forEach((valStr, vIdx) => {
      const colW = colWidths[vIdx];
      let drawText = valStr;

      // Truncate only string columns to avoid overlaps, but let numeric / date / status values display fully
      if (vIdx === 0 || vIdx === 1 || vIdx === 3) {
        const charLimit = Math.floor((colW - 8) / 4.5);
        if (drawText.length > charLimit && charLimit > 3) {
          drawText = drawText.substring(0, charLimit - 3) + '...';
        }
      }

      page.drawText(drawText, {
        x: curX,
        y: currentY - 12,
        size: 8,
        font: font,
        color: rgb(0.1, 0.1, 0.1),
      });
      curX += colW;
    });

    currentY -= rowHeight;
  }

  // Draw Total Row
  if (currentY - 30 < marginY) {
    page = outputPdf.addPage([pageWidth, pageHeight]);
    currentY = pageHeight - marginY;
    pageIndex++;
    drawPageHeader(pageIndex);
  }

  // Divider above totals
  page.drawLine({
    start: { x: marginX, y: currentY },
    end: { x: pageWidth - marginX, y: currentY },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });

  currentY -= 15;

  let curX = marginX;
  const colXPositions: number[] = [];
  colWidths.forEach(w => {
    colXPositions.push(curX);
    curX += w;
  });

  const commissionX = colXPositions[7];
  const netAmountX = colXPositions[8];

  page.drawText("Total", {
    x: commissionX,
    y: currentY - 10,
    size: 8,
    font: boldFont,
    color: rgb(0, 0, 0),
  });

  const formattedTotal = totalNetSum.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  page.drawText(formattedTotal, {
    x: netAmountX,
    y: currentY - 10,
    size: 8,
    font: boldFont,
    color: rgb(0, 0, 0),
  });

  currentY -= 15;

  // Secondary divider line under totals (accountant style)
  page.drawLine({
    start: { x: marginX, y: currentY },
    end: { x: pageWidth - marginX, y: currentY },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
}

function extractAmounts(text: string): number[] {
  const matches = text.match(/\b\d{1,3}(?:,\d{3})*(?:\.\d{1,3})?\b/g);
  if (!matches) return [];
  
  const amounts: number[] = [];
  for (const m of matches) {
    const val = parseFloat(m.replace(/,/g, ''));
    if (isNaN(val)) continue;
    
    // Filter out years
    if (val >= 2020 && val <= 2030) continue; 
    
    // If it's a whole number, it needs to be reasonably large but not huge (like an account number)
    if (!m.includes('.')) {
      if (val < 50 || val > 50000) continue; 
    }
    
    amounts.push(val);
  }
  return amounts;
}

function isEmailPdfMatch(
  batchNum: string,
  descId: string,
  unitId: string,
  batchName: string,
  fullText: string,
  emailText: string,
  emailFileName: string
): boolean {
  
  const emailTextLower = emailText.toLowerCase();
  const emailFileNameLower = emailFileName.toLowerCase();
  const fullTextLower = fullText.toLowerCase();

  // 0. Strong Amount Match Filter
  const journalAmounts = extractAmounts(fullTextLower);
  const emailAmounts = extractAmounts(emailTextLower);
  
  let amountMatch = false;
  if (journalAmounts.length > 0 && emailAmounts.length > 0) {
    for (const ja of journalAmounts) {
       for (const ea of emailAmounts) {
         if (Math.abs(ja - ea) < 1.0) {
           amountMatch = true;
           break;
         }
       }
       if (amountMatch) break;
    }
  } else {
    // If no valid amounts found in either, allow it to proceed to text matching
    amountMatch = true;
  }
  
  if (!amountMatch) return false;


  // Use unitId in matching
  if (unitId && unitId.length > 0) {
      const unitIdLower = unitId.toLowerCase();
      // If unitId is present in journal, it should ideally be in the email
      if (!emailTextLower.includes(unitIdLower) && !emailFileNameLower.includes(unitIdLower)) {
          return false;
      }
  }

  // 1. Direct match on Description ID (e.g. CRNOTE-WR-55018, WT-44910, KIBYR-4765)
  if (descId) {
    const descIdLower = descId.toLowerCase().trim();
    if (descIdLower.length > 3) {
      if (emailTextLower.includes(descIdLower) || emailFileNameLower.includes(descIdLower)) {
        return true;
      }
      
      // Match normalized description (e.g. ignoring dashes or spaces)
      const descIdNorm = descIdLower.replace(/[^a-z0-9]/g, '');
      const emailTextNorm = emailTextLower.replace(/[^a-z0-9]/g, '');
      const emailFileNameNorm = emailFileNameLower.replace(/[^a-z0-9]/g, '');
      if (descIdNorm.length >= 4 && (emailTextNorm.includes(descIdNorm) || emailFileNameNorm.includes(descIdNorm))) {
        return true;
      }
    }

    // Try extracting alphanumeric parts (e.g. WR-55018 -> WR, 55018)
    const refMatch = descId.match(/(?:KIB|WR|WT|CRNOTE-WR)[A-Z]*\s*[- ]?\s*(\d{4,5})/i);
    if (refMatch) {
      const fullRef = refMatch[0].toLowerCase();
      const numPart = refMatch[1];
      if (emailTextLower.includes(fullRef) || emailFileNameLower.includes(fullRef)) {
        return true;
      }
      if (numPart && numPart.length >= 4 && (emailTextLower.includes(numPart) || emailFileNameLower.includes(numPart))) {
        // Verify if clinic name is also present in the email to avoid false positives on random numbers
        const nameParts = batchName.split('-');
        const clinicName = nameParts[0].toLowerCase().trim();
        if (clinicName.length > 3 && (emailTextLower.includes(clinicName) || emailFileNameLower.includes(clinicName))) {
          return true;
        }
      }
    }
  }

  // 2. Match on Batch Number
  if (batchNum && batchNum.length > 3) {
    const batchNumLower = batchNum.toLowerCase();
    if (emailTextLower.includes(batchNumLower) || emailFileNameLower.includes(batchNumLower)) {
      return true;
    }
  }

  // 3. Match on clinic/merchant name and voucher numbers from full text
  // Avoid using generic terms like Cus_Rec as the clinic name
  let clinicName = "";
  if (descId) {
    clinicName = descId.split('-')[0].toLowerCase().trim();
  } else {
    const nameParts = batchName.split('-');
    clinicName = nameParts.length > 1 && nameParts[0].toLowerCase().includes('cus_rec') ? nameParts[1].toLowerCase().trim() : nameParts[0].toLowerCase().trim();
  }

  const genericNames = ['cus_rec', 'pos', 'knet', 'cash', 'bank', 'transfer'];
  if (clinicName.length > 3 && !genericNames.includes(clinicName)) {
    if (emailTextLower.includes(clinicName) || emailFileNameLower.includes(clinicName)) {
      
      // If clinic name matches, check if we find any specific reference number from the journal page in the email
      let matchedOnNumber = false;
      if (descId) {
        const numbers = descId.match(/\d+/g);
        if (numbers) {
          for (const num of numbers) {
            // Ignore years to prevent false positive matches across all emails
            if (num.length >= 4 && num !== "2023" && num !== "2024" && num !== "2025" && num !== "2026" && num !== "2027") {
              if (emailTextLower.includes(num) || emailFileNameLower.includes(num)) {
                matchedOnNumber = true;
                return true;
              }
            }
          }
        }
      }
      
      // If no specific reference number matched, we can still match if the clinic name is a strong match
      // and we don't have conflicting information
      if (!matchedOnNumber) {
        // Also check if any account number or keyword from the full text is found in the email
        const accountMatches = fullTextLower.match(/\b\d{10,12}\b/g) || fullTextLower.match(/(?:KIB[A-Z0-9-]*)/gi);
        if (accountMatches) {
          for (const acc of accountMatches) {
            const cleanAcc = acc.toLowerCase();
            if (cleanAcc.length >= 4 && emailTextLower.includes(cleanAcc)) {
              return true;
            }
          }
        }
      }
    }
  }

  // 4. Phrase matching (e.g. for "Mira Packaging" from "Mira Packaging Factory-Rent: Rent July 2026 Billing")
  if (descId) {
    const descIdClean = descId.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    const stopwords = new Set(['for', 'the', 'and', 'with', 'from', 'month', 'year', 'rent', 'billing', 'invoice']);
    const descWords = descIdClean.split(/\s+/).filter(w => w.length > 2 && !stopwords.has(w));
    
    // Check for 2+ consecutive words matching
    for (let i = 0; i < descWords.length - 1; i++) {
      const phrase = `${descWords[i]} ${descWords[i+1]}`;
      // Exclude overly generic phrases to avoid false positives
      const genericWords = "january|february|march|april|may|june|july|august|september|october|november|december|rent|billing|invoice|payment|receipt|deposit|slip|year|month|company|co|ltd|wll|spc|est|trading|factory|\\d+";
      const isDateOrGeneric = new RegExp('^(' + genericWords + ')\\s+(' + genericWords + ')$', 'i').test(phrase);
      
      if (!isDateOrGeneric) {
        if (emailFileNameLower.includes(phrase) || emailTextLower.includes(phrase)) {
          return true;
        }
      }
    }
  }

  return false;
}

export async function processFiles(
  mainPdfFile: File,
  bankStatements: File[],
  csvFiles: File[],
  emailFiles: File[] = [],
  onProgress: (msg: string) => void
): Promise<ProcessingResult[]> {
  onProgress("Loading PDF toolset...");
  const mainPdfBuffer = await mainPdfFile.arrayBuffer();
  // Pass a cloned buffer to pdf.js so the original buffer remains intact for pdf-lib
  const pdf = await pdfjsLib.getDocument({ data: mainPdfBuffer.slice(0) }).promise;
  const numPages = pdf.numPages;

  const batches: Record<string, BatchData> = {};
  let currentBatchNum = "Unknown_Batch";
  let currentDescId = "";
  let currentNameVal = "";

  onProgress("Analyzing pages...");
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    // Simple text extraction
    const text = textContent.items.map((item: any) => (item as any).str).join(' ');

    const batchRegex = /Journal batch number\s*[:]?\s*([A-Z0-9-]+)/i;
    const nameRegex = /Name\s*[:]?\s*([A-Z0-9_-]+)/i;
    const descRegex = /Description\s*[:]?\s*(.*?)(?:\s+Log|\s+Voucher)/i;
    const altDescMatch = text.match(/(CRNOTE-WR[A-Z]*\s*-?\s*\d{4,5})/i) || 
                         text.match(/(KIB[A-Z]*\s*-?\s*\d{4})/i) || 
                         text.match(/(WR[A-Z]*\s*-?\s*\d{4,5})/i) || 
                         text.match(/(WT[A-Z]*\s*-?\s*\d{4,5})/i);

    const batchMatch = text.match(batchRegex);
    
    let foundBatchNum = '';
    if (batchMatch) {
      foundBatchNum = batchMatch[1].trim();
    } else if (altDescMatch) {
      foundBatchNum = `Batch_${altDescMatch[0]}`;
    } else {
      foundBatchNum = currentBatchNum === "Unknown_Batch" ? `Batch_Page_${i}` : currentBatchNum;
    }

    if (foundBatchNum !== "Unknown_Batch" && foundBatchNum !== currentBatchNum && !foundBatchNum.startsWith('Batch_Page_')) {
       currentBatchNum = foundBatchNum;
    } else if (currentBatchNum === "Unknown_Batch" || currentBatchNum.startsWith('Batch_Page_')) {
       currentBatchNum = foundBatchNum;
    }

    const nameMatch = text.match(nameRegex);
    if (nameMatch) {
      currentNameVal = nameMatch[1].trim();
    }

    const descMatch = text.match(descRegex);
    if (descMatch) {
      currentDescId = descMatch[1].trim();
    } else if (altDescMatch) {
      currentDescId = altDescMatch[0];
    }

    let pageName = currentBatchNum;
    if (currentNameVal && currentDescId) {
      pageName = `${currentNameVal}-${currentDescId}`;
    } else if (currentDescId) {
      pageName = currentDescId;
    }

    if (!batches[currentBatchNum]) {
      batches[currentBatchNum] = {
        name: pageName,
        descId: currentDescId,
        unitId: "",
        pages: [],
        fullText: ""
      };
    }

    if ((batches[currentBatchNum].name === currentBatchNum || !batches[currentBatchNum].descId) && currentDescId) {
      batches[currentBatchNum].name = pageName;
      batches[currentBatchNum].descId = currentDescId;
    }

    // Extract unitId
    const unitMatch = text.match(/(?:unit\s*[#]?\s*([a-z0-9-]+))/i);
    if (unitMatch && unitMatch[1]) {
        batches[currentBatchNum].unitId = unitMatch[1];
    }

    batches[currentBatchNum].pages.push(i - 1);
    batches[currentBatchNum].fullText += "\n" + text;
  }

  // Extract text from Email PDFs
  const emailTexts: { file: File; text: string }[] = [];
  if (emailFiles.length > 0) {
    onProgress("Analyzing Email PDFs...");
    for (let eIdx = 0; eIdx < emailFiles.length; eIdx++) {
      const emailFile = emailFiles[eIdx];
      onProgress(`Reading Email PDF ${eIdx + 1} of ${emailFiles.length}: ${emailFile.name}`);
      try {
        const emailBuffer = await emailFile.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: emailBuffer.slice(0) }).promise;
        let fullEmailText = "";
        for (let p = 1; p <= doc.numPages; p++) {
          const page = await doc.getPage(p);
          const textContent = await page.getTextContent();
          const text = textContent.items.map((item: any) => (item as any).str).join(' ');
          fullEmailText += "\n" + text;
        }
        emailTexts.push({ file: emailFile, text: fullEmailText });
      } catch (err) {
        console.error(`Failed to extract text from email PDF ${emailFile.name}:`, err);
        emailTexts.push({ file: emailFile, text: "" });
      }
    }
  }

  // Aggregate CSV Data
  let aggregatedCsvData: any[] = [];
  for (const csv of csvFiles) {
    const text = await csv.text();
    const result = Papa.parse(text, { header: true, skipEmptyLines: true });
    aggregatedCsvData = aggregatedCsvData.concat(result.data);
  }

  const results: ProcessingResult[] = [];
  const srcPdf = await PDFDocument.load(mainPdfBuffer);

  onProgress("Splitting and merging...");
  const batchEntries = Object.entries(batches);
  for (let idx = 0; idx < batchEntries.length; idx++) {
    const [batchNum, data] = batchEntries[idx];
    onProgress(`Processing batch ${idx + 1} of ${batchEntries.length}: ${data.name}`);

    const outputPdf = await PDFDocument.create();

    // Find matching bank statement
    let matchedBsFile: File | undefined;
    let last4 = '';
    const batchInfo = BATCH_MAPPING[batchNum];
    if (batchInfo) {
      last4 = batchInfo.last4;
    } else if (data.descId) {
      const match = data.descId.match(/(?:KIB|WR|WT|CRNOTE-WR)[A-Z]*\s*[- ]?\s*(\d{4,5})/i) || data.descId.match(/(\d{4,5})/);
      if (match) { 
        last4 = match[1].slice(-4);
        console.log(`Extracted last4: ${last4} from ID: ${data.descId}`);
      }
    }

    if (last4) {
      matchedBsFile = bankStatements.find(bs => bs.name.toLowerCase().includes(last4.toLowerCase()));
      if (matchedBsFile) {
        console.log(`Matched statement: ${matchedBsFile.name} for last4: ${last4}`);
      }
    }
    
    if (!matchedBsFile && data.descId) {
      matchedBsFile = bankStatements.find(bs => 
        bs.name.toLowerCase().includes(data.descId.toLowerCase())
      );
    }

    // Match CSV data
    let matchedRows: any[] = [];
    if (aggregatedCsvData.length > 0) {
      const searchId = last4 || (data.descId ? (data.descId.match(/\d{4,5}/)?.[0]?.slice(-4) || "") : "");
      const pdfTextLower = data.fullText.toLowerCase();

      matchedRows = aggregatedCsvData.filter(row => {
        const accKey = Object.keys(row).find(k => /Account\s*(?:Number|No\.?|#|Id)|Iban|Acc/i.test(k)) || 'Account Number';
        const knetKey = Object.keys(row).find(k => /KNET\s*Reference|Reference|Ref|Trace|Auth/i.test(k)) || 'KNET Reference';
        const merchKey = Object.keys(row).find(k => /Merchant\s*Name|Name|Customer|Shop/i.test(k)) || 'Merchant Name';
        
        const rawAccNum = String(row[accKey] || '').trim();
        const rawKnetRef = String(row[knetKey] || '').trim();
        const rawMerchName = String(row[merchKey] || '').trim();
        
        const accNumNorm = rawAccNum.replace(/[^a-z0-9]/gi, '').toLowerCase();

        if (accNumNorm && accNumNorm.length > 3 && pdfTextLower.includes(accNumNorm)) return true;
        if (rawKnetRef && rawKnetRef.length > 3 && pdfTextLower.includes(rawKnetRef.toLowerCase())) return true;
        if (searchId && searchId.length >= 4 && (accNumNorm.endsWith(searchId) || rawKnetRef.includes(searchId))) return true;
        
        return false;
      });
    }

    // Find matching Email PDFs
    const matchedEmailFiles: File[] = [];
    for (const item of emailTexts) {
      if (isEmailPdfMatch(batchNum, data.descId, data.unitId, data.name, data.fullText, item.text, item.file.name)) {
        matchedEmailFiles.push(item.file);
      }
    }

    // Copy original pages
    const copiedMainPages = await outputPdf.copyPages(srcPdf, data.pages);
    copiedMainPages.forEach(p => outputPdf.addPage(p));

    let matched = false;
    if (matchedBsFile) {
      const bsBuffer = await matchedBsFile.arrayBuffer();
      const bsPdf = await PDFDocument.load(bsBuffer);
      const copiedBsPages = await outputPdf.copyPages(bsPdf, bsPdf.getPageIndices());
      copiedBsPages.forEach(p => outputPdf.addPage(p));
      matched = true;
    }

    // Append matched Email PDFs
    let matchedEmailsCount = 0;
    const matchedEmailNames: string[] = [];
    for (const emailFile of matchedEmailFiles) {
      try {
        const emailBuffer = await emailFile.arrayBuffer();
        const emailPdf = await PDFDocument.load(emailBuffer);
        const copiedEmailPages = await outputPdf.copyPages(emailPdf, emailPdf.getPageIndices());
        copiedEmailPages.forEach(p => outputPdf.addPage(p));
        matchedEmailsCount++;
        matchedEmailNames.push(emailFile.name);
      } catch (err) {
        console.error(`Failed to append email PDF ${emailFile.name}:`, err);
      }
    }

    // append matched CSV transaction data pages to the PDF
    if (matchedRows.length > 0) {
      await appendCsvPages(outputPdf, matchedRows, data.name);
    }

    const pdfBytes = await outputPdf.save();
    
    // Calculate final descriptive filename suffix
    let suffixParts: string[] = [];
    if (matched) suffixParts.push("StatementMatch");
    if (matchedRows.length > 0) suffixParts.push("CSVMatch");
    if (matchedEmailsCount > 0) suffixParts.push("EmailMatch");
    
    let suffix = "";
    if (suffixParts.length === 3) {
      suffix = "_FullMatched";
    } else if (suffixParts.length > 0) {
      suffix = "_" + suffixParts.join("_");
    }

    const fileName = `${data.name}${suffix}.pdf`.replace(/[\\/:*?"<>|]/g, "_").trim();
    
    results.push({
      fileName,
      blob: new Blob([pdfBytes], { type: 'application/pdf' }),
      matched,
      matchedCsvRows: matchedRows.length,
      matchedEmailsCount,
      matchedEmailNames
    });
  }

  return results;
}
