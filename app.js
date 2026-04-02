let currentPage = 1, currentFileName = '', currentTheme = '', db, uiTimeout;

// CONFIGURACIÓN DE BASE DE DATOS (INDEXEDDB)
const request = indexedDB.open("LibraryDB", 1);
request.onupgradeneeded = e => e.target.result.createObjectStore("books", { keyPath: "name" });
request.onsuccess = e => { db = e.target.result; updateLibraryUI(); };

// ACTUALIZAR ESTANTERÍA (CON BOTÓN ELIMINAR X)
function updateLibraryUI() {
    if (!db) return;
    db.transaction("books", "readonly").objectStore("books").getAll().onsuccess = e => {
        const list = document.getElementById('books-list');
        list.innerHTML = e.target.result.map((book, index) => `
            <div class="book-item" style="--index: ${index}" onclick="selectBook('${book.name.replace(/'/g, "\\'")}')">
                <span>${book.name}</span>
                <button class="delete-btn" onclick="deleteBook(event, '${book.name.replace(/'/g, "\\'")}')">✕</button>
            </div>
        `).join('');
    };
}

// BUSCADOR DE LA ESTANTERÍA
document.getElementById('lib-search').oninput = (e) => {
    const term = e.target.value.toLowerCase().trim();
    document.querySelectorAll('.book-item').forEach(book => {
        book.style.display = book.textContent.toLowerCase().includes(term) ? 'flex' : 'none';
    });
};

// --- FUNCIONALIDAD DE TECLADO ---
window.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT') return;
    if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") changePage(1);
    if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") changePage(-1);
});

// CARGAR EL PDF EN EL VISOR
async function loadPDFBuffer(buffer, name) {
    currentFileName = name;
    window.pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise;
    currentPage = parseInt(localStorage.getItem(`read_${currentFileName}`)) || 1;
    
    // Mostrar UI solo al cargar libro
    document.getElementById('topbar').style.display = 'flex';
    document.getElementById('empty-viewer').style.display = 'none';
    document.getElementById('pdf-render').style.display = 'block';
    
    await renderPDFPage(currentPage);
}

// RENDERIZADO DE PÁGINA
async function renderPDFPage(num) {
    window.isRendering = true;
    const page = await window.pdfDoc.getPage(num);
    const canvas = document.getElementById('pdf-render');
    const ctx = canvas.getContext('2d');
    const viewport = page.getViewport({ scale: 1.5 });
    
    canvas.height = viewport.height; 
    canvas.width = viewport.width;
    
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    
    // Re-aplicar tonalidad activa
    if (currentTheme) canvas.className = currentTheme;
    
    document.getElementById('page-input').value = num;
    document.getElementById('page-total').textContent = `/ ${window.pdfDoc.numPages}`;
    window.isRendering = false;
}

// CAMBIO DE PÁGINA CON ANIMACIÓN NATURAL
async function changePage(delta) {
    if (!window.pdfDoc || window.isRendering) return;
    if (currentPage + delta < 1 || currentPage + delta > window.pdfDoc.numPages) return;
    
    const canvas = document.getElementById('pdf-render');
    canvas.classList.add(delta > 0 ? 'turn-next' : 'turn-prev');

    setTimeout(async () => {
        currentPage += delta;
        await renderPDFPage(currentPage);
        canvas.classList.remove('turn-next', 'turn-prev');
        localStorage.setItem(`read_${currentFileName}`, currentPage);
    }, 250);
}

// --- CAMBIO DE TONALIDADES ---
document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.onclick = () => {
        currentTheme = btn.getAttribute('data-theme');
        const canvas = document.getElementById('pdf-render');
        if (canvas) canvas.className = currentTheme;
    };
});

// INPUT DE PÁGINA MANUAL
document.getElementById('page-input').onchange = (e) => {
    const val = parseInt(e.target.value);
    if (window.pdfDoc && val >= 1 && val <= window.pdfDoc.numPages) {
        currentPage = val; renderPDFPage(currentPage);
    } else { e.target.value = currentPage; }
};

// LÓGICA DE OCULTAR UI (HIDDEN-UI)
function showUI() {
    document.body.classList.remove('hidden-ui');
    clearTimeout(uiTimeout);
    if (document.fullscreenElement) {
        uiTimeout = setTimeout(() => document.body.classList.add('hidden-ui'), 3000);
    }
}
window.addEventListener('mousemove', showUI);
document.addEventListener('fullscreenchange', showUI);

// BOTONES DE CONTROL INFERIOR
document.getElementById('full-btn').onclick = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
};
document.getElementById('prev-btn').onclick = () => changePage(-1);
document.getElementById('next-btn').onclick = () => changePage(1);

// SUBIR NUEVO PDF
document.getElementById('pdf-upload').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function() {
        const tx = db.transaction("books", "readwrite");
        tx.objectStore("books").put({ name: file.name, data: this.result });
        tx.oncomplete = () => { loadPDFBuffer(this.result, file.name); updateLibraryUI(); };
    };
    reader.readAsArrayBuffer(file);
};

// SELECCIONAR LIBRO DE LA LISTA
function selectBook(name) {
    db.transaction("books", "readonly").objectStore("books").get(name).onsuccess = e => {
        if (e.target.result) loadPDFBuffer(e.target.result.data, name);
    };
}

// --- FUNCIÓN ELIMINAR LIBRO ---
function deleteBook(event, name) {
    event.stopPropagation(); // Evita que se abra el libro al hacer clic en la X
    if (confirm(`¿Eliminar "${name}"?`)) {
        db.transaction("books", "readwrite").objectStore("books").delete(name).onsuccess = () => {
            if (currentFileName === name) location.reload();
            updateLibraryUI();
        };
    }
}