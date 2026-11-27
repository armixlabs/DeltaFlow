import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import BPMNViewer from './components/BPMNViewer';
import { getGroupContents, getModelXml } from './services/adonisService';
import { optimizeBPMN } from './services/geminiService';
import type { Model, GroupContent } from './types';
import { DocumentIcon, EyeIcon, WandIcon, LoaderIcon, DownloadIcon } from './components/icons';
import { ADO_REST_ROOTMODELGROUP } from './config';

// Helper function to parse model name and version
const parseModelName = (fullName: string): { name: string; version: string | null } => {
    const match = fullName.match(/(.+?)(?:\s+([\d\.]+))?$/);
    if (match && match[1]) {
        return { name: match[1].trim(), version: match[2] || null };
    }
    return { name: fullName, version: null };
};


const App: React.FC = () => {
  // Data state
  const [rootContent, setRootContent] = useState<GroupContent | null>(null);
  const [childNodes, setChildNodes] = useState<Record<string, GroupContent>>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [loadingGroups, setLoadingGroups] = useState<Set<string>>(new Set());
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [originalXml, setOriginalXml] = useState<string | null>(null);
  const [optimizedXml, setOptimizedXml] = useState<string | null>(null);
  
  // UI State
  const [isLoadingModel, setIsLoadingModel] = useState<boolean>(false);
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [optimizationPrompt, setOptimizationPrompt] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'diagram' | 'optimization'>('diagram');


  useEffect(() => {
    const fetchInitialData = async () => {
      setLoadingGroups(prev => new Set(prev).add(ADO_REST_ROOTMODELGROUP));
      setError(null);
      try {
        const content = await getGroupContents(ADO_REST_ROOTMODELGROUP);
        setRootContent(content);
        setExpandedGroups(new Set([ADO_REST_ROOTMODELGROUP]));
      } catch (err) {
        setError('Failed to fetch initial model groups. Please check your configuration and network.');
        console.error(err);
      } finally {
        setLoadingGroups(prev => {
          const newLoading = new Set(prev);
          newLoading.delete(ADO_REST_ROOTMODELGROUP);
          return newLoading;
        });
      }
    };
    fetchInitialData();
  }, []);

  const handleToggleGroup = useCallback(async (groupId: string) => {
    const newExpandedGroups = new Set(expandedGroups);
    if (newExpandedGroups.has(groupId)) {
      newExpandedGroups.delete(groupId);
    } else {
      newExpandedGroups.add(groupId);
      if (!childNodes[groupId]) {
        setLoadingGroups(prev => new Set(prev).add(groupId));
        setError(null);
        try {
          const content = await getGroupContents(groupId);
          setChildNodes(prev => ({ ...prev, [groupId]: content }));
        } catch (err) {
          setError(`Failed to fetch content for group.`);
          console.error(err);
          newExpandedGroups.delete(groupId); // Don't keep it expanded if it fails
        } finally {
          setLoadingGroups(prev => {
            const newLoading = new Set(prev);
            newLoading.delete(groupId);
            return newLoading;
          });
        }
      }
    }
    setExpandedGroups(newExpandedGroups);
  }, [expandedGroups, childNodes]);

  const handleSelectModel = useCallback(async (model: Model) => {
    if (selectedModel?.id === model.id) return;

    setIsLoadingModel(true);
    setSelectedModel(model);
    setOriginalXml(null);
    setOptimizedXml(null);
    setOptimizationPrompt('');
    setError(null);
    setActiveView('diagram');

    try {
      const xml = await getModelXml(model.id);
      setOriginalXml(xml);
    } catch (err) {
      setError('Failed to load model diagram.');
      console.error(err);
    } finally {
      setIsLoadingModel(false);
    }
  }, [selectedModel]);
  
  const handleOptimize = async () => {
    if (!originalXml || !optimizationPrompt.trim()) {
        setError("Please enter an optimization instruction.");
        return;
    }
    setIsOptimizing(true);
    setOptimizedXml(null);
    setError(null);
    try {
        const newXml = await optimizeBPMN(originalXml, optimizationPrompt);
        setOptimizedXml(newXml);
    } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred during optimization.');
        console.error(err);
    } finally {
        setIsOptimizing(false);
    }
  };

  const handleDownload = () => {
    if (!optimizedXml || !selectedModel) return;

    // Sanitize model name for filename
    const fileName = `${selectedModel.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_optimized.bpmn`;
    const blob = new Blob([optimizedXml], { type: 'application/bpmn+xml;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const { name: modelName, version: modelVersion } = selectedModel ? parseModelName(selectedModel.name) : { name: '', version: null };

  const renderMainContent = () => {
    if (!selectedModel) {
      return (
        <div className="welcome-view">
           {loadingGroups.size > 0 ? (
              <>
                <LoaderIcon className="loader-icon" style={{width: '2.5rem', height: '2.5rem'}}/>
                <p style={{marginTop: '1rem', fontSize: '1.125rem'}}>Loading Process Models...</p>
              </>
           ) : error ? (
              <div className="error-box" role="alert">
                <strong>Error: </strong>
                <span>{error}</span>
              </div>
           ) : (
             <>
               <h1 style={{fontSize: '1.5rem', fontWeight: 600}}>Select a process model</h1>
               <p>Choose a model from the sidebar to view its diagram and start optimizing.</p>
             </>
           )}
        </div>
      )
    }

    if (isLoadingModel) {
      return (
        <div className="loading-view-bpmn">
            <LoaderIcon className="loader-icon" />
            <h2>Loading BPMN Diagram</h2>
            <p>{modelName} {modelVersion}</p>
            <p className="text-sm text-slate-400">Model ID: {selectedModel.id}</p>
        </div>
      );
    }

    if (activeView === 'diagram') {
      return (
        <div className="bpmn-container">
          {originalXml && <BPMNViewer xml={originalXml} />}
        </div>
      );
    }

    if (activeView === 'optimization') {
      return (
        <div className="optimization-view">
            <div className="optimization-controls">
                <h3>Optimization Command</h3>
                <p>Describe how to improve the process. E.g., "Combine approval steps" or "Automate inventory checking".</p>
                <textarea
                    rows={3}
                    placeholder="Enter optimization instructions..."
                    value={optimizationPrompt}
                    onChange={(e) => setOptimizationPrompt(e.target.value)}
                    disabled={isOptimizing}
                />
                {error && <p className="error-text">{error}</p>}
                <button
                    onClick={handleOptimize}
                    disabled={isOptimizing || !originalXml}
                    className="optimize-button"
                >
                    {isOptimizing ? <LoaderIcon className="icon"/> : <WandIcon className="icon"/>}
                    {isOptimizing ? 'Optimizing...' : 'Optimize with AI'}
                </button>
            </div>

            {isOptimizing && (
                <div className="loading-view-bpmn">
                    <LoaderIcon className="loader-icon" />
                    <h2>AI is thinking...</h2>
                    <p>Generating optimized process diagram.</p>
                </div>
            )}
            
            {optimizedXml && !isOptimizing && (
                <div className="viewer-card">
                    <h2 className="viewer-title">
                        <span className="viewer-title-text"><WandIcon /> Optimized Process</span>
                        <button className="download-button" onClick={handleDownload}>
                            <DownloadIcon className="icon" /> Download BPMN
                        </button>
                    </h2>
                    <div className="viewer-content">
                        <BPMNViewer xml={optimizedXml} />
                    </div>
                </div>
            )}

            {!optimizedXml && !isOptimizing && (
                <div className="optimization-placeholder">
                    The optimized model will appear here after running the optimization.
                </div>
            )}
        </div>
      );
    }
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-left">
          <span className="header-brand">Deltaflow</span>
          <span className="header-subtitle">Business Process Optimization Platform</span>
        </div>
        <div className="header-right">
          <span className="header-version">v1.0.0</span>
        </div>
      </header>

      <div className="app-body">
        <Sidebar
            rootContent={rootContent}
            childNodes={childNodes}
            expandedGroups={expandedGroups}
            loadingGroups={loadingGroups}
            selectedModel={selectedModel}
            onToggleGroup={handleToggleGroup}
            onSelectModel={handleSelectModel}
        />
        <main className="main-content">
          {selectedModel && (
            <div className="main-content-header">
              <div className="model-title-section">
                <DocumentIcon />
                <div>
                    <h1>{modelName} {modelVersion}</h1>
                    <p>Model ID: {selectedModel.id}</p>
                </div>
              </div>
              <div className="view-toggle">
                <button onClick={() => setActiveView('diagram')} className={activeView === 'diagram' ? 'active' : ''}>
                  <EyeIcon/> Diagram
                </button>
                <button onClick={() => setActiveView('optimization')} className={activeView === 'optimization' ? 'active' : ''}>
                  <WandIcon/> Optimization
                </button>
              </div>
            </div>
          )}
          <div className="main-content-body">
            {renderMainContent()}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
