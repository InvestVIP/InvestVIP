const SUPABASE_URL = 'https://udoyasqceikatyxizodm.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_7UtlHB8x21aypLw2rCHoTQ_qBQ_TFkz'; 
let supabaseClient;
const tg = window.Telegram.WebApp;

const userId = tg.initDataUnsafe?.user?.id ? String(tg.initDataUnsafe.user.id) : '8754466303';
const userName = tg.initDataUnsafe?.user?.first_name || 'Inversionista';

async function iniciarApp() {
    if (!window.supabase) { setTimeout(iniciarApp, 100); return; }
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
    
    // Cargamos datos inicialmente
    await cargarDatos();
    
    // Verificación de bonificaciones cada minuto
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
        
        // REFRESCAR PLANES Y SUMA (Llamada crítica)
        await actualizarMisPlanes();
        await actualizarHistorialHome();
        
    } catch (e) { console.error("Error en carga:", e); }
}

async function actualizarMisPlanes() {
    const divPlanes = document.getElementById('lista-planes');
    const divEstimado = document.getElementById('home-estimado-diario');
    
    // Eliminamos el filtro 'activo', true temporalmente para asegurar que lea lo que hay en tu captura
    let { data: planes, error } = await supabaseClient
        .from('planes_activos')
        .select('*')
        .eq('id_telegram', userId);

    if (error) {
        console.error("Error en tabla planes:", error);
        return;
    }

    let sumaDiaria = 0;
    divPlanes.innerHTML = "";

    if (planes && planes.length > 0) {
        planes.forEach(p => {
            // Convertimos ganancia_diaria a número explícitamente
            const gananciaN = parseFloat(p.ganancia_diaria) || 0;
            sumaDiaria += gananciaN;

            let tag = p.nombre_plan ? p.nombre_plan.toLowerCase() : 'bronce';
            divPlanes.innerHTML += `
                <div class="status-item border-${tag}">
                    <b>${p.nombre_plan.toUpperCase()}</b>
                    <div class="price-neon">+$${gananciaN.toFixed(2)}/día</div>
                </div>`;
        });
    } else {
        divPlanes.innerHTML = "<div style='color:#8b949e; font-size:0.8em; text-align:center; padding:10px;'>Sin minería activa</div>";
    }
    
    // Seteo del total sumado
    divEstimado.innerText = "$" + sumaDiaria.toFixed(2);
}

async function invertir(costo, nombre, ganancia) {
    let { data: u } = await supabaseClient.from('usuarios').select('saldo_deposito').eq('id_telegram', userId).single();
    
    if (u?.saldo_deposito >= costo) {
        // Descontar saldo del usuario
        await supabaseClient.from('usuarios').update({ saldo_deposito: u.saldo_deposito - costo }).eq('id_telegram', userId);
        
        // Crear registro en planes_activos
        await supabaseClient.from('planes_activos').insert([{ 
            id_telegram: userId, 
            nombre_plan: nombre, 
            monto_invertido: costo, 
            ganancia_diaria: ganancia, 
            activo: true, // Asegúrate de que esta columna exista en tu tabla
            ultima_bonificacion: new Date().toISOString() 
        }]);

        // Registro visual en solicitudes con monto 0 para historial de activación
        await supabaseClient.from('solicitudes').insert([{
            id_telegram: userId,
            tipo: 'ganancia',
            monto: 0,
            detalles: 'Activación Plan ' + nombre,
            estado: 'completado'
        }]);

        alert(`Plan ${nombre} Activado, tu minería ha comenzado!`);
        nav('section-home');
    } else {
        alert("Saldo insuficiente en depósito.");
    }
}

function nav(id) {
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'block';
    if (id === 'section-admin') cargarAdmin();
    cargarDatos(); // Refresca todo al cambiar de pestaña
}

// Historial filtrando los ceros si quieres que sea limpio, o mostrándolos
async function actualizarHistorialHome() {
    let { data: h } = await supabaseClient.from('solicitudes').select('*').eq('id_telegram', userId).order('fecha', {ascending: false}).limit(6);
    const div = document.getElementById('lista-historial'); div.innerHTML = "";
    h?.forEach(s => {
        let color = s.tipo === 'retiro' ? '#f85149' : (s.tipo === 'deposito' ? '#3fb950' : '#00ffcc');
        let montoDisp = s.monto > 0 ? `${s.tipo==='retiro'?'-':'+'}$${parseFloat(s.monto).toFixed(2)}` : 'ACTIVACIÓN';
        div.innerHTML += `<div class="status-item"><span>${s.tipo.toUpperCase()}</span><strong style="color:${color}">${montoDisp}</strong></div>`;
    });
}

// ... Resto de funciones (cargarAdmin, gestionarAdmin, procesarPagosDiarios, copyText) se mantienen iguales ...
// Asegúrate de copiar solo estas funciones actualizadas para no perder la visual de las otras secciones.

document.addEventListener('DOMContentLoaded', iniciarApp);
