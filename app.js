/* ── GIF Editor — app.js ──────────────────────────
   Pure browser-based GIF editor.
   Dependencies: omggif (GifReader), gif.js (GIF encoder)
─────────────────────────────────────────────────── */

(function () {
  'use strict';

  // ── DOM refs ──────────────────────────────────
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const loadingOverlay = document.getElementById('loading-overlay');
  const previewSection = document.getElementById('preview-section');
  const controlsDiv = document.getElementById('controls');
  const canvas = document.getElementById('preview-canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const metaDimensions = document.getElementById('meta-dimensions');
  const metaFrames = document.getElementById('meta-frames');
  const metaSize = document.getElementById('meta-size');

  const frameScrubber = document.getElementById('frame-scrubber');
  const frameIndicator = document.getElementById('frame-indicator');
  const playPauseBtn = document.getElementById('play-pause-btn');
  const trimStartInput = document.getElementById('trim-start');
  const trimEndInput = document.getElementById('trim-end');

  const addTextBtn = document.getElementById('add-text-btn');
  const textLayersContainer = document.getElementById('text-layers-container');

  const downloadBtn = document.getElementById('download-btn');
  const progressContainer = document.getElementById('progress-container');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');

  // Padding
  const padTop = document.getElementById('pad-top');
  const padRight = document.getElementById('pad-right');
  const padBottom = document.getElementById('pad-bottom');
  const padLeft = document.getElementById('pad-left');
  const padColor = document.getElementById('pad-color');

  // Filters
  const filterBrightness = document.getElementById('filter-brightness');
  const filterContrast = document.getElementById('filter-contrast');
  const filterSaturation = document.getElementById('filter-saturation');
  const filterGrayscale = document.getElementById('filter-grayscale');
  const filterSepia = document.getElementById('filter-sepia');
  const filterInvert = document.getElementById('filter-invert');

  // ── State ─────────────────────────────────────
  let frames = [];       // Array of { imageData: ImageData, delay: number (ms) }
  let gifWidth = 0;
  let gifHeight = 0;
  let currentFrame = 0;
  let playing = false;
  let playTimer = null;
  let textLayers = [];   // Array of text layer config objects
  let textLayerIdCounter = 0;

  // Dragging state
  let dragLayer = null;       // layer being dragged
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let isDragging = false;

  // ── Helpers ───────────────────────────────────
  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function formatBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(2) + ' MB';
  }

  // ── Upload ────────────────────────────────────
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'image/gif') loadGIF(file);
  });
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) loadGIF(fileInput.files[0]);
  });

  function loadGIF(file) {
    show(loadingOverlay);
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        parseGIF(new Uint8Array(e.target.result), file.size);
      } catch (err) {
        hide(loadingOverlay);
        alert('Failed to parse GIF: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ── GIF Parsing (omggif) ──────────────────────
  function parseGIF(buffer, fileSize) {
    const gr = new GifReader(buffer);
    gifWidth = gr.width;
    gifHeight = gr.height;
    frames = [];

    // We need a full canvas to properly composite frames with disposal methods
    const compositeCanvas = document.createElement('canvas');
    compositeCanvas.width = gifWidth;
    compositeCanvas.height = gifHeight;
    const compositeCtx = compositeCanvas.getContext('2d', { willReadFrequently: true });

    // For disposal method handling we need a "previous" snapshot
    let previousImageData = null;

    for (let i = 0; i < gr.numFrames(); i++) {
      const fi = gr.frameInfo(i);
      const delay = Math.max(fi.delay * 10, 20); // delay in ms; GIF stores in centiseconds, min 20ms

      // Decode the frame patch into a temporary array
      const patchData = new Uint8Array(gifWidth * gifHeight * 4);
      gr.decodeAndBlitFrameRGBA(i, patchData);

      // Create ImageData for the patch
      const patchImageData = new ImageData(new Uint8ClampedArray(patchData.buffer), gifWidth, gifHeight);

      // Draw the patch onto the composite canvas
      // We need a temp canvas for the patch because putImageData ignores compositing
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = gifWidth;
      tempCanvas.height = gifHeight;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.putImageData(patchImageData, 0, 0);

      // If disposal is 2 (restore to bg), save state before drawing
      if (fi.disposal === 2) {
        previousImageData = compositeCtx.getImageData(0, 0, gifWidth, gifHeight);
      }

      // Draw only the frame rectangle area
      const frameRect = { x: fi.x, y: fi.y, w: fi.width, h: fi.height };

      const rectCanvas = document.createElement('canvas');
      rectCanvas.width = frameRect.w;
      rectCanvas.height = frameRect.h;
      const rectCtx = rectCanvas.getContext('2d');

      const rectImageData = new ImageData(frameRect.w, frameRect.h);
      for (let y = 0; y < frameRect.h; y++) {
        for (let x = 0; x < frameRect.w; x++) {
          const srcIdx = ((frameRect.y + y) * gifWidth + (frameRect.x + x)) * 4;
          const dstIdx = (y * frameRect.w + x) * 4;
          rectImageData.data[dstIdx] = patchData[srcIdx];
          rectImageData.data[dstIdx + 1] = patchData[srcIdx + 1];
          rectImageData.data[dstIdx + 2] = patchData[srcIdx + 2];
          rectImageData.data[dstIdx + 3] = patchData[srcIdx + 3];
        }
      }
      rectCtx.putImageData(rectImageData, 0, 0);
      compositeCtx.drawImage(rectCanvas, frameRect.x, frameRect.y);

      // Capture the composited frame
      const capturedData = compositeCtx.getImageData(0, 0, gifWidth, gifHeight);
      frames.push({ imageData: capturedData, delay: delay });

      // Handle disposal after capturing
      if (fi.disposal === 2) {
        compositeCtx.clearRect(frameRect.x, frameRect.y, frameRect.w, frameRect.h);
      } else if (fi.disposal === 3 && previousImageData) {
        compositeCtx.putImageData(previousImageData, 0, 0);
      }
    }

    // Update UI
    metaDimensions.textContent = gifWidth + ' × ' + gifHeight;
    metaFrames.textContent = frames.length + ' frames';
    metaSize.textContent = formatBytes(fileSize);

    frameScrubber.max = frames.length - 1;
    frameScrubber.value = 0;
    trimStartInput.max = frames.length - 1;
    trimEndInput.max = frames.length - 1;
    trimStartInput.value = 0;
    trimEndInput.value = frames.length - 1;
    currentFrame = 0;

    show(previewSection);
    show(controlsDiv);
    downloadBtn.disabled = false;
    hide(loadingOverlay);
    hide(document.getElementById('upload-section'));

    renderFrame();
    startPlayback();
  }

  // ── Filters ───────────────────────────────────
  function getFilterValues() {
    return {
      brightness: +filterBrightness.value,
      contrast: +filterContrast.value,
      saturation: +filterSaturation.value,
      grayscale: +filterGrayscale.value,
      sepia: +filterSepia.value,
      invert: +filterInvert.value,
    };
  }

  function applyFilters(imageData) {
    const f = getFilterValues();
    const d = imageData.data;
    const bri = f.brightness / 100;
    const con = f.contrast / 100;
    const sat = f.saturation / 100;
    const grayAmt = f.grayscale / 100;
    const sepiaAmt = f.sepia / 100;
    const invertAmt = f.invert / 100;

    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], g = d[i + 1], b = d[i + 2];

      // Brightness
      r *= bri; g *= bri; b *= bri;

      // Contrast
      r = ((r / 255 - 0.5) * con + 0.5) * 255;
      g = ((g / 255 - 0.5) * con + 0.5) * 255;
      b = ((b / 255 - 0.5) * con + 0.5) * 255;

      // Saturation
      const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = gray + sat * (r - gray);
      g = gray + sat * (g - gray);
      b = gray + sat * (b - gray);

      // Grayscale
      if (grayAmt > 0) {
        const gr2 = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = r + grayAmt * (gr2 - r);
        g = g + grayAmt * (gr2 - g);
        b = b + grayAmt * (gr2 - b);
      }

      // Sepia
      if (sepiaAmt > 0) {
        const sr = 0.393 * r + 0.769 * g + 0.189 * b;
        const sg = 0.349 * r + 0.686 * g + 0.168 * b;
        const sb = 0.272 * r + 0.534 * g + 0.131 * b;
        r = r + sepiaAmt * (sr - r);
        g = g + sepiaAmt * (sg - g);
        b = b + sepiaAmt * (sb - b);
      }

      // Invert
      if (invertAmt > 0) {
        r = r + invertAmt * (255 - r - r);
        g = g + invertAmt * (255 - g - g);
        b = b + invertAmt * (255 - b - b);
      }

      d[i] = clamp(Math.round(r), 0, 255);
      d[i + 1] = clamp(Math.round(g), 0, 255);
      d[i + 2] = clamp(Math.round(b), 0, 255);
    }
    return imageData;
  }

  // ── Padding Helpers ───────────────────────────
  function getPadding() {
    return {
      top: +padTop.value,
      right: +padRight.value,
      bottom: +padBottom.value,
      left: +padLeft.value,
      color: padColor.value,
    };
  }

  // ── Render Frame to Canvas ────────────────────
  function renderFrame() {
    if (frames.length === 0) return;
    const pad = getPadding();
    const totalW = gifWidth + pad.left + pad.right;
    const totalH = gifHeight + pad.top + pad.bottom;
    canvas.width = totalW;
    canvas.height = totalH;

    // Fill padding bg
    ctx.fillStyle = pad.color;
    ctx.fillRect(0, 0, totalW, totalH);

    // Draw the frame image data to a temp canvas, apply filters, then draw
    const tmp = document.createElement('canvas');
    tmp.width = gifWidth;
    tmp.height = gifHeight;
    const tctx = tmp.getContext('2d');

    // Clone imageData so we don't mutate original
    const orig = frames[currentFrame].imageData;
    const cloned = new ImageData(new Uint8ClampedArray(orig.data), gifWidth, gifHeight);
    const filtered = applyFilters(cloned);
    tctx.putImageData(filtered, 0, 0);

    ctx.drawImage(tmp, pad.left, pad.top);

    // Draw text layers
    drawTextLayers(ctx, pad.left, pad.top);

    // Update indicators
    frameIndicator.textContent = 'Frame ' + (currentFrame + 1) + ' / ' + frames.length;
    frameScrubber.value = currentFrame;
  }

  // ── Text Layer Rendering ──────────────────────
  function getTextDrawX(layer) {
    // Returns the x position within the GIF coordinate space based on alignment
    if (layer.align === 'center') return gifWidth / 2;
    if (layer.align === 'right') return gifWidth;
    return layer.x || 0; // 'left' uses explicit x
  }

  function drawTextLayers(context, offsetX, offsetY) {
    textLayers.forEach(layer => {
      const fontSize = layer.fontSize || 24;
      let fontStr = '';
      if (layer.italic) fontStr += 'italic ';
      if (layer.bold) fontStr += 'bold ';
      fontStr += fontSize + 'px ' + (layer.fontFamily || 'Inter');
      context.font = fontStr;
      context.textAlign = layer.align || 'left';
      context.textBaseline = 'top';

      const drawX = getTextDrawX(layer);
      const x = offsetX + drawX;
      const y = offsetY + (layer.y || 0);
      const text = layer.text || '';

      // Shadow
      if (layer.shadow) {
        context.shadowColor = 'rgba(0,0,0,0.5)';
        context.shadowBlur = layer.shadowBlur || 4;
        context.shadowOffsetX = 2;
        context.shadowOffsetY = 2;
      } else {
        context.shadowColor = 'transparent';
        context.shadowBlur = 0;
        context.shadowOffsetX = 0;
        context.shadowOffsetY = 0;
      }

      // Stroke / outline
      if (layer.stroke) {
        context.strokeStyle = layer.strokeColor || '#000000';
        context.lineWidth = layer.strokeWidth || 2;
        context.lineJoin = 'round';
        context.strokeText(text, x, y);
      }

      // Fill
      context.fillStyle = layer.color || '#ffffff';
      context.fillText(text, x, y);

      // Reset shadow
      context.shadowColor = 'transparent';
      context.shadowBlur = 0;
    });
  }

  // ── Text Hit Testing (for drag) ───────────────
  function getCanvasMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function hitTestTextLayer(mx, my) {
    const pad = getPadding();
    // Check layers in reverse order (topmost first)
    for (let i = textLayers.length - 1; i >= 0; i--) {
      const layer = textLayers[i];
      const fontSize = layer.fontSize || 24;
      let fontStr = '';
      if (layer.italic) fontStr += 'italic ';
      if (layer.bold) fontStr += 'bold ';
      fontStr += fontSize + 'px ' + (layer.fontFamily || 'Inter');
      ctx.font = fontStr;

      const text = layer.text || '';
      const metrics = ctx.measureText(text);
      const textW = metrics.width;
      const textH = fontSize; // approximate

      const drawX = getTextDrawX(layer);
      let left = pad.left + drawX;
      const top = pad.top + (layer.y || 0);

      // Adjust left based on alignment
      if (layer.align === 'center') left -= textW / 2;
      else if (layer.align === 'right') left -= textW;

      if (mx >= left && mx <= left + textW && my >= top && my <= top + textH) {
        return layer;
      }
    }
    return null;
  }

  // ── Canvas Drag Events ────────────────────────
  canvas.addEventListener('mousedown', e => {
    if (frames.length === 0) return;
    const pos = getCanvasMousePos(e);
    const layer = hitTestTextLayer(pos.x, pos.y);
    if (layer) {
      isDragging = true;
      dragLayer = layer;
      const pad = getPadding();
      const drawX = getTextDrawX(layer);
      dragOffsetX = pos.x - (pad.left + drawX);
      dragOffsetY = pos.y - (pad.top + (layer.y || 0));
      canvas.style.cursor = 'grabbing';
      e.preventDefault();
    }
  });

  canvas.addEventListener('mousemove', e => {
    if (frames.length === 0) return;
    const pos = getCanvasMousePos(e);

    if (isDragging && dragLayer) {
      const pad = getPadding();
      const newX = pos.x - pad.left - dragOffsetX;
      const newY = pos.y - pad.top - dragOffsetY;

      // For left alignment, set x directly
      // For center/right, we override the alignment to 'left' so drag is intuitive
      dragLayer.align = 'left';
      dragLayer.x = Math.round(newX);
      dragLayer.y = Math.round(newY);

      // Update the UI card inputs
      updateLayerCardInputs(dragLayer);
      renderFrame();
    } else {
      // Show grab cursor when hovering over a text layer
      const layer = hitTestTextLayer(pos.x, pos.y);
      canvas.style.cursor = layer ? 'grab' : 'default';
    }
  });

  canvas.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      dragLayer = null;
      canvas.style.cursor = 'default';
    }
  });

  canvas.addEventListener('mouseleave', () => {
    if (isDragging) {
      isDragging = false;
      dragLayer = null;
      canvas.style.cursor = 'default';
    }
  });

  // Update the UI card inputs to reflect programmatic changes
  function updateLayerCardInputs(layer) {
    const card = textLayersContainer.querySelector(`[data-layer-id="${layer.id}"]`);
    if (!card) return;
    const xInput = card.querySelector('[data-prop="x"]');
    const yInput = card.querySelector('[data-prop="y"]');
    const alignSelect = card.querySelector('[data-prop="align"]');
    if (xInput) xInput.value = layer.x;
    if (yInput) yInput.value = layer.y;
    if (alignSelect) alignSelect.value = layer.align;
  }

  // ── Playback ──────────────────────────────────
  function startPlayback() {
    playing = true;
    playPauseBtn.textContent = '⏸';
    scheduleNextFrame();
  }

  function stopPlayback() {
    playing = false;
    playPauseBtn.textContent = '▶';
    if (playTimer) { clearTimeout(playTimer); playTimer = null; }
  }

  function scheduleNextFrame() {
    if (!playing || frames.length === 0) return;
    const start = +trimStartInput.value;
    const end = +trimEndInput.value;
    const delay = frames[currentFrame].delay;
    playTimer = setTimeout(() => {
      currentFrame++;
      if (currentFrame > end) currentFrame = start;
      if (currentFrame < start) currentFrame = start;
      renderFrame();
      scheduleNextFrame();
    }, delay);
  }

  playPauseBtn.addEventListener('click', () => {
    if (playing) stopPlayback(); else startPlayback();
  });

  frameScrubber.addEventListener('input', () => {
    stopPlayback();
    currentFrame = +frameScrubber.value;
    renderFrame();
  });

  trimStartInput.addEventListener('change', () => {
    let v = +trimStartInput.value;
    v = clamp(v, 0, frames.length - 1);
    if (v > +trimEndInput.value) v = +trimEndInput.value;
    trimStartInput.value = v;
    if (currentFrame < v) { currentFrame = v; renderFrame(); }
  });
  trimEndInput.addEventListener('change', () => {
    let v = +trimEndInput.value;
    v = clamp(v, 0, frames.length - 1);
    if (v < +trimStartInput.value) v = +trimStartInput.value;
    trimEndInput.value = v;
    if (currentFrame > v) { currentFrame = v; renderFrame(); }
  });

  // ── Padding & Filter Listeners ────────────────
  [padTop, padRight, padBottom, padLeft, padColor].forEach(el => {
    el.addEventListener('input', () => {
      document.getElementById('pad-top-val').textContent = padTop.value;
      document.getElementById('pad-right-val').textContent = padRight.value;
      document.getElementById('pad-bottom-val').textContent = padBottom.value;
      document.getElementById('pad-left-val').textContent = padLeft.value;
      renderFrame();
    });
  });

  const filterElements = [
    { el: filterBrightness, val: 'brightness-val', def: 100 },
    { el: filterContrast, val: 'contrast-val', def: 100 },
    { el: filterSaturation, val: 'saturation-val', def: 100 },
    { el: filterGrayscale, val: 'grayscale-val', def: 0 },
    { el: filterSepia, val: 'sepia-val', def: 0 },
    { el: filterInvert, val: 'invert-val', def: 0 },
  ];

  filterElements.forEach(f => {
    f.el.addEventListener('input', () => {
      document.getElementById(f.val).textContent = f.el.value;
      renderFrame();
    });
  });

  document.querySelectorAll('.reset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const filterName = btn.dataset.filter;
      const fe = filterElements.find(f => f.val === filterName + '-val');
      if (fe) { fe.el.value = fe.def; document.getElementById(fe.val).textContent = fe.def; renderFrame(); }
    });
  });

  // ── Text Layer Management ─────────────────────
  addTextBtn.addEventListener('click', () => {
    const id = textLayerIdCounter++;
    const layer = {
      id,
      text: 'Your text',
      fontFamily: 'Inter',
      fontSize: 24,
      color: '#ffffff',
      align: 'left',
      x: 10,
      y: 10,
      bold: false,
      italic: false,
      shadow: false,
      shadowBlur: 4,
      stroke: false,
      strokeColor: '#000000',
      strokeWidth: 2,
    };
    textLayers.push(layer);
    createTextLayerUI(layer);
    renderFrame();
  });

  function createTextLayerUI(layer) {
    const card = document.createElement('div');
    card.className = 'text-layer-card';
    card.dataset.layerId = layer.id;

    card.innerHTML = `
      <div class="layer-header">
        <span class="layer-title">Text Layer ${layer.id + 1}</span>
        <button class="delete-layer-btn" data-id="${layer.id}">✕ Remove</button>
      </div>
      <div class="layer-grid">
        <label class="full-width">Text
          <input type="text" data-prop="text" value="${layer.text}">
        </label>
        <label>Font
          <select data-prop="fontFamily">
            <optgroup label="Sans-Serif">
              <option value="Inter" ${layer.fontFamily === 'Inter' ? 'selected' : ''}>Inter</option>
              <option value="Arial" ${layer.fontFamily === 'Arial' ? 'selected' : ''}>Arial</option>
              <option value="Roboto" ${layer.fontFamily === 'Roboto' ? 'selected' : ''}>Roboto</option>
              <option value="Outfit" ${layer.fontFamily === 'Outfit' ? 'selected' : ''}>Outfit</option>
              <option value="Poppins" ${layer.fontFamily === 'Poppins' ? 'selected' : ''}>Poppins</option>
              <option value="Montserrat" ${layer.fontFamily === 'Montserrat' ? 'selected' : ''}>Montserrat</option>
              <option value="Oswald" ${layer.fontFamily === 'Oswald' ? 'selected' : ''}>Oswald</option>
              <option value="Raleway" ${layer.fontFamily === 'Raleway' ? 'selected' : ''}>Raleway</option>
              <option value="Verdana" ${layer.fontFamily === 'Verdana' ? 'selected' : ''}>Verdana</option>
            </optgroup>
            <optgroup label="Serif">
              <option value="Georgia" ${layer.fontFamily === 'Georgia' ? 'selected' : ''}>Georgia</option>
              <option value="Playfair Display" ${layer.fontFamily === 'Playfair Display' ? 'selected' : ''}>Playfair Display</option>
              <option value="Times New Roman" ${layer.fontFamily === 'Times New Roman' ? 'selected' : ''}>Times New Roman</option>
            </optgroup>
            <optgroup label="Monospace">
              <option value="Courier New" ${layer.fontFamily === 'Courier New' ? 'selected' : ''}>Courier New</option>
            </optgroup>
            <optgroup label="Display & Handwriting">
              <option value="Lobster" ${layer.fontFamily === 'Lobster' ? 'selected' : ''}>Lobster</option>
              <option value="Bebas Neue" ${layer.fontFamily === 'Bebas Neue' ? 'selected' : ''}>Bebas Neue</option>
              <option value="Pacifico" ${layer.fontFamily === 'Pacifico' ? 'selected' : ''}>Pacifico</option>
              <option value="Permanent Marker" ${layer.fontFamily === 'Permanent Marker' ? 'selected' : ''}>Permanent Marker</option>
              <option value="Caveat" ${layer.fontFamily === 'Caveat' ? 'selected' : ''}>Caveat</option>
              <option value="Bangers" ${layer.fontFamily === 'Bangers' ? 'selected' : ''}>Bangers</option>
            </optgroup>
          </select>
        </label>
        <label>Size (px)
          <input type="number" data-prop="fontSize" value="${layer.fontSize}" min="6" max="200">
        </label>
        <label>Color
          <input type="color" data-prop="color" value="${layer.color}">
        </label>
        <label>Align
          <select data-prop="align">
            <option value="left" ${layer.align === 'left' ? 'selected' : ''}>Left</option>
            <option value="center" ${layer.align === 'center' ? 'selected' : ''}>Center</option>
            <option value="right" ${layer.align === 'right' ? 'selected' : ''}>Right</option>
          </select>
        </label>
        <label>X
          <input type="number" data-prop="x" value="${layer.x}">
        </label>
        <label>Y
          <input type="number" data-prop="y" value="${layer.y}">
        </label>
      </div>
      <div class="style-toggles">
        <label><input type="checkbox" data-prop="bold" ${layer.bold ? 'checked' : ''}> Bold</label>
        <label><input type="checkbox" data-prop="italic" ${layer.italic ? 'checked' : ''}> Italic</label>
        <label><input type="checkbox" data-prop="shadow" ${layer.shadow ? 'checked' : ''}> Shadow</label>
        <label>Blur <input type="number" data-prop="shadowBlur" value="${layer.shadowBlur}" min="0" max="50" style="width:45px"></label>
        <label><input type="checkbox" data-prop="stroke" ${layer.stroke ? 'checked' : ''}> Outline</label>
        <label>Color <input type="color" data-prop="strokeColor" value="${layer.strokeColor}"></label>
        <label>Width <input type="number" data-prop="strokeWidth" value="${layer.strokeWidth}" min="1" max="20" style="width:45px"></label>
      </div>
      <p class="drag-hint">💡 Drag text directly on the preview canvas to reposition</p>
    `;
    textLayersContainer.appendChild(card);

    // Bind events
    card.querySelector('.delete-layer-btn').addEventListener('click', () => {
      textLayers = textLayers.filter(l => l.id !== layer.id);
      card.remove();
      renderFrame();
    });

    card.querySelectorAll('[data-prop]').forEach(input => {
      const prop = input.dataset.prop;
      const eventType = (input.type === 'checkbox' || input.tagName === 'SELECT') ? 'change' : 'input';
      input.addEventListener(eventType, () => {
        const target = textLayers.find(l => l.id === layer.id);
        if (!target) return;
        if (input.type === 'checkbox') {
          target[prop] = input.checked;
        } else if (input.type === 'number') {
          target[prop] = +input.value;
        } else {
          target[prop] = input.value;
        }

        // When alignment changes, auto-position X
        if (prop === 'align') {
          const xInput = card.querySelector('[data-prop="x"]');
          // For center and right, X is handled automatically by getTextDrawX
          // so we set x to 0 and disable the X input to avoid confusion
          if (target.align === 'center' || target.align === 'right') {
            target.x = 0;
            if (xInput) { xInput.value = 0; xInput.disabled = true; }
          } else {
            if (xInput) xInput.disabled = false;
          }
        }

        renderFrame();
      });
    });
  }

  // ── Export / Download ─────────────────────────
  downloadBtn.addEventListener('click', () => {
    if (frames.length === 0) return;

    const start = +trimStartInput.value;
    const end = +trimEndInput.value;
    const pad = getPadding();
    const totalW = gifWidth + pad.left + pad.right;
    const totalH = gifHeight + pad.top + pad.bottom;

    show(progressContainer);
    progressBar.style.setProperty('--progress', '0%');
    progressText.textContent = '0%';
    downloadBtn.disabled = true;

    const gif = new GIF({
      workers: 2,
      quality: 10,
      width: totalW,
      height: totalH,
      workerScript: 'gif.worker.js',
    });

    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = totalW;
    tmpCanvas.height = totalH;
    const tmpCtx = tmpCanvas.getContext('2d', { willReadFrequently: true });

    for (let i = start; i <= end; i++) {
      // Build each frame with all edits
      tmpCtx.clearRect(0, 0, totalW, totalH);
      tmpCtx.fillStyle = pad.color;
      tmpCtx.fillRect(0, 0, totalW, totalH);

      // Apply filters to a copy of the frame
      const orig = frames[i].imageData;
      const cloned = new ImageData(new Uint8ClampedArray(orig.data), gifWidth, gifHeight);
      const filtered = applyFilters(cloned);

      const fCanvas = document.createElement('canvas');
      fCanvas.width = gifWidth;
      fCanvas.height = gifHeight;
      const fCtx = fCanvas.getContext('2d');
      fCtx.putImageData(filtered, 0, 0);

      tmpCtx.drawImage(fCanvas, pad.left, pad.top);

      // Text layers
      drawTextLayers(tmpCtx, pad.left, pad.top);

      gif.addFrame(tmpCtx, { copy: true, delay: frames[i].delay });
    }

    gif.on('progress', p => {
      const pct = Math.round(p * 100);
      progressBar.style.setProperty('--progress', pct + '%');
      progressText.textContent = pct + '%';
    });

    gif.on('finished', blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'edited.gif';
      a.click();
      URL.revokeObjectURL(url);
      hide(progressContainer);
      downloadBtn.disabled = false;
    });

    gif.render();
  });

})();
