from flask import Flask, jsonify, request
from flask_cors import CORS
import pandas as pd
import numpy as np
import math

CERO_ABSOLUTO_C = -273.15

def c_a_k(grados_celsius):
    return grados_celsius - CERO_ABSOLUTO_C

# MEJORA 1: Parámetros T-Dependientes
def alpha_seebeck(T_media_C, material="bismuto-telurio"):
    """Coef. Seebeck varía con temperatura"""
    T_media_K = c_a_k(T_media_C)
    if material == "bismuto-telurio":
        alpha_base = 0.045
        beta = 0.00008
        return alpha_base + beta * (T_media_K - 300)
    return 0.05

def resistencia_interna(T_media_C, area_cm2=1.0, espesor_mm=4.0, material="bismuto-telurio"):
    """Resistencia interna varía con temperatura"""
    T_media_K = c_a_k(T_media_C)
    if material == "bismuto-telurio":
        rho_300K = 1.2e-5
        temp_coef = 0.003
        rho_T = rho_300K * (1 + temp_coef * (T_media_K - 300))
        # R = (resistividad * longitud) / area
        R = (rho_T * espesor_mm / 10) / area_cm2
        return R
    return 2.5

def conductancia_termica(T_media_C, area_cm2=1.0, espesor_mm=4.0, material="bismuto-telurio"):
    """Conductancia térmica varía con temperatura"""
    T_media_K = c_a_k(T_media_C)
    if material == "bismuto-telurio":
        kappa_300K = 1.5
        temp_coef_k = -0.001
        kappa_T = kappa_300K * (1 + temp_coef_k * (T_media_K - 300))
        # K = (conductividad * area) / espesor
        K = kappa_T * (area_cm2 / 1e4) / (espesor_mm / 1000)
        return K
    return 0.6

# MEJORA 2: Pérdidas Térmicas Realistas
def perdidas_termicas_radiacion(T_h_C, T_ambiente_C, area_m2=0.01, emitancia=0.8):
    """Radiación: σ·ε·A·(T_h⁴ - T_amb⁴)"""
    T_h_K = c_a_k(T_h_C)
    T_amb_K = c_a_k(T_ambiente_C)
    sigma = 5.67e-8
    Q_rad = sigma * emitancia * area_m2 * (T_h_K**4 - T_amb_K**4)
    return max(0, Q_rad)

def perdidas_termicas_conduccion(T_h_C, T_ambiente_C, resistencia_termica=0.5):
    """Conducción: ΔT / R_th"""
    delta_T = T_h_C - T_ambiente_C
    if resistencia_termica > 0:
        Q_cond = delta_T / resistencia_termica
    else:
        Q_cond = 0
    return max(0, Q_cond)

def perdidas_termicas_total(T_h_C, T_ambiente_C, area_m2=0.01, R_th=0.5, emitancia=0.8):
    """Pérdidas totales: radiación + conducción"""
    Q_rad = perdidas_termicas_radiacion(T_h_C, T_ambiente_C, area_m2, emitancia)
    Q_cond = perdidas_termicas_conduccion(T_h_C, T_ambiente_C, R_th)
    Q_total = Q_rad + Q_cond
    return Q_total, Q_rad, Q_cond

# MEJORA 3: Ciclos Día/Noche
def T_h_diario(hora, tipo_fuente="fuego", T_h_pico=150, T_ambiente=10):
    """Modela variación de T_h durante 24 horas"""
    hora = float(hora)
    
    if tipo_fuente == "fuego":
        if hora < 6 or hora >= 22:
            return T_ambiente
        # Subida (6:00 a 11:00)
        elif 6 <= hora < 11:
            progress = (hora - 6) / 5
            return T_ambiente + (T_h_pico - T_ambiente) * progress
        # Pico (11:00 a 15:00) - Usamos una función seno simple centrada en 13:00
        elif 11 <= hora < 15:
            # Rango de hora: [11, 14.99...]
            # Centro: 13.0. Duración: 4 horas.
            # Convertir a fase [0, pi]
            fase = np.pi * (hora - 11) / 4 
            # Usar sin^2 para que el inicio y fin sean 0
            return T_h_pico + 30 * np.sin(fase) * np.sin(fase) 
        # Bajada (15:00 a 22:00)
        else:
            progress = (hora - 15) / 7
            return T_h_pico - (T_h_pico - T_ambiente) * progress
    
    elif tipo_fuente == "residuos":
        picos = [8, 13, 18]
        T_current = T_ambiente
        for pico_hora in picos:
            if abs(hora - pico_hora) < 2:
                T_current = max(T_current, T_h_pico * (1 - abs(hora - pico_hora) / 2))
        return T_current
    
    elif tipo_fuente == "industrial":
        return T_h_pico * (0.95 + 0.1 * np.sin(np.pi * hora / 12))
    
    return T_h_pico

