// ============================================================
//  @LaClaraTV - Script (SOLO CORRECCIONES)
//  No se cambia estructura, solo se arreglan bugs
// ============================================================

const bibliotecaDefault = [
    { id: "bamper-central-1", titulo: "Bumper Central 1", bloque: "bumper", peso: 12, tipo: "archive", duracion: 15000 },
    { id: "bamper-2", titulo: "Bumper Central 2", bloque: "bumper", peso: 12, tipo: "archive", duracion: 15000 },
    { id: "bamper-3", titulo: "Bumper Central 3", bloque: "bumper", peso: 12, tipo: "archive", duracion: 15000 },
    { id: "las-fallas-de-la-arqueologia", titulo: "Las Fallas De La Arqueologia", bloque: "ciencia", peso: 12, tipo: "archive" },
    { id: "astronomia-vieja-impostora", titulo: "Astronomia Vieja Impostora", bloque: "ciencia", peso: 12, tipo: "archive" },
    { id: "antartida-la-tierra-prohibida-aportes-la-claraboya", titulo: "Antartida La Tierra Prohibida Aportes La Claraboya", bloque: "ciencia", peso: 12, tipo: "archive" },
    { id: "la-rueda-de-samsara", titulo: "La Rueda de Samsara", bloque: "espiritualidad", peso: 12, tipo: "archive" },
    { id: "TheSecretLandHighJump194769min", titulo: "The Secret Land (Operacion Highjump)", bloque: "misterio", peso: 9, tipo: "archive" },
    { id: "Pre-Columbian_Trans-Oceanic_Contact", titulo: "Contacto Transoceanico Precolombino", bloque: "historia", peso: 9, tipo: "archive" },
    { id: "ovni-miguel-pedrero", titulo: "OVNI: Una Explicacion que no va a Gustar a Nadie", bloque: "misterio", peso: 9, tipo: "archive" },
    { id: "energia-libre-carrera-hacia-el-punto-cero", titulo: "Energia Libre: Carrera Hacia el Punto Cero", bloque: "ciencia", peso: 9, tipo: "archive" },
    { id: "DocumentalELSECRETOLALEYDELAATRACCIONTheSecretEspanol", titulo: "El Secreto: La Ley de la Atraccion", bloque: "espiritualidad", peso: 9, tipo: "archive" },
    { id: "viernes", titulo: "Viernes Misticos", bloque: "externo", url: "https://aldosuarez10.github.io/viernes-misticos-radio/", tipo: "web" },
    { id: "universo", titulo: "Universo 2 Anillo", bloque: "externo", url: "https://aldosuarez10.github.io/universo_segundo_anillo/", tipo: "web" }
];

let biblioteca = [...bibliotecaDefault];
let tvEncendida = false;
let colaBumpers = [];
let historialReciente = [];
const MAX_HISTORIAL = 8;
let timerAvance = null;
let capaActiva = 1;
let bloqueActual = null;
let bibliotecaLista = false;
let osdTimeout = null;      // ✅ Variable global para limpiar
let osdIntervalo = null;    // ✅ Variable global para limpiar

// =============================================
//  HISTORIAL POR CATEGORÍA
// =============================================

// En lugar de un solo historial global, usamos uno por categoría
const historialPorCategoria = {};

// Función para obtener el historial de una categoría
function getHistorialCategoria(categoria) {
    if (!historialPorCategoria[categoria]) {
        historialPorCategoria[categoria] = [];
    }
    return historialPorCategoria[categoria];
}

// Función para agregar un video al historial de su categoría
function agregarAlHistorial(item) {
    if (!item || !item.bloque) return;
    
    // Historial global (zapping)
    historialReciente.push(item.id);
    if (historialReciente.length > MAX_HISTORIAL) {
        historialReciente.shift();
    }
    
    // Historial por categoría
    if (!historialPorCategoria[item.bloque]) {
        historialPorCategoria[item.bloque] = [];
    }
    historialPorCategoria[item.bloque].push(item.id);
    if (historialPorCategoria[item.bloque].length > MAX_HISTORIAL) {
        historialPorCategoria[item.bloque].shift();
    }
}
function mostrarFueraDeAire() {
    const overlay = document.getElementById('overlay-carga');
    if (overlay) overlay.classList.remove('visible');
    document.getElementById('pantalla-fuera-aire').style.display = 'flex';
    document.getElementById('contenedor-tv').style.display = 'none';
}

