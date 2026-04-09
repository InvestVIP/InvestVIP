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
    else if (id === 'section-history') cargarHistorialUnificado();
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

async function cargarHistorialUnificado() {
    const hDiv = document.getElementById('lista-historial-completo');
    hDiv.innerHTML = "<p style='text-align:center;'>Cargando registros...</p>";

    // Traemos solicitudes (depósitos, retiros, ganancias) y planes (activaciones)
    const [solRes, planRes] = await Promise.all([
        supabaseClient.from('solicitudes').select('*').eq('id_telegram', userId),
        supabaseClient.from('planes_activos').select('*').eq('id_telegram', userId)
    ]);

    let rawData = [];

    // Procesar solicitudes de la tabla 'solicitudes'
    solRes.data?.forEach(s => {
        let esGasto = s.tipo === 'retiro';
        rawData.push({
            desc: s.tipo.toUpperCase(),
            monto: s.monto,
            estado: s.estado,
            color: esGasto ? '#f85149' : '#3fb950',
            signo: esGasto ? '-' : '+',
            fecha: new Date(s.fecha || Date.now())
        });
    });

    // Procesar activaciones de la tabla 'planes_activos'
    planRes.data?.forEach(p => {
        rawData.push({
            desc: `ACTIVACIÓN PLAN ${p.nombre_plan.toUpperCase()}`,
            monto: p.monto_invertido,
            estado: 'completado',
            color: '#f85149',
            signo: '-',
            fecha: new Date(p.fecha_inicio || Date.now())
        });
    });

    // Ordenar por fecha (más nuevo primero)
    rawData.sort((a, b) => b.fecha - a.fecha);

    hDiv.innerHTML = "";
    if (rawData.length === 0) hDiv.innerHTML = "<p style='text-align:center; color:#8b949e;'>Sin movimientos.</p>";

    rawData.forEach(item => {
        hDiv.innerHTML += `
            <div class="status-item">
                <div style="display:flex; flex-direction:column;">
                    <span>${item.desc}</span>
                    <small style="font-size:0.7em; color:#8b949e;">${item.estado.toUpperCase()}</small>
                </div>
                <strong style="color:${item.color}">${item.signo}$${item.monto.toFixed(2)}</strong>
            </div>`;
    });
}

async function verifyTx() {
    const hash = document.getElementById('tx-hash').value;
    const monto = parseFloat(document.getElementById('dep-amount').value) || 0;
    if (hash.length < 5) return alert("Hash inválido.");
    await supabaseClient.from('solicitudes').insert([{ id_telegram: userId, tipo: 'deposito', detalles: hash, estado: 'pendiente', monto: monto }]);
    alert("Procesando pago...");
    nav('section-home');
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
        nav('section-home');
    } else alert("Saldo insuficiente.");
}

async function cargarAdmin() {
    const depDiv = document.getElementById('admin-dep-list');
    const retDiv = document.getElementById('admin-ret-list');
    depDiv.innerHTML = ""; retDiv.innerHTML = "";
    let { data: sols } = await supabaseClient.from('solicitudes').select('*').eq('estado', 'pendiente');
    sols?.forEach(s => {
        const item = `<div class="admin-card-mini"><small>${s.id_telegram}</small><br><strong>$${s.monto}</strong><br><button onclick="gestionarAdmin('${s.id}','${s.tipo}')">OK</button></div>`;
        if(s.tipo === 'deposito') depDiv.innerHTML += item; else retDiv.innerHTML += item;
    });
}

async function procesarRetiro() {
    const monto = parseFloat(document.getElementById('withdraw-amount').value);
    const wallet = document.getElementById('withdraw-wallet').value;
    if (!wallet || monto < 5) return alert("Monto mínimo $5.");
    let { data: u } = await supabaseClient.from('usuarios').select('saldo_retirable').eq('id_telegram', userId).single();
    if (u?.saldo_retirable >= monto) {
        await supabaseClient.from('solicitudes').insert([{ id_telegram: userId, tipo: 'retiro', monto: monto, detalles: wallet, estado: 'pendiente' }]);
        alert("Solicitud de retiro enviada."); 
        cargarDatos();
        nav('section-home');
    } else alert("Saldo insuficiente.");
}

function copyWallet() { navigator.clipboard.writeText("0xd6fe607116c1df2b4dae56e77ffdae50cde9d153"); alert("Copiado"); }
document.addEventListener('DOMContentLoaded', iniciarApp);
