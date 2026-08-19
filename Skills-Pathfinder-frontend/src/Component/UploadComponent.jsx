import { useRef, useState } from 'react';

const UploadComponent = ({ onUploadSuccess, onUploadError, isLoading, setIsLoading }) => {
  const fileInputRef = useRef(null);
  const [error, setError] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState('');

  const MAX_FILE_SIZE = 15 * 1024 * 1024;
  const validTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'text/plain'
  ];
  const validExtensions = ['.pdf', '.docx', '.png', '.jpg', '.jpeg', '.txt'];

  const validateFile = (file) => {
    const ext = '.' + (file.name?.split('.').pop() || '').toLowerCase();
    const mimeOk = validTypes.includes(file.type);
    const extOk = validExtensions.includes(ext);
    if (!mimeOk && !extOk) return 'Invalid file type. Supported: PDF, DOCX, PNG, JPG, JPEG, TXT';
    if (file.size > MAX_FILE_SIZE) return `File is too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`;
    return null;
  };

  const handleFileSelect = async (e) => {
    const file = e.target?.files ? e.target.files[0] : e;
    if (!file) return;

    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      onUploadError({ message: validationError });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setError(null);
    setSelectedFile(file);
    setIsLoading(true);
    setUploadProgress('Uploading and analyzing document...');

    const formData = new FormData();
    formData.append('file', file);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const response = await fetch(`${apiUrl}/api/upload`, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      if (!response.ok) {
        let errorMsg = `Server error: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.detail || errorMsg;
        } catch {}
        throw new Error(errorMsg);
      }

      const data = await response.json();
      setUploadProgress('Processing complete. Saving findings...');
      await onUploadSuccess(data, file);
      setUploadProgress('Saved successfully.');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Upload timed out. The server may be busy. Please try again.');
        onUploadError({ message: 'Upload timed out' });
      } else if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
        setError('Cannot reach the Skills Pathfinder API. Please try again shortly.');
        onUploadError({ message: 'Backend unreachable' });
      } else {
        const errMsg = err.message || 'An unexpected error occurred during upload.';
        setError(errMsg);
        onUploadError({ message: errMsg });
      }
    } finally {
      setIsLoading(false);
      clearTimeout(timeoutId);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isLoading) return;
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleClearSelection = (e) => {
    e.stopPropagation();
    setSelectedFile(null);
    setError(null);
    setUploadProgress('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div
        className={`rounded-2xl border-2 border-dashed p-8 text-center transition-all ${isLoading ? 'cursor-not-allowed border-slate-200 bg-slate-50' : 'cursor-pointer border-indigo-200 bg-indigo-50/40 hover:border-indigo-400 hover:bg-indigo-50'}`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => !isLoading && fileInputRef.current?.click()}
      >
        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} accept=".pdf,.docx,.png,.jpg,.jpeg,.txt" disabled={isLoading} />

        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white text-indigo-600 shadow-sm">
          {isLoading ? <span className="h-7 w-7 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" /> : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0-3 3m3-3v12" /></svg>
          )}
        </div>

        <h2 className="text-xl font-bold text-slate-900">{isLoading ? `Processing ${selectedFile?.name || 'document'}...` : 'Upload your resume'}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">{isLoading ? uploadProgress || 'Extracting text, skills, and career matches...' : 'Drag and drop a file here, or click to browse.'}</p>
        <div className="mt-4 inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 shadow-sm">PDF, DOCX, PNG, JPG, JPEG, TXT • Max 15MB</div>
      </div>

      {selectedFile && !isLoading && <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="min-w-0"><p className="truncate font-medium text-slate-800">{selectedFile.name}</p><p className="text-xs text-slate-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p></div><button onClick={handleClearSelection} className="rounded-lg px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50">Remove</button></div>}

      {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
    </div>
  );
};

export default UploadComponent;
