// 1. CONFIGURACIÓN
const SUPABASE_URL = 'https://udoyasqceikatyxizodm.supabase.co'; 
// Nueva Publishable Key detectada en tu panel de Supabase
const SUPABASE_KEY = 'sb_publishable_7UtlHB8x21aypLw2rCHoTQ_qBQ_TFkz'; 

// Inicialización corregida para evitar bloqueos de seguridad y errores de 'eval'
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false, // Necesario para entornos de Telegram WebApp
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

const tg = window.Telegram.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
}

// Identificación de usuario con respaldo de Admin
const userId = tg.initDataUnsafe?.user?.id ? String(tg.initDataUnsafe.user.id) : '8754466303';
const userName = tg.initDataUnsafe?.user?.first_name || 'Admin PC';
const ADMIN_ID = "8754466303"; 

// 2. NAVEGACIÓN
function nav(id) {
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    const section = document.getElementById(id);
    if (section) section.style.display = 'block';
    
    if (id === 'section-admin') cargarAdmin();
    else cargarDatos();
}

// 3. CARGA DE DATOS USUARIO (CON AUTO-REGISTRO)
async function cargarDatos() {
    try {
        if (userId === ADMIN_ID) {
            const adminTab = document.getElementById('btn-admin-tab');
            if (adminTab) adminTab.style.display = 'flex';
        }

        // Buscar usuario en la base de datos
        let { data: u, error } = await supabaseClient.from('usuarios').select('*').eq('id_telegram', userId).maybeSingle();

        // Si el usuario no existe y no hay error de conexión, lo registramos automáticamente
        if (!u && !error) {
            const { data: nuevoU, error: insError } = await supabaseClient.from('usuarios').insert([
                { 
                    id_telegram: userId, 
                    saldo_deposito: 0, 
                    saldo_retirable: 0, 
                    total_retirado: 0 
                }
            ]).select().single();
            
            if (insError) throw insError;
            u = nuevoU;
        }

        if (u) {
            const saldoDep = (u.saldo_deposito || 0).toFixed(2);
            const saldoRet = (u.saldo_retirable || 0).toFixed(2);

            document.getElementById('username').innerText = userName;
            document.getElementById('home-saldo-deposito').innerText = saldoDep;
            document.getElementById('home-saldo-retirable').innerText = saldoRet;
            document.getElementById('home-total-retirado').innerText = (u.total_retirado || 0).toFixed(2);
            
            const depLabel = document.getElementById('invest-saldo-deposito');
            const retLabel = document.getElementById('withdraw-available');
            if (depLabel) depLabel.innerText = "$" + saldoDep;
            if (retLabel) retLabel.innerText = "$" + saldoRet;

            await Promise.all([actualizarPlanesVisuales(), actualizarHistorialVisual()]);
        }
    } catch (e) { 
        console.error("Error en cargarDatos:", e); 
    }
}

async function actualizarPlanesVisuales() {
    let { data: planes } = await supabaseClient.from('planes_activos').select('*').eq('id_telegram', userId).eq('activo', true);
    const pDiv = document.getElementById('lista-planes');
    let totalEstimadoDiario = 0;
    
    pDiv.innerHTML = planes?.length ? "" : "<p style='color:#666; font-size:0.8em; padding:10px;'>Sin planes activos.</p>";
    
    planes?.forEach(p => {
        totalEstimadoDiario += p.ganancia_diaria;
        pDiv.innerHTML += `
            <div style="background:#1c2128; border-left:4px solid #f7931a; padding:12px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <div><strong>Plan ${p.nombre_plan}</strong><br><small style="color:#3fb950;">+$${p.ganancia_diaria.toFixed(2)} diario</small></div>
                <div style="text-align:right;"><span style="font-size:0.7em; color:#8b949e;">Invertido</span><br><b>$${p.monto_invertido}</b></div>
            </div>`;
    });
    document.getElementById('home-estimado-diario').innerText = "$" + totalEstimadoDiario.toFixed(2);
}

async function actualizarHistorialVisual() {
    let { data: h } = await supabaseClient.from('solicitudes').select('*').eq('id_telegram', userId).neq('monto', 0).order('fecha', {ascending: false}).limit(10);
    const hDiv = document.getElementById('lista-historial');
    if (!hDiv) return;
    hDiv.innerHTML = "";
    h?.forEach(s => {
        let color = s.tipo === 'retiro' ? '#f85149' : (s.tipo === 'ganancia' ? '#58a6ff' : '#3fb950');
        hDiv.innerHTML += `<div style="border-left:4px solid ${color}; background:#1c2128; margin-bottom:8px; padding:10px; border-radius:4px; display:flex; justify-content:space-between; align-items:center;">
            <div><strong style="font-size:0.8em; color:${color}">${s.tipo.toUpperCase()}</strong><br><small style="color:#8b949e;">${new Date(s.fecha).toLocaleDateString()}</small></div>
            <div style="color:${color}; font-weight:bold;">${s.tipo === 'retiro' ? '-' : '+'}$${s.monto.toFixed(2)}</div>
        </div>`;
    });
}

