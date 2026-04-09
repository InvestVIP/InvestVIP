// 1. CONFIGURACIÓN DE CONEXIÓN
const SUPABASE_URL = 'https://udoyasqceikatyxizodm.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkb3lhc3FjZWlrYXR5eGl6b2RtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODkxODgsImV4cCI6MjA5MTI2NTE4OH0.LTV9coVwGdlvaiTOaLy35Bn9SHzjiSXliZOEYDOBqoE'; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const tg = window.Telegram.WebApp;
const userId = String(tg.initDataUnsafe?.user?.id || '8754466303');
const userName = tg.initDataUnsafe?.user?.first_name || 'Admin PC';
const ADMIN_ID = "8754466303"; 

// 2. NAVEGACIÓN Y DESPLIEGUE
function nav(sectionId) {
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    document.getElementById(sectionId).style.display = 'block';
    if (sectionId === 'section-admin') cargarAdmin();
    else cargarDatos();
}

function toggleInfo(id) {
    const details = document.getElementById(id);
    const isVisible = (details.style.display === 'block');
    document.querySelectorAll('.plan-details').forEach(d => d.style.display = 'none');
    if (!isVisible) details.style.display = 'block';
}

// 3. CARGA DE DATOS
async function cargarDatos() {
    try {
        if (userId === ADMIN_ID) {
            const adminBtn = document.getElementById('btn-admin-tab');
            if(adminBtn) adminBtn.style.display = 'flex';
        }

        let { data: usuario } = await supabaseClient.from('usuarios').select('*').eq('id_telegram', userId).maybeSingle();
        
        if (usuario) {
            document.getElementById('username').innerText = userName;
            document.getElementById('home-saldo-deposito').innerText = (usuario.saldo_deposito || 0).toFixed(2);
            document.getElementById('home-saldo-retirable').innerText = (usuario.saldo_retirable || 0).toFixed(2);
            document.getElementById('home-total-retirado').innerText = (usuario.total_retirado || 0).toFixed(2);
            
            const sd = document.getElementById('invest-saldo-deposito');
            const sr = document.getElementById('withdraw-available');
            if(sd) sd.innerText = "$" + (usuario.saldo_deposito || 0).toFixed(2);
            if(sr) sr.innerText = "$" + (usuario.saldo_retirable || 0).toFixed(2);

            // Historial
            let { data: h } = await supabaseClient.from('solicitudes').select('*').eq('id_telegram', userId).order('fecha', {ascending: false}).limit(10);
            const histDiv = document.getElementById('lista-historial');
            
            if(histDiv) {
                histDiv.innerHTML = h?.length ? "" : "<p style='color:#666; font-size:0.8em; padding:10px;'>No hay movimientos.</p>";
                h?.forEach(s => {
                    let color = s.tipo === 'retiro' ? '#f85149' : (s.tipo === 'ganancia' ? '#58a6ff' : '#3fb950');
                    histDiv.innerHTML += `
                        <div class="historial-item" style="border-left:4px solid ${color}; background:#1c2128; margin-bottom:8px; padding:10px; border-radius:4px; display:flex; justify-content:space-between; align-items:center;">
                            <div><strong style="font-size:0.8em;">${s.tipo.toUpperCase()}</strong><br><small style="color:#8b949e;">${new Date(s.fecha).toLocaleDateString()}</small></div>
                            <div style="color:${color}; font-weight:bold;">${s.tipo === 'retiro' ? '-' : '+'}$${(s.monto || 0).toFixed(2)}</div>
                        </div>`;
                });
            }
        }
    } catch (e) { console.error("Error:", e); }
}

// 4. INVERSIÓN
async function invertir(costo) {
    try {
        let { data: u } = await supabaseClient.from('usuarios').select('*').eq('id_telegram', userId).single();
        if (u && u.saldo_deposito >= costo) {
            let nombre = (costo===11)?"Bronce":(costo===30)?"Plata":(costo===60)?"Oro":"VIP";
            let ganancia = (costo===11)?0.65:(costo===30)?1.66:(costo===60)?3.00:6.30;

            await supabaseClient.from('usuarios').update({ saldo_deposito: u.saldo_deposito - costo }).eq('id_telegram', userId);
            await supabaseClient.from('planes_activos').insert([{ id_telegram: userId, nombre_plan: nombre, monto_invertido: costo, ganancia_diaria: ganancia, activo: true }]);
            await supabaseClient.from('solicitudes').insert([{ id_telegram: userId, tipo: 'ganancia', monto: 0, detalles: `Activación Plan ${nombre}`, estado: 'completado' }]);

            alert(`🚀 ¡Felicidades! Plan ${nombre} activado.`);
            cargarDatos();
        } else { alert("❌ Saldo insuficiente en la cuenta de depósito."); }
    } catch (e) { alert("Error al procesar inversión."); }
}

