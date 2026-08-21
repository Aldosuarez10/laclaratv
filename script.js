// ============================================================
// @LaClaraTV - Script 
// ============================================================

const bibliotecaDefault = [
    { id: "bamper-central-1", titulo: "Bumper Central 1", bloque: "bumper", peso: 12, tipo: "archive" },
    { id: "bamper-2", titulo: "Bumper Central 2", bloque: "bumper", peso: 12, tipo: "archive" },
    { id: "bamper-3", titulo: "Bumper Central 3", bloque: "bumper", peso: 12, tipo: "archive" },
    { id: "las-fallas-de-la-arqueologia", titulo: "Las Fallas De La Arqueologia", bloque: "ciencia", peso: 12, tipo: "archive" },
    { id: "la-rueda-de-samsara", titulo: "La Rueda de Samsara", bloque: "espiritualidad", peso: 12, tipo: "archive" },
    { id: "TheSecretLandHighJump194769min", titulo: "The Secret Land", bloque: "misterio", peso: 9, tipo: "archive" },
    { id: "viernes", titulo: "Viernes Misticos", bloque: "externo", url: "https://aldosuarez10.github.io/viernes-misticos-radio/", tipo: "web" },
    { id: "universo", titulo: "Universo 2 Anillo", bloque: "externo", url: "https://aldosuarez10.github.io/universo_segundo_anillo/", tipo: "web" }
];

let biblioteca = [...bibliotecaDefault];
let tvEncendida = false;
let colaBumpers = [];
let historialReciente = [];
const MAX_HISTORIAL = 25;
let timerAvance = null;
let capaActiva = 1;
let bloqueActual = null;
let itemActual = null;
let proximoContenido = null;
let bibliotecaLista = false;
let osdTimeout = null;
let osdIntervalo = null;
let colaOSD = [];
let procesandoOSD = false;
const OSD_DURACION_VISIBLE = 8000;
const OSD_INTERVALO_PULSO = 300000;

const LOTE_SIZE = 5;
let colaArchivePendientes = [];
let cargandoLoteEnFondo = false;

async function cargarSiguienteLoteEnFondo() {
    if (cargandoLoteEnFondo || colaArchivePendientes.length === 0) return;
    cargandoLoteEnFondo = true;
    const lote = colaArchivePendientes.splice(0, LOTE_SIZE);
    
    await Promise.all(lote.map(async (v) => {
        try {
            const res = await fetch(`https://archive.org/metadata/${v.id}`);
            if (!res.ok) return;
            const data = await res.json();
            if (data && data.files) {
                const candidatos = data.files.filter(f => f.format === 'MPEG4' || f.format === 'h.264' || f.name.toLowerCase().endsWith('.mp4'));
                if (candidatos.length > 0) {
                    const derivados = candidatos.filter(f => f.source === 'derivative');
                    const pool = derivados.length > 0 ? derivados : candidatos;
                    pool.sort((a, b) => (parseInt(a.size) || Infinity) - (parseInt(b.size) || Infinity));
                    v.url_video = `https://archive.org/download/${v.id}/${pool[0].name}`;
                }
            }
        } catch (e) { /* Silencioso en segundo plano */ }
    }));

    cargandoLoteEnFondo = false;
    if (colaArchivePendientes.length > 0) setTimeout(cargarSiguienteLoteEnFondo, 2500);
}

const historialPorCategoria = {};
function getHistorialCategoria(categoria) {
    if (!historialPorCategoria[categoria]) historialPorCategoria[categoria] = [];
    return historialPorCategoria[categoria];
}

