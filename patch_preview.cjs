const fs = require('fs');
const file = 'components/SmartMergeAutomation.tsx';
let code = fs.readFileSync(file, 'utf8');

const oldPreview = `const PreviewPdf = ({ blob }: { blob: Blob }) => {
  const [url, setUrl] = useState<string>('');
  
  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  if (!url) return null;

  return (
    <div className="flex flex-col gap-2 mt-2 w-full h-[500px]">
      <object data={url} type="application/pdf" className="w-full h-full rounded-lg overflow-hidden border border-dark-400">
        <embed src={url} type="application/pdf" className="w-full h-full rounded-lg" />
        <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
          <p>Your browser doesn't support direct PDF preview.</p>
          <a href={url} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-sky-500/20 text-sky-400 rounded hover:bg-sky-500/30 transition-colors">
            Open PDF
          </a>
        </div>
      </object>
    </div>
  );
};`;

const newPreview = `const PreviewPdf = ({ blob }: { blob: Blob }) => {
  const [url, setUrl] = useState<string>('');
  
  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  if (!url) return null;

  return (
    <div className="flex flex-col gap-2 mt-2 w-full h-[500px]">
      <iframe src={url} className="w-full h-full rounded-lg overflow-hidden border border-dark-400" title="PDF Preview" />
    </div>
  );
};`;

if (code.includes(oldPreview)) {
  code = code.replace(oldPreview, newPreview);
  fs.writeFileSync(file, code);
  console.log("Patched preview successfully!");
} else {
  console.log("Could not find old preview.");
}
