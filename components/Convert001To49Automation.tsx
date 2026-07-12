import React, { useState, useCallback, useRef, useMemo } from 'react';
import { ProcessIcon, DownloadIcon, XIcon, CheckCircleIcon, XCircleIcon, ClockIcon, SpinnerIcon } from './icons';
import { extractTextFromExcel } from '../services/excelService';
import * as XLSX from 'xlsx';
import JournalEntryTable from './JournalEntryTable';
import { JournalEntry } from '../types';
import { CLOVER_BANK_INFO, VENDOR_OFFSET_ACCOUNTS, WARBA_BANK_INFO, WARBA_VENDOR_OFFSET_ACCOUNTS } from '../constants';

type FileStatus = 'pending' | 'processing' | 'done' | 'error';

const BANK_ACCOUNT_MAPPING: Record<string, string> = {
    "AL ASEEL INTERNATIONAL POLYCLINIC": "WTAA-61012",
    "IRIS POLYCLINIC": "WRIR-73018",
    "YARROW POLYCLINIC": "WRYR-67011",
    "FOURTH MEDICAL CENTER": "WRFM-55018",
    "JOYA POLYCLINIC": "WRJY-10018",
    "MEDICAL HARBOUR CENTER": "WRMH-86019",
    "MED MARINE POLYCLINIC": "WRMM-42013",
    "Med Marine Medical Polyclinic": "WRMM-42013",
    "MED GRAY POLYCLINIC": "WRMG-77018",
    "ARAM MEDICAL POLYCLINIC": "WRAM-95018",
    "TRI CARE CLINIC": "WRTR-54019",
    // Leaving others empty for fallback
};

// The requested output headers
const CONVERT_OUTPUT_HEADERS = [
    "Journal Number", "Journal Name", "Line Num", "Posting Date", "Account Type - Ledger - 0/ Customer - 1 /Vendor - 2/ Fixed assets - 5/ Bank - 6",
    "Account No", "Description", "Debit Amount", "Credit Amount", "Currency Code",
    "Exchange Rate", "Offset account Type - Ledger - 0/ Customer - 1 /Vendor - 2/ Fixed assets - 5/ Bank - 6",
    "Offset account", "Invoice No", "Document No", "Document Date", "Due Date",
    "Asset trans type - Acq - 1 / Depre - 3", "Posting Profile", "Payment Mode", "Payment Reference",
    "Number of Voucher", "Activities", "Country", "Departments", "Project_ID", "Property_ID"
];

const Header: React.FC = () => (
    <div className="mb-6">
        <div className="flex items-center">
            <ProcessIcon className="w-8 h-8 text-indigo-400 mr-3" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-slate-200">Convert 001 to 49</h1>
        </div>
         <p className="text-sm text-slate-400 mt-2 sm:mt-0 ml-11">Filter by Offset Account 50-000001 and map to 49-000001</p>
    </div>
);

