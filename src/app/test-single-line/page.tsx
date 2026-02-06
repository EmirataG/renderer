'use client';

import SingleLineRenderer from '../../renderers/SingleLineRenderer';
import { useState, useEffect } from 'react';

export default function TestSingleLinePage() {
  const [xml, setXml] = useState<string>('');

  // Load a sample MusicXML on mount (or allow file upload)
  useEffect(() => {
    // Try to load a sample file if available, otherwise show upload
    fetch('/sample.xml')
      .then(r => r.ok ? r.text() : '')
      .then(setXml)
      .catch(() => setXml(''));
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      file.text().then(setXml);
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">SingleLineRenderer Test</h1>

      <div className="mb-4">
        <input
          type="file"
          accept=".xml,.musicxml,.mxl"
          onChange={handleFileUpload}
          className="border p-2"
        />
      </div>

      {xml ? (
        <div className="border rounded">
          <SingleLineRenderer
            xml={xml}
            scoreColor="#000000"
            scoreScale={1}
            activeNoteheadScale={1.3}
            activeNoteheadColor="#ff0000"
          />
        </div>
      ) : (
        <p>Upload a MusicXML file to test</p>
      )}
    </div>
  );
}
