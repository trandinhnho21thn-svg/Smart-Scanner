/**
 * Smart Scanner App - Core Logic
 */

// State Management
let state = {
    scannedData: JSON.parse(localStorage.getItem('scannedData') || '[]'),
    currentWaybill: {
        waybill: '',
        sender: '',
        phone: '',
        address: '',
        date: ''
    },
    currentProducts: [], // Array of { serial, image }
    isCaptured: false,
    selectedField: null,
    startX: 0,
    startY: 0,
    isDrawing: false,
    capturedImage: null, // Base64 or Blob
    capturedProductImage: null
};

// DOM Elements
const elements = {
    reader: document.getElementById('reader'),
    cropCanvas: document.getElementById('crop-canvas'),
    productCanvas: document.getElementById('product-canvas'),
    selectionOverlay: document.getElementById('selection-overlay'),
    btnCapture: document.getElementById('btn-capture'),
    btnRetake: document.getElementById('btn-retake'),
    ocrToolbar: document.getElementById('ocr-toolbar'),
    productOcrToolbar: document.getElementById('product-ocr-toolbar'),
    btnCaptureProduct: document.getElementById('btn-capture-product'),
    loading: document.getElementById('loading'),
    loadingText: document.getElementById('loading-text'),
    dataBody: document.querySelector('#data-table tbody'),
    scanCount: document.getElementById('scan-count'),
    // Inputs
    inputWaybill: document.getElementById('input-waybill'),
    inputSender: document.getElementById('input-sender'),
    inputPhone: document.getElementById('input-phone'),
    inputAddress: document.getElementById('input-address'),
    inputSerial: document.getElementById('input-serial'),
    imgProductPreview: document.getElementById('img-product-preview'),
    productPreview: document.getElementById('product-preview')
};

// Initialize Html5Qrcode
const html5QrCode = new Html5Qrcode("reader");
const qrConfig = { fps: 10, qrbox: { width: 250, height: 250 } };

async function startCamera() {
    try {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
            // Prefer back camera
            const backCamera = devices.find(d => d.label.toLowerCase().includes('back')) || devices[0];
            await html5QrCode.start(backCamera.id, qrConfig, (decodedText) => {
                // We won't use auto-scan for now as user wants targeted scanning, 
                // but it's good to have for general QR.
            });
        }
    } catch (err) {
        console.error("Camera error:", err);
    }
}

// Capture Frame
elements.btnCapture.addEventListener('click', () => {
    captureFrame(elements.cropCanvas, elements.reader);
    state.isCaptured = true;
    elements.btnCapture.classList.add('hidden');
    elements.btnRetake.classList.remove('hidden');
    elements.ocrToolbar.classList.remove('hidden');
    elements.cropCanvas.style.display = 'block';
});

elements.btnRetake.addEventListener('click', () => {
    state.isCaptured = false;
    elements.btnCapture.classList.remove('hidden');
    elements.btnRetake.classList.add('hidden');
    elements.ocrToolbar.classList.add('hidden');
    elements.cropCanvas.style.display = 'none';
    elements.selectionOverlay.innerHTML = '';
});

function captureFrame(canvas, source) {
    const video = source.querySelector('video');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    state.capturedImage = canvas.toDataURL('image/jpeg');
}