function agregarAlHistorial(item) {
    if (!item || !item.bloque) return;
    historialReciente.push(item.id);
    if (historialReciente.length > MAX_HISTORIAL) historialReciente.shift();
    if (!historialPorCategoria[item.bloque]) historialPorCategoria[item.bloque] = [];
    historialPorCategoria[item.bloque].push(item.id);
    if (historialPorCategoria[item.bloque].length > MAX_HISTORIAL) historialPorCategoria[item.bloque].shift();
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
        
        // LIMPIEZA AGRESIVA: Elimina espacios en claves ("id ") y valores ("https... ")
        biblioteca = data.map(item => {
            const limpio = {};
            for (let clave in item) {
                const k = clave.trim();
                const v = item[clave];
                limpio[k] = (typeof v === 'string') ? v.trim() : v;
            }
            return limpio;
        }).filter(item => item.id && item.bloque);

        biblioteca.forEach(item => {
            if (item.tipo === 'archive' || !item.tipo) {
                item.tipo = 'archive';
                item.url_video = `https://archive.org/download/${item.id}/${item.id}.mp4`;
            }
        });

        console.log(`✅ Playlist cargada: ${biblioteca.length} items.`);
        bibliotecaLista = true;
        const overlay = document.getElementById('overlay-carga');
        if (overlay) overlay.classList.remove('visible');
    } catch (error) {
        console.warn("Usando biblioteca por defecto.", error);
        biblioteca = [...bibliotecaDefault];
        bibliotecaLista = true;
    }
}

async function validarBiblioteca() {
    const overlay = document.getElementById('overlay-carga');
    if (overlay) overlay.classList.remove('visible');
    const itemsArchive = biblioteca.filter(v => v.tipo === 'archive' && v.bloque !== 'bumper');
    for (let i = itemsArchive.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [itemsArchive[i], itemsArchive[j]] = [itemsArchive[j], itemsArchive[i]];
    }
    colaArchivePendientes = [...itemsArchive];
    console.log(`📺 TV lista. Videos en cola de fondo: ${colaArchivePendientes.length}`);
    setTimeout(cargarSiguienteLoteEnFondo, 1500);
}

let ultimoBumperId = null;
function elegirBumper() {
    let bumpers = biblioteca.filter(v => (v.tipo === "archive" || v.tipo === "odysee" || v.tipo === "peertube") && v.bloque === "bumper");
    if (bumpers.length === 0) return null;
    if (bumpers.length > 1) {
        const sinRepetir = bumpers.filter(v => v.id !== ultimoBumperId);
        if (sinRepetir.length > 0) bumpers = sinRepetir;
    }
    let pool = [];
    bumpers.forEach(b => { for (let i = 0; i < (b.peso || 1); i++) pool.push(b); });
    const elegido = pool[Math.floor(Math.random() * pool.length)];
    ultimoBumperId = elegido.id;
    return elegido;
}

function elegirSiguiente(bloqueDeseado = null) {
    const esZapping = (bloqueDeseado === null || bloqueDeseado === 'zapping');
    
    // 1. Obtener todos los candidatos válidos
    let candidatos = biblioteca.filter(v => {
        if (v.tipo !== "archive" && v.tipo !== "odysee" && v.tipo !== "peertube") return false;
        if (bloqueDeseado && bloqueDeseado !== 'zapping') return v.bloque === bloqueDeseado;
        return v.bloque !== "bumper";
    });

    if (candidatos.length === 0) return null;

    // 2. Priorizar Odysee si es el primer video o zapping
    if (historialReciente.length === 0 || esZapping) {
        const odysee = candidatos.filter(v => v.tipo === 'odysee' && v.url_video);
        if (odysee.length > 0) candidatos = odysee;
    }

    // 3. Filtrar el último visto para evitar repetición inmediata (Regla de Oro)
    const ultimoId = historialReciente.slice(-1)[0];
    if (ultimoId && candidatos.length > 1) {
        candidatos = candidatos.filter(v => v.id !== ultimoId);
    }

    // 4. Si después de filtrar no queda nada, usamos todos los candidatos originales (reset de seguridad)
    if (candidatos.length === 0) {
        candidatos = biblioteca.filter(v => {
            if (v.tipo !== "archive" && v.tipo !== "odysee" && v.tipo !== "peertube") return false;
            if (bloqueDeseado && bloqueDeseado !== 'zapping') return v.bloque === bloqueDeseado;
            return v.bloque !== "bumper";
        });
    }

    // 5. Selección aleatoria ponderada por peso
    let pool = [];
    candidatos.forEach(v => { for (let i = 0; i < (v.peso || 1); i++) pool.push(v); });
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const elegido = pool[Math.floor(Math.random() * pool.length)];
    agregarAlHistorial(elegido);
    console.log(`🎯 Elegido: ${elegido.titulo} [${elegido.tipo}] - URL: ${elegido.url_video}`);
    return elegido;
}