// 5. RETIROS Y DEPÓSITOS
async function procesarRetiro() {
    const monto = parseFloat(document.getElementById('withdraw-amount').value);
    const wallet = document.getElementById('withdraw-wallet').value.trim();
    if (isNaN(monto) || monto < 5) return alert("Monto mínimo $5.");
    if (wallet.length < 5) return alert("Billetera inválida.");

    let { data: r } = await supabaseClient.from('solicitudes').select('fecha').eq('id_telegram', userId).eq('tipo', 'retiro').order('fecha', {ascending:false}).limit(1);
    if (r?.length > 0) {
        const horas = (new Date() - new Date(r[0].fecha)) / (1000 * 60 * 60);
        if (horas < 48) return alert(`⏳ Faltan ${(48 - horas).toFixed(1)} horas para tu próximo retiro.`);
    }

    let { data: u } = await supabaseClient.from('usuarios').select('*').eq('id_telegram', userId).single();
    if (u && u.saldo_retirable >= monto) {
        await supabaseClient.from('solicitudes').insert([{ id_telegram: userId, tipo: 'retiro', monto: monto, detalles: wallet, estado: 'pendiente' }]);
        alert("✅ Solicitud de retiro enviada.");
        cargarDatos();
    } else { alert("Saldo insuficiente."); }
}

async function verifyTx() {
    const hash = document.getElementById('tx-hash').value.trim();
    if (hash.length < 8) return alert("Hash inválido.");
    const { error } = await supabaseClient.from('solicitudes').insert([{ id_telegram: userId, tipo: 'deposito', detalles: hash, estado: 'pendiente' }]);
    if (!error) {
        alert("✔️ Depósito notificado al administrador.");
        document.getElementById('tx-hash').value = "";
        cargarDatos();
    }
}

function copyWallet() {
    navigator.clipboard.writeText("0xd6fe607116c1df2b4dae56e77ffdae50cde9d153");
    alert("Dirección copiada.");
}

// 6. ADMIN
async function cargarAdmin() {
    let { data: lista } = await supabaseClient.from('solicitudes').select('*').eq('estado', 'pendiente').in('tipo', ['deposito', 'retiro']);
    const div = document.getElementById('admin-solicitudes');
    if(!div) return;
    div.innerHTML = lista?.length ? "" : "<p style='padding:20px; color:#444;'>Sin solicitudes.</p>";
    lista.forEach(s => {
        const color = s.tipo === 'deposito' ? '#3fb950' : '#f85149';
        div.innerHTML += `
            <div style="background:#1c2128; padding:15px; margin-bottom:12px; border-radius:8px; border-left:4px solid ${color}">
                <strong style="color:${color}">${s.tipo.toUpperCase()} - $${s.monto || '---'}</strong><br>
                <small>User: ${s.id_telegram}</small>
                <p style="font-size:0.8em; background:#0d1117; padding:8px; border-radius:4px; margin:10px 0;">${s.detalles}</p>
                <button onclick="gestionar('${s.id}','completado','${s.id_telegram}',${s.monto},'${s.tipo}')" style="background:#238636; color:white; padding:10px; border-radius:6px; width:100%;">Aprobar ✅</button>
            </div>`;
    });
}

async function gestionar(id, estado, userT, montoSol, tipo) {
    if (tipo === 'deposito') {
        let real = parseFloat(prompt("Monto a acreditar:", "0.00"));
        if(isNaN(real) || real <= 0) return;
        let { data: u } = await supabaseClient.from('usuarios').select('saldo_deposito').eq('id_telegram', userT).single();
        await supabaseClient.from('usuarios').update({ saldo_deposito: u.saldo_deposito + real }).eq('id_telegram', userT);
        await supabaseClient.from('solicitudes').update({ estado: estado, monto: real }).eq('id', id);
    } else {
        if(!confirm("¿Confirmas el pago?")) return;
        let { data: u } = await supabaseClient.from('usuarios').select('*').eq('id_telegram', userT).single();
        await supabaseClient.from('usuarios').update({ saldo_retirable: u.saldo_retirable - montoSol, total_retirado: (u.total_retirado || 0) + montoSol }).eq('id_telegram', userT);
        await supabaseClient.from('solicitudes').update({ estado: estado }).eq('id', id);
    }
    alert("Hecho.");
    cargarAdmin();
}

// INICIO
cargarDatos();
