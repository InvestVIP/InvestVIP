// 1. CONFIGURACIÓN DE CONEXIÓN
const SUPABASE_URL = 'https://udoyasqceikatyxizodm.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkb3lhc3FjZWlrYXR5eGl6b2RtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODkxODgsImV4cCI6MjA5MTI2NTE4OH0.LTV9coVwGdlvaiTOaLy35Bn9SHzjiSXliZOEYDOBqoE'; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const tg = window.Telegram.WebApp;
// Detecta ID de Telegram o usa el tuyo de Admin si estás en PC
const userId = String(tg.initDataUnsafe?.user?.id || '8754466303');
const userName = tg.initDataUnsafe?.user?.first_name || 'Admin PC';
const ADMIN_ID = "8754466303"; 

// 2. NAVEGACIÓN ENTRE SECCIONES
function nav(sectionId) {
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    document.getElementById(sectionId).style.display = 'block';
    if (sectionId === 'section-admin') cargarAdmin();
    else cargarDatos();
}

// 3. CARGA DE DATOS DEL USUARIO E HISTORIAL
async function cargarDatos() {
    try {
        // Mostrar pestaña de admin si el ID coincide
        if (userId === ADMIN_ID) {
            const adminBtn = document.getElementById('btn-admin-tab');
            if(adminBtn) adminBtn.style.display = 'flex';
        }

        // Obtener datos del usuario (maybeSingle evita errores si no existe)
        let { data: usuario, error } = await supabaseClient.from('usuarios').select('*').eq('id_telegram', userId).maybeSingle();
        
        if (usuario) {
            // Actualizar Saldo en Pantalla Principal
            document.getElementById('username').innerText = userName;
            document.getElementById('home-saldo-deposito').innerText = (usuario.saldo_deposito || 0).toFixed(2);
            document.getElementById('home-saldo-retirable').innerText = (usuario.saldo_retirable || 0).toFixed(2);
            document.getElementById('home-total-retirado').innerText = (usuario.total_retirado || 0).toFixed(2);
            
            // Actualizar Saldo en Secciones de Inversión y Retiro
            const sd = document.getElementById('invest-saldo-deposito');
            const sr = document.getElementById('withdraw-available');
            if(sd) sd.innerText = "$" + (usuario.saldo_deposito || 0).toFixed(2);
            if(sr) sr.innerText = "$" + (usuario.saldo_retirable || 0).toFixed(2);

            // Cargar Historial Multicolor
            let { data: h } = await supabaseClient.from('solicitudes').select('*').eq('id_telegram', userId).order('fecha', {ascending: false}).limit(10);
            const histDiv = document.getElementById('lista-historial');
            
            if(histDiv) {
                histDiv.innerHTML = h?.length ? "" : "<p style='color:#666; font-size:0.8em; padding:10px;'>No hay movimientos.</p>";
                h?.forEach(s => {
                    let color = '#3fb950'; // Verde: Depósito
                    if (s.tipo === 'retiro') color = '#f85149'; // Rojo: Retiro
                    if (s.tipo === 'ganancia') color = '#58a6ff'; // Azul: Ganancia
                    
                    histDiv.innerHTML += `
                        <div class="historial-item" style="border-left:4px solid ${color}; background:#1c2128; margin-bottom:8px; padding:10px; border-radius:4px; display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <strong style="font-size:0.8em;">${s.tipo.toUpperCase()}</strong><br>
                                <small style="color:#8b949e;">${new Date(s.fecha).toLocaleDateString()}</small>
                            </div>
                            <div style="color:${color}; font-weight:bold;">
                                ${s.tipo === 'retiro' ? '-' : '+'}$${(s.monto || 0).toFixed(2)}
                            </div>
                        </div>`;
                });
            }
        }
    } catch (e) {
        console.error("Error en carga:", e);
    }
}