function generarMenuOSD() {
    const menuContainer = document.getElementById('menu-dinamico');
    const opciones = [
        { label: "📺 ZAPPING", accion: () => cambiarCanal('zapping') },
        { label: "🔍 MISTERIO", accion: () => cambiarCanal('misterio') },
        { label: "🌍 GEOPOLÍTICA", accion: () => cambiarCanal('historia') },
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
    if (window.opcionesMenu && window.opcionesMenu[index]) window.opcionesMenu[index].accion();
}

function toggleTV(e) {
    if (e) e.stopPropagation();
    tvEncendida ? apagarTV() : encenderTV(e);
}

function apagarTV() {
    tvEncendida = false;
    document.getElementById('cntrl-box').classList.remove('retirado', 'encendido');
    document.getElementById('control').classList.remove('tv-on');
    document.getElementById('en-vivo').style.display = 'none';
    document.getElementById('pantalla-video').style.display = 'none';
    document.getElementById('sintonia').style.display = 'block';
    document.getElementById('osd-menu').classList.remove('activo');
    if (osdTimeout) clearTimeout(osdTimeout);
    if (osdIntervalo) clearInterval(osdIntervalo);
    limpiarColaOSD();
    const l1 = document.getElementById('video-layer-1');
    const l2 = document.getElementById('video-layer-2');
    const web = document.getElementById('web-frame');
    if (l1) { l1.pause(); l1.removeAttribute('src'); }
    if (l2) { l2.pause(); l2.removeAttribute('src'); }
    if (web) web.src = 'about:blank';
}

function cambiarVolumen(delta) {
    const l1 = document.getElementById('video-layer-1');
    const l2 = document.getElementById('video-layer-2');
    [l1, l2].forEach(v => { if (v) v.volume = Math.min(1, Math.max(0, v.volume + delta)); });
    const vol = l1 ? l1.volume : (l2 ? l2.volume : 1);
    const porcentaje = Math.round(vol * 100);
    document.getElementById('barra-vol').style.width = porcentaje + '%';
    document.getElementById('txt-vol').textContent = porcentaje + '%';
    const osd = document.getElementById('osd-volumen');
    osd.style.opacity = '1';
    clearTimeout(window.volTimer);
    window.volTimer = setTimeout(() => { osd.style.opacity = '0'; }, 2000);
}

function arrancarCuandoEsteLista() {
    const estado = document.getElementById('estado-cargando');
    if (bibliotecaLista) {
        if (estado) estado.textContent = '';
        cambiarCanal('zapping');
    } else {
        if (estado) estado.textContent = 'CARGANDO SEÑAL...';
        setTimeout(arrancarCuandoEsteLista, 100);
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
    }, 100);
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
        const urls = {
            'viernes': 'https://aldosuarez10.github.io/viernes-misticos-radio/',
            'universo': 'https://aldosuarez10.github.io/universo_segundo_anillo/'
        };
        mostrarEnPantalla({ id: bloque, titulo: bloque === 'viernes' ? 'Viernes Místicos' : 'Universo 2° Anillo', tipo: 'web', url: urls[bloque] });
        return;
    }

    const video = elegirSiguiente(bloque === 'zapping' ? null : bloque);
    if (video) mostrarEnPantalla(video);
    else if (bloque !== 'zapping') cambiarCanal('zapping');
}

function reproducirBloqueFijo(bloque) {
    const video = elegirSiguiente(bloque);
    if (video) mostrarEnPantalla(video);
    else cambiarCanal('zapping');
}

