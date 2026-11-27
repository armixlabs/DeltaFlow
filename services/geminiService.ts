
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

// Use a singleton pattern to ensure the client is initialized only once.
let aiInstance: GoogleGenAI | null = null;

const getAiClient = (): GoogleGenAI => {
  if (aiInstance) {
    return aiInstance;
  }

  // The API key is assumed to be available in the execution context as process.env.API_KEY.
  // For Vite, this is handled by the `define` feature in `vite.config.ts`.
  if (!process.env.API_KEY) {
    // This error will be thrown when optimizeBPMN is called, not on app load.
    throw new Error("API_KEY environment variable is not set. Please ensure it's configured in your environment via the build process.");
  }

  aiInstance = new GoogleGenAI({ apiKey: process.env.API_KEY });
  return aiInstance;
};

const SYSTEM_INSTRUCTION = `You are an expert in business process management and BPMN 2.0.
Your task is to optimize a given BPMN 2.0 XML based on a user's request.
You MUST ONLY return the full, valid, optimized BPMN 2.0 XML content.
Do not include any explanations, apologies, or markdown formatting like \`\`\`xml. The output must be pure XML.
Ensure all elements in the original diagram are either present, modified, or logically replaced in the optimized version.
Preserve diagram information (BPMNDiagram) if possible, but regenerate it if necessary to ensure it's valid for the new process flow.`;

/**
 * Optimizes a BPMN 2.0 XML string using Gemini.
 * @param bpmnXml The original BPMN 2.0 XML.
 * @param userPrompt The user's instruction for optimization.
 * @returns A promise that resolves to the optimized BPMN 2.0 XML string.
 */
export const optimizeBPMN = async (bpmnXml: string, userPrompt: string): Promise<string> => {
  const model = "gemini-3-pro-preview";

  const fullPrompt = `
Here is the current BPMN 2.0 XML:
<bpmn_xml>
${bpmnXml}
</bpmn_xml>

Here is the optimization instruction:
"${userPrompt}"

Please provide the optimized BPMN 2.0 XML. Remember to only output the raw XML content.
`;

  try {
    const ai = getAiClient(); // Lazily get the AI client
    
    const generationPromise = ai.models.generateContent({
        model: model,
        contents: fullPrompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.2, // Lower temperature for more deterministic, structured output
        }
    });
    
    // Add a timeout of 90 seconds to prevent the UI from getting stuck indefinitely.
    const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Request to AI service timed out after 90 seconds. This can happen with very large or complex process diagrams. Please try again or consider simplifying the optimization request.")), 90000)
    );
    
    const response: GenerateContentResponse = await Promise.race([generationPromise, timeoutPromise]);

    let optimizedXml = response.text.trim();
    
    // Clean up potential markdown formatting from the response
    if (optimizedXml.startsWith('```xml')) {
        optimizedXml = optimizedXml.substring(7);
    }
    if (optimizedXml.endsWith('```')) {
        optimizedXml = optimizedXml.slice(0, -3);
    }
    optimizedXml = optimizedXml.trim();


    // A simple check to see if the response looks like XML
    if (!optimizedXml.startsWith('<?xml') && !optimizedXml.startsWith('<definitions') && !optimizedXml.startsWith('<bpmn:definitions')) {
        console.error("Gemini response does not appear to be valid XML:", optimizedXml);
        // Fallback or attempt to clean
        const xmlStartIndex = optimizedXml.indexOf('<?xml');
        if (xmlStartIndex > -1) {
            return optimizedXml.substring(xmlStartIndex);
        }
        const definitionsStartIndex = optimizedXml.indexOf('<definitions');
         if (definitionsStartIndex > -1) {
            return optimizedXml.substring(definitionsStartIndex);
        }
        const bpmnDefinitionsStartIndex = optimizedXml.indexOf('<bpmn:definitions');
        if (bpmnDefinitionsStartIndex > -1) {
            return optimizedXml.substring(bpmnDefinitionsStartIndex);
        }
        throw new Error("AI response was not in the expected XML format.");
    }
    
    return optimizedXml;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    // Re-throw the error to be caught by the UI component
    if (error instanceof Error) {
        throw new Error(`AI service failed: ${error.message}`);
    }
    throw new Error("An unknown error occurred while contacting the AI service.");
  }
};