// 4. LÓGICA DE RETIRO
async function procesarRetiro() {
    const monto = parseFloat(document.getElementById('withdraw-amount').value);
    const wallet = document.getElementById('withdraw-wallet').value;
    if (!wallet || isNaN(monto) || monto < 5) return alert("Monto mínimo $5.");

    try {
        let { data: u } = await supabaseClient.from('usuarios').select('saldo_retirable').eq('id_telegram', userId).single();
        if (u?.saldo_retirable >= monto) {
            await supabaseClient.from('solicitudes').insert([{ id_telegram: userId, tipo: 'retiro', monto: monto, detalles: wallet, estado: 'pendiente' }]);
            alert("Solicitud enviada."); cargarDatos();
        } else alert("Saldo insuficiente.");
    } catch (e) { console.error(e); }
}

// 5. ACCIONES
async function invertir(costo) {
    let { data: u } = await supabaseClient.from('usuarios').select('saldo_deposito').eq('id_telegram', userId).single();
    if (u?.saldo_deposito >= costo) {
        let n = costo===11?"Bronce":costo===30?"Plata":costo===60?"Oro":"VIP";
        let g = costo===11?0.65:costo===30?1.66:costo===60?3.00:6.30;
        await supabaseClient.from('usuarios').update({ saldo_deposito: u.saldo_deposito - costo }).eq('id_telegram', userId);
        await supabaseClient.from('planes_activos').insert([{ id_telegram: userId, nombre_plan: n, monto_invertido: costo, ganancia_diaria: g, activo: true }]);
        await supabaseClient.from('solicitudes').insert([{ id_telegram: userId, tipo: 'ganancia', monto: 0.01, detalles: `Activación Plan ${n}`, estado: 'completado' }]);
        alert("¡Activado!"); cargarDatos();
    } else alert("Saldo insuficiente.");
}

async function verifyTx() {
    const hash = document.getElementById('tx-hash').value;
    if (hash.length < 5) return alert("Hash inválido.");
    await supabaseClient.from('solicitudes').insert([{ id_telegram: userId, tipo: 'deposito', detalles: hash, estado: 'pendiente', monto: 0 }]);
    alert("Procesando pago...");
}

// 6. PANEL ADMIN
async function cargarAdmin() {
    const divPend = document.getElementById('admin-solicitudes');
    if (!divPend) return;
    divPend.innerHTML = "<h4>PENDIENTES</h4>";
    
    let { data: pend } = await supabaseClient.from('solicitudes').select('*').eq('estado', 'pendiente').order('fecha', {ascending: false});
    pend?.forEach(s => {
        divPend.innerHTML += `<div style="background:#1c2128; padding:10px; margin-bottom:10px; border-radius:8px; border:1px solid #30363d;">
            <strong>${s.tipo.toUpperCase()}</strong> - ID: ${s.id_telegram}<br><small>${s.detalles}</small><br>
            <button onclick="gestionar('${s.id}','completado','${s.id_telegram}',${s.monto},'${s.tipo}')" style="background:#238636; color:white; padding:8px; margin-top:5px; width:100%; border-radius:5px; border:none;">APROBAR</button>
        </div>`;
    });
}

async function gestionar(id, est, uT, mS, tip) {
    if (tip === 'deposito') {
        let r = parseFloat(prompt("Monto real a cargar:"));
        if (isNaN(r) || r <= 0) return;
        let { data: u } = await supabaseClient.from('usuarios').select('saldo_deposito').eq('id_telegram', uT).single();
        await supabaseClient.from('usuarios').update({ saldo_deposito: (u.saldo_deposito || 0) + r }).eq('id_telegram', uT);
        await supabaseClient.from('solicitudes').update({ monto: r, estado: est }).eq('id', id);
    } else {
        let { data: u } = await supabaseClient.from('usuarios').select('*').eq('id_telegram', uT).single();
        await supabaseClient.from('usuarios').update({ saldo_retirable: u.saldo_retirable - mS, total_retirado: (u.total_retirado || 0) + mS }).eq('id_telegram', uT);
        await supabaseClient.from('solicitudes').update({ estado: est }).eq('id', id);
    }
    alert("Operación completada.");
    cargarAdmin();
}

function copyWallet() { navigator.clipboard.writeText("0xd6fe607116c1df2b4dae56e77ffdae50cde9d153"); alert("Copiada."); }

// Iniciar app
cargarDatos();
