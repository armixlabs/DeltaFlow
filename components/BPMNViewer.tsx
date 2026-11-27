

import React, { useEffect, useRef } from 'react';

declare global {
  interface Window {
    BpmnJS: any;
  }
}

interface BPMNViewerProps {
  xml: string | null;
}

const BPMNViewer: React.FC<BPMNViewerProps> = ({ xml }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null); // Using 'any' for BpmnJS instance from CDN

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    // Ensure BpmnJS is loaded from CDN
    if (!window.BpmnJS) {
        console.error('BpmnJS not found on window object. Make sure the script is loaded.');
        return;
    }

    // Initialize viewer
    viewerRef.current = new window.BpmnJS({
      container: containerRef.current,
    });

    // Cleanup on unmount
    return () => {
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, []); // Run only once on component mount

  useEffect(() => {
    const displayDiagram = async () => {
      if (viewerRef.current && xml) {
        try {
          await viewerRef.current.importXML(xml);
          const canvas = viewerRef.current.get('canvas');
          if (canvas) {
            canvas.zoom('fit-viewport', 'auto');
          }
        } catch (err) {
          console.error('Error importing BPMN XML:', err);
        }
      } else if (viewerRef.current) {
        // Clear the viewer if XML is null
        viewerRef.current.clear();
      }
    };

    displayDiagram();
  }, [xml]); // Re-run when xml prop changes

  return <div ref={containerRef} className="bpmn-viewer-instance" />;
};

export default BPMNViewer;