async function cargarPlaylist() {
    try {
        const res = await fetch('playlist.json');
        if (!res.ok) throw new Error('No se encontró la programación');
        const data = await res.json();
        biblioteca = data.map(item => {
            const limpio = {};
            for (let clave in item) {
                const claveLimpia = clave.trim();
                const valor = item[clave];
                limpio[claveLimpia] = typeof valor === 'string' ? valor.trim() : valor;
            }
            return limpio;
        }).filter(item => item.id && item.bloque);
        
        // ✅ GENERAR URL PARA CADA VIDEO
        biblioteca.forEach(item => {
            if (item.tipo === 'archive') {
                item.url_video = `https://archive.org/download/${item.id}/${item.id}.mp4`;
            }
        });
        
        console.log(`✅ Playlist.json cargada: ${biblioteca.length} items.`);
        
        // ✅ MARCAR COMO LISTA INMEDIATAMENTE (SIN ESPERAR VALIDACIÓN)
        bibliotecaLista = true;
        const overlay = document.getElementById('overlay-carga');
        if (overlay) overlay.classList.remove('visible');
        
        // Mostrar cuántos hay por categoría (para debugging)
        const porCategoria = {};
        biblioteca.filter(v => v.tipo === 'archive').forEach(v => {
            porCategoria[v.bloque] = (porCategoria[v.bloque] || 0) + 1;
        });
        console.table(porCategoria);
        
    } catch (error) {
        console.warn("No se pudo cargar playlist.json, usando biblioteca por defecto.", error);
        biblioteca = [...bibliotecaDefault];
        biblioteca.forEach(item => {
            if (item.tipo === 'archive') {
                item.url_video = `https://archive.org/download/${item.id}/${item.id}.mp4`;
            }
        });
        bibliotecaLista = true;
        const overlay = document.getElementById('overlay-carga');
        if (overlay) overlay.classList.remove('visible');
    }
}

async function validarBiblioteca() {
    const overlay = document.getElementById('overlay-carga');
    if (overlay) overlay.classList.add('visible');

    const estado = document.getElementById('estado-cargando');
    const cacheKey = 'laclara_tv_validacion_v5';
    const cache = JSON.parse(localStorage.getItem(cacheKey));
    const ahora = Date.now();

    // ✅ SI HAY CACHÉ, USARLO Y YA
    if (cache && (ahora - cache.timestamp < 86400000)) {
        biblioteca = cache.bibliotecaValida;
        bibliotecaLista = true;
        console.log("✅ Señal restaurada desde caché");
        if (overlay) overlay.classList.remove('visible');
        return;
    }

    if (estado) estado.textContent = 'VERIFICANDO SEÑAL...';
    const itemsArchive = biblioteca.filter(v => v.tipo === 'archive');
    
    // ✅ INTENTAR VALIDAR, PERO SI FALLA, USAR playlist.json DIRECTAMENTE
    try {
        const resultados = await Promise.all(itemsArchive.map(async v => {
            try {
                const res = await fetch(`https://archive.org/metadata/${v.id}`);
                if (!res.ok) return null;
                const data = await res.json();
                if (data && data.metadata && data.metadata.identifier) {
                    const mp4File = data.files.find(f => f.format === 'MPEG4' || f.name.toLowerCase().endsWith('.mp4'));
                    if (mp4File) {
                        v.url_video = `https://archive.org/download/${v.id}/${mp4File.name}`;
                        return v;
                    }
                }
                return null;
            } catch (e) { 
                // ✅ SI FALLA EL FETCH (por file://), USAR URL POR DEFECTO
                v.url_video = `https://archive.org/download/${v.id}/${v.id}.mp4`;
                return v;
            }
        }));

        const itemsValidos = resultados.filter(Boolean);
        const idsValidos = new Set(itemsValidos.map(v => v.id));
        
        for (let i = biblioteca.length - 1; i >= 0; i--) {
            if (biblioteca[i].tipo === 'archive') {
                if (idsValidos.has(biblioteca[i].id)) {
                    biblioteca[i] = itemsValidos.find(v => v.id === biblioteca[i].id);
                } else {
                    // ✅ SI NO PASA LA VALIDACIÓN, MANTENERLO CON URL POR DEFECTO
                    biblioteca[i].url_video = `https://archive.org/download/${biblioteca[i].id}/${biblioteca[i].id}.mp4`;
                }
            }
        }

    } catch (e) {
        // ✅ SI TODO FALLA, USAR playlist.json DIRECTAMENTE (sin validar)
        console.warn('⚠️ Validación fallida (probablemente file://), usando playlist.json directamente');
        biblioteca.forEach(v => {
            if (v.tipo === 'archive' && !v.url_video) {
                v.url_video = `https://archive.org/download/${v.id}/${v.id}.mp4`;
            }
        });
    }

    // ✅ GUARDAR EN CACHÉ
    localStorage.setItem(cacheKey, JSON.stringify({ 
        timestamp: ahora, 
        bibliotecaValida: biblioteca 
    }));
    
    bibliotecaLista = true;
    if (estado) estado.textContent = '';
    if (overlay) overlay.classList.remove('visible');

    const archives = biblioteca.filter(v => v.tipo === 'archive');
    if (archives.length === 0) {
        mostrarFueraDeAire();
    } else {
        ocultarFueraDeAire();
        console.log(`📺 ${archives.length} videos disponibles`);
        const porCategoria = {};
        archives.forEach(v => {
            porCategoria[v.bloque] = (porCategoria[v.bloque] || 0) + 1;
        });
        console.table(porCategoria);
    }
}

