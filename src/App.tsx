import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import BPMNViewer from './components/BPMNViewer';
import { DocumentIcon, EyeIcon, WandIcon, LoaderIcon, DownloadIcon, MicrophoneIcon, UploadIcon } from './components/icons';
import { useModelRepository } from './hooks/useModelRepository';
import { useOptimization } from './hooks/useOptimization';
import { useProcessCreation } from './hooks/useProcessCreation';
import { useSpeechToText } from './hooks/useSpeechToText';
import type { Model } from './types';
import {
  createBPMN as createBPMNWithGemini,
  createBPMNFromTranscript as createBPMNFromTranscriptWithGemini,
  optimizeBPMN as optimizeBPMNWithGemini,
} from './services/geminiService';
import {
  createBPMNWithOpenAI,
  createBPMNFromTranscriptWithOpenAI,
  optimizeBPMNWithOpenAI,
} from './services/openaiService';
import {
  createBPMNWithAnthropic,
  createBPMNFromTranscriptWithAnthropic,
  optimizeBPMNWithAnthropic,
} from './services/anthropicService';
import { importCreatedProcess, importOptimizedProcess } from './services/adonisImportService';
import { ConfigDialog, REQUIRED_CONFIG_KEYS } from './components/ConfigDialog';
import { getEnvVar } from './utils/env';
import { getProviderLabel, getProviderModelKey, type ModelProvider } from './utils/providers';
import { parseTranscriptFile } from './utils/transcriptParser';

const OPTIMIZATION_MESSAGES = [
  'Smoothing gateways to remove unnecessary detours...',
  'Relinking swimlanes for clearer handovers...',
  'Simulating token flow to prevent hidden deadlocks...',
  'Rebalancing manual and automated tasks for throughput...',
  'Weaving compliance checks into each critical path...',
  'Optimizing service tasks for quicker response times...',
  'Refactoring parallel branches to reduce wait states...',
  'Documenting fresh best-practice hints for the repository...',
] as const;

const CREATION_MESSAGES = [
  'Transforming your brief into a BPMN storyline...',
  'Drafting pools and lanes that mirror your teams...',
  'Sequencing activities before any gateways appear...',
  'Pairing data objects with the tasks that need them...',
  'Spotlighting milestones so progress feels tangible...',
  'Checking reusable patterns against industry playbooks...',
  'Sketching exception paths to keep outcomes resilient...',
  'Polishing layout to make the flow presentation ready...',
] as const;

const TRANSCRIPT_MESSAGES = [
  'Reassembling meeting quotes into structured steps...',
  'Distilling speaker intent into BPMN activities...',
  'Mapping responsibilities across every role mentioned...',
  'Normalizing jargon so lanes stay consistent...',
  'Detecting agreements hidden between interruptions...',
  'Turning side notes into explicit boundary events...',
  'Cross-checking decisions to resolve contradictions...',
  'Flagging follow-ups before they become escalations...',
] as const;

const formatDurationSeconds = (milliseconds: number | null): string | null => {
  if (milliseconds == null || Number.isNaN(milliseconds)) {
    return null;
  }
  const seconds = milliseconds / 1000;
  const rounded = seconds >= 10 ? Math.round(seconds) : Math.max(seconds, 0.1).toFixed(1);
  if (typeof rounded === 'number') {
    return String(rounded);
  }
  return rounded.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
};

const APP_VERSION = 'G1-v0.0.1';

const parseModelName = (fullName: string): { name: string; version: string | null } => {
  const match = fullName.match(/(.+?)(?:\s+([\d\.]+))?$/);
  if (match && match[1]) {
    return { name: match[1].trim(), version: match[2] || null };
  }
  return { name: fullName, version: null };
};

