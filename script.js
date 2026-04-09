const SUPABASE_URL = 'https://udoyasqceikatyxizodm.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_7UtlHB8x21aypLw2rCHoTQ_qBQ_TFkz'; 
let supabaseClient;
const tg = window.Telegram.WebApp;

const userId = tg.initDataUnsafe?.user?.id ? String(tg.initDataUnsafe.user.id) : '8754466303';
const userName = tg.initDataUnsafe?.user?.first_name || 'Admin';

function iniciarApp() {
    if (!window.supabase) { setTimeout(iniciarApp, 100); return; }
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
    cargarDatos();
    setInterval(procesarPagosDiarios, 60000);
    setInterval(actualizarRelojPago, 1000);
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

async function actualizarRelojPago() {
    let { data: planes } = await supabaseClient.from('planes_activos').select('ultima_bonificacion').eq('id_telegram', userId).eq('activo', true).order('ultima_bonificacion', {ascending: true}).limit(1);
    const timerDiv = document.getElementById('countdown-timer');
    if (!planes || planes.length === 0) { timerDiv.innerText = "Sin planes activos"; return; }

    const proximo = new Date(new Date(planes[0].ultima_bonificacion).getTime() + 24*60*60*1000);
    const diff = proximo - new Date();
    if (diff <= 0) { timerDiv.innerText = "Procesando pago..."; return; }
    
    const h = Math.floor(diff/3600000).toString().padStart(2, '0');
    const m = Math.floor((diff%3600000)/60000).toString().padStart(2, '0');
    const s = Math.floor((diff%60000)/1000).toString().padStart(2, '0');
    timerDiv.innerText = `${h}:${m}:${s}`;
}

async function procesarRetiro() {
    const monto = parseFloat(document.getElementById('withdraw-amount').value);
    const wallet = document.getElementById('withdraw-wallet').value;
    if (!wallet || monto < 5) return alert("Monto mínimo $5.");

    // Validación 48 horas
    let { data: ultRetiro } = await supabaseClient.from('solicitudes').select('fecha').eq('id_telegram', userId).eq('tipo', 'retiro').order('fecha', {ascending: false}).limit(1);
    if (ultRetiro.length > 0) {
        const transcurrido = new Date() - new Date(ultRetiro[0].fecha);
        if (transcurrido < 48*60*60*1000) {
            const horasFaltantes = (48 - (transcurrido/3600000)).toFixed(1);
            return alert(`🚫 Solo un retiro cada 48h. Faltan aprox ${horasFaltantes} horas.`);
        }
    }

    let { data: u } = await supabaseClient.from('usuarios').select('saldo_retirable').eq('id_telegram', userId).single();
    if (u?.saldo_retirable >= monto) {
        await supabaseClient.from('solicitudes').insert([{ id_telegram: userId, tipo: 'retiro', monto: monto, detalles: wallet, estado: 'pendiente' }]);
        alert("✅ Retiro solicitado. Verifique en historial.");
        nav('section-home');
    } else alert("Saldo insuficiente.");
}

async function actualizarHistorialHome() {
    let { data: h } = await supabaseClient.from('solicitudes').select('*').eq('id_telegram', userId).order('fecha', {ascending: false}).limit(15);
    const div = document.getElementById('lista-historial'); div.innerHTML = "";
    h?.forEach(s => {
        let color = s.tipo === 'retiro' ? '#f85149' : (s.tipo === 'deposito' ? '#3fb950' : '#00ffcc');
        let txtHash = s.detalles && s.detalles.length > 10 ? s.detalles.substring(0,8)+'...' : '';
        let fechaS = new Date(s.fecha).toLocaleString([], {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
        div.innerHTML += `
            <div class="status-item">
                <div style="display:flex; flex-direction:column;">
                    <span>${s.tipo.toUpperCase()}</span>
                    <small style="font-size:0.65em; color:#8b949e;">${fechaS} | ${txtHash}</small>
                </div>
                <strong style="color:${color}">${s.tipo==='retiro'?'-':'+'}$${s.monto.toFixed(2)}</strong>
            </div>`;
    });
}

// LOGICA ADMIN - SEPARADA
async function cargarAdmin() {
    const dList = document.getElementById('admin-dep-list');
    const rList = document.getElementById('admin-ret-list');
    const gList = document.getElementById('admin-global-log');
    dList.innerHTML = ""; rList.innerHTML = ""; gList.innerHTML = "";

    let { data: pend } = await supabaseClient.from('solicitudes').select('*').eq('estado', 'pendiente');
    pend?.forEach(s => {
        let fechaS = new Date(s.fecha).toLocaleString([], {day:'2-digit', month:'2-digit'});
        const item = `<div class="admin-card-mini">
            <small>${fechaS} | ID: ${s.id_telegram}</small><br>
            <span onclick="copyText('${s.detalles}')" style="color:#58a6ff; font-size:0.8em; cursor:pointer;">📋 INFO: ${s.detalles.substring(0,10)}...</span><br>
            <b>$${s.monto}</b> <button onclick="gestionarAdmin('${s.id}','${s.id_telegram}','${s.tipo}',${s.monto})">OK</button>
        </div>`;
        if(s.tipo === 'deposito') dList.innerHTML += item; else rList.innerHTML += item;
    });

    let { data: logs } = await supabaseClient.from('solicitudes').select('*').neq('estado', 'pendiente').order('fecha', {ascending: false}).limit(15);
    logs?.forEach(l => {
        gList.innerHTML += `<div class="status-item"><small>${l.id_telegram}</small><strong>$${l.monto} (${l.tipo})</strong><small>${l.estado}</small></div>`;
    });
}

// RESTO DE FUNCIONES (INVERTIR, VERIFYTX, ETC SE MANTIENEN IGUAL)
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
        alert("Plan Activado."); nav('section-home');
    } else alert("Sin saldo.");
}

async function verifyTx() {
    const hash = document.getElementById('tx-hash').value;
    const monto = parseFloat(document.getElementById('dep-amount').value);
    if (!hash || isNaN(monto)) return alert("Datos incompletos.");
    await supabaseClient.from('solicitudes').insert([{ id_telegram: userId, tipo: 'deposito', detalles: hash, estado: 'pendiente', monto: monto }]);
    alert("Procesando depósito..."); nav('section-home');
}

async function actualizarMisPlanes() {
    let { data: planes } = await supabaseClient.from('planes_activos').select('*').eq('id_telegram', userId).eq('activo', true);
    const div = document.getElementById('lista-planes'); div.innerHTML = "";
    planes?.forEach(p => {
        let tag = p.nombre_plan.toLowerCase();
        div.innerHTML += `<div class="status-item border-${tag}"><b>${p.nombre_plan.toUpperCase()}</b><div class="price-neon">+$${p.ganancia_diaria.toFixed(2)}/día</div></div>`;
    });
}

async function cargarStatusLocal(tipo, divId) {
    let { data: items } = await supabaseClient.from('solicitudes').select('*').eq('id_telegram', userId).eq('tipo', tipo).order('fecha', {ascending: false});
    const div = document.getElementById(divId); div.innerHTML = "";
    items?.forEach(i => {
        let color = i.estado === 'pendiente' ? '#f7931a' : (i.estado === 'completado' ? '#3fb950' : '#f85149');
        let fechaS = new Date(i.fecha).toLocaleString([], {day:'2-digit', month:'2-digit'});
        div.innerHTML += `<div class="status-item"><div>$${i.monto} <small>(${fechaS})</small></div><b style="color:${color}">${i.estado.toUpperCase()}</b></div>`;
    });
}

async function gestionarAdmin(id, userT, tipo, montoOri) {
    if (tipo === 'deposito') {
        let real = parseFloat(prompt("Monto real a cargar:", montoOri));
        if (isNaN(real)) return;
        let { data: u } = await supabaseClient.from('usuarios').select('saldo_deposito').eq('id_telegram', userT).single();
        await supabaseClient.from('usuarios').update({ saldo_deposito: (u.saldo_deposito || 0) + real }).eq('id_telegram', userT);
        await supabaseClient.from('solicitudes').update({ monto: real, estado: 'completado', fecha: new Date().toISOString() }).eq('id', id);
    } else {
        let hash = prompt("Hash de pago:");
        if (!hash) return;
        let { data: u } = await supabaseClient.from('usuarios').select('*').eq('id_telegram', userT).single();
        await supabaseClient.from('usuarios').update({ saldo_retirable: u.saldo_retirable - montoOri, total_retirado: (u.total_retirado || 0) + montoOri }).eq('id_telegram', userT);
        await supabaseClient.from('solicitudes').update({ detalles: hash, estado: 'completado', fecha: new Date().toISOString() }).eq('id', id);
    }
    cargarAdmin();
}

async function procesarPagosDiarios() {
    let { data: planes } = await supabaseClient.from('planes_activos').select('*').eq('activo', true);
    const ahora = new Date();
    for (let p of planes) {
        if ((ahora - new Date(p.ultima_bonificacion)) >= 24*60*60*1000) {
            let { data: u } = await supabaseClient.from('usuarios').select('saldo_retirable').eq('id_telegram', p.id_telegram).single();
            await supabaseClient.from('usuarios').update({ saldo_retirable: (u.saldo_retirable || 0) + p.ganancia_diaria }).eq('id_telegram', p.id_telegram);
            await supabaseClient.from('planes_activos').update({ ultima_bonificacion: ahora.toISOString() }).eq('id', p.id);
            await supabaseClient.from('solicitudes').insert([{ id_telegram: p.id_telegram, tipo: 'ganancia', monto: p.ganancia_diaria, estado: 'completado', detalles: 'Pago Automático' }]);
            if (p.id_telegram === userId) actualizarHistorialHome();
        }
    }
}

function copyText(txt) { navigator.clipboard.writeText(txt); alert("Copiado"); }
document.addEventListener('DOMContentLoaded', iniciarApp);
