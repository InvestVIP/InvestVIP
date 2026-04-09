const SUPABASE_URL = 'https://udoyasqceikatyxizodm.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_7UtlHB8x21aypLw2rCHoTQ_qBQ_TFkz'; 

let supabaseClient;
const tg = window.Telegram.WebApp;

function iniciarApp() {
    if (!window.supabase) {
        setTimeout(iniciarApp, 100);
        return;
    }
    const { createClient } = window.supabase;
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
    if (tg) { tg.ready(); tg.expand(); }
    cargarDatos();
}

const userId = tg.initDataUnsafe?.user?.id ? String(tg.initDataUnsafe.user.id) : '8754466303';
const userName = tg.initDataUnsafe?.user?.first_name || 'Admin PC';
const ADMIN_ID = "8754466303"; 

function nav(id) {
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    const target = document.getElementById(id);
    if (target) target.style.display = 'block';
    if (id === 'section-admin') cargarAdmin();
    else cargarDatos();
}

async function cargarDatos() {
    try {
        if (userId === ADMIN_ID) {
            document.getElementById('btn-admin-tab').style.display = 'flex';
        }
        let { data: u } = await supabaseClient.from('usuarios').select('*').eq('id_telegram', userId).maybeSingle();
        if (!u) {
            const { data: nuevoU } = await supabaseClient.from('usuarios').insert([{ id_telegram: userId, saldo_deposito: 0, saldo_retirable: 0, total_retirado: 0 }]).select().single();
            u = nuevoU;
        }
        document.getElementById('username').innerText = userName;
        document.getElementById('home-saldo-deposito').innerText = u.saldo_deposito.toFixed(2);
        document.getElementById('home-saldo-retirable').innerText = u.saldo_retirable.toFixed(2);
        document.getElementById('withdraw-available').innerText = "$" + u.saldo_retirable.toFixed(2);
        actualizarPlanesVisuales();
        actualizarHistorialVisual();
    } catch (e) { console.error(e); }
}

async function actualizarPlanesVisuales() {
    let { data: planes } = await supabaseClient.from('planes_activos').select('*').eq('id_telegram', userId).eq('activo', true);
    const pDiv = document.getElementById('lista-planes');
    let total = 0;
    pDiv.innerHTML = planes?.length ? "" : "<p style='color:#666; font-size:0.8em;'>Sin planes activos.</p>";
    planes?.forEach(p => {
        total += p.ganancia_diaria;
        pDiv.innerHTML += `<div class="admin-historial-item"><div><strong>${p.nombre_plan}</strong><br><small>+$${p.ganancia_diaria.toFixed(2)}/día</small></div><b>$${p.monto_invertido}</b></div>`;
    });
    document.getElementById('home-estimado-diario').innerText = "$" + total.toFixed(2);
}

async function actualizarHistorialVisual() {
    let { data: h } = await supabaseClient.from('solicitudes').select('*').eq('id_telegram', userId).order('fecha', {ascending: false}).limit(5);
    const hDiv = document.getElementById('lista-historial');
    hDiv.innerHTML = "";
    h?.forEach(s => {
        let color = s.estado === 'completado' ? '#3fb950' : '#f7931a';
        hDiv.innerHTML += `<div class="admin-historial-item"><span>${s.tipo.toUpperCase()}</span><strong style="color:${color}">$${s.monto.toFixed(2)}</strong></div>`;
    });
}

async function invertir(costo) {
    let { data: u } = await supabaseClient.from('usuarios').select('saldo_deposito').eq('id_telegram', userId).single();
    if (u?.saldo_deposito >= costo) {
        let n = costo===11?"Bronce":costo===30?"Plata":costo===60?"Oro":"VIP";
        let g = costo===11?0.65:costo===30?1.66:costo===60?3.00:6.30;
        await supabaseClient.from('usuarios').update({ saldo_deposito: u.saldo_deposito - costo }).eq('id_telegram', userId);
        await supabaseClient.from('planes_activos').insert([{ id_telegram: userId, nombre_plan: n, monto_invertido: costo, ganancia_diaria: g, activo: true }]);
        alert("¡Plan " + n + " Activado!"); cargarDatos();
    } else alert("Saldo insuficiente.");
}

