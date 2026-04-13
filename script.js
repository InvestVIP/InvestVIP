const SUPABASE_URL = 'https://udoyasqceikatyxizodm.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_7UtlHB8x21aypLw2rCHoTQ_qBQ_TFkz'; 

let supabaseClient;
const tg = window.Telegram.WebApp;

const BOT_USERNAME = "InvestVipMiner_bot"; 
const APP_SHORTNAME = "app"; 

function iniciarApp() {
    if (!window.supabase) { setTimeout(iniciarApp, 100); return; }
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
    if (tg) { tg.ready(); tg.expand(); }
    cargarDatos();
    iniciarRelojPagos();
}

const userId = tg.initDataUnsafe?.user?.id ? String(tg.initDataUnsafe.user.id) : '8754466303';
const userName = tg.initDataUnsafe?.user?.first_name || 'Admin PC';

function nav(id) {
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'block';
    if (id === 'section-admin') cargarAdmin();
    else if (id === 'section-history') cargarHistorialUnificado();
    else cargarDatos();
}

function iniciarRelojPagos() {
    const timerElement = document.getElementById('payout-timer');
    if (!timerElement) return;

    setInterval(() => {
        const ahora = new Date();
        const proximoPago = new Date();
        proximoPago.setUTCHours(24, 0, 0, 0); 

        const diferencia = proximoPago - ahora;

        if (diferencia <= 0) {
            timerElement.innerText = "PROCESANDO...";
            return;
        }

        const horas = Math.floor((diferencia / (1000 * 60 * 60)) % 24);
        const minutos = Math.floor((diferencia / 1000 / 60) % 60);
        const segundos = Math.floor((diferencia / 1000) % 60);

        timerElement.innerText = 
            `${horas.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`;
    }, 1000);
}

async function cargarDatos() {
    try {
        if (userId === "8754466303") document.getElementById('btn-admin-tab').style.display = 'flex';
        
        let { data: u } = await supabaseClient.from('usuarios').select('*').eq('id_telegram', userId).maybeSingle();
        
        if (!u) {
            const urlParams = new URLSearchParams(window.location.search);
            let invitadorId = tg.initDataUnsafe?.start_param || urlParams.get('tgWebAppStartParam'); 

            const { data: n, error } = await supabaseClient.from('usuarios').insert([{ 
                id_telegram: userId, 
                saldo_deposito: 0, 
                saldo_retirable: 0,
                referido_por: invitadorId,
                es_inversionista: false    
            }]).select().single();
            
            if (error) throw error;
            u = n;
        }

        document.getElementById('username').innerText = userName;
        document.getElementById('home-saldo-deposito').innerText = (u.saldo_deposito || 0).toFixed(2);
        document.getElementById('home-saldo-retirable').innerText = (u.saldo_retirable || 0).toFixed(2);
        document.getElementById('withdraw-available').innerText = "$" + (u.saldo_retirable || 0).toFixed(2);
        
        const displayTotal = document.getElementById('total-retirado-display');
        if (displayTotal) {
            displayTotal.innerText = "$" + (u.total_retirado || 0).toFixed(2);
        }

        const refLink = `https://t.me/${BOT_USERNAME}/${APP_SHORTNAME}?startapp=${userId}`;
        const linkElem = document.getElementById('referral-link');
        if (linkElem) linkElem.innerText = refLink;

        actualizarMisPlanes();
    } catch (e) { console.error("Error en cargarDatos:", e); }
}

function copiarLinkReferido() {
    const link = document.getElementById('referral-link').innerText;
    if (!link || link.includes("Generando")) return;

    navigator.clipboard.writeText(link).then(() => {
        const btn = document.querySelector('.btn-copy-ref');
        if (btn) {
            const originalText = btn.innerText;
            btn.innerText = "¡COPIADO!";
            btn.style.background = "#238636";
            btn.style.color = "white";
            
            setTimeout(() => {
                btn.innerText = originalText;
                btn.style.background = ""; 
                btn.style.color = "";
            }, 2000);
        } else {
            alert("¡Link de invitado copiado!");
        }
    });
}

