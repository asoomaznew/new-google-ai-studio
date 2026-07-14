const text = `General journal BILSAAN REAL ESTATE S.P.C. Page 5 of 12 13/07/2026 14:57 Journal batch number 24-003944 Created by Haitham Abddou Posted No Name Cus_Rec Posted by Posted on Description WAED INDUSTRIAL INNOVATION COMPANY W.L.L-Rent: Rent July 202 Log Voucher 24-CUSTREC 000002293`;
const descRegex = /Description\s*[:]?\s*(.*?)(?:\s+Log|\s+Voucher)/i;
const descMatch = text.match(descRegex);
console.log("descMatch:", descMatch ? descMatch[1] : null);