function reproducirSiguienteEnCola() {
    if (colaBumpers.length > 0) {
        mostrarEnPantalla(colaBumpers.shift());
    } else {
        const video = elegirSiguiente();
        if (video) mostrarEnPantalla(video);
    }
}

function mostrarEnPantalla(item, offsetSegundos = 0) {
    itemActual = item;
    limpiarColaOSD();
    const flash = document.createElement('div');
    flash.className = 'flash-sintonia';
    document.getElementById('marco-tv').appendChild(flash);
    setTimeout(() => flash.remove(), 400);

    if (osdIntervalo) clearInterval(osdIntervalo);
    if (item.bloque !== 'bumper') {
        encolarOSD('titulo', item.titulo);
        osdIntervalo = setInterval(() => encolarOSD('titulo', item.titulo), OSD_INTERVALO_PULSO);
    }

    if ((item.tipo === 'archive' || item.tipo === 'odysee' || item.tipo === 'peertube') && item.bloque !== 'bumper') {
        prepararProximoContenido();
    }

    const l1 = document.getElementById('video-layer-1');
    const l2 = document.getElementById('video-layer-2');
    const web = document.getElementById('web-frame');

    if (item.tipo === 'web') {
        l1.pause(); l1.removeAttribute('src'); l1.style.display = 'none';
        l2.pause(); l2.removeAttribute('src'); l2.style.display = 'none';
        web.style.display = 'block'; web.src = item.url;
        return;
    }

    web.src = 'about:blank'; web.style.display = 'none';
    l1.style.display = 'block'; l2.style.display = 'block';
    if (item.url_video) cambiarCapaVideo(item.url_video, offsetSegundos, item);
}

function cambiarCapaVideo(url, offset, item) {
    const l1 = document.getElementById('video-layer-1');
    const l2 = document.getElementById('video-layer-2');
    const capaVieja = capaActiva === 1 ? l1 : l2;
    const capaNueva = capaActiva === 1 ? l2 : l1;

    capaVieja.pause();
    capaNueva.src = url;
    capaNueva.dataset.anuncioHecho = 'false';
    
    if (offset > 0) {
        capaNueva.dataset.targetOffset = offset;
        capaNueva.dataset.randomStart = 'false';
    } else if (item && item.bloque === 'bumper') {
        capaNueva.dataset.randomStart = 'false';
        delete capaNueva.dataset.targetOffset;
    } else {
        capaNueva.dataset.randomStart = 'true';
    }

    capaNueva.play().catch(() => {});
    capaNueva.classList.add('activa'); capaNueva.classList.remove('inactiva');
    capaVieja.classList.add('inactiva'); capaVieja.classList.remove('activa');
    capaActiva = capaActiva === 1 ? 2 : 1;
}

