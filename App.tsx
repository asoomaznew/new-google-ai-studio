import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";
import JSZip from "jszip";
import {
  RenameMethod,
  type ProcessedFile,
  FileProcessStatus,
  type LogEntry,
} from "./types";
import FileUploader from "./components/FileUploader";
import SettingsPanel from "./components/SettingsPanel";
import ActionButtons from "./components/ActionButtons";
import ResultsTable from "./components/ResultsTable";
import LogArea from "./components/LogArea";
import {
  extractTextFromPdfWithPageNumbers,
  searchKeywordsInPdf,
  type KeywordSearchResult,
} from "./services/pdfService";
import { extractTextFromExcel } from "./services/excelService";
import { getNewFilename } from "./services/renameService";
import {
  DocumentMagnifyingGlassIcon,
  TrashIcon,
  PrinterIcon,
  XCircleIcon,
  ExternalLinkIcon,
  SparklesIcon,
  MagnifyingGlassIcon,
  Cog6ToothIcon,
  XIcon,
  AlertTriangleIcon,
} from "./components/icons";
import MerchantEntryAutomation from "./components/MerchantEntryAutomation";
import WarbaEntryAutomation from "./components/WarbaEntryAutomation";
import EndingBalanceAutomation from "./components/EndingBalanceAutomation";
import MergePdfsAutomation from "./components/MergePdfsAutomation";
import POSEntryAutomation from "./components/POSEntryAutomation";
import POSReport from "./components/POSReport";
import SmartMergeAutomation from "./components/SmartMergeAutomation";
import { getAnswerFromText } from "./services/geminiService";
import Chatbot from "./components/Chatbot";

import Convert001To49Automation from "./components/Convert001To49Automation";
import {
  Home, Stethoscope, Briefcase, FileSearch, MessageSquare, RefreshCw, Calculator, FileStack, Receipt, FileBarChart, Sparkles, Tags
} from "lucide-react";

// pdf.js is loaded from an import map, not a global script
import * as pdfjsLib from "pdfjs-dist";
import * as pdfLib from "pdf-lib";

type AppMode =
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
  | "smart_merge";

// --- PDF Q&A Components ---

interface QaResult {
  fileName: string;
  file: File;
  question: string;
  answer: string;
  pages: number[];
}

interface QaResultCardProps {
  result: QaResult;
  onPrint: (file: File, pages: number[], fileName: string) => void;
}