const Convert001To49Automation: React.FC = () => {
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [fileStatuses, setFileStatuses] = useState<{ [fileName: string]: FileStatus }>({});
    const [journalEntriesByFile, setJournalEntriesByFile] = useState<{ [fileName: string]: any[] }>({});
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [errors, setErrors] = useState<{ [fileName: string]: string }>({});
    const [searchTerm, setSearchTerm] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files) {
            const fileList = Array.from(files) as File[];
            setSelectedFiles(fileList);
            const initialStatuses: { [key: string]: FileStatus } = {};
            fileList.forEach(f => initialStatuses[f.name] = 'pending');
            setFileStatuses(initialStatuses);
            setErrors({});
            setJournalEntriesByFile({});
        }
    };

    const handleRemoveFile = (fileNameToRemove: string) => {
        setSelectedFiles(prevFiles => prevFiles.filter(file => file.name !== fileNameToRemove));
        setFileStatuses(prev => {
            const newState = { ...prev };
            delete newState[fileNameToRemove];
            return newState;
        });
    };

    const resetState = () => {
        setSelectedFiles([]);
        setFileStatuses({});
        setErrors({});
        setJournalEntriesByFile({});
        setSearchTerm('');
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const processExcelFile = async (file: File) => {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const data = new Uint8Array(arrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet) as any[];
            
            const getVal = (row: any, key: string) => {
                const normalizedKey = key.trim().toLowerCase();
                const foundKey = Object.keys(row).find(k => k.trim().toLowerCase() === normalizedKey);
                return foundKey ? row[foundKey] : undefined;
            };
            
            const convertedEntries = [];
            let journalNumberCounter = 0;
            let lastAccountNo = '';
            let lineNumCounter = 0;

            for (const row of rows) {
                // Check for Offset Account starting with 50- (any Clover 50 account)
                const offsetAccountInfo = getVal(row, 'Offset Account') ?? getVal(row, 'Offset account');
                const offsetAccount = offsetAccountInfo?.toString().trim();
                if (!offsetAccount || !offsetAccount.startsWith('50-')) continue;

                const accountNo = getVal(row, 'Account No')?.toString().trim() || '';

                // Group by original Account No
                if (accountNo !== lastAccountNo) {
                    journalNumberCounter++;
                    lastAccountNo = accountNo;
                    lineNumCounter = 1;
                } else {
                    lineNumCounter++;
                }

                // Determine new Debit and Credit
                const oldDebitInfo = getVal(row, 'Debit Amount');
                const oldCreditInfo = getVal(row, 'Credit Amount');
                
                let newDebit: any = '';
                let newCredit: any = '';

                const oldDebitStr = oldDebitInfo ? oldDebitInfo.toString().trim() : '';
                const oldCreditStr = oldCreditInfo ? oldCreditInfo.toString().trim() : '';

                if (oldDebitStr === '' && oldCreditStr !== '') {
                    newDebit = oldCreditInfo;
                } else if (oldDebitStr !== '' && oldCreditStr === '') {
                    newCredit = oldDebitInfo;
                } else {
                    // If both or neither, just swap anyway or handle appropriately
                    newDebit = oldCreditInfo || '';
                    newCredit = oldDebitInfo || '';
                }

                let newAccountNo = accountNo;
                let newOffsetAccount = '50-000001';
                let activities = getVal(row, 'Activities') || '';
                let country = getVal(row, 'Country') || '';
                let departments = getVal(row, 'Departments') || '';
                let projectId = getVal(row, 'Project_ID') || getVal(row, 'Project ID') || '';
                let propertyId = getVal(row, 'Property_ID') || getVal(row, 'Property ID') || '';

                let bankInfo = WARBA_BANK_INFO.find(info => info.accountNo === accountNo || info.oldAccountNo === accountNo) || 
                                CLOVER_BANK_INFO.find(info => info.accountNo === accountNo || info.oldAccountNo === accountNo);
                
                if (bankInfo) {
                    activities = bankInfo.activities;
                    country = bankInfo.country;
                    departments = bankInfo.departments;
                    projectId = bankInfo.projectId;
                    propertyId = bankInfo.propertyId;

                    // For Clover, we used BANK_ACCOUNT_MAPPING, but since Warba already has correct new account as `accountNo` (e.g. WTAA-61012):
                    if (BANK_ACCOUNT_MAPPING[bankInfo.accountName]) {
                        newAccountNo = BANK_ACCOUNT_MAPPING[bankInfo.accountName];
                    } else {
                        // Default to the mapped account No (e.g. from Warba)
                        newAccountNo = bankInfo.accountNo || newAccountNo;
                    }
                    
                    if (WARBA_VENDOR_OFFSET_ACCOUNTS[bankInfo.accountName]) {
                        newOffsetAccount = WARBA_VENDOR_OFFSET_ACCOUNTS[bankInfo.accountName];
                    } else if (VENDOR_OFFSET_ACCOUNTS[bankInfo.accountName]) {
                        newOffsetAccount = VENDOR_OFFSET_ACCOUNTS[bankInfo.accountName];
                    }
                }

                const formatDate = (val: any) => {
                    if (!val) return '';
                    if (val instanceof Date) {
                        const day = String(val.getDate()).padStart(2, '0');
                        const month = String(val.getMonth() + 1).padStart(2, '0');
                        const year = val.getFullYear();
                        return `${day}-${month}-${year}`;
                    }
                    if (typeof val === 'number') {
                        try {
                            const date = XLSX.SSF.parse_date_code(val);
                            const day = String(date.d).padStart(2, '0');
                            const month = String(date.m).padStart(2, '0');
                            const year = date.y;
                            return `${day}-${month}-${year}`;
                        } catch (e) {
                            return val.toString();
                        }
                    }
                    return val.toString();
                };

                const newEntry = {
                    "Journal Number": journalNumberCounter,
                    "Journal Name": "GenJournal",
                    "Line Num": lineNumCounter,
                    "Posting Date": formatDate(getVal(row, 'Posting Date')),
                    "Account Type - Ledger - 0/ Customer - 1 /Vendor - 2/ Fixed assets - 5/ Bank - 6": 1, // 1 for Customer
                    "Account No": '49-000001',
                    "Description": (() => {
                        const desc = (getVal(row, 'Description') || '').toString();
                        return desc.split('/')[0].trim();
                    })(),
                    "Debit Amount": newDebit,
                    "Credit Amount": newCredit,
                    "Currency Code": getVal(row, 'Currency Code') || 'KWD',
                    "Exchange Rate": getVal(row, 'Exchange Rate') || 100,
                    "Offset account Type - Ledger - 0/ Customer - 1 /Vendor - 2/ Fixed assets - 5/ Bank - 6": '', // Empty to match output
                    "Offset account": 0, // Integer 0 to match output
                    "Invoice No": '2101432',
                    "Document No": getVal(row, 'Invoice No') || getVal(row, 'Invoice no') || '',
                    "Document Date": '', // Empty to match output
                    "Due Date": formatDate(getVal(row, 'Posting Date')) || formatDate(getVal(row, 'Due Date')),
                    "Asset trans type - Acq - 1 / Depre - 3": getVal(row, 'Asset Trans Type') || getVal(row, 'Asset trans type') || '',
                    "Posting Profile": getVal(row, 'Posting Profile') || '',
                    "Payment Mode": getVal(row, 'Payment Mode') || '',
                    "Payment Reference": getVal(row, 'Payment Reference') || '',
                    "Number of Voucher": lineNumCounter,
                    "Activities": activities,
                    "Country": country,
                    "Departments": departments,
                    "Project_ID": projectId,
                    "Property_ID": propertyId
                };

                convertedEntries.push(newEntry);
            }
            return convertedEntries;
        } catch (err) {
            throw err;
        }
    };

    const handleProcess = async () => {
        if (selectedFiles.length === 0) {
            setErrors({ general: "Please upload an Excel/CSV file." });
            return;
        }
        setIsLoading(true);
        setErrors({});
        setJournalEntriesByFile({});

        for (const file of selectedFiles) {
            setFileStatuses(prev => ({ ...prev, [file.name]: 'processing' }));
            try {
                const entries = await processExcelFile(file);
                setJournalEntriesByFile(prev => ({ ...prev, [file.name]: entries }));
                setFileStatuses(prev => ({ ...prev, [file.name]: 'done' }));
            } catch (err: any) {
                setErrors(prev => ({ ...prev, [file.name]: err.message || "Error processing file." }));
                setFileStatuses(prev => ({ ...prev, [file.name]: 'error' }));
            }
        }

        setIsLoading(false);
    };

    const handleDownload = () => {
        if (Object.keys(journalEntriesByFile).length === 0) return;

        const allEntries = Object.values(journalEntriesByFile).flat();
        if (allEntries.length === 0) return;

        const ws = XLSX.utils.json_to_sheet(allEntries, { header: CONVERT_OUTPUT_HEADERS });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Converted Entries");

        const xlsxContent = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([xlsxContent], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = "Converted_49_000001.xlsx";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // To display them using JournalEntryTable, map to expected keys
    const previewEntries = useMemo(() => {
        const all = Object.values(journalEntriesByFile).flat();
        return all.map(row => ({
            journalNumber: row["Journal Number"],
            journalName: row["Journal Name"],
            lineNum: row["Line Num"],
            postingDate: row["Posting Date"],
            accountType: row["Account Type - Ledger - 0/ Customer - 1 /Vendor - 2/ Fixed assets - 5/ Bank - 6"],
            accountNo: row["Account No"],
            description: row["Description"],
            debitAmount: row["Debit Amount"],
            creditAmount: row["Credit Amount"],
            currencyCode: row["Currency Code"],
            exchangeRate: row["Exchange Rate"],
            offsetAccountType: row["Offset account Type - Ledger - 0/ Customer - 1 /Vendor - 2/ Fixed assets - 5/ Bank - 6"],
            offsetAccount: row["Offset account"],
            invoiceNo: row["Invoice No"],
            documentNo: row["Document No"],
            documentDate: row["Document Date"],
            dueDate: row["Due Date"],
            assetTransType: row["Asset trans type - Acq - 1 / Depre - 3"],
            postingProfile: row["Posting Profile"],
            paymentMode: row["Payment Mode"],
            paymentReference: row["Payment Reference"],
            numberOfVoucher: row["Number of Voucher"],
            activities: row["Activities"],
            country: row["Country"],
            departments: row["Departments"],
            projectId: row["Project_ID"],
            propertyId: row["Property_ID"]
        })) as JournalEntry[];
    }, [journalEntriesByFile]);

    const filteredEntries = useMemo(() => {
        if (!searchTerm.trim()) return previewEntries;
        const lower = searchTerm.toLowerCase();
        return previewEntries.filter(entry => 
            Object.values(entry).some(value => String(value).toLowerCase().includes(lower))
        );
    }, [previewEntries, searchTerm]);

    const hasErrors = Object.keys(errors).length > 0;
    const hasJournalEntries = previewEntries.length > 0;

    return (
        <div>
            <Header />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Input Panel */}
                <div className="bg-dark-200 p-6 rounded-lg shadow-lg">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-semibold text-slate-200">1. Upload Input Excel</h2>
                         {selectedFiles.length > 0 && (
                            <button onClick={resetState} className="text-sm text-sky-400 hover:text-sky-300">Start Over</button>
                        )}
                    </div>
                    
                    <div 
                        className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dark-300 border-dashed rounded-md cursor-pointer hover:border-sky-500 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <div className="space-y-1 text-center">
                            <ProcessIcon className="mx-auto h-12 w-12 text-slate-500" />
                            <div className="flex text-sm text-slate-500 justify-center">
                                <label className="relative cursor-pointer bg-dark-200 rounded-md font-medium text-sky-500 hover:text-sky-400">
                                    <span>Upload Excel Files</span>
                                    <input type="file" className="sr-only" multiple onChange={handleFileChange} ref={fileInputRef} accept=".xlsx,.xls,.csv" />
                                </label>
                            </div>
                        </div>
                    </div>

                    {selectedFiles.length > 0 && (
                        <div className="mt-4 space-y-2">
                             {selectedFiles.map((f, i) => (
                                 <div key={i} className="flex justify-between p-2 bg-dark-300 rounded text-sm text-slate-300 items-center">
                                     <span>{f.name}</span>
                                     <button onClick={() => handleRemoveFile(f.name)} className="text-slate-500 hover:text-red-400"><XIcon className="w-4 h-4"/></button>
                                 </div>
                             ))}
                        </div>
                    )}

                    <div className="mt-6">
                        <button
                            onClick={handleProcess}
                            disabled={isLoading || selectedFiles.length === 0}
                            className="w-full inline-flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-600"
                        >
                            {isLoading ? <SpinnerIcon className="animate-spin -ml-1 mr-3 h-5 w-5" /> : <ProcessIcon className="-ml-1 mr-3 h-5 w-5" />}
                            Process File
                        </button>
                    </div>
                </div>

                {/* Output Panel */}
                <div className="bg-dark-200 p-6 rounded-lg shadow-lg flex flex-col">
                    <h2 className="text-xl font-semibold mb-4 text-slate-200">2. Results</h2>
                    
                    <div className="flex-grow flex flex-col justify-start space-y-4">
                       {hasErrors && Object.entries(errors).map(([fileName, errorMsg]) => (
                            <div key={fileName} className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-md">
                                <strong className="font-bold">{fileName}: </strong> <span>{errorMsg}</span>
                            </div>
                        ))}
                        
                        {hasJournalEntries && (
                            <div className="space-y-4">
                                 <JournalEntryTable
                                    headers={CONVERT_OUTPUT_HEADERS}
                                    entries={filteredEntries}
                                    searchTerm={searchTerm}
                                    onSearchChange={setSearchTerm}
                                />
                                <button
                                    onClick={handleDownload}
                                    className="w-full inline-flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700"
                                >
                                    <DownloadIcon className="-ml-1 mr-3 h-5 w-5" />
                                    Download Converted Excel
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Convert001To49Automation;