function actualizarReloj() {
    const ahora = new Date();
    const reloj = document.getElementById('reloj-en-vivo');
    if (reloj) {
        reloj.textContent = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}:${String(ahora.getSeconds()).padStart(2, '0')}`;
    }
}
setInterval(actualizarReloj, 1000);
actualizarReloj();

document.getElementById('marco-tv').addEventListener('click', function(e) {
    if (!tvEncendida || e.target.closest('#osd-menu') || e.target.closest('#control')) return;
    const activeLayer = capaActiva === 1 ? document.getElementById('video-layer-1') : document.getElementById('video-layer-2');
    if (activeLayer) activeLayer.paused ? activeLayer.play() : activeLayer.pause();
});

function prepararProximoContenido() {
    proximoContenido = (bloqueActual && bloqueActual !== 'zapping') ? elegirSiguiente(bloqueActual) : elegirSiguiente();
}

function encolarOSD(tipo, texto) {
    colaOSD.push({ tipo, texto });
    procesarColaOSD();
}

function procesarColaOSD() {
    if (procesandoOSD) return;
    const siguiente = colaOSD.shift();
    if (!siguiente) return;
    procesandoOSD = true;

    const el = document.getElementById(siguiente.tipo === 'proximo' ? 'osd-proximo' : 'osd-titulo');
    if (el) {
        el.querySelector('.osd-texto').textContent = siguiente.texto;
        el.classList.add('visible');
    }

    osdTimeout = setTimeout(() => {
        if (el) el.classList.remove('visible');
        procesandoOSD = false;
        setTimeout(procesarColaOSD, 400);
    }, OSD_DURACION_VISIBLE);
}

function limpiarColaOSD() {
    colaOSD = [];
    procesandoOSD = false;
    if (osdTimeout) clearTimeout(osdTimeout);
    const t = document.getElementById('osd-titulo');
    const p = document.getElementById('osd-proximo');
    if (t) t.classList.remove('visible');
    if (p) p.classList.remove('visible');
}

function avanzarProgramacion() {
    if (!tvEncendida) return;
    const terminoUnBumper = itemActual && itemActual.bloque === 'bumper';

    if (!terminoUnBumper) {
        const bumper = elegirBumper();
        if (bumper) {
            console.log("📺 Bumper:", bumper.titulo);
            mostrarEnPantalla(bumper);
            return;
        }
    }

    if (proximoContenido) {
        const siguiente = proximoContenido;
        proximoContenido = null;
        mostrarEnPantalla(siguiente);
        return;
    }

    if (bloqueActual && bloqueActual !== 'zapping') reproducirBloqueFijo(bloqueActual);
    else {
        const video = elegirSiguiente();
        if (video) mostrarEnPantalla(video);
    }
}

let fallosSeguidos = 0;
const MAX_FALLOS_SEGUIDOS = 3;

document.querySelectorAll('.video-layer').forEach(layer => {
    layer.addEventListener('timeupdate', function() {
        if (!this.classList.contains('activa')) return;
        if (!itemActual || itemActual.bloque === 'bumper') return;
        if (this.dataset.anuncioHecho === 'true') return;
        if (!this.duration || !isFinite(this.duration)) return;
        
        if (this.currentTime / this.duration >= 0.66) {
            this.dataset.anuncioHecho = 'true';
            encolarOSD('titulo', itemActual.titulo);
            if (proximoContenido) encolarOSD('proximo', proximoContenido.titulo);
        } else if (this.currentTime / this.duration < 0.3 && !this.dataset.marcarParcial) {
            this.dataset.marcarParcial = 'true';
            if (itemActual) itemActual.vistoParcial = true;
        }
    });

    layer.addEventListener('ended', function() {
        fallosSeguidos = 0;
        avanzarProgramacion();
    });

    layer.addEventListener('error', function() {
        if (!tvEncendida) return;
        fallosSeguidos++;
        console.warn(`⚠️ Error al cargar: ${itemActual?.titulo}. Saltando...`, fallosSeguidos);
        this.removeAttribute('src');
        this.load();
        if (fallosSeguidos > MAX_FALLOS_SEGUIDOS) {
            fallosSeguidos = 0;
            mostrarFueraDeAire();
            return;
        }
        setTimeout(avanzarProgramacion, 500);
    });
});

document.addEventListener('click', function (e) {
    const menu = document.getElementById('osd-menu');
    const btnMenu = document.getElementById('btn-menu');
    if (menu && menu.classList.contains('activo') && !menu.contains(e.target) && e.target !== btnMenu) {
        menu.classList.remove('activo');
    }
});

generarMenuOSD();

cargarPlaylist().then(() => {
    validarBiblioteca();
});

let viewerCount = Math.floor(Math.random() * (25 - 8 + 1)) + 8;
function actualizarViewers() {
    const el = document.getElementById('viewer-count');
    if (el) {
        viewerCount = Math.max(8, Math.min(25, viewerCount + Math.floor(Math.random() * 3) - 1));
        el.textContent = viewerCount;
    }
    setTimeout(actualizarViewers, (Math.random() * 45000) + 45000);
}
actualizarViewers();

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