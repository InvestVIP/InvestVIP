const SUPABASE_URL = 'https://udoyasqceikatyxizodm.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_7UtlHB8x21aypLw2rCHoTQ_qBQ_TFkz'; 
let supabaseClient;
const tg = window.Telegram.WebApp;

const userId = tg.initDataUnsafe?.user?.id ? String(tg.initDataUnsafe.user.id) : '8754466303';
const userName = tg.initDataUnsafe?.user?.first_name || 'Inversionista';

function iniciarApp() {
    if (!window.supabase) { setTimeout(iniciarApp, 100); return; }
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
    if (tg) { tg.ready(); tg.expand(); }
    cargarDatos();
    setInterval(procesarPagosDiarios, 60000); 
}

async function cargarDatos() {
    try {
        if (userId === "8754466303") document.getElementById('btn-admin-tab').style.display = 'flex';
        let { data: u } = await supabaseClient.from('usuarios').select('*').eq('id_telegram', userId).maybeSingle();
        if (!u) {
            const { data: n } = await supabaseClient.from('usuarios').insert([{ id_telegram: userId, saldo_deposito: 0, saldo_retirable: 0, total_retirado: 0 }]).select().single();
            u = n;
        }
        document.getElementById('username').innerText = userName;
        document.getElementById('home-saldo-deposito').innerText = "$" + (u.saldo_deposito || 0).toFixed(2);
        document.getElementById('home-saldo-retirable').innerText = "$" + (u.saldo_retirable || 0).toFixed(2);
        document.getElementById('home-total-retirado').innerText = "$" + (u.total_retirado || 0).toFixed(2);
        document.getElementById('withdraw-available').innerText = "$" + (u.saldo_retirable || 0).toFixed(2);
        actualizarMisPlanes();
        actualizarHistorialHome();
    } catch (e) { console.error(e); }
}

function nav(id) {
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'block';
    if (id === 'section-admin') cargarAdmin();
    if (id === 'section-deposit') cargarStatusLocal('deposito', 'status-depositos');
    if (id === 'section-withdraw') cargarStatusLocal('retiro', 'status-retiros');
    cargarDatos();
}

async function invertir(costo, nombre, ganancia) {
    let { data: u } = await supabaseClient.from('usuarios').select('saldo_deposito').eq('id_telegram', userId).single();
    if (u?.saldo_deposito >= costo) {
        await supabaseClient.from('usuarios').update({ saldo_deposito: u.saldo_deposito - costo }).eq('id_telegram', userId);
        await supabaseClient.from('planes_activos').insert([{ 
            id_telegram: userId, nombre_plan: nombre, monto_invertido: costo, 
            ganancia_diaria: ganancia, activo: true, ultima_bonificacion: new Date().toISOString() 
        }]);
        alert("🚀 ¡Plan " + nombre + " Activado! Tu minero ha comenzado a operar.");
        nav('section-home');
    } else alert("❌ Saldo de depósito insuficiente.");
}

async function verifyTx() {
    const hash = document.getElementById('tx-hash').value;
    const montoDeclarado = parseFloat(document.getElementById('dep-amount').value);
    if (hash.length < 5 || isNaN(montoDeclarado)) return alert("Por favor ingresa monto y hash válido.");
    await supabaseClient.from('solicitudes').insert([{ id_telegram: userId, tipo: 'deposito', detalles: hash, estado: 'pendiente', monto: montoDeclarado }]);
    alert("⌛ Procesando Deposito en red Bep20, Verifique en Historial al ser procesado");
    nav('section-home');
}

async function procesarRetiro() {
    const monto = parseFloat(document.getElementById('withdraw-amount').value);
    const wallet = document.getElementById('withdraw-wallet').value;
    if (!wallet || monto < 5) return alert("Monto mínimo $5.");
    let { data: u } = await supabaseClient.from('usuarios').select('saldo_retirable').eq('id_telegram', userId).single();
    if (u?.saldo_retirable >= monto) {
        await supabaseClient.from('solicitudes').insert([{ id_telegram: userId, tipo: 'retiro', monto: monto, detalles: wallet, estado: 'pendiente' }]);
        alert("✅ ¡Retiro en proceso de verificacion! Consulte en historial.");
        nav('section-home');
    } else alert("Saldo insuficiente.");
}

async function actualizarMisPlanes() {
    let { data: planes } = await supabaseClient.from('planes_activos').select('*').eq('id_telegram', userId).eq('activo', true);
    const div = document.getElementById('lista-planes');
    let total = 0; div.innerHTML = "";
    planes?.forEach(p => {
        total += p.ganancia_diaria;
        let tag = p.nombre_plan.toLowerCase();
        div.innerHTML += `<div class="status-item border-${tag}"><b>${p.nombre_plan.toUpperCase()}</b><div class="price-neon">+$${p.ganancia_diaria.toFixed(2)}/día</div></div>`;
    });
    document.getElementById('home-estimado-diario').innerText = "$" + total.toFixed(2);
}

