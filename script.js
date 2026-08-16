const bibliotecaDefault = [];
let biblioteca = [...bibliotecaDefault];
let tvEncendida = false;
let historialReciente = [];
const MAX_HISTORIAL = 8;
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
    const fueraAire = document.getElementById('pantalla-fuera-aire');
    if (fueraAire) fueraAire.style.display = 'flex';
    const contenedor = document.getElementById('contenedor-tv');
    if (contenedor) contenedor.style.display = 'none';
}

function ocultarFueraDeAire() {
    const fueraAire = document.getElementById('pantalla-fuera-aire');
    if (fueraAire) fueraAire.style.display = 'none';
    const contenedor = document.getElementById('contenedor-tv');
    if (contenedor) contenedor.style.display = 'block';
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

        biblioteca.forEach(item => {
            if (item.tipo === 'archive') {
                item.url_video = `https://archive.org/download/${item.id}/${item.id}.mp4`;
            }
        });
        bibliotecaLista = true;
        const overlay = document.getElementById('overlay-carga');
        if (overlay) overlay.classList.remove('visible');
    } catch (error) {
        biblioteca = [...bibliotecaDefault];
        bibliotecaLista = true;
        const overlay = document.getElementById('overlay-carga');
        if (overlay) overlay.classList.remove('visible');
    }
}

async function validarBiblioteca() {
    const overlay = document.getElementById('overlay-carga');
    const estado = document.getElementById('estado-cargando');
    if (overlay) overlay.classList.add('visible');
    if (estado) estado.textContent = 'SINTONIZANDO SEÑAL...';

    const cacheKey = 'laclara_tv_validacion_v9';
    const cache = JSON.parse(localStorage.getItem(cacheKey));
    const ahora = Date.now();

    if (cache && (ahora - cache.timestamp < 86400000)) {
        biblioteca = cache.bibliotecaValida;
        bibliotecaLista = true;
        if (overlay) overlay.classList.remove('visible');
        return;
    }

    const itemsArchive = biblioteca.filter(v => v.tipo === 'archive');
    const TAMANO_LOTE = 5;
    
    for (let i = 0; i < itemsArchive.length; i += TAMANO_LOTE) {
        const lote = itemsArchive.slice(i, i + TAMANO_LOTE);
        await Promise.all(lote.map(async v => {
            try {
                const res = await fetch(`https://archive.org/metadata/${v.id}`);
                if (!res.ok) return;
                const data = await res.json();
                if (data && data.metadata && data.metadata.identifier) {
                    const candidatos = data.files.filter(f =>
                        f.format === 'MPEG4' || f.format === 'h.264' || f.name.toLowerCase().endsWith('.mp4')
                    );
                    if (candidatos.length > 0) {
                        const derivados = candidatos.filter(f => f.source === 'derivative');
                        const pool = derivados.length > 0 ? derivados : candidatos;
                        pool.sort((a, b) => (parseInt(a.size) || Infinity) - (parseInt(b.size) || Infinity));
                        v.url_video = `https://archive.org/download/${v.id}/${pool[0].name}`;
                    }
                }
            } catch (e) {
                v.url_video = `https://archive.org/download/${v.id}/${v.id}.mp4`;
            }
        }));
    }

    localStorage.setItem(cacheKey, JSON.stringify({ timestamp: ahora, bibliotecaValida: biblioteca }));
    bibliotecaLista = true;
    if (estado) estado.textContent = '';
    if (overlay) overlay.classList.remove('visible');
}

let ultimoBumperId = null;
function elegirBumper() {
    let bumpers = biblioteca.filter(v => v.tipo === "archive" && v.bloque.trim() === "bumper");
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
    let candidatos = biblioteca.filter(v => {
        if (v.tipo !== "archive") return false;
        if (bloqueDeseado && bloqueDeseado !== 'zapping') return v.bloque === bloqueDeseado;
        return v.bloque !== "bumper";
    });

    if (candidatos.length === 0) {
        if (bloqueDeseado && bloqueDeseado !== 'zapping') return elegirSiguiente('zapping');
        return null;
    }

    if (candidatos.length > 1) {
        if (esZapping) {
            const ultimoId = historialReciente.slice(-1)[0];
            if (ultimoId) candidatos = candidatos.filter(v => v.id !== ultimoId);
        } else {
            const histCategoria = getHistorialCategoria(bloqueDeseado);
            const ultimoId = histCategoria.slice(-1)[0];
            if (ultimoId) candidatos = candidatos.filter(v => v.id !== ultimoId);
        }
    }

    let pool = [];
    candidatos.forEach(v => { for (let i = 0; i < (v.peso || 1); i++) pool.push(v); });
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    if (pool.length > 0) {
        const elegido = pool[Math.floor(Math.random() * pool.length)];
        agregarAlHistorial(elegido);
        return elegido;
    }
    return null;
}

