const SUPABASE_URL = 'https://udoyasqceikatyxizodm.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_7UtlHB8x21aypLw2rCHoTQ_qBQ_TFkz'; 
let supabaseClient;
const tg = window.Telegram.WebApp;

// ID de respaldo para pruebas fuera de Telegram
const userId = tg.initDataUnsafe?.user?.id ? String(tg.initDataUnsafe.user.id) : '8754466303';
const userName = tg.initDataUnsafe?.user?.first_name || 'Inversionista';

async function iniciarApp() {
    if (!window.supabase) { setTimeout(iniciarApp, 100); return; }
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
    
    // Ejecución en cascada para asegurar que el ID exista antes de buscar planes
    await cargarDatos();
    
    // Monitoreo de pagos cada minuto
    setInterval(procesarPagosDiarios, 60000); 
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
        document.getElementById('home-saldo-deposito').innerText = "$" + (parseFloat(u.saldo_deposito) || 0).toFixed(2);
        document.getElementById('home-saldo-retirable').innerText = "$" + (parseFloat(u.saldo_retirable) || 0).toFixed(2);
        
        // REFRESCAR PLANES Y SUMA
        await actualizarMisPlanes();
        await actualizarHistorialHome();
        
    } catch (e) { console.error("Error en carga:", e); }
}

async function actualizarMisPlanes() {
    const divPlanes = document.getElementById('lista-planes');
    const divEstimado = document.getElementById('home-estimado-diario');
    
    // Forzamos la consulta a la tabla de planes
    let { data: planes, error } = await supabaseClient
        .from('planes_activos')
        .select('*')
        .eq('id_telegram', userId)
        .eq('activo', true);

    if (error) {
        console.error("Error obteniendo planes:", error);
        return;
    }

    let sumaDiaria = 0;
    divPlanes.innerHTML = "";

    if (planes && planes.length > 0) {
        planes.forEach(p => {
            // Aseguramos que la ganancia sea tratada como número
            const gananciaN = parseFloat(p.ganancia_diaria) || 0;
            sumaDiaria += gananciaN;

            let tag = p.nombre_plan.toLowerCase();
            divPlanes.innerHTML += `
                <div class="status-item border-${tag}">
                    <b>${p.nombre_plan.toUpperCase()}</b>
                    <div class="price-neon">+$${gananciaN.toFixed(2)}/día</div>
                </div>`;
        });
    } else {
        divPlanes.innerHTML = "<div style='color:#8b949e; font-size:0.8em; text-align:center; padding:10px;'>Sin minería activa</div>";
    }
    
    // Actualizamos el contador visual del total
    divEstimado.innerText = "$" + sumaDiaria.toFixed(2);
}

// Función para navegar y refrescar
function nav(id) {
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'block';
    if (id === 'section-admin') cargarAdmin();
    // Al volver al home, siempre refrescamos para ver cambios
    if (id === 'section-home') cargarDatos();
}

async function invertir(costo, nombre, ganancia) {
    let { data: u } = await supabaseClient.from('usuarios').select('saldo_deposito').eq('id_telegram', userId).single();
    
    if (u?.saldo_deposito >= costo) {
        // 1. Restar saldo
        await supabaseClient.from('usuarios').update({ saldo_deposito: u.saldo_deposito - costo }).eq('id_telegram', userId);
        
        // 2. Crear el plan con fecha actual
        await supabaseClient.from('planes_activos').insert([{ 
            id_telegram: userId, 
            nombre_plan: nombre, 
            monto_invertido: costo, 
            ganancia_diaria: ganancia, 
            activo: true, 
            ultima_bonificacion: new Date().toISOString() 
        }]);

        alert(`Plan ${nombre} Activado, tu minería ha comenzado!`);
        nav('section-home');
    } else {
        alert("Saldo insuficiente.");
    }
}

