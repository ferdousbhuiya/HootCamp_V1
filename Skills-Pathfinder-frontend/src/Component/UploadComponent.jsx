import { useRef, useState } from 'react';

const UploadComponent = ({ onUploadSuccess, onUploadError, isLoading, setIsLoading }) => {
  const fileInputRef = useRef(null);
  const [error, setError] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState('');

  const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
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
    if (!mimeOk && !extOk) {
      return 'Invalid file type. Supported: PDF, DOCX, PNG, JPG, JPEG, TXT';
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File is too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`;
    }
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
    setUploadProgress('Uploading document...');
    
    const formData = new FormData();
    formData.append('file', file);

    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) {
        throw new Error('API URL not configured (VITE_API_URL is missing).');
      }

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
        } catch { /* use default */ }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      setUploadProgress('Processing complete!');
      onUploadSuccess(data);
      setSelectedFile(null);
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Upload timed out. The file might be too large or the server is busy. Please try again.');
        onUploadError({ message: 'Upload timed out' });
      } else if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
        setError('Cannot reach server. Make sure the backend is running at ' + (import.meta.env.VITE_API_URL || 'http://localhost:8000'));
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
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleClearSelection = (e) => {
    e.stopPropagation();
    setSelectedFile(null);
    setError(null);
    setUploadProgress('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
      <div 
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
          isLoading ? 'border-gray-300 bg-gray-50 cursor-not-allowed' : 'border-indigo-300 hover:border-indigo-500 cursor-pointer bg-indigo-50/30'
        }`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => !isLoading && fileInputRef.current.click()}
      >
        <input 
          type="file" 
          ref={fileInputRef}
          className="hidden" 
          onChange={handleFileSelect}
          accept=".pdf,.docx,.png,.jpg,.jpeg,.txt"
          disabled={isLoading}
        />
        
        <div className="text-indigo-500 mb-4">
          {isLoading ? (
            <svg className="animate-spin h-12 w-12 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          )}
        </div>
        
        <h2 className="text-xl font-semibold text-gray-800 mb-2">
          {isLoading 
            ? `Processing ${selectedFile?.name || 'document'}...` 
            : 'Upload Your Document'}
        </h2>
        
        <p className="text-gray-500 mb-4">
          {isLoading 
            ? uploadProgress || 'Analyzing text and extracting skills via AI. This may take a few seconds...'
            : 'Drag & drop or click to upload'}
        </p>
        
        <div className="bg-indigo-50 text-indigo-700 text-sm p-3 rounded-lg inline-block">
          <strong>Supported formats:</strong> PDF, DOCX, PNG, JPG, JPEG, TXT (Max 15MB)
        </div>
      </div>
      
      {/* File Preview Section */}
      {selectedFile && !isLoading && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-100 p-2 rounded-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-800 truncate max-w-xs">{selectedFile.name}</p>
              <p className="text-xs text-gray-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          </div>
          <button 
            onClick={handleClearSelection}
            className="text-red-500 hover:text-red-700 p-1 transition-colors"
            title="Remove file"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}
      
      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}
    </div>
  );
};

export default UploadComponent;