function elegirSiguiente(bloqueDeseado = null) {
    const esZapping = (bloqueDeseado === null || bloqueDeseado === 'zapping');
    
    let candidatos = biblioteca.filter(v => {
        if (v.tipo !== "archive") return false;
        if (bloqueDeseado && bloqueDeseado !== 'zapping') {
            return v.bloque === bloqueDeseado;
        }
        return v.bloque !== "bumper";
    });
    
    if (candidatos.length === 0) {
        if (bloqueDeseado && bloqueDeseado !== 'zapping') {
            return elegirSiguiente('zapping');
        }
        return null;
    }
    
    // ✅ FILTRO MÁS PERMISIVO: solo excluir el ÚLTIMO video visto
    if (candidatos.length > 1) {
        if (esZapping) {
            // Zapping: excluir solo el último
            const ultimoId = historialReciente.slice(-1)[0];
            if (ultimoId) {
                candidatos = candidatos.filter(v => v.id !== ultimoId);
            }
        } else {
            // Categoría específica: excluir solo el último de esa categoría
            const histCategoria = getHistorialCategoria(bloqueDeseado);
            const ultimoId = histCategoria.slice(-1)[0];
            if (ultimoId) {
                candidatos = candidatos.filter(v => v.id !== ultimoId);
            }
        }
    }
    
    // Si no quedan candidatos, usar todos (permitir repetición)
    if (candidatos.length === 0) {
        candidatos = biblioteca.filter(v => {
            if (v.tipo !== "archive") return false;
            if (bloqueDeseado && bloqueDeseado !== 'zapping') {
                return v.bloque === bloqueDeseado;
            }
            return v.bloque !== "bumper";
        });
    }
    
    // Selección ponderada
    let pool = [];
    candidatos.forEach(v => { 
        for (let i = 0; i < (v.peso || 1); i++) pool.push(v); 
    });
    
    // Mezclar para evitar sesgo
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    
    if (pool.length > 0) {
        const elegido = pool[Math.floor(Math.random() * pool.length)];
        agregarAlHistorial(elegido);
        console.log(`🎯 Elegido: ${elegido.titulo} (${elegido.bloque})`);
        return elegido;
    }
    
    return null;
}

function generarMenuOSD() {
    const menuContainer = document.getElementById('menu-dinamico');
    const opciones = [
        { label: "📺 ZAPPING", accion: () => cambiarCanal('zapping') },
        { label: "🔍 MISTERIO", accion: () => cambiarCanal('misterio') },
        { label: " GEOPOLÍTICA", accion: () => cambiarCanal('historia') },
        { label: "🧪 CIENCIA", accion: () => cambiarCanal('ciencia') },
        { label: "🕉️ ESPIRITUALIDAD", accion: () => cambiarCanal('espiritualidad') },
        { label: "🔮 VIERNES MÍSTICOS", accion: () => cambiarCanal('viernes') },
        { label: "🌀 UNIVERSO 2° ANILLO", accion: () => cambiarCanal('universo') }
    ];
    menuContainer.innerHTML = opciones.map(op => `<div class="osd-opcion" onclick="ejecutarAccionMenu(this)">${op.label}</div>`).join('');
    window.opcionesMenu = opciones;
}