const downloadXml = (xml: string, fileName: string) => {
  const blob = new Blob([xml], { type: 'application/bpmn+xml;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};

const MIN_SIDEBAR_WIDTH = 320;
const MAX_SIDEBAR_WIDTH = 560;

const App: React.FC = () => {
  const [modelProvider, setModelProvider] = useState<ModelProvider>('gemini');
  const [appMode, setAppMode] = useState<'browsing' | 'creatingDescription' | 'creatingTranscript'>('browsing');
  const [configVersion, setConfigVersion] = useState(0);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [missingConfigKeys, setMissingConfigKeys] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lastOptimizationProvider, setLastOptimizationProvider] = useState<string | null>(null);
  const [lastDescriptionProvider, setLastDescriptionProvider] = useState<string | null>(null);
  const [lastTranscriptProvider, setLastTranscriptProvider] = useState<string | null>(null);
  const [isImportingOptimized, setIsImportingOptimized] = useState(false);
  const [isImportingDescription, setIsImportingDescription] = useState(false);
  const [isImportingTranscript, setIsImportingTranscript] = useState(false);
  const [activeView, setActiveView] = useState<'diagram' | 'optimization'>('diagram');
  const [error, setError] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState<number>(420);
  const [isResizing, setIsResizing] = useState(false);
  const [uploadedTranscriptName, setUploadedTranscriptName] = useState<string | null>(null);

  const {
    rootContent,
    childNodes,
    expandedGroups,
    loadingGroups,
    selectedModel,
    originalXml,
    isLoadingModel,
    isRootLoading,
    toggleGroup,
    selectModel,
    clearSelection,
    setOriginalXml,
  } = useModelRepository({ onError: setError, configVersion });

  const descriptionCreateFn = useMemo(() => {
    switch (modelProvider) {
      case 'openai':
        return createBPMNWithOpenAI;
      case 'anthropic':
        return createBPMNWithAnthropic;
      case 'anthropic-haiku':
        return (input: string) => createBPMNWithAnthropic(input, getProviderModelKey('anthropic-haiku'));
      case 'gemini':
      default:
        return createBPMNWithGemini;
    }
  }, [modelProvider]);

  const transcriptCreateFn = useMemo(() => {
    switch (modelProvider) {
      case 'openai':
        return createBPMNFromTranscriptWithOpenAI;
      case 'anthropic':
        return createBPMNFromTranscriptWithAnthropic;
      case 'anthropic-haiku':
        return (input: string) =>
          createBPMNFromTranscriptWithAnthropic(input, getProviderModelKey('anthropic-haiku'));
      case 'gemini':
      default:
        return createBPMNFromTranscriptWithGemini;
    }
  }, [modelProvider]);

  const optimizeFn = useMemo(() => {
    switch (modelProvider) {
      case 'openai':
        return optimizeBPMNWithOpenAI;
      case 'anthropic':
        return optimizeBPMNWithAnthropic;
      case 'anthropic-haiku':
        return (bpmnXml: string, prompt: string) =>
          optimizeBPMNWithAnthropic(bpmnXml, prompt, getProviderModelKey('anthropic-haiku'));
      case 'gemini':
      default:
        return optimizeBPMNWithGemini;
    }
  }, [modelProvider]);

  const {
    prompt: optimizationPrompt,
    setPrompt: setOptimizationPrompt,
    optimizedXml,
    isOptimizing,
    loadingMessage: optimizationLoadingMessage,
    lastRunDurationMs: optimizationDurationMs,
    runOptimization,
    reset: resetOptimization,
  } = useOptimization({ messages: OPTIMIZATION_MESSAGES, onError: setError, optimizeFn });

  const {
    prompt: creationPrompt,
    setPrompt: setCreationPrompt,
    createdXml,
    isCreating,
    loadingMessage: creationLoadingMessage,
    lastRunDurationMs: creationDurationMs,
    runCreation,
    reset: resetCreation,
  } = useProcessCreation({ messages: CREATION_MESSAGES, onError: setError, createFn: descriptionCreateFn });

  const {
    prompt: transcriptPrompt,
    setPrompt: setTranscriptPrompt,
    createdXml: transcriptXml,
    isCreating: isCreatingTranscript,
    loadingMessage: transcriptLoadingMessage,
    lastRunDurationMs: transcriptDurationMs,
    runCreation: runTranscriptCreation,
    reset: resetTranscriptCreation,
  } = useProcessCreation({ messages: TRANSCRIPT_MESSAGES, onError: setError, createFn: transcriptCreateFn });

  const handleTranscript = useCallback(
    (transcript: string) => {
      setCreationPrompt((prev) => {
        const trimmed = prev.trim();
        return `${trimmed ? `${trimmed} ` : ''}${transcript} `;
      });
    },
    [setCreationPrompt]
  );

  const [speechLanguage, setSpeechLanguage] = useState<'en-US' | 'de-DE'>('en-US');

  const { isListening, isSupported: isSpeechSupported, toggle: toggleListening, stop: stopListening } = useSpeechToText({
    onTranscript: handleTranscript,
    onError: setError,
    language: speechLanguage,
  });

  const resetWorkflowState = useCallback(() => {
    resetOptimization();
    resetCreation();
    resetTranscriptCreation();
    setOptimizationPrompt('');
    setCreationPrompt('');
    setTranscriptPrompt('');
    setError(null);
    setUploadedTranscriptName(null);
    setStatusMessage(null);
    setLastOptimizationProvider(null);
    setLastDescriptionProvider(null);
    setLastTranscriptProvider(null);
    stopListening();
    clearSelection();
    setOriginalXml(null);
  }, [
    clearSelection,
    resetOptimization,
    resetCreation,
    resetTranscriptCreation,
    setOptimizationPrompt,
    setCreationPrompt,
    setTranscriptPrompt,
    stopListening,
    setOriginalXml,
    setStatusMessage,
    setLastOptimizationProvider,
    setLastDescriptionProvider,
    setLastTranscriptProvider,
  ]);

  useEffect(() => {
    resetWorkflowState();
  }, [modelProvider, resetWorkflowState]);

  useEffect(() => {
    const missing = REQUIRED_CONFIG_KEYS.filter((key) => !getEnvVar(key));
    if (missing.length > 0) {
      setMissingConfigKeys(missing);
      setIsConfigOpen(true);
    }
  }, [configVersion]);

  useEffect(() => {
    if (error) {
      setStatusMessage(null);
    }
  }, [error]);

  const handleCreateFromDescription = useCallback(() => {
    setAppMode('creatingDescription');
    setActiveView('diagram');
    setError(null);
    resetWorkflowState();
  }, [resetWorkflowState]);

  const handleCreateFromTranscript = useCallback(() => {
    setAppMode('creatingTranscript');
    setActiveView('diagram');
    setError(null);
    resetWorkflowState();
  }, [resetWorkflowState]);

  const handleModelProviderChange = useCallback((provider: ModelProvider) => {
    setModelProvider(provider);
  }, []);

  const handleOpenConfig = useCallback(() => {
    setMissingConfigKeys([]);
    setIsConfigOpen(true);
  }, []);

  const handleConfigSaved = useCallback(() => {
    setIsConfigOpen(false);
    setMissingConfigKeys([]);
    setConfigVersion((prev) => prev + 1);
    resetWorkflowState();
  }, [resetWorkflowState]);

  const handleCloseConfig = useCallback(() => {
    if (missingConfigKeys.length === 0) {
      setIsConfigOpen(false);
    }
  }, [missingConfigKeys.length]);

  const handleSelectModel = useCallback(
    (model: Model) => {
      setAppMode('browsing');
      setActiveView('diagram');
      setError(null);
      resetWorkflowState();
      selectModel(model, { force: appMode !== 'browsing' });
    },
    [appMode, resetWorkflowState, selectModel]
  );

  const handleToggleGroup = useCallback(
    (groupId: string) => {
      setError(null);
      setStatusMessage(null);
      toggleGroup(groupId);
    },
    [toggleGroup]
  );

  const handleOptimize = useCallback(() => {
    setStatusMessage(null);
    setLastOptimizationProvider(getProviderLabel(modelProvider));
    runOptimization(originalXml);
  }, [modelProvider, originalXml, runOptimization]);

  const handleCreate = useCallback(() => {
    setStatusMessage(null);
    stopListening();
    setLastDescriptionProvider(getProviderLabel(modelProvider));
    runCreation();
  }, [modelProvider, runCreation, stopListening]);

  const handleDownloadXml = useCallback((xml: string | null, defaultFilename: string) => {
    if (!xml) {
      return;
    }
    downloadXml(xml, defaultFilename);
  }, []);

  const handleDownloadCreatedDescription = useCallback(() => {
    handleDownloadXml(createdXml, 'new_process_model.bpmn');
  }, [createdXml, handleDownloadXml]);

  const handleDownloadCreatedTranscript = useCallback(() => {
    handleDownloadXml(transcriptXml, 'transcript_process_model.bpmn');
  }, [handleDownloadXml, transcriptXml]);

  const handleImportOptimized = useCallback(async () => {
    if (!optimizedXml) {
      setError('No optimized BPMN to import.');
      setStatusMessage(null);
      return;
    }
    if (!selectedModel?.parentGroupId) {
      setError('Unable to determine the original model group for import.');
      setStatusMessage(null);
      return;
    }

    setIsImportingOptimized(true);
    setStatusMessage(null);

    try {
      const baseName = selectedModel?.name || 'Optimized Process';
      await importOptimizedProcess({
        originalGroupId: selectedModel.parentGroupId,
        xml: optimizedXml,
        baseName,
      });
      setError(null);
      setStatusMessage('Optimized process imported into the repository.');
    } catch (importError) {
      setStatusMessage(null);
      setError(
        importError instanceof Error ? importError.message : 'Failed to import the optimized process.'
      );
    } finally {
      setIsImportingOptimized(false);
    }
  }, [optimizedXml, selectedModel]);

  const handleImportDescription = useCallback(async () => {
    if (!createdXml) {
      setError('No generated BPMN to import.');
      setStatusMessage(null);
      return;
    }

    setIsImportingDescription(true);
    setStatusMessage(null);

    try {
      const baseName = 'Description-based Process';
      await importCreatedProcess({ xml: createdXml, baseName });
      setError(null);
      setStatusMessage('Generated process imported into the repository.');
    } catch (importError) {
      setStatusMessage(null);
      setError(
        importError instanceof Error ? importError.message : 'Failed to import the generated process.'
      );
    } finally {
      setIsImportingDescription(false);
    }
  }, [createdXml]);

  const handleImportTranscript = useCallback(async () => {
    if (!transcriptXml) {
      setError('No transcript-based BPMN to import.');
      setStatusMessage(null);
      return;
    }

    setIsImportingTranscript(true);
    setStatusMessage(null);

    try {
      const baseName = 'Transcript-based Process';
      await importCreatedProcess({ xml: transcriptXml, baseName });
      setError(null);
      setStatusMessage('Transcript-based process imported into the repository.');
    } catch (importError) {
      setStatusMessage(null);
      setError(
        importError instanceof Error
          ? importError.message
          : 'Failed to import the transcript-based process.'
      );
    } finally {
      setIsImportingTranscript(false);
    }
  }, [transcriptXml]);

  const handleRunTranscriptCreation = useCallback(() => {
    setStatusMessage(null);
    setLastTranscriptProvider(getProviderLabel(modelProvider));
    runTranscriptCreation();
  }, [modelProvider, runTranscriptCreation]);

  const handleTranscriptUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

    try {
      const content = await parseTranscriptFile(file);
      setTranscriptPrompt(content);
      setUploadedTranscriptName(file.name);
      setError(null);
      setStatusMessage(null);
    } catch (uploadError) {
      console.error('Failed to parse transcript:', uploadError);
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Failed to parse transcript file. Please check the format and try again.'
      );
      setUploadedTranscriptName(null);
      setStatusMessage(null);
    }

    event.target.value = '';
  },
  []
  );

  const handleDownloadOriginal = useCallback(() => {
    if (!originalXml || !selectedModel) {
      return;
    }
    const fileName = `${selectedModel.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_original.bpmn`;
    handleDownloadXml(originalXml, fileName);
  }, [handleDownloadXml, originalXml, selectedModel]);

  const handleDownloadOptimized = useCallback(() => {
    if (!optimizedXml || !selectedModel) {
      return;
    }
    const fileName = `${selectedModel.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_optimized.bpmn`;
    handleDownloadXml(optimizedXml, fileName);
  }, [handleDownloadXml, optimizedXml, selectedModel]);

  const modelMetadata = useMemo(() => {
    if (!selectedModel) {
      return { name: '', version: null as string | null };
    }
    return parseModelName(selectedModel.name);
  }, [selectedModel]);

  const renderDescriptionCreationView = () => {
    const creationDurationLabel = formatDurationSeconds(creationDurationMs);

    return (
      <div className="optimization-view">
        <div className="optimization-controls">
          <h3>Create New Process Model from Description</h3>
          <p>Describe the business process you want to model in plain text. You can also click the microphone to use your voice.</p>
          <div className="language-selector">
            <label htmlFor="speech-language">Recognition language</label>
            <select
              id="speech-language"
              value={speechLanguage}
              onChange={(event) => setSpeechLanguage(event.target.value as 'en-US' | 'de-DE')}
              disabled={isListening}
            >
              <option value="en-US">English</option>
              <option value="de-DE">Deutsch</option>
            </select>
          </div>
          <div className="textarea-wrapper">
            <textarea
              rows={4}
              placeholder="e.g., 'A customer places an order online. The system checks inventory. If stock is available, the order is confirmed and sent to shipping. If not, the customer is notified.'"
              value={creationPrompt}
              onChange={(event) => {
                setCreationPrompt(event.target.value);
                setError(null);
              }}
              disabled={isCreating}
            />
            {isSpeechSupported && (
              <button
                type="button"
                onClick={toggleListening}
                className={`speech-to-text-button ${isListening ? 'listening' : ''}`}
                aria-label={isListening ? 'Stop listening' : 'Start listening'}
                title={isListening ? 'Stop listening' : 'Start listening'}
                disabled={isCreating}
              >
                <MicrophoneIcon />
              </button>
            )}
          </div>
          {error && <p className="error-text">{error}</p>}
          {statusMessage && <p className="status-text">{statusMessage}</p>}
          <button onClick={handleCreate} disabled={isCreating || !creationPrompt.trim()} className="optimize-button">
            {isCreating ? <LoaderIcon className="icon" /> : '✨'}
            {isCreating ? 'Creating...' : 'Create with AI'}
          </button>
        </div>

        {isCreating && (
          <div className="loading-view-bpmn">
            <LoaderIcon className="loader-icon" />
            <h2>Composing your process blueprint...</h2>
            <p>{creationLoadingMessage}</p>
          </div>
        )}

        {createdXml && !isCreating && (
          <div className="viewer-card">
            <h2 className="viewer-title">
              <span className="viewer-title-text">
                <WandIcon /> Generated Process
              </span>
              <div className="viewer-actions">
                <button className="download-button" onClick={handleDownloadCreatedDescription}>
                  <DownloadIcon className="icon" /> Download BPMN
                </button>
                <button
                  className="import-button"
                  onClick={handleImportDescription}
                  disabled={isImportingDescription}
                >
                  {isImportingDescription ? 'Importing…' : <><UploadIcon className="icon" /> Import to Repository</>}
                </button>
              </div>
            </h2>
            {creationDurationLabel && lastDescriptionProvider && (
              <p className="generation-meta">
                Process model created by {lastDescriptionProvider} in {creationDurationLabel} seconds.
              </p>
            )}
            <div className="viewer-content">
              <BPMNViewer xml={createdXml} />
            </div>
          </div>
        )}

        {!createdXml && !isCreating && (
          <div className="optimization-placeholder">The new process model will appear here after creation.</div>
        )}
      </div>
    );
  };

  const renderTranscriptCreationView = () => {
    const transcriptDurationLabel = formatDurationSeconds(transcriptDurationMs);

    return (
      <div className="optimization-view">
        <div className="optimization-controls">
          <h3>Create New Process Model from Transcript</h3>
          <p>Paste the transcript of your process-modelling workshop. The AI will analyse the discussion and produce a BPMN model that reflects the group’s decisions.</p>
          <div className="transcript-upload">
            <label className="transcript-upload-label" htmlFor="transcript-upload-input">
              <MicrophoneIcon className="icon" /> Upload transcript
            </label>
            <input
              id="transcript-upload-input"
              type="file"
              accept=".vtt,.txt,.csv,text/plain,text/vtt,text/csv"
              onChange={(event) => handleTranscriptUpload(event)}
            />
            {uploadedTranscriptName && (
              <p className="transcript-uploaded-name">Loaded: {uploadedTranscriptName}</p>
            )}
          </div>
          <p className="transcript-divider">or paste transcript</p>
          <div className="textarea-wrapper">
            <textarea
              rows={6}
              placeholder="Paste the full transcript of your process modelling meeting here..."
              value={transcriptPrompt}
              onChange={(event) => {
                setTranscriptPrompt(event.target.value);
                setError(null);
                if (event.target.value.trim().length === 0) {
                  setUploadedTranscriptName(null);
                }
              }}
              disabled={isCreatingTranscript}
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          {statusMessage && <p className="status-text">{statusMessage}</p>}
          <button
            onClick={handleRunTranscriptCreation}
            disabled={isCreatingTranscript || !transcriptPrompt.trim()}
            className="optimize-button"
          >
            {isCreatingTranscript ? <LoaderIcon className="icon" /> : '✨'}
            {isCreatingTranscript ? 'Creating...' : 'Create with AI'}
          </button>
        </div>

        {isCreatingTranscript && (
          <div className="loading-view-bpmn">
            <LoaderIcon className="loader-icon" />
            <h2>Translating your workshop into BPMN...</h2>
            <p>{transcriptLoadingMessage}</p>
          </div>
        )}

        {transcriptXml && !isCreatingTranscript && (
          <div className="viewer-card">
            <h2 className="viewer-title">
              <span className="viewer-title-text">
                <WandIcon /> Transcript-Based Process
              </span>
              <div className="viewer-actions">
                <button className="download-button" onClick={handleDownloadCreatedTranscript}>
                  <DownloadIcon className="icon" /> Download BPMN
                </button>
                <button
                  className="import-button"
                  onClick={handleImportTranscript}
                  disabled={isImportingTranscript}
                >
                  {isImportingTranscript ? 'Importing…' : <><UploadIcon className="icon" /> Import to Repository</>}
                </button>
              </div>
            </h2>
            {transcriptDurationLabel && lastTranscriptProvider && (
              <p className="generation-meta">
                Process model created by {lastTranscriptProvider} in {transcriptDurationLabel} seconds.
              </p>
            )}
            <div className="viewer-content">
              <BPMNViewer xml={transcriptXml} />
            </div>
          </div>
        )}

        {!transcriptXml && !isCreatingTranscript && (
          <div className="optimization-placeholder">The generated process will appear here after analysing your transcript.</div>
        )}
      </div>
    );
  };

  const renderOptimizationView = () => {
    const optimizationDurationLabel = formatDurationSeconds(optimizationDurationMs);

    return (
      <div className="optimization-view">
        <div className="optimization-controls">
          <h3>Optimization Command</h3>
          <p>Describe how to improve the process. E.g., "Combine approval steps" or "Automate inventory checking".</p>
          <textarea
            rows={3}
            placeholder="Enter optimization instructions..."
            value={optimizationPrompt}
            onChange={(event) => {
              setOptimizationPrompt(event.target.value);
              setError(null);
              setStatusMessage(null);
            }}
            disabled={isOptimizing}
          />
          {error && <p className="error-text">{error}</p>}
          {statusMessage && <p className="status-text">{statusMessage}</p>}
          <button onClick={handleOptimize} disabled={isOptimizing || !originalXml} className="optimize-button">
            {isOptimizing ? <LoaderIcon className="icon" /> : '✨'}
            {isOptimizing ? 'Optimizing...' : 'Optimize with AI'}
          </button>
        </div>

        {isOptimizing && (
          <div className="loading-view-bpmn">
            <LoaderIcon className="loader-icon" />
            <h2>Refining your process flow...</h2>
            <p>{optimizationLoadingMessage}</p>
          </div>
        )}

        {optimizedXml && !isOptimizing && (
          <div className="viewer-card">
            <h2 className="viewer-title">
              <span className="viewer-title-text">
                <WandIcon /> Optimized Process
              </span>
              <div className="viewer-actions">
                <button className="download-button" onClick={handleDownloadOptimized}>
                  <DownloadIcon className="icon" /> Download BPMN
                </button>
                <button
                  className="import-button"
                  onClick={handleImportOptimized}
                  disabled={isImportingOptimized || !optimizedXml}
                >
                  {isImportingOptimized ? 'Importing…' : <><UploadIcon className="icon" /> Import to Repository</>}
                </button>
              </div>
            </h2>
            {optimizationDurationLabel && lastOptimizationProvider && (
              <p className="generation-meta">
                Process optimized by {lastOptimizationProvider} in {optimizationDurationLabel} seconds.
              </p>
            )}
            <div className="viewer-content">
              <BPMNViewer xml={optimizedXml} />
            </div>
          </div>
        )}

        {!optimizedXml && !isOptimizing && (
          <div className="optimization-placeholder">The optimized model will appear here after running the optimization.</div>
        )}
      </div>
    );
  };

  const renderDiagramView = () => (
    <div className="viewer-card">
      <h2 className="viewer-title">
        <span className="viewer-title-text">
          <EyeIcon /> Original Process
        </span>
        {originalXml && (
          <button className="download-button" onClick={handleDownloadOriginal}>
            <DownloadIcon className="icon" /> Download BPMN
          </button>
        )}
      </h2>
      <div className="viewer-content">
        {originalXml ? (
          <BPMNViewer xml={originalXml} />
        ) : (
          <div className="optimization-placeholder">Could not load model diagram.</div>
        )}
      </div>
    </div>
  );

  const renderMainContent = () => {
    if (appMode === 'creatingDescription') {
      return renderDescriptionCreationView();
    }

    if (appMode === 'creatingTranscript') {
      return renderTranscriptCreationView();
    }

    if (!selectedModel) {
      if (isRootLoading) {
        return (
          <div className="welcome-view">
            <LoaderIcon className="loader-icon" style={{ width: '2.5rem', height: '2.5rem' }} />
            <p style={{ marginTop: '1rem', fontSize: '1.125rem' }}>Loading repository structure...</p>
          </div>
        );
      }

      if (error) {
        return (
          <div className="welcome-view">
            <div className="error-box" role="alert">
              <strong>Error: </strong>
              <span>{error}</span>
            </div>
          </div>
        );
      }

      return (
        <div className="welcome-view">
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Select a process model</h1>
          <p>Choose a model from the sidebar to view its diagram and start optimizing.</p>
        </div>
      );
    }

    if (isLoadingModel) {
      return (
        <div className="loading-view-bpmn">
          <LoaderIcon className="loader-icon" />
          <h2>Preparing BPMN canvas...</h2>
          <p>
            {modelMetadata.name} {modelMetadata.version}
          </p>
          <p className="text-sm text-slate-400">Model ID: {selectedModel.id}</p>
        </div>
      );
    }

    if (activeView === 'optimization') {
      return renderOptimizationView();
    }

    return renderDiagramView();
  };

  const renderHeader = () => {
    if (appMode === 'creatingDescription') {
      return (
        <header className="workspace-header workspace-header--muted">
          <div>
            <h1 className="workspace-heading gradient-text">Create New Process Model from Description</h1>
            <p className="workspace-subheading">
              Describe the process and let Deltaflow craft a BPMN diagram for you.
            </p>
          </div>
        </header>
      );
    }

    if (appMode === 'creatingTranscript') {
      return (
        <header className="workspace-header workspace-header--muted">
          <div>
            <h1 className="workspace-heading gradient-text">Create New Process Model from Transcript</h1>
            <p className="workspace-subheading">
              Paste the workshop transcript and let Deltaflow translate the conversation into BPMN.
            </p>
          </div>
        </header>
      );
    }

    if (selectedModel) {
      return (
        <header className="workspace-header">
          <div className="workspace-title">
            <DocumentIcon />
            <div>
              <h1 className="workspace-heading gradient-text">
                {modelMetadata.name} {modelMetadata.version}
              </h1>
              <p className="workspace-subheading">Model ID: {selectedModel.id}</p>
            </div>
          </div>
          <div className="workspace-tabs">
            <button onClick={() => setActiveView('diagram')} className={activeView === 'diagram' ? 'active' : ''}>
              <EyeIcon className="icon" /> Diagram
            </button>
            <button
              onClick={() => setActiveView('optimization')}
              className={activeView === 'optimization' ? 'active' : ''}
            >
              <span aria-hidden="true">✨</span> Optimization
            </button>
          </div>
        </header>
      );
    }

    return (
      <header className="workspace-header workspace-header--muted">
        <div>
          <h1 className="workspace-heading gradient-text">Welcome to Deltaflow</h1>
          <p className="workspace-subheading">
            Select a process model from the sidebar or create a new one with the AI assistant.
          </p>
        </div>
      </header>
    );
  };

  const handleSidebarResizeStart = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = sidebarWidth;
      const originalUserSelect = document.body.style.userSelect;
      const originalCursor = document.body.style.cursor;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        const nextWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, startWidth + delta));
        setSidebarWidth(nextWidth);
      };

      const onMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.userSelect = originalUserSelect;
        document.body.style.cursor = originalCursor;
      };

      setIsResizing(true);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [sidebarWidth]
  );

  return (
    <div className="app-container">
      <Sidebar
        rootContent={rootContent}
        childNodes={childNodes}
        expandedGroups={expandedGroups}
        loadingGroups={loadingGroups}
        selectedModel={selectedModel}
        onToggleGroup={handleToggleGroup}
        onSelectModel={handleSelectModel}
        onCreateNew={handleCreateFromDescription}
        onCreateFromTranscript={handleCreateFromTranscript}
        modelProvider={modelProvider}
        onModelProviderChange={handleModelProviderChange}
        onOpenConfig={handleOpenConfig}
        appVersion={APP_VERSION}
        width={sidebarWidth}
      />
      <div
        className={`sidebar-resizer${isResizing ? ' is-dragging' : ''}`}
        onMouseDown={handleSidebarResizeStart}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
      />
      <div className="workspace">
        {renderHeader()}
        <div className="workspace-content">{renderMainContent()}</div>
      </div>
      <ConfigDialog
        isOpen={isConfigOpen}
        onClose={handleCloseConfig}
        onSaved={handleConfigSaved}
        missingKeys={missingConfigKeys}
      />
    </div>
  );
};

export default App;