async function actualizarMisPlanes() {
    let { data: planes } = await supabaseClient.from('planes_activos').select('*').eq('id_telegram', userId).eq('activo', true);
    const pDiv = document.getElementById('lista-planes');
    let total = 0;
    pDiv.innerHTML = "";
    planes?.forEach(p => {
        total += p.ganancia_diaria;
        let tag = p.nombre_plan.toLowerCase();
        pDiv.innerHTML += `<div class="status-item border-${tag}"><strong>${p.nombre_plan.toUpperCase()}</strong> <span>$${p.ganancia_diaria.toFixed(2)}/día</span></div>`;
    });
    document.getElementById('home-estimado-diario').innerText = "$" + total.toFixed(2);
}

async function cargarHistorialUnificado() {
    const container = document.getElementById('historial-container');
    container.innerHTML = "<p style='text-align:center; color:white;'>Cargando historial...</p>";

    try {
        const [solRes, planRes] = await Promise.all([
            supabaseClient.from('solicitudes').select('*').eq('id_telegram', userId),
            supabaseClient.from('planes_activos').select('*').eq('id_telegram', userId)
        ]);

        const grupos = {
            ganancias: { titulo: 'Ganancias por Minería', icono: '⚡', items: [], total: 0 },
            depositos: { titulo: 'Mis depósitos', icono: '📥', items: [], total: 0 },
            retiros: { titulo: 'Mis retiros', icono: '📤', items: [], total: 0 },
            activaciones: { titulo: 'Activaciones de Planes', icono: '💎', items: [], total: 0 }
        };

        solRes.data?.forEach(s => {
            const item = {
                monto: s.monto,
                fecha: new Date(s.fecha || Date.now()).toISOString().split('T')[0],
                estado: s.estado,
                colorClass: s.tipo === 'retiro' ? 'amount-negative' : 'amount-positive'
            };

            if (s.tipo === 'deposito' || s.tipo === 'referido') {
                grupos.depositos.items.push(item);
                if (s.estado === 'completado') grupos.depositos.total += s.monto;
            } else if (s.tipo === 'retiro') {
                grupos.retiros.items.push(item);
                if (s.estado === 'completado') grupos.retiros.total += s.monto;
            }
        });

        const hoy = new Date();
        planRes.data?.forEach(p => {
            grupos.activaciones.items.push({
                monto: p.monto_invertido,
                fecha: new Date(p.fecha_inicio || Date.now()).toISOString().split('T')[0],
                estado: 'completado',
                colorClass: 'amount-negative'
            });
            grupos.activaciones.total += p.monto_invertido;

            const fechaInicio = new Date(p.fecha_inicio);
            const diasPasados = Math.floor((hoy - fechaInicio) / (1000 * 60 * 60 * 24));

            for (let i = 1; i <= diasPasados; i++) {
                const fechaPago = new Date(fechaInicio);
                fechaPago.setDate(fechaInicio.getDate() + i);
                
                grupos.ganancias.items.push({
                    monto: p.ganancia_diaria,
                    fecha: fechaPago.toISOString().split('T')[0],
                    estado: 'completado',
                    colorClass: 'amount-positive'
                });
                grupos.ganancias.total += p.ganancia_diaria;
            }
        });

        container.innerHTML = "";
        const renderizarTarjeta = (grupo) => {
            if (grupo.items.length === 0) return '';
            grupo.items.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

            let itemsHTML = '';
            grupo.items.forEach(item => {
                const iconoEstado = item.estado === 'completado' ? '✓' : '⏳';
                const claseEstado = item.estado === 'completado' ? 'status-completed' : 'status-pending';
                itemsHTML += `
                    <div class="history-item-row">
                        <span class="history-amount ${item.colorClass}">${item.monto.toFixed(2)}$</span>
                        <span class="history-date">${item.fecha}</span>
                        <span class="history-status ${claseEstado}">${iconoEstado} ${item.estado}</span>
                    </div>`;
            });

            return `
                <div class="history-group-card">
                    <div class="history-card-header">
                        <div class="history-card-title">${grupo.icono} ${grupo.titulo}</div>
                        <div class="history-card-total">Total: <strong>${grupo.total.toFixed(2)}$</strong></div>
                    </div>
                    <div class="history-items-list">${itemsHTML}</div>
                </div>`;
        };

        container.innerHTML += renderizarTarjeta(grupos.ganancias);
        container.innerHTML += renderizarTarjeta(grupos.depositos);
        container.innerHTML += renderizarTarjeta(grupos.retiros);
        container.innerHTML += renderizarTarjeta(grupos.activaciones);

        if (container.innerHTML === "") container.innerHTML = "<p style='text-align:center; color:white;'>Sin movimientos.</p>";
    } catch (e) {
        console.error(e);
        container.innerHTML = "<p style='text-align:center; color:#f85149;'>Error al cargar.</p>";
    }
}

