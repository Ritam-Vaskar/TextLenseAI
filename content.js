// Content script for TextLens AI
let isSelectionActive = false;
let selectionOverlay = null;
let tesseractLoaded = false;
let lastOutputBox = null;
let lastSelectedRect = null;

// Add styles immediately when script loads
const style = document.createElement('style');
style.textContent = `
  .textlens-selection-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.3);
    z-index: 999999;
    cursor: crosshair;
  }
  
  .textlens-selection-box {
    position: absolute;
    border: 2px dashed #667eea;
    background: rgba(102, 126, 234, 0.1);
    pointer-events: none;
  }

  .textlens-output-box {
    position: absolute;
    background: white;
    padding: 12px;
    border-radius: 10px;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.15);
    max-width: 400px;
    font-size: 14px;
    font-family: Arial, sans-serif;
    white-space: pre-wrap;
    z-index: 1000001;
  }

  .textlens-notification {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
    font-size: 14px;
    font-weight: 500;
    z-index: 1000000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    transition: all 0.3s ease;
  }
  
  .textlens-notification.success {
    background: #10b981;
    color: white;
  }
  
  .textlens-notification.error {
    background: #ef4444;
    color: white;
  }
  
  .textlens-notification.processing {
    background: #3b82f6;
    color: white;
  }
`;
document.head.appendChild(style);

// Check if Tesseract is available (loaded via manifest)
function checkTesseract() {
  return new Promise((resolve, reject) => {
    if (typeof Tesseract !== 'undefined') {
      tesseractLoaded = true;
      resolve();
    } else {
      reject(new Error('Tesseract.js not loaded. Please check extension installation.'));
    }
  });
}

// Listen for messages from popup and background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);

  if (message.type === 'ping') {
    sendResponse({ success: true });

  } else if (message.type === 'initSelection') {
    initializeSelection();
    sendResponse({ success: true });

  } else if (message.type === 'processingComplete') {
    showNotification('Analysis complete! Displaying results...', 'success');
    const combined = `📄 Extracted Text:\n${message.extractedText.trim()}\n\n🔍 Analysis:\n${message.analysis.trim()}`;
    showTextOutput(combined, lastSelectedRect);

  } else if (message.type === 'processingError') {
    showNotification(`Error: ${message.error}`, 'error');

  } else if (message.type === 'performOCR') {
    performOCRInContent(message.imageData)
      .then(text => {
        sendResponse({ success: true, text: text });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  return true;
});

async function performOCRInContent(imageData) {
  try {
    if (!tesseractLoaded) {
      await checkTesseract();
    }

    const { data: { text } } = await Tesseract.recognize(
      imageData,
      'eng',
      {
        logger: m => console.log(m)
      }
    );

    return text;
  } catch (error) {
    console.error('OCR error:', error);
    throw new Error(`OCR failed: ${error.message}`);
  }
}

function initializeSelection() {
  if (isSelectionActive) return;

  isSelectionActive = true;
  selectionOverlay = document.createElement('div');
  selectionOverlay.className = 'textlens-selection-overlay';
  document.body.appendChild(selectionOverlay);

  let startX, startY, isSelecting = false;
  let selectionBox = null;

  selectionOverlay.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;

    selectionBox = document.createElement('div');
    selectionBox.className = 'textlens-selection-box';
    selectionOverlay.appendChild(selectionBox);
  });

  selectionOverlay.addEventListener('mousemove', (e) => {
    if (!isSelecting || !selectionBox) return;

    const currentX = e.clientX;
    const currentY = e.clientY;

    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';
  });

  selectionOverlay.addEventListener('mouseup', async (e) => {
    e.preventDefault();
    isSelecting = false;

    if (selectionBox) {
      const rect = selectionBox.getBoundingClientRect();

      if (rect.width < 10 || rect.height < 10) {
        showNotification('Selection too small. Please select a larger area.', 'error');
        cleanupSelection();
        return;
      }

      try {
        showNotification('Capturing and processing selection...', 'processing');

        const imageData = await captureArea(rect);

        lastSelectedRect = rect;

        chrome.runtime.sendMessage({
          type: 'selectionMade',
          data: { imageData }
        }).catch(error => {
          console.error('Error sending message to background:', error);
          showNotification('Error communicating with background script', 'error');
        });

      } catch (error) {
        console.error('Error processing selection:', error);
        showNotification(`Error: ${error.message}`, 'error');
      }
    }

    cleanupSelection();
  });

  const escapeHandler = (e) => {
    if (e.key === 'Escape' && isSelectionActive) {
      cleanupSelection();
      showNotification('Selection cancelled', 'error');
      document.removeEventListener('keydown', escapeHandler);
    }
  };
  document.addEventListener('keydown', escapeHandler);
}

async function captureArea(rect) {
  try {
    if (selectionOverlay) {
      selectionOverlay.style.display = 'none';
    }

    if (typeof html2canvas === 'undefined') {
      throw new Error('html2canvas library not loaded. Please refresh the page and try again.');
    }

    const canvas = await html2canvas(document.body, {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height,
      useCORS: true,
      allowTaint: true,
      scale: 1,
      backgroundColor: null
    });

    return canvas.toDataURL('image/png');

  } catch (error) {
    console.error('Error capturing area:', error);
    throw new Error('Failed to capture selected area: ' + error.message);
  } finally {
    if (selectionOverlay) {
      selectionOverlay.style.display = 'block';
    }
  }
}

function cleanupSelection() {
  isSelectionActive = false;
  if (selectionOverlay) {
    selectionOverlay.remove();
    selectionOverlay = null;
  }
}

function showNotification(message, type = 'success') {
  const existing = document.querySelectorAll('.textlens-notification');
  existing.forEach(el => el.remove());

  const notification = document.createElement('div');
  notification.className = `textlens-notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
  }, 5000);
}

function showTextOutput(text, rect) {
  if (lastOutputBox) lastOutputBox.remove();

  const outputBox = document.createElement('div');
  outputBox.className = 'textlens-output-box';
  outputBox.style.left = `${rect.left + window.scrollX}px`;
  outputBox.style.top = `${rect.bottom + window.scrollY + 10}px`;
  outputBox.textContent = text;
  document.body.appendChild(outputBox);
  lastOutputBox = outputBox;
}

console.log('TextLens AI content script loaded');
