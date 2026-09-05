const bibliotecaDefault = [
    { id: "bamper-central-1", titulo: "Bumper Central 1", bloque: "bumper", peso: 12, tipo: "archive", duracion: 15000 },
    { id: "bamper-3", titulo: "Bumper Central 3", bloque: "bumper", peso: 12, tipo: "archive", duracion: 15000 },
    { id: "las-fallas-de-la-arqueologia", titulo: "Las Fallas De La Arqueologia", bloque: "ciencia", peso: 12, tipo: "archive" }
];

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
let volumenActual = 1;

const LOTE_SIZE = 5;
const UMBRAL_RECARGA = 2;
let colaArchivePendientes = [];
let videosReproducidos = [];
let cargandoLoteEnFondo = false;
let loteActualNumero = 0;

const VISTOS_KEY = "laclara_vistos";
const VISTOS_DIAS = 14;
const VISTOS_MS = VISTOS_DIAS * 24 * 60 * 60 * 1000;
const POZO_MINIMO = 8;
const MARCAR_TRAS_MS = 120000;

function leerVistos() {
    try {
        const raw = JSON.parse(localStorage.getItem(VISTOS_KEY) || "{}");
        const ahora = Date.now();
        const limpio = {};
        for (const id in raw) {
            if (ahora - Number(raw[id]) < VISTOS_MS) limpio[id] = raw[id];
        }
        return limpio;
    } catch (e) {
        return {};
    }
}

function guardarVistos(map) {
    try { localStorage.setItem(VISTOS_KEY, JSON.stringify(map)); } catch (e) {}
}

function marcarVisto(item) {
    if (!item || !item.id || item.bloque === "bumper") return;
    const map = leerVistos();
    map[item.id] = Date.now();
    guardarVistos(map);
}

function liberarMasViejos(candidatos, minimo) {
    const map = leerVistos();
    const orden = Object.entries(map).sort((a, b) => Number(a[1]) - Number(b[1]));
    let frescos = candidatos.filter(v => !map[v.id]);
    while (frescos.length < minimo && orden.length) {
        const liberado = orden.shift();
        delete map[liberado[0]];
        frescos = candidatos.filter(v => !map[v.id]);
    }
    guardarVistos(map);
    return frescos;
}

function esVideoDirecto(v) {
    return v && (v.tipo === "archive" || v.tipo === "odysee") && v.url_video;
}

function contarVideosDisponibles() {
    return biblioteca.filter(v =>
        esVideoDirecto(v) &&
        v.bloque !== "bumper" &&
        !videosReproducidos.includes(v.id)
    ).length;
}

function verificarYCargarMas() {
    const disponibles = contarVideosDisponibles();
    if (disponibles <= UMBRAL_RECARGA && colaArchivePendientes.length > 0 && !cargandoLoteEnFondo) {
        cargarSiguienteLoteEnFondo();
    }
}

async function resolverArchive(v) {
    const metadataURL = `https://archive.org/metadata/${encodeURIComponent(v.id)}`;
    const res = await fetch(metadataURL, { method: "GET", cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.files) return null;
    const candidatos = data.files.filter(f => {
        if (!f.name) return false;
        const nombre = f.name.toLowerCase();
        return nombre.endsWith(".mp4") || f.format === "MPEG4" || f.format === "h.264";
    });
    if (candidatos.length === 0) return null;
    const derivados = candidatos.filter(f => f.source === "derivative");
    const pool = derivados.length > 0 ? derivados : candidatos;
    pool.sort((a, b) => (parseInt(a.size) || Infinity) - (parseInt(b.size) || Infinity));
    const archivo = pool[0];
    const url = `https://archive.org/download/${encodeURIComponent(v.id)}/${encodeURIComponent(archivo.name)}`;
    return { ...v, url_video: url };
}

async function cargarSiguienteLoteEnFondo() {
    if (cargandoLoteEnFondo) return;
    if (colaArchivePendientes.length === 0) return;
    cargandoLoteEnFondo = true;
    loteActualNumero++;
    const lote = colaArchivePendientes.splice(0, LOTE_SIZE);
    const resultados = await Promise.all(lote.map(async (v) => {
        try { return await resolverArchive(v); } catch (e) { return null; }
    }));
    resultados.filter(Boolean).forEach(v => {
        if (!biblioteca.some(b => b.id === v.id)) biblioteca.push(v);
    });
    cargandoLoteEnFondo = false;
    if (contarVideosDisponibles() <= UMBRAL_RECARGA && colaArchivePendientes.length > 0) {
        setTimeout(cargarSiguienteLoteEnFondo, 800);
    }
}

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
    if (esVideoDirecto(item) && item.bloque !== "bumper") {
        if (!videosReproducidos.includes(item.id)) videosReproducidos.push(item.id);
        verificarYCargarMas();
    }
}

