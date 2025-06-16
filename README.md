# TextLens AI Chrome Extension

A Chrome extension that allows users to extract and analyze non-copyable text using OCR and AI technology.

## Features

- Select any area containing non-copyable text on webpage
- Extract text using Tesseract.js OCR
- Analyze extracted text using AI models
- Clean and intuitive user interface

## Installation

1. Clone this repository or download the source code
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the extension directory

## Configuration

Before using the extension, you need to:

1. Set up your preferred AI API endpoint in `content.js`
2. Add your API key in the appropriate configuration

## Usage

1. Click the TextLens AI icon in your Chrome toolbar
2. Click "Start Selection" button
3. Draw a selection box around the text you want to analyze
4. Wait for the OCR and AI analysis results

## Development

### Project Structure

```
TextLenseAI/
├── manifest.json        # Extension configuration
├── popup.html          # Extension popup interface
├── popup.js            # Popup functionality
├── content.js          # Content script for webpage interaction
├── styles.css          # Styling for extension UI
└── assets/             # Extension icons
    ├── icon16.svg
    ├── icon48.svg
    └── icon128.svg
```

### Technologies Used

- Tesseract.js for OCR
- Chrome Extension APIs
- AI Model API (configurable)

## Contributing

Feel free to submit issues, fork the repository, and create pull requests for any improvements.

## License

MIT License - feel free to use this project for personal or commercial purposes.