// El resto de funciones (Admin, Verify, etc) se mantienen igual a la versión estable
async function verifyTx() {
    const hash = document.getElementById('tx-hash').value;
    const monto = parseFloat(document.getElementById('dep-amount').value);
    if (!hash || isNaN(monto)) return alert("Datos incompletos.");
    await supabaseClient.from('solicitudes').insert([{ id_telegram: userId, tipo: 'deposito', detalles: hash, estado: 'pendiente', monto: monto }]);
    alert("⌛ Recibido para validación.");
    nav('section-home');
}

async function actualizarHistorialHome() {
    let { data: h } = await supabaseClient.from('solicitudes').select('*').eq('id_telegram', userId).neq('monto', 0).order('fecha', {ascending: false}).limit(6);
    const div = document.getElementById('lista-historial'); div.innerHTML = "";
    h?.forEach(s => {
        let color = s.tipo === 'retiro' ? '#f85149' : (s.tipo === 'deposito' ? '#3fb950' : '#00ffcc');
        div.innerHTML += `<div class="status-item"><span>${s.tipo.toUpperCase()}</span><strong style="color:${color}">${s.tipo==='retiro'?'-':'+'}$${s.monto.toFixed(2)}</strong></div>`;
    });
}

async function cargarAdmin() {
    const dList = document.getElementById('admin-dep-list');
    const rList = document.getElementById('admin-ret-list');
    dList.innerHTML = ""; rList.innerHTML = "";
    let { data: sol } = await supabaseClient.from('solicitudes').select('*').eq('estado', 'pendiente').neq('monto', 0);
    sol?.forEach(s => {
        const item = `<div class="admin-card-mini"><small>${s.id_telegram}</small><br>$${s.monto} <button onclick="gestionarAdmin('${s.id}','${s.id_telegram}','${s.tipo}',${s.monto})">REVISAR</button></div>`;
        if(s.tipo === 'deposito') dList.innerHTML += item; else rList.innerHTML += item;
    });
}

async function gestionarAdmin(id, userT, tipo, montoOri) {
    if (tipo === 'deposito') {
        let real = parseFloat(prompt("Monto a cargar:", montoOri));
        if (isNaN(real)) return;
        let { data: u } = await supabaseClient.from('usuarios').select('saldo_deposito').eq('id_telegram', userT).single();
        await supabaseClient.from('usuarios').update({ saldo_deposito: (parseFloat(u.saldo_deposito) || 0) + real }).eq('id_telegram', userT);
        await supabaseClient.from('solicitudes').update({ monto: real, estado: 'completado' }).eq('id', id);
    } else {
        let hash = prompt("Hash de pago:");
        if (!hash) return;
        let { data: u } = await supabaseClient.from('usuarios').select('saldo_retirable').eq('id_telegram', userT).single();
        await supabaseClient.from('usuarios').update({ saldo_retirable: u.saldo_retirable - montoOri }).eq('id_telegram', userT);
        await supabaseClient.from('solicitudes').update({ detalles: hash, estado: 'completado' }).eq('id', id);
    }
    cargarAdmin();
}

async function procesarPagosDiarios() {
    let { data: planes } = await supabaseClient.from('planes_activos').select('*').eq('activo', true);
    const ahora = new Date();
    for (let p of planes) {
        if ((ahora - new Date(p.ultima_bonificacion)) >= 24*60*60*1000) {
            let { data: u } = await supabaseClient.from('usuarios').select('saldo_retirable').eq('id_telegram', p.id_telegram).single();
            await supabaseClient.from('usuarios').update({ saldo_retirable: (parseFloat(u.saldo_retirable) || 0) + parseFloat(p.ganancia_diaria) }).eq('id_telegram', p.id_telegram);
            await supabaseClient.from('planes_activos').update({ ultima_bonificacion: ahora.toISOString() }).eq('id', p.id);
            await supabaseClient.from('solicitudes').insert([{ id_telegram: p.id_telegram, tipo: 'ganancia', monto: p.ganancia_diaria, estado: 'completado' }]);
        }
    }
}

function copyText(txt) { navigator.clipboard.writeText(txt); alert("✅ Copiado"); }
document.addEventListener('DOMContentLoaded', iniciarApp);
