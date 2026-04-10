const SUPABASE_URL = 'https://udoyasqceikatyxizodm.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_7UtlHB8x21aypLw2rCHoTQ_qBQ_TFkz'; 

let supabaseClient;
const tg = window.Telegram.WebApp;

function iniciarApp() {
    if (!window.supabase) { setTimeout(iniciarApp, 100); return; }
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
    if (tg) { tg.ready(); tg.expand(); }
    cargarDatos();
    iniciarRelojPagos();
}

const userId = tg.initDataUnsafe?.user?.id ? String(tg.initDataUnsafe.user.id) : '8754466303';
const userName = tg.initDataUnsafe?.user?.first_name || 'Admin PC';

function nav(id) {
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'block';
    if (id === 'section-admin') cargarAdmin();
    else if (id === 'section-history') cargarHistorialUnificado();
    else cargarDatos();
}

function iniciarRelojPagos() {
    const timerElement = document.getElementById('payout-timer');
    if (!timerElement) return;

    setInterval(() => {
        const ahora = new Date();
        const proximoPago = new Date();
        proximoPago.setUTCHours(24, 0, 0, 0); 

        const diferencia = proximoPago - ahora;

        if (diferencia <= 0) {
            timerElement.innerText = "PROCESANDO...";
            return;
        }

        const horas = Math.floor((diferencia / (1000 * 60 * 60)) % 24);
        const minutos = Math.floor((diferencia / 1000 / 60) % 60);
        const segundos = Math.floor((diferencia / 1000) % 60);

        timerElement.innerText = 
            `${horas.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`;
    }, 1000);
}

async function cargarDatos() {
    try {
        if (userId === "8754466303") document.getElementById('btn-admin-tab').style.display = 'flex';
        let { data: u } = await supabaseClient.from('usuarios').select('*').eq('id_telegram', userId).maybeSingle();
        if (!u) {
            const { data: n } = await supabaseClient.from('usuarios').insert([{ id_telegram: userId, saldo_deposito: 0, saldo_retirable: 0 }]).select().single();
            u = n;
        }
        document.getElementById('username').innerText = userName;
        document.getElementById('home-saldo-deposito').innerText = (u.saldo_deposito || 0).toFixed(2);
        document.getElementById('home-saldo-retirable').innerText = (u.saldo_retirable || 0).toFixed(2);
        document.getElementById('withdraw-available').innerText = "$" + (u.saldo_retirable || 0).toFixed(2);
        actualizarMisPlanes();
    } catch (e) { console.error(e); }
}

async function actualizarMisPlanes() {
    let { data: planes } = await supabaseClient.from('planes_activos').select('*').eq('id_telegram', userId).eq('activo', true);
    const pDiv = document.getElementById('lista-planes');
    let total = 0;
    pDiv.innerHTML = "";
    planes?.forEach(p => {
        total += p.ganancia_diaria;
        let tag = p.nombre_plan.toLowerCase();
        pDiv.innerHTML += `<div class="status-item border-${tag}"><strong>${p.nombre_plan.toUpperCase()}</strong> <span>$${p.ganancia_diaria.toFixed(2)}/día</span></div>`;
    });
    document.getElementById('home-estimado-diario').innerText = "$" + total.toFixed(2);
}