function ejecutarAccionMenu(elemento) {
    const index = Array.from(elemento.parentNode.children).indexOf(elemento);
    window.opcionesMenu[index].accion();
}

function toggleTV(e) {
    if (e) e.stopPropagation();
    if (tvEncendida) { apagarTV(); } else { encenderTV(e); }
}

function apagarTV() {
    tvEncendida = false;
    document.getElementById('cntrl-box').classList.remove('retirado', 'encendido');
    document.getElementById('control').classList.remove('tv-on');
    document.getElementById('en-vivo').style.display = 'none';
    document.getElementById('pantalla-video').style.display = 'none';
    document.getElementById('sintonia').style.display = 'block';
    document.getElementById('osd-menu').classList.remove('activo');

    // ✅ LIMPIAR TIMEOUTS E INTERVALOS
    if (osdTimeout) clearTimeout(osdTimeout);
    if (osdIntervalo) clearInterval(osdIntervalo);

    var layer1 = document.getElementById('video-layer-1');
    var layer2 = document.getElementById('video-layer-2');
    var webFrame = document.getElementById('web-frame');

    if (layer1) { layer1.pause(); layer1.removeAttribute('src'); }
    if (layer2) { layer2.pause(); layer2.removeAttribute('src'); }
    if (webFrame) { webFrame.src = 'about:blank'; }
    
    if (window.osdIntervalo) clearInterval(window.osdIntervalo);
}

function cambiarVolumen(delta) {
    var layer1 = document.getElementById('video-layer-1');
    var layer2 = document.getElementById('video-layer-2');

    [layer1, layer2].forEach(function(v) {
        if (v) {
            var nuevoVol = Math.min(1, Math.max(0, v.volume + delta));
            v.volume = nuevoVol;
        }
    });

    var vol = layer1 ? layer1.volume : (layer2 ? layer2.volume : 1);
    var porcentaje = Math.round(vol * 100);
    document.getElementById('barra-vol').style.width = porcentaje + '%';
    document.getElementById('txt-vol').textContent = porcentaje + '%';

    var osd = document.getElementById('osd-volumen');
    osd.style.opacity = '1';

    clearTimeout(window.volTimer);
    window.volTimer = setTimeout(function() { osd.style.opacity = '0'; }, 2000);
}

function arrancarCuandoEsteLista() {
    const estado = document.getElementById('estado-cargando');
    if (bibliotecaLista) {
        if (estado) estado.textContent = '';
        cambiarCanal('zapping');
    } else {
        if (estado) estado.textContent = 'CARGANDO SEÑAL...';
        setTimeout(arrancarCuandoEsteLista, 700);
    }
}

function encenderTV(e) {
    if (e) e.stopPropagation();
    if (tvEncendida) return;
    tvEncendida = true;

    document.getElementById('cntrl-box').classList.add('retirado', 'encendido');
    document.getElementById('control').classList.add('tv-on');
    document.getElementById('en-vivo').style.display = 'flex';
    
    setTimeout(() => {
        document.getElementById('sintonia').style.display = 'none';
        document.getElementById('pantalla-video').style.display = 'block';
        arrancarCuandoEsteLista();
    }, 500);
    document.getElementById('contador-viewers').style.opacity = '1';
}

function abrirMenu(e) {
    if (e) e.stopPropagation();
    if (!tvEncendida) return;
    document.getElementById('osd-menu').classList.toggle('activo');
}