function mostrarFueraDeAire() {
    const overlay = document.getElementById("overlay-carga");
    if (overlay) overlay.classList.remove("visible");
    const fueraAire = document.getElementById("pantalla-fuera-aire");
    if (fueraAire) fueraAire.style.display = "flex";
    const contenedor = document.getElementById("contenedor-tv");
    if (contenedor) contenedor.style.display = "none";
}

function ocultarFueraDeAire() {
    const fueraAire = document.getElementById("pantalla-fuera-aire");
    if (fueraAire) fueraAire.style.display = "none";
    const contenedor = document.getElementById("contenedor-tv");
    if (contenedor) contenedor.style.display = "block";
}

async function cargarPlaylist() {
    try {
        const res = await fetch("playlist.json");
        if (!res.ok) throw new Error("No se encontró la programación");
        const data = await res.json();
        biblioteca = data.map(item => {
            const limpio = {};
            for (let clave in item) {
                const claveLimpia = clave.trim();
                const valor = item[clave];
                limpio[claveLimpia] = typeof valor === "string" ? valor.trim() : valor;
            }
            return limpio;
        }).filter(item => item.id && item.bloque);
        bibliotecaLista = true;
        const overlay = document.getElementById("overlay-carga");
        if (overlay) overlay.classList.remove("visible");
    } catch (error) {
        console.warn("No se pudo cargar playlist.json", error);
        biblioteca = [...bibliotecaDefault];
        bibliotecaLista = true;
        const overlay = document.getElementById("overlay-carga");
        if (overlay) overlay.classList.remove("visible");
    }
}

async function validarBiblioteca() {
    const overlay = document.getElementById("overlay-carga");
    const estado = document.getElementById("estado-cargando");
    if (overlay) overlay.classList.add("visible");
    if (estado) estado.textContent = "SINTONIZANDO SEÑAL...";

    const bumpers = biblioteca.filter(v => v.tipo === "archive" && v.bloque === "bumper");
    const itemsArchive = biblioteca.filter(v => v.tipo === "archive" && v.bloque !== "bumper");
    const odysees = biblioteca.filter(v => v.tipo === "odysee" && v.url_video);
    const externos = biblioteca.filter(v => v.tipo === "web");

    for (let i = itemsArchive.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [itemsArchive[i], itemsArchive[j]] = [itemsArchive[j], itemsArchive[i]];
    }

    const primerLote = itemsArchive.slice(0, LOTE_SIZE);
    colaArchivePendientes = itemsArchive.slice(LOTE_SIZE);

    const bumpersValidados = (await Promise.all(bumpers.map(async v => {
        try { return await resolverArchive(v); } catch (e) { return null; }
    }))).filter(Boolean);

    const validos = (await Promise.all(primerLote.map(async v => {
        try { return await resolverArchive(v); } catch (e) { return null; }
    }))).filter(Boolean);

    biblioteca = [...bumpersValidados, ...validos, ...odysees, ...externos];
    bibliotecaLista = true;

    if (estado) {
        estado.textContent = `LISTOS ${biblioteca.filter(esVideoDirecto).length} | COLA ${colaArchivePendientes.length}`;
    }
    if (overlay) setTimeout(() => overlay.classList.remove("visible"), 800);
}

