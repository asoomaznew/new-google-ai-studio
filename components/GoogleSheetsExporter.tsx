import React, { useState, useEffect, useCallback } from "react";
import {
  googleSignIn,
  initAuth,
  logout,
  listSpreadsheets,
  createSpreadsheet,
  appendSpreadsheetData,
  type SpreadsheetInfo,
} from "../services/googleSheetsService";
import {
  FileSpreadsheet,
  Plus,
  ArrowRight,
  LogOut,
  Loader2,
  CheckCircle,
  ExternalLink,
  ChevronDown,
} from "lucide-react";

interface GoogleSheetsExporterProps {
  /**
   * The list of row values to be appended (excluding headers)
   */
  rows: any[][];
  /**
   * Column headers
   */
  headers: string[];
  /**
   * Default title when creating a new sheet
   */
  defaultTitle?: string;
  /**
   * Optional callback on successful export
   */
  onSuccess?: (spreadsheetUrl: string) => void;
}

export const GoogleSheetsExporter: React.FC<GoogleSheetsExporterProps> = ({
  rows,
  headers,
  defaultTitle = "Journal_Entries_Export",
  onSuccess,
}) => {
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  // Sheet configuration state
  const [mode, setMode] = useState<"create" | "existing">("create");
  const [sheetTitle, setSheetTitle] = useState(defaultTitle);
  const [spreadsheets, setSpreadsheets] = useState<SpreadsheetInfo[]>([]);
  const [selectedSheetId, setSelectedSheetId] = useState<string>("");
  const [isLoadingSheets, setIsLoadingSheets] = useState(false);

  // Progress/Status state
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [createdUrl, setCreatedUrl] = useState("");

  // Initialize Auth state
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, currentToken) => {
        setUser(currentUser);
        setToken(currentToken);
        setIsInitializing(false);
      },
      () => {
        setUser(null);
        setToken(null);
        setIsInitializing(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Fetch spreadsheets when authenticated
  const fetchSpreadsheets = useCallback(async (authToken: string) => {
    setIsLoadingSheets(true);
    try {
      const list = await listSpreadsheets(authToken);
      setSpreadsheets(list);
      if (list.length > 0) {
        setSelectedSheetId(list[0].id);
      }
    } catch (err: any) {
      console.error("Failed to load spreadsheets:", err);
    } finally {
      setIsLoadingSheets(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      fetchSpreadsheets(token);
    }
  }, [token, fetchSpreadsheets]);

  // Handle Login
  const handleLogin = async () => {
    setIsLoggingIn(true);
    setStatus("idle");
    setStatusMessage("");
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
      }
    } catch (err: any) {
      console.error("Login failed:", err);
      setStatus("error");
      setStatusMessage("Sign-in failed. Please try again.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    await logout();
    setUser(null);
    setToken(null);
    setStatus("idle");
    setStatusMessage("");
  };

  // Handle Export
  const handleExport = async () => {
    if (!token) {
      setStatus("error");
      setStatusMessage("You must sign in with Google first.");
      return;
    }

    if (rows.length === 0) {
      setStatus("error");
      setStatusMessage("No rows selected to export.");
      return;
    }

    setStatus("loading");
    setStatusMessage("Exporting your data...");

    try {
      let sheetId = selectedSheetId;
      let sheetUrl = "";

      if (mode === "create") {
        setStatusMessage("Creating new spreadsheet...");
        const title = sheetTitle.trim() || defaultTitle;
        const result = await createSpreadsheet(token, title, headers);
        sheetId = result.spreadsheetId;
        sheetUrl = result.spreadsheetUrl;
        setStatusMessage("Writing rows...");
      } else {
        setStatusMessage("Connecting to existing spreadsheet...");
        sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
      }

      // Sheets API append expects and can append multiple rows
      // We append starting from Sheet1!A1
      await appendSpreadsheetData(token, sheetId, "Sheet1!A1", rows);

      setStatus("success");
      setStatusMessage(`Successfully exported ${rows.length} rows of data!`);
      setCreatedUrl(sheetUrl);

      if (onSuccess) {
        onSuccess(sheetUrl);
      }

      // Refresh sheets list to include the newly created sheet if applicable
      if (mode === "create") {
        fetchSpreadsheets(token);
      }
    } catch (err: any) {
      console.error("Export error:", err);
      setStatus("error");
      setStatusMessage(err.message || "Export failed. Please try again.");
    }
  };

  if (isInitializing) {
    return (
      <div className="flex items-center justify-center p-4 bg-dark-300 rounded-lg border border-dark-300">
        <Loader2 className="w-5 h-5 text-sky-400 animate-spin mr-2" />
        <span className="text-sm text-slate-400">Loading Google Sheets integration...</span>
      </div>
    );
  }

  // --- Render Login view if not signed in ---
  if (!user || !token) {
    return (
      <div className="bg-dark-200 border border-dark-300 rounded-xl p-6 text-center shadow-lg animate-fade-in">
        <div className="mx-auto flex items-center justify-center w-12 h-12 rounded-lg bg-green-500/10 text-green-400 mb-4 border border-green-500/20">
          <FileSpreadsheet className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-semibold text-slate-200 mb-2">Google Sheets Integration</h3>
        <p className="text-sm text-slate-400 max-w-sm mx-auto mb-5">
          Connect your Google Drive and Google Sheets to export and append your processed journal entries directly.
        </p>

        <button
          onClick={handleLogin}
          disabled={isLoggingIn}
          className="mx-auto flex items-center justify-center px-4 py-2 bg-white text-slate-800 font-medium rounded-lg border border-slate-300 shadow-sm hover:bg-slate-50 transition-all focus:outline-none focus:ring-2 focus:ring-sky-500"
          id="btn-google-sheets-signin"
        >
          {isLoggingIn ? (
            <Loader2 className="w-5 h-5 animate-spin mr-2 text-slate-600" />
          ) : (
            <svg
              className="w-5 h-5 mr-3"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.77c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                fill="#EA4335"
              />
            </svg>
          )}
          {isLoggingIn ? "Connecting..." : "Sign in with Google"}
        </button>
      </div>
    );
  }

  // --- Render authenticated exporter view ---
  return (
    <div className="bg-dark-200 border border-dark-300 rounded-xl p-6 shadow-lg animate-fade-in space-y-4">
      {/* User info Header */}
      <div className="flex items-center justify-between border-b border-dark-300 pb-3">
        <div className="flex items-center space-x-3">
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName || "User Avatar"}
              className="w-8 h-8 rounded-full border border-dark-300"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-sky-500/10 text-sky-400 flex items-center justify-center font-bold text-xs">
              {user.displayName?.charAt(0) || "U"}
            </div>
          )}
          <div>
            <p className="text-xs text-slate-400">Connected Google Account</p>
            <p className="text-sm font-semibold text-slate-200 truncate max-w-[200px]">
              {user.displayName || user.email}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-dark-300 transition-colors"
          title="Sign out of Google"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* Selector Options */}
      <div className="space-y-3">
        <div className="flex bg-dark-300 p-1 rounded-lg border border-dark-300/50">
          <button
            onClick={() => {
              setMode("create");
              setStatus("idle");
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
              mode === "create"
                ? "bg-sky-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Create New Sheet
          </button>
          <button
            onClick={() => {
              setMode("existing");
              setStatus("idle");
              if (spreadsheets.length === 0) {
                fetchSpreadsheets(token);
              }
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
              mode === "existing"
                ? "bg-sky-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Append to Existing
          </button>
        </div>

        {/* Create Mode Inputs */}
        {mode === "create" && (
          <div className="space-y-2 animate-fade-in">
            <label className="block text-xs font-medium text-slate-400">
              New Spreadsheet Title
            </label>
            <div className="relative">
              <input
                type="text"
                value={sheetTitle}
                onChange={(e) => setSheetTitle(e.target.value)}
                className="w-full bg-dark-300 border border-dark-300/50 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                placeholder="Journal_Entries_Export"
              />
            </div>
          </div>
        )}

        {/* Existing Mode Selector */}
        {mode === "existing" && (
          <div className="space-y-2 animate-fade-in">
            <label className="block text-xs font-medium text-slate-400">
              Select Destination Spreadsheet
            </label>
            {isLoadingSheets ? (
              <div className="flex items-center space-x-2 text-xs text-slate-400 p-2 bg-dark-300 rounded-lg border border-dark-300/50">
                <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                <span>Loading your spreadsheets...</span>
              </div>
            ) : spreadsheets.length === 0 ? (
              <div className="text-xs text-amber-400 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                No recent spreadsheets found in Google Drive. Try creating a new one instead.
              </div>
            ) : (
              <div className="relative">
                <select
                  value={selectedSheetId}
                  onChange={(e) => setSelectedSheetId(e.target.value)}
                  className="w-full bg-dark-300 border border-dark-300/50 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 appearance-none pr-10"
                >
                  {spreadsheets.map((sheet) => (
                    <option key={sheet.id} value={sheet.id}>
                      {sheet.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons & Status feedback */}
      <div className="space-y-3 pt-2">
        <button
          onClick={handleExport}
          disabled={status === "loading" || rows.length === 0}
          className="w-full flex items-center justify-center py-2.5 px-4 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-lg shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {status === "loading" ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <FileSpreadsheet className="w-4 h-4 mr-2" />
          )}
          {status === "loading" ? "Exporting to Sheets..." : `Export ${rows.length} Rows to Google Sheets`}
        </button>

        {/* Status Feedbacks */}
        {status === "loading" && (
          <p className="text-xs text-slate-400 text-center animate-pulse">
            {statusMessage}
          </p>
        )}

        {status === "error" && (
          <div className="p-3 bg-red-950/40 border border-red-500/30 text-red-200 rounded-lg text-xs">
            {statusMessage}
          </div>
        )}

        {status === "success" && (
          <div className="p-4 bg-green-950/40 border border-green-500/30 text-green-200 rounded-lg space-y-2 animate-fade-in text-xs">
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
              <span className="font-semibold">{statusMessage}</span>
            </div>
            {createdUrl && (
              <a
                href={createdUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center text-sky-400 hover:text-sky-300 font-semibold underline"
              >
                Open Google Sheet <ExternalLink className="w-3 h-3 ml-1" />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default GoogleSheetsExporter;
