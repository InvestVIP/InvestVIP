const SUPABASE_URL = 'https://udoyasqceikatyxizodm.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_7UtlHB8x21aypLw2rCHoTQ_qBQ_TFkz'; 
let supabaseClient;
const tg = window.Telegram.WebApp;

const userId = tg.initDataUnsafe?.user?.id ? String(tg.initDataUnsafe.user.id) : '8754466303';
const userName = tg.initDataUnsafe?.user?.first_name || 'Inversionista';

async function iniciarApp() {
    if (!window.supabase) { setTimeout(iniciarApp, 100); return; }
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
    
    // El orden importa: Primero cargamos datos del usuario, luego sus planes
    await cargarDatos();
    
    setInterval(procesarPagosDiarios, 60000); 
}

async function cargarDatos() {
    try {
        if (userId === "8754466303") document.getElementById('btn-admin-tab').style.display = 'flex';
        
        let { data: u, error } = await supabaseClient.from('usuarios').select('*').eq('id_telegram', userId).maybeSingle();
        
        if (!u) {
            const { data: n } = await supabaseClient.from('usuarios').insert([{ id_telegram: userId, saldo_deposito: 0, saldo_retirable: 0 }]).select().single();
            u = n;
        }

        document.getElementById('username').innerText = userName;
        document.getElementById('home-saldo-deposito').innerText = "$" + (u.saldo_deposito || 0).toFixed(2);
        document.getElementById('home-saldo-retirable').innerText = "$" + (u.saldo_retirable || 0).toFixed(2);
        
        // Ejecución forzada de actualización de planes
        await actualizarMisPlanes();
        await actualizarHistorialHome();
        
    } catch (e) { console.error("Error cargando datos:", e); }
}

async function actualizarMisPlanes() {
    // Buscamos planes activos en la tabla
    let { data: planes, error } = await supabaseClient.from('planes_activos')
        .select('*')
        .eq('id_telegram', userId)
        .eq('activo', true);

    const divPlanes = document.getElementById('lista-planes');
    const divEstimado = document.getElementById('home-estimado-diario');
    
    let sumaDiaria = 0;
    divPlanes.innerHTML = "";

    if (planes && planes.length > 0) {
        planes.forEach(p => {
            sumaDiaria += parseFloat(p.ganancia_diaria);
            let tag = p.nombre_plan.toLowerCase();
            divPlanes.innerHTML += `
                <div class="status-item border-${tag}">
                    <b>${p.nombre_plan.toUpperCase()}</b>
                    <div class="price-neon">+$${p.ganancia_diaria.toFixed(2)}/día</div>
                </div>`;
        });
    } else {
        divPlanes.innerHTML = "<small style='color:#8b949e; display:block; text-align:center;'>No tienes planes activos</small>";
    }
    
    divEstimado.innerText = "$" + sumaDiaria.toFixed(2);
}

async function invertir(costo, nombre, ganancia) {
    let { data: u } = await supabaseClient.from('usuarios').select('saldo_deposito').eq('id_telegram', userId).single();
    
    if (u?.saldo_deposito >= costo) {
        // Descontar saldo
        await supabaseClient.from('usuarios').update({ saldo_deposito: u.saldo_deposito - costo }).eq('id_telegram', userId);
        
        // Insertar plan
        await supabaseClient.from('planes_activos').insert([{ 
            id_telegram: userId, 
            nombre_plan: nombre, 
            monto_invertido: costo, 
            ganancia_diaria: ganancia, 
            activo: true, 
            ultima_bonificacion: new Date().toISOString() 
        }]);

        alert(`Plan ${nombre} Activado, tu minería ha comenzado!`);
        
        // Volver a inicio y refrescar todo el estado
        nav('section-home');
    } else {
        alert("Saldo de depósito insuficiente.");
    }
}

function nav(id) {
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'block';
    if (id === 'section-admin') cargarAdmin();
    cargarDatos(); // Refresco global al navegar
}