let ultimoBumperId = null;
function elegirBumper() {
    let bumpers = biblioteca.filter(v => esVideoDirecto(v) && v.bloque === "bumper");
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
    const esZapping = (bloqueDeseado === null || bloqueDeseado === "zapping");
    let candidatos = biblioteca.filter(v => {
        if (!esVideoDirecto(v)) return false;
        if (bloqueDeseado && bloqueDeseado !== "zapping") return v.bloque === bloqueDeseado;
        return v.bloque !== "bumper";
    });
    if (candidatos.length === 0) {
        if (bloqueDeseado && bloqueDeseado !== "zapping") return elegirSiguiente("zapping");
        return null;
    }

    const vistos = leerVistos();
    let frescos = candidatos.filter(v => !vistos[v.id]);
    if (frescos.length < Math.min(POZO_MINIMO, candidatos.length)) {
        frescos = liberarMasViejos(candidatos, Math.min(POZO_MINIMO, candidatos.length));
    }
    if (frescos.length) candidatos = frescos;

    if (candidatos.length > 1) {
        const ultimoId = esZapping ? historialReciente.slice(-1)[0] : getHistorialCategoria(bloqueDeseado).slice(-1)[0];
        if (ultimoId) {
            const filtrados = candidatos.filter(v => v.id !== ultimoId);
            if (filtrados.length) candidatos = filtrados;
        }
    }
    let pool = [];
    candidatos.forEach(v => { for (let i = 0; i < (v.peso || 1); i++) pool.push(v); });
    const elegido = pool[Math.floor(Math.random() * pool.length)];
    agregarAlHistorial(elegido);
    return elegido;
}

function generarMenuOSD() {
    const menuContainer = document.getElementById("menu-dinamico");
    const opciones = [
        { label: "📺 ZAPPING", accion: () => cambiarCanal("zapping") },
        { label: "🔍 MISTERIO", accion: () => cambiarCanal("misterio") },
        { label: "📜 GEOPOLÍTICA", accion: () => cambiarCanal("historia") },
        { label: "🧪 CIENCIA", accion: () => cambiarCanal("ciencia") },
        { label: "🕉️ ESPIRITUALIDAD", accion: () => cambiarCanal("espiritualidad") },
        { label: "🔮 VIERNES MÍSTICOS", accion: () => cambiarCanal("viernes") },
        { label: "🌀 UNIVERSO 2° ANILLO", accion: () => cambiarCanal("universo") }
    ];
    menuContainer.innerHTML = opciones.map(op => `<div class="osd-opcion" onclick="ejecutarAccionMenu(this)">${op.label}</div>`).join("");
    window.opcionesMenu = opciones;
}

function ejecutarAccionMenu(elemento) {
    const index = Array.from(elemento.parentNode.children).indexOf(elemento);
    window.opcionesMenu[index].accion();
}

function aplicarVolumen() {
    document.querySelectorAll(".video-layer").forEach(v => { v.volume = volumenActual; });
    const barra = document.getElementById("barra-vol");
    const txt = document.getElementById("txt-vol");
    if (barra) barra.style.width = `${Math.round(volumenActual * 100)}%`;
    if (txt) txt.textContent = `${Math.round(volumenActual * 100)}%`;
}

function mostrarOSDVolumen() {
    const osd = document.getElementById("osd-volumen");
    if (!osd) return;
    osd.style.opacity = "1";
    clearTimeout(mostrarOSDVolumen._t);
    mostrarOSDVolumen._t = setTimeout(() => { osd.style.opacity = "0"; }, 1800);
}

function cambiarVolumen(delta) {
    if (!tvEncendida) return;
    volumenActual = Math.max(0, Math.min(1, Math.round((volumenActual + delta) * 10) / 10));
    aplicarVolumen();
    mostrarOSDVolumen();
}

function toggleTV(e) {
    if (e) e.stopPropagation();
    if (tvEncendida) apagarTV();
    else encenderTV(e);
}

