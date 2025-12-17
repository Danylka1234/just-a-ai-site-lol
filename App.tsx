
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useRef, useEffect } from 'react';
import { generateImage, generateVoxelScene, IMAGE_SYSTEM_PROMPT, VOXEL_PROMPT } from './services/gemini';
import { extractHtmlFromText, hideBodyText, zoomCamera, injectGameMode } from './utils/html';
import { sounds } from './utils/sounds';

type AppStatus = 'idle' | 'generating_image' | 'generating_voxels' | 'error';

const ASPECT_RATIOS = ["1:1", "3:4", "4:3", "16:9", "9:16"];

const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif'
];

const SAMPLE_PROMPTS = [
    "A floating crystal castle in a nebula",
    "A retro cyberpunk arcade cabinet", 
    "A cozy hobbit hole with round door",
    "A miniature volcano island with smoke",
    "A sleek futuristic racing drone",
    "A giant robot holding a tiny flower"
];

interface Example {
  img: string;
  html: string;
}

const EXAMPLES: Example[] = [
  { img: 'https://www.gstatic.com/aistudio/starter-apps/image_to_voxel/example1.png', html: '/examples/example1.html' },
  { img: 'https://www.gstatic.com/aistudio/starter-apps/image_to_voxel/example2.png', html: '/examples/example2.html' },
  { img: 'https://www.gstatic.com/aistudio/starter-apps/image_to_voxel/example3.png', html: '/examples/example3.html' },
];