class TEGModule:
    def __init__(self, area_cm2=1.0, espesor_mm=4.0, material="bismuto-telurio", 
                 aislamiento_R_th=0.5, emitancia=0.8, area_m2=0.0001): # area_m2 por defecto corregida
        self.area_cm2 = area_cm2
        self.espesor_mm = espesor_mm
        self.material = material
        self.aislamiento_R_th = aislamiento_R_th
        self.emitancia = emitancia
        self.area_m2 = area_m2 # Área de radiación/convección

    def _validar_temps(self, Th_C, Tc_C):
        if pd.isna(Th_C) or pd.isna(Tc_C):
            return None, None, None
        if Th_C <= Tc_C:
            return 0.0, 0.0, 0.0
        Th_K = c_a_k(Th_C)
        Tc_K = c_a_k(Tc_C)
        delta_T = Th_K - Tc_K
        return Th_K, Tc_K, delta_T

    def calcular_potencia_carga(self, Th_C, Tc_C, R_L):
        """Calcula potencia con parámetros T-dependientes"""
        _, _, delta_T = self._validar_temps(Th_C, Tc_C)
        if delta_T is None or delta_T <= 0:
            return 0.0
        
        T_media_C = (Th_C + Tc_C) / 2
        alpha = alpha_seebeck(T_media_C, self.material)
        R = resistencia_interna(T_media_C, self.area_cm2, self.espesor_mm, self.material)
        
        V_oc = alpha * delta_T
        if (R + R_L) <= 0:
            return 0.0
        I = V_oc / (R + R_L)
        P_load = (I ** 2) * R_L
        return max(0.0, P_load)

    def calcular_teoria_completa(self, Th_C, Tc_C, R_L, charge_hours):
        """Calcula todos valores con análisis de pérdidas"""
        Th_K, Tc_K, delta_T = self._validar_temps(Th_C, Tc_C)
        
        if delta_T is None or delta_T <= 0:
            return {
                "deltaT": 0, "V_oc": 0, "I": 0, "P_load": 0, "P_max": 0, 
                "Q_h": 0, "efficiency_carnot": 0, "efficiency_teg": 0, "V_load": 0, "E_load": 0, "E_max": 0,
                "perdidas_total": 0, "alpha": 0, "R_interno": 0, "K_termica": 0,
                "transferData": [{"x": round(i, 2), "y": 0} for i in np.linspace(0.1, 20, 50)],
                "perdidas_radiacion": 0, "perdidas_conduccion": 0
            }
        
        T_media_C = (Th_C + Tc_C) / 2
        alpha = alpha_seebeck(T_media_C, self.material)
        # R y K dependen de los parámetros del módulo (area_cm2, espesor_mm)
        R = resistencia_interna(T_media_C, self.area_cm2, self.espesor_mm, self.material)
        K = conductancia_termica(T_media_C, self.area_cm2, self.espesor_mm, self.material)
        
        V_oc = alpha * delta_T
        P_max = (V_oc ** 2) / (4 * R) if R > 0 else 0
        I = V_oc / (R + R_L) if (R + R_L) > 0 else 0
        P_load = (I ** 2) * R_L
        
        # Ecuación de flujo de calor: Q_h = K * dT + a*I*Th - 0.5 * I^2 * R
        Q_h = (K * delta_T) + (alpha * I * Th_K) - (0.5 * (I ** 2) * R)
        
        # EFICIENCIA REAL TEG
        efficiency_carnot = (1 - Tc_K / Th_K) * 100 if Th_K > 0 else 0
        # Suponemos un factor de mérito (ZT) para una eficiencia realista del 6% del límite de Carnot
        efficiency_teg = efficiency_carnot * 0.06 
        
        V_load = I * R_L
        E_load = P_load * charge_hours # Wh
        E_max = P_max * charge_hours
        
        # Pérdidas: dependen de los parámetros de aislamiento (area_m2, R_th, emitancia)
        Q_total, Q_rad, Q_cond = perdidas_termicas_total(
            Th_C, Tc_C, self.area_m2, self.aislamiento_R_th, self.emitancia
        )

        # Transferencia (Curva P vs RL)
        transfer_data = []
        r_load_max = max(20.0, R_L * 2)
        for r_step in np.linspace(0.1, r_load_max, 50):
            p_step = self.calcular_potencia_carga(Th_C, Tc_C, r_step)
            # Convertir a mW para el gráfico del frontend
            transfer_data.append({"x": round(r_step, 2), "y": p_step * 1000}) 

        return {
            "deltaT": float(delta_T), 
            "V_oc": float(V_oc), 
            "I": float(I), 
            "P_load": float(P_load),
            "P_max": float(P_max), 
            "Q_h": float(Q_h), 
            "efficiency_carnot": float(efficiency_carnot),
            "efficiency_teg": float(efficiency_teg),
            "V_load": float(V_load),
            "E_load": float(E_load), 
            "E_max": float(E_max), 
            "perdidas_total": float(Q_total),
            "alpha": float(alpha), 
            "R_interno": float(R), 
            "K_termica": float(K),
            "perdidas_radiacion": float(Q_rad), 
            "perdidas_conduccion": float(Q_cond),
            "transferData": transfer_data
        }