// ==========================================
// INVERTIR (MODIFICADO PARA EL PLAN PLATINO)
// ==========================================
async function invertir(costo) {
    let { data: u } = await supabaseClient.from('usuarios').select('*').eq('id_telegram', userId).single();
    if (u?.saldo_deposito >= costo) {
        
        // Identificar Plan y Ganancia
        let n = costo===11?"Bronce":costo===30?"Plata":costo===60?"Oro":costo===400?"Platino":"VIP";
        let g = costo===11?0.65:costo===30?1.66:costo===60?3.00:costo===400?30.00:6.30;
        
        // Calcular nuevo saldo retirable (incluye Cashback de $30 si es Platino)
        let bonusCashback = (costo === 400) ? 30.00 : 0;
        
        await supabaseClient.from('usuarios').update({ 
            saldo_deposito: u.saldo_deposito - costo,
            saldo_retirable: (u.saldo_retirable || 0) + bonusCashback,
            es_inversionista: true 
        }).eq('id_telegram', userId);

        await supabaseClient.from('planes_activos').insert([{ 
            id_telegram: userId, 
            nombre_plan: n, 
            monto_invertido: costo, 
            ganancia_diaria: g, 
            activo: true, 
            fecha_inicio: new Date().toISOString() 
        }]);

        // Registrar el Cashback en el historial como una entrada positiva
        if (bonusCashback > 0) {
            await supabaseClient.from('solicitudes').insert([{ 
                id_telegram: userId, 
                tipo: 'referido', 
                monto: bonusCashback, 
                detalles: 'CASHBACK INSTANTÁNEO PLAN PLATINO', 
                estado: 'completado' 
            }]);
        }

        if (u.referido_por) {
            let { data: invitador } = await supabaseClient.from('usuarios').select('*').eq('id_telegram', u.referido_por).single();
            if (invitador && invitador.es_inversionista) {
                const comision = costo * 0.02;
                await supabaseClient.from('usuarios').update({ 
                    saldo_retirable: (invitador.saldo_retirable || 0) + comision 
                }).eq('id_telegram', u.referido_por);

                await supabaseClient.from('solicitudes').insert([{ 
                    id_telegram: u.referido_por, 
                    tipo: 'referido', 
                    monto: comision, 
                    detalles: `Comisión 2% por invitado ${userId}`, 
                    estado: 'completado' 
                }]);
            }
        }

        alert(bonusCashback > 0 ? `¡Plan Platino Activado! Has recibido $${bonusCashback} de Cashback.` : "¡Plan Activado!"); 
        cargarDatos(); nav('section-home');
    } else alert("Saldo insuficiente.");
}

