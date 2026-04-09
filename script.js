const SUPABASE_URL = 'https://udoyasqceikatyxizodm.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_7UtlHB8x21aypLw2rCHoTQ_qBQ_TFkz'; 

let supabaseClient;
const tg = window.Telegram.WebApp;

// INICIALIZACIÓN SEGURA
function iniciarApp() {
    if (!window.supabase) {
        setTimeout(iniciarApp, 100);
        return;
    }
    const { createClient } = window.supabase;
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

    if (tg) {
        tg.ready();
        tg.expand();
    }
    cargarDatos();
}

const userId = tg.initDataUnsafe?.user?.id ? String(tg.initDataUnsafe.user.id) : '8754466303';
const userName = tg.initDataUnsafe?.user?.first_name || 'Admin PC';
const ADMIN_ID = "8754466303"; 

function nav(id) {
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    const section = document.getElementById(id);
    if (section) section.style.display = 'block';
    if (id === 'section-admin') cargarAdmin();
    else cargarDatos();
}

async function cargarDatos() {
    try {
        if (userId === ADMIN_ID) {
            const adminTab = document.getElementById('btn-admin-tab');
            if (adminTab) adminTab.style.display = 'flex';
        }

        let { data: u, error } = await supabaseClient.from('usuarios').select('*').eq('id_telegram', userId).maybeSingle();

        if (!u && !error) {
            const { data: nuevoU } = await supabaseClient.from('usuarios').insert([{ id_telegram: userId, saldo_deposito: 0, saldo_retirable: 0, total_retirado: 0 }]).select().single();
            u = nuevoU;
        }

        if (u) {
            document.getElementById('username').innerText = userName;
            document.getElementById('home-saldo-deposito').innerText = (u.saldo_deposito || 0).toFixed(2);
            document.getElementById('home-saldo-retirable').innerText = (u.saldo_retirable || 0).toFixed(2);
            document.getElementById('home-total-retirado').innerText = (u.total_retirado || 0).toFixed(2);
            
            const retLabel = document.getElementById('withdraw-available');
            if (retLabel) retLabel.innerText = "$" + (u.saldo_retirable || 0).toFixed(2);

            await Promise.all([actualizarPlanesVisuales(), actualizarHistorialVisual()]);
        }
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
    let { data: h } = await supabaseClient.from('solicitudes').select('*').eq('id_telegram', userId).order('fecha', {ascending: false}).limit(10);
    const hDiv = document.getElementById('lista-historial');
    if (!hDiv) return;
    hDiv.innerHTML = "";
    h?.forEach(s => {
        let textoTipo = s.tipo.toUpperCase();
        let montoMostrar = s.monto;
        let color = s.tipo === 'retiro' ? '#f85149' : '#3fb950';
        let signo = s.tipo === 'retiro' ? '-' : '+';

        if (s.detalles && s.detalles.includes("Activación Plan")) {
            textoTipo = s.detalles.toUpperCase();
            color = '#f85149'; 
            signo = '-';
            if (montoMostrar === 0) {
                if (s.detalles.includes("Bronce")) montoMostrar = 11;
                else if (s.detalles.includes("Plata")) montoMostrar = 30;
                else if (s.detalles.includes("Oro")) montoMostrar = 60;
                else if (s.detalles.includes("VIP")) montoMostrar = 120;
            }
        }

        hDiv.innerHTML += `<div class="admin-historial-item"><span>${textoTipo}</span><strong style="color:${color}">${signo}$${montoMostrar.toFixed(2)}</strong></div>`;
    });
}

async function invertir(costo) {
    let { data: u } = await supabaseClient.from('usuarios').select('saldo_deposito').eq('id_telegram', userId).single();
    if (u?.saldo_deposito >= costo) {
        let n = costo===11?"Bronce":costo===30?"Plata":costo===60?"Oro":"VIP";
        let g = costo===11?0.65:costo===30?1.66:costo===60?3.00:6.30;
        
        // 1. Descontar saldo
        await supabaseClient.from('usuarios').update({ saldo_deposito: u.saldo_deposito - costo }).eq('id_telegram', userId);
        
        // 2. Crear el plan activo
        await supabaseClient.from('planes_activos').insert([{ id_telegram: userId, nombre_plan: n, monto_invertido: costo, ganancia_diaria: g, activo: true }]);
        
        // 3. NUEVO: Insertar en historial (solicitudes) para que se refleje de inmediato
        await supabaseClient.from('solicitudes').insert([{ 
            id_telegram: userId, 
            tipo: 'ganancia', 
            monto: 0, 
            detalles: `Activación Plan ${n}`, 
            estado: 'completado' 
        }]);

        alert("¡Activado!"); 
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