function cambiarCanal(bloque) {
    if (!tvEncendida) return;
    document.getElementById('osd-menu').classList.remove('activo');
    clearTimeout(timerAvance);
    bloqueActual = bloque;

    if (bloque === 'viernes' || bloque === 'universo') {
        const urlsExternas = {
            'viernes': 'https://aldosuarez10.github.io/viernes-misticos-radio/',
            'universo': 'https://aldosuarez10.github.io/universo_segundo_anillo/'
        };
        const itemExterno = {
            id: bloque,
            titulo: bloque === 'viernes' ? 'Viernes Místicos' : 'Universo 2° Anillo',
            tipo: 'web',
            url: urlsExternas[bloque]
        };
        mostrarEnPantalla(itemExterno);
        return;
    }

    const video = elegirSiguiente(bloque === 'zapping' ? null : bloque);
    if (!video) { 
        if (bloque !== 'zapping') cambiarCanal('zapping'); 
        return; 
    }
    mostrarEnPantalla(video);
}

function reproducirBloqueFijo(bloque) {
    const video = elegirSiguiente(bloque);
    if (!video) { cambiarCanal('zapping'); return; }
    mostrarEnPantalla(video);
}

function reproducirSiguienteEnCola() {
    if (colaBumpers.length > 0) {
        const bumper = colaBumpers.shift();
        mostrarEnPantalla(bumper);
    } else {
        const video = elegirSiguiente();
        if (!video) return;
        mostrarEnPantalla(video);
    }
}

function mostrarEnPantalla(item, offsetSegundos = 0) {
    const flash = document.createElement('div');
    flash.className = 'flash-sintonia';
    document.getElementById('marco-tv').appendChild(flash);
    setTimeout(() => flash.remove(), 400);

    // ✅ LIMPIAR TIMEOUTS E INTERVALOS ANTERIORES
    if (osdTimeout) clearTimeout(osdTimeout);
    if (osdIntervalo) clearInterval(osdIntervalo);

    const osdTitulo = document.getElementById('osd-titulo');
    osdTitulo.textContent = item.titulo;
    osdTitulo.classList.add('visible');

    // 10 segundos visibles
    osdTimeout = setTimeout(() => {
        osdTitulo.classList.remove('visible');
    }, 10000);

    // Reaparece cada 15 minutos
    osdIntervalo = setInterval(() => {
        osdTitulo.classList.add('visible');
        if (osdTimeout) clearTimeout(osdTimeout);
        osdTimeout = setTimeout(() => {
            osdTitulo.classList.remove('visible');
        }, 8000);
    }, 600000);

    const layer1 = document.getElementById('video-layer-1');
    const layer2 = document.getElementById('video-layer-2');
    const webFrame = document.getElementById('web-frame');

    if (item.tipo === 'web') {
        layer1.pause(); layer1.removeAttribute('src'); layer1.load();
        layer2.pause(); layer2.removeAttribute('src'); layer2.load();
        layer1.style.display = 'none'; layer2.style.display = 'none';
        webFrame.style.display = 'block'; webFrame.src = item.url;
        return;
    }

    webFrame.src = 'about:blank'; webFrame.style.display = 'none';
    layer1.style.display = 'block'; layer2.style.display = 'block';

    if (item.url_video) { cambiarCapaVideo(item.url_video, offsetSegundos, item); }
}

function cambiarCapaVideo(url, offset, item) {
    const layer1 = document.getElementById('video-layer-1');
    const layer2 = document.getElementById('video-layer-2');
    
    const capaVieja = capaActiva === 1 ? layer1 : layer2;
    const capaNueva = capaActiva === 1 ? layer2 : layer1;

    capaVieja.pause();
    capaNueva.src = url;
    
    if (offset > 0) {
        capaNueva.dataset.targetOffset = offset;
        capaNueva.dataset.randomStart = 'false';
    } else {
        capaNueva.dataset.randomStart = 'true';
    }

    let playPromise = capaNueva.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => { console.warn("Autoplay bloqueado:", error); });
    }

    capaNueva.classList.add('activa'); capaNueva.classList.remove('inactiva');
    capaVieja.classList.add('inactiva'); capaVieja.classList.remove('activa');
    capaActiva = capaActiva === 1 ? 2 : 1;
}

const eventosProgramados = [];
let eventoActivoId = null;

function verificarEventoProgramado() {
    if (!tvEncendida) return;
    const ahora = new Date();
    const evento = eventosProgramados.find(e => ahora >= new Date(e.inicio) && ahora < new Date(e.fin));

    if (evento && evento.id !== eventoActivoId) {
        eventoActivoId = evento.id;
        clearTimeout(timerAvance);
        const offsetSegundos = Math.max(0, Math.floor((ahora - new Date(evento.inicio)) / 1000));
        mostrarEnPantalla(evento, offsetSegundos);
    } else if (!evento && eventoActivoId !== null) {
        eventoActivoId = null;
        cambiarCanal('zapping');
    }
}
setInterval(verificarEventoProgramado, 15000);

