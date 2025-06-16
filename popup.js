// Popup script for TextLens AI
document.addEventListener('DOMContentLoaded', function() {
    const startSelectionBtn = document.getElementById('startSelection');
    const settingsBtn = document.getElementById('settings');
    const statusElement = document.getElementById('status');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const resultSection = document.getElementById('resultSection');
    const textContent = document.getElementById('textContent');
    const analysisContent = document.getElementById('analysisContent');
    const copyResultBtn = document.getElementById('copyResult');
    const clearResultBtn = document.getElementById('clearResult');
  
    // Initialize popup
    init();
  
    async function init() {
      // Check for existing results
      try {
        const response = await chrome.runtime.sendMessage({ type: 'getResult' });
        
        if (response.isProcessing) {
          showLoading();
          // Poll for results
          pollForResults();
        } else if (response.result) {
          if (response.result.error) {
            showStatus(response.result.error, 'error');
          } else {
            showResult(response.result);
          }
        }
      } catch (error) {
        console.log('Error getting initial result:', error);
      }
  
      // Check if API key is configured
      checkApiKey();
    }
  
    // Check if Gemini API key is configured
    async function checkApiKey() {
      try {
        const result = await chrome.storage.local.get(['geminiApiKey']);
        if (!result.geminiApiKey) {
          showStatus('Please configure your Gemini API key in settings', 'warning');
        }
      } catch (error) {
        console.log('Error checking API key:', error);
      }
    }

    // Convert markdown text to plain text with better formatting
    function markdownToPlainText(markdown) {
      if (!markdown) return '';
      
      let text = markdown;
      
      // Handle code blocks first (preserve content but remove syntax)
      text = text.replace(/```[\w]*\n?([\s\S]*?)```/g, (match, code) => {
        return '\n--- CODE ---\n' + code.trim() + '\n--- END CODE ---\n';
      });
      
      // Remove inline code backticks but keep content
      text = text.replace(/`([^`]+)`/g, '$1');
      
      // Remove headers but keep content with proper spacing
      text = text.replace(/^#{1,6}\s+(.+)$/gm, '\n$1\n');
      
      // Remove bold and italic formatting
      text = text.replace(/\*\*(.*?)\*\*/g, '$1');
      text = text.replace(/__(.*?)__/g, '$1');
      text = text.replace(/\*(.*?)\*/g, '$1');
      text = text.replace(/_(.*?)_/g, '$1');
      
      // Remove strikethrough
      text = text.replace(/~~(.*?)~~/g, '$1');
      
      // Handle numbered lists - convert to clean format
      text = text.replace(/^\s*(\d+)\.\s+(.+)$/gm, '$1. $2');
      
      // Handle bullet points - convert to clean format
      text = text.replace(/^\s*[-*+]\s+(.+)$/gm, '• $1');
      
      // Remove blockquotes
      text = text.replace(/^>\s+/gm, '');
      
      // Remove horizontal rules
      text = text.replace(/^[-*_]{3,}$/gm, '');
      
      // Remove links but keep text
      text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
      text = text.replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1');
      
      // Remove images but keep alt text
      text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
      
      // Clean up multiple line breaks
      text = text.replace(/\n{3,}/g, '\n\n');
      
      // Clean up extra spaces
      text = text.replace(/[ \t]+/g, ' ');
      
      // Trim and return
      return text.trim();
    }
  
    // Start selection
    startSelectionBtn.addEventListener('click', async () => {
      try {
        hideAll();
        showStatus('Preparing selection mode...', 'success');
        
        // Get active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab) {
          throw new Error('No active tab found');
        }

        // Check if tab URL is valid for script injection
        if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('moz-extension://')) {
          throw new Error('Cannot access this type of page. Please try on a regular webpage.');
        }
        
        // Clear any previous results
        await chrome.runtime.sendMessage({ type: 'clearResult' });
        
        // Test if content script is already loaded by trying to send a message
        let contentScriptLoaded = false;
        try {
          await chrome.tabs.sendMessage(tab.id, { type: 'ping' });
          contentScriptLoaded = true;
        } catch (e) {
          // Content script not loaded, we'll inject it
          console.log('Content script not loaded, will inject');
        }
        
        // Inject content script if not already loaded
        if (!contentScriptLoaded) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['content.js']
            });
            
            // Wait for content script to initialize
            await new Promise(resolve => setTimeout(resolve, 500));
            
          } catch (injectionError) {
            console.error('Error injecting content script:', injectionError);
            throw new Error('Failed to inject content script. Please refresh the page and try again.');
          }
        }
        
        // Try to send message with retry logic
        let attempts = 0;
        const maxAttempts = 3;
        
        while (attempts < maxAttempts) {
          try {
            await chrome.tabs.sendMessage(tab.id, { type: 'initSelection' });
            break; // Success, exit retry loop
          } catch (error) {
            attempts++;
            if (attempts >= maxAttempts) {
              throw new Error('Failed to communicate with page. Please refresh and try again.');
            }
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
        
        showStatus('Click and drag to select text area on the page', 'success');
        
        // Close popup after a short delay so user can see the message
        setTimeout(() => {
          window.close();
        }, 1500);
        
      } catch (error) {
        console.error('Error starting selection:', error);
        showStatus('Error: ' + error.message, 'error');
      }
    });
  
    // Settings button
    settingsBtn.addEventListener('click', () => {
      showSettings();
    });
  
    // Copy result
    copyResultBtn.addEventListener('click', async () => {
      try {
        const fullText = `Extracted Text:\n${textContent.textContent}\n\nAI Analysis:\n${analysisContent.textContent}`;
        await navigator.clipboard.writeText(fullText);
        showStatus('Results copied to clipboard!', 'success');
      } catch (error) {
        showStatus('Failed to copy to clipboard', 'error');
      }
    });
  
    // Clear result
    clearResultBtn.addEventListener('click', async () => {
      try {
        await chrome.runtime.sendMessage({ type: 'clearResult' });
        hideAll();
        showStatus('Results cleared', 'success');
      } catch (error) {
        showStatus('Error clearing results', 'error');
      }
    });
  
    // Poll for results when processing
    function pollForResults() {
      const pollInterval = setInterval(async () => {
        try {
          const response = await chrome.runtime.sendMessage({ type: 'getResult' });
          
          if (!response.isProcessing) {
            clearInterval(pollInterval);
            hideLoading();
            
            if (response.result) {
              if (response.result.error) {
                showStatus(response.result.error, 'error');
              } else {
                showResult(response.result);
              }
            }
          }
        } catch (error) {
          clearInterval(pollInterval);
          hideLoading();
          showStatus('Error checking results', 'error');
        }
      }, 1000);
    }
  
    // Show result with enhanced formatting
    function showResult(result) {
      hideAll();
      textContent.textContent = result.extractedText;
      
      // Convert markdown analysis to plain text
      let plainTextAnalysis = markdownToPlainText(result.analysis);
      
      // Apply additional formatting for better readability
      plainTextAnalysis = formatPlainText(plainTextAnalysis);
      
      analysisContent.innerHTML = plainTextAnalysis;
      resultSection.classList.remove('hidden');
    }
    
    // Format plain text for better display
    function formatPlainText(text) {
      // Split into lines for processing
      let lines = text.split('\n');
      let formattedLines = [];
      
      for (let line of lines) {
        line = line.trim();
        if (!line) {
          formattedLines.push('');
          continue;
        }
        
        // Handle code blocks
        if (line === '--- CODE ---') {
          formattedLines.push('<div style="background-color: #f5f5f5; padding: 10px; margin: 5px 0; border-radius: 4px; font-family: monospace; border-left: 4px solid #007acc;">');
          continue;
        }
        if (line === '--- END CODE ---') {
          formattedLines.push('</div>');
          continue;
        }
        
        // Handle numbered lists
        if (/^\d+\.\s/.test(line)) {
          formattedLines.push(`<div style="margin: 5px 0; padding-left: 20px;">${line}</div>`);
          continue;
        }
        
        // Handle bullet points
        if (line.startsWith('• ')) {
          formattedLines.push(`<div style="margin: 5px 0; padding-left: 20px;">${line}</div>`);
          continue;
        }
        
        // Regular text
        formattedLines.push(`<div style="margin: 8px 0;">${line}</div>`);
      }
      
      return formattedLines.join('');
    }
  
    // Show loading
    function showLoading() {
      hideAll();
      loadingSpinner.classList.remove('hidden');
    }
  
    // Hide loading
    function hideLoading() {
      loadingSpinner.classList.add('hidden');
    }
  
    // Show status
    function showStatus(message, type) {
      hideAll();
      statusElement.textContent = message;
      statusElement.className = `status ${type}`;
      statusElement.classList.remove('hidden');
    }
  
    // Hide all status elements
    function hideAll() {
      statusElement.classList.add('hidden');
      loadingSpinner.classList.add('hidden');
      resultSection.classList.add('hidden');
    }
  
    // Show settings
    function showSettings() {
      const settingsHTML = `
        <div class="settings-overlay" style="
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.5);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <div class="settings-modal" style="
            background: white;
            padding: 20px;
            border-radius: 8px;
            width: 90%;
            max-width: 400px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
          ">
            <div class="settings-header" style="
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 20px;
            ">
              <h3 style="margin: 0;">Settings</h3>
              <button id="closeSettings" style="
                background: none;
                border: none;
                font-size: 20px;
                cursor: pointer;
                padding: 4px;
              ">×</button>
            </div>
            <div class="settings-content">
              <div class="setting-item" style="margin-bottom: 20px;">
                <label for="apiKey" style="
                  display: block;
                  margin-bottom: 8px;
                  font-weight: 500;
                ">Gemini API Key:</label>
                <input type="password" id="apiKey" placeholder="Enter your Gemini API key" style="
                  width: 100%;
                  padding: 8px;
                  border: 1px solid #ddd;
                  border-radius: 4px;
                  margin-bottom: 8px;
                ">
                <small style="color: #666;">
                  Get your API key from <a href="https://makersuite.google.com/app/apikey" target="_blank">Google AI Studio</a>
                </small>
              </div>
              <div class="setting-actions">
                <button id="saveSettings" style="
                  background: #667eea;
                  color: white;
                  border: none;
                  padding: 10px 20px;
                  border-radius: 4px;
                  cursor: pointer;
                  font-weight: 500;
                ">Save</button>
              </div>
            </div>
          </div>
        </div>
      `;
      
      document.body.insertAdjacentHTML('beforeend', settingsHTML);
      
      // Load current API key
      chrome.storage.local.get(['geminiApiKey']).then(result => {
        if (result.geminiApiKey) {
          document.getElementById('apiKey').value = result.geminiApiKey;
        }
      });
      
      // Close settings
      document.getElementById('closeSettings').addEventListener('click', () => {
        document.querySelector('.settings-overlay').remove();
      });
      
      // Save settings
      document.getElementById('saveSettings').addEventListener('click', async () => {
        const apiKey = document.getElementById('apiKey').value.trim();
        if (apiKey) {
          try {
            await chrome.storage.local.set({ geminiApiKey: apiKey });
            showStatus('Settings saved successfully!', 'success');
            document.querySelector('.settings-overlay').remove();
          } catch (error) {
            alert('Error saving settings: ' + error.message);
          }
        } else {
          alert('Please enter a valid API key');
        }
      });
    }
  });