async function actualizarHistorialHome() {
    // Filtrar para que no salgan registros de ganancia en 0.00
    let { data: h } = await supabaseClient.from('solicitudes').select('*').eq('id_telegram', userId).neq('monto', 0).order('fecha', {ascending: false}).limit(10);
    const div = document.getElementById('lista-historial'); div.innerHTML = "";
    h?.forEach(s => {
        let color = s.tipo === 'retiro' ? '#f85149' : (s.tipo === 'deposito' ? '#3fb950' : '#00ffcc');
        div.innerHTML += `<div class="status-item"><span>${s.tipo.toUpperCase()}</span><strong style="color:${color}">${s.tipo==='retiro'?'-':'+'}$${s.monto.toFixed(2)}</strong></div>`;
    });
}

async function cargarStatusLocal(tipo, divId) {
    let { data: items } = await supabaseClient.from('solicitudes').select('*').eq('id_telegram', userId).eq('tipo', tipo).order('fecha', {ascending: false});
    const div = document.getElementById(divId); div.innerHTML = "";
    items?.forEach(i => {
        let color = i.estado === 'pendiente' ? '#f7931a' : (i.estado === 'completado' ? '#3fb950' : '#f85149');
        div.innerHTML += `<div class="status-item"><span>$${i.monto}</span><b style="color:${color}">${i.estado.toUpperCase()}</b></div>`;
    });
}

// FUNCIONES ADMIN MEJORADAS
async function cargarAdmin() {
    const dList = document.getElementById('admin-dep-list');
    const rList = document.getElementById('admin-ret-list');
    const gList = document.getElementById('admin-global-log');
    dList.innerHTML = ""; rList.innerHTML = ""; gList.innerHTML = "";

    let { data: pend } = await supabaseClient.from('solicitudes').select('*').eq('estado', 'pendiente');
    pend?.forEach(s => {
        const item = `<div class="admin-card-mini">
            <small>ID: ${s.id_telegram}</small><br>
            <b onclick="copyText('${s.detalles}')" style="color:#58a6ff; cursor:pointer">📋 COPIAR DATOS</b><br>
            ${s.tipo==='retiro'?'RET: $'+s.monto:'DEP: $'+s.monto}<br>
            <button onclick="gestionarAdmin('${s.id}','${s.id_telegram}','${s.tipo}',${s.monto})">PROCESAR</button>
        </div>`;
        if(s.tipo === 'deposito') dList.innerHTML += item; else rList.innerHTML += item;
    });

    // Cargar Log Global de aprobados
    let { data: log } = await supabaseClient.from('solicitudes').select('*').neq('estado', 'pendiente').order('fecha', {ascending: false}).limit(10);
    log?.forEach(l => {
        gList.innerHTML += `<div class="status-item"><small>${l.id_telegram}</small><strong>$${l.monto} (${l.tipo})</strong><small style="color:#3fb950">APROBADO</small></div>`;
    });
}

async function gestionarAdmin(id, userT, tipo, montoOri) {
    if (tipo === 'deposito') {
        let real = parseFloat(prompt("Validar monto REAL a acreditar (Usuario dijo: $" + montoOri + "):", montoOri));
        if (isNaN(real) || real <= 0) return;
        let { data: u } = await supabaseClient.from('usuarios').select('saldo_deposito').eq('id_telegram', userT).single();
        await supabaseClient.from('usuarios').update({ saldo_deposito: (u.saldo_deposito || 0) + real }).eq('id_telegram', userT);
        await supabaseClient.from('solicitudes').update({ monto: real, estado: 'completado', fecha: new Date().toISOString() }).eq('id', id);
    } else {
        let hash = prompt("Ingresa el HASH de pago realizado para el usuario:");
        if (!hash) return;
        let { data: u } = await supabaseClient.from('usuarios').select('*').eq('id_telegram', userT).single();
        await supabaseClient.from('usuarios').update({ saldo_retirable: u.saldo_retirable - montoOri, total_retirado: (u.total_retirado || 0) + montoOri }).eq('id_telegram', userT);
        await supabaseClient.from('solicitudes').update({ detalles: hash, estado: 'completado', fecha: new Date().toISOString() }).eq('id', id);
    }
    alert("Operación completada con éxito."); cargarAdmin();
}

async function procesarPagosDiarios() {
    let { data: planes } = await supabaseClient.from('planes_activos').select('*').eq('activo', true);
    const ahora = new Date();
    for (let p of planes) {
        if ((ahora - new Date(p.ultima_bonificacion)) >= 24*60*60*1000) {
            let { data: u } = await supabaseClient.from('usuarios').select('saldo_retirable').eq('id_telegram', p.id_telegram).single();
            await supabaseClient.from('usuarios').update({ saldo_retirable: (u.saldo_retirable || 0) + p.ganancia_diaria }).eq('id_telegram', p.id_telegram);
            await supabaseClient.from('planes_activos').update({ ultima_bonificacion: ahora.toISOString() }).eq('id', p.id);
            await supabaseClient.from('solicitudes').insert([{ id_telegram: p.id_telegram, tipo: 'ganancia', monto: p.ganancia_diaria, estado: 'completado' }]);
        }
    }
}

function copyText(txt) { navigator.clipboard.writeText(txt); alert("✅ Copiado al portapapeles"); }
document.addEventListener('DOMContentLoaded', iniciarApp);