function actualizarReloj() {
    const ahora = new Date();
    const h = String(ahora.getHours()).padStart(2, '0');
    const m = String(ahora.getMinutes()).padStart(2, '0');
    const s = String(ahora.getSeconds()).padStart(2, '0');
    document.getElementById('reloj-en-vivo').textContent = `${h}:${m}:${s}`;
}
setInterval(actualizarReloj, 1000);
actualizarReloj();

document.getElementById('marco-tv').addEventListener('click', function(e) {
    if (!tvEncendida) return;
    if (e.target.closest('#osd-menu') || e.target.closest('#control')) return;
    const activeLayer = capaActiva === 1 ? document.getElementById('video-layer-1') : document.getElementById('video-layer-2');
    if (activeLayer.paused) { activeLayer.play(); } else { activeLayer.pause(); }
});

// ✅ CORREGIDO: El evento 'ended' ahora está DENTRO del forEach
document.querySelectorAll('.video-layer').forEach(layer => {
    layer.addEventListener('loadedmetadata', function() {
        if (this.dataset.randomStart === 'true') {
            let target = Math.floor(Math.random() * 120) + 300; 
            if (this.duration < target) {
                this.currentTime = Math.floor(this.duration * 0.66);
            } else {
                this.currentTime = target;
            }
            delete this.dataset.randomStart;
        } else if (this.dataset.targetOffset) {
            let target = parseFloat(this.dataset.targetOffset);
            this.currentTime = (this.duration && this.duration < target) ? Math.max(0, this.duration - 30) : target;
            delete this.dataset.targetOffset;
        }
    });

    // ✅ MOVIDO DENTRO DEL FOREACH
    layer.addEventListener('ended', function() {
        if (!tvEncendida) return;
        if (colaBumpers.length > 0) { reproducirSiguienteEnCola(); } 
        else if (bloqueActual && bloqueActual !== 'zapping') { reproducirBloqueFijo(bloqueActual); } 
        else { reproducirSiguienteEnCola(); }
    });
});

document.addEventListener('click', function (e) {
    const menu = document.getElementById('osd-menu');
    const btnMenu = document.getElementById('btn-menu');
    if (menu.classList.contains('activo') && !menu.contains(e.target) && e.target !== btnMenu) {
        menu.classList.remove('activo');
    }
});

generarMenuOSD();

// ✅ INICIO CORRECTO: Una sola llamada a validarBiblioteca()
cargarPlaylist().then(() => {
    validarBiblioteca();
});

let viewerCount = 14;
function actualizarViewers() {
    const el = document.getElementById('viewer-count');
    if (el) {
        const cambio = Math.floor(Math.random() * 3) - 1;
        viewerCount = Math.max(8, Math.min(25, viewerCount + cambio));
        el.textContent = viewerCount;
    }
    setTimeout(actualizarViewers, (Math.random() * 45000) + 45000);
}
actualizarViewers();

// --- CONTROL DE ESTÁTICA ---
// ✅ AHORA EL ELEMENTO EXISTE EN EL HTML
const capaEstatica = document.getElementById('estatica');

function mostrarEstatica() { if (capaEstatica) capaEstatica.classList.add('visible'); }
function ocultarEstatica() { if (capaEstatica) capaEstatica.classList.remove('visible'); }

const videos = document.querySelectorAll('.video-layer');
videos.forEach(video => {
    video.addEventListener('waiting', mostrarEstatica);
    video.addEventListener('stalled', mostrarEstatica);
    video.addEventListener('error', mostrarEstatica);
    video.addEventListener('playing', ocultarEstatica);
    video.addEventListener('canplay', ocultarEstatica);
});

const observerMenu = new MutationObserver(() => {
    const webFrame = document.getElementById('web-frame');
    if (webFrame && webFrame.style.display === 'block') {
        ocultarEstatica();
    }
});
observerMenu.observe(document.getElementById('web-frame'), { attributes: true, attributeFilter: ['style'] });