const QaResultCard: React.FC<QaResultCardProps> = ({ result, onPrint }) => {
  return (
    <div className="bg-dark-300/50 rounded-lg border border-dark-300 animate-fade-in">
      <h4 className="font-semibold text-slate-200 p-4 border-b border-dark-300">
        {result.fileName}
      </h4>
      <div className="p-4 space-y-3">
        <div>
          <p className="text-sm font-medium text-slate-400">Your Question:</p>
          <p className="text-slate-200 mt-1">"{result.question}"</p>
        </div>
        <div>
          <p className="text-sm font-medium text-slate-400">Gemini's Answer:</p>
          <p className="text-slate-200 mt-1 whitespace-pre-wrap">
            {result.answer}
          </p>
        </div>
        {result.pages.length > 0 && (
          <div>
            <p className="text-sm font-medium text-slate-400">Source Pages:</p>
            <div className="flex items-center space-x-2 mt-1">
              <p className="text-sm text-sky-400">{result.pages.join(", ")}</p>
              <button
                onClick={() =>
                  onPrint(result.file, result.pages, result.fileName)
                }
                className="flex items-center text-xs px-2 py-1 bg-sky-900/70 text-sky-300 rounded hover:bg-sky-900 transition-colors"
                title={`Print cited pages`}
              >
                <PrinterIcon className="w-4 h-4 mr-1" /> Print Cited Pages
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const PdfQaComponent: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [question, setQuestion] = useState("");
  const [results, setResults] = useState<QaResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [statusText, setStatusText] = useState(
    "Upload PDFs and ask a question to begin.",
  );

  const handleFilesSelected = (selectedFiles: File[]) => {
    setFiles(selectedFiles);
    setResults([]);
    setStatusText(`Loaded ${selectedFiles.length} PDF(s).`);
  };

  const clearAll = () => {
    setFiles([]);
    setQuestion("");
    setResults([]);
    setIsSearching(false);
    setStatusText("Upload PDFs and ask a question to begin.");
  };

  const handleAsk = async () => {
    if (files.length === 0 || !question.trim()) {
      setStatusText("Please select files and ask a question.");
      return;
    }
    setIsSearching(true);
    setResults([]);

    const allResults: QaResult[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setStatusText(
        `Asking Gemini about file ${i + 1} of ${files.length}: ${file.name}... This may take a moment.`,
      );

      try {
        const pagesText = await extractTextFromPdfWithPageNumbers(file);
        if (pagesText.length === 0) {
          throw new Error("Could not extract any text from the PDF.");
        }
        const { answer, pages } = await getAnswerFromText(pagesText, question);

        allResults.push({
          fileName: file.name,
          file,
          question,
          answer,
          pages,
        });
      } catch (error) {
        console.error(`Failed to process ${file.name}:`, error);
        allResults.push({
          fileName: file.name,
          file,
          question,
          answer: `Error processing this file: ${error instanceof Error ? error.message : "Unknown error"}`,
          pages: [],
        });
      }

      setResults([...allResults]);

      // Add a delay between API calls to avoid rate-limiting
      if (i < files.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // 1-second delay
      }
    }

    setIsSearching(false);
    setStatusText(`Analysis complete for ${allResults.length} file(s).`);
  };

  const handlePrint = async (file: File, pages: number[], fileName: string) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow popups for this site to print.");
      return;
    }

    printWindow.document.write(`
            <html>
                <head>
                    <title>Printing - ${fileName}</title>
                    <style>
                        @media print {
                            @page { margin: 0; size: auto; }
                            body { margin: 0; }
                            canvas { width: 100%; page-break-after: always; }
                            #loader { display: none; }
                        }
                        body { margin: 0; background-color: #333; font-family: sans-serif; }
                        #loader { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); color: white; display: flex; align-items: center; justify-content: center; font-size: 2em; }
                        canvas { display: block; margin: 1em auto; max-width: 100%; height: auto; border: 1px solid #555; }
                    </style>
                </head>
                <body>
                    <div id="loader">Preparing pages for printing...</div>
                    <div id="container"></div>
                </body>
            </html>
        `);
    printWindow.document.close();

    try {
      const arrayBuffer = await file.arrayBuffer();
      const typedarray = new Uint8Array(arrayBuffer.slice(0));
      const pdf = await pdfjsLib.getDocument(typedarray).promise;
      const container = printWindow.document.getElementById("container")!;

      for (const pageNum of pages) {
        if (pageNum > 0 && pageNum <= pdf.numPages) {
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = printWindow.document.createElement("canvas");
          const context = canvas.getContext("2d")!;
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          // FIX: Cast to any to satisfy the RenderParameters type for this version of pdf.js.
          await page.render({ canvasContext: context, viewport, canvas } as any)
            .promise;
          container.appendChild(canvas);
        }
      }

      printWindow.document.getElementById("loader")!.style.display = "none";

      printWindow.focus();
      printWindow.print();
      printWindow.onafterprint = () => printWindow.close();
    } catch (error) {
      console.error("Print mapping error:", error);
      printWindow.document.getElementById("loader")!.innerText = "Error preparing pages.";
      setTimeout(() => printWindow.close(), 3000);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-4 space-y-6">
        <div className="bg-dark-200 p-6 rounded-lg border border-dark-300">
          <h2 className="text-xl font-semibold mb-4 text-slate-200">
            1. Upload PDFs
          </h2>
          <FileUploader
            onFilesSelected={handleFilesSelected}
            isProcessing={isSearching}
            acceptedMimeTypes={["application/pdf"]}
            acceptedExtensions={[".pdf"]}
            description="PDF files only"
          />
          {files.length > 0 && (
            <div className="mt-4 text-sm text-slate-300">
              <h3 className="font-semibold mb-1">Selected files:</h3>
              <ul className="list-disc list-inside">
                {files.map((f) => (
                  <li key={f.name} className="truncate">
                    {f.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="bg-dark-200 p-6 rounded-lg border border-dark-300">
          <h2 className="text-xl font-semibold mb-4 text-slate-200">
            2. Ask a Question
          </h2>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={isSearching}
            rows={4}
            className="w-full bg-dark-300 border-dark-300/50 rounded-md shadow-sm p-2 text-slate-200 focus:ring-sky-500 focus:border-sky-500"
            placeholder="e.g., What is the total invoice amount?"
          />
        </div>
        <div className="bg-dark-200 p-6 rounded-lg border border-dark-300">
          <h2 className="text-xl font-semibold mb-4 text-slate-200">
            3. Execute
          </h2>
          <div className="space-y-4">
            <button
              onClick={handleAsk}
              disabled={isSearching || files.length === 0 || !question.trim()}
              className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-200 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-white bg-sky-600 hover:bg-sky-700 focus:ring-sky-500"
            >
              <SparklesIcon className="-ml-1 mr-2 h-5 w-5" />
              {isSearching ? "Thinking..." : "Ask Gemini"}
            </button>
            <button
              onClick={clearAll}
              disabled={isSearching}
              className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-sm font-medium rounded-md shadow-none focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-200 transition-all duration-200 disabled:opacity-50 text-slate-400 hover:bg-dark-300 hover:text-slate-200"
            >
              <TrashIcon className="-ml-1 mr-2 h-5 w-5" />
              Clear All
            </button>
          </div>
        </div>
      </div>
      <div className="lg:col-span-8">
        <div className="bg-dark-200 p-1 rounded-lg border border-dark-300 min-h-[600px] flex flex-col">
          <div className="p-4 border-b border-dark-300">
            <h3 className="text-lg font-semibold text-slate-200">Results</h3>
            <p className="text-sm text-slate-400">{statusText}</p>
          </div>
          <div className="flex-grow overflow-y-auto p-4 space-y-4">
            {isSearching && results.length === 0 && (
              <div className="text-center py-10 text-slate-400">
                Gemini is analyzing the documents...
              </div>
            )}
            {!isSearching && results.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8 text-center">
                <DocumentMagnifyingGlassIcon className="w-16 h-16 mb-4" />
                <h3 className="text-xl font-semibold text-slate-400">
                  Ready for your questions
                </h3>
                <p>Answers from Gemini will appear here.</p>
              </div>
            )}
            {results.map((res) => (
              <QaResultCard
                key={res.fileName}
                result={res}
                onPrint={handlePrint}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- PDF Keyword Search Types ---
interface KeywordSearchResults {
  [fileName: string]: {
    file: File;
    searchResult: KeywordSearchResult;
  };
}

// --- PDF Keyword Search Components ---
interface KeywordResultCardProps {
  fileName: string;
  file: File;
  searchResult: KeywordSearchResult;
  onPrint: (jobs: { file: File; pages: number[]; fileName: string }[]) => void;
}

const KeywordResultCard: React.FC<KeywordResultCardProps> = ({
  fileName,
  file,
  searchResult,
  onPrint,
}) => {
  const allFoundPages = useMemo(() => {
    const pages = new Set<number>();
    Object.values(searchResult).forEach((pageArray: number[]) => {
      pageArray.forEach((p) => pages.add(p));
    });
    return Array.from(pages).sort((a, b) => a - b);
  }, [searchResult]);

  const maxPage = allFoundPages.length > 0 ? Math.max(...allFoundPages) : 0;

  const handlePrintSpecific = (pages: number[]) => {
    onPrint([{ file, pages, fileName }]);
  };

  const handlePrintRange = () => {
    if (maxPage > 0) {
      const pages = Array.from({ length: maxPage }, (_, i) => i + 1);
      onPrint([{ file, pages, fileName }]);
    }
  };

  return (
    <div className="bg-dark-300/50 rounded-lg border border-dark-300 animate-fade-in">
      <div className="flex justify-between items-center p-4 border-b border-dark-300">
        <h4 className="font-semibold text-slate-200 truncate">{fileName}</h4>
        {maxPage > 0 && (
          <button
            onClick={handlePrintRange}
            className="flex-shrink-0 flex items-center text-xs px-2 py-1 bg-sky-900/70 text-sky-300 rounded hover:bg-sky-900 transition-colors"
            title={`Print all pages from 1 to the last found page (${maxPage})`}
          >
            <PrinterIcon className="w-4 h-4 mr-1" /> Print all founded (1 →{" "}
            {maxPage})
          </button>
        )}
      </div>
      <div className="p-4 space-y-3">
        {Object.entries(searchResult).map(
          ([keyword, pages]: [string, number[]]) => {
            if (pages.length === 0) return null;
            const pagesStr = pages.join(", ");
            return (
              <div
                key={keyword}
                className="flex items-center justify-between text-sm"
              >
                <p className="text-slate-300">
                  '<span className="font-semibold text-sky-400">{keyword}</span>
                  ' found on pages: {pagesStr}
                </p>
                <button
                  onClick={() => handlePrintSpecific(pages)}
                  className="flex items-center text-xs px-2 py-1 bg-slate-600/50 text-slate-300 rounded hover:bg-slate-600 transition-colors"
                >
                  <PrinterIcon className="w-4 h-4 mr-1" /> Print Pages
                </button>
              </div>
            );
          },
        )}
      </div>
    </div>
  );
};

const PdfKeywordSearchComponent: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [searchTerms, setSearchTerms] = useState("");
  const [results, setResults] = useState<KeywordSearchResults>({});
  const [isSearching, setIsSearching] = useState(false);
  const [statusText, setStatusText] = useState(
    "Upload PDFs and enter search terms to begin.",
  );

  // AI Chat Bot state
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatResults, setChatResults] = useState<QaResult[]>([]);
  const [isChatting, setIsChatting] = useState(false);

  const stopSignal = useRef(false);

  const handleFilesSelected = (selectedFiles: File[]) => {
    setFiles(selectedFiles);
    setResults({});
    setChatResults([]);
    setStatusText(`Loaded ${selectedFiles.length} PDF(s).`);
  };

  const clearAll = () => {
    setFiles([]);
    setSearchTerms("");
    setResults({});
    setChatQuestion("");
    setChatResults([]);
    setIsSearching(false);
    setIsChatting(false);
    stopSignal.current = false;
    setStatusText("Upload PDFs and enter search terms to begin.");
  };

  const handleStop = () => {
    stopSignal.current = true;
    setStatusText("Stopping process... please wait.");
  };

  const handleChat = async () => {
    if (files.length === 0 || !chatQuestion.trim()) {
      setStatusText("Please select files and ask a question.");
      return;
    }
    setIsChatting(true);
    setChatResults([]);
    stopSignal.current = false;
    setStatusText(`Analyzing ${files.length} file(s) with Gemini...`);

    const allResults: QaResult[] = [];

    for (let i = 0; i < files.length; i++) {
      if (stopSignal.current) {
        setStatusText("Process stopped by user.");
        break;
      }
      const file = files[i];
      setStatusText(
        `Asking Gemini about file ${i + 1} of ${files.length}: ${file.name}...`,
      );

      try {
        const pagesText = await extractTextFromPdfWithPageNumbers(file);
        if (stopSignal.current) break;
        if (pagesText.length === 0) {
          throw new Error("Could not extract any text from the PDF.");
        }
        const { answer, pages } = await getAnswerFromText(
          pagesText,
          chatQuestion,
        );
        if (stopSignal.current) break;

        allResults.push({
          fileName: file.name,
          file,
          question: chatQuestion,
          answer,
          pages,
        });
      } catch (error) {
        console.error(`Failed to process ${file.name}:`, error);
        allResults.push({
          fileName: file.name,
          file,
          question: chatQuestion,
          answer: `Error processing this file: ${error instanceof Error ? error.message : "Unknown error"}`,
          pages: [],
        });
      }

      setChatResults([...allResults]);

      // Add a delay between API calls to avoid rate-limiting
      if (i < files.length - 1 && !stopSignal.current) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    setIsChatting(false);
    if (!stopSignal.current) {
      setStatusText(`Analysis complete for ${allResults.length} file(s).`);
    }
  };

  const handleSearch = async () => {
    const keywords = searchTerms
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    if (files.length === 0 || keywords.length === 0) {
      setStatusText("Please select files and enter search terms.");
      return;
    }
    setIsSearching(true);
    setResults({});
    stopSignal.current = false;
    setStatusText(
      `Searching for ${keywords.length} term(s) in ${files.length} file(s)...`,
    );

    const allResults: KeywordSearchResults = {};

    // Execute searches in parallel
    await Promise.all(
      files.map(async (file) => {
        if (stopSignal.current) return;
        try {
          const searchResult = await searchKeywordsInPdf(file, keywords);
          if (stopSignal.current) return;
          const hasMatches = Object.values(searchResult).some(
            (pages) => pages.length > 0,
          );
          if (hasMatches) {
            allResults[file.name] = { file, searchResult };
          }
        } catch (error) {
          console.error(`Failed to process ${file.name}:`, error);
        }
      }),
    );

    setResults(allResults);
    setIsSearching(false);
    if (!stopSignal.current) {
      const foundFilesCount = Object.keys(allResults).length;
      setStatusText(
        `Search complete. Found results in ${foundFilesCount} of ${files.length} file(s).`,
      );
    } else {
      setStatusText("Search stopped by user.");
    }
  };

  const downloadPages = async (
    downloadJobs: { file: File; pages: number[]; fileName: string }[],
  ) => {
    if (downloadJobs.length === 0) return;

    const zip = new JSZip();

    for (const job of downloadJobs) {
      const arrayBuffer = await job.file.arrayBuffer();
      const pdfDoc = await pdfLib.PDFDocument.load(arrayBuffer);
      const newPdf = await pdfLib.PDFDocument.create();

      // PDFDoc is 0-indexed internally, while job.pages are 1-indexed
      const validPageIndices = job.pages
        .filter((p) => p > 0 && p <= pdfDoc.getPageCount())
        .map((p) => p - 1);

      if (validPageIndices.length > 0) {
        const copiedPages = await newPdf.copyPages(pdfDoc, validPageIndices);
        copiedPages.forEach((p) => newPdf.addPage(p));

        const pdfBytes = await newPdf.save();
        zip.file(job.fileName, pdfBytes);
      }
    }

    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = "extracted_pdf_pages.zip";
    link.click();
  };

  const handleGlobalDownloadSpecific = () => {
    const jobs: { file: File; pages: number[]; fileName: string }[] = [];
    Object.values(results).forEach(
      ({
        file,
        searchResult,
      }: {
        file: File;
        searchResult: KeywordSearchResult;
      }) => {
        const allPages = new Set<number>();
        Object.values(searchResult).forEach((pages: number[]) =>
          pages.forEach((p) => allPages.add(p)),
        );
        if (allPages.size > 0) {
          jobs.push({
            file,
            pages: Array.from(allPages).sort((a, b) => a - b),
            fileName: file.name,
          });
        }
      },
    );
    downloadPages(jobs);
  };

  const handleGlobalDownloadRange = () => {
    const jobs: { file: File; pages: number[]; fileName: string }[] = [];
    Object.values(results).forEach(
      ({
        file,
        searchResult,
      }: {
        file: File;
        searchResult: KeywordSearchResult;
      }) => {
        const allPages = new Set<number>();
        Object.values(searchResult).forEach((pages: number[]) =>
          pages.forEach((p) => allPages.add(p)),
        );
        if (allPages.size > 0) {
          const maxPage = Math.max(...allPages);
          jobs.push({
            file,
            pages: Array.from({ length: maxPage }, (_, i) => i + 1),
            fileName: file.name,
          });
        }
      },
    );
    downloadPages(jobs);
  };

  const hasResults = Object.keys(results).length > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-4 space-y-6">
        <div className="bg-dark-200 p-6 rounded-lg border border-dark-300">
          <h2 className="text-xl font-semibold mb-4 text-slate-200">
            1. Upload PDFs
          </h2>
          <FileUploader
            onFilesSelected={handleFilesSelected}
            isProcessing={isSearching}
            acceptedMimeTypes={["application/pdf"]}
            acceptedExtensions={[".pdf"]}
            description="PDF files only"
          />
          {files.length > 0 && (
            <div className="mt-4 text-sm text-slate-300">
              <h3 className="font-semibold mb-1">Selected files:</h3>
              <ul className="list-disc list-inside">
                {files.map((f) => (
                  <li key={f.name} className="truncate">
                    {f.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="bg-dark-200 p-6 rounded-lg border border-dark-300">
          <h2 className="text-xl font-semibold mb-4 text-slate-200">
            2. Enter Keywords
          </h2>
          <textarea
            value={searchTerms}
            onChange={(e) => setSearchTerms(e.target.value)}
            disabled={isSearching}
            rows={4}
            className="w-full bg-dark-300 border-dark-300/50 rounded-md shadow-sm p-2 text-slate-200 focus:ring-sky-500 focus:border-sky-500"
            placeholder="Enter keywords, separated by commas..."
          />
        </div>
        <div className="bg-dark-200 p-6 rounded-lg border border-dark-300">
          <h2 className="text-xl font-semibold mb-4 text-slate-200">
            3. Execute Search
          </h2>
          <div className="space-y-4">
            {isSearching || isChatting ? (
              <button
                onClick={handleStop}
                className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-200 transition-all duration-200 text-white bg-red-600 hover:bg-red-700 focus:ring-red-500"
              >
                <XCircleIcon className="-ml-1 mr-2 h-5 w-5" />
                Stop Process
              </button>
            ) : (
              <button
                onClick={handleSearch}
                disabled={files.length === 0 || !searchTerms.trim()}
                className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-200 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-white bg-sky-600 hover:bg-sky-700 focus:ring-sky-500"
              >
                <MagnifyingGlassIcon className="-ml-1 mr-2 h-5 w-5" />
                Search Keywords
              </button>
            )}
          </div>
        </div>
        <div className="bg-dark-200 p-6 rounded-lg border border-dark-300">
          <h2 className="text-xl font-semibold mb-4 text-slate-200">
            4. AI Chat Bot
          </h2>
          <div className="space-y-4">
            <textarea
              value={chatQuestion}
              onChange={(e) => setChatQuestion(e.target.value)}
              disabled={isChatting || isSearching}
              rows={3}
              className="w-full bg-dark-300 border-dark-300/50 rounded-md shadow-sm p-2 text-slate-200 focus:ring-sky-500 focus:border-sky-500"
              placeholder="Ask a question about the PDFs..."
            />
            {isSearching || isChatting ? (
              <button
                onClick={handleStop}
                className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-200 transition-all duration-200 text-white bg-red-600 hover:bg-red-700 focus:ring-red-500"
              >
                <XCircleIcon className="-ml-1 mr-2 h-5 w-5" />
                Stop Process
              </button>
            ) : (
              <button
                onClick={handleChat}
                disabled={files.length === 0 || !chatQuestion.trim()}
                className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-200 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-white bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500"
              >
                <SparklesIcon className="-ml-1 mr-2 h-5 w-5" />
                Ask Gemini
              </button>
            )}
            <button
              onClick={clearAll}
              disabled={isSearching || isChatting}
              className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-sm font-medium rounded-md shadow-none focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-200 transition-all duration-200 disabled:opacity-50 text-slate-400 hover:bg-dark-300 hover:text-slate-200"
            >
              <TrashIcon className="-ml-1 mr-2 h-5 w-5" />
              Clear All
            </button>
          </div>
        </div>
      </div>
      <div className="lg:col-span-8">
        <div className="bg-dark-200 p-1 rounded-lg border border-dark-300 min-h-[600px] flex flex-col">
          <div className="p-4 border-b border-dark-300">
            <h3 className="text-lg font-semibold text-slate-200">Results</h3>
            <p className="text-sm text-slate-400">{statusText}</p>
          </div>
          {hasResults && (
            <div className="p-4 border-b border-dark-300 flex items-center space-x-4">
              <h4 className="text-sm font-semibold text-slate-300">
                Global Download Actions:
              </h4>
              <button
                onClick={handleGlobalDownloadSpecific}
                className="flex items-center text-xs px-3 py-1.5 bg-green-900/70 text-green-300 rounded hover:bg-green-900 transition-colors"
              >
                <PrinterIcon className="w-4 h-4 mr-1.5" /> Download All Specific
                Pages
              </button>
              <button
                onClick={handleGlobalDownloadRange}
                className="flex items-center text-xs px-3 py-1.5 bg-blue-900/70 text-blue-300 rounded hover:bg-blue-900 transition-colors"
              >
                <PrinterIcon className="w-4 h-4 mr-1.5" /> Download All Founded
                Ranges
              </button>
            </div>
          )}
          <div className="flex-grow overflow-y-auto p-4 space-y-6">
            {(isSearching || isChatting) &&
              Object.keys(results).length === 0 &&
              chatResults.length === 0 && (
                <div className="text-center py-10 text-slate-400">
                  {isSearching
                    ? "Searching through documents..."
                    : "Analyzing documents with AI..."}
                </div>
              )}
            {!isSearching &&
              !isChatting &&
              Object.keys(results).length === 0 &&
              chatResults.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8 text-center">
                  <DocumentMagnifyingGlassIcon className="w-16 h-16 mb-4" />
                  <h3 className="text-xl font-semibold text-slate-400">
                    Ready for your search or chat
                  </h3>
                  <p>Keyword matches and AI answers will appear here.</p>
                </div>
              )}

            {chatResults.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-200 border-b border-dark-300 pb-2 flex items-center">
                  <SparklesIcon className="w-5 h-5 mr-2 text-indigo-400" />
                  AI Chat Answers
                </h3>
                {chatResults.map((result, idx) => (
                  <QaResultCard
                    key={idx}
                    result={result}
                    onPrint={(file, pages, fileName) =>
                      downloadPages([{ file, pages, fileName }])
                    }
                  />
                ))}
              </div>
            )}

            {hasResults && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-200 border-b border-dark-300 pb-2 flex items-center">
                  <MagnifyingGlassIcon className="w-5 h-5 mr-2 text-sky-400" />
                  Keyword Matches
                </h3>
                {Object.entries(results).map(
                  ([fileName, data]: [
                    string,
                    { file: File; searchResult: KeywordSearchResult },
                  ]) => (
                    <KeywordResultCard
                      key={fileName}
                      fileName={fileName}
                      file={data.file}
                      searchResult={data.searchResult}
                      onPrint={(file, pages, fileName) =>
                        downloadPages([{ file, pages, fileName }])
                      }
                    />
                  ),
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Main App Component ---

const ApiKeyModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const [provider, setProvider] = useState(() => localStorage.getItem('llm_provider') || 'gemini');
  const [baseUrl, setBaseUrl] = useState(() => localStorage.getItem('llm_base_url') || 'http://localhost:11434/v1');
  const [modelName, setModelName] = useState(() => localStorage.getItem('llm_model') || 'llama3');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [modelError, setModelError] = useState("");

  useEffect(() => {
    if (isOpen && provider === 'local' && availableModels.length === 0) {
      fetchModels();
    }
  }, [isOpen, provider]);

  if (!isOpen) return null;

  const fetchModels = async () => {
    setIsFetchingModels(true);
    setModelError("");
    try {
      const res = await fetch(`${baseUrl}/models`);
      if (!res.ok) throw new Error("Failed to fetch models");
      const data = await res.json();
      if (data && data.data && Array.isArray(data.data)) {
        const models = data.data.map((m: any) => m.id);
        setAvailableModels(models);
        if (models.length > 0 && !models.includes(modelName)) {
           setModelName(models[0]);
        }
      } else if (data && data.models && Array.isArray(data.models)) {
        // Fallback for some ollama raw APIs
        const models = data.models.map((m: any) => m.name);
        setAvailableModels(models);
        if (models.length > 0 && !models.includes(modelName)) {
           setModelName(models[0]);
        }
      } else {
        throw new Error("Invalid model response format");
      }
    } catch (err: any) {
      setModelError(`${err.message || "Failed"}. Check that Ollama/LM Studio is running and CORS is allowed (OLLAMA_ORIGINS="*"). If using Safari, Safari blocks local HTTP requests from HTTPS sites. Use Chrome or export the app and run locally!`);
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleSave = () => {
    localStorage.setItem('llm_provider', provider);
    localStorage.setItem('llm_base_url', baseUrl);
    localStorage.setItem('llm_model', modelName);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="apiKeyModalTitle"
    >
      <div
        className="bg-dark-200 border border-dark-300 rounded-lg shadow-xl w-full max-w-md p-6 m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 id="apiKeyModalTitle" className="text-xl font-semibold text-slate-200">
            AI Provider Configuration
          </h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-200 transition-colors"
            aria-label="Close API Key modal"
          >
            <XIcon className="w-6 h-6" />
          </button>
        </div>
        
        <div className="space-y-4 text-slate-300 text-sm">
          <div>
            <label className="block text-sm font-medium mb-1">Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full bg-dark-300 border-dark-300/50 rounded-md p-2 text-slate-200 focus:ring-sky-500"
            >
              <option value="gemini">Google Gemini (Server Key)</option>
              <option value="local">Local LLM (OpenAI Compatible, e.g., LM Studio, Ollama)</option>
            </select>
          </div>

          {provider === 'local' && (
            <div className="space-y-3 mt-4 border-t border-dark-300 pt-4">
               <div>
                  <label className="block text-sm font-medium mb-1">Base URL</label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    className="w-full bg-dark-300 border-dark-300/50 rounded-md p-2 text-slate-200"
                    placeholder="http://localhost:11434/v1"
                  />
                  <p className="text-xs text-slate-500 mt-1">Ollama: http://localhost:11434/v1 | LM Studio: http://localhost:1234/v1</p>
                  <p className="text-xs text-amber-500/80 mt-1">Note: Safari strictly blocks mixed content (HTTPS site calling HTTP localhost). Try using Chrome, or use ngrok if on Mac.</p>
               </div>
               <div className="flex flex-col">
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium">Model Name</label>
                    <button type="button" onClick={fetchModels} disabled={isFetchingModels} className="text-xs text-sky-400 hover:text-sky-300 disabled:opacity-50">
                      {isFetchingModels ? "Fetching..." : "Fetch Models"}
                    </button>
                  </div>
                  {availableModels.length > 0 ? (
                    <select
                      value={modelName}
                      onChange={(e) => setModelName(e.target.value)}
                      className="w-full bg-dark-300 border-dark-300/50 rounded-md p-2 text-slate-200 focus:ring-sky-500 focus:border-sky-500"
                    >
                      {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={modelName}
                      onChange={(e) => setModelName(e.target.value)}
                      className="w-full bg-dark-300 border-dark-300/50 rounded-md p-2 text-slate-200 focus:ring-sky-500 focus:border-sky-500"
                      placeholder="llama3"
                    />
                  )}
                  {modelError && <p className="text-xs text-rose-400 mt-1">{modelError}</p>}
               </div>
            </div>
          )}

          {provider === 'gemini' && (
            <p className="text-xs text-slate-400 mt-2">
              Gemini API Key is managed securely by the environment variables (process.env.API_KEY).
              <br /> <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-sky-400">Get your key from AI Studio</a>
            </p>
          )}

          <div className="pt-4 flex justify-end">
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded font-medium transition-colors"
            >
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ApiKeyWarningBanner: React.FC<{ onInfoClick: () => void }> = ({
  onInfoClick,
}) => (
  <div
    className="bg-red-900/50 border-l-4 border-red-500 text-red-200 p-4 mb-8 rounded-r-lg animate-fade-in"
    role="alert"
  >
    <div className="flex items-center">
      <AlertTriangleIcon className="h-8 w-8 text-red-400 mr-4 flex-shrink-0" />
      <div className="flex-grow">
        <p className="font-bold">Action Required: API Key Not Found</p>
        <p className="text-sm">
          AI features are disabled because the Google Gemini API key is not
          configured. Please set the{" "}
          <code className="bg-red-800/50 text-red-200 px-1.5 py-0.5 rounded">
            API_KEY
          </code>{" "}
          environment variable in your hosting environment.
        </p>
      </div>
      <button
        onClick={onInfoClick}
        className="ml-4 flex-shrink-0 text-sm font-semibold underline hover:text-white whitespace-nowrap"
      >
        How to fix this
      </button>
    </div>
  </div>
);

export default function App() {
  const [mode, setMode] = useState<AppMode>("home");
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isApiKeyMissing, setIsApiKeyMissing] = useState(false);

  useEffect(() => {
    // A simple check for the API key. Note that `process.env` might be replaced
    // by a build tool and this check might not work in all environments,
    // but it's a good first-line defense.
    if (!process.env.API_KEY) {
      setIsApiKeyMissing(true);
    }
  }, []);

  // State for Renamer
  const [results, setResults] = useState<ProcessedFile[]>([]);
  const [renameMethod, setRenameMethod] = useState<RenameMethod>(
    RenameMethod.AI,
  );
  const [customPattern, setCustomPattern] = useState<string>(
    "Invoice No:\\s*([A-Z0-9-]+)",
  );
  const [aiInstructions, setAiInstructions] = useState<string>(
    "From the document text, find the primary identifier such as an invoice number, account number, or reference ID. The filename should be clean and not contain spaces or special characters, use hyphens instead.",
  );
  const [aiSuffix, setAiSuffix] = useState<string>(
    "from 1-July to 20-july-2025",
  );
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = (
    message: string,
    type: "info" | "error" | "success" = "info",
  ) => {
    setLogs((prev) => [
      ...prev,
      { id: Date.now() + Math.random(), message, type },
    ]);
  };

  const handleFilesSelected = (files: File[]) => {
    if (files.length === 0) return;
    const newResults: ProcessedFile[] = files.map((file) => ({
      id: `${file.name}-${file.lastModified}`,
      originalFile: file,
      originalName: file.name,
      newName: "",
      status: FileProcessStatus.Idle,
    }));
    setResults(newResults);
    setLogs([]);
    addLog(`Loaded ${files.length} file(s). Ready for processing.`);
  };

  const clearAll = () => {
    setResults([]);
    setLogs([]);
  };

  const extractTextFromFile = (file: File): Promise<string> => {
    const fileName = file.name.toLowerCase();
    const fileType = file.type;

    if (fileType === "application/pdf" || fileName.endsWith(".pdf")) {
      return extractTextFromPdfWithPageNumbers(file).then((pages) =>
        pages.map((p) => p.text).join("\n"),
      );
    }

    const spreadsheetTypes = [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
    ];
    const spreadsheetExtensions = [".xls", ".xlsx", ".csv"];

    if (
      spreadsheetTypes.includes(fileType) ||
      spreadsheetExtensions.some((ext) => fileName.endsWith(ext))
    ) {
      return extractTextFromExcel(file);
    }

    return Promise.reject(new Error(`Unsupported file type: ${file.name}`));
  };

  const processFiles = useCallback(
    async (previewOnly: boolean) => {
      if (results.length === 0) {
        addLog("No files to process. Please upload files first.", "error");
        return;
      }

      setIsProcessing(true);
      if (previewOnly) {
        addLog(
          `Starting rename PREVIEW (Sequential Processing to avoid rate limits)...`,
        );
      } else {
        addLog(
          `Starting file processing for download (Sequential Processing to avoid rate limits)...`,
        );
      }

      const updatedResults = [...results];

      for (let i = 0; i < updatedResults.length; i++) {
        const result = updatedResults[i];

        addLog(
          `Processing file ${i + 1}/${updatedResults.length}: ${result.originalName}`,
        );
        result.status = FileProcessStatus.Processing;
        // Update state to show the current file is processing
        setResults([...updatedResults]);

        try {
          const text = await extractTextFromFile(result.originalFile);
          if (!text) {
            throw new Error("Could not extract text from file.");
          }

          const newName = await getNewFilename(text, renameMethod, {
            customPattern,
            aiInstructions,
            aiSuffix,
          });

          if (newName) {
            const nameParts = result.originalName.split(".");
            const extension = nameParts.length > 1 ? nameParts.pop() : "";
            result.newName = `${newName}.${extension}`;
            result.status = FileProcessStatus.Success;
            addLog(
              `Found name for ${result.originalName} -> ${result.newName}`,
              "success",
            );
          } else {
            result.status = FileProcessStatus.NoMatch;
            addLog(`No match found for: ${result.originalName}`, "error");
          }
        } catch (error) {
          result.status = FileProcessStatus.Error;
          const errorMessage =
            error instanceof Error
              ? error.message
              : "An unknown error occurred.";
          result.message = errorMessage;
          addLog(
            `Error processing ${result.originalName}: ${errorMessage}`,
            "error",
          );
        }

        // Update state after each file finishes
        setResults([...updatedResults]);

        // Add a delay to avoid hitting API rate limits
        if (i < updatedResults.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // 1-second delay
        }
      }

      addLog("Processing complete.");
      setIsProcessing(false);

      if (!previewOnly) {
        handleDownloadZip();
      }
    },
    [results, renameMethod, customPattern, aiInstructions, aiSuffix],
  );

  const handleDownloadZip = async () => {
    const filesToZip = results.filter(
      (r) => r.status === FileProcessStatus.Success,
    );
    if (filesToZip.length === 0) {
      addLog(
        "No files were successfully renamed to include in a ZIP.",
        "error",
      );
      return;
    }

    addLog(`Creating ZIP archive with ${filesToZip.length} files...`);
    setIsProcessing(true);

    try {
      const zip = new JSZip();

      const nameCounts: { [key: string]: number } = {};

      for (const result of filesToZip) {
        let finalName = result.newName;
        if (nameCounts[finalName] != null) {
          const count = nameCounts[finalName];
          const lastDotIndex = finalName.lastIndexOf(".");

          if (lastDotIndex !== -1) {
            const nameWithoutExt = finalName.substring(0, lastDotIndex);
            const extension = finalName.substring(lastDotIndex); // includes the dot
            finalName = `${nameWithoutExt}_${count}${extension}`;
          } else {
            finalName = `${finalName}_${count}`;
          }
          nameCounts[result.newName]++;
        } else {
          nameCounts[result.newName] = 1;
        }
        zip.file(finalName, result.originalFile);
      }

      const content = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(content);
      link.download = `renamed_files_${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      addLog("ZIP file download initiated.", "success");
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "An unknown ZIP error occurred.";
      addLog(`Failed to create ZIP file: ${errorMessage}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const RenamerComponent: React.FC = () => (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-4 space-y-6">
        <div className="bg-dark-200 p-6 rounded-lg border border-dark-300">
          <h2 className="text-xl font-semibold mb-4 text-slate-200">
            1. Upload Files
          </h2>
          <FileUploader
            onFilesSelected={handleFilesSelected}
            isProcessing={isProcessing}
          />
        </div>
        <div className="bg-dark-200 p-6 rounded-lg border border-dark-300">
          <h2 className="text-xl font-semibold mb-4 text-slate-200">
            2. Configure
          </h2>
          <SettingsPanel
            renameMethod={renameMethod}
            setRenameMethod={setRenameMethod}
            customPattern={customPattern}
            setCustomPattern={setCustomPattern}
            aiInstructions={aiInstructions}
            setAiInstructions={setAiInstructions}
            aiSuffix={aiSuffix}
            setAiSuffix={setAiSuffix}
            isProcessing={isProcessing}
          />
        </div>
        <div className="bg-dark-200 p-6 rounded-lg border border-dark-300">
          <h2 className="text-xl font-semibold mb-4 text-slate-200">
            3. Execute
          </h2>
          <ActionButtons
            onPreview={() => processFiles(true)}
            onDownload={() => processFiles(false)}
            onClear={clearAll}
            isProcessing={isProcessing}
            hasFiles={results.length > 0}
          />
        </div>
      </div>
      <div className="lg:col-span-8">
        <div className="bg-dark-200 p-1 rounded-lg border border-dark-300 min-h-[600px] flex flex-col">
          <div className="flex-grow">
            <ResultsTable results={results} />
          </div>
          <div className="flex-shrink-0 border-t border-dark-300">
            <LogArea logs={logs} />
          </div>
        </div>
      </div>
    </div>
  );

  const renderDashboard = () => {
    const tools = [
      { id: "rename", name: "AI File Renamer", icon: <Tags className="w-8 h-8"/>, desc: "Intelligently rename documents using AI" },
      { id: "entry", name: "Merchant Entry", icon: <Briefcase className="w-8 h-8"/>, desc: "Automate merchant journal entries" },
      { id: "warba_entry", name: "Warba Entry", icon: <Stethoscope className="w-8 h-8"/>, desc: "Warba Polyclinics automation" },
      { id: "keyword_search", name: "PDF Keyword Search", icon: <FileSearch className="w-8 h-8"/>, desc: "Find specifics across multiple PDFs" },
      { id: "search", name: "PDF Q&A", icon: <MessageSquare className="w-8 h-8"/>, desc: "Chat and ask questions to your PDFs" },
      { id: "convert_001_to_49", name: "Convert 001 to 49", icon: <RefreshCw className="w-8 h-8"/>, desc: "Convert 001 formats to 49" },
      { id: "ending_balance", name: "Ending Balance", icon: <Calculator className="w-8 h-8"/>, desc: "Calculate and confirm ending balances" },
      { id: "merge_pdfs", name: "Merge PDFs", icon: <FileStack className="w-8 h-8"/>, desc: "Combine multiple PDFs into one" },
      { id: "pos_entry", name: "POS Entry", icon: <Receipt className="w-8 h-8"/>, desc: "Process POS terminal entries" },
      { id: "pos_report", name: "POS Report", icon: <FileBarChart className="w-8 h-8"/>, desc: "Generate Point of Sale reports" },
      { id: "smart_merge", name: "Smart Merge", icon: <Sparkles className="w-8 h-8"/>, desc: "AI-powered PDF merging and sorting" },
    ];
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-fade-in">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => setMode(tool.id as AppMode)}
            className="flex flex-col text-left items-start p-6 bg-dark-200 border border-dark-300 rounded-xl shadow-lg hover:border-sky-500 hover:shadow-sky-500/20 transition-all group"
          >
            <div className="p-3 bg-dark-300 rounded-lg text-sky-400 group-hover:text-sky-300 group-hover:bg-dark-100 transition-colors">
              {tool.icon}
            </div>
            <h3 className="text-xl font-bold text-slate-200 mt-4 mb-2 group-hover:text-white transition-colors">{tool.name}</h3>
            <p className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors line-clamp-2">{tool.desc}</p>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-dark-100 text-dark-content">
      <main className="container mx-auto p-4 md:p-8">
        <header className="relative flex flex-col items-center justify-center text-center mb-8">
          {mode !== "home" && (
            <button
              onClick={() => setMode("home")}
              className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center px-4 py-2 bg-dark-200 hover:bg-dark-300 border border-dark-300 hover:border-slate-500 text-slate-300 rounded-lg transition-all"
            >
              <Home className="w-5 h-5 mr-2" /> Back
            </button>
          )}
          <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-indigo-500 cursor-pointer" onClick={() => setMode("home")}>
            AI File Tools
          </h1>
          <p className="mt-2 text-lg text-slate-400">
            Intelligently rename files, search PDFs, or automate journal entries.
          </p>
          <div className="mt-4">
            <a
              href="https://aistudio.google.com/app/prompts?state=%7B%22ids%22:%5B%221dIDKEoFxtQ_4P4SIHEJyqRLUhcYEQmOb%22%5D,%22action%22:%22open%22,%22userId%22:%22105136169272824658382%22,%22resourceKeys%22:%7B%7D%7D&usp=sharing"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors text-slate-300 bg-dark-200 border border-dark-300 hover:bg-dark-300"
              title="Open the prompt in Google AI Studio"
            >
              AI Prompt Editor
              <ExternalLinkIcon className="w-4 h-4 ml-2" />
            </a>
          </div>
          <div className="absolute top-0 right-0 h-full flex items-center">
            <button
              onClick={() => setIsApiKeyModalOpen(true)}
              className="p-2 rounded-full text-slate-400 hover:bg-dark-200 hover:text-sky-400 transition-colors border border-transparent hover:border-dark-300"
              title="API Key Settings"
              aria-label="API Key Settings"
            >
              <Cog6ToothIcon className="w-6 h-6" />
            </button>
          </div>
        </header>

        {isApiKeyMissing && (
          <ApiKeyWarningBanner onInfoClick={() => setIsApiKeyModalOpen(true)} />
        )}

        {mode === "home" && renderDashboard()}

        {mode === "entry" && <MerchantEntryAutomation />}
        {mode === "rename" && <RenamerComponent />}
        {mode === "warba_entry" && <WarbaEntryAutomation />}
        {mode === "keyword_search" && <PdfKeywordSearchComponent />}
        {mode === "search" && <PdfQaComponent />}
        {mode === "convert_001_to_49" && <Convert001To49Automation />}
        {mode === "ending_balance" && <EndingBalanceAutomation />}
        {mode === "merge_pdfs" && <MergePdfsAutomation />}
        {mode === "pos_entry" && <POSEntryAutomation />}
        {mode === "pos_report" && <POSReport />}
        {mode === "smart_merge" && <SmartMergeAutomation />}

        <Chatbot currentMode={mode} />

        <footer className="text-center mt-12 text-slate-500">
          <p>Powered by React, Tailwind CSS, and Google Gemini</p>
        </footer>
      </main>
      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
      />
    </div>
  );
}
