# GIF Editor

A lightweight, powerful, and pure browser-based GIF editor. No server-side processing required—everything happens locally in your browser.

## Features

- **Drag & Drop Upload**: Easily upload any `.gif` file.
- **Frame Trimming & Scrubbing**: Navigate through frames and choose exactly what part of the GIF to keep.
- **Draggable Text Layers**: Add multiple text overlays with modern typography (Inter, Impact, etc.). Drag them directly on the preview to reposition.
- **Dynamic Styling**: Change font size, colors, bold/italic, shadows, and outlines.
- **Real-time Filters**: Apply Brightness, Contrast, Saturation, Grayscale, Sepia, and Invert filters.
- **Padding & Backgrounds**: Add margins to your GIF with custom background colors.
- **High-Quality Export**: Preserves original frame delays and applies all edits to the final rendered GIF.
- **GitHub Pages Ready**: Optimized for static hosting.

## Getting Started

Simply open `index.html` in a modern web browser. 

For the best experience (and to avoid potential local file restrictions for web workers), it's recommended to serve the folder using a local web server:

```bash
npx serve .
```

## Built With

- **HTML5 Canvas**: For frame processing and text rendering.
- **Vanilla CSS**: Clean, minimal, and responsive UI.
- **Vanilla JavaScript**: Core application logic.
- **[omggif](https://github.com/deanm/omggif)**: GIF decoding and frame parsing.
- **[gif.js](https://github.com/jnordberg/gif.js)**: High-performance GIF encoding.

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).
