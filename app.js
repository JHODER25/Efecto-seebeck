document.addEventListener('DOMContentLoaded', () => {
    console.log("✅ Script cargado correctamente");
    
    lucide.createIcons();

    const API_URL = 'http://127.0.0.1:5000';

    // ===================== PESTAÑAS =====================
    const btnTeorica = document.getElementById('btn-teorica');
    const btnReal = document.getElementById('btn-real');
    const tabTeorica = document.getElementById('tab-teorica');
    const tabReal = document.getElementById('tab-real');

    console.log("Botones y tabs encontrados:", { btnTeorica, btnReal, tabTeorica, tabReal });

    function switchTab(tab) {
        console.log("Cambiando a:", tab);
        if (tab === 'teorica') {
            tabTeorica.classList.remove('hidden');
            tabReal.classList.add('hidden');
            btnTeorica.className = "pb-4 px-6 font-bold border-b-2 border-yellow-400 text-yellow-400 whitespace-nowrap";
            btnReal.className = "pb-4 px-6 font-bold text-purple-300 whitespace-nowrap";
        } else {
            tabTeorica.classList.add('hidden');
            tabReal.classList.remove('hidden');
            btnReal.className = "pb-4 px-6 font-bold border-b-2 border-blue-400 text-blue-400 whitespace-nowrap";
            btnTeorica.className = "pb-4 px-6 font-bold text-purple-300 whitespace-nowrap";
            updateReal();
        }
    }

    btnTeorica.addEventListener('click', () => switchTab('teorica'));
    btnReal.addEventListener('click', () => switchTab('real'));

    // ===================== PESTAÑA 1: TEORÍA =====================
    // Modificado: Se elimina 'perdidas' (gráfico de barras) de la lista de gráficos
    let chartsTeoria = { paramsTemp: null, perdidasPie: null, cicloDiario: null, transferencia: null };

    const inputsTeoria = {
        modulo: document.getElementById('in-modulo'),
        area: document.getElementById('in-area'),
        espesor: document.getElementById('in-espesor'),
        R_th: document.getElementById('in-r-th'),
        emitancia: document.getElementById('in-emitancia'),
        Th: document.getElementById('in-th'),
        Tc: document.getElementById('in-tc'),
        RL: document.getElementById('in-rl'),
        horas: document.getElementById('in-horas')
    };

    const labelsTeoria = {
        area: document.getElementById('val-area'),
        espesor: document.getElementById('val-espesor'),
        R_th: document.getElementById('val-r-th'),
        emitancia: document.getElementById('val-emitancia'),
        Th: document.getElementById('val-th'),
        Tc: document.getElementById('val-tc'),
        RL: document.getElementById('val-rl'),
        horas: document.getElementById('val-horas')
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { grid: { color: '#555' }, ticks: { color: '#ccc' } },
            y: { grid: { color: '#555' }, ticks: { color: '#ccc' } }
        },
        plugins: { legend: { labels: { color: '#ccc' } } }
    };

    async function updateTeoria() {
        // Recopilar TODOS los parámetros, incluyendo los del MÓDULO
        const params = {
            // Módulo
            area: inputsTeoria.area.value,
            espesor: inputsTeoria.espesor.value,
            R_th: inputsTeoria.R_th.value,
            emitancia: inputsTeoria.emitancia.value,
            // Operación
            Th: inputsTeoria.Th.value,
            Tc: inputsTeoria.Tc.value,
            RL: inputsTeoria.RL.value,
            chargeHours: inputsTeoria.horas.value
        };

        // Actualizar etiquetas de valores
        labelsTeoria.area.textContent = `${parseFloat(params.area).toFixed(1)} cm²`;
        labelsTeoria.espesor.textContent = `${parseFloat(params.espesor).toFixed(1)} mm`;
        labelsTeoria.R_th.textContent = `${parseFloat(params.R_th).toFixed(2)} K/W`;
        labelsTeoria.emitancia.textContent = `${parseFloat(params.emitancia).toFixed(2)}`;
        labelsTeoria.Th.textContent = `${params.Th} °C`;
        labelsTeoria.Tc.textContent = `${params.Tc} °C`;
        labelsTeoria.RL.textContent = `${parseFloat(params.RL).toFixed(1)} Ω`;
        labelsTeoria.horas.textContent = `${params.chargeHours} h`;

        const query = new URLSearchParams(params).toString();
        console.log("Llamando API:", `${API_URL}/api/simular-teoria?${query}`);
        
        try {
            const response = await fetch(`${API_URL}/api/simular-teoria?${query}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            console.log("Datos recibidos:", data);

            // Actualizar resultados en tarjetas
            document.getElementById('res-energia').textContent = data.E_load.toFixed(2); 
            document.getElementById('res-deltaT').textContent = data.deltaT.toFixed(1);
            document.getElementById('res-v-oc').textContent = data.V_load.toFixed(3); 
            document.getElementById('res-corriente').textContent = (data.I * 1000).toFixed(2); 
            document.getElementById('res-potencia').textContent = (data.P_load * 1000).toFixed(2); 
            document.getElementById('res-eficiencia-carnot').textContent = data.efficiency_carnot.toFixed(1);
            document.getElementById('res-eficiencia-teg').textContent = data.efficiency_teg.toFixed(2);

            // --- CORRECCIÓN DE TEXTO LEGIBLE ---
            const alpha = data.alpha.toFixed(5);
            const R_interno = data.R_interno.toFixed(3);
            const deltaT = data.deltaT.toFixed(1);
            const P_load_mw = (data.P_load * 1000).toFixed(2);
            const RL_ohm = parseFloat(params.RL).toFixed(1);

            // 1. Interpretación de Parámetros vs Temp
            const interpretacionParamsTempHTML = `
                El Coeficiente Seebeck (α) actual es **${alpha} V/K** y la Resistencia Interna (R) es **${R_interno} Ω**.
                <br><br>
                La **ley de Seebeck** establece que un mayor **α** mejora el voltaje generado (V₀ᵧ = α × ΔT), pero una **mayor R** interna reduce la potencia de salida (Pₗₒₐ𝒹). Esta gráfica te ayuda a entender el punto de operación óptimo del material que estás utilizando.
            `;
            document.getElementById('interpretacion-params-temp').innerHTML = interpretacionParamsTempHTML;

            // 2. Interpretación de Pérdidas
            const perdidasRadiacion = data.perdidas_radiacion.toFixed(2);
            const perdidasConduccion = data.perdidas_conduccion.toFixed(2);
            const interpretacionPerdidasHTML = `
                Las pérdidas por Radiación son **${perdidasRadiacion} W** y por Conducción **${perdidasConduccion} W** (Pérdida Total: ${(data.perdidas_total).toFixed(2)} W).
                <br><br>
                Las **pérdidas por Radiación** dependen fuertemente de la emitancia y de la cuarta potencia de la temperatura (T⁴). Las **pérdidas por Conducción** dependen de la calidad del aislamiento (Rₜₕ) y de la diferencia de temperatura (ΔT). El objetivo es minimizar estas pérdidas para maximizar el calor disponible para el módulo TEG.
            `;
            document.getElementById('interpretacion-perdidas').innerHTML = interpretacionPerdidasHTML;

            // 3. Interpretación de Ciclo Diario
            const T_ambiente = params.Tc;
            const interpretacionCicloHTML = `
                El ciclo simula la variación de la temperatura caliente (Tₕ) de tu fuente durante 24 horas, usando una temperatura fría constante de **${T_ambiente}°C**.
                <br><br>
                Este ciclo es clave porque la energía total generada (Eₗₒₐ𝒹) es la integral de la potencia generada durante las horas activas. Un ciclo más largo o con picos más altos genera más energía diaria.
            `;
            document.getElementById('interpretacion-ciclo').innerHTML = interpretacionCicloHTML;

            // 4. Interpretación de Transferencia
            const interpretacionTransferenciaHTML = `
                La potencia actual generada es de **${P_load_mw} mW** con una resistencia de carga de **${RL_ohm} Ω**.
                <br><br>
                Esta curva demuestra el **Teorema de Máxima Transferencia de Potencia**. La potencia de salida (Pₗₒₐ𝒹) es máxima cuando la **Resistencia de Carga (Rₗ)** es igual a la **Resistencia Interna (R)** del módulo TEG. Si el punto actual está alejado del pico de la curva, la eficiencia de transferencia no es óptima.
            `;
            document.getElementById('interpretacion-transferencia').innerHTML = interpretacionTransferenciaHTML;
            // -----------------------------------------------------------------------


            updateParamsTempChart(); 
            updatePerdidasPieChart(data.perdidas_radiacion, data.perdidas_conduccion); 
            await updateCicloDiarioChart(params.Th, params.Tc);
            updateTransferenciaChart(data.transferData, { x: parseFloat(params.RL), y: data.P_load * 1000 });

        } catch (error) {
            console.error("Error en updateTeoria:", error);
            // Asegurarse de que el elemento 'teoria-resultados' exista en index.html si se usa.
            const resultadosDiv = document.getElementById('teoria-resultados');
            if (resultadosDiv) {
                resultadosDiv.innerHTML = `<p class="text-red-400 col-span-full">Error: ${error.message}</p>`;
            }
        }
    }

    function updateParamsTempChart() {
        const ctx = document.getElementById('chart-params-temp');
        if (!ctx) return;
        
        // Usar los valores actuales del módulo
        const area_cm2 = parseFloat(inputsTeoria.area.value);
        const espesor_mm = parseFloat(inputsTeoria.espesor.value);

        const temps = Array.from({length: 9}, (_, i) => 50 + i*25);
        
        const alphaVals = temps.map(T => {
            const alpha = 0.045 + 0.00008 * (T + 273.15 - 300);
            return parseFloat(alpha.toFixed(5));
        });
        
        const rVals = temps.map(T => {
            const rho_T = 1.2e-5 * (1 + 0.003 * (T + 273.15 - 300));
            // R = (resistividad * longitud) / area
            const R = (rho_T * espesor_mm / 10) / area_cm2; 
            return parseFloat(R.toFixed(3));
        });

        // Calculamos el rango para alpha
        const minAlpha = Math.min(...alphaVals);
        const maxAlpha = Math.max(...alphaVals);

        if (chartsTeoria.paramsTemp) {
            chartsTeoria.paramsTemp.data.labels = temps.map(t => `${t}°C`);
            chartsTeoria.paramsTemp.data.datasets[0].data = alphaVals;
            chartsTeoria.paramsTemp.data.datasets[1].data = rVals;
            
            // Aplicar ajuste de escala al actualizar
            chartsTeoria.paramsTemp.options.scales.y.min = minAlpha * 0.95; 
            chartsTeoria.paramsTemp.options.scales.y.max = maxAlpha * 1.05; 

            chartsTeoria.paramsTemp.update();
        } else {
            chartsTeoria.paramsTemp = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: temps.map(t => `${t}°C`),
                    datasets: [
                        { 
                            label: 'α (V/K)', 
                            data: alphaVals, 
                            borderColor: '#fbbf24', 
                            yAxisID: 'y', 
                            tension: 0.1,
                            pointRadius: 3
                        },
                        { 
                            label: 'R (Ω)', 
                            data: rVals, 
                            borderColor: '#818cf8', 
                            yAxisID: 'y1', 
                            tension: 0.1,
                            pointRadius: 3
                        }
                    ]
                },
                options: {
                    ...chartOptions,
                    scales: {
                        y: { 
                            position: 'left', 
                            title: { display: true, text: 'α (V/K)', color: '#ccc' },
                            // Ajuste de escala para ver la variación de alpha
                            min: minAlpha * 0.95, 
                            max: maxAlpha * 1.05
                        },
                        y1: { position: 'right', title: { display: true, text: 'R (Ω)', color: '#ccc' } }
                    }
                }
            });
        }
    }

    // Función para manejar solo el gráfico de pastel
    function updatePerdidasPieChart(rad, cond) {
        const ctx = document.getElementById('chart-perdidas-pie');
        
        if (!ctx) return;

        if (chartsTeoria.perdidasPie) {
            chartsTeoria.perdidasPie.data.datasets[0].data = [rad, cond];
            chartsTeoria.perdidasPie.update();
        } else {
            chartsTeoria.perdidasPie = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Radiación', 'Conducción'],
                    datasets: [{ data: [rad, cond], backgroundColor: ['#ff6b6b', '#fbbf24'] }]
                },
                options: { ...chartOptions, maintainAspectRatio: true }
            });
        }
    }

    async function updateCicloDiarioChart(Th, Tc) {
        try {
            const tipo_fuente = document.getElementById('in-fuente').value; 
            const response = await fetch(`${API_URL}/api/ciclo-diario?tipo_fuente=${tipo_fuente}&T_h_pico=${Th}&T_ambiente=${Tc}`);
            if (!response.ok) throw new Error('Error ciclo');
            const data = await response.json();

            const ctx = document.getElementById('chart-ciclo-diario');
            if (!ctx) return;

            if (chartsTeoria.cicloDiario) {
                chartsTeoria.cicloDiario.data.datasets[0].data = data.T_h_valores;
                chartsTeoria.cicloDiario.update();
            } else {
                chartsTeoria.cicloDiario = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: data.horas.map(h => `${h}:00`),
                        datasets: [{
                            label: 'T_h (°C)',
                            data: data.T_h_valores,
                            borderColor: '#f87171',
                            backgroundColor: '#f8717133',
                            fill: true,
                            tension: 0.4,
                            pointRadius: 2
                        }]
                    },
                    options: { 
                        ...chartOptions, 
                        scales: { 
                            ...chartOptions.scales, 
                            y: { ...chartOptions.scales.y, title: { display: true, text: 'Temperatura (°C)', color: '#ccc' } } 
                        } 
                    }
                });
            }
        } catch (error) {
            console.error("Error ciclo:", error);
        }
    }

    function updateTransferenciaChart(transferData, point) {
        const ctx = document.getElementById('chart-transferencia');
        if (!ctx) return;

        const points = transferData.map(d => ({ x: parseFloat(d.x), y: parseFloat(d.y) }));

        if (chartsTeoria.transferencia) {
            chartsTeoria.transferencia.data.datasets[0].data = points;
            chartsTeoria.transferencia.data.datasets[1].data = [point];
            chartsTeoria.transferencia.update();
        } else {
            chartsTeoria.transferencia = new Chart(ctx, {
                type: 'scatter',
                data: {
                    datasets: [
                        { 
                            label: 'Curva Potencia', 
                            data: points, 
                            borderColor: '#a78bfa', 
                            type: 'line', 
                            tension: 0.1, 
                            pointRadius: 0,
                            fill: false,
                            showLine: true
                        },
                        { 
                            label: 'Punto Actual', 
                            data: [point], 
                            backgroundColor: '#fbbf24', 
                            pointRadius: 6 
                        }
                    ]
                },
                options: {
                    ...chartOptions,
                    scales: {
                        x: { type: 'linear', title: { display: true, text: 'R_L (Ω)', color: '#ccc' } },
                        y: { title: { display: true, text: 'Potencia (mW)', color: '#ccc' } }
                    }
                }
            });
        }
    }

    Object.values(inputsTeoria).forEach(input => input.addEventListener('input', updateTeoria));
    
    // Controlador de cambio de módulo
    inputsTeoria.modulo.addEventListener('change', () => {
        const modulo = inputsTeoria.modulo.value;
        
        // Deshabilitar/habilitar todos primero
        inputsTeoria.area.disabled = (modulo !== 'personalizado');
        inputsTeoria.espesor.disabled = (modulo !== 'personalizado');
        
        if (modulo === 'sp1848') {
            inputsTeoria.area.value = 16.0;
            inputsTeoria.espesor.value = 3.8;
            inputsTeoria.R_th.value = 0.5;
            inputsTeoria.emitancia.value = 0.8;
        } else if (modulo === 'generico') {
            inputsTeoria.area.value = 1.0;
            inputsTeoria.espesor.value = 4.0;
            inputsTeoria.R_th.value = 0.5;
            inputsTeoria.emitancia.value = 0.8;
        } 
        
        // Forzar actualización de etiquetas y simulación
        Object.values(inputsTeoria).forEach(input => input.dispatchEvent(new Event('input')));
        updateTeoria();
    });

    // Cargar simulación inicial
    updateTeoria();

    // ===================== PESTAÑA 2: ANÁLISIS REAL =====================
    let chartsReal = { temp: null, energy: null, seasonality: null, battery: null };

    const inputsReal = {
        scenario: document.getElementById('in-scenario'),
        fuente: document.getElementById('in-fuente'),
        datatype: document.getElementById('in-datatype'),
        RL: document.getElementById('in-rl-real'),
        horas: document.getElementById('in-horas-real'),
        batt: document.getElementById('in-batt'),
        cons: document.getElementById('in-cons')
    };

    const labelsReal = {
        RL: document.getElementById('val-rl-real'),
        horas: document.getElementById('val-horas-real'),
        batt: document.getElementById('val-batt'),
        cons: document.getElementById('val-cons')
    };

    async function updateReal() {
        console.log("Actualizando análisis real...");
        
        labelsReal.RL.textContent = `${parseFloat(inputsReal.RL.value).toFixed(1)} Ω`;
        labelsReal.horas.textContent = `${inputsReal.horas.value} h`;
        labelsReal.batt.textContent = `${inputsReal.batt.value} Wh`;
        labelsReal.cons.textContent = `${inputsReal.cons.value} Wh`;

        const params = {
            scenarioTh: inputsReal.scenario.value,
            tipoFuente: inputsReal.fuente.value,
            dataType: inputsReal.datatype.value,
            RL: inputsReal.RL.value,
            chargeHours: inputsReal.horas.value,
            batteryCapacity: inputsReal.batt.value,
            dailyConsumption: inputsReal.cons.value
        };

        const query = new URLSearchParams(params).toString();
        console.log("Llamando:", `${API_URL}/api/analisis-real?${query}`);
        
        try {
            const response = await fetch(`${API_URL}/api/analisis-real?${query}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            console.log("Datos recibidos - Temp:", data.temperatureData.length, "Energía:", data.energyTimeline.length, "Batería:", data.batteryHistory.length);

            // Mostrar todos los datos sin muestreo
            updateRealChartWithAllData('chart-temp', data.temperatureData, [
                { label: 'T Promedio', color: '#38bdf8', key: 'tavg' },
                { label: 'T Mínima', color: '#818cf8', key: 'tmin' }
            ]);

            updateRealChartWithAllData('chart-energy', data.energyTimeline, [
                { label: 'Energía (Wh)', color: '#fbbf24', key: 'energy_wh' }
            ]);

            // MODIFICADO: Llamar a la nueva función de estacionalidad
            updateSeasonalityChart(data.seasonalityData);
            
            updateRealChartWithAllData('chart-battery', data.batteryHistory, [
                { label: 'Nivel (Wh)', color: '#34d399', key: 'level' }
            ]);

        } catch (error) {
            console.error("Error updateReal:", error);
        }
    }

    function updateRealChartWithAllData(canvasId, data, datasets) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        console.log(`Actualizando ${canvasId} con ${data.length} puntos`);

        const chartKey = canvasId.replace('chart-', '');
        const chartObj = chartsReal[chartKey];

        const chartData = {
            labels: data.map(d => d.date),
            datasets: datasets.map(ds => ({
                label: ds.label,
                data: data.map(d => d[ds.key]),
                borderColor: ds.color,
                backgroundColor: ds.color + '33',
                tension: 0.1,
                fill: true,
                pointRadius: 0,
                borderWidth: 2
            }))
        };

        if (chartObj) {
            chartObj.data = chartData;
            chartObj.update();
        } else {
            chartsReal[chartKey] = new Chart(ctx, {
                type: 'line',
                data: chartData,
                options: {
                    ...chartOptions,
                    scales: {
                        x: { 
                            type: 'time', 
                            time: { unit: 'day', displayFormats: { day: 'MMM d' } },
                            ...chartOptions.scales.x 
                        },
                        y: { ...chartOptions.scales.y }
                    }
                }
            });
        }
    }

    // Función modificada para simular el gráfico de velas/box plot
    function updateSeasonalityChart(data) {
        const ctx = document.getElementById('chart-seasonality');
        if (!ctx) return;

        // Extraer todos los valores de energía mínima para calcular la escala inferior
        const allMinValues = data.map(d => d.minEnergy);
        const globalMin = Math.min(...allMinValues);
        
        // --- CÁLCULO DE LA ESCALA INFERIOR (Punto 1) ---
        // El eje Y debe empezar en un valor ligeramente inferior al mínimo global para dar espacio.
        const yAxisMin = Math.floor(globalMin * 0.95); 

        const chartData = {
            labels: data.map(d => d.month),
            datasets: [
                // Dataset 1: Mecha/Wick (Min to Max) - Usamos una barra flotante para el rango total
                {
                    label: 'Rango Total (Min/Max)',
                    data: data.map(d => [d.minEnergy, d.maxEnergy]),
                    backgroundColor: 'rgba(255, 255, 255, 0.2)', 
                    borderColor: '#a78bfa',
                    borderWidth: 1,
                    type: 'bar',
                    barPercentage: 0.2, // Ajuste para hacerlo más grueso
                    categoryPercentage: 0.8, // Ajuste para dejar espacio entre meses
                    tooltip: {
                        callbacks: {
                            label: (context) => `Rango: ${context.raw[0].toFixed(2)} Wh - ${context.raw[1].toFixed(2)} Wh`
                        }
                    }
                },
                // Dataset 2: Caja/Body (Q1 to Q3) - Representa el 50% central de los días
                {
                    label: 'Rango Intercuartil (Q1/Q3)',
                    data: data.map(d => [d.q1Energy, d.q3Energy]),
                    backgroundColor: '#8b5cf6', 
                    borderColor: '#8b5cf6',
                    borderWidth: 1,
                    type: 'bar',
                    barPercentage: 0.6, // Ajuste para la caja (más ancha)
                    categoryPercentage: 0.8, // Ajuste para dejar espacio entre meses
                    tooltip: {
                        callbacks: {
                            label: (context) => `Caja (50%): ${context.raw[0].toFixed(2)} Wh - ${context.raw[1].toFixed(2)} Wh`
                        }
                    }
                },
                // Dataset 3: Mediana - Punto central (Línea o punto)
                {
                    label: 'Mediana',
                    data: data.map(d => d.medianEnergy),
                    backgroundColor: '#fbbf24', 
                    borderColor: '#fbbf24',
                    type: 'scatter',
                    pointRadius: 5,
                    pointStyle: 'crossRot', 
                    tooltip: {
                        callbacks: {
                            label: (context) => `Mediana: ${context.raw.y.toFixed(2)} Wh`
                        }
                    }
                }
            ]
        };

        const chartOptionsSeasonality = {
            ...chartOptions,
            plugins: {
                ...chartOptions.plugins,
                legend: {
                    labels: {
                        color: '#ccc',
                        filter: (item) => item.text !== 'Mediana' // Ocultar la etiqueta de la mediana
                    }
                }
            },
            scales: {
                x: {
                    ...chartOptions.scales.x,
                    stacked: true, // Asegura que las barras se superpongan
                    grid: { display: false } // Mejor estética para este tipo de gráfico
                },
                y: {
                    ...chartOptions.scales.y,
                    beginAtZero: false,
                    min: yAxisMin, // Aplicar la escala mínima ajustada
                    title: { display: true, text: 'Energía (Wh)', color: '#ccc' }
                }
            }
        };

        if (chartsReal.seasonality) {
            chartsReal.seasonality.data = chartData;
            chartsReal.seasonality.options = chartOptionsSeasonality;
            chartsReal.seasonality.update();
        } else {
            chartsReal.seasonality = new Chart(ctx, {
                type: 'bar', 
                data: chartData,
                options: chartOptionsSeasonality
            });
        }
    }


    function updateRealChart(canvasId, data, datasets) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        // ... (código original sin cambios) ...
    }
    
    // ... (rest of the app.js functions) ...

    Object.values(inputsReal).forEach(input => {
        input.addEventListener('change', updateReal);
        input.addEventListener('input', updateReal);
    });

    // Análisis de dispositivos
    const formDevice = document.getElementById('form-device');
    if (formDevice) {
        formDevice.addEventListener('submit', async (e) => {
            e.preventDefault();
            const params = {
                scenarioTh: inputsReal.scenario.value,
                tipoFuente: inputsReal.fuente.value,
                dataType: inputsReal.datatype.value,
                RL: inputsReal.RL.value,
                chargeHours: inputsReal.horas.value,
                deviceName: document.getElementById('in-device-name').value,
                deviceEnergy: document.getElementById('in-device-energy').value
            };

            try {
                const response = await fetch(`${API_URL}/api/analizar-dispositivo?${new URLSearchParams(params)}`);
                if (!response.ok) throw new Error('Error');
                const data = await response.json();

                const html = `
                    <div class="bg-slate-700/50 rounded p-4">
                        <div class="flex justify-between items-center mb-2">
                            <span class="font-semibold text-purple-200">${data.device} (${data.energy_needed} Wh/día)</span>
                            <span class="text-yellow-400 font-bold">${data.percentage}%</span>
                        </div>
                        <div class="w-full bg-slate-600 rounded-full h-3">
                            <div class="bg-gradient-to-r from-purple-500 to-yellow-400 h-3 rounded-full" style="width: ${data.percentage}%"></div>
                        </div>
                        <div class="flex justify-between text-xs text-purple-300 mt-1">
                            <span>${data.viable_days}/${data.total_days} días</span>
                            <span>${data.status}</span>
                        </div>
                    </div>
                `;
                document.getElementById('device-viability-container').insertAdjacentHTML('beforeend', html);
            } catch (error) {
                console.error("Error:", error);
            }
        });
    }

    console.log("✅ Script inicializado completamente");
});