function generarMenuOSD() {
    const menuContainer = document.getElementById('menu-dinamico');
    const opciones = [
        { label: "📺 ZAPPING", accion: () => cambiarCanal('zapping') },
        { label: "🔍 MISTERIO", accion: () => cambiarCanal('misterio') },
        { label: "📜 GEOPOLÍTICA", accion: () => cambiarCanal('historia') },
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
    var layer1 = document.getElementById('video-layer-1');
    var layer2 = document.getElementById('video-layer-2');
    var webFrame = document.getElementById('web-frame');
    if (layer1) { layer1.pause(); layer1.removeAttribute('src'); }
    if (layer2) { layer2.pause(); layer2.removeAttribute('src'); }
    if (webFrame) { webFrame.src = 'about:blank'; }
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
        osdIntervalo = setInterval(() => { encolarOSD('titulo', item.titulo); }, OSD_INTERVALO_PULSO);
    }

    if (item.tipo === 'archive' && item.bloque !== 'bumper') {
        prepararProximoContenido();
    }

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

    let playPromise = capaNueva.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => { console.warn("Autoplay bloqueado:", error); });
    }

    capaNueva.classList.add('activa'); capaNueva.classList.remove('inactiva');
    capaVieja.classList.add('inactiva'); capaVieja.classList.remove('activa');
    capaActiva = capaActiva === 1 ? 2 : 1;
}

function actualizarReloj() {
    const ahora = new Date();
    const h = String(ahora.getHours()).padStart(2, '0');
    const m = String(ahora.getMinutes()).padStart(2, '0');
    const s = String(ahora.getSeconds()).padStart(2, '0');
    const reloj = document.getElementById('reloj-en-vivo');
    if (reloj) reloj.textContent = `${h}:${m}:${s}`;
}
setInterval(actualizarReloj, 1000);
actualizarReloj();

function prepararProximoContenido() {
    if (bloqueActual && bloqueActual !== 'zapping') {
        proximoContenido = elegirSiguiente(bloqueActual);
    } else {
        proximoContenido = elegirSiguiente();
    }
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
        osdTimeout = setTimeout(() => {
            el.classList.remove('visible');
            procesandoOSD = false;
            setTimeout(procesarColaOSD, 400);
        }, OSD_DURACION_VISIBLE);
    }
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

    if (bloqueActual && bloqueActual !== 'zapping') {
        const video = elegirSiguiente(bloqueActual);
        if (video) mostrarEnPantalla(video);
    } else {
        const video = elegirSiguiente();
        if (video) mostrarEnPantalla(video);
    }
}

let fallosSeguidos = 0;
const MAX_FALLOS_SEGUIDOS = 3;

document.querySelectorAll('.video-layer').forEach(layer => {
    layer.addEventListener('loadedmetadata', function() {
        if (this.dataset.randomStart === 'true') {
            const PORCENTAJE_MIN = 0.04;
            const PORCENTAJE_MAX = 0.09;
            if (this.duration && isFinite(this.duration)) {
                const porcentaje = PORCENTAJE_MIN + Math.random() * (PORCENTAJE_MAX - PORCENTAJE_MIN);
                this.currentTime = this.duration * porcentaje;
            }
            delete this.dataset.randomStart;
        } else if (this.dataset.targetOffset) {
            let target = parseFloat(this.dataset.targetOffset);
            this.currentTime = (this.duration && this.duration < target) ? Math.max(0, this.duration - 30) : target;
            delete this.dataset.targetOffset;
        }
    });

    layer.addEventListener('ended', function() {
        fallosSeguidos = 0;
        avanzarProgramacion();
    });

    layer.addEventListener('timeupdate', function() {
        if (!this.classList.contains('activa')) return;
        if (!itemActual || itemActual.bloque === 'bumper') return;
        if (this.dataset.anuncioHecho === 'true') return;
        if (!this.duration || !isFinite(this.duration)) return;
        if (this.currentTime / this.duration >= 0.66) {
            this.dataset.anuncioHecho = 'true';
            encolarOSD('titulo', itemActual.titulo);
            if (proximoContenido) encolarOSD('proximo', proximoContenido.titulo);
        }
    });

    layer.addEventListener('error', function() {
        if (!tvEncendida) return;
        fallosSeguidos++;
        if (fallosSeguidos > MAX_FALLOS_SEGUIDOS) {
            fallosSeguidos = 0;
            mostrarFueraDeAire();
            return;
        }
        setTimeout(avanzarProgramacion, 2000);
    });
});

document.addEventListener('click', function(e) {
    const menu = document.getElementById('osd-menu');
    const btnMenu = document.getElementById('btn-menu');
    if (menu.classList.contains('activo') && !menu.contains(e.target) && e.target !== btnMenu) {
        menu.classList.remove('activo');
    }
});

generarMenuOSD();
cargarPlaylist().then(() => { validarBiblioteca(); });

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