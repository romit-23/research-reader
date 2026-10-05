import * as pdfjsLib from 'pdfjs-dist';

// Configure worker using cdnjs matching pdfjs version for rock-solid bundling compatibility
const PDFJS_VERSION = pdfjsLib.version || '3.11.174';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;

export { pdfjsLib };