function apagarTV() {
    tvEncendida = false;
    document.getElementById("cntrl-box").classList.remove("retirado", "encendido");
    document.getElementById("control").classList.remove("tv-on");
    document.getElementById("marco-tv").classList.remove("tv-on");
    document.getElementById("en-vivo").style.display = "none";
    document.getElementById("pantalla-video").style.display = "none";
    document.getElementById("sintonia").style.display = "block";
    document.getElementById("osd-menu").classList.remove("activo");
    if (osdTimeout) clearTimeout(osdTimeout);
    if (osdIntervalo) clearInterval(osdIntervalo);
    limpiarColaOSD();
    const layer1 = document.getElementById("video-layer-1");
    const layer2 = document.getElementById("video-layer-2");
    const webFrame = document.getElementById("web-frame");
    if (layer1) { layer1.pause(); layer1.removeAttribute("src"); }
    if (layer2) { layer2.pause(); layer2.removeAttribute("src"); }
    if (webFrame) { webFrame.src = "about:blank"; }
}

function arrancarCuandoEsteLista() {
    const estado = document.getElementById("estado-cargando");
    if (bibliotecaLista && biblioteca.filter(esVideoDirecto).length) {
        if (estado) estado.textContent = "";
        cambiarCanal("zapping");
    } else {
        if (estado) estado.textContent = "CARGANDO SEÑAL...";
        setTimeout(arrancarCuandoEsteLista, 500);
    }
}

function encenderTV(e) {
    if (e) e.stopPropagation();
    if (tvEncendida) return;
    tvEncendida = true;
    document.getElementById("cntrl-box").classList.add("retirado", "encendido");
    document.getElementById("control").classList.add("tv-on");
    document.getElementById("marco-tv").classList.add("tv-on");
    document.getElementById("en-vivo").style.display = "flex";
    setTimeout(() => {
        document.getElementById("sintonia").style.display = "none";
        document.getElementById("pantalla-video").style.display = "block";
        arrancarCuandoEsteLista();
    }, 400);
}

function abrirMenu(e) {
    if (e) e.stopPropagation();
    if (!tvEncendida) return;
    document.getElementById("osd-menu").classList.toggle("activo");
}

function cambiarCanal(bloque) {
    if (!tvEncendida) return;
    document.getElementById("osd-menu").classList.remove("activo");
    clearTimeout(timerAvance);
    bloqueActual = bloque;

    if (bloque === "viernes" || bloque === "universo") {
        const urlsExternas = {
            viernes: "https://aldosuarez10.github.io/viernes-misticos-radio/",
            universo: "https://aldosuarez10.github.io/universo_segundo_anillo/"
        };
        mostrarEnPantalla({
            id: bloque,
            titulo: bloque === "viernes" ? "Viernes Místicos" : "Universo 2° Anillo",
            tipo: "web",
            url: urlsExternas[bloque]
        });
        return;
    }

    const video = elegirSiguiente(bloque === "zapping" ? null : bloque);
    if (!video) {
        if (bloque !== "zapping") cambiarCanal("zapping");
        return;
    }
    mostrarEnPantalla(video);
}

function mostrarEnPantalla(item, offsetSegundos = 0) {
    itemActual = item;
    if (itemActual) {
        itemActual._marcado = false;
        itemActual._aireDesde = Date.now();
    }
    reintentosMismo = 0;
    ultimoTiempoBueno = 0;
    limpiarColaOSD();
    const flash = document.createElement("div");
    flash.className = "flash-sintonia";
    document.getElementById("marco-tv").appendChild(flash);
    setTimeout(() => flash.remove(), 400);

    if (osdIntervalo) clearInterval(osdIntervalo);
    if (item.bloque !== "bumper") {
        encolarOSD("titulo", item.titulo);
        osdIntervalo = setInterval(() => { encolarOSD("titulo", item.titulo); }, OSD_INTERVALO_PULSO);
    }
    if (esVideoDirecto(item) && item.bloque !== "bumper") prepararProximoContenido();

    const layer1 = document.getElementById("video-layer-1");
    const layer2 = document.getElementById("video-layer-2");
    const webFrame = document.getElementById("web-frame");

    if (item.tipo === "web") {
        layer1.pause(); layer1.removeAttribute("src"); layer1.load();
        layer2.pause(); layer2.removeAttribute("src"); layer2.load();
        layer1.style.display = "none"; layer2.style.display = "none";
        webFrame.style.display = "block"; webFrame.src = item.url;
        return;
    }

    webFrame.src = "about:blank";
    webFrame.style.display = "none";
    layer1.style.display = "block";
    layer2.style.display = "block";
    if (item.url_video) cambiarCapaVideo(item.url_video, offsetSegundos, item);
}