app = Flask(__name__)
CORS(app)

df_puno = None

# PARÁMETROS FIJOS DEL SP1848
SP1848_PARAMS = {
    "area_cm2": 16.0,
    "espesor_mm": 3.8,
    "material": "bismuto-telurio",
    "aislamiento_R_th": 0.5,
    "emitancia": 0.8,
    "area_m2": 0.0016 # 16 cm² -> 0.0016 m²
}

# Módulo SP1848 para Análisis Puno (usa los parámetros fijos del datasheet)
mi_modulo_sp1848 = TEGModule(**SP1848_PARAMS)

print("=" * 60)
print("Cargando datos de Puno...")
print("=" * 60)
try:
    # Se asume que 'datos_temperatura_puno_ultimos_2_anios.csv' existe en el directorio
    df_puno = pd.read_csv("datos_temperatura_puno_ultimos_2_anios.csv")
    df_puno['time'] = pd.to_datetime(df_puno['time'])
    df_puno['mes_num'] = df_puno['time'].dt.month
    df_puno['mes_nombre'] = df_puno['time'].dt.month_name()
    df_puno = df_puno.dropna(subset=['tavg', 'tmin'])
    
    print(f"✅ Datos cargados exitosamente!")
    print(f"   Total de filas: {len(df_puno)}")
    print(f"   Fecha inicial: {df_puno['time'].min()}")
    print(f"   Fecha final: {df_puno['time'].max()}")
    print(f"   Columnas: {df_puno.columns.tolist()}")
except Exception as e:
    print(f"❌ Error cargando datos: {e}")

print("=" * 60)

