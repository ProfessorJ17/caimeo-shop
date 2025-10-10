import { beginDrag, endDrag, clamp } from './ui.js';

const gutterSizePx = 6;
const minPanePercent = 15;
const minPreviewHeightPx = 80;
const minEditorHeightPx = 60;
const useAbsoluteRatioDrag = true;
const initialRowsRatio = { top: 3, bottom: 2 };

export function setupVerticalGutter(gutterEl, leftKey, rightKey, panesEl, previewFrame){
  let startX, startLeft, startRight, width;
  const onDown = (e)=>{
    e.preventDefault();
    beginDrag('col-resize', previewFrame);
    const px = e.touches ? e.touches[0].clientX : e.clientX;
    startX = px;
    const cs = getComputedStyle(document.documentElement);
    startLeft = parseFloat(cs.getPropertyValue(leftKey));
    startRight = parseFloat(cs.getPropertyValue(rightKey));
    width = panesEl.getBoundingClientRect().width;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, {passive:false});
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
  };
  const onMove = (e)=>{
    const px = e.touches ? e.touches[0].clientX : e.clientX;
    const dx = ((px - startX) / width) * 100;
    let newLeft = clamp(startLeft + dx, minPanePercent, 100 - minPanePercent - startRight);
    let newRight = clamp(startRight - dx, minPanePercent, 100 - minPanePercent - newLeft);
    document.documentElement.style.setProperty(leftKey, `${newLeft}%`);
    document.documentElement.style.setProperty(rightKey, `${newRight}%`);
    normalizeColumnsExcept([leftKey, rightKey]);
  };
  const onUp = ()=>{
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('touchend', onUp);
    endDrag(previewFrame);
  };
  gutterEl.addEventListener('mousedown', onDown);
  gutterEl.addEventListener('touchstart', onDown, {passive:false});
}

export function setupHorizontalGutter(gutterEl, gridEl, previewFrame){
  let startY, startTopFr, startBottomFr, height, rectTop, rectHeight;
  const onDown = (e)=>{
    e.preventDefault();
    beginDrag('row-resize', previewFrame);
    const py = e.touches ? e.touches[0].clientY : e.clientY;
    startY = py;
    const cs = getComputedStyle(document.documentElement);
    startTopFr = parseFloat(cs.getPropertyValue('--rows-top')) || initialRowsRatio.top;
    startBottomFr = parseFloat(cs.getPropertyValue('--rows-bottom')) || initialRowsRatio.bottom;
    const r = gridEl.getBoundingClientRect(); rectTop = r.top; rectHeight = r.height; height = r.height;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, {passive:false});
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
  };
  const onMove = (e)=>{
    const py = e.touches ? e.touches[0].clientY : e.clientY;
    if (useAbsoluteRatioDrag) {
      const minRatio = Math.min(Math.max(minEditorHeightPx / rectHeight, 0.01), 0.99);
      const maxRatio = Math.max(1 - (minPreviewHeightPx / rectHeight), minRatio);
      let ratio = (py - rectTop) / rectHeight;
      ratio = clamp(ratio, minRatio, maxRatio);
      document.documentElement.style.setProperty('--rows-top', `${ratio}fr`);
      document.documentElement.style.setProperty('--rows-bottom', `${1 - ratio}fr`);
      return;
    }
    const dy = (py - startY) / height;
    let total = startTopFr + startBottomFr;
    const pxPerFr = height / total;
    const minBottomFr = Math.max(minPreviewHeightPx / pxPerFr, 0.25);
    const maxTop = total - minBottomFr;
    let newTop = clamp(startTopFr + dy * total, 0.5, maxTop);
    let newBottom = total - newTop;
    document.documentElement.style.setProperty('--rows-top', `${newTop}fr`);
    document.documentElement.style.setProperty('--rows-bottom', `${newBottom}fr`);
  };
  const onUp = ()=>{
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('touchend', onUp);
    endDrag(previewFrame);
  };
  gutterEl.addEventListener('mousedown', onDown);
  gutterEl.addEventListener('touchstart', onDown, {passive:false});
}

function normalizeColumnsExcept(excludeKeys){
  const doc = document.documentElement;
  const cs = getComputedStyle(doc);
  const keys = ['--c1','--c2','--c3','--c4','--c5'];
  const excludedSum = excludeKeys.reduce((s,k)=> s + (parseFloat(cs.getPropertyValue(k))||0), 0);
  const others = keys.filter(k=>!excludeKeys.includes(k)).map(k=>[k, parseFloat(cs.getPropertyValue(k))||0]).filter(([,v])=>v>0);
  const remain = clamp(100 - excludedSum, 0, 100);
  const share = others.length ? remain / others.length : 0;
  others.forEach(([k])=> doc.style.setProperty(k, `${Math.max(share, minPanePercent)}%`));
}

export function redistributeColumns(){
  const visible = [];
  for (let i=1;i<=5;i++){
    const el = document.querySelector('.pane'+i);
    if (el && el.style.display !== 'none') visible.push(i);
  }
  const share = visible.length ? (100 / visible.length) : 0;
  for (let i=1;i<=5;i++){
    document.documentElement.style.setProperty(`--c${i}`, visible.includes(i) ? `${share}%` : '0%');
  }
  document.documentElement.style.setProperty('--g3', visible.includes(4) ? `${gutterSizePx}px` : '0px');
  document.documentElement.style.setProperty('--g4', visible.includes(5) ? `${gutterSizePx}px` : '0px');
}