// ROI Selection Logic
elements.ocrToolbar.addEventListener('click', (e) => {
    if (e.target.classList.contains('ocr-btn')) {
        document.querySelectorAll('.ocr-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        state.selectedField = e.target.dataset.field;
        alert(`Bây giờ hãy khoanh vùng "${e.target.innerText}" trên ảnh.`);
    }
});

// Global selection handler
function setupCanvas(canvas) {
    canvas.addEventListener('mousedown', startSelection);
    canvas.addEventListener('mousemove', drawSelection);
    canvas.addEventListener('mouseup', endSelection);

    // Mobile touch support
    canvas.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const mouseEvent = new MouseEvent("mousedown", {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        canvas.dispatchEvent(mouseEvent);
    }, {passive: false});

    canvas.addEventListener('touchmove', (e) => {
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent("mousemove", {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        canvas.dispatchEvent(mouseEvent);
    }, {passive: false});

    canvas.addEventListener('touchend', (e) => {
        const mouseEvent = new MouseEvent("mouseup", {});
        canvas.dispatchEvent(mouseEvent);
    }, {passive: false});
}

setupCanvas(elements.cropCanvas);
setupCanvas(elements.productCanvas);

function startSelection(e) {
    if (!state.selectedField) return;
    state.isDrawing = true;
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    state.startX = (e.clientX - rect.left) * (canvas.width / rect.width);
    state.startY = (e.clientY - rect.top) * (canvas.height / rect.height);
}

function drawSelection(e) {
    if (!state.isDrawing) return;
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    const currentX = (e.clientX - rect.left);
    const currentY = (e.clientY - rect.top);
    
    let box = document.getElementById('temp-box');
    if (!box) {
        box = document.createElement('div');
        box.id = 'temp-box';
        box.className = 'selection-box';
        elements.selectionOverlay.appendChild(box);
    }
    
    const startDisplayX = (state.startX * rect.width / canvas.width);
    const startDisplayY = (state.startY * rect.height / canvas.height);
    
    box.style.left = (Math.min(startDisplayX, currentX) + rect.left - elements.reader.getBoundingClientRect().left) + 'px';
    box.style.top = (Math.min(startDisplayY, currentY) + rect.top - elements.reader.getBoundingClientRect().top) + 'px';
    box.style.width = Math.abs(currentX - startDisplayX) + 'px';
    box.style.height = Math.abs(currentY - startDisplayY) + 'px';
}

async function endSelection(e) {
    if (!state.isDrawing) return;
    state.isDrawing = false;
    
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    
    // We need the clientX/Y from the mouseup event, but it might not be there if it's touch
    // So we use a fallback or track it in move
    // For simplicity, let's assume we have it
    const endX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const endY = (e.clientY - rect.top) * (canvas.height / rect.height);
    
    const x = Math.min(state.startX, endX);
    const y = Math.min(state.startY, endY);
    const w = Math.abs(endX - state.startX);
    const h = Math.abs(endY - state.startY);
    
    if (w < 10 || h < 10) return;

    processCrop(canvas, x, y, w, h, state.selectedField);
    const box = document.getElementById('temp-box');
    if (box) box.remove();
}

async function processCrop(canvas, x, y, w, h, field) {
    showLoading(`Đang quét ${field}...`);
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(canvas, x, y, w, h, 0, 0, w, h);
    const cropDataUrl = tempCanvas.toDataURL('image/jpeg');

    try {
        if (field === 'waybill') {
            // Try Barcode first
            try {
                const result = await html5QrCode.scanImage(tempCanvas, false);
                elements.inputWaybill.value = result;
                hideLoading();
                return;
            } catch (qrErr) {
                // Fallback to OCR if barcode fails
                console.log("Barcode not found, trying OCR...");
            }
        }

        // Tesseract OCR
        const result = await Tesseract.recognize(cropDataUrl, 'vie+eng', {
            logger: m => console.log(m)
        });
        
        const text = result.data.text.trim();
        updateFieldValue(field, text);
        
    } catch (err) {
        console.error("Processing error:", err);
        alert("Không thể nhận diện được thông tin. Vui lòng thử lại vùng khác hoặc nhập tay.");
    }
    
    hideLoading();
}

function updateFieldValue(field, text) {
    switch(field) {
        case 'waybill': elements.inputWaybill.value = text; break;
        case 'sender': elements.inputSender.value = text; break;
        case 'phone': elements.inputPhone.value = text.replace(/[^0-9]/g, ''); break;
        case 'address': elements.inputAddress.value = text; break;
        case 'serial': elements.inputSerial.value = text; break;
    }
}

// Product Scan Logic
elements.btnCaptureProduct.addEventListener('click', () => {
    captureFrame(elements.productCanvas, elements.reader);
    elements.productCanvas.style.display = 'block';
    elements.productOcrToolbar.classList.remove('hidden');
    state.capturedProductImage = elements.productCanvas.toDataURL('image/jpeg');
    
    // Auto-select serial field for product canvas
    state.selectedField = 'serial';
});

// Data Save Logic
document.getElementById('btn-save-product').addEventListener('click', () => {
    const waybill = elements.inputWaybill.value;
    if (!waybill) {
        alert("Vui lòng quét mã vận đơn trước!");
        return;
    }

    const item = {
        date: new Date().toLocaleDateString('vi-VN'),
        waybill: elements.inputWaybill.value,
        sender: elements.inputSender.value,
        phone: elements.inputPhone.value,
        address: elements.inputAddress.value,
        serial: elements.inputSerial.value,
        image: state.capturedProductImage
    };

    state.scannedData.push(item);
    localStorage.setItem('scannedData', JSON.stringify(state.scannedData));
    
    renderTable();
    
    // Clear product fields but keep waybill info
    elements.inputSerial.value = '';
    elements.productCanvas.style.display = 'none';
    elements.productOcrToolbar.classList.add('hidden');
    elements.productPreview.classList.add('hidden');
    alert("Đã lưu sản phẩm. Tiếp tục quét sản phẩm tiếp theo cho mã này.");
});

document.getElementById('btn-finish-waybill').addEventListener('click', () => {
    // Clear all inputs for new waybill
    elements.inputWaybill.value = '';
    elements.inputSender.value = '';
    elements.inputPhone.value = '';
    elements.inputAddress.value = '';
    elements.inputSerial.value = '';
    elements.cropCanvas.style.display = 'none';
    elements.btnRetake.click(); // Reset scanner
    alert("Đã hoàn tất mã vận đơn này. Sẵn sàng quét mã mới.");
});

// Table Rendering
function renderTable() {
    elements.dataBody.innerHTML = '';
    state.scannedData.forEach((item, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.date}</td>
            <td>${item.waybill}</td>
            <td>${item.sender}</td>
            <td>${item.phone}</td>
            <td>${item.address}</td>
            <td>${item.serial}</td>
            <td class="img-cell"><img src="${item.image || ''}" alt="Product"></td>
        `;
        elements.dataBody.appendChild(row);
    });
    elements.scanCount.innerText = state.scannedData.length;
}

// Export Logic
document.getElementById('btn-export-xlsx').addEventListener('click', () => {
    if (state.scannedData.length === 0) return alert("Không có dữ liệu để xuất!");
    
    const ws = XLSX.utils.json_to_sheet(state.scannedData.map(item => ({
        "Ngày nhận": item.date,
        "Mã vận đơn": item.waybill,
        "Người gửi": item.sender,
        "Số điện thoại": item.phone,
        "Địa chỉ": item.address,
        "Seri sản phẩm": item.serial
    })));
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ScannedData");
    XLSX.writeFile(wb, `Scan_Report_${new Date().getTime()}.xlsx`);
});

document.getElementById('btn-export-pdf').addEventListener('click', async () => {
    if (state.scannedData.length === 0) return alert("Không có dữ liệu để xuất!");
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    
    // Calculate max images
    let maxImages = 1;
    state.scannedData.forEach(item => {
        const count = (item.images ? item.images.length : (item.image ? 1 : 0));
        if (count > maxImages) maxImages = count;
    });

    const head = [['STT', 'Ngay', 'Ma VD', 'Nguoi gui', 'Dia chi', 'SDT', 'Seri']];
    for (let i = 1; i <= maxImages; i++) {
        head[0].push(`Anh ${i}`);
    }

    const tableData = state.scannedData.map((item, idx) => {
        const row = [
            idx + 1, 
            item.date, 
            item.waybill, 
            item.sender, 
            item.address, 
            item.phone, 
            item.serial
        ];
        for (let i = 0; i < maxImages; i++) row.push('');
        return row;
    });
    
    doc.setFontSize(18);
    doc.text("BAO CAO QUET MA VAN DON & SAN PHAM", 14, 15);
    
    doc.autoTable({
        head: head,
        body: tableData,
        startY: 25,
        theme: 'grid',
        styles: { fontSize: 7, verticalAlign: 'middle' },
        headStyles: { fillColor: [99, 102, 241], halign: 'center' },
        didDrawCell: (data) => {
            if (data.section === 'body' && data.column.index >= 7) {
                const rowIndex = data.row.index;
                const item = state.scannedData[rowIndex];
                const images = item.images || (item.image ? [item.image] : []);
                const imgIdx = data.column.index - 7;
                
                if (images[imgIdx] && images[imgIdx].length > 10 && images[imgIdx] !== 'data:,') {
                    try {
                        doc.addImage(images[imgIdx], 'JPEG', data.cell.x + 1, data.cell.y + 1, data.cell.width - 2, data.cell.height - 2, undefined, 'FAST');
                    } catch (e) { console.error("PDF Image Error:", e); }
                }
            }
        },
        bodyStyles: { minCellHeight: 15 }
    });

    doc.save(`Scan_Report_${new Date().getTime()}.pdf`);
});

document.getElementById('btn-clear-all').addEventListener('click', () => {
    if (confirm("Bạn có chắc chắn muốn xóa tất cả dữ liệu đã quét?")) {
        state.scannedData = [];
        localStorage.removeItem('scannedData');
        renderTable();
    }
});

// Utils
function showLoading(text) {
    elements.loadingText.innerText = text;
    elements.loading.classList.remove('hidden');
}

function hideLoading() {
    elements.loading.classList.add('hidden');
}

// Startup
startCamera();
renderTable();
