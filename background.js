// Background script for TextLens AI
let analysisResult = null;
let isProcessing = false;

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);

  if (message.type === 'startSelection') {
    // Reset state
    analysisResult = null;
    isProcessing = false;
    sendResponse({ success: true });
    
  } else if (message.type === 'selectionMade') {
    // Process the selection
    isProcessing = true;
    processSelection(message.data, sender.tab.id)
      .then(result => {
        analysisResult = result;
        isProcessing = false;
        // Send result back to content script
        if (sender.tab && sender.tab.id) {
          chrome.tabs.sendMessage(sender.tab.id, {
            type: 'processingComplete',
            result: result
          }).catch(err => console.log('Error sending message to tab:', err));
        }
      })
      .catch(error => {
        isProcessing = false;
        analysisResult = { error: error.message };
        if (sender.tab && sender.tab.id) {
          chrome.tabs.sendMessage(sender.tab.id, {
            type: 'processingError',
            error: error.message
          }).catch(err => console.log('Error sending message to tab:', err));
        }
      });
    
    sendResponse({ success: true });
    
  } else if (message.type === 'getResult') {
    // Send stored result to popup
    sendResponse({
      result: analysisResult,
      isProcessing: isProcessing
    });
    
  } else if (message.type === 'clearResult') {
    analysisResult = null;
    sendResponse({ success: true });
  }

  return true; // Keep message channel open for async response
});

// Process the selected area
async function processSelection(data, tabId) {
  try {
    console.log('Processing selection:', data);
    
    // Perform OCR on the image using content script
    const extractedText = await performOCRInContentScript(data.imageData, tabId);
    console.log('Extracted text:', extractedText);
    
    if (!extractedText.trim()) {
      throw new Error('No text found in the selected area');
    }
    
    // Analyze with Gemini AI
    const analysis = await analyzeWithAI(extractedText);
    
    return {
      extractedText: extractedText,
      analysis: analysis,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Error processing selection:', error);
    throw error;
  }
}

// Perform OCR using content script (since service workers can't use importScripts)
async function performOCRInContentScript(imageData, tabId) {
  return new Promise((resolve, reject) => {
    // Send OCR request to content script
    chrome.tabs.sendMessage(tabId, {
      type: 'performOCR',
      imageData: imageData
    }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(`OCR failed: ${chrome.runtime.lastError.message}`));
        return;
      }
      
      if (response.success) {
        resolve(response.text);
      } else {
        reject(new Error(`OCR failed: ${response.error}`));
      }
    });
  });
}

// Analyze text with Gemini AI
async function analyzeWithAI(text) {
    // Get API key from Chrome extension storage
    const result = await chrome.storage.local.get(['geminiApiKey']); // You may want to rename this key too
    const apiKey = result.geminiApiKey;
  
    if (!apiKey) {
      throw new Error('Groq API key not configured. Please set it in the extension settings.');
    }
  
    const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
  
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          messages: [
            {
              role: 'user',
              content: `Please analyze the following extracted text and provide insights, summary, and any relevant information:\n\n"${text}"`
            }
          ]
        })
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Groq API error: ${errorData.error?.message || response.statusText}`);
      }
  
      const data = await response.json();
  
      if (!data.choices || !data.choices[0] || !data.choices[0].message?.content) {
        throw new Error('Invalid response from Groq API');
      }
  
      return data.choices[0].message.content;
  
    } catch (error) {
      console.error('Groq API error:', error);
      throw new Error(`Failed to analyze text: ${error.message}`);
    }
  }
  