// ==========================================
// FUNCIÓN DE HISTORIAL ACTUALIZADA (ESTILO TARJETAS + ABONOS DIARIOS)
// ==========================================
async function cargarHistorialUnificado() {
    const container = document.getElementById('historial-container');
    container.innerHTML = "<p style='text-align:center; color:white;'>Cargando historial...</p>";

    try {
        const [solRes, planRes] = await Promise.all([
            supabaseClient.from('solicitudes').select('*').eq('id_telegram', userId),
            supabaseClient.from('planes_activos').select('*').eq('id_telegram', userId)
        ]);

        const grupos = {
            ganancias: { titulo: 'Ganancias por Minería', icono: '⚡', items: [], total: 0 },
            depositos: { titulo: 'Mis depósitos', icono: '📥', items: [], total: 0 },
            retiros: { titulo: 'Mis retiros', icono: '📤', items: [], total: 0 },
            activaciones: { titulo: 'Activaciones de Planes', icono: '💎', items: [], total: 0 }
        };

        // Procesar Solicitudes
        solRes.data?.forEach(s => {
            const item = {
                monto: s.monto,
                fecha: new Date(s.fecha || Date.now()).toISOString().split('T')[0],
                estado: s.estado,
                colorClass: s.tipo === 'retiro' ? 'amount-negative' : 'amount-positive'
            };

            if (s.tipo === 'deposito') {
                grupos.depositos.items.push(item);
                if (s.estado === 'completado') grupos.depositos.total += s.monto;
            } else if (s.tipo === 'retiro') {
                grupos.retiros.items.push(item);
                if (s.estado === 'completado') grupos.retiros.total += s.monto;
            }
        });

        // Procesar Activaciones y Calcular Abonos Diarios
        const hoy = new Date();
        planRes.data?.forEach(p => {
            // Activación
            grupos.activaciones.items.push({
                monto: p.monto_invertido,
                fecha: new Date(p.fecha_inicio).toISOString().split('T')[0],
                estado: 'completado',
                colorClass: 'amount-negative'
            });
            grupos.activaciones.total += p.monto_invertido;

            // Lógica de Abonos Diarios
            const fechaInicio = new Date(p.fecha_inicio);
            const diasTranscurridos = Math.floor((hoy - fechaInicio) / (1000 * 60 * 60 * 24));

            for (let i = 1; i <= diasTranscurridos; i++) {
                const fechaAbono = new Date(fechaInicio);
                fechaAbono.setDate(fechaInicio.getDate() + i);
                
                grupos.ganancias.items.push({
                    monto: p.ganancia_diaria,
                    fecha: fechaAbono.toISOString().split('T')[0],
                    estado: 'completado',
                    colorClass: 'amount-positive'
                });
                grupos.ganancias.total += p.ganancia_diaria;
            }
        });

        container.innerHTML = "";

        const renderizarTarjeta = (grupo) => {
            if (grupo.items.length === 0) return '';
            grupo.items.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

            let itemsHTML = '';
            grupo.items.forEach(item => {
                const iconoEstado = item.estado === 'completado' ? '✓' : '⏳';
                const claseEstado = item.estado === 'completado' ? 'status-completed' : 'status-pending';
                itemsHTML += `
                    <div class="history-item-row">
                        <span class="history-amount ${item.colorClass}">${item.monto.toFixed(2)}$</span>
                        <span class="history-date">${item.fecha}</span>
                        <span class="history-status ${claseEstado}">${iconoEstado} ${item.estado}</span>
                    </div>`;
            });

            return `
                <div class="history-group-card">
                    <div class="history-card-header">
                        <div class="history-card-title">${grupo.icono} ${grupo.titulo}</div>
                        <div class="history-card-total">Total: <strong>${grupo.total.toFixed(2)}$</strong></div>
                    </div>
                    <div class="history-items-list">${itemsHTML}</div>
                </div>`;
        };

        container.innerHTML += renderizarTarjeta(grupos.ganancias);
        container.innerHTML += renderizarTarjeta(grupos.depositos);
        container.innerHTML += renderizarTarjeta(grupos.retiros);
        container.innerHTML += renderizarTarjeta(grupos.activaciones);

        if (container.innerHTML === "") container.innerHTML = "<p style='text-align:center; color:white;'>Sin movimientos.</p>";

    } catch (e) {
        container.innerHTML = "<p style='text-align:center; color:#f85149;'>Error al cargar.</p>";
    }
}

async function invertir(costo) {
    let { data: u } = await supabaseClient.from('usuarios').select('saldo_deposito').eq('id_telegram', userId).single();
    if (u?.saldo_deposito >= costo) {
        let n = costo===11?"Bronce":costo===30?"Plata":costo===60?"Oro":"VIP";
        let g = costo===11?0.65:costo===30?1.66:costo===60?3.00:6.30;
        await supabaseClient.from('usuarios').update({ saldo_deposito: u.saldo_deposito - costo }).eq('id_telegram', userId);
        await supabaseClient.from('planes_activos').insert([{ id_telegram: userId, nombre_plan: n, monto_invertido: costo, ganancia_diaria: g, activo: true, fecha_inicio: new Date().toISOString() }]);
        alert("¡Plan Activado!"); cargarDatos(); nav('section-home');
    } else alert("Saldo insuficiente.");
}

async function procesarRetiro() {
    const monto = parseFloat(document.getElementById('withdraw-amount').value);
    const wallet = document.getElementById('withdraw-wallet').value;
    if (!wallet || monto < 5) return alert("Monto mínimo $5.");

    let { data: ultimaSol } = await supabaseClient.from('solicitudes').select('fecha').eq('id_telegram', userId).eq('tipo', 'retiro').order('fecha', { ascending: false }).limit(1);
    
    if (ultimaSol?.length > 0) {
        const diffHoras = (new Date() - new Date(ultimaSol[0].fecha)) / (1000 * 60 * 60);
        if (diffHoras < 48) {
            return alert(`⚠️ Solo puedes retirar cada 48 horas. Faltan ${(48 - diffHoras).toFixed(1)}h.`);
        }
    }

    let { data: u } = await supabaseClient.from('usuarios').select('saldo_retirable').eq('id_telegram', userId).single();
    if (u?.saldo_retirable >= monto) {
        await supabaseClient.from('solicitudes').insert([{ id_telegram