function cambiarCapaVideo(url, offset, item) {
    const layer1 = document.getElementById("video-layer-1");
    const layer2 = document.getElementById("video-layer-2");
    const capaVieja = capaActiva === 1 ? layer1 : layer2;
    const capaNueva = capaActiva === 1 ? layer2 : layer1;
    capaVieja.pause();
    capaNueva.src = url;
    capaNueva.volume = volumenActual;
    capaNueva.dataset.anuncioHecho = "false";

    if (offset > 0) {
        capaNueva.dataset.targetOffset = offset;
        capaNueva.dataset.randomStart = "false";
    } else if (item && item.bloque === "bumper") {
        capaNueva.dataset.randomStart = "false";
        delete capaNueva.dataset.targetOffset;
    } else {
        capaNueva.dataset.randomStart = "true";
    }

    const playPromise = capaNueva.play();
    if (playPromise !== undefined) playPromise.catch(() => {});

    capaNueva.classList.add("activa");
    capaNueva.classList.remove("inactiva");
    capaVieja.classList.add("inactiva");
    capaVieja.classList.remove("activa");
    capaActiva = capaActiva === 1 ? 2 : 1;
}

function actualizarReloj() {
    const ahora = new Date();
    const h = String(ahora.getHours()).padStart(2, "0");
    const m = String(ahora.getMinutes()).padStart(2, "0");
    const s = String(ahora.getSeconds()).padStart(2, "0");
    const reloj = document.getElementById("reloj-en-vivo");
    if (reloj) reloj.textContent = `${h}:${m}:${s}`;
}
setInterval(actualizarReloj, 1000);
actualizarReloj();

function tickViewers() {
    const el = document.getElementById("viewer-count");
    if (!el) return;
    const base = 11 + (Math.floor(Date.now() / 60000) % 17);
    el.textContent = String(base + Math.floor(Math.random() * 5));
}
setInterval(tickViewers, 12000);
tickViewers();

function prepararProximoContenido() {
    proximoContenido = (bloqueActual && bloqueActual !== "zapping")
        ? elegirSiguiente(bloqueActual)
        : elegirSiguiente();
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
    const el = document.getElementById(siguiente.tipo === "proximo" ? "osd-proximo" : "osd-titulo");
    if (el) {
        el.querySelector(".osd-texto").textContent = siguiente.texto;
        el.classList.add("visible");
        osdTimeout = setTimeout(() => {
            el.classList.remove("visible");
            procesandoOSD = false;
            setTimeout(procesarColaOSD, 400);
        }, OSD_DURACION_VISIBLE);
    }
}

function limpiarColaOSD() {
    colaOSD = [];
    procesandoOSD = false;
    if (osdTimeout) clearTimeout(osdTimeout);
    const t = document.getElementById("osd-titulo");
    const p = document.getElementById("osd-proximo");
    if (t) t.classList.remove("visible");
    if (p) p.classList.remove("visible");
}

function avanzarProgramacion() {
    if (!tvEncendida) return;
    const terminoUnBumper = itemActual && itemActual.bloque === "bumper";
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
    const video = elegirSiguiente(bloqueActual && bloqueActual !== "zapping" ? bloqueActual : null);
    if (video) mostrarEnPantalla(video);
}

let fallosSeguidos = 0;
const MAX_FALLOS_SEGUIDOS = 3;
const MAX_REINTENTOS_MISMO = 2;
let reintentosMismo = 0;
let ultimoTiempoBueno = 0;

function esLargo(duration) {
    return duration && isFinite(duration) && duration >= 25 * 60;
}

