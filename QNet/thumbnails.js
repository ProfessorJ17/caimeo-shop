export async function createThumbnailFromSource({ html = '', css = '', js = '' }, { width = 224, height = 160 } = {}) {
  const { default: html2canvas } = await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.esm.js');
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;left:-99999px;top:-99999px;width:800px;height:600px;visibility:hidden;';
  document.body.appendChild(iframe);
  const srcdoc = `<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${html}</body><script>${js}<\/script></html>`;
  await new Promise(res => { iframe.onload = res; iframe.srcdoc = srcdoc; });
  const target = iframe.contentDocument?.body || iframe;
  const canvas = await html2canvas(target, { backgroundColor: '#ffffff', scale: 1, windowWidth: 800, windowHeight: 600 });
  const thumb = document.createElement('canvas');
  thumb.width = width; thumb.height = height;
  const ctx = thumb.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,width,height);
  const ratio = Math.min(width / canvas.width, height / canvas.height);
  const dw = canvas.width * ratio, dh = canvas.height * ratio;
  ctx.drawImage(canvas, (width - dw)/2, (height - dh)/2, dw, dh);
  iframe.remove();
  return await new Promise(resolve => thumb.toBlob(b => resolve(URL.createObjectURL(b)), 'image/png'));
}