@app.route('/api/simular-teoria', methods=['GET'])
def simular_teoria():
    try:
        # Parámetros de Operación
        Th = request.args.get('Th', default=150, type=float)
        Tc = request.args.get('Tc', default=10, type=float)
        RL = request.args.get('RL', default=2.5, type=float)
        chargeHours = request.args.get('chargeHours', default=5.0, type=float)
        
        # Parámetros del Módulo (Añadidos para ser dinámicos)
        area_cm2 = request.args.get('area', default=1.0, type=float)
        espesor_mm = request.args.get('espesor', default=4.0, type=float)
        R_th = request.args.get('R_th', default=0.5, type=float)
        emitancia = request.args.get('emitancia', default=0.8, type=float)
        
        # CALCULAR area_m2 (Convertir cm² a m²)
        area_m2 = area_cm2 / 10000.0
        
        # CREAR INSTANCIA DINÁMICA DEL MÓDULO
        modulo_dinamico = TEGModule(
            area_cm2=area_cm2, 
            espesor_mm=espesor_mm, 
            aislamiento_R_th=R_th, 
            emitancia=emitancia, 
            area_m2=area_m2 # Área de radiación/convección corregida
        )
        
        resultados = modulo_dinamico.calcular_teoria_completa(Th, Tc, RL, chargeHours)
        return jsonify(resultados)
    except Exception as e:
        print(f"Error en simular-teoria: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/ciclo-diario', methods=['GET'])
def ciclo_diario():
    try:
        tipo_fuente = request.args.get('tipo_fuente', 'fuego')
        T_h_pico = request.args.get('T_h_pico', default=150, type=float)
        T_ambiente = request.args.get('T_ambiente', default=10, type=float)
        
        horas = list(range(24))
        T_h_valores = [T_h_diario(h, tipo_fuente, T_h_pico, T_ambiente) for h in horas]
        
        return jsonify({
            "horas": horas,
            "T_h_valores": [float(t) for t in T_h_valores],
            "tipo_fuente": tipo_fuente
        })
    except Exception as e:
        print(f"Error en ciclo-diario: {e}")
        return jsonify({"error": str(e)}), 500

def calcular_energia_diaria_sp1848(scenario_th_str, tipo_fuente, data_type, R_L, charge_hours):
    """Calcula energía diaria usando SP1848 específico"""
    if df_puno is None:
        raise Exception("Datos no cargados")
    
    scenarios = {"pesimista": 80.0, "realista": 150.0, "optimista": 250.0}
    T_h_pico = scenarios.get(scenario_th_str, 150.0)
    tc_col = 'tmin' if data_type == 'tmin' else 'tavg'
    
    df_sim = df_puno.copy()
    
    def energia_diaria_con_ciclo(row):
        T_c = row[tc_col]
        if pd.isna(T_c) or T_c >= T_h_pico:
            return 0.0
        
        energia_total = 0.0
        
        # Calcular energía para TODAS las 24 horas del día
        for hora in range(24):
            # Usar T_c (T_ambiente) del día específico
            T_h = T_h_diario(hora, tipo_fuente, T_h_pico, T_c) 
            potencia = mi_modulo_sp1848.calcular_potencia_carga(T_h, T_c, R_L)
            
            # IMPORTANTE: acumular SOLO si la hora está dentro del rango de carga
            # NOTA: T_h_diario está diseñado para el caso "fuego" con horario 6:00 a 22:00
            
            if tipo_fuente == "fuego":
                hora_inicio_carga = 6  # Fuego empieza a las 6am
                hora_fin_carga = hora_inicio_carga + int(charge_hours)
                
                if hora_inicio_carga <= hora < hora_fin_carga:
                    energia_total += potencia
            else:
                # Si no es fuego, asumimos que solo se carga durante 'charge_hours' si hay potencia
                if potencia > 0 and hora < int(charge_hours):
                     energia_total += potencia

        return float(max(0, energia_total))
    
    df_sim['energy_wh'] = df_sim.apply(energia_diaria_con_ciclo, axis=1)
    return df_sim

@app.route('/api/analisis-real', methods=['GET'])
def analisis_real():
    try:
        scenario_th_str = request.args.get('scenarioTh', 'realista')
        tipo_fuente = request.args.get('tipoFuente', 'fuego')
        data_type = request.args.get('dataType', 'tavg')
        R_L = float(request.args.get('RL', 5.0))
        charge_hours = float(request.args.get('chargeHours', 5.0))
        battery_capacity = float(request.args.get('batteryCapacity', 10.0))
        daily_consumption = float(request.args.get('dailyConsumption', 2.0))
        
        scenarios = {"pesimista": 80.0, "realista": 150.0, "optimista": 250.0}
        T_h_pico_valor = scenarios.get(scenario_th_str, 150.0)
        
        print(f"\n📊 Análisis Real:")
        print(f"   Escenario: {scenario_th_str}, Fuente: {tipo_fuente}, Tipo dato: {data_type}")
        print(f"   R_L: {R_L}Ω, Horas carga: {charge_hours}h")
        
        # DEBUG: Probar T_h_diario
        print(f"\n   DEBUG - Ciclo Fuego (T_h_pico={T_h_pico_valor}°C, T_ambiente=10°C):")
        for h in [0, 6, 11, 13, 15, 22]:
            T_h_test = T_h_diario(h, tipo_fuente, T_h_pico_valor, 10)
            print(f"      Hora {h:02d}:00 → T_h = {T_h_test:.1f}°C")
        
        # Calcular energía para cada día (USANDO SP1848)
        df_sim = calcular_energia_diaria_sp1848(scenario_th_str, tipo_fuente, data_type, R_L, charge_hours)
        
        print(f"\n   Total días procesados: {len(df_sim)}")
        print(f"   Energía promedio: {df_sim['energy_wh'].mean():.4f} Wh/día")
        print(f"   Energía máxima: {df_sim['energy_wh'].max():.4f} Wh/día")
        print(f"   Energía mínima: {df_sim['energy_wh'].min():.4f} Wh/día")
        
        # Mostrar primeros 5 días
        print(f"   Primeros 5 días de energía:")
        for i in range(min(5, len(df_sim))):
            print(f"      {df_sim.iloc[i]['time']}: {df_sim.iloc[i]['energy_wh']:.4f} Wh")
        
        # ===== ANÁLISIS 1: Perfil Climático (TODOS los datos) =====
        temp_data = []
        for idx, row in df_puno.iterrows():
            temp_data.append({
                "date": row['time'].strftime('%Y-%m-%d'),
                "tavg": float(row['tavg']) if not pd.isna(row['tavg']) else 0,
                "tmin": float(row['tmin']) if not pd.isna(row['tmin']) else 0
            })
        
        # ===== ANÁLISIS 2: Línea de tiempo de Energía (TODOS los datos) =====
        energy_timeline = []
        for idx, row in df_sim.iterrows():
            energy_timeline.append({
                "date": row['time'].strftime('%Y-%m-%d'),
                "energy_wh": float(row['energy_wh'])
            })
        
        # ===== ANÁLISIS 3: Estacionalidad por mes (MODIFICADO para Candlestick/Box Plot) =====
        orden_meses = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December']
        
        # Calculamos Mínimo, Cuartil 1, Mediana, Cuartil 3 y Máximo
        seasonality_data_agg = df_sim.groupby('mes_nombre')['energy_wh'].agg([
            'min', 
            lambda x: x.quantile(0.25), 
            'median', 
            lambda x: x.quantile(0.75), 
            'max'
        ]).reindex(orden_meses).reset_index()
        
        seasonality_data_agg.columns = ['month', 'minEnergy', 'q1Energy', 'medianEnergy', 'q3Energy', 'maxEnergy']
        
        seasonality_data = seasonality_data_agg.to_dict('records')
        
        # ===== ANÁLISIS 4: Simulación de Batería =====
        battery_level = 0.0
        battery_history = []
        for index, row in df_sim.iterrows():
            energy_in = row['energy_wh']
            energy_out = daily_consumption
            battery_level += (energy_in - energy_out)
            battery_level = max(0.0, min(battery_capacity, battery_level))
            battery_history.append({
                "date": row['time'].strftime('%Y-%m-%d'), 
                "level": float(round(battery_level, 2))
            })

        return jsonify({
            "temperatureData": temp_data,
            "energyTimeline": energy_timeline,
            "seasonalityData": seasonality_data,
            "batteryHistory": battery_history
        })
    except Exception as e:
        print(f"❌ Error en analisis-real: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/analizar-dispositivo', methods=['GET'])
def analizar_dispositivo():
    try:
        scenario_th_str = request.args.get('scenarioTh', 'realista')
        tipo_fuente = request.args.get('tipoFuente', 'fuego')
        data_type = request.args.get('dataType', 'tavg')
        R_L = float(request.args.get('RL', 5.0))
        charge_hours = float(request.args.get('chargeHours', 5.0))
        device_name = request.args.get('deviceName', 'Dispositivo')
        device_energy = float(request.args.get('deviceEnergy', 1.0))

        df_sim = calcular_energia_diaria_sp1848(scenario_th_str, tipo_fuente, data_type, R_L, charge_hours)
        
        total_dias = len(df_sim)
        dias_viables = int(df_sim[df_sim['energy_wh'] >= device_energy].shape[0])
        pct = (dias_viables / total_dias) * 100.0 if total_dias > 0 else 0
        status = '✅ Altamente Viable' if pct > 75 else ('⚠️ Moderado' if pct > 40 else '❌ Poco Viable')
        
        return jsonify({
            "device": device_name,
            "energy_needed": float(device_energy),
            "viable_days": int(dias_viables),
            "total_days": int(total_dias),
            "percentage": float(round(pct, 1)),
            "status": status
        })
    except Exception as e:
        print(f"❌ Error en analizar-dispositivo: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)