// 4. ACCIÓN DE RETIRO CON VALIDACIÓN DE 48 HORAS
async function procesarRetiro() {
    const monto = parseFloat(document.getElementById('withdraw-amount').value);
    const wallet = document.getElementById('withdraw-wallet').value.trim();
    
    if (isNaN(monto) || monto < 5) return alert("Monto mínimo $5.");
    if (wallet.length < 5) return alert("Billetera inválida.");

    // Consultar último retiro para validar tiempo
    let { data: r } = await supabaseClient.from('solicitudes').select('fecha').eq('id_telegram', userId).eq('tipo', 'retiro').order('fecha', {ascending:false}).limit(1);
    
    if (r && r.length > 0) {
        const horasTranscurridas = (new Date() - new Date(r[0].fecha)) / (1000 * 60 * 60);
        if (horasTranscurridas < 48) {
            return alert(`⏳ Debes esperar 48h entre retiros. Faltan ${(48 - horasTranscurridas).toFixed(1)} horas.`);
        }
    }

    let { data: u } = await supabaseClient.from('usuarios').select('*').eq('id_telegram', userId).single();
    if (u && u.saldo_retirable >= monto) {
        const { error } = await supabaseClient.from('solicitudes').insert([{ 
            id_telegram: userId, 
            tipo: 'retiro', 
            monto: monto, 
            detalles: wallet, 
            estado: 'pendiente' 
        }]);
        if (!error) {
            alert("✅ Solicitud de retiro enviada.");
            cargarDatos();
        }
    } else {
        alert("Saldo insuficiente en ganancias.");
    }
}

// 5. PANEL DE ADMINISTRADOR
async function cargarAdmin() {
    let { data: lista } = await supabaseClient.from('solicitudes').select('*').eq('estado', 'pendiente').in('tipo', ['deposito', 'retiro']);
    const div = document.getElementById('admin-solicitudes');
    if(!div) return;

    div.innerHTML = (lista && lista.length) ? "" : "<p style='padding:20px; color:#444;'>No hay solicitudes pendientes.</p>";
    lista.forEach(s => {
        const colorBorder = s.tipo === 'deposito' ? '#3fb950' : '#f85149';
        div.innerHTML += `
            <div style="background:#1c2128; padding:15px; margin-bottom:12px; border-radius:8px; border-left:4px solid ${colorBorder}">
                <strong style="color:${colorBorder}">${s.tipo.toUpperCase()} - $${s.monto || '---'}</strong><br>
                <small style="color:#8b949e;">ID Usuario: ${s.id_telegram}</small>
                <p style="font-size:0.8em; background:#0d1117; padding:8px; border-radius:4px; word-break:break-all; margin:10px 0; color:#58a6ff;">
                    ${s.detalles}
                </p>
                <button onclick="gestionar('${s.id}','completado','${s.id_telegram}',${s.monto},'${s.tipo}')" 
                        style="background:#238636; color:white; border:0; padding:10px; border-radius:6px; width:100%; font-weight:bold;">
                    Aprobar y Procesar ✅
                </button>
            </div>`;
    });
}

async function gestionar(id, estado, userT, montoSol, tipo) {
    if (tipo === 'deposito') {
        let real = parseFloat(prompt("Monto exacto a acreditar en cuenta:", "0.00"));
        if(isNaN(real) || real <= 0) return;
        
        let { data: u } = await supabaseClient.from('usuarios').select('saldo_deposito').eq('id_telegram', userT).single();
        await supabaseClient.from('usuarios').update({ saldo_deposito: u.saldo_deposito + real }).eq('id_telegram', userT);
        await supabaseClient.from('solicitudes').update({ estado: estado, monto: real }).eq('id', id);
    } else {
        if(!confirm(`¿Confirmas que ya realizaste el envío de $${montoSol}?`)) return;
        
        let { data: u } = await supabaseClient.from('usuarios').select('*').eq('id_telegram', userT).single();
        await supabaseClient.from('usuarios').update({ 
            saldo_retirable: u.saldo_retirable - montoSol, 
            total_retirado: (u.total_retirado || 0) + montoSol 
        }).eq('id_telegram', userT);
        await supabaseClient.from('solicitudes').update({ estado: estado }).eq('id', id);
    }
    alert("Operación completada con éxito.");
    cargarAdmin();
}

// 6. ACCIONES ADICIONALES
async function verifyTx() {
    const hash = document.getElementById('tx-hash').value.trim();
    if (hash.length < 8) return alert("Hash de transacción inválido.");
    const { error } = await supabaseClient.from('solicitudes').insert([{ 
        id_telegram: userId, 
        tipo: 'deposito', 
        detalles: hash, 
        estado: 'pendiente' 
    }]);
    if (!error) {
        document.getElementById('verify-msg').style.display = "block";
        document.getElementById('tx-hash').value = "";
        cargarDatos();
    }
}

function copyWallet() { 
    navigator.clipboard.writeText("0xd6fe607116c1df2b4dae56e77ffdae50cde9d153"); 
    alert("Dirección copiada al portapapeles."); 
}

// ARRANQUE AUTOMÁTICO
cargarDatos();