// RESTO DE FUNCIONES (Verify, Admin, Historial)
async function verifyTx() {
    const hash = document.getElementById('tx-hash').value;
    const monto = parseFloat(document.getElementById('dep-amount').value);
    if (!hash || isNaN(monto)) return alert("Datos incompletos.");
    await supabaseClient.from('solicitudes').insert([{ id_telegram: userId, tipo: 'deposito', detalles: hash, estado: 'pendiente', monto: monto }]);
    alert("⌛ Depósito registrado para revisión.");
    nav('section-home');
}

async function actualizarHistorialHome() {
    let { data: h } = await supabaseClient.from('solicitudes').select('*').eq('id_telegram', userId).neq('monto', 0).order('fecha', {ascending: false}).limit(8);
    const div = document.getElementById('lista-historial'); div.innerHTML = "";
    h?.forEach(s => {
        let color = s.tipo === 'retiro' ? '#f85149' : (s.tipo === 'deposito' ? '#3fb950' : '#00ffcc');
        div.innerHTML += `<div class="status-item"><span>${s.tipo.toUpperCase()}</span><strong style="color:${color}">${s.tipo==='retiro'?'-':'+'}$${s.monto.toFixed(2)}</strong></div>`;
    });
}

async function cargarAdmin() {
    const dList = document.getElementById('admin-dep-list');
    const rList = document.getElementById('admin-ret-list');
    const hDep = document.getElementById('admin-hist-dep');
    const hRet = document.getElementById('admin-hist-ret');
    dList.innerHTML = ""; rList.innerHTML = ""; hDep.innerHTML = ""; hRet.innerHTML = "";

    let { data: sol } = await supabaseClient.from('solicitudes').select('*').neq('monto', 0).order('fecha', {ascending: false});
    sol?.forEach(s => {
        const item = `<div class="admin-card-mini"><small>${s.id_telegram}</small><br>$${s.monto} <button onclick="gestionarAdmin('${s.id}','${s.id_telegram}','${s.tipo}',${s.monto})">OK</button></div>`;
        const hist = `<div class="admin-card-mini" style="opacity:0.6"><small>${s.id_telegram}</small><br><b>$${s.monto}</b></div>`;
        if(s.estado === 'pendiente') {
            if(s.tipo === 'deposito') dList.innerHTML += item; else rList.innerHTML += item;
        } else {
            if(s.tipo === 'deposito') hDep.innerHTML += hist; else hRet.innerHTML += hist;
        }
    });
}

async function gestionarAdmin(id, userT, tipo, montoOri) {
    if (tipo === 'deposito') {
        let real = parseFloat(prompt("Confirmar monto:", montoOri));
        if (isNaN(real)) return;
        let { data: u } = await supabaseClient.from('usuarios').select('saldo_deposito').eq('id_telegram', userT).single();
        await supabaseClient.from('usuarios').update({ saldo_deposito: (u.saldo_deposito || 0) + real }).eq('id_telegram', userT);
        await supabaseClient.from('solicitudes').update({ monto: real, estado: 'completado', fecha: new Date().toISOString() }).eq('id', id);
    } else {
        let hash = prompt("Hash de pago:");
        if (!hash) return;
        let { data: u } = await supabaseClient.from('usuarios').select('*').eq('id_telegram', userT).single();
        await supabaseClient.from('usuarios').update({ saldo_retirable: u.saldo_retirable - montoOri }).eq('id_telegram', userT);
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
            await supabaseClient.from('solicitudes').insert([{ id_telegram: p.id_telegram, tipo: 'ganancia', monto: p.ganancia_diaria, estado: 'completado' }]);
        }
    }
}

function copyText(txt) { navigator.clipboard.writeText(txt); alert("✅ Copiado"); }
document.addEventListener('DOMContentLoaded', iniciarApp);