const App: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  
  const [imageData, setImageData] = useState<string | null>(null);
  const [voxelCode, setVoxelCode] = useState<string | null>(null);
  
  const [userContent, setUserContent] = useState<{
      image: string;
      voxel: string | null;
      prompt: string;
  } | null>(null);

  const [selectedTile, setSelectedTile] = useState<number | 'user' | null>(null);
  const [showGenerator, setShowGenerator] = useState(false);

  const [status, setStatus] = useState<AppStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [useOptimization, setUseOptimization] = useState(true);
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [viewMode, setViewMode] = useState<'image' | 'voxel'>('image');
  const [isMuted, setIsMuted] = useState(false);
  
  const [thinkingText, setThinkingText] = useState<string | null>(null);
  const [streamingCode, setStreamingCode] = useState<string>('');
  
  const [loadedThumbnails, setLoadedThumbnails] = useState<Record<string, string>>({});

  const [isDragging, setIsDragging] = useState(false);
  const [isViewerVisible, setIsViewerVisible] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
        setPlaceholderIndex((prev) => (prev + 1) % SAMPLE_PROMPTS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    sounds.setMute(isMuted);
  }, [isMuted]);

  useEffect(() => {
    if (status === 'generating_voxels' || status === 'generating_image') {
      sounds.startProcessing();
    } else {
      sounds.stopProcessing();
    }
  }, [status]);

  useEffect(() => {
    if (terminalEndRef.current) {
        terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [streamingCode]);

  useEffect(() => {
    const createdUrls: string[] = [];
    const loadThumbnails = async () => {
      const loaded: Record<string, string> = {};
      await Promise.all(EXAMPLES.map(async (ex) => {
        try {
          const response = await fetch(ex.img);
          if (response.ok) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            createdUrls.push(url);
            loaded[ex.img] = url;
          }
        } catch (e) {
          console.error("Failed to load thumbnail:", ex.img, e);
        }
      }));
      setLoadedThumbnails(loaded);
    };
    loadThumbnails();
    return () => {
        createdUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const handleError = (err: any) => {
    sounds.playError();
    setStatus('error');
    setErrorMsg(err.message || 'An unexpected error occurred.');
    console.error(err);
  };

  const handleImageGenerate = async () => {
    if (!prompt.trim()) return;
    sounds.playClick();
    setStatus('generating_image');
    setErrorMsg('');
    setImageData(null);
    setVoxelCode(null);
    setThinkingText(null);
    setStreamingCode('');
    setViewMode('image');
    setIsViewerVisible(true);

    try {
      const imageUrl = await generateImage(prompt, aspectRatio, useOptimization);
      const newUserContent = {
          image: imageUrl,
          voxel: null,
          prompt: prompt
      };
      setUserContent(newUserContent);
      setImageData(imageUrl);
      setVoxelCode(null);
      setSelectedTile('user');
      setStatus('idle');
      setShowGenerator(false);
      sounds.playSuccess();
    } catch (err) {
      handleError(err);
    }
  };

  const processFile = (file: File) => {
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      handleError(new Error("Invalid file type. Please upload PNG, JPEG, WEBP, HEIC, or HEIF."));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      const newUserContent = {
          image: result,
          voxel: null,
          prompt: ''
      };
      setUserContent(newUserContent);
      setImageData(result);
      setVoxelCode(null);
      setViewMode('image');
      setStatus('idle');
      setErrorMsg('');
      setSelectedTile('user');
      setShowGenerator(false);
      setIsViewerVisible(true);
      sounds.playSuccess();
    };
    reader.onerror = () => handleError(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
        processFile(file);
    }
  };

  const handleExampleClick = async (example: Example, index: number) => {
    if (status !== 'idle' && status !== 'error') return;
    sounds.playClick();
    setSelectedTile(index);
    setShowGenerator(false);
    setErrorMsg('');
    setThinkingText(null);
    setStreamingCode('');
    setIsViewerVisible(true);
    
    try {
      const imgResponse = await fetch(example.img);
      if (!imgResponse.ok) throw new Error(`Failed to load example image: ${imgResponse.statusText}`);
      const imgBlob = await imgResponse.blob();
      
      const base64Img = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(imgBlob);
      });

      let htmlText = '';
      try {
        const htmlResponse = await fetch(example.html);
        if (htmlResponse.ok) {
            const rawText = await htmlResponse.text();
            htmlText = zoomCamera(hideBodyText(extractHtmlFromText(rawText)));
        } else {
            htmlText = `<html><body><p>${example.html} not found.</p></body></html>`;
        }
      } catch (e) {
          htmlText = "<html><body>Error loading example scene.</body></html>";
      }

      setImageData(base64Img);
      setVoxelCode(injectGameMode(htmlText));
      setViewMode('voxel');
      setStatus('idle');
      sounds.playSuccess();
    } catch (err) {
      handleError(err);
    }
  };

  const handleUserTileClick = () => {
      if (status !== 'idle' && status !== 'error') return;
      sounds.playClick();

      if (selectedTile === 'user') {
          const willShow = !showGenerator;
          setShowGenerator(willShow);
          if (willShow) {
            setIsViewerVisible(false);
          } else {
            setIsViewerVisible(true);
            if (!userContent) setSelectedTile(null);
          }
      } else {
          setSelectedTile('user');
          setShowGenerator(true); 
          setIsViewerVisible(false);

          if (userContent) {
              setImageData(userContent.image);
              setVoxelCode(userContent.voxel);
              setPrompt(userContent.prompt);
              setViewMode(userContent.voxel ? 'voxel' : 'image');
          } else {
              setImageData(null);
              setVoxelCode(null);
              setViewMode('image');
          }
      }
  };

  const handleVoxelize = async () => {
    if (!imageData) return;
    sounds.playClick();
    setStatus('generating_voxels');
    setErrorMsg('');
    setThinkingText(null);
    setStreamingCode('');
    setIsViewerVisible(true);
    
    let thoughtBuffer = "";

    try {
      const codeRaw = await generateVoxelScene(
        imageData, 
        (thoughtFragment) => {
            thoughtBuffer += thoughtFragment;
            const matches = thoughtBuffer.match(/\*\*([^*]+)\*\*/g);
            if (matches && matches.length > 0) {
                const lastMatch = matches[matches.length - 1];
                const header = lastMatch.replace(/\*\*/g, '').trim();
                setThinkingText(prev => prev === header ? prev : header);
            }
        },
        (codeChunk) => {
            setStreamingCode(prev => prev + codeChunk);
        }
      );
      
      const code = injectGameMode(zoomCamera(hideBodyText(codeRaw)));
      setVoxelCode(code);
      if (selectedTile === 'user') {
          setUserContent(prev => prev ? ({...prev, voxel: code}) : null);
      }
      setViewMode('voxel');
      setStatus('idle');
      setThinkingText(null);
      setStreamingCode('');
      sounds.playSuccess();
    } catch (err) {
      handleError(err);
    }
  };

  const handleDownload = () => {
    sounds.playClick();
    if (viewMode === 'image' && imageData) {
      const a = document.createElement('a');
      a.href = imageData;
      const ext = imageData.includes('image/jpeg') ? 'jpg' : 'png';
      a.download = `voxel-image-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else if (viewMode === 'voxel' && voxelCode) {
      const a = document.createElement('a');
      a.href = `data:text/html;charset=utf-8,${encodeURIComponent(voxelCode)}`;
      a.download = `voxel-scene-${Date.now()}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleExportGLB = () => {
    if (!voxelCode || !iframeRef.current) return;
    sounds.playClick();
    // Send message to the injected script in the iframe to trigger GLTF export
    iframeRef.current.contentWindow?.postMessage('EXPORT_GLB', '*');
  };

  const handlePlay = () => {
    if (!voxelCode) return;
    sounds.playClick();
    // Voxel code is already enhanced by injectGameMode
    const blob = new Blob([voxelCode], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const isLoading = status !== 'idle' && status !== 'error';

  const getDisplayPrompt = () => {
    if (status === 'generating_image') {
      return useOptimization ? `${IMAGE_SYSTEM_PROMPT}\n\nSubject: ${prompt}` : prompt;
    }
    if (status === 'generating_voxels') {
      return VOXEL_PROMPT;
    }
    return '';
  };

  return (
    <div className="min-h-screen flex flex-col items-center py-8 px-4 sm:py-16">
      <style>
        {`
          .loading-dots::after {
            content: '';
            animation: dots 2s steps(4, end) infinite;
          }
          @keyframes dots {
            0%, 20% { content: ''; }
            40% { content: '.'; }
            60% { content: '..'; }
            80% { content: '...'; }
          }
          .terminal-glow {
            text-shadow: 0 0 10px rgba(34, 197, 94, 0.8);
          }
          .cursor::after {
            content: '▊';
            animation: blink 0.8s step-end infinite;
            color: #22c55e;
          }
          @keyframes blink {
            from, to { opacity: 1; }
            50% { opacity: 0; }
          }
          .scanline {
            width: 100%;
            height: 4px;
            z-index: 30;
            background: rgba(0, 255, 0, 0.03);
            position: absolute;
            top: 0;
            left: 0;
            animation: scanline_move 8s linear infinite;
            pointer-events: none;
          }
          @keyframes scanline_move {
            0% { top: 0; }
            100% { top: 100%; }
          }
          .custom-scrollbar::-webkit-scrollbar { width: 6px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: #111; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #444; }
        `}
      </style>

      <div className="w-full max-w-4xl space-y-10">
        
        {/* Header Section */}
        <div className="relative flex flex-col items-center text-center space-y-4">
          <div className="absolute right-0 top-0 z-50">
            <button 
              onClick={() => { sounds.playClick(); setIsMuted(!isMuted); }}
              className="p-3 bg-white border-2 border-black rounded-full brutal-shadow-sm hover:translate-y-[2px] active:translate-y-[4px] active:shadow-none transition-all"
              aria-label={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? (
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                   <path strokeLinecap="square" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6.75h3a.75.75 0 0 1 .75.75v6.75a.75.75 0 0 1-.75.75h-3a.75.75 0 0 1-.75-.75V8.25a.75.75 0 0 1 .75-.75Z" />
                 </svg>
              ) : (
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                   <path strokeLinecap="square" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                 </svg>
              )}
            </button>
          </div>
          
          <div className="relative">
             <div className="absolute -inset-1 bg-indigo-500 rounded-lg blur opacity-20 animate-pulse"></div>
             <h1 className="relative text-6xl sm:text-7xl font-black tracking-tighter leading-none bg-white border-4 border-black px-6 py-2 brutal-shadow transform -rotate-1">
                VOXELIZE
             </h1>
          </div>
          
          <p className="text-xl font-bold uppercase tracking-widest text-gray-500 pt-2">
            AI-Powered 3D Scene Reconstruction
          </p>
        </div>

        {/* Navigation & Selection Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 px-2">
            {EXAMPLES.map((ex, idx) => (
                <button
                    key={idx}
                    type="button"
                    onClick={() => handleExampleClick(ex, idx)}
                    disabled={isLoading}
                    className={`aspect-square relative overflow-hidden group border-2 border-black transition-all duration-300 transform
                        ${selectedTile === idx 
                            ? 'scale-105 shadow-[8px_8px_0px_0px_rgba(99,102,241,1)] -translate-y-1 z-20' 
                            : 'hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] bg-gray-200'}
                        ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                >
                     {loadedThumbnails[ex.img] ? (
                        <img 
                            src={loadedThumbnails[ex.img]} 
                            alt={`Example ${idx + 1}`} 
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        />
                     ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-100 animate-pulse">
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Loading</span>
                        </div>
                     )}
                     <div className={`absolute inset-0 bg-indigo-600 transition-opacity duration-300 ${selectedTile === idx ? 'opacity-0' : 'opacity-20 group-hover:opacity-0'}`}></div>
                     <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black text-white text-[10px] font-black uppercase">Example {idx + 1}</div>
                </button>
            ))}
            
             <button
                type="button"
                onClick={handleUserTileClick}
                disabled={isLoading}
                className={`aspect-square flex flex-col items-center justify-center transition-all duration-300 border-2 border-black relative overflow-hidden group
                    ${selectedTile === 'user' 
                        ? 'scale-105 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] -translate-y-1 z-20 bg-black text-white' 
                        : 'hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] bg-white text-black'}
                `}
             >
                 {userContent ? (
                     <>
                        <img src={userContent.image} alt="User Gen" className="w-full h-full object-cover group-hover:opacity-50 transition-opacity" />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="bg-black text-white px-3 py-1 text-xs font-black uppercase brutal-shadow-sm">Edit Scene</span>
                        </div>
                     </>
                 ) : (
                    <>
                        <div className="w-12 h-12 mb-3 border-2 border-current flex items-center justify-center transition-transform group-hover:rotate-90">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="square" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                        </div>
                        <span className="text-xs font-black uppercase tracking-widest">{showGenerator ? 'Cancel' : 'Create'}</span>
                    </>
                 )}
             </button>
        </div>

        {/* Generator Module */}
        {showGenerator && (
            <div className="glass-card animate-in zoom-in-95 duration-300 border-4 border-black p-8 brutal-shadow relative z-30">
                <div className="grid md:grid-cols-2 gap-8">
                    {/* Left: Upload */}
                    <div className="space-y-4">
                        <label className="text-xs font-black uppercase tracking-widest text-indigo-600 block">01. Source Material</label>
                        <div 
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => { sounds.playClick(); fileInputRef.current?.click(); }}
                            className={`
                                h-52 border-2 border-dashed border-black flex flex-col items-center justify-center cursor-pointer transition-all bg-white
                                ${isDragging ? 'bg-indigo-50 scale-[0.98]' : 'hover:bg-gray-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]'}
                            `}
                        >
                            <input type="file" accept={ALLOWED_MIME_TYPES.join(',')} ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8 mb-2 text-gray-400">
                                <path strokeLinecap="square" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                            </svg>
                            <p className="font-black uppercase text-[10px] tracking-widest text-gray-500">Drop Image or Click</p>
                        </div>
                    </div>

                    {/* Right: AI Prompt */}
                    <div className="space-y-4 flex flex-col">
                        <label className="text-xs font-black uppercase tracking-widest text-indigo-600 block">02. AI Manifestation</label>
                        <div className="flex-grow space-y-4">
                            <div className="space-y-1">
                                <input
                                    type="text"
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    placeholder={SAMPLE_PROMPTS[placeholderIndex]}
                                    className="w-full px-4 py-3 border-2 border-black focus:outline-none bg-white brutal-shadow-sm font-bold placeholder-gray-300"
                                    disabled={isLoading}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black uppercase text-gray-400 mb-1 block">Aspect Ratio</label>
                                    <select
                                        value={aspectRatio}
                                        onChange={(e) => { sounds.playClick(); setAspectRatio(e.target.value); }}
                                        className="w-full px-3 py-2 border-2 border-black font-black uppercase text-xs focus:outline-none bg-white cursor-pointer"
                                    >
                                        {ASPECT_RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </div>
                                <div className="flex items-end">
                                    <button
                                        onClick={() => { sounds.playClick(); setUseOptimization(!useOptimization); }}
                                        className={`w-full py-2 px-2 border-2 border-black text-[10px] font-black uppercase transition-all
                                            ${useOptimization ? 'bg-indigo-600 text-white brutal-shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}
                                        `}
                                    >
                                        Optimize: {useOptimization ? 'ON' : 'OFF'}
                                    </button>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={handleImageGenerate}
                            disabled={isLoading || !prompt.trim()}
                            className="w-full py-4 bg-black text-white font-black uppercase tracking-widest text-sm border-2 border-black brutal-shadow-hover brutal-shadow-active disabled:opacity-50 transition-all"
                        >
                            {status === 'generating_image' ? 'Processing...' : 'Generate Art'}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Status Messaging */}
        {errorMsg && (
          <div className="p-4 bg-red-50 border-4 border-black text-red-600 brutal-shadow animate-in slide-in-from-bottom-4">
            <span className="font-black uppercase text-xs block mb-1">Critical Failure</span>
            <p className="font-mono text-sm">{errorMsg}</p>
          </div>
        )}

        {/* Viewer Area */}
        {isViewerVisible && (
            <div className="space-y-6">
                <div className="relative w-full aspect-square border-4 border-black bg-slate-200 brutal-shadow overflow-hidden group">
                    
                    {/* Viewport Header */}
                    <div className="absolute top-0 left-0 right-0 h-10 bg-white border-b-2 border-black z-40 flex items-center justify-between px-4">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                            <span className="text-[10px] font-black uppercase tracking-tighter">Live Viewer 1.0</span>
                        </div>
                        {voxelCode && (
                            <div className="text-[10px] font-mono text-gray-400">
                                {viewMode === 'voxel' ? 'PROCESSED_MESH' : 'SOURCE_BUFFER'}
                            </div>
                        )}
                    </div>

                    {/* Rendering Layer */}
                    <div className="w-full h-full pt-10">
                        {isLoading && (
                            <div className="absolute inset-0 bg-black z-50 p-6 flex flex-col font-mono text-green-500">
                                <div className="scanline"></div>
                                <div className="flex justify-between items-center mb-6 text-xs border-b border-green-900 pb-2">
                                    <span className="font-black text-white">GEMINI_STREAMING_CORE v3.0</span>
                                    <span className="opacity-50 tracking-widest uppercase">{status}</span>
                                </div>

                                <div className="flex-grow overflow-y-auto custom-scrollbar space-y-4">
                                    <div className="text-[10px] text-green-300 opacity-60 uppercase tracking-widest leading-loose">
                                        &gt; {getDisplayPrompt().substring(0, 150)}...
                                    </div>
                                    
                                    {thinkingText && (
                                        <div className="py-2 px-3 bg-green-950/30 border-l-2 border-green-500 text-green-100 text-xs italic">
                                            &gt; COGNITION: {thinkingText}<span className="loading-dots"></span>
                                        </div>
                                    )}

                                    {status === 'generating_voxels' && (
                                        <div className="text-[10px] sm:text-xs terminal-glow leading-relaxed overflow-x-hidden">
                                            {streamingCode}
                                            <span className="cursor"></span>
                                        </div>
                                    )}
                                    <div ref={terminalEndRef}></div>
                                </div>
                            </div>
                        )}

                        {!imageData && !isLoading && !errorMsg && (
                            <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
                                <div className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-full flex items-center justify-center opacity-40">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-8 h-8">
                                        <path strokeLinecap="square" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                                    </svg>
                                </div>
                                <p className="text-xs font-black uppercase tracking-widest opacity-40">Standby for input...</p>
                            </div>
                        )}

                        {imageData && viewMode === 'image' && (
                            <div className="w-full h-full p-4 flex items-center justify-center bg-white">
                                <img src={imageData} alt="Source" className="max-w-full max-h-full brutal-shadow border-2 border-black" />
                            </div>
                        )}

                        {voxelCode && viewMode === 'voxel' && (
                            <iframe ref={iframeRef} title="Voxel Scene" srcDoc={voxelCode} className="w-full h-full border-0" sandbox="allow-scripts allow-same-origin allow-popups" />
                        )}
                    </div>
                </div>

                {/* Control Panel */}
                <div className="flex flex-wrap gap-4">
                    {imageData && voxelCode && (
                        <button
                            onClick={() => { sounds.playClick(); setViewMode(viewMode === 'image' ? 'voxel' : 'image'); }}
                            disabled={isLoading}
                            className="flex-1 min-w-[140px] py-4 border-2 border-black bg-white font-black uppercase text-xs brutal-shadow-hover brutal-shadow-active transition-all flex items-center justify-center gap-2"
                        >
                            {viewMode === 'image' ? (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="square" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" /></svg>
                                    Switch to Voxel
                                </>
                            ) : (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="square" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>
                                    View Source
                                </>
                            )}
                        </button>
                    )}

                    {voxelCode && (
                        <button
                            onClick={handlePlay}
                            disabled={isLoading}
                            className="flex-1 min-w-[140px] py-4 border-2 border-black bg-green-400 font-black uppercase text-xs brutal-shadow-hover brutal-shadow-active transition-all flex items-center justify-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                <path fillRule="evenodd" d="M4.5 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" clipRule="evenodd" />
                            </svg>
                            Enter Simulation
                        </button>
                    )}

                    {((viewMode === 'image' && imageData) || (viewMode === 'voxel' && voxelCode)) && (
                      <div className="flex flex-1 min-w-[280px] gap-4">
                        <button
                            onClick={handleDownload}
                            disabled={isLoading}
                            className="flex-1 py-4 border-2 border-black bg-white font-black uppercase text-xs brutal-shadow-hover brutal-shadow-active transition-all flex items-center justify-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="square" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                            Export HTML
                        </button>
                        {viewMode === 'voxel' && (
                          <button
                              onClick={handleExportGLB}
                              disabled={isLoading}
                              className="flex-1 py-4 border-2 border-black bg-indigo-100 font-black uppercase text-xs brutal-shadow-hover brutal-shadow-active transition-all flex items-center justify-center gap-2"
                          >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="square" d="M21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" /></svg>
                              Export GLB
                          </button>
                        )}
                      </div>
                    )}
                    
                    {imageData && (
                        <button
                            onClick={handleVoxelize}
                            disabled={isLoading}
                            className="flex-1 min-w-[180px] py-4 bg-indigo-600 text-white border-2 border-black font-black uppercase text-xs brutal-shadow-hover brutal-shadow-active transition-all"
                        >
                            {voxelCode ? 'Recalculate Voxel Mesh' : 'Construct Voxel Scene'}
                        </button>
                    )}
                </div>
            </div>
        )}
      </div>
      
      {/* Footer Branding */}
      <div className="mt-16 text-center">
         <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">
            Powered by Gemini 3 & Three.js &bull; 2025 Ben Cobley
         </p>
      </div>
    </div>
  );
};

export default App;