async function procesarRetiro() {
    const monto = parseFloat(document.getElementById('withdraw-amount').value);
    const wallet = document.getElementById('withdraw-wallet').value;
    if (!wallet || isNaN(monto) || monto < 5) return alert("Monto mínimo $5.");

    let { data: ultimaSol } = await supabaseClient.from('solicitudes').select('fecha').eq('id_telegram', userId).eq('tipo', 'retiro').order('fecha', { ascending: false }).limit(1);
    
    if (ultimaSol?.length > 0) {
        const diffHoras = (new Date() - new Date(ultimaSol[0].fecha)) / (1000 * 60 * 60);
        if (diffHoras < 48) {
            return alert(`⚠️ Solo puedes retirar cada 48 horas. Faltan ${(48 - diffHoras).toFixed(1)}h.`);
        }
    }

    let { data: u } = await supabaseClient.from('usuarios').select('saldo_retirable').eq('id_telegram', userId).single();
    
    if (u?.saldo_retirable >= monto) {
        const { error: updateError } = await supabaseClient.from('usuarios').update({ 
            saldo_retirable: u.saldo_retirable - monto 
        }).eq('id_telegram', userId);

        if (updateError) return alert("Error al procesar el saldo.");

        await supabaseClient.from('solicitudes').insert([{ 
            id_telegram: userId, 
            tipo: 'retiro', 
            monto: monto, 
            detalles: wallet, 
            estado: 'pendiente' 
        }]);

        alert("Solicitud enviada y saldo descontado."); 
        cargarDatos(); 
        nav('section-home');
    } else {
        alert("Saldo insuficiente.");
    }
}

async function cargarAdmin() {
    const depDiv = document.getElementById('admin-dep-list');
    const retDiv = document.getElementById('admin-ret-list');
    const procDiv = document.getElementById('admin-historial-procesados');
    
    depDiv.innerHTML = '<small style="color: #3fb950; display: block; text-align: center; margin-bottom: 5px; font-weight: bold;">DEPÓSITOS</small>'; 
    retDiv.innerHTML = '<small style="color: #f85149; display: block; text-align: center; margin-bottom: 5px; font-weight: bold;">RETIROS</small>'; 
    procDiv.innerHTML = "";

    let { data: pendientes } = await supabaseClient.from('solicitudes').select('*').eq('estado', 'pendiente');
    
    pendientes?.forEach(s => {
        const esDep = s.tipo === 'deposito';
        const color = esDep ? '#3fb950' : '#f85149';
        const btnCopiar = (txt) => `<button onclick="navigator.clipboard.writeText('${txt}'); alert('Copiado');" style="background:#30363d; border:none; color:#c9d1d9; font-size:0.7em; padding:2px 5px; border-radius:3px; cursor:pointer; margin-left:5px;">Copiar</button>`;
        const item = `
            <div class="admin-card-mini" style="border-left: 4px solid ${color}; background: #161b22; padding: 10px; margin-bottom: 12px; border-radius: 4px;">
                <div style="font-size:0.75em; color:#8b949e; margin-bottom:5px;">
                    <strong>USER:</strong> ${s.id_telegram}<br>
                    <strong>DATO USUARIO:</strong> <span style="color:#e6edf3; word-break: break-all;">${s.detalles}</span> ${btnCopiar(s.detalles)}
                </div>
                <div style="margin: 8px 0;">
                    <span style="color:#8b949e; font-size:0.8em;">MONTO SOLICITADO:</span><br>
                    <strong style="font-size: 1.4em; color: ${color};">$${s.monto.toFixed(2)}</strong>
                </div>
                ${esDep ? `
                    <label style="font-size:0.7em; color:#8b949e;">Monto Real Recibido ($):</label>
                    <input type="number" id="input-monto-${s.id}" value="${s.monto}" 
                           style="width:94%; background:#0d1117; color:white; border:1px solid #30363d; padding:5px; margin-bottom:8px; border-radius:4px;">
                ` : `
                    <label style="font-size:0.7em; color:#8b949e;">Hash de Pago Enviado (Admin):</label>
                    <input type="text" id="input-hash-${s.id}" placeholder="Pega el hash de la TX" 
                           style="width:94%; background:#0d1117; color:white; border:1px solid #30363d; padding:5px; margin-bottom:8px; border-radius:4px;">
                `}
                <button style="background:${color}; width:100%; border:none; color:white; padding:8px; border-radius:4px; font-weight:bold; cursor:pointer;" 
                        onclick="gestionarSolicitud('${s.id}','${s.tipo}','${s.id_telegram}')">
                    APROBAR ${s.tipo.toUpperCase()}
                </button>
            </div>`;
        if(esDep) depDiv.innerHTML += item; else retDiv.innerHTML += item;
    });

    let { data: procesados } = await supabaseClient.from('solicitudes').select('*').neq('estado', 'pendiente').order('fecha', {ascending: false}).limit(30);
    procesados?.forEach(p => {
        const esDep = p.tipo === 'deposito';
        const color = esDep ? '#3fb950' : '#f85149';
        procDiv.innerHTML += `
            <div style="border-bottom:1px solid #30363d; padding:10px 0; font-size:0.85em;">
                <div style="display:flex; justify-content:space-between;">
                    <strong style="color:${color}">${esDep ? '📥 DEPÓSITO' : '📤 RETIRO'}</strong>
                    <span style="color:#8b949e;">${p.estado}</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-top:3px;">
                    <strong style="color:#e6edf3;">$${p.monto.toFixed(2)}</strong>
                    <small style="color:#484f58;">User: ${p.id_telegram.slice(-5)}</small>
                </div>
            </div>`;
    });
}