document.querySelectorAll(".video-layer").forEach(layer => {
    layer.addEventListener("loadedmetadata", function () {
        if (this.dataset.randomStart === "true") {
            if (this.duration && isFinite(this.duration)) {
                if (esLargo(this.duration)) {
                    const a = 10 * 60;
                    const b = 15 * 60;
                    this.currentTime = Math.min(a + Math.random() * (b - a), this.duration * 0.2);
                } else {
                    this.currentTime = this.duration * (0.04 + Math.random() * 0.05);
                }
            }
            delete this.dataset.randomStart;
        } else if (this.dataset.targetOffset) {
            const target = parseFloat(this.dataset.targetOffset);
            this.currentTime = (this.duration && this.duration < target) ? Math.max(0, this.duration - 30) : target;
            delete this.dataset.targetOffset;
        }
        if (itemActual && itemActual.duracion && !this._durTimer) {
            const ms = Number(itemActual.duracion);
            if (ms > 0) {
                this._durTimer = setTimeout(() => {
                    this._durTimer = null;
                    avanzarProgramacion();
                }, ms);
            }
        }
    });

    layer.addEventListener("ended", function () {
        if (!this.classList.contains("activa")) return;
        fallosSeguidos = 0;
        reintentosMismo = 0;
        ultimoTiempoBueno = 0;
        if (this._durTimer) { clearTimeout(this._durTimer); this._durTimer = null; }
        avanzarProgramacion();
    });

    layer.addEventListener("timeupdate", function () {
        if (!this.classList.contains("activa")) return;
        if (this.currentTime > 2) {
            ultimoTiempoBueno = this.currentTime;
            fallosSeguidos = 0;
        }
        if (!itemActual || itemActual.bloque === "bumper") return;
        if (this.dataset.anuncioHecho === "true") return;
        if (!this.duration || !isFinite(this.duration)) return;
        if (this.currentTime / this.duration >= 0.66) {
            this.dataset.anuncioHecho = "true";
            encolarOSD("titulo", itemActual.titulo);
            if (proximoContenido) encolarOSD("proximo", proximoContenido.titulo);
        }
    });

    layer.addEventListener("error", function () {
        if (!tvEncendida) return;
        if (!this.classList.contains("activa")) return;

        if (itemActual && itemActual.url_video && ultimoTiempoBueno > 20 && reintentosMismo < MAX_REINTENTOS_MISMO) {
            reintentosMismo++;
            const t = Math.max(0, ultimoTiempoBueno - 3);
            const url = itemActual.url_video;
            setTimeout(() => {
                this.src = url;
                this.dataset.randomStart = "false";
                this.dataset.targetOffset = String(t);
                this.play().catch(() => {});
            }, 1500);
            return;
        }

        reintentosMismo = 0;
        ultimoTiempoBueno = 0;
        fallosSeguidos++;
        if (fallosSeguidos > MAX_FALLOS_SEGUIDOS) {
            fallosSeguidos = 0;
            mostrarFueraDeAire();
            return;
        }
        setTimeout(avanzarProgramacion, 1200);
    });
});

document.addEventListener("click", function (e) {
    const menu = document.getElementById("osd-menu");
    const btnMenu = document.getElementById("btn-menu");
    if (menu.classList.contains("activo") && !menu.contains(e.target) && e.target !== btnMenu) {
        menu.classList.remove("activo");
    }
});

generarMenuOSD();
cargarPlaylist().then(() => { validarBiblioteca(); });

const capaEstatica = document.getElementById("estatica");
function mostrarEstatica() { if (capaEstatica) capaEstatica.classList.add("visible"); }
function ocultarEstatica() { if (capaEstatica) capaEstatica.classList.remove("visible"); }

document.querySelectorAll(".video-layer").forEach(video => {
    video.addEventListener("waiting", mostrarEstatica);
    video.addEventListener("stalled", mostrarEstatica);
    video.addEventListener("error", mostrarEstatica);
    video.addEventListener("playing", ocultarEstatica);
    video.addEventListener("canplay", ocultarEstatica);
});
