const SUPABASE_URL = 'https://udoyasqceikatyxizodm.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_7UtlHB8x21aypLw2rCHoTQ_qBQ_TFkz'; 

let supabaseClient;
const tg = window.Telegram.WebApp;

function iniciarApp() {
    if (!window.supabase) { setTimeout(iniciarApp, 100); return; }
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
    if (tg) { tg.ready(); tg.expand(); }
    cargarDatos();
}

const userId = tg.initDataUnsafe?.user?.id ? String(tg.initDataUnsafe.user.id) : '8754466303';
const userName = tg.initDataUnsafe?.user?.first_name || 'Admin PC';

function nav(id) {
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'block';
    if (id === 'section-admin') cargarAdmin();
    else cargarDatos();
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
        document.getElementById('home-total-retirado').innerText = (u.total_retirado || 0).toFixed(2);
        document.getElementById('withdraw-available').innerText = "$" + (u.saldo_retirable || 0).toFixed(2);
        
        actualizarPlanesVisuales();
        actualizarHistorialVisual();
    } catch (e) { console.error(e); }
}

async function actualizarPlanesVisuales() {
    let { data: planes } = await supabaseClient.from('planes_activos').select('*').eq('id_telegram', userId).eq('activo', true);
    const pDiv = document.getElementById('lista-planes');
    let total = 0;
    pDiv.innerHTML = "";
    planes?.forEach(p => {
        total += p.ganancia_diaria;
        pDiv.innerHTML += `<div class="admin-historial-item"><div><strong>${p.nombre_plan.toUpperCase()}</strong><br><small>+$${p.ganancia_diaria.toFixed(2)}/día</small></div><b>$${p.monto_invertido}</b></div>`;
    });
    document.getElementById('home-estimado-diario').innerText = "$" + total.toFixed(2);
}

async function actualizarHistorialVisual() {
    // 1. Traemos solicitudes (Depósitos y Retiros)
    let { data: sols } = await supabaseClient.from('solicitudes')
        .select('*')
        .eq('id_telegram', userId)
        .neq('tipo', 'ganancia'); // Evitamos los registros de $0 que daban problemas

    // 2. Traemos activaciones desde la tabla que sugeriste (donde SÍ está el monto)
    let { data: actives } = await supabaseClient.from('planes_activos')
        .select('nombre_plan, monto_invertido, fecha_inicio')
        .eq('id_telegram', userId);

    const hDiv = document.getElementById('lista-historial');
    if (!hDiv) return;
    hDiv.innerHTML = "";

    // Creamos un array único para ordenar por fecha
    let historialCompleto = [];

    sols?.forEach(s => historialCompleto.push({
        titulo: s.tipo.toUpperCase(),
        monto: s.monto,
        esGasto: s.tipo === 'retiro',
        fecha: new Date(s.fecha || Date.now())
    }));

    actives?.forEach(a => historialCompleto.push({
        titulo: `ACTIVACIÓN PLAN ${a.nombre_plan.toUpperCase()}`,
        monto: a.monto_invertido,
        esGasto: true,
        fecha: new Date(a.fecha_inicio || Date.now())
    }));

    // Ordenar de más reciente a más antiguo
    historialCompleto.sort((a, b) => b.fecha - a.fecha);

    historialCompleto.slice(0, 10).forEach(item => {
        const color = item.esGasto ? '#f85149' : '#3fb950';
        const signo = item.esGasto ? '-' : '+';
        hDiv.innerHTML += `<div class="admin-historial-item"><span>${item.titulo}</span><strong style="color:${color}">${signo}$${item.monto.toFixed(2)}</strong></div>`;
    });
}

async function invertir(costo) {
    let { data: u } = await supabaseClient.from('usuarios').select('saldo_deposito').eq('id_telegram', userId).single();
    if (u?.saldo_deposito >= costo) {
        let n = costo===11?"Bronce":costo===30?"Plata":costo===60?"Oro":"VIP";
        let g = costo===11?0.65:costo===30?1.66:costo===60?3.00:6.30;
        
        await supabaseClient.from('usuarios').update({ saldo_deposito: u.saldo_deposito - costo }).eq('id_telegram', userId);
        await supabaseClient.from('planes_activos').insert([{ 
            id_telegram: userId, 
            nombre_plan: n, 
            monto_invertido: costo, 
            ganancia_diaria: g, 
            activo: true,
            fecha_inicio: new Date().toISOString() 
        }]);
        
        alert("¡Plan Activado!"); 
        cargarDatos();
    } else alert("Saldo insuficiente.");
}

async function verifyTx() {
    const hash = document.getElementById('tx-hash').value;
    if (hash.length < 5) return alert("Hash inválido.");
    await supabaseClient.from('solicitudes').insert([{ id_telegram: userId, tipo: 'deposito', detalles: hash, estado: 'pendiente', monto: 0 }]);
    alert("Procesando pago...");
}

async function procesarRetiro() {
    const monto = parseFloat(document.getElementById('withdraw-amount').value);
    const wallet = document.getElementById('withdraw-wallet').value;
    if (!wallet || monto < 5) return alert("Monto mínimo $5.");
    let { data: u } = await supabaseClient.from('usuarios').select('saldo_retirable').eq('id_telegram', userId).single();
    if (u?.saldo_retirable >= monto) {
        await supabaseClient.from('solicitudes').insert([{ id_telegram: userId, tipo: 'retiro', monto: monto, detalles: wallet, estado: 'pendiente' }]);
        alert("Solicitud enviada."); cargarDatos();
    } else alert("Saldo insuficiente.");
}

function copyWallet() { navigator.clipboard.writeText("0xd6fe607116c1df2b4dae56e77ffdae50cde9d153"); alert("Copiada."); }

document.addEventListener('DOMContentLoaded', iniciarApp);