async function gestionarSolicitud(id, tipo, targetUid) {
    try {
        let updateData = { estado: 'completado' };
        let { data: user } = await supabaseClient.from('usuarios').select('*').eq('id_telegram', targetUid).single();
        let { data: solicitud } = await supabaseClient.from('solicitudes').select('*').eq('id', id).single();

        if (tipo === 'deposito') {
            const montoConfirmado = parseFloat(document.getElementById(`input-monto-${id}`).value);
            if (isNaN(montoConfirmado) || montoConfirmado <= 0) return alert("Monto inválido.");
            if (!confirm(`¿Confirmar depósito de $${montoConfirmado.toFixed(2)}?`)) return;
            
            await supabaseClient.from('usuarios').update({ 
                saldo_deposito: (user.saldo_deposito || 0) + montoConfirmado 
            }).eq('id_telegram', targetUid);
            updateData.monto = montoConfirmado; 
        } else {
            const hashAdmin = document.getElementById(`input-hash-${id}`).value;
            if (hashAdmin.length < 10) return alert("Debes ingresar el Hash de la transferencia realizada.");
            if (!confirm("¿Ya enviaste el dinero?")) return;
            
            updateData.detalles = "HASH PAGO: " + hashAdmin; 
            await supabaseClient.from('usuarios').update({ 
                total_retirado: (user.total_retirado || 0) + solicitud.monto 
            }).eq('id_telegram', targetUid);
        }

        const { error } = await supabaseClient.from('solicitudes').update(updateData).eq('id', id);
        if (error) throw error;
        
        alert("¡Transacción completada!");
        cargarAdmin();
    } catch (e) { alert("Error: " + e.message); }
}

async function verifyTx() {
    const hash = document.getElementById('tx-hash').value;
    const monto = parseFloat(document.getElementById('dep-amount').value) || 0;
    if (hash.length < 5 || monto <= 0) return alert("Hash o monto inválido.");
    await supabaseClient.from('solicitudes').insert([{ id_telegram: userId, tipo: 'deposito', detalles: hash, estado: 'pendiente', monto: monto }]);
    alert("Depósito informado."); nav('section-home');
}

function copyWallet() { navigator.clipboard.writeText("0xd6fe607116c1df2b4dae56e77ffdae50cde9d153"); alert("Billetera copiada"); }
document.addEventListener('DOMContentLoaded', iniciarApp);