async function verifyTx() {
    const hash = document.getElementById('tx-hash').value;
    if (hash.length < 10) return alert("Hash inválido.");
    await supabaseClient.from('solicitudes').insert([{ id_telegram: userId, tipo: 'deposito', detalles: hash, estado: 'pendiente', monto: 0 }]);
    alert("Deposito en proceso, verifique proximamente en su historial");
    nav('section-home');
}

async function procesarRetiro() {
    const monto = parseFloat(document.getElementById('withdraw-amount').value);
    const wallet = document.getElementById('withdraw-wallet').value;
    if (!wallet || monto < 5) return alert("Monto mínimo $5.");

    // Validación 48 horas
    let { data: ult } = await supabaseClient.from('solicitudes').select('fecha').eq('id_telegram', userId).eq('tipo', 'retiro').order('fecha', {ascending: false}).limit(1).maybeSingle();
    if (ult) {
        let diff = (new Date() - new Date(ult.fecha)) / (1000 * 60 * 60);
        if (diff < 48) return alert("Debes esperar 48h entre retiros. Faltan: " + (48 - diff).toFixed(1) + "h");
    }

    let { data: u } = await supabaseClient.from('usuarios').select('saldo_retirable').eq('id_telegram', userId).single();
    if (u?.saldo_retirable >= monto) {
        await supabaseClient.from('solicitudes').insert([{ id_telegram: userId, tipo: 'retiro', monto: monto, detalles: wallet, estado: 'pendiente' }]);
        alert("Retiro en proceso, verique proximamente su billetera");
        cargarDatos(); nav('section-home');
    } else alert("Saldo insuficiente.");
}

async function cargarAdmin() {
    const divPend = document.getElementById('admin-solicitudes');
    const divHist = document.getElementById('admin-historial-global');
    divPend.innerHTML = "<h4>PENDIENTES</h4>";
    
    let { data: pend } = await supabaseClient.from('solicitudes').select('*').eq('estado', 'pendiente').order('fecha', {ascending: false});
    pend?.forEach(s => {
        divPend.innerHTML += `
            <div class="card" style="text-align:left; margin-bottom:10px;">
                <strong>${s.tipo.toUpperCase()}</strong> - $${s.monto}<br>
                <small>User: ${s.id_telegram}</small><br>
                <small>Detalle: ${s.detalles}</small>
                <button onclick="gestionarAdmin('${s.id}','${s.id_telegram}',${s.monto},'${s.tipo}')" style="background:#238636; color:white; width:100%; margin-top:10px; padding:5px; border-radius:5px;">APROBAR / PAGAR</button>
            </div>`;
    });

    let { data: hist } = await supabaseClient.from('solicitudes').select('*').neq('estado', 'pendiente').order('fecha', {ascending: false}).limit(15);
    divHist.innerHTML = "";
    hist?.forEach(s => {
        divHist.innerHTML += `<div class="admin-historial-item"><span>${s.id_telegram}</span><strong>$${s.monto} (${s.tipo})</strong></div>`;
    });
}

async function gestionarAdmin(id, userT, monto, tipo) {
    if (tipo === 'deposito') {
        let r = parseFloat(prompt("Monto real a depositar:"));
        if (isNaN(r)) return;
        let { data: u } = await supabaseClient.from('usuarios').select('saldo_deposito').eq('id_telegram', userT).single();
        await supabaseClient.from('usuarios').update({ saldo_deposito: u.saldo_deposito + r }).eq('id_telegram', userT);
        await supabaseClient.from('solicitudes').update({ monto: r, estado: 'completado' }).eq('id', id);
    } else {
        if (!confirm("¿Ya pagaste $" + monto + " a este usuario?")) return;
        let { data: u } = await supabaseClient.from('usuarios').select('saldo_retirable').eq('id_telegram', userT).single();
        await supabaseClient.from('usuarios').update({ saldo_retirable: u.saldo_retirable - monto }).eq('id_telegram', userT);
        await supabaseClient.from('solicitudes').update({ estado: 'completado' }).eq('id', id);
    }
    alert("Operación completada."); cargarAdmin();
}

function copyWallet() { navigator.clipboard.writeText("0xd6fe607116c1df2b4dae56e77ffdae50cde9d153"); alert("Copiada."); }
document.addEventListener('DOMContentLoaded